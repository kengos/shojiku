//! Every mapping key in a template is a string, checked on the pass-1 `Value`
//! before the typed parse reads the document.
//!
//! The typed parse does not refuse a non-string key — it can MISREAD one.
//! `serde` buffers an internally-tagged `Item` or `Body`, and the buffered
//! struct then reads a plain integer key as a field NUMBER, so
//! `{ type: container, 5: [ … ] }` deserializes as `items: [ … ]` (`5` is the
//! sixth field). That spelling also walked past [`super::nesting`], which
//! counts only `items:` keys, and a chain written through it is read into the
//! model unbounded — deep enough, it exhausts the thread's stack and aborts
//! the process. Refusing the key here closes both: no legal template needs
//! one, since every registry it holds (styles, formats, bindings) is keyed by
//! name, and the wire it mirrors is JSON, whose keys are strings.
//!
//! A quoted key (`"5":`) is a string and passes; only the typed parse decides
//! whether it names anything. The walk recurses once per `Value` level and so
//! shares the parser's bound, like every other walk over the pass-1 tree; the
//! path it reports is spelled only when it refuses ([`super::trail`]).

use super::trail::Trail;
use crate::error::CoreError;
use serde_yaml::Value;
use shojiku_diagnostics::Echo;

/// Refuses a template holding a mapping key that is not a string, naming the
/// mapping that holds the first one in document order.
pub(crate) fn template(raw: &Value) -> Result<(), CoreError> {
    walk(raw, &mut Trail::default())
}

fn walk<'a>(node: &'a Value, trail: &mut Trail<'a>) -> Result<(), CoreError> {
    match node {
        Value::Mapping(map) => {
            for (key, value) in map {
                let Some(key) = name(key) else {
                    return Err(refusal(&trail.spell(), key));
                };
                trail.push_key(key);
                walk(value, trail)?;
                trail.pop();
            }
            Ok(())
        }
        Value::Sequence(seq) => {
            for (i, value) in seq.iter().enumerate() {
                trail.push_index(i);
                walk(value, trail)?;
                trail.pop();
            }
            Ok(())
        }
        Value::Tagged(tagged) => walk(&tagged.value, trail),
        _ => Ok(()),
    }
}

/// The key as a name, or `None` when it is not a string. A tag (`!name`)
/// changes nothing about what the key is.
fn name(key: &Value) -> Option<&str> {
    match key {
        Value::String(name) => Some(name),
        Value::Tagged(tagged) => name(&tagged.value),
        _ => None,
    }
}

fn refusal(path: &str, key: &Value) -> CoreError {
    CoreError::Located {
        what: "template",
        path: Echo::from(path),
        key: None,
        line: 0,
        column: 0,
        message: Echo::from(format!(
            "mapping key {} is not a string; every template key must be one (quote it if it is a name)",
            describe(key)
        )),
    }
}

/// How the refusal names a key. A scalar is quoted back — a number, a bool or
/// `null` is short by construction — but a sequence or mapping used as a key
/// is only named by kind, since its content is the document's, unbounded.
fn describe(key: &Value) -> String {
    match key {
        Value::Number(n) => format!("`{n}`"),
        Value::Bool(b) => format!("`{b}`"),
        Value::Null => "`null`".to_owned(),
        Value::Sequence(_) => "a sequence".to_owned(),
        Value::Tagged(tagged) => describe(&tagged.value),
        // A mapping — a string key never reaches here.
        _ => "a mapping".to_owned(),
    }
}

#[cfg(test)]
mod tests;
