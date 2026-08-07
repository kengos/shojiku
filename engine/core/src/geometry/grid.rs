//! Static-grid track spec (box-model Phase 3): how a `box.type: grid`
//! container divides its axes into tracks.
//!
//! `columns` / `rows` share one wire type: a bare number is that many
//! equal tracks (rows need a definite height to split; an auto-height
//! container degrades to auto rows with a diagnostic), a sequence is an
//! explicit track list of [`GridTrack`]s — fixed [`Length`]s or `fr`
//! weights (`columns: ["1fr", "2fr", 90]`). Rows beyond an explicit list
//! are auto (implicit tracks, sized by their tallest child). A bare
//! string (not a sequence) is rejected — there is no track mini-grammar
//! to keep in sync with the GUI (North star: structured forms only).

pub(crate) mod track;

pub use track::GridTrack;

use serde::ser::SerializeSeq;
use serde::{Deserialize, Deserializer, Serialize, Serializer};

/// Maximum tracks per grid axis. Untrusted templates drive the track
/// count; the cap keeps a hostile `columns: 1000000000` from allocating
/// or dividing into degenerate slivers (mirrors
/// [`crate::MAX_IMPOSITION_PER_PAGE`]). Over-cap specs are clamped at
/// layout with a `grid_tracks_clamped` diagnostic, never a panic.
pub const MAX_GRID_TRACKS: usize = 64;

/// One grid axis: `N` equal tracks or an explicit track list.
#[derive(Debug, Clone, PartialEq)]
pub enum TrackSpec {
    /// That many equal tracks (the axis size minus gaps, split evenly).
    Count(usize),
    /// Explicit track sizes, in order (fixed lengths and/or `fr` weights).
    Tracks(Vec<GridTrack>),
}

impl<'de> Deserialize<'de> for TrackSpec {
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        struct TrackVisitor;

        impl<'de> serde::de::Visitor<'de> for TrackVisitor {
            type Value = TrackSpec;

            fn expecting(&self, f: &mut std::fmt::Formatter) -> std::fmt::Result {
                f.write_str("a track count (number) or a track-size sequence")
            }

            fn visit_u64<E: serde::de::Error>(self, v: u64) -> Result<TrackSpec, E> {
                Ok(TrackSpec::Count(usize::try_from(v).unwrap_or(usize::MAX)))
            }

            fn visit_i64<E: serde::de::Error>(self, v: i64) -> Result<TrackSpec, E> {
                usize::try_from(v)
                    .map(TrackSpec::Count)
                    .map_err(|_| E::custom("track count must not be negative"))
            }

            fn visit_f64<E: serde::de::Error>(self, v: f64) -> Result<TrackSpec, E> {
                Err(E::custom(format!(
                    "track count must be a whole number, got {v} \
                     (use a sequence for sized tracks)"
                )))
            }

            fn visit_str<E: serde::de::Error>(self, s: &str) -> Result<TrackSpec, E> {
                Err(E::custom(format!(
                    "columns/rows take a track count or a sequence of track \
                     sizes (e.g. [\"1fr\", \"30%\", 100]), got string `{}`",
                    crate::length::snippet(s)
                )))
            }

            fn visit_seq<A: serde::de::SeqAccess<'de>>(
                self,
                mut seq: A,
            ) -> Result<TrackSpec, A::Error> {
                let mut tracks = Vec::new();
                while let Some(track) = seq.next_element::<GridTrack>()? {
                    tracks.push(track);
                }
                Ok(TrackSpec::Tracks(tracks))
            }
        }

        deserializer.deserialize_any(TrackVisitor)
    }
}

impl Serialize for TrackSpec {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        match self {
            TrackSpec::Count(n) => serializer.serialize_u64(*n as u64),
            TrackSpec::Tracks(tracks) => {
                let mut seq = serializer.serialize_seq(Some(tracks.len()))?;
                for track in tracks {
                    seq.serialize_element(track)?;
                }
                seq.end()
            }
        }
    }
}

#[cfg(test)]
mod tests;
