"""Unit tests for the parts of the e-Marque reader that don't need a PDF, plus
the golden check against the real exports when they are available locally.

The source PDFs are never committed (names, licence numbers). Point
SCORESHEET_EVAL_INPUTS at the private folder holding emarque-01.pdf … to run
the golden check; without it that test is skipped.
"""

from __future__ import annotations

import json
import os
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from sheet_reader.app import MAX_BODY_BYTES, app
from sheet_reader.emarque_basketball import (
    Mark,
    load_template,
    parse_results,
    parse_roster_line,
    plays_from_marks,
    read_pdf,
    running_score_cell,
)

GOLDEN_DIR = Path(__file__).parents[2] / "server" / "test" / "scoresheet-eval" / "golden"
INPUTS = os.environ.get("SCORESHEET_EVAL_INPUTS")


def test_template_loads_with_every_mark_kind():
    template = load_template()
    kinds = {kind for kind, _red in template.marks.values()}
    assert kinds == {"slash", "dot", "end_slash", "end_dot", "circled_no"}
    assert len(template.glyphs) > 50


@pytest.mark.parametrize(
    ("x", "y", "cell"),
    [
        (369.5, 149.5, (0, 0, 0)),  # block 1, home scorer column, box 1
        (387.5, 149.5, (0, 1, 0)),  # block 1, home box column
        (530.0, 149.5 + 39 * 14, (2, 0, 39)),  # block 3, last row: box 120
        (300.0, 149.5, None),  # left of the grid (roster block)
        (369.5, 100.0, None),  # above the first row
    ],
)
def test_running_score_cell(x, y, cell):
    assert running_score_cell(x, y, load_template().layout) == cell


def test_plays_take_their_notation_from_the_marks():
    marks = [
        Mark("home", 2, "slash"),
        Mark("home", 5, "slash"),
        Mark("home", 5, "circled_no"),
        Mark("home", 6, "end_dot"),
        Mark("away", 1, "dot"),
    ]
    scorers = {("home", 2): 7, ("home", 5): 9, ("home", 6): 7, ("away", 1): None}
    assert plays_from_marks(marks, scorers) == [
        {"team": "home", "jerseyNumber": 7, "points": 2, "runningScore": 2},
        {"team": "home", "jerseyNumber": 9, "points": 3, "runningScore": 5},
        {"team": "home", "jerseyNumber": 7, "points": 1, "runningScore": 6},
        {"team": "away", "jerseyNumber": None, "points": 1, "runningScore": 1},
    ]


def test_roster_line_keeps_name_number_and_foul_count_never_the_licence():
    assert parse_roster_line("VT123456 DUPONT J. (CAP) 7 P P2 U2") == {
        "number": 7,
        "name": "DUPONT J.",
        "fouls": 3,
    }
    assert parse_roster_line("BC0123456 LE GALL-ROY A. 12") == {
        "number": 12,
        "name": "LE GALL-ROY A.",
        "fouls": 0,
    }
    assert parse_roster_line("Entraîneur : DUPONT") is None


def test_results_block():
    quarters, final = parse_results(
        ["QT1 A 19 - B 16 QT2 A 18 - B 17", "QT3 A 32 - B 9 QT4 A 15 - B 14", "Equipe A 84 Equipe B 56"]
    )
    assert quarters == [
        {"home": 19, "away": 16},
        {"home": 18, "away": 17},
        {"home": 32, "away": 9},
        {"home": 15, "away": 14},
    ]
    assert final == {"home": 84, "away": 56}


def test_refuses_what_is_not_a_pdf():
    client = TestClient(app)
    response = client.post("/read/emarque-basketball", content=b"\xff\xd8\xff not a pdf")
    assert response.status_code == 422
    assert "reason" in response.json()["detail"]


def test_refuses_an_oversized_body():
    client = TestClient(app)
    response = client.post("/read/emarque-basketball", content=b"0" * (MAX_BODY_BYTES + 1))
    assert response.status_code == 413


@pytest.mark.skipif(not INPUTS, reason="SCORESHEET_EVAL_INPUTS not set (private PDFs)")
@pytest.mark.parametrize("golden_path", sorted(GOLDEN_DIR.glob("*.json")), ids=lambda p: p.stem)
def test_matches_golden(golden_path):
    golden = json.loads(golden_path.read_text(encoding="utf-8"))
    pdfs = [name for name in golden["inputs"] if name.endswith(".pdf")]
    for name in pdfs:
        path = Path(INPUTS) / name
        if not path.exists():
            pytest.skip(f"{name} not in {INPUTS}")
        read = read_pdf(path.read_bytes())
        expected = golden["expected"]
        assert (read["homeScore"], read["awayScore"]) == (expected["homeScore"], expected["awayScore"])
        assert read["quarterScores"] == expected["quarterScores"]
        # Names are pseudonymised in the golden; points are derived server-side.
        assert _identity(read["players"]) == _identity(expected["players"])
        assert _plays(read["scoringPlays"]) == _plays(expected["scoringPlays"])


def _identity(players):
    return [{**p, "name": None, "points": None} for p in players]


def _plays(plays):
    # Points are compared server-side, where the gap rule sets them.
    return sorted((p["team"], p["runningScore"], p["jerseyNumber"]) for p in plays)
