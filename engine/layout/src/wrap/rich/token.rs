//! Tokenizing for the styled-char wrapping engine: greedy-fill units
//! over `(char, span)` pairs — Latin words, single CJK chars, space
//! runs, and atomic `textCombineUpright: all` span runs. Split from
//! [`super`] (the assembly half) for the line budget.

use super::super::is_cjk;
use super::super::thai;
use super::width::is_all;
use super::{RichSpan, Styled};

#[derive(Debug)]
pub(super) enum Token {
    /// A word that must stay together (Latin run, may cross spans).
    Word(Vec<Styled>),
    /// A single CJK char (breakable anywhere).
    Cjk(Styled),
    /// A run of spaces.
    Space(Vec<Styled>),
    /// A whole `textCombineUpright: all` span's chars: one atomic cell —
    /// measured as one cell, never split (any slice still draws combined,
    /// so splitting cannot help and would desynchronize measure/draw).
    All(Vec<Styled>),
}

/// Pushes one accumulated word.
///
/// A word carrying Thai is split at the segmenter's word boundaries, one
/// token per segment — Thai has no spaces to mark them, so without this the
/// greedy fill has nothing to break on. A word with no Thai character takes
/// the single-token path untouched, which is what keeps the line breaking of
/// every existing document unchanged.
fn push_word(word: Vec<Styled>, tokens: &mut Vec<Token>) {
    if !word.iter().any(|&(c, _)| thai::is_thai(c)) {
        tokens.push(Token::Word(word));
        return;
    }
    let text: String = word.iter().map(|&(c, _)| c).collect();
    let breaks = thai::break_indices(&text);
    // `break_indices` yields strictly ascending CHARACTER indices, interior
    // only — `1..word.len()`, over these same characters — so each split
    // lands inside what is left. The saturating form keeps that a property
    // of this function rather than a promise its callee has to keep.
    let mut rest = word;
    let mut consumed = 0usize;
    for at in breaks {
        let tail = rest.split_off(at.saturating_sub(consumed).min(rest.len()));
        tokens.push(Token::Word(std::mem::replace(&mut rest, tail)));
        consumed = at;
    }
    tokens.push(Token::Word(rest));
}

pub(super) fn tokenize(spans: &[RichSpan], paragraph: &[Styled]) -> Vec<Token> {
    let mut tokens = Vec::new();
    let mut word: Vec<Styled> = Vec::new();
    let mut space: Vec<Styled> = Vec::new();
    let mut all: Vec<Styled> = Vec::new();

    let flush_word = |word: &mut Vec<Styled>, tokens: &mut Vec<Token>| {
        if !word.is_empty() {
            push_word(std::mem::take(word), tokens);
        }
    };
    let flush_space = |space: &mut Vec<Styled>, tokens: &mut Vec<Token>| {
        if !space.is_empty() {
            tokens.push(Token::Space(std::mem::take(space)));
        }
    };
    let flush_all = |all: &mut Vec<Styled>, tokens: &mut Vec<Token>| {
        if !all.is_empty() {
            tokens.push(Token::All(std::mem::take(all)));
        }
    };

    for &(c, si) in paragraph {
        // An `all` span's chars — spaces and CJK included — accumulate
        // into one atomic token; a span-index change starts a new one.
        if is_all(spans, si) {
            flush_word(&mut word, &mut tokens);
            flush_space(&mut space, &mut tokens);
            if all.last().is_some_and(|&(_, prev)| prev != si) {
                flush_all(&mut all, &mut tokens);
            }
            all.push((c, si));
            continue;
        }
        flush_all(&mut all, &mut tokens);
        if c == ' ' || c == '\t' {
            flush_word(&mut word, &mut tokens);
            space.push((c, si));
        } else if is_cjk(c) {
            flush_word(&mut word, &mut tokens);
            flush_space(&mut space, &mut tokens);
            tokens.push(Token::Cjk((c, si)));
        } else {
            flush_space(&mut space, &mut tokens);
            word.push((c, si));
        }
    }
    flush_word(&mut word, &mut tokens);
    flush_space(&mut space, &mut tokens);
    flush_all(&mut all, &mut tokens);
    tokens
}
