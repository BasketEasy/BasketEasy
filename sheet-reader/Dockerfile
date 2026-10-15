# Built from the repo root like server/ and app/ (see docker-compose.yml),
# though it only needs its own folder.
FROM python:3.13-slim AS runtime
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /srv
COPY sheet-reader/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY sheet-reader/sheet_reader ./sheet_reader
# Unprivileged: the service parses untrusted uploads.
RUN useradd --system --uid 10001 reader
USER reader
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=3s CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health')"
# Two workers: a read is CPU-bound for several seconds, and the OCR queue
# already serialises most of the load.
CMD ["uvicorn", "sheet_reader.app:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2"]
