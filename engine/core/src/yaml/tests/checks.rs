//! What `yaml::parse` reads, and every refusal it makes: its kind, the path
//! to the node that broke the rule, and the parser's location.

use super::refused;
use crate::yaml::{MAX_DEPTH, MAX_INPUT_BYTES, Value, YamlErrorKind, parse};
use shojiku_diagnostics::Echo;

#[test]
fn every_scalar_kind_reads_into_the_tree_in_document_order() {
    let doc = "a: ~\nb: true\nc: -3\nd: 7\ne: 18446744073709551615\nf: 1.5\ng: text\nh: [1, x]\n";
    let tree = parse(doc).expect("parses").into_tree();
    let entry = |key: &str, value| (key.to_owned(), value);
    let expected = Value::Mapping(vec![
        entry("a", Value::Null),
        entry("b", Value::Bool(true)),
        entry("c", Value::Int(-3)),
        entry("d", Value::Int(7)),
        entry("e", Value::UInt(u64::MAX)),
        entry("f", Value::Float(1.5)),
        entry("g", Value::String("text".to_owned())),
        entry(
            "h",
            Value::Sequence(vec![Value::Int(1), Value::String("x".to_owned())]),
        ),
    ]);
    assert_eq!(tree, expected);
}

#[test]
fn an_oversize_input_is_refused_unread() {
    let input = " ".repeat(MAX_INPUT_BYTES + 1);
    let err = refused(&input, YamlErrorKind::TooLarge);
    assert_eq!((&err.path, err.line, err.column), (&None, 0, 0));
    assert!(
        err.message.contains("over the 16777216-byte input cap"),
        "{err:?}"
    );
    // The cap itself is legal: a document of exactly that size is read.
    let at_cap = format!("a{}", " ".repeat(MAX_INPUT_BYTES - 1));
    assert!(parse(&at_cap).is_ok());
}

#[test]
fn a_syntax_error_carries_the_parser_location_and_no_path() {
    let err = refused("a: [1\n", YamlErrorKind::Syntax);
    assert_eq!(err.path, None);
    assert_eq!((err.line, err.column), (2, 1), "{err:?}");
    assert!(err.message.contains("did not find expected"), "{err:?}");
}

/// `n` sequences, each holding the next.
fn nested_sequences(n: usize) -> String {
    format!("{}{}", "[".repeat(n), "]".repeat(n))
}

/// `n` mappings, each holding the next under the key `a`.
fn nested_mappings(n: usize) -> String {
    format!("{}x{}", "{a: ".repeat(n), "}".repeat(n))
}

#[test]
fn nesting_is_read_to_the_bound_and_refused_one_past_it() {
    assert!(parse(&nested_sequences(MAX_DEPTH)).is_ok());
    assert!(parse(&nested_mappings(MAX_DEPTH)).is_ok());
    // One past the bound is still inside the parser's own limit of 128, so
    // the refusal is this door's and names the collection that is too deep.
    // The path is the document's, so it is clipped like any echo of it.
    let err = refused(&nested_sequences(MAX_DEPTH + 1), YamlErrorKind::TooDeep);
    assert_eq!(err.path, Some(Echo::from("[0]".repeat(MAX_DEPTH))));
    assert!(err.message.contains("deeper than 120 levels"), "{err:?}");
    let err = refused(&nested_mappings(MAX_DEPTH + 1), YamlErrorKind::TooDeep);
    assert_eq!(err.path, Some(Echo::from(vec!["a"; MAX_DEPTH].join("."))));
}

#[test]
fn a_legal_template_at_the_container_bound_is_read() {
    // The deepest nesting a valid template reaches through containers alone:
    // two levels per container, under the root, `sections`, `body` and the
    // body's `items`.
    let mut item = "{ type: text, text: x }".to_owned();
    for _ in 0..crate::template::MAX_CONTAINER_DEPTH {
        item = format!("{{ type: container, items: [ {item} ] }}");
    }
    let doc = format!("sections:\n  body:\n    type: flow\n    items: [ {item} ]\n");
    assert!(parse(&doc).is_ok());
    assert!(crate::template::parse_template(&doc).is_ok());
}

#[test]
fn every_kind_of_non_string_key_is_refused_by_name() {
    let cases = [
        ("5: x", "`5`"),
        ("-5: x", "`-5`"),
        ("18446744073709551615: x", "`18446744073709551615`"),
        ("1.5: x", "`1.5`"),
        ("true: x", "`true`"),
        ("~: x", "`null`"),
        ("[a]: x", "a sequence"),
        ("{a: b}: x", "a mapping"),
    ];
    for (doc, named) in cases {
        let err = refused(doc, YamlErrorKind::NonStringKey);
        assert!(
            err.message
                .contains(&format!("mapping key {named} is not a string")),
            "{doc}: {err:?}"
        );
        assert_eq!(err.path.as_deref(), Some("."), "{doc}");
    }
    // A quoted key is a string, whatever it spells.
    assert!(parse("\"5\": x").is_ok());
}

#[test]
fn a_refused_key_is_located_to_the_mapping_holding_it() {
    let err = refused(
        "outer:\n  - a: 1\n  - inner:\n      5: x\n",
        YamlErrorKind::NonStringKey,
    );
    assert_eq!(err.path.as_deref(), Some("outer[1].inner"));
    assert!(err.line > 0, "the parser locates it: {err:?}");
}

#[test]
fn a_duplicate_key_is_refused() {
    let err = refused("a:\n  b: 1\n  b: 2\n", YamlErrorKind::DuplicateKey);
    assert_eq!(err.path.as_deref(), Some("a"));
    assert!(err.message.contains("the key `b` appears twice"), "{err:?}");
}

#[test]
fn a_non_finite_number_is_refused_where_it_sits() {
    for literal in [".nan", ".inf", "-.inf"] {
        let err = refused(
            &format!("a:\n  - 1\n  - {literal}\n"),
            YamlErrorKind::NonFinite,
        );
        assert_eq!(err.path.as_deref(), Some("a[1]"), "{literal}");
    }
    // The same spelling quoted is a string, and is read.
    assert!(parse("a: '.nan'").is_ok());
}

#[test]
fn an_integer_past_64_bits_is_refused_where_it_sits() {
    for literal in ["18446744073709551616", "-9223372036854775809"] {
        let err = refused(&format!("a:\n  b: {literal}\n"), YamlErrorKind::OutOfRange);
        assert_eq!(err.path.as_deref(), Some("a.b"), "{literal}");
        assert!(
            err.message
                .contains(&format!("`{literal}` is outside the 64-bit range"))
        );
        let err = refused(&format!("{literal}: x\n"), YamlErrorKind::NonStringKey);
        assert!(
            err.message.contains(&format!("mapping key `{literal}`")),
            "{err:?}"
        );
    }
    // Past 128 bits today's parser reads an integer as a float, which passes.
    let wide = format!("a: 1{}\n", "0".repeat(40));
    let tree = parse(&wide).expect("parses").into_tree();
    assert_eq!(tree.get("a"), Some(&Value::Float(1e40)));
    // Past what an `f64` holds, it reads the digits as a string.
    let digits = format!("1{}", "0".repeat(400));
    let tree = parse(&format!("a: {digits}\n"))
        .expect("parses")
        .into_tree();
    assert_eq!(tree.get("a"), Some(&Value::String(digits)));
}

#[test]
fn a_local_tag_is_refused_on_a_value_and_on_a_key() {
    let err = refused("a: !money 5\n", YamlErrorKind::Tag);
    assert_eq!(err.path.as_deref(), Some("a"));
    assert!(err.message.contains("local YAML tags"), "{err:?}");
    let err = refused("!name a: 5\n", YamlErrorKind::Tag);
    assert_eq!(err.path.as_deref(), Some("."));
    // A standard tag is the parser's to resolve, and today's reads it as the
    // scalar it names.
    let tree = parse("a: !!str 5\n").expect("parses").into_tree();
    assert_eq!(tree.get("a"), Some(&Value::String("5".to_owned())));
    // A value its standard tag cannot be read as is the parser's refusal.
    let err = refused("a: !!int abc\n", YamlErrorKind::Syntax);
    assert_eq!(err.path, None);
    assert!(err.line > 0, "{err:?}");
}

#[test]
fn the_cap_is_sixteen_mebibytes() {
    // The boundary tests are written RELATIVE to the constant, so they hold
    // for ANY value of it — including a value nobody chose. This is the one
    // assertion that pins the number itself, and it is the number the
    // CHANGELOG and the docs quote.
    assert_eq!(MAX_INPUT_BYTES, 16 * 1024 * 1024);
}

/// The parser's OWN alias limit, pinned. The door does not bound alias
/// expansion itself, which is exactly why it is worth a test: swap the
/// parser and this is the hole that reopens with no other gate noticing.
#[test]
fn the_parser_refuses_runaway_alias_expansion_at_this_input_size() {
    // The billion-laughs shape at ~200 source bytes. The limit this pins is
    // REAL but it is not a constant: serde_yaml's repetition budget is
    // `events.len() * 100`, so it scales with the input and a padded
    // document buys a proportionally bigger bomb — measured at roughly 6
    // nodes per source byte, so a document inside the input cap can still
    // expand to order 10^8 nodes. What this pins is that the budget exists
    // at all and that a small bomb cannot walk past it.
    let laughs = |levels: usize| {
        let mut src = String::from("a0: &a0 \"x\"\n");
        for i in 1..=levels {
            let prev = format!("*a{}", i - 1);
            let refs = vec![prev; 10].join(", ");
            src.push_str(&format!("a{i}: &a{i} [{refs}]\n"));
        }
        src.push_str(&format!("root: *a{levels}\n"));
        src
    };
    // Positive control: the shape itself parses, so the refusal below is the
    // LIMIT talking and not a syntax error in the fixture.
    parse(&laughs(3)).expect("parses");
    let err = refused(&laughs(4), YamlErrorKind::Syntax);
    assert!(err.message.contains("repetition"), "{err:?}");
}

#[test]
fn an_empty_document_is_null() {
    // The parser reports an empty document as no value at all; it reads as
    // `null`, the way a document of just `~` does.
    assert_eq!(parse("").expect("parses").into_tree(), Value::Null);
    assert_eq!(
        parse("# only a comment\n").expect("parses").into_tree(),
        Value::Null
    );
}

#[test]
fn a_located_message_adds_only_what_the_message_lacks() {
    // A refusal gains its path and line/column.
    let err = refused("a:\n  b: 1\n  b: 2\n", YamlErrorKind::DuplicateKey);
    assert_eq!(
        err.located_message(),
        format!(
            "{} at `a`, line {} column {}",
            err.message, err.line, err.column
        )
    );
    // A syntax error and a typed read already carry theirs.
    let err = refused("a: [1\n", YamlErrorKind::Syntax);
    assert_eq!(err.located_message(), err.message.as_str());
    let err = crate::yaml::from_str::<Vec<u8>>("a: 1\n").expect_err("not a list");
    assert!(err.line > 0, "{err:?}");
    assert_eq!(err.located_message(), err.message.as_str());
    // A subtree read has a path and no location.
    let tree = parse("a: x\n").expect("parses").into_tree();
    let err = crate::yaml::from_value::<std::collections::BTreeMap<String, u8>>(&tree)
        .expect_err("not a number");
    assert_eq!(err.located_message(), format!("{} at `a`", err.message));
    // A size refusal has neither.
    let err = refused(&" ".repeat(MAX_INPUT_BYTES + 1), YamlErrorKind::TooLarge);
    assert_eq!(err.located_message(), err.message.as_str());
}
