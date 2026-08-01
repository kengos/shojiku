# frozen_string_literal: true

module Shojiku
  # A rendered (and possibly signed) document.
  #
  # The application sees bytes and metadata — never a layout-engine internal,
  # and never a handle it has to free. Freeing is the binding's job and it is
  # already done by the time this object exists.
  class DocumentArtifact
    # The PDF, as binary. Always `ASCII-8BIT`: PDF bytes are not text and
    # tagging them as any character encoding is how a document gets corrupted
    # by a well-meaning transcode on the way to disk.
    attr_reader :bytes

    # How many pages the engine laid out. `nil` for an artifact that was
    # signed rather than rendered — signing appends a revision to bytes it
    # never measured, and a zero there would read as "a document with no
    # pages".
    attr_reader :page_count

    attr_reader :diagnostics

    # Where this document came from, which is what a strict client signs on:
    #
    # * `:rendered` — laid out from a template the configured root resolved,
    # * `:source` — laid out from template bytes the application supplied,
    # * `:loaded` — bytes the application supplied whole ({Client#artifact}).
    #
    # Only the first is signable under a {Lockdown}: in the other two the
    # provenance of what gets signed is the application's rather than the
    # deployment's, which is the distinction strict exists to draw. Signing
    # inherits the origin of what it signed — appending a revision does not
    # launder where the document came from. Verification is never restricted.
    attr_reader :origin

    # `origin` defaults to the LEAST privileged value, not the most: every
    # internal path states it explicitly, so the default only ever applies to
    # an artifact somebody built by hand — which is bytes handed over whole,
    # and must not become signable under a lockdown by omission.
    def initialize(bytes:, diagnostics:, client:, page_count: nil, origin: :loaded)
      @bytes = bytes
      @page_count = page_count
      @diagnostics = diagnostics
      @client = client
      @origin = origin
    end

    # Whether these bytes were handed over whole rather than laid out here.
    def loaded?
      @origin == :loaded
    end

    # Writes the document. Binary mode explicitly — a PDF contains NUL and
    # every other byte value, and text mode would translate line endings on
    # Windows.
    def write(path)
      File.binwrite(path, @bytes)
      path
    end

    def size
      @bytes.bytesize
    end

    # Signs this document, returning a {Result} carrying the signed artifact.
    # The signed bytes begin with these bytes byte for byte: signing appends a
    # revision, it never rewrites what was there.
    def sign(provider)
      @client.sign(self, provider)
    end

    # Verifies this document against caller-supplied trust anchors, returning
    # a {Result} carrying a {VerificationReport}.
    def verify(anchors: nil, anchors_pem: nil)
      @client.verify(self, anchors: anchors, anchors_pem: anchors_pem)
    end
  end
end
