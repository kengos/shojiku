# frozen_string_literal: true

module Shojiku
  # The sources one render runs over: the template text, the definitions text
  # when there are any, and the directory bundled assets resolve against.
  #
  # A value rather than a file layout, because there are two ways to get one
  # and only one of them involves the filesystem. {TemplateRoot} produces it
  # by resolving a NAME; {Client#generate_source} produces it from bytes the
  # application already has. Everything downstream — the request envelope, the
  # engine — sees the same object either way, which is what keeps the second
  # entrance from being a second code path.
  Sources = Data.define(:template, :definitions, :assets_dir)
end
