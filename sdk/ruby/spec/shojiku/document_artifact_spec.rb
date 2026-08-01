# frozen_string_literal: true

RSpec.describe Shojiku::DocumentArtifact do
  it "hands over PDF bytes as binary" do
    # Not merely convention: a PDF contains NUL and every other byte value,
    # and tagging it as text is how a well-meaning transcode corrupts it.
    expect(rendered.bytes.encoding).to eq(Encoding::ASCII_8BIT)
    expect(rendered.bytes).to include("\x00")
    expect(rendered.size).to eq(rendered.bytes.bytesize)
  end

  it "writes the exact bytes, NULs and all" do
    in_temp_dir do |dir|
      path = File.join(dir, "receipt.pdf")

      expect(rendered.write(path)).to eq(path)
      expect(File.binread(path)).to eq(rendered.bytes)
    end
  end

  it "carries the diagnostics its render emitted" do
    result = client.generate("warns", {})

    expect(result.artifact.diagnostics).to eq(result.diagnostics)
    expect(result.artifact.diagnostics).not_to be_empty
  end

  # Re-entering an archived document. Before this existed, the only way back
  # in was to build the artifact by hand — which this suite did in two places,
  # and which every application archiving signed PDFs would have had to copy.
  describe "an archived document read back in" do
    it "verifies bytes that were signed some time ago" do
      archived = client.artifact(signed.bytes.dup)

      expect(archived.verify(anchors: key_path("rsa2048.cert.pem"))).to be_success
    end

    it "can be signed again, since appending a revision is what signing does" do
      archived = client.artifact(rendered.bytes.dup)
      result = archived.sign(signer)

      expect(result).to be_success
      expect(result.artifact.bytes[0, archived.size]).to eq(archived.bytes)
    end

    # nil, not zero: nothing here laid anything out, and a zero would read as
    # "a document with no pages".
    it "reports no page count, having measured nothing" do
      expect(client.artifact(rendered.bytes).page_count).to be_nil
    end

    # The provenance a strict client acts on. These bytes are the caller's;
    # a document this client rendered from its own root is not.
    it "knows the bytes came from the caller" do
      expect(client.artifact(rendered.bytes)).to be_loaded
      expect(client.artifact(rendered.bytes).origin).to eq(:loaded)
      expect(rendered).not_to be_loaded
      expect(rendered.origin).to eq(:rendered)
    end

    # Signing does not launder provenance: the revision is appended to bytes
    # whose origin is still what it was.
    it "keeps its origin through a signature" do
      archived = client.artifact(rendered.bytes.dup)

      expect(archived.sign(signer).artifact.origin).to eq(:loaded)
    end

    # Least privilege where it costs nothing: every internal path states the
    # origin, so the default only reaches an artifact built by hand — and an
    # omission must not be the way a document becomes signable under a
    # lockdown.
    it "assumes the least privileged origin when nobody says" do
      handmade = described_class.new(bytes: rendered.bytes, diagnostics: [], client: client)

      expect(handmade.origin).to eq(:loaded)
      expect { client(strict: true, providers: { invoice: signer }).sign(handmade, :invoice) }
        .to raise_error(Shojiku::UsageError, /only a document rendered from its own template/)
    end
  end
end
