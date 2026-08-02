# frozen_string_literal: true

RSpec.describe "the no-download invariant" do
  # An SDK that fetches an executable is a supply-chain surface this product
  # does not take on. The claim is worth a test rather than a sentence in a
  # README, because it is the kind of thing a convenience commit adds.
  let(:sources) { Dir[File.expand_path("../../lib/**/*.rb", __dir__)] }

  it "reads every source file, so the sweep below cannot pass by matching nothing" do
    expect(sources.length).to be >= 12
  end

  it "requires no networking library anywhere in the gem" do
    offenders = sources.select do |path|
      File.read(path).match?(%r{require\s+["'](net/\w+|open-uri|socket|uri|httparty|faraday)["']})
    end

    expect(offenders).to be_empty
  end

  it "declares exactly one runtime dependency, and it is fiddle" do
    spec = Gem::Specification.load(File.expand_path("../../shojiku.gemspec", __dir__))

    expect(spec.runtime_dependencies.map(&:name)).to eq(["fiddle"])
  end
end
