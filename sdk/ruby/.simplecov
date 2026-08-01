# frozen_string_literal: true

# The coverage gate, in SimpleCov's own conventional location (which is
# where docs/guidelines.md says every language's threshold lives). Loaded
# automatically by `SimpleCov.start` in spec/spec_helper.rb.
SimpleCov.start do
  enable_coverage :line
  add_filter "/spec/"
  minimum_coverage line: 100
end
