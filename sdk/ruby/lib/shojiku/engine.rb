# frozen_string_literal: true

require "fiddle"

module Shojiku
  # Everything copied out of one result handle, before that handle is freed.
  #
  # A snapshot rather than a wrapper, and that is the ownership rule of this
  # binding in one word: no Ruby object ever holds a pointer into engine
  # memory. The accessors LEND — their pointers die with the handle — so the
  # bytes are copied while the handle is alive and the handle is freed on the
  # way out, on every path.
  Snapshot = Data.define(:status, :success, :pdf, :json, :diagnostics, :error)

  # The declared C surface, and the one place a call crosses into it.
  #
  # Every function is declared with explicit argument and return types.
  # Fiddle's default return type is a C `int`, which truncates every pointer
  # this library hands back — a segfault that looks like a memory bug and is
  # really a missing declaration.
  class Engine
    VOIDP = Fiddle::TYPE_VOIDP
    SIZE_T = Fiddle::TYPE_SIZE_T
    INT = Fiddle::TYPE_INT
    VOID = Fiddle::TYPE_VOID

    # Unpack directives that match the C types EXACTLY, rather than Ruby's
    # native-width shorthands. `l!` is a native `long`, which is 8 bytes where
    # `int32_t` is 4 — and `unpack1` on a buffer shorter than its directive
    # returns nil rather than raising, so every flag would silently read as
    # false. `l` is int32 and these two are picked from the real `size_t`
    # width, which differs from `unsigned long` on Windows.
    INT32 = "l"
    SIZE = Fiddle::SIZEOF_SIZE_T == 8 ? "Q" : "L"

    # Every data argument crosses as a (pointer, length) PAIR — nothing is
    # NUL-terminated, because PDF bytes contain NUL — and every call ends with
    # the out-slot the result handle is written to. Spelling the signatures as
    # a table rather than one call each keeps them impossible to disagree
    # with the header: an operation's arity is the count of its arguments.
    PAIR = [VOIDP, SIZE_T].freeze
    OUT = [VOIDP].freeze

    # Only the lifecycle the SDK contract defines is bound: engine info,
    # render, sign, verify. `validate` and `preview` are the authoring
    # surface's, not an artifact lifecycle's — the Designer reaches them
    # through the WASM bindings, and binding them here would be surface with
    # no contract behind it.
    SIGNATURES = {
      shojiku_engine_info: OUT,
      shojiku_render: PAIR + OUT,
      shojiku_sign: (PAIR * 4) + OUT,
      shojiku_sign_prepare: (PAIR * 3) + OUT,
      shojiku_sign_complete: (PAIR * 4) + OUT,
      shojiku_verify: (PAIR * 2) + OUT
    }.freeze

    def initialize(library)
      @library = library
      @calls = SIGNATURES.to_h { |name, args| [name, library.function(name, args, INT)] }
      declare_accessors(library)
    end

    def engine_info
      invoke { |out| call(:shojiku_engine_info, out) }
    end

    def render(request)
      invoke { |out| call(:shojiku_render, request, request.bytesize, out) }
    end

    def sign(pdf:, key:, certificate:, passphrase: nil)
      invoke do |out|
        call(:shojiku_sign, pdf, pdf.bytesize, key, key.bytesize,
             certificate, certificate.bytesize,
             passphrase, passphrase ? passphrase.bytesize : 0, out)
      end
    end

    # The two halves of signing with a key held elsewhere. Both take the same
    # document, certificate and algorithm — the pair is stateless, so the
    # second call re-derives what the first prepared.
    def sign_prepare(pdf:, certificate:, algorithm:)
      invoke do |out|
        call(:shojiku_sign_prepare, pdf, pdf.bytesize, certificate, certificate.bytesize,
             algorithm, algorithm.bytesize, out)
      end
    end

    def sign_complete(pdf:, certificate:, algorithm:, signature:)
      invoke do |out|
        call(:shojiku_sign_complete, pdf, pdf.bytesize, certificate, certificate.bytesize,
             algorithm, algorithm.bytesize, signature, signature.bytesize, out)
      end
    end

    def verify(pdf:, anchors:)
      invoke { |out| call(:shojiku_verify, pdf, pdf.bytesize, anchors, anchors.bytesize, out) }
    end

    private

    # The one place a lifecycle call crosses.
    def call(name, *)
      @calls.fetch(name).call(*)
    end

    def declare_accessors(library)
      buffers = %i[shojiku_result_pdf shojiku_result_json shojiku_result_diagnostics_json
                   shojiku_result_error_json]
      @buffers = buffers.to_h { |name| [name, library.function(name, [VOIDP] * 3, INT)] }
      @success = library.function(:shojiku_result_success, [VOIDP, VOIDP], INT)
      @free = library.function(:shojiku_result_free, [VOIDP], VOID)
    end

    # Runs one operation and copies its result out.
    #
    # The `ensure` is the ownership contract: exactly one handle crosses and
    # exactly one free pairs with it, whatever happens in between.
    def invoke
      out = zeroed(Fiddle::SIZEOF_VOIDP)
      status = yield(out)
      handle = out.ptr
      begin
        snapshot(status, handle)
      ensure
        @free.call(handle)
      end
    end

    def snapshot(status, handle)
      Snapshot.new(
        status: status,
        success: succeeded?(handle),
        pdf: buffer(handle, :shojiku_result_pdf),
        json: text(handle, :shojiku_result_json),
        diagnostics: text(handle, :shojiku_result_diagnostics_json),
        error: text(handle, :shojiku_result_error_json)
      )
    end

    def succeeded?(handle)
      slot = zeroed(Fiddle::SIZEOF_INT)
      @success.call(handle, slot)
      slot[0, Fiddle::SIZEOF_INT].unpack1(INT32) == 1
    end

    # Copies what an accessor lent. `to_str` copies, which is the whole point:
    # the pointer it copies from stops being valid the moment the handle is
    # freed, a few lines later.
    def buffer(handle, name)
      pointer = zeroed(Fiddle::SIZEOF_VOIDP)
      length = zeroed(Fiddle::SIZEOF_SIZE_T)
      @buffers.fetch(name).call(handle, pointer, length)
      size = length[0, Fiddle::SIZEOF_SIZE_T].unpack1(SIZE)
      size.zero? ? (+"").b : pointer.ptr.to_str(size)
    end

    # The same, for a buffer the surface guarantees is UTF-8. The encoding is
    # forced rather than inherited: a platform default would differ on
    # Windows, which is a first-class target here.
    def text(handle, name)
      buffer(handle, name).force_encoding(Encoding::UTF_8)
    end

    # Out-parameters start at zero, so a slot the library never wrote reads
    # as "absent" rather than as whatever was in that memory.
    def zeroed(size)
      slot = Fiddle::Pointer.malloc(size, Fiddle::RUBY_FREE)
      slot[0, size] = "\x00" * size
      slot
    end
  end
end
