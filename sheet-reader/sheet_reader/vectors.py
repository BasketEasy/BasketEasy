"""Sport-agnostic reading of a PDF whose text is drawn as vector outlines.

e-Marque V2 exports carry no text layer: every character is a filled path and
every running-score mark an embedded image. Both are exact and repeat from one
export to the next, so instead of OCR this module fingerprints them:

- a glyph is its outer contour plus nested counters (the hole in an "o"),
  normalised to its own bounding box; a template's glyph dictionary maps each
  fingerprint to a character;
- an image is the SHA-1 of its stream plus its rendered width; a template's
  mark table maps each to a mark kind.

Nothing here knows about basketball or about a page's layout: the templates
(sheet_reader/templates/<form>/) and the per-form assembly own that.
"""

from __future__ import annotations

import hashlib
import unicodedata
from dataclasses import dataclass, field
from typing import Any

# Text height threshold separating glyphs from dots, accents and punctuation.
_SMALL = 3.0
_BLACK_OR_RED = ((0.0, 0.0, 0.0), (1.0, 0.0, 0.0))
_CAPITALS = "ETNHLFBDPRKMVAZXCSGQOUY0123456789"


@dataclass
class Atom:
    """One glyph-sized drawn shape."""

    key: str
    x0: float
    x1: float
    top: float
    bottom: float
    red: bool
    stem: bool = False
    hyphen: bool = False
    holes: list[dict[str, Any]] = field(default_factory=list)
    # Set while assembling lines.
    dot: bool = False
    accent: str | None = None
    is_accent: bool = False

    @property
    def height(self) -> float:
        return self.bottom - self.top

    @property
    def width(self) -> float:
        return self.x1 - self.x0

    @property
    def cx(self) -> float:
        return (self.x0 + self.x1) / 2

    @property
    def cy(self) -> float:
        return (self.top + self.bottom) / 2


def _shape_key(curve: dict[str, Any]) -> tuple:
    w = curve["x1"] - curve["x0"]
    h = curve["bottom"] - curve["top"]
    pts = tuple(
        (
            round((x - curve["x0"]) / max(w, 1e-6), 1),
            round((y - curve["top"]) / max(h, 1e-6), 1),
        )
        for x, y in curve["pts"]
    )
    return (round(w / max(h, 1e-6), 1), pts)


def _inside(a: dict[str, Any], b: dict[str, Any]) -> bool:
    return (
        a["x0"] >= b["x0"] - 0.05
        and a["x1"] <= b["x1"] + 0.05
        and a["top"] >= b["top"] - 0.05
        and a["bottom"] <= b["bottom"] + 0.05
        and (a["x1"] - a["x0"]) < (b["x1"] - b["x0"])
        and (a["bottom"] - a["top"]) < (b["bottom"] - b["top"])
    )


def _rect_atom(rect: dict[str, Any], *, stem: bool) -> Atom:
    return Atom(
        key=repr((("STEM",), ())) if stem else repr((("HYPHEN",), ())),
        x0=rect["x0"],
        x1=rect["x1"],
        top=rect["top"],
        bottom=rect["bottom"],
        red=rect.get("non_stroking_color") == (1.0, 0.0, 0.0),
        stem=stem,
        hyphen=not stem,
    )


def page_atoms(page: Any) -> list[Atom]:
    """Every glyph-sized shape on a pdfplumber page, fingerprinted."""
    curves = sorted(page.curves, key=lambda c: -((c["x1"] - c["x0"]) * (c["bottom"] - c["top"])))
    owned: set[int] = set()
    atoms: list[Atom] = []
    for i, outer in enumerate(curves):
        if i in owned:
            continue
        holes = []
        glyph_sized = (outer["x1"] - outer["x0"]) < 12 and (outer["bottom"] - outer["top"]) < 14
        for j in range(i + 1, len(curves) if glyph_sized else i + 1):
            if j not in owned and _inside(curves[j], outer):
                owned.add(j)
                holes.append(curves[j])
        atoms.append(
            Atom(
                key=repr((_shape_key(outer), tuple(sorted(_shape_key(h) for h in holes)))),
                x0=outer["x0"],
                x1=outer["x1"],
                top=outer["top"],
                bottom=outer["bottom"],
                red=outer.get("non_stroking_color") == (1.0, 0.0, 0.0),
                holes=holes,
            )
        )
    for rect in page.rects:
        if rect.get("non_stroking_color") not in _BLACK_OR_RED:
            continue
        w = rect["x1"] - rect["x0"]
        h = rect["bottom"] - rect["top"]
        # Thin vertical filled rects of text height are the stems of I, l, 1.
        if 0.3 < w < 2.2 and 3.0 < h < 9.0 and h / w > 2.0:
            atoms.append(_rect_atom(rect, stem=True))
        # Short thin horizontal rects are hyphens.
        elif 1.2 < w < 4.5 and 0.3 < h < 1.3 and w / h > 2.0:
            atoms.append(_rect_atom(rect, stem=False))
    return atoms


def image_fingerprint(image: dict[str, Any]) -> str:
    """SHA-1 prefix of the image stream plus its rendered width."""
    digest = hashlib.sha1(image["stream"].get_data()).hexdigest()[:16]
    return f"{digest}:{round(image['x1'] - image['x0'])}"


def digits_in_box(
    atoms: list[Atom], glyphs: dict[str, str], x0: float, x1: float, top: float, bottom: float
) -> str:
    """The characters drawn inside a box, left to right; '?' for an unknown glyph."""
    inside = sorted(
        (a for a in atoms if x0 <= a.cx <= x1 and top <= a.cy <= bottom and (a.stem or a.height > _SMALL)),
        key=lambda a: a.x0,
    )
    return "".join("1" if a.stem else glyphs.get(a.key, "?") for a in inside)


def text_lines(
    atoms: list[Atom],
    glyphs: dict[str, str],
    accents: dict[str, str],
    *,
    top: float,
    bottom: float,
    left: float,
    right: float,
) -> list[str]:
    """Text lines inside a zone, top to bottom, reassembled from glyph atoms."""
    zone = [a for a in atoms if left <= a.x0 and a.x1 <= right and top <= a.top and a.bottom <= bottom]
    # Atoms are shared between zones of one page: reset what assembly sets.
    for a in zone:
        a.dot = False
        a.accent = None
        a.is_accent = False
    big = [a for a in zone if a.height > _SMALL]
    small = [a for a in zone if a.height <= _SMALL]

    # The dot over an i or j: a small atom just above a narrow, hole-free one.
    dots: set[int] = set()
    for s in small:
        for b in big:
            if b.width < 2.6 and not b.holes and abs(s.cx - b.cx) < 1.3 and 0 < b.top - s.bottom < 3.0:
                b.dot = True
                dots.add(id(s))
    small = [s for s in small if id(s) not in dots]

    rows: list[dict[str, Any]] = []
    for a in sorted(big, key=lambda a: a.bottom):
        for row in rows:
            if abs(row["base"] - a.bottom) < 2.2 or (
                a.bottom > row["base"] - 7 and a.top < row["base"] and abs(row["base"] - a.bottom) < 3.5
            ):
                row["items"].append(a)
                break
        else:
            rows.append({"base": a.bottom, "items": [a]})
    for s in small:
        best = min(rows, key=lambda r: abs(r["base"] - s.bottom), default=None)
        if best is not None and abs(best["base"] - s.bottom) < 8:
            best["items"].append(s)

    lines = []
    for row in sorted(rows, key=lambda r: r["base"]):
        items = sorted(row["items"], key=lambda a: a.x0)
        heights = sorted(a.height for a in items if a.height > _SMALL)
        cap = heights[len(heights) // 2] if heights else 6.0
        # Accents: a small mark above cap height, attached to the glyph below it.
        for s in items:
            if s.height <= _SMALL and not s.stem and not s.hyphen and s.bottom < row["base"] - 0.9 * cap:
                for b in items:
                    if b.height > _SMALL and b.x0 - 0.8 <= s.cx <= b.x1 + 0.8:
                        b.accent = accents.get(s.key, "?")
                        s.is_accent = True
                        break
        line = ""
        previous: Atom | None = None
        tallest = max(a.height for a in items)
        stem_cap = _stem_cap_height(items, glyphs)
        for a in items:
            if a.is_accent:
                continue
            if previous is not None and a.x0 - previous.x1 > 0.36 * tallest:
                line += " "
            line += _character(a, row["base"], glyphs, stem_cap)
            previous = a
        lines.append(line)
    return lines


def _stem_cap_height(items: list[Atom], glyphs: dict[str, str]) -> float | None:
    caps = sorted(a.height for a in items if not a.stem and glyphs.get(a.key, "?") in _CAPITALS)
    return caps[len(caps) // 2] if caps else None


def _character(a: Atom, base: float, glyphs: dict[str, str], stem_cap: float | None) -> str:
    if a.stem:
        if a.dot:
            return "i"
        # A stem taller than the line's capitals is an ascender: l, not I.
        return "l" if stem_cap is None or a.height > stem_cap * 1.12 else "I"
    if a.height <= _SMALL:
        if (a.top + a.bottom) / 2 > base - 1.6:
            return "."
        return "-" if a.width > 1.2 * a.height else "·"
    ch = glyphs.get(a.key, "?")
    if a.dot and ch in ("1", "l", "I", "i"):
        ch = "i"
    if a.accent == "acute":
        return unicodedata.normalize("NFC", ch + "́")
    if a.accent is not None:
        return ch + "?"
    return ch
