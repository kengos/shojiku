# Production shape: your app + its template + the packs, rendered by the
# shojiku npm package (napi addon resolved per platform).
#
#   docker build -t receipt-renderer .
#   docker run --rm receipt-renderer > receipt.pdf
FROM node:22-bookworm-slim
WORKDIR /app
RUN npm init -y >/dev/null && npm install --no-audit --no-fund shojiku
COPY templates/ templates/
COPY packs/ packs/
COPY render.mjs ./
CMD ["node", "render.mjs"]
