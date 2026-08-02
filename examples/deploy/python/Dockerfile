# Production shape: your app + its template + the packs, rendered by the
# shojiku wheel from PyPI. The params come out of a SQLite database built
# into the image (seed.py) — swap that for your real database connection.
#
#   docker build -t receipt-renderer .
#   docker run --rm receipt-renderer > receipt.pdf
FROM python:3.12-slim-bookworm
RUN pip install --no-cache-dir shojiku
WORKDIR /app
# Vendor the template set and the font/locale packs your documents use
# (packs/ comes from the Shojiku repository; trim it to your locale's packs).
COPY templates/ templates/
COPY packs/ packs/
COPY params-base.json seed.py render.py ./
RUN python seed.py
CMD ["python", "render.py"]
