# frozen_string_literal: true

RSpec.describe Shojiku::Failure do
  subject(:failure) do
    described_class.new(step: :generate, kind: "template_unreadable", message: "outer",
                        cause: described_class.new(step: :generate, kind: "io", message: "inner"))
  end

  it "flattens the cause chain outermost first" do
    expect(failure.causes.map(&:message)).to eq(%w[outer inner])
  end

  it "reads as step, kind and message" do
    expect(failure.to_s).to eq("generate/template_unreadable: outer")
  end

  it "falls back to the step it was given when the engine sent no error object" do
    parsed = described_class.from_error_json("", step: :sign)

    expect(parsed.step).to eq(:sign)
    expect(parsed.kind).to eq("unknown")
  end
end
