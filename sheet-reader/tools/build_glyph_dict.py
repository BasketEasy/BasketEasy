"""Rebuild templates/emarque_v2/glyphs.json when e-Marque changes its font.

Dev tool, not shipped: needs `tesseract` on PATH and pypdfium2 (a pdfplumber
dependency). Each PDF page is rendered at 300 dpi, tesseract boxes every
character, and each box votes for the glyph fingerprint (vectors.page_atoms)
under it. A fingerprint is kept when at least 3 boxes voted and 60% agreed.

    python tools/build_glyph_dict.py out.json export1.pdf export2.pdf …

Diff out.json against the committed glyphs.json, run the golden test
(SCORESHEET_EVAL_INPUTS=… pytest) and only then replace it. Accents
(accents.json) and the running-score marks (marks.json) are small enough to
be added by hand from a failing read's fingerprints.
"""

from __future__ import annotations

import collections
import json
import subprocess
import sys
import tempfile
from pathlib import Path

import pdfplumber

sys.path.insert(0, str(Path(__file__).parents[1]))
from sheet_reader.vectors import page_atoms  # noqa: E402

DPI = 300


def tesseract_boxes(png: Path, height: int) -> list[tuple[str, float, float, float, float]]:
    base = png.with_suffix("")
    subprocess.run(
        ["tesseract", str(png), str(base), "--psm", "11", "makebox"], check=True, capture_output=True
    )
    scale = DPI / 72.0
    boxes = []
    for line in base.with_suffix(".box").read_text(encoding="utf-8", errors="ignore").splitlines():
        parts = line.split(" ")
        if len(parts) < 6:
            continue
        ch, left, bottom, right, top = parts[0], *map(int, parts[1:5])
        boxes.append((ch, left / scale, (height - top) / scale, right / scale, (height - bottom) / scale))
    return boxes


def main(out: str, pdfs: list[str]) -> None:
    votes: dict[str, collections.Counter] = collections.defaultdict(collections.Counter)
    with tempfile.TemporaryDirectory() as tmp:
        for n, path in enumerate(pdfs):
            with pdfplumber.open(path) as pdf:
                for p, page in enumerate(pdf.pages):
                    image = page.to_image(resolution=DPI).original
                    png = Path(tmp) / f"{n}-{p}.png"
                    image.save(png)
                    atoms = [a for a in page_atoms(page) if a.height > 3.0]
                    for ch, x0, y0, x1, y1 in tesseract_boxes(png, image.size[1]):
                        under = [a for a in atoms if x0 - 1 <= a.cx <= x1 + 1 and y0 - 1 <= a.cy <= y1 + 1]
                        if len(under) == 1:
                            votes[under[0].key][ch] += 1
    glyphs = {}
    for key, counter in votes.items():
        ch, n = counter.most_common(1)[0]
        if n >= 3 and n / sum(counter.values()) >= 0.6:
            glyphs[key] = ch
    Path(out).write_text(json.dumps(glyphs, ensure_ascii=False), encoding="utf-8")
    print(f"{len(glyphs)} glyphs from {len(votes)} fingerprints")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2:])
