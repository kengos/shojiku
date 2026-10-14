//! The path spelling: the one every pass-1 walk reported before it kept a
//! trail, for a root key, an empty key, a root index and an ancestor's mark.

use super::Trail;

#[test]
fn a_trail_spells_the_dotted_and_indexed_path() {
    let mut trail = Trail::default();
    assert_eq!(trail.spell(), "");
    trail.push_index(2);
    trail.push_key("a");
    let mark = trail.depth();
    trail.push_key("");
    trail.push_key("b");
    trail.push_index(0);
    assert_eq!(trail.spell(), "[2].a..b[0]");
    assert_eq!(trail.spell_to(mark), "[2].a");
    trail.pop();
    trail.pop();
    assert_eq!(trail.spell(), "[2].a.");
}

#[test]
fn a_root_key_is_spelled_without_a_leading_dot() {
    let mut trail = Trail::default();
    trail.push_key("");
    trail.push_key("x");
    assert_eq!(trail.spell(), "x");
}
