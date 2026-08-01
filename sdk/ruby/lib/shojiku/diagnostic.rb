# frozen_string_literal: true

module Shojiku
  # One thing the engine noticed about a document.
  #
  # Passed through, never interpreted. `code` and `args` are the engine's
  # frozen contract — a translating consumer renders its own message from
  # them — so this class parses the wire and stops. It does not translate, it
  # does not re-classify, and it never becomes an exception: a render that
  # warns still succeeded, and a render that failed says why in these.
  class Diagnostic
    attr_reader :severity, :code, :category, :message, :path, :args, :origin

    def self.parse(json)
      return [] if json.nil? || json.empty?

      items = JSON.parse(json)["items"]
      Array(items).map { |item| new(item) }
    end

    def initialize(item)
      @severity = item["severity"]
      @code = item["code"]
      @category = item["category"]
      @message = item["message"]
      @path = item["path"]
      @args = item["args"] || {}
      @origin = item["origin"]
    end

    def error?
      @severity == "error"
    end

    def warning?
      @severity == "warning"
    end

    def to_s
      [@path, @message].compact.join(": ")
    end
  end
end
