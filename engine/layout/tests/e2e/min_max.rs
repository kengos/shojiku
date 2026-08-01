//! D3 min/max size constraints end to end — deliberately cross-cutting
//! (containers, text, flex rows, and grid cells all clamp through the
//! shared `clamp_size`); split by axis.

mod height;
mod width;
