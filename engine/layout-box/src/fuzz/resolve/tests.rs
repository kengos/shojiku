//! The resolve harness: one input per flag, the length reader, and the
//! property failures it catches.

use super::*;

#[test]
fn every_kind_of_length_sets_its_flag() {
    let paths = resolve(
        "w=200 em=12 min=5 max=8 gap=2 start=1 count=3\n50%\n2em\n1rem\n10mm\n1cm\n1in\n3\n4pt\nx\n1e9pt\ntrack 10\ntrack 20\n",
    );
    assert_eq!(
        paths,
        ResolvePaths {
            kept: true,
            out_of_range: true,
            percent_of_auto: true,
            percent: true,
            font_relative: true,
            physical: true,
            clamped_min: true,
            clamped_max: true,
            tracks: true,
            offsets: true,
        }
    );
    assert!(resolve("h=50 w=inf count=0\n50%\n").kept);
    assert!(!resolve("w=1e308 gap=-1e308 count=1000\n").tracks);
    assert!(!resolve("w=1 gap=5 count=3\ntrack 1\ntrack NaN\n").tracks);
}

#[test]
fn a_length_that_a_no_op_engine_also_passes_sets_no_flag() {
    // Units that resolve to their own number, sizes within their bounds,
    // one track filling a zero total, and one offset.
    assert_eq!(
        resolve("w=0 h=0 em=1 min=-1 max=1e9 count=1\n5em\n0%\n0mm\ntrack 5\n"),
        ResolvePaths {
            kept: true,
            ..ResolvePaths::default()
        }
    );
    assert!(!resolve("w=0 count=3\n").tracks);
    // A start so large that adding each track leaves it unchanged.
    assert!(!resolve("start=1e20\ntrack 1\ntrack 2\n").offsets);
    // An infinite minimum checks neither bound.
    let inf = resolve("min=inf max=5\n1\n");
    assert!(!inf.clamped_min && !inf.clamped_max);
}

#[test]
fn the_length_reader_takes_each_suffix_and_a_bare_number() {
    assert_eq!(length("5%"), Some(Length::Percent(5.0)));
    assert_eq!(length("5rem"), Some(Length::Rem(5.0)));
    assert_eq!(length("5"), Some(Length::Pt(5.0)));
    assert_eq!(length("5px"), None);
}

#[test]
#[should_panic(expected = "was not kept as is")]
fn a_dropped_in_range_length_fails() {
    check_kept(
        None,
        1.0,
        &Diagnostics::new(),
        Code::LengthOutOfRange,
        &mut ResolvePaths::default(),
    );
}

#[test]
#[should_panic(expected = "was kept")]
fn a_kept_out_of_range_length_fails() {
    check_kept(
        Some(1e9),
        1e9,
        &Diagnostics::new(),
        Code::LengthOutOfRange,
        &mut ResolvePaths::default(),
    );
}
