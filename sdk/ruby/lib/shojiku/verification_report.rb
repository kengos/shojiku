# frozen_string_literal: true

module Shojiku
  # What verification found — INCLUDING what it did not look at.
  #
  # `not_checked` is a field, not a footnote, and this binding passes it
  # through untouched. A "valid" verdict that quietly skipped revocation is
  # worse than no verifier at all: it turns a missing capability into a false
  # assurance, which is exactly the trust a signing feature sells. Dropping it
  # on the way through an SDK would be the same lie one layer up.
  #
  # The four checks stay separate for the same reason. "The signature is valid
  # but covers only part of the file" is a different fact from "the signature
  # is wrong", and a caller that cannot tell them apart cannot explain the
  # answer to anyone.
  class VerificationReport
    # The outcome of one check: `passed`, or `failed` with the reason.
    class Check
      attr_reader :status, :reason

      def initialize(item)
        @status = item["status"]
        @reason = item["reason"]
      end

      def passed?
        @status == "passed"
      end

      def to_s
        @reason ? "#{@status}: #{@reason}" : @status.to_s
      end
    end

    attr_reader :signature, :coverage, :certificate_validity, :trust_chain, :not_checked

    def self.parse(json)
      new(JSON.parse(json))
    end

    def initialize(payload)
      @valid = payload["valid"]
      @signature = Check.new(payload["signature"])
      @coverage = Check.new(payload["coverage"])
      @certificate_validity = Check.new(payload["certificateValidity"])
      @trust_chain = Check.new(payload["trustChain"])
      @not_checked = Array(payload["notChecked"]).map(&:to_sym).freeze
    end

    # Whether every check this release PERFORMS passed. Read `not_checked`
    # beside it: this is not "the document is trustworthy", it is "nothing we
    # looked at was wrong".
    def valid?
      @valid == true
    end

    def checks
      { signature: @signature, coverage: @coverage,
        certificate_validity: @certificate_validity, trust_chain: @trust_chain }
    end
  end
end
