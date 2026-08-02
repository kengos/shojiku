# Production shape: your app + its template + the packs, rendered by the
# platform gem from RubyGems.
#
#   docker build -t receipt-renderer .
#   docker run --rm receipt-renderer > receipt.pdf
FROM ruby:3.3-slim-bookworm
RUN gem install -N shojiku
WORKDIR /app
COPY templates/ templates/
COPY packs/ packs/
COPY render.rb ./
CMD ["ruby", "render.rb"]
