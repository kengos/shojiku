//! The strict tree read (`yaml::trace`): it reads what the door's tree read
//! reads, except where serde's buffered re-read differs (`strict.rs` lists
//! how: a `null` is a unit value, a unit takes `{}`, a unit struct `{}` or
//! `[]`, a non-negative integer is unsigned), and it keeps the failure's path
//! as segments.

use crate::yaml::fault::Fault;
use crate::yaml::{Traced, Value, from_value, parse, trace};
use serde::Deserialize;
use serde::de::{DeserializeOwned, Deserializer, MapAccess, Visitor};
use std::collections::BTreeMap;
use std::fmt;

#[derive(Debug, Deserialize)]
struct Pair {
    #[expect(dead_code, reason = "read only to make serde check it")]
    a: u8,
}

#[derive(Debug, Deserialize)]
struct Wrapped(u8);

#[derive(Debug, Deserialize)]
struct Marker;

#[derive(Debug, Deserialize)]
enum Shape {
    Dot,
    Line(u8),
}

/// Reads a mapping's first key and leaves the rest, as no derived type does.
struct FirstKey;

impl<'de> Deserialize<'de> for FirstKey {
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        deserializer.deserialize_map(FirstKey)
    }
}

impl<'de> Visitor<'de> for FirstKey {
    type Value = FirstKey;

    fn expecting(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str("a mapping")
    }

    fn visit_map<A: MapAccess<'de>>(self, mut map: A) -> Result<FirstKey, A::Error> {
        map.next_key::<String>().map(|_| FirstKey)
    }
}

fn tree(yaml: &str) -> Value {
    parse(yaml).expect("well-formed").into_tree()
}

/// How `T` fails on `yaml`.
fn traced<T: DeserializeOwned>(yaml: &str) -> Traced {
    let Err(traced) = trace::<T>(&tree(yaml)) else { panic!("{yaml} reads") };
    traced
}

fn refused<T: DeserializeOwned>(yaml: &str) -> Fault {
    traced::<T>(yaml).fault
}

#[test]
fn every_kind_of_node_reads_as_the_door_reads_it() {
    // Every type this suite reads is also refused once, so `trace`'s copy
    // for it runs its failure path too.
    let yaml = "[~, true, -1, 18446744073709551615, 1.5, x, [1], {k: 2}]";
    let door = from_value::<Vec<serde_json::Value>>(&tree(yaml)).expect("reads");
    assert_eq!(
        trace::<Vec<serde_json::Value>>(&tree(yaml)).ok(),
        Some(door)
    );
    let scalar = refused::<Vec<serde_json::Value>>("5");
    assert!(matches!(scalar, Fault::InvalidType { .. }), "{scalar:?}");
}

#[test]
fn a_null_list_mapping_or_struct_is_refused_and_a_null_option_is_none() {
    let unit = |expected: &str| Fault::InvalidType {
        unexpected: "unit value".to_owned(),
        expected: expected.to_owned(),
    };
    assert_eq!(refused::<Vec<u8>>("~"), unit("a sequence"));
    assert_eq!(refused::<BTreeMap<String, u8>>("~"), unit("a map"));
    assert_eq!(refused::<Pair>("~"), unit("struct Pair"));
    assert!(matches!(trace::<Option<Vec<u8>>>(&tree("~")), Ok(None)));
    assert!(matches!(
        refused::<Option<Vec<u8>>>("x"),
        Fault::InvalidType { .. }
    ));
    // The door's own tree read takes the same `null` as an empty list.
    assert!(from_value::<Vec<u8>>(&tree("~")).expect("reads").is_empty());
}

#[test]
fn enums_and_newtype_structs_read_as_the_door_reads_them() {
    assert!(matches!(trace::<Shape>(&tree("Dot")), Ok(Shape::Dot)));
    let line = trace::<Shape>(&tree("{ Line: 3 }")).ok();
    assert!(matches!(line, Some(Shape::Line(3))));
    assert!(matches!(refused::<Shape>("5"), Fault::Custom(_)));
    assert!(matches!(
        trace::<Wrapped>(&tree("7")).ok(),
        Some(Wrapped(7))
    ));
    assert!(matches!(refused::<Wrapped>("x"), Fault::InvalidType { .. }));
}

#[test]
fn the_failure_path_is_kept_as_segments() {
    let path = traced::<Vec<Pair>>("[ { a: 1 }, { a: x } ]").path;
    let segments: Vec<String> = path.iter().map(ToString::to_string).collect();
    assert_eq!(segments, ["[1]", "a"]);
}

#[test]
fn a_list_or_mapping_read_only_in_part_is_refused() {
    let short = refused::<[u8; 2]>("[1, 2, 3]");
    assert!(
        matches!(short, Fault::InvalidLength { len: 3, .. }),
        "{short:?}"
    );
    let part = refused::<FirstKey>("{a: 1, b: 2}");
    assert!(matches!(part, Fault::InvalidLength { .. }), "{part:?}");
    let scalar = refused::<FirstKey>("5");
    assert!(matches!(scalar, Fault::InvalidType { .. }), "{scalar:?}");
}

#[test]
fn a_unit_takes_an_empty_mapping_and_a_unit_struct_an_empty_list_too() {
    // As serde's buffered re-read does; the door's tree read refuses both.
    assert!(trace::<()>(&tree("{}")).is_ok());
    assert!(trace::<()>(&tree("~")).is_ok());
    assert!(matches!(refused::<()>("{a: 1}"), Fault::InvalidType { .. }));
    assert!(matches!(trace::<Marker>(&tree("{}")), Ok(Marker)));
    assert!(matches!(trace::<Marker>(&tree("[]")), Ok(Marker)));
    assert!(matches!(refused::<Marker>("5"), Fault::InvalidType { .. }));
    assert!(matches!(trace::<Shape>(&tree("{Dot: {}}")), Ok(Shape::Dot)));
    assert!(from_value::<()>(&tree("{}")).is_err());
    assert!(from_value::<Marker>(&tree("[]")).is_err());
}
