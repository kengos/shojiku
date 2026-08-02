//! One entry in a grid `columns`/`rows` track list: a fixed [`Length`]
//! or an `fr` weight.
//!
//! `fr` is a grid-track-only unit — deliberately NOT part of [`Length`],
//! so `"1fr"` anywhere a plain length is expected (box `w`, margins,
//! gaps, column widths) stays an "invalid length" parse error. Weights
//! distribute the leftover space the way `flexGrow` does. Non-finite and
//! negative weights are rejected at parse (string forms bypass the YAML
//! finiteness guard, so they are re-checked here).

use crate::length::{finite, parse_length_text, snippet, Length};
use serde::{Deserialize, Serialize, Serializer};

/// A grid track size: an absolute/relative [`Length`], or an `fr` weight
/// that shares the axis leftover after the fixed tracks and gaps.
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum GridTrack {
    /// A fixed track sized by a [`Length`] (pt / `%` / physical / em / rem).
    Fixed(Length),
    /// An `fr` weight: this track takes `weight / Σweights` of the axis
    /// leftover (`flexGrow`-style distribution).
    Fr(f64),
}

/// Wire form: a bare number (pt) or a suffixed string (`"1fr"`, `"30%"`,
/// `"8mm"`, …).
#[derive(Deserialize)]
#[serde(untagged)]
enum TrackRepr {
    Number(f64),
    Text(String),
}

impl TryFrom<TrackRepr> for GridTrack {
    type Error = String;

    fn try_from(repr: TrackRepr) -> Result<Self, Self::Error> {
        match repr {
            TrackRepr::Number(v) => finite(Length::Pt(v), v).map(GridTrack::Fixed),
            TrackRepr::Text(s) => parse_track_text(&s),
        }
    }
}

/// Parses a string track: an `"Nfr"` weight, otherwise a [`Length`]. The
/// `fr` suffix is unambiguous — no `Length` unit ends in `fr`.
fn parse_track_text(s: &str) -> Result<GridTrack, String> {
    let s = s.trim();
    match s.strip_suffix("fr") {
        Some(num) => parse_fr_weight(num).map(GridTrack::Fr),
        None => parse_length_text(s).map(GridTrack::Fixed),
    }
}

/// Parses an `fr` weight, rejecting non-finite and negative values (CSS
/// forbids negative `fr`; a zero weight is allowed and takes no leftover).
fn parse_fr_weight(num: &str) -> Result<f64, String> {
    let w = num
        .trim()
        .parse::<f64>()
        .map_err(|_| format!("invalid `fr` weight `{}`", snippet(num)))?;
    if !w.is_finite() {
        Err(format!("`fr` weight {w} is not finite"))
    } else if w < 0.0 {
        Err(format!("`fr` weight must not be negative, got {w}"))
    } else {
        Ok(w)
    }
}

impl<'de> Deserialize<'de> for GridTrack {
    fn deserialize<D: serde::Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        let repr = TrackRepr::deserialize(deserializer)?;
        GridTrack::try_from(repr).map_err(serde::de::Error::custom)
    }
}

impl Serialize for GridTrack {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        match self {
            GridTrack::Fixed(len) => len.serialize(serializer),
            GridTrack::Fr(w) => serializer.serialize_str(&format!("{w}fr")),
        }
    }
}

#[cfg(test)]
mod tests;
