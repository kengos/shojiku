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
