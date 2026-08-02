//! Tokenizing for the styled-char wrapping engine: greedy-fill units
//! over `(char, span)` pairs — Latin words, single CJK chars, space
//! runs, and atomic `textCombineUpright: all` span runs. Split from
//! [`super`] (the assembly half) for the line budget.

use super::super::is_cjk;
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

pub(super) fn tokenize(spans: &[RichSpan], paragraph: &[Styled]) -> Vec<Token> {
    let mut tokens = Vec::new();
    let mut word: Vec<Styled> = Vec::new();
    let mut space: Vec<Styled> = Vec::new();
    let mut all: Vec<Styled> = Vec::new();

    let flush_word = |word: &mut Vec<Styled>, tokens: &mut Vec<Token>| {
        if !word.is_empty() {
            tokens.push(Token::Word(std::mem::take(word)));
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
