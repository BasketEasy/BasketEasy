"""FFBB e-Marque V2 PDF export -> ParsedScoresheetData (see
packages/@basketeasy/types/scoresheet-extraction.ts for the shape).

Reads the three parts of the sheet the app uses: each side's roster block
(jersey number, name, fouls), the running score (« marque courante »: one mark
per basket, the scorer's number beside it) and the results block (quarters and
final score). Licence numbers are on the sheet but deliberately not returned:
the product doesn't store them.

The output goes through the server's own post-processing and validation like
any other read, so this module reports what it read and refuses only what it
cannot read at all (NotThisForm): the server then falls back to the vision
model.
"""

from __future__ import annotations

import io
import json
import re
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Any

import pdfplumber

from .vectors import Atom, digits_in_box, image_fingerprint, page_atoms, text_lines

TEMPLATE_DIR = Path(__file__).parent / "templates" / "emarque_v2"

# "VT123456 DUPONT J. (CAP) 7 P P2": optional entry type, licence, name,
# jersey number, then the foul codes written in the five cells.
_ROSTER_LINE = re.compile(
    r"^(?:[A-Z0-9]{1,2} )?[A-Za-z]{2}\d{6,7} (?P<name>.+?) (?P<number>\d{1,2})"
    r"(?: (?P<fouls>(?:[PTDUFC]\d?c? ?)+))?$"
)
_CAPTAIN = re.compile(r"\s*\(CAP\)\s*$")
_PERIOD = re.compile(r"QT(\d) A\W*(\d+)\W+B\W*(\d+)")
_FINAL = re.compile(r"quipe A\W*(\d+)\W+Equipe B\W*(\d+)")

_SIDES = {"A": "home", "B": "away"}


class NotThisForm(Exception):
    """The PDF is not an e-Marque V2 export this template can read."""


@dataclass(frozen=True)
class Template:
    glyphs: dict[str, str]
    accents: dict[str, str]
    marks: dict[str, tuple[str, bool]]
    layout: dict[str, Any]


@lru_cache(maxsize=1)
def load_template() -> Template:
    def read(name: str) -> Any:
        return json.loads((TEMPLATE_DIR / name).read_text(encoding="utf-8"))

    return Template(
        glyphs=read("glyphs.json"),
        accents=read("accents.json"),
        marks={m["fingerprint"]: (m["kind"], m["red"]) for m in read("marks.json")},
        layout=read("layout.json"),
    )


@dataclass(frozen=True)
class Mark:
    """One mark in the running-score grid."""

    side: str  # 'home' | 'away'
    total: int  # the pre-printed cumulative total of the box
    kind: str  # slash | dot | end_slash | end_dot | circled_no


def running_score_cell(x: float, y: float, layout: dict[str, Any]) -> tuple[int, int, int] | None:
    """(block, column, row) of the grid cell a point falls in, or None outside it."""
    grid = layout["runningScore"]
    if not grid["left"] <= x <= grid["right"]:
        return None
    block = sum(x >= split for split in grid["blockSplit"])
    column = min(max(int((x - grid["blockLeft"][block]) // grid["columnWidth"]), 0), 3)
    row = int((y - grid["firstRowTop"]) // grid["rowHeight"])
    if not 0 <= row < grid["rowsPerBlock"]:
        return None
    return block, column, row


def grid_marks(page: Any, template: Template) -> list[Mark]:
    """Every known mark in the running-score grid. Unknown images refuse the PDF."""
    layout = template.layout
    marks: list[Mark] = []
    unknown = 0
    for image in page.images:
        cell = running_score_cell(
            (image["x0"] + image["x1"]) / 2, (image["top"] + image["bottom"]) / 2, layout
        )
        if cell is None:
            continue
        found = template.marks.get(image_fingerprint(image))
        if found is None:
            unknown += 1
            continue
        block, column, row = cell
        side = "home" if column < 2 else "away"
        kind = found[0]
        # Each side has two columns: the scorer's number (outer) and the box
        # being struck (inner). A circled number marks a 3-pointer and sits in
        # the number column; every other mark sits on the box.
        on_box = column == (1 if side == "home" else 2)
        if kind == "circled_no" or on_box:
            marks.append(Mark(side, block * layout["runningScore"]["rowsPerBlock"] + row + 1, kind))
    if unknown:
        raise NotThisForm(f"{unknown} running-score mark(s) not in the template")
    return marks


def plays_from_marks(marks: list[Mark], scorer_at: dict[tuple[str, int], int | None]) -> list[dict[str, Any]]:
    """One play per struck box, notation as drawn: dot 1, circled number 3, else 2."""
    circled = {(m.side, m.total) for m in marks if m.kind == "circled_no"}
    plays = []
    for m in sorted((m for m in marks if m.kind != "circled_no"), key=lambda m: (m.side != "home", m.total)):
        if m.kind in ("dot", "end_dot"):
            points = 1
        else:
            points = 3 if (m.side, m.total) in circled else 2
        plays.append(
            {
                "team": m.side,
                "jerseyNumber": scorer_at.get((m.side, m.total)),
                "points": points,
                "runningScore": m.total,
            }
        )
    return plays


def _scorers(atoms: list[Atom], marks: list[Mark], template: Template) -> dict[tuple[str, int], int | None]:
    grid = template.layout["runningScore"]
    out: dict[tuple[str, int], int | None] = {}
    for m in marks:
        if m.kind == "circled_no":
            continue
        block, row = divmod(m.total - 1, grid["rowsPerBlock"])
        left = grid["blockLeft"][block] + (0 if m.side == "home" else 3 * grid["columnWidth"])
        top = grid["firstRowTop"] + row * grid["rowHeight"]
        text = digits_in_box(
            atoms, template.glyphs, left, left + grid["columnWidth"], top, top + grid["rowHeight"]
        )
        out[(m.side, m.total)] = int(text) if text.isdigit() else None
    return out


def parse_roster_line(line: str) -> dict[str, Any] | None:
    match = _ROSTER_LINE.match(line.strip())
    if not match:
        return None
    fouls = (match.group("fouls") or "").split()
    return {
        "number": int(match.group("number")),
        "name": _CAPTAIN.sub("", match.group("name")),
        "fouls": len(fouls),
    }


def parse_results(lines: list[str]) -> tuple[list[dict[str, int]], dict[str, int] | None]:
    periods: dict[int, dict[str, int]] = {}
    final = None
    for line in lines:
        for m in _PERIOD.finditer(line):
            periods[int(m.group(1))] = {"home": int(m.group(2)), "away": int(m.group(3))}
        m = _FINAL.search(line)
        if m:
            final = {"home": int(m.group(1)), "away": int(m.group(2))}
    return [periods[k] for k in sorted(periods)], final


def read_pdf(data: bytes) -> dict[str, Any]:
    template = load_template()
    try:
        pdf = pdfplumber.open(io.BytesIO(data))
    except Exception as error:  # pdfminer raises a zoo of types on non-PDFs
        raise NotThisForm(f"not a readable PDF: {type(error).__name__}") from error
    with pdf:
        if not pdf.pages:
            raise NotThisForm("empty PDF")
        page = pdf.pages[0]
        atoms = page_atoms(page)
        layout = template.layout

        def zone_lines(zone: dict[str, float]) -> list[str]:
            return text_lines(atoms, template.glyphs, template.accents, **zone)

        players = []
        for side, zone in layout["rosterZones"].items():
            for line in zone_lines(zone):
                entry = parse_roster_line(line)
                if entry:
                    players.append({"team": side, "points": None, **entry})
        quarters, final = parse_results(zone_lines(layout["resultsZone"]))
        if final is None or not players:
            raise NotThisForm("no e-Marque results block or roster found")

        marks = grid_marks(page, template)
        plays = plays_from_marks(marks, _scorers(atoms, marks, template))

    return {
        "homeScore": final["home"],
        "awayScore": final["away"],
        "quarterScores": quarters,
        "players": [{k: p[k] for k in ("team", "number", "name", "points", "fouls")} for p in players],
        "scoringPlays": plays,
    }
