# frozen_string_literal: true

RSpec.describe Shojiku::Diagnostic do
  it "renders a diagnostic with its path for a log line" do
    diagnostic = client.generate("warns", {}).warnings.first

    expect(diagnostic.to_s).to start_with("sections.body.items[0]: ")
    expect(diagnostic.category).not_to be_nil
    expect(diagnostic.origin).to include(".rs:")
  end

  it "yields nothing for an absent diagnostics payload" do
    expect(described_class.parse(nil)).to eq([])
    expect(described_class.parse("")).to eq([])
  end
end
