//! The length-resolution harness the `box_resolve` fuzz target and the
//! corpus replay test both run.
//!
//! Every authored length reaches layout through [`resolve_x`] or
//! [`resolve_y`], which drop a result outside `±MAX_RESOLVED_PT` (a `%`
//! chain can amplify geometrically) with a diagnostic, and a resolved size
//! is then held to its bounds by [`clamp_size`]. A static grid sizes its
//! tracks with [`equal_track`] and places them with [`track_offsets`]. The
//! harness asserts: a resolved length is finite and within
//! `MAX_RESOLVED_PT`, and is dropped exactly when [`Length::resolve`] gives
//! a value outside that range or, vertically, a `%` has no height to
//! resolve against; a dropped length adds exactly one diagnostic
//! (`length_out_of_range`, or `percent_of_auto`) and a kept one adds none;
//! a clamped size is within finite bounds (`min` winning over `max`); an
//! equal track is zero for no tracks, and for a total within
//! `MAX_RESOLVED_PT` and a gap from 0 to `MAX_RESOLVED_PT` (the engine
//! makes a grid's gap 0 or more) it is finite and non-negative and the
//! tracks and gaps fill the total when they fit; there is one track
//! offset per track, the first is `start`, and, for finite non-negative
//! sizes and gap, each is the previous offset plus the previous track and
//! the gap.
//!
//! `resolve_edges` is not driven: an `EdgeSpec` is built only by the
//! template parser, and the function is `resolve_x` once per side.

use super::{assert_close, body_lines, close, in_range, number, setting};
use crate::{Basis, clamp_size, equal_track, resolve_x, resolve_y, track_offsets};
use shojiku_core::{FontRel, Length, PhysicalUnit};
use shojiku_diagnostics::{DiagnosticCode as Code, Diagnostics};

#[cfg(test)]
mod tests;

/// The most tracks one input may ask [`equal_track`] for.
const MAX_COUNT: usize = 1000;

/// Which assertions one input checked on a result a no-op engine would not
/// give, for the replay test's positive controls.
#[derive(Debug, Default, PartialEq, Eq)]
pub struct ResolvePaths {
    /// A length in range was kept as `Length::resolve` gives it.
    pub kept: bool,
    /// A length out of range was dropped with one diagnostic.
    pub out_of_range: bool,
    /// A vertical `%` was dropped for an auto height.
    pub percent_of_auto: bool,
    /// A kept `%` length differs from its number read as points.
    pub percent: bool,
    /// A kept `em` or `rem` length differs from its number read as points.
    pub font_relative: bool,
    /// A kept physical-unit length differs from its number read as points.
    pub physical: bool,
    /// A size under its finite minimum was clamped up to it.
    pub clamped_min: bool,
    /// A size over its finite maximum was clamped down to it.
    pub clamped_max: bool,
    /// Equal tracks filled a total that zero-sized tracks do not.
    pub tracks: bool,
    /// A track offset is the previous offset plus the previous track and
    /// the gap, where the start plus that track and gap differs from the
    /// start, so an engine placing every track at the start fails.
    pub offsets: bool,
}

/// A length suffix and the `Length` it builds from a number.
type Unit = (&'static str, fn(f64) -> Length);

/// Reads one length token: a number with a `%`, `pt`, `rem`, `em`, `mm`,
/// `cm` or `in` suffix, or a bare number (pt).
fn length(token: &str) -> Option<Length> {
    let units: [Unit; 7] = [
        ("%", Length::Percent),
        ("pt", Length::Pt),
        ("rem", Length::Rem),
        ("em", Length::Em),
        ("mm", |v| Length::Physical(v, PhysicalUnit::Mm)),
        ("cm", |v| Length::Physical(v, PhysicalUnit::Cm)),
        ("in", |v| Length::Physical(v, PhysicalUnit::In)),
    ];
    units
        .iter()
        .find_map(|(suffix, make)| token.strip_suffix(suffix).and_then(number).map(make))
        .or_else(|| number(token).map(Length::Pt))
}

/// Resolves one fuzz input's lengths and tracks and asserts the properties
/// in the module documentation. The first line holds the settings:
/// `w`, `h`, `em`, `rem`, `pct_w`, `min`, `max`, `gap`, `start` (numbers;
/// `h` and `pct_w` unset unless given) and `count` (at most 1000). Each
/// following non-blank line, up to 64, is a length (see [`length`]) or
/// `track <number>`.
///
/// # Panics
///
/// Panics when a property fails; the message names it.
pub fn resolve(input: &str) -> ResolvePaths {
    let settings = input.split('\n').next().unwrap_or_default();
    let get = |key| setting(settings, key).and_then(number);
    let basis = Basis {
        x: 0.0,
        w: get("w").unwrap_or(100.0),
        h: get("h"),
        font: FontRel {
            em: get("em").unwrap_or(10.0),
            rem: get("rem").unwrap_or(10.0),
        },
        pct_w: get("pct_w"),
        fill_h: None,
    };
    let bounds = (get("min"), get("max"));
    let mut paths = ResolvePaths::default();
    let mut tracks = Vec::new();
    for line in body_lines(input) {
        if let Some(size) = line.strip_prefix("track ") {
            tracks.push(number(size).unwrap_or(0.0));
        } else if let Some(len) = length(line.trim()) {
            check_length(len, &basis, bounds, &mut paths);
        }
    }
    let count = setting(settings, "count")
        .and_then(|c| c.parse::<usize>().ok())
        .unwrap_or(tracks.len())
        .min(MAX_COUNT);
    let gap = get("gap").unwrap_or(0.0);
    check_tracks(basis.w, gap, count, &mut paths);
    check_offsets(&tracks, gap, get("start").unwrap_or(0.0), &mut paths);
    paths
}

/// Checks one length on both axes, and the clamp of each kept value.
fn check_length(
    len: Length,
    basis: &Basis,
    bounds: (Option<f64>, Option<f64>),
    paths: &mut ResolvePaths,
) {
    let mut diags = Diagnostics::new();
    let x = resolve_x(Some(len), basis, &mut diags);
    let raw_x = len.resolve(basis.pct_base(), basis.font);
    check_kept(x, raw_x, &diags, Code::LengthOutOfRange, paths);
    let mut diags = Diagnostics::new();
    let y = resolve_y(Some(len), basis, &mut diags);
    match (len, basis.h) {
        (Length::Percent(_), None) => {
            assert!(y.is_none(), "a vertical % resolved against an auto height");
            check_one(&diags, Code::PercentOfAuto);
            paths.percent_of_auto = true;
        }
        (Length::Percent(_), Some(h)) => {
            check_kept(
                y,
                len.resolve(h, basis.font),
                &diags,
                Code::LengthOutOfRange,
                paths,
            );
        }
        _ => check_kept(
            y,
            len.resolve(0.0, basis.font),
            &diags,
            Code::LengthOutOfRange,
            paths,
        ),
    }
    // An engine that ignored the unit would keep the number as points.
    let (Length::Pt(number)
    | Length::Percent(number)
    | Length::Em(number)
    | Length::Rem(number)
    | Length::Physical(number, _)) = len;
    let changed = [x, y].into_iter().flatten().any(|v| v != number);
    match len {
        Length::Percent(_) => paths.percent |= changed,
        Length::Em(_) | Length::Rem(_) => paths.font_relative |= changed,
        Length::Physical(..) => paths.physical |= changed,
        Length::Pt(_) => {}
    }
    for value in [x, y].into_iter().flatten() {
        check_clamp(value, bounds, paths);
    }
}

/// Asserts that `got` is `raw` when `raw` is in range, with no diagnostic,
/// and dropped with one `code` diagnostic otherwise.
fn check_kept(
    got: Option<f64>,
    raw: f64,
    diags: &Diagnostics,
    code: Code,
    paths: &mut ResolvePaths,
) {
    if in_range(raw) {
        assert!(
            got.is_some_and(|v| v.to_bits() == raw.to_bits()),
            "an in-range length {raw} was not kept as is"
        );
        assert!(diags.items.is_empty(), "a kept length added a diagnostic");
        paths.kept = true;
    } else {
        assert!(got.is_none(), "an out-of-range length {raw} was kept");
        check_one(diags, code);
        paths.out_of_range = true;
    }
}

/// Asserts that `diags` holds exactly one diagnostic, with `code`.
fn check_one(diags: &Diagnostics, code: Code) {
    let codes: Vec<Code> = diags.items.iter().map(|d| d.code).collect();
    assert_eq!(
        codes,
        [code],
        "a dropped length did not add exactly one diagnostic"
    );
}

/// Asserts that a clamped value is within the finite bounds.
fn check_clamp(value: f64, (min, max): (Option<f64>, Option<f64>), paths: &mut ResolvePaths) {
    let clamped = clamp_size(value, min, max);
    if let Some(min) = min.filter(|m| m.is_finite()) {
        assert!(
            clamped >= min,
            "a clamped size {clamped} is under its minimum {min}"
        );
        paths.clamped_min |= value < min;
    }
    // `min` wins over `max`, an infinite `min` included; a NaN `min` is not
    // applied, so `max` is still checked under one.
    if let Some(max) = max.filter(|m| m.is_finite() && !min.is_some_and(|n| n > *m)) {
        assert!(
            clamped <= max,
            "a clamped size {clamped} is over its maximum {max}"
        );
        paths.clamped_max |= value > max;
    }
}

/// Checks the equal track size for `count` tracks of `total` with `gap`.
fn check_tracks(total: f64, gap: f64, count: usize, paths: &mut ResolvePaths) {
    let track = equal_track(total, gap, count);
    if count == 0 {
        assert!(track == 0.0, "no tracks gave a track size");
        return;
    }
    // The engine caps a grid's size and makes its gap 0 or more before
    // calling `equal_track`, so only a capped total and a capped,
    // non-negative gap are held to the fill: a hostile negative gap times a
    // large count overflows to an infinite track, and a moderate one loses
    // precision past the tolerance.
    if !(in_range(total) && in_range(gap) && gap >= 0.0) {
        return;
    }
    assert!(
        track.is_finite() && track >= 0.0,
        "a track size is not finite and non-negative"
    );
    let gaps = gap * (count - 1) as f64;
    if total - gaps >= 0.0 {
        assert_close(
            track * count as f64 + gaps,
            total,
            0.0,
            "the tracks and gaps do not fill the total",
        );
        paths.tracks |= !close(gaps, total, 0.0);
    }
}

/// Checks the offsets of `sizes` placed from `start` with `gap`.
fn check_offsets(sizes: &[f64], gap: f64, start: f64, paths: &mut ResolvePaths) {
    let offsets = track_offsets(sizes, gap, start);
    assert_eq!(
        offsets.len(),
        sizes.len(),
        "the offsets are not one per track"
    );
    if let Some(first) = offsets.first() {
        assert!(
            first.to_bits() == start.to_bits(),
            "the first track does not start at the start"
        );
    }
    let forward = start.is_finite()
        && gap.is_finite()
        && gap >= 0.0
        && sizes.iter().all(|s| s.is_finite() && *s >= 0.0);
    if forward {
        for (w, size) in offsets.windows(2).zip(sizes) {
            assert!(
                w[1].to_bits() == (w[0] + (size + gap)).to_bits(),
                "a track offset is not the previous offset plus its track and the gap"
            );
            // An engine placing every track at the start gives `start` for
            // `w[0]` and `w[1]`.
            paths.offsets |= (start + (size + gap)).to_bits() != start.to_bits();
        }
    }
}
