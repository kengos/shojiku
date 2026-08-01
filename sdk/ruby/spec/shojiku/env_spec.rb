# frozen_string_literal: true

RSpec.describe Shojiku::Env do
  describe "when lookups are enabled" do
    subject(:env) do
      described_class.new(enabled: true, source: {
                            "SHOJIKU_TEMPLATE_ROOT" => "/srv/templates",
                            "SHOJIKU_BLANK" => "",
                            "SHOJIKU_FONT_DIR" => ["/a", "/b"].join(File::PATH_SEPARATOR)
                          })
    end

    it "reads a variable" do
      expect(env["SHOJIKU_TEMPLATE_ROOT"]).to eq("/srv/templates")
    end

    it "treats a blank variable as unset, so an empty deploy value is not a root" do
      expect(env["SHOJIKU_BLANK"]).to be_nil
    end

    it "reports an unset variable as nil" do
      expect(env["SHOJIKU_MISSING"]).to be_nil
    end

    it "splits a path list on the platform separator" do
      expect(env.paths("SHOJIKU_FONT_DIR")).to eq(["/a", "/b"])
    end

    it "yields no paths for an unset list" do
      expect(env.paths("SHOJIKU_MISSING")).to eq([])
    end

    it "drops empty entries rather than passing an empty directory on" do
      source = { "SHOJIKU_FONT_DIR" => ["/a", "", "/b"].join(File::PATH_SEPARATOR) }
      env = described_class.new(enabled: true, source: source)

      expect(env.paths("SHOJIKU_FONT_DIR")).to eq(["/a", "/b"])
    end
  end

  # One flag governs EVERY lookup, which is the reference decision the other
  # six SDKs mirror. An application that wants a hermetic configuration wants
  # all of it off, and a per-variable set of knobs is a shape nobody can keep
  # consistent across seven languages.
  describe "when lookups are disabled" do
    subject(:env) do
      described_class.new(enabled: false, source: {
                            "SHOJIKU_TEMPLATE_ROOT" => "/srv/templates",
                            "SHOJIKU_FONT_DIR" => "/a"
                          })
    end

    it "reads no variable, however it is set" do
      expect(env["SHOJIKU_TEMPLATE_ROOT"]).to be_nil
    end

    it "reads no path list either" do
      expect(env.paths("SHOJIKU_FONT_DIR")).to eq([])
    end
  end
end
