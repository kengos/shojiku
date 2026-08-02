# frozen_string_literal: true

module Shojiku
  # The one place this gem reads the environment.
  #
  # A client is constructed with `env: true` (the default) or `env: false`,
  # and that single flag governs EVERY `SHOJIKU_*` lookup — the template root,
  # the font and locale directories, and the library path. One flag rather
  # than one per variable is the reference decision the other six SDKs mirror:
  # an application that wants a hermetic configuration wants all of it off,
  # and a per-variable set of knobs is a shape nobody can keep consistent
  # across seven languages.
  # Disabled lookups behave exactly as unset variables do, so calling code
  # has no second branch to get wrong.
  class Env
    def initialize(enabled:, source: ENV)
      @enabled = enabled
      @source = source
    end

    # The variable's value, or nil when it is unset, blank, or lookups are off.
    def [](name)
      return nil unless @enabled

      value = @source[name]
      value if value && !value.empty?
    end

    # A `PATH_SEPARATOR`-separated variable as a list of directories, which is
    # how every other tool in this family spells "several paths in one
    # variable".
    def paths(name)
      value = self[name]
      return [] unless value

      value.split(File::PATH_SEPARATOR).reject(&:empty?)
    end
  end
end
