//! The `scope: document` binding escape end to end — cross-cutting by
//! design: one choke point (`engine/text/resolve.rs`) serves every
//! data-scoped construct, so the suite proves each construct and each
//! binding carrier reaches it.

mod carriers;
mod constructs;
