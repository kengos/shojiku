# frozen_string_literal: true

RSpec.describe Shojiku::Library do
  it "opens the engine library and agrees with it about the ABI revision" do
    library = described_class.new(path: engine_library, env: Shojiku::Env.new(enabled: false))

    expect(library.path).to eq(engine_library)
  end

  # The asymmetry with the template root, tested rather than only documented:
  # WHERE THE ENGINE LIVES is an operator's decision, so the environment wins
  # over application code — the same order `SHOJIKU_BIN` has for the
  # subprocess SDKs.
  it "lets SHOJIKU_LIBRARY beat an explicit path" do
    env = Shojiku::Env.new(enabled: true, source: { "SHOJIKU_LIBRARY" => engine_library })
    library = described_class.new(path: "/nonexistent/libshojiku_capi.so", env: env)

    expect(library.path).to eq(engine_library)
  end

  it "obeys env: false even when SHOJIKU_LIBRARY is set" do
    env = Shojiku::Env.new(enabled: false, source: { "SHOJIKU_LIBRARY" => "/nope.so" })
    library = described_class.new(path: engine_library, env: env)

    expect(library.path).to eq(engine_library)
  end

  describe "when there is no library to load" do
    let(:no_env) { Shojiku::Env.new(enabled: false) }

    # The whole point of the named error: the fix is always an installation
    # step, and a bare Fiddle::DLError names none of them.
    it "names the install channels rather than leaking a loader error" do
      expect { described_class.new(path: "/nonexistent/libshojiku_capi.so", env: no_env) }
        .to raise_error(Shojiku::LibraryNotFound,
                        /SHOJIKU_LIBRARY.*platform gem|platform gem.*SHOJIKU_LIBRARY/m)
    end

    it "says so when no path was given and the gem carries no binary" do
      allow(File).to receive(:file?).and_return(false)

      expect { described_class.new(env: no_env) }
        .to raise_error(Shojiku::LibraryNotFound, /no engine library was found/)
    end
  end

  # One example per NAME, because the Windows one is the trap: cargo emits
  # `shojiku_capi.dll` with no `lib` prefix while the Unix targets get one,
  # so a lookup for only the prefixed form would make the gem unloadable on
  # the platform the .NET market runs on.
  %w[libshojiku_capi.so libshojiku_capi.dylib shojiku_capi.dll].each do |name|
    it "finds #{name} when a platform gem ships it and nothing else is configured" do
      packaged = File.join(described_class::PACKAGED_DIR, name)
      allow(File).to receive(:file?).and_call_original
      allow(File).to receive(:file?).with(packaged).and_return(true)
      allow(Fiddle::Handle).to receive(:new).with(packaged)
                                            .and_return(Fiddle::Handle.new(engine_library))

      expect(described_class.new(env: Shojiku::Env.new(enabled: false)).path).to eq(packaged)
    end
  end

  it "refuses a symbol the library does not export" do
    library = described_class.new(path: engine_library, env: Shojiku::Env.new(enabled: false))

    expect { library.function(:shojiku_not_a_symbol, [], Fiddle::TYPE_INT) }
      .to raise_error(Shojiku::LibraryNotFound, /exports no `shojiku_not_a_symbol`/)
  end

  # Asked before anything else is called. It is the only way a binding learns
  # that a symbol it is about to call means something different now.
  it "refuses a library whose ABI revision it does not speak" do
    allow(Fiddle::Function).to receive(:new).and_call_original
    allow(Fiddle::Function).to receive(:new)
      .with(anything, [], Fiddle::TYPE_INT)
      .and_return(instance_double(Fiddle::Function, call: 99))

    expect { described_class.new(path: engine_library, env: Shojiku::Env.new(enabled: false)) }
      .to raise_error(Shojiku::AbiMismatch, /revision 99.*speaks 1/)
  end
end
