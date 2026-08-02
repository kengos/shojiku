# frozen_string_literal: true

module Shojiku
  # The base of everything this gem raises.
  #
  # Raising is deliberately rare here. A template that will not render, a key
  # that will not sign, a signature that does not verify are OUTCOMES — they
  # come back as {Result} objects you query, never as exceptions you rescue.
  # What is left for exceptions is what every Ruby library reserves them for:
  # programmer misuse, and an environment that cannot host the engine at all.
  class Error < StandardError; end

  # The caller passed something this API cannot accept — a template name that
  # is not a String, a nil where a value is required, both forms of the same
  # material at once, an argument past a hard cap the C library documents, or
  # an entrance this client's {Lockdown} disables. Programmer misuse, so it
  # raises.
  #
  # A BLANK template name is deliberately not in that list: an empty string
  # can arrive straight from a form field, so it comes back as a refused
  # request like every other bad name.
  class UsageError < Error; end

  # Unwrapping a {Result} that failed.
  #
  # `artifact!` / `report!` are the opt-in bridge to exception-style control
  # flow. Calling one on a failed result is programmer misuse — the ruling is
  # explicit and frozen for every Shojiku SDK, because an accessor that raises
  # is the one place this API could drift back into exceptions by accident.
  # The failure travels on the exception, so nothing is lost by taking the
  # short road.
  class UnwrapError < Error
    attr_reader :failure

    def initialize(failure)
      @failure = failure
      super(failure.to_s)
    end
  end

  # The engine library could not be found or loaded.
  #
  # The message names the install channels, because the fix is always an
  # installation step and a bare loader error names none of them. Nothing in
  # this gem downloads the library: an SDK that fetches an executable is a
  # supply-chain surface this product does not take on.
  class LibraryNotFound < Error; end

  # The library loaded but implements a different ABI revision than this gem
  # was written against. Loading anyway would mean calling symbols whose
  # meaning has changed.
  class AbiMismatch < Error; end

  # Key, certificate or trust-anchor bytes that could not be read.
  #
  # Raised internally and caught by {Client}, which turns it into a failed
  # {Result}: an unreadable key is an outcome of the operation, not a bug in
  # the calling program. It carries the machine-readable `kind` the failure
  # trace reports.
  class MaterialUnreadable < Error
    attr_reader :kind

    def initialize(kind, message)
      @kind = kind
      super(message)
    end
  end

  # Echoing caller-supplied text back in a message or a log line.
  #
  # Template names and provider names reach exception reporters and log files,
  # so they are stripped of control characters and bounded before they are
  # quoted — the same discipline the engine applies to the values it echoes.
  # One place for it, because every path that echoes owes the same thing.
  module Echo
    LIMIT = 80

    def self.bounded(text)
      text.to_s.delete("\x00-\x1f\x7f")[0, LIMIT]
    end
  end

  # Reading the byte inputs signing and verification take.
  #
  # One place, because both paths owe the same thing: binary mode (PEM is
  # bytes, and a transcode would corrupt a DER-bearing file), and an
  # unreadable file surfacing as {MaterialUnreadable} rather than as a raw
  # `Errno` nobody upstream is catching.
  module Material
    def self.read(path, kind)
      File.binread(path)
    rescue SystemCallError => e
      raise MaterialUnreadable.new(kind, e.message)
    end
  end
end
