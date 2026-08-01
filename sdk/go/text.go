package shojiku

import (
	"strings"
	"unicode/utf8"
)

// textLimit is how much caller-supplied text this package will echo back.
const textLimit = 80

// bounded returns text with control characters removed and the length capped.
//
// Template names and provider names reach error strings and log lines, so
// they are stripped and bounded before they are quoted — the same discipline
// the engine applies to the values it echoes, and the same cap the CLI's
// report applies to its own messages. One place for it, because every path
// that echoes owes the same thing.
//
// Capped in CHARACTERS, not bytes: cutting UTF-8 at a byte offset can split a
// multi-byte sequence, and a broken sequence in a log file is a different
// problem from a long line. A byte that is not valid UTF-8 is kept as itself
// and counts as one character — there is no sequence left to preserve, and
// dropping it would hide that the input was malformed while the control bytes
// this exists to remove are gone either way.
func bounded(text string) string {
	var out strings.Builder
	kept := 0
	for i := 0; i < len(text) && kept < textLimit; {
		r, size := utf8.DecodeRuneInString(text[i:])
		if r == utf8.RuneError && size == 1 {
			if !isControlByte(text[i]) {
				out.WriteByte(text[i])
				kept++
			}
			i++
			continue
		}
		if !isControlRune(r) {
			out.WriteRune(r)
			kept++
		}
		i += size
	}
	return out.String()
}

func isControlRune(r rune) bool { return r < 0x20 || r == 0x7f }

func isControlByte(b byte) bool { return b < 0x20 || b == 0x7f }
