//! Marshalling helpers for the wasm-bindgen shim (wasm32 only): the ONE place
//! engine values become JS values — thrown `Error`s, JSON strings, and the
//! render-result objects. Kept beside the `Engine` surface so `shim.rs` stays
//! the binding surface and this file stays the conversion layer.

use crate::error::WasmError;
use crate::render::{Pages, PdfOutcome, RenderOutcome};
use js_sys::{Array, Error, Object, Reflect, Uint8Array};
use shojiku_diagnostics::{sanitize, ArgValue, MAX_MESSAGE};
use wasm_bindgen::prelude::*;

/// Maps a host-misuse error to a thrown JS `Error` carrying a stable `code`
/// string and a plain-object `args` of typed scalars alongside the message.
/// A host branches on `error.code` (append-only contract) instead of matching
/// the localizable `error.message`; older hosts that only read `message`
/// keep working because the message is unchanged. Attaching the extra
/// properties can only fail if the JS `Error` is not an object, which it
/// always is — a failed attach degrades to the bare `Error` rather than
/// masking the real error with a marshalling one.
pub(super) fn throw(err: WasmError) -> JsValue {
    // `args` are already bounded (they ride `ArgValue::text`); the message
    // was not, and it is the half a Designer actually shows to a user.
    let error = Error::new(&sanitize(&err.to_string(), MAX_MESSAGE));
    let _ = Reflect::set(&error, &"code".into(), &err.code().into());
    let args = Object::new();
    for (key, value) in err.args() {
        let _ = Reflect::set(&args, &key.into(), &arg_to_js(&value));
    }
    let _ = Reflect::set(&error, &"args".into(), &args);
    error.into()
}

/// Marshals one typed arg value to its bare JS scalar (mirrors the untagged
/// `ArgValue` JSON form the diagnostics take on the wire).
fn arg_to_js(value: &ArgValue) -> JsValue {
    match value {
        ArgValue::Bool(b) => (*b).into(),
        ArgValue::Num(n) => (*n).into(),
        ArgValue::Str(s) => s.into(),
    }
}

/// Serializes any engine value (diagnostics, inspect envelope) to a JSON
/// string, mapping the (practically impossible) serialize failure to a thrown
/// JS error. Marshalling lives here, in the wasm-only layer.
pub(super) fn to_json<T: serde::Serialize>(value: &T) -> Result<String, JsValue> {
    serde_json::to_string(value).map_err(|e| JsValue::from_str(&e.to_string()))
}

/// Builds the `{ ok, pages, inspect, diagnostics }` JS object, serializing the
/// inspect envelope + diagnostics here (marshalling stays in the shim).
pub(super) fn outcome_to_js(outcome: &RenderOutcome) -> Result<Object, JsValue> {
    let obj = Object::new();
    Reflect::set(&obj, &"ok".into(), &outcome.prepared.is_some().into())?;
    let pages = pages_to_js(&outcome.pages)?;
    Reflect::set(&obj, &"pages".into(), &pages)?;
    let inspect = match &outcome.prepared {
        Some(prepared) => {
            let envelope = shojiku_authoring::inspect_envelope(prepared);
            JsValue::from_str(&to_json(&envelope)?)
        }
        None => JsValue::NULL,
    };
    Reflect::set(&obj, &"inspect".into(), &inspect)?;
    Reflect::set(
        &obj,
        &"diagnostics".into(),
        &JsValue::from_str(&to_json(&outcome.diagnostics)?),
    )?;
    Ok(obj)
}

/// Builds the `{ ok, pdf, diagnostics }` JS object for a PDF render. No
/// `inspect` part: the box index is a canvas concern the preview loop already
/// holds fresh, so serializing it per export would be pure cost. `pdf` is an
/// empty `Uint8Array` when a document error stopped the render — `ok` is the
/// field to branch on, and `diagnostics` explains it.
pub(super) fn pdf_to_js(outcome: &PdfOutcome) -> Result<Object, JsValue> {
    let obj = Object::new();
    Reflect::set(&obj, &"ok".into(), &outcome.prepared.is_some().into())?;
    Reflect::set(
        &obj,
        &"pdf".into(),
        &Uint8Array::from(outcome.pdf.as_slice()),
    )?;
    Reflect::set(
        &obj,
        &"diagnostics".into(),
        &JsValue::from_str(&to_json(&outcome.diagnostics)?),
    )?;
    Ok(obj)
}

/// Marshals pages: PNG → `Uint8Array[]`, raw → `{ width, height, rgba }[]`.
fn pages_to_js(pages: &Pages) -> Result<Array, JsValue> {
    let out = Array::new();
    match pages {
        Pages::Png(list) => {
            for png in list {
                out.push(&Uint8Array::from(png.as_slice()));
            }
        }
        Pages::Raw(list) => {
            for page in list {
                let obj = Object::new();
                Reflect::set(&obj, &"width".into(), &page.width_px.into())?;
                Reflect::set(&obj, &"height".into(), &page.height_px.into())?;
                Reflect::set(
                    &obj,
                    &"rgba".into(),
                    &Uint8Array::from(page.rgba.as_slice()),
                )?;
                out.push(&obj);
            }
        }
    }
    Ok(out)
}
