# frozen_string_literal: true

require "fiddle"

module Shojiku
  # Finding and opening the engine's shared library.
  #
  # Resolution order, and the deliberate asymmetry with the template root:
  # `SHOJIKU_LIBRARY` beats explicit configuration, which beats the copy
  # shipped inside the platform gem. That is the reverse of how the template
  # root resolves, and on purpose — WHERE THE ENGINE LIVES is an
  # operator/deployment decision that has to be able to win over application
  # code, exactly as `SHOJIKU_BIN` does for the subprocess SDKs. WHICH
  # TEMPLATES an application renders is the application's own decision, so
  # there the explicit value wins.
  #
  # Nothing here downloads anything. A library that is not present is a named
  # error listing the install channels.
  class Library
    # The ABI revision this gem is written against. It moves only when a
    # symbol's meaning changes; new operations are appended without it, so a
    # newer engine keeps working with this gem.
    ABI_VERSION = 1

    # The names a platform gem's binary can have, in the order they are
    # tried. Windows is the reason there are six rather than three: cargo
    # emits `shojiku_capi.dll` with no `lib` prefix, while the Unix targets
    # get one. Looking only for the prefixed form would make the gem
    # unloadable on the platform the .NET market runs on.
    NAMES = %w[.so .dylib .dll].flat_map do |suffix|
      ["libshojiku_capi#{suffix}", "shojiku_capi#{suffix}"]
    end.freeze

    # Where a platform gem puts the binary it ships.
    PACKAGED_DIR = File.expand_path("native", __dir__)

    attr_reader :path

    # Opens the library, or raises {LibraryNotFound} naming how to install it.
    def initialize(path: nil, env: Env.new(enabled: true), log: Log.new)
      @log = log
      @path, @source = discover(path, env)
      raise LibraryNotFound, install_hint("no engine library was found") unless @path

      @handle = open_handle(@path)
      @log.event(:library_loaded, path: @path, source: @source)
      check_abi
    end

    # A declared foreign function. Types are always explicit: Fiddle's
    # defaults would return a C `int` and truncate every pointer this surface
    # hands back.
    def function(name, args, returns)
      Fiddle::Function.new(@handle[name.to_s], args, returns)
    rescue Fiddle::DLError => e
      raise LibraryNotFound, "#{@path} exports no `#{name}` (#{e.message})"
    end

    private

    # The resolution order, and which position won — the second half is worth
    # reporting, because "which library did this process actually load, and
    # why that one" is the question a deployment asks at 3am.
    def discover(path, env)
      return [env["SHOJIKU_LIBRARY"], :environment] if env["SHOJIKU_LIBRARY"]
      return [path, :configuration] if path

      [packaged, :packaged]
    end

    def packaged
      NAMES.map { |name| File.join(PACKAGED_DIR, name) }
           .find { |candidate| File.file?(candidate) }
    end

    def open_handle(path)
      Fiddle::Handle.new(path)
    rescue Fiddle::DLError => e
      raise LibraryNotFound, install_hint("#{path} could not be loaded (#{e.message})")
    end

    # Asked once, before anything else is called — the header's own advice,
    # and the only way a binding learns that a symbol it is about to call
    # means something different now.
    def check_abi
      found = function(:shojiku_abi_version, [], Fiddle::TYPE_INT).call
      @log.event(:abi_checked, found: found, expected: ABI_VERSION)
      return if found == ABI_VERSION

      raise AbiMismatch,
            "#{@path} implements ABI revision #{found}; this gem speaks #{ABI_VERSION}"
    end

    def install_hint(reason)
      <<~MESSAGE.strip
        #{reason}.

        This gem never downloads the engine. Install it one of these ways:
          * install the platform gem for your system, which ships the binary
          * point SHOJIKU_LIBRARY at a libshojiku_capi library you built
          * pass Shojiku::Client.new(library: "/path/to/libshojiku_capi.so")
      MESSAGE
    end
  end
end
