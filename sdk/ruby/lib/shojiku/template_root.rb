# frozen_string_literal: true

module Shojiku
  # Resolving a template NAME to the sources behind it.
  #
  # A name is an identifier, never a path. A bundle format will take this
  # lookup over later, so nothing outside this class may assume a directory is
  # how names resolve — callers ask for `"receipt_ja"` and get sources back.
  #
  # **The rejection rules are the union across platforms, not the host's.**
  # Windows is a first-class target (it is what the .NET SDK's market runs
  # on), so a backslash is a separator, `C:name` is drive-relative,
  # `\\host\share` is a UNC path and `CON`/`NUL` are reserved devices —
  # every one of them refused on EVERY platform. A template name that is
  # valid on one machine is valid on all of them, which is the only way the
  # same application deploys to both.
  class TemplateRoot
    # Reserved DOS device names. Windows resolves these no matter what
    # directory you are in and no matter what extension you append.
    DEVICES = (%w[CON PRN AUX NUL] +
               (1..9).flat_map { |n| ["COM#{n}", "LPT#{n}"] }).freeze

    # A name is ONE segment. Refusing both separators outright subsumes
    # traversal, absolute paths and nested lookups in a single rule — the
    # simplest thing six other SDKs can mirror without drifting.
    SEPARATORS = %r{[/\\]}
    DRIVE_RELATIVE = /\A[A-Za-z]:/
    CONTROL = /[\x00-\x1f\x7f]/

    TEMPLATE_FILE = "templates.yml"
    DEFINITIONS_FILE = "definitions.yml"

    # Each rule, and what a caller is told when it fires. The keys are the
    # predicate names below, so adding a rule is one entry plus one method.
    RULES = {
      "separator" => "a name is one segment, so `/` and `\\` are never part of it " \
                     "(which is also what makes `..` traversal impossible)",
      "control" => "it contains a control character",
      "drive_relative" => "it is drive-relative, which Windows resolves against " \
                          "that drive's current directory",
      "device" => "it is a reserved device name on Windows"
    }.freeze

    attr_reader :path

    def initialize(path)
      @path = path
    end

    # Resolves `name`, or raises {Rejected} naming why it will not.
    #
    # Rejection is an exception INSIDE this class and a failed Result outside
    # it (see {Client#generate}) — a hostile template name is a fact about the
    # request, not a bug in the calling program.
    def resolve(name)
      identifier!(name)
      reject!(name)
      dir = File.join(@path, name)
      real = contained!(dir)
      Sources.new(
        template: read!(File.join(real, TEMPLATE_FILE)),
        definitions: optional(File.join(real, DEFINITIONS_FILE)),
        assets_dir: real
      )
    end

    # A refused name or an unreadable template, with the machine-readable
    # `kind` the failure trace carries.
    class Rejected < StandardError
      attr_reader :kind, :cause_message

      def initialize(kind, message, cause_message: nil)
        @kind = kind
        @cause_message = cause_message
        super(message)
      end
    end

    private

    # A name is an IDENTIFIER, so anything that is not a string is a bug in
    # the calling program rather than a hostile request — and it has to be
    # caught here, because a Symbol otherwise passes every rule below (a
    # Regexp matches one happily) and dies inside `File.join` as a `TypeError`
    # from a stdlib method the caller never called.
    #
    # A BLANK string is the other case and stays a refused request: it can
    # arrive straight from a form field.
    def identifier!(name)
      return if name.is_a?(String)

      raise UsageError,
            "a template name must be a String; got #{name.class}. Sources you " \
            "already hold go to `generate_source`."
    end

    def reject!(name)
      raise Rejected.new("template_name", "a template name must not be empty") if blank?(name)

      RULES.each_key do |rule|
        next unless send(:"#{rule}?", name)

        raise Rejected.new(
          "template_name",
          "`#{Echo.bounded(name)}` is not a template name: #{RULES.fetch(rule)}"
        )
      end
    end

    def blank?(name)
      name.strip.empty?
    end

    def separator?(name)
      SEPARATORS.match?(name)
    end

    def control?(name)
      CONTROL.match?(name)
    end

    def drive_relative?(name)
      DRIVE_RELATIVE.match?(name)
    end

    # Trailing dots and spaces are STRIPPED by Windows before it resolves a
    # name, so `CON.` and `"CON "` are the CON device just as `CON` is.
    # Without that strip they slip past this rule and are refused later, by
    # containment — still refused, but with a message about a missing
    # template rather than about a reserved name.
    def device?(name)
      stem = name.split(".").first.to_s.sub(/[.\s]+\z/, "")
      DEVICES.include?(stem.upcase)
    end

    # The check a name-shape rule cannot make: after following whatever the
    # filesystem has there, is the answer still inside the root? A symlink is
    # what this exists for — it passes every rule above and still points out.
    def contained!(dir)
      root = File.realpath(@path)
      real = File.realpath(dir)
      inside = real == root || real.start_with?("#{root}#{File::SEPARATOR}")
      return real if inside

      raise Rejected.new("template_escapes_root",
                         "the template resolves outside the template root")
    rescue Errno::ENOENT, Errno::ENOTDIR => e
      raise Rejected.new("template_not_found", "no template by that name", cause_message: e.message)
    end

    def read!(path)
      File.read(path, encoding: Encoding::UTF_8)
    rescue SystemCallError => e
      raise Rejected.new("template_unreadable", "the template could not be read",
                         cause_message: e.message)
    end

    def optional(path)
      File.file?(path) ? read!(path) : nil
    end
  end
end
