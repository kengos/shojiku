# frozen_string_literal: true

RSpec.describe "the FFI boundary", :aggregate_failures do
  let(:engine) { client.send(:instance_variable_get, :@engine) }

  # The ownership rule of this binding: no Ruby object ever holds a pointer
  # into engine memory. Every call copies what it needs while the handle is
  # alive and frees the handle on the way out — including when reading it
  # raises, which is what the `ensure` is for and what nothing else proves.
  it "frees the result handle even when reading it raises" do
    allow(engine).to receive(:snapshot).and_raise(RuntimeError, "boom")
    freed = engine.send(:instance_variable_get, :@free)
    allow(freed).to receive(:call).and_call_original

    expect { engine.engine_info }.to raise_error("boom")
    expect(freed).to have_received(:call).once
  end

  it "reads a zero-length buffer without dereferencing the pointer" do
    # `sign` produces a result with no JSON payload at all. An accessor that
    # trusted the lent pointer for an empty buffer would read whatever was in
    # that slot; the length is checked first, so nothing is dereferenced.
    snapshot = engine.sign(
      pdf: rendered.bytes, key: key_bytes("rsa2048.key.pem"),
      certificate: key_bytes("rsa2048.cert.pem")
    )

    expect(snapshot.json).to eq("")
    expect(snapshot.json.encoding).to eq(Encoding::UTF_8)
  end

  it "forces UTF-8 on text buffers rather than inheriting a platform default" do
    # Windows is a first-class target and its default differs; a JSON payload
    # tagged with the wrong encoding compares unequal to the same characters.
    snapshot = engine.engine_info

    expect(snapshot.json.encoding).to eq(Encoding::UTF_8)
    expect(snapshot.pdf.encoding).to eq(Encoding::ASCII_8BIT)
  end

  it "surfaces the C surface's caller-error level as a non-zero status" do
    # Two levels, and they are not the same thing. A malformed request is the
    # caller's fault and comes back as a status; a refused document is an
    # outcome and comes back as success == false with diagnostics.
    expect(engine.render("not json at all").status).to eq(3)
    expect(engine.verify(pdf: "not a pdf", anchors: "").status).to eq(0)
  end
end
