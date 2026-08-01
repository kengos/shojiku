package shojiku

// VerifyOption names the trust anchors a verification checks against.
//
// Required, and deliberately so: verification never consults the machine's
// trust store, because a verdict that depended on ambient machine state would
// silently widen who can vouch for a document. Whose signatures count is the
// caller's decision.
type VerifyOption func(*anchorSet)

type anchorSet struct {
	paths []string
	pem   []byte
	// Which forms were NAMED, as opposed to what they carried — an empty
	// Anchors() is a caller who meant to supply anchors and supplied none,
	// which is a different mistake from not calling it at all.
	namedPaths bool
	namedPEM   bool
}

// Anchors names one or more PEM files holding certificates to trust.
func Anchors(paths ...string) VerifyOption {
	return func(a *anchorSet) {
		a.paths = paths
		a.namedPaths = true
	}
}

// AnchorsPEM supplies anchor certificates as PEM bytes, which may carry
// several concatenated.
func AnchorsPEM(pem []byte) VerifyOption {
	return func(a *anchorSet) {
		a.pem = pem
		a.namedPEM = true
	}
}

const anchorForms = "shojiku.Anchors(paths…) or shojiku.AnchorsPEM(bytes)"

func resolveAnchors(opts []VerifyOption) (anchorSet, error) {
	var anchors anchorSet
	for _, opt := range opts {
		opt(&anchors)
	}
	if anchors.namedPaths && anchors.namedPEM {
		return anchorSet{}, usagef("Verify takes either %s, not both", anchorForms)
	}
	// EMPTY is the same statement as none at all, in EITHER form — an
	// Anchors() with no paths and an AnchorsPEM carrying no bytes are both a
	// caller who meant to supply anchors and supplied none. Left to the
	// engine, the first would refuse the INVOCATION and the second would
	// refuse an empty PEM file, so both would reach the caller as something
	// about their document instead of as the misuse they are.
	if anchors.namedPEM {
		if len(anchors.pem) == 0 {
			return anchorSet{}, usagef("Verify needs %s", anchorForms)
		}
		return anchors, nil
	}
	if len(anchors.paths) == 0 {
		return anchorSet{}, usagef("Verify needs %s", anchorForms)
	}
	return anchors, nil
}
