# frozen_string_literal: true

RSpec.describe Shojiku::TemplateRoot do
  subject(:root) { described_class.new(EngineFixtures::FIXTURE_TEMPLATES) }

  describe "a name that resolves" do
    it "yields the template, its definitions and the assets directory" do
      sources = root.resolve("receipt")

      expect(sources.template).to include("name: receipt")
      expect(sources.definitions).to include("Customer")
      expect(sources.assets_dir).to end_with("/receipt")
    end

    it "leaves definitions nil when the template has none" do
      expect(root.resolve("broken").definitions).to be_nil
    end
  end

  # The rejection rules are the UNION across platforms, not this host's. The
  # same template name has to be valid — or invalid — on every machine an
  # application deploys to, and Windows is a first-class target here. Every
  # case below is refused on Linux even though only Windows would resolve it.
  describe "names it refuses" do
    # One example per claim, deliberately: a table that looped over these
    # would report "a name was refused" without saying which rule caught it,
    # and a rule that stopped working would hide behind its neighbours.
    {
      "an empty name" => "",
      "a blank name" => "   ",
      "a POSIX absolute path" => "/etc/passwd",
      "a Windows absolute path" => "C:\\Windows\\system32",
      "a drive-relative name" => "C:receipt",
      "a UNC path" => "\\\\host\\share",
      "parent traversal" => "../receipt",
      "traversal in the middle" => "receipt/../../etc",
      "a nested POSIX path" => "business/receipt",
      "a nested Windows path" => "business\\receipt",
      "an embedded NUL" => "rec\u0000eipt",
      "a newline" => "receipt\nextra",
      "the CON device" => "CON",
      "a lowercase device" => "nul",
      "a device with an extension" => "PRN.yml",
      "a numbered serial device" => "COM1",
      "a numbered printer device" => "LPT9",
      # Windows strips trailing dots and spaces BEFORE resolving a name, so
      # both of these are the CON device. The dot form falls out of Ruby's
      # own `split(".")`; the space form does not, and without an explicit
      # strip it reaches the containment check instead — still refused, but
      # reported as a missing template rather than as a reserved name.
      "a device with a trailing dot" => "CON.",
      "a device with a trailing space" => "CON "
    }.each do |description, name|
      it "refuses #{description}" do
        expect { root.resolve(name) }
          .to raise_error(Shojiku::TemplateRoot::Rejected) { |error|
            expect(error.kind).to eq("template_name")
          }
      end
    end
  end

  # A name that is not a String is a different KIND of wrong from a hostile
  # one, and the split is the point: a hostile name is a fact about the
  # request and comes back as data, while a Symbol or a nil is the calling
  # program contradicting itself. Before this split a Symbol passed every
  # rule above — a Regexp matches one happily — and died inside `File.join`
  # as a `TypeError` from a stdlib method the caller never invoked.
  describe "names that are not names at all" do
    { "a Symbol" => :receipt, "a nil" => nil, "an Integer" => 7 }.each do |description, name|
      it "raises for #{description}, rather than refusing it as a request" do
        expect { root.resolve(name) }
          .to raise_error(Shojiku::UsageError, /must be a String/)
      end
    end

    # The blank cases stay on the other side of the line: an empty string can
    # arrive straight from a form field.
    it "still refuses an empty String as a request rather than as misuse" do
      expect { root.resolve("") }.to raise_error(Shojiku::TemplateRoot::Rejected)
    end
  end

  describe "containment after canonicalization" do
    # The check no name-shape rule can make. Every rule above passes: the name
    # is one plain segment with no separator in it. What it points AT is the
    # problem, and only following the link answers that.
    it "does not follow a symlink that leaves the root" do
      in_temp_dir do |dir|
        outside = File.join(dir, "outside")
        FileUtils.mkdir_p(outside)
        File.write(File.join(outside, "templates.yml"), "version: 0.1.0\n")

        inside = File.join(dir, "root")
        FileUtils.mkdir_p(inside)
        File.symlink(outside, File.join(inside, "escape"))

        expect { described_class.new(inside).resolve("escape") }
          .to raise_error(Shojiku::TemplateRoot::Rejected) { |error|
            expect(error.kind).to eq("template_escapes_root")
          }
      end
    end

    it "accepts a symlink that stays inside the root" do
      in_temp_dir do |dir|
        FileUtils.mkdir_p(File.join(dir, "real"))
        File.write(File.join(dir, "real/templates.yml"), "version: 0.1.0\n")
        File.symlink(File.join(dir, "real"), File.join(dir, "alias"))

        expect(described_class.new(dir).resolve("alias").template).to include("version")
      end
    end
  end

  describe "names that resolve to nothing usable" do
    it "reports a name with no directory behind it" do
      expect { root.resolve("nonexistent") }
        .to raise_error(Shojiku::TemplateRoot::Rejected) { |error|
          expect(error.kind).to eq("template_not_found")
          expect(error.cause_message).to include("No such file")
        }
    end

    it "reports a directory with no templates.yml in it" do
      in_temp_dir do |dir|
        FileUtils.mkdir_p(File.join(dir, "empty"))

        expect { described_class.new(dir).resolve("empty") }
          .to raise_error(Shojiku::TemplateRoot::Rejected) { |error|
            expect(error.kind).to eq("template_unreadable")
          }
      end
    end

    it "reports a root that is not a directory" do
      in_temp_dir do |dir|
        file = File.join(dir, "not-a-dir")
        File.write(file, "")

        expect { described_class.new(file).resolve("receipt") }
          .to raise_error(Shojiku::TemplateRoot::Rejected) { |error|
            expect(error.kind).to eq("template_not_found")
          }
      end
    end
  end

  it "bounds the name it echoes back, since a refusal reaches logs" do
    hostile = "x" * 200
    error = begin
      root.resolve("#{hostile}/escape")
    rescue Shojiku::TemplateRoot::Rejected => e
      e
    end

    expect(error.message).not_to include(hostile)
    expect(error.message).to include("x" * 80)
  end

  it "strips control characters out of the name it echoes back" do
    error = begin
      root.resolve("bad\x07name/x")
    rescue Shojiku::TemplateRoot::Rejected => e
      e
    end

    expect(error.message).to include("badname")
  end
end
