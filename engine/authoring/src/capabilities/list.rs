//! The capability key list: the stable-key registry the CLI, MCP, and
//! WASM surfaces all advertise. Split out of `capabilities.rs` for the
//! line budget; `capabilities.rs` re-exports it. **Every change that widens
//! the wire format, the accepted asset surface, or an output surface MUST
//! append a key here in the same PR** (the shojiku-architect capability gate).
//!
//! The keys themselves live in the per-concern submodules below and are
//! composed here into ONE flat slice, so the registry can keep growing
//! without any file outgrowing the line budget. Wire order is preserved:
//! append your key to the submodule it belongs to.

#[cfg(test)]
mod tests;

mod boxes;
mod hosts;
mod items;
mod style;

/// The registry's concerns, in wire order.
const GROUPS: &[&[&str]] = &[items::KEYS, boxes::KEYS, style::KEYS, hosts::KEYS];

/// Total key count across [`GROUPS`] (const-evaluated: the flattened
/// array below needs its length at compile time).
const TOTAL: usize = {
    let mut total = 0;
    let mut g = 0;
    while g < GROUPS.len() {
        total += GROUPS[g].len();
        g += 1;
    }
    total
};

/// Concatenates [`GROUPS`] into one array at compile time (no std const
/// slice concat exists; the `while` loops are the const-fn idiom).
const fn flatten() -> [&'static str; TOTAL] {
    let mut out = [""; TOTAL];
    let mut n = 0;
    let mut g = 0;
    while g < GROUPS.len() {
        let mut i = 0;
        while i < GROUPS[g].len() {
            out[n] = GROUPS[g][i];
            n += 1;
            i += 1;
        }
        g += 1;
    }
    out
}

/// Everything this engine build supports, in stable-key form.
pub const CAPABILITIES: &[&str] = &flatten();
