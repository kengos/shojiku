//! Box decoration end to end (`src/engine/decoration.rs`): border +
//! backgroundColor across item kinds (`boxes`), per-side borders and
//! double rules (`sides`), the dashed/dotted patterns and corner
//! rounding (`patterns`), their hostile inputs (`hostile`), and the
//! shared hostile-input guards (`guards`).

mod boxes;
mod guards;
mod hostile;
mod patterns;
mod sides;
