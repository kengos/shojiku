//! `table.box`: a table placed in a container, an absolute body, a
//! band, or a grid cell renders as ONE bounded (non-paginating) block
//! (`bounded`); in the flow body `box` narrows/centers it horizontally
//! while pagination continues (`flow`). Mirrors src `engine/table/atom.rs`
//! and the flow honoring in `engine/table.rs`.

mod bounded;
mod flow;
