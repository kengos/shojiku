//! `shojiku_engine_info`: what this build can do, before any document exists.
//!
//! Passed straight through from the authoring layer, which is the ONE place
//! the capability list is defined. An SDK gating a feature reads the same
//! keys the Designer does.

use crate::result::ShojikuResult;
use crate::status::{encode, Failure};

/// The engine info payload. Takes no request: a caller gates features before
/// it has a template.
pub(crate) fn run() -> Result<ShojikuResult, Failure> {
    Ok(ShojikuResult::json(encode(
        &shojiku_authoring::engine_info(),
    )))
}
