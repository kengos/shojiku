# frozen_string_literal: true

RSpec.describe Shojiku::Log, :aggregate_failures do
  # Anything answering `debug`. The gem takes no logger dependency, so the
  # test does not need one either.
  let(:recorder) do
    Class.new do
      attr_reader :lines

      def initialize = @lines = []
      def debug(line) = @lines << line
    end.new
  end

  it "says nothing at all when no logger was supplied" do
    expect { described_class.new.event(:anything, key: "value") }.not_to raise_error
  end

  it "reports what the binding did, with its fields" do
    described_class.new(recorder).event(:library_loaded, path: "/opt/lib.so", source: :environment)

    expect(recorder.lines).to eq(["shojiku library_loaded path=/opt/lib.so source=environment"])
  end

  it "times an operation and records its verdict" do
    result = described_class.new(recorder).timed(:generate) { Shojiku::Result.succeeded(:x, []) }

    expect(result.value).to eq(:x)
    expect(recorder.lines.first).to match(/\Ashojiku generate ms=\d+(\.\d)? ok=true\z/)
  end

  describe "an application that supplies a logger" do
    def logged_client(**)
      client(logger: recorder, **)
    end

    it "records the library it loaded and the ABI revision it found" do
      logged_client

      expect(recorder.lines).to include(a_string_matching(/\Ashojiku library_loaded path=/))
      expect(recorder.lines).to include("shojiku abi_checked found=1 expected=1")
    end

    it "records one event per lifecycle operation" do
      document = logged_client.generate("receipt", customer: { name: "Yamada Shoji K.K." })
      recorder.lines.clear
      signed_result = document.artifact.sign(signer)
      signed_result.artifact.verify(anchors: key_path("rsa2048.cert.pem"))

      expect(recorder.lines.map { |line| line[/\Ashojiku (\w+)/, 1] }).to eq(%w[sign verify])
      expect(recorder.lines).to all(match(/ms=\d/))
    end

    it "names the template it rendered, bounded like every other echo" do
      logged_client.generate("receipt", customer: { name: "Yamada Shoji K.K." })

      expect(recorder.lines).to include(a_string_matching(/\Ashojiku generate template=receipt /))
    end

    # The channel's whole discipline in one example. A log line is the easiest
    # way for a secret to leave a process, and this binding is what hands
    # events to somebody else's log aggregator — so params, key material, the
    # passphrase and the engine's own diagnostics all stay out of it. The
    # diagnostics are not censorship: they belong to the Result the caller
    # already holds, and duplicating them here would put document content in
    # a channel that is not allowed to carry any.
    it "never logs params, key material, the passphrase, or diagnostics" do
      distinctive = "Zenkoku Distinctive Trading K.K."
      pass = passphrase
      secret = key_bytes("rsa2048.enc.pem")
               .lines.find { |line| line.length > 40 && !line.start_with?("-----") }.strip

      client_with_log = logged_client
      client_with_log.generate("warns", customer: { name: distinctive })
      client_with_log.sign(rendered, Shojiku::LocalPem.new(key: key_path("rsa2048.enc.pem"),
                                                           cert: key_path("rsa2048.cert.pem"),
                                                           passphrase: pass))

      expect(recorder.lines.join("\n")).not_to include(distinctive, pass, secret, "text_overflow")
    end
  end
end
