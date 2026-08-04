//! The SHAPE of the command line, as opposed to what a command then does.
//!
//! What lives here is a claim about which flags exist at all — the kind a
//! reader cannot check by looking at one command's behaviour, and the kind
//! that would otherwise be asserted only by a doc comment.

use super::*;

#[test]
fn the_external_verbs_take_no_key_and_no_passphrase() {
    // The claim the whole pair exists for, made checkable: there is no flag
    // for key material on either verb, so no invocation can put one in reach.
    for verb in ["sign-prepare", "sign-complete"] {
        for flag in ["--key", "--passphrase-env"] {
            let parsed = Cli::try_parse_from([
                "shojiku",
                verb,
                "--input",
                "in.pdf",
                "--cert",
                "signer.crt",
                "--algorithm",
                "rsa-pkcs1-sha256",
                "--signature",
                "sig.bin",
                "--output",
                "-",
                flag,
                "value",
            ]);
            assert!(parsed.is_err(), "`{verb} {flag}` was accepted");
        }
    }
}
