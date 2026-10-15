"""HTTP surface of the sheet reader, called by the server's OCR worker only.

POST /read/emarque-basketball with the PDF as the raw body:
- 200 ParsedScoresheetData when the PDF is an e-Marque V2 export it can read;
- 422 {"reason": …} when it isn't (a photo, another form, an e-Marque version
  whose glyphs or marks changed): the server then falls back to the vision
  model, so a refusal is routine, not an incident.

Internal only: no authentication, so it must never be published outside the
compose network. It holds no state and writes nothing; the PDF lives only in
the request.
"""

from __future__ import annotations

from fastapi import FastAPI, HTTPException, Request
from fastapi.concurrency import run_in_threadpool

from .emarque_basketball import NotThisForm, read_pdf

# An e-Marque export is ~1 MB; anything far larger isn't one, and parsing it
# would only tie up a worker.
MAX_BODY_BYTES = 8 * 1024 * 1024

app = FastAPI(title="Kluvo sheet reader", docs_url=None, redoc_url=None, openapi_url=None)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/read/emarque-basketball")
async def read_emarque_basketball(request: Request) -> dict:
    declared = request.headers.get("content-length")
    if declared is not None and int(declared) > MAX_BODY_BYTES:
        raise HTTPException(status_code=413, detail={"reason": "too large"})
    body = await request.body()
    if len(body) > MAX_BODY_BYTES:
        raise HTTPException(status_code=413, detail={"reason": "too large"})
    try:
        # pdfplumber is synchronous and CPU-bound: off the event loop.
        return await run_in_threadpool(read_pdf, body)
    except NotThisForm as refusal:
        raise HTTPException(status_code=422, detail={"reason": str(refusal)}) from refusal
