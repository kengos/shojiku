//! The path a walk over the pass-1 tree is at, kept as segments borrowed from
//! the tree and spelled out only when a walk reports it.
//!
//! A walk that formatted the path at every node copied the whole prefix into
//! each child's string, so a long key above a long sequence cost their
//! product: an 8 MiB explicit key over a few million elements fits the input
//! cap and copied terabytes. Pushing a borrowed segment costs the same for
//! any key, and the string is built once, on the error path, in the spelling
//! the walks always reported (`a.b[3].c`).

/// One step from a node to its child: a mapping key, or a sequence index.
#[derive(Clone, Copy)]
enum Segment<'a> {
    Key(&'a str),
    Index(usize),
}

/// The segments from the document root to the node a walk is visiting.
#[derive(Default)]
pub(crate) struct Trail<'a> {
    segments: Vec<Segment<'a>>,
}

impl<'a> Trail<'a> {
    pub(crate) fn push_key(&mut self, key: &'a str) {
        self.segments.push(Segment::Key(key));
    }

    pub(crate) fn push_index(&mut self, index: usize) {
        self.segments.push(Segment::Index(index));
    }

    pub(super) fn pop(&mut self) {
        self.segments.pop();
    }

    /// How many segments deep the walk is — a mark [`Self::spell_to`] takes.
    pub(super) fn depth(&self) -> usize {
        self.segments.len()
    }

    /// The whole path, spelled.
    pub(crate) fn spell(&self) -> String {
        self.spell_to(self.depth())
    }

    /// The path of the ancestor `depth` segments deep. A key joins with `.`
    /// unless nothing is spelled yet, so a root key and an empty key read as
    /// they always have.
    pub(super) fn spell_to(&self, depth: usize) -> String {
        let mut out = String::new();
        for segment in &self.segments[..depth] {
            match segment {
                Segment::Key(key) => {
                    if !out.is_empty() {
                        out.push('.');
                    }
                    out.push_str(key);
                }
                Segment::Index(i) => out.push_str(&format!("[{i}]")),
            }
        }
        out
    }
}

#[cfg(test)]
mod tests;
