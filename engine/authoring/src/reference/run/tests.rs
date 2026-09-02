//! What no gate could say before: that a REFUSAL writes nothing.
//!
//! Every case is a sabotage, so every case carries a control. "The catalog
//! does not exist" is satisfied perfectly by a `run` that never writes
//! anything, and an exit code is equally consistent with "refused" and "failed
//! halfway through" — so each refusal is paired with the same fixture
//! unsabotaged, and the sabotage is located before the verdict is read.
//!
//! The fixtures live here; the claims are split by what they are about.

use super::{run, Job, Outcome, Refusal};
use crate::reference::tables::{start_marker, CLOSE};
use std::path::PathBuf;

mod ordering;
mod refusals;

/// A TWO-table spec, one table per page. `render` reads the spec and the code
/// registry only — the catalog is the AUDIT's input, not the renderer's — so
/// nothing here has to name a real shape.
const SPEC: &str = r#"
"gamma#keys":
  page: gamma
  columns:
    - header: "Key"
      from: key
    - header: "Description"
      from: authored
  rows:
    - keys: ["format"]
      cells:
        "Description": "How the number is written."
"probe#keys":
  page: probe
  columns:
    - header: "Key"
      from: key
    - header: "Description"
      from: authored
  rows:
    - keys: ["format"]
      cells:
        "Description": "How the number is written."
"#;

/// TWO pages, and the spec names BOTH — which is the whole point. `pages()`
/// returns a `BTreeSet`, so the walk is alphabetical and `gamma` is written
/// before `probe` fails. A one-page spec cannot express "the earlier page was
/// not written": a page the spec does not name is never a write candidate
/// under ANY implementation, so asserting it unchanged proves nothing.
pub const FIRST: &str = "gamma";
pub const LAST: &str = "probe";

/// A throwaway `docs/` tree plus a catalog path, removed on drop.
pub struct Tree {
    pub root: PathBuf,
    pub docs: PathBuf,
    pub catalog: PathBuf,
}

impl Tree {
    /// Per-TEST uniqueness, not merely per-process: two cases writing one file
    /// name under a single pid have raced in this repo before.
    pub fn new(name: &str) -> Self {
        let root =
            std::env::temp_dir().join(format!("shojiku-refgen-{}-{name}", std::process::id()));
        let _ = std::fs::remove_dir_all(&root);
        let docs = root.join("docs");
        std::fs::create_dir_all(&docs).expect("fixture tree");
        let catalog = root.join("catalog.json");
        Self {
            root,
            docs,
            catalog,
        }
    }

    /// Both pages the spec names, spliceable. Every case needs both present:
    /// a page the spec names but the tree lacks is an `Io` refusal, which
    /// would mask whatever the case is really about.
    pub fn seed(&self) {
        self.page(&format!("{FIRST}.md"), &spliceable_for(FIRST, "Prose."));
        self.page(&format!("{LAST}.md"), &spliceable_for(LAST, "Prose."));
    }

    pub fn page(&self, name: &str, text: &str) {
        std::fs::write(self.docs.join(name), text).expect("fixture page");
    }

    pub fn read(&self, name: &str) -> String {
        std::fs::read_to_string(self.docs.join(name)).expect("fixture page")
    }

    pub fn run(&self) -> Result<Outcome, Refusal> {
        run(&Job {
            catalog: &self.catalog,
            docs: &self.docs,
            tables: SPEC,
        })
    }
}

impl Drop for Tree {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.root);
    }
}

/// A page carrying the marker pair the splice needs, for the given stem.
pub fn spliceable_for(stem: &str, body: &str) -> String {
    format!(
        "# {stem}\n\n{}\nplaceholder\n{CLOSE}\n\n{body}\n",
        start_marker(&format!("{stem}#keys")),
    )
}

/// The `probe` page, which most cases use.
pub fn spliceable(body: &str) -> String {
    spliceable_for(LAST, body)
}

/// A `## Diagnostics` section whose one row names `code`.
pub fn with_code(code: &str) -> String {
    spliceable(&format!(
        "## Diagnostics\n\n| Code | Meaning |\n| --- | --- |\n| `{code}` | x |"
    ))
}

/// Asserts a sabotage really landed where it was aimed. A PASS from a sabotage
/// run is the suspicious outcome; a fixture is a probe like any other.
pub fn assert_landed(text: &str, token: &str) {
    assert!(
        text.contains(token),
        "the sabotage `{token}` is not in the fixture it was written to:\n{text}"
    );
}
