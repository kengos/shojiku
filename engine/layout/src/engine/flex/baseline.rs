//! Row baseline alignment (`alignItems: baseline`): per-atom first-text
//! baselines and the cross shifts that line them up. A child with no
//! text — a mark, a rect, an image, or a clipped box (CSS synthesizes
//! when overflow is not visible, so clip groups are deliberately not
//! entered) — uses its bottom edge as the baseline, which is what puts
//! a checkbox bottom on its label's baseline.

use crate::font::FontStore;
use crate::tree::LayoutItem;

use super::super::Atom;

/// The atom's alignment baseline, in pt from the atom top: the first
/// text block's first-line baseline (decoration rects paint before the
/// block, so the walk filters for text), else the synthesized bottom
/// edge (`atom.height`, margins included — the CSS margin-edge rule).
pub(super) fn atom_baseline(atom: &Atom, fonts: &FontStore) -> f64 {
    for item in &atom.items {
        if let LayoutItem::Text(block) = item {
            let Some(line) = block.lines.first() else {
                continue;
            };
            let ascent = fonts.face(Some(&block.font_id)).ascent(block.font_size);
            return line.y + block.baseline_offset(ascent);
        }
    }
    atom.height
}

/// Per-atom downward shifts that align every baseline to the deepest
/// one. Shifts are non-negative by construction (`max_b - b`), so a
/// baseline row never pulls a child above the row top.
pub(super) fn baseline_shifts(atoms: &[&Atom], fonts: &FontStore) -> Vec<f64> {
    let baselines: Vec<f64> = atoms.iter().map(|a| atom_baseline(a, fonts)).collect();
    let max_b = baselines.iter().fold(0.0_f64, |m, b| m.max(*b));
    baselines.iter().map(|b| max_b - b).collect()
}

#[cfg(test)]
mod tests;
