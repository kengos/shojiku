//! Registry-wide tests over every [`DiagnosticCode`].

use super::*;

#[test]
fn all_codes_round_trip_through_wire() {
    for &code in DiagnosticCode::ALL {
        assert_eq!(DiagnosticCode::from_wire(code.as_str()), Some(code));
    }
}

#[test]
fn every_code_exposes_metadata() {
    for &code in DiagnosticCode::ALL {
        // Exercises the severity/category/template match arms for all codes.
        let _ = code.severity();
        let _ = code.category();
        let _ = code.deprecation();
        assert!(
            !code.template().is_empty(),
            "{} has empty template",
            code.as_str()
        );
    }
}

#[test]
fn wire_strings_are_unique() {
    let mut seen = std::collections::HashSet::new();
    for &code in DiagnosticCode::ALL {
        assert!(
            seen.insert(code.as_str()),
            "duplicate wire code {}",
            code.as_str()
        );
    }
    assert_eq!(seen.len(), DiagnosticCode::ALL.len());
}

#[test]
fn templates_are_icu_safe() {
    // The English template doubles as a React ICU `defaultMessage`, so it
    // must parse as ICU MessageFormat: no apostrophes (ICU's escape char)
    // and every brace group is a simple `{placeholder}` — a literal brace
    // or an unbalanced one would change meaning between the engine's
    // renderer and ICU.
    for &code in DiagnosticCode::ALL {
        let t = code.template();
        assert!(!t.contains('\''), "apostrophe in {}: {t}", code.as_str());
        let mut rest = t;
        while let Some(open) = rest.find('{') {
            let after = &rest[open + 1..];
            let close = after
                .find('}')
                .unwrap_or_else(|| panic!("unclosed brace in {}: {t}", code.as_str()));
            let name = &after[..close];
            assert!(
                !name.is_empty()
                    && name
                        .chars()
                        .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '_'),
                "non-placeholder brace group `{{{name}}}` in {}: {t}",
                code.as_str()
            );
            rest = &after[close + 1..];
        }
        assert!(
            !rest.contains('}'),
            "stray closing brace in {}: {t}",
            code.as_str()
        );
    }
}

#[test]
fn from_wire_rejects_unknown() {
    assert_eq!(DiagnosticCode::from_wire("nope"), None);
}

#[test]
fn no_deprecated_code_outlives_its_removal_release() {
    // A deprecation names the release that removes it; once the workspace
    // reaches that release the code must be gone from the registry, so a
    // removal cannot ride along unnoticed past its announced date.
    let deprecated: Vec<_> = DiagnosticCode::ALL
        .iter()
        .filter_map(|code| code.deprecation().map(|window| (code.as_str(), window)))
        .collect();
    for (code, window) in deprecated {
        assert!(window.is_release(), "{code}");
        assert!(!window.is_due_at(window.since), "{code}");
        assert!(
            !window.is_due_at(env!("CARGO_PKG_VERSION")),
            "`{code}` is marked for removal in {} and the workspace is at {}; remove it",
            window.removed_in,
            env!("CARGO_PKG_VERSION")
        );
    }
    // The marks are read at all: one row's, spelled out (the PR that removes
    // that code removes this line with it), and an unmarked row's.
    assert_eq!(
        DiagnosticCode::GridCellOverflow.deprecation(),
        Some(crate::Deprecation {
            since: "0.3.0",
            removed_in: "0.4.0"
        })
    );
    assert_eq!(DiagnosticCode::TextOverflow.deprecation(), None);
}
