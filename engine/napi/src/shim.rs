//! The N-API surface itself — the only part of this crate JavaScript sees.
//!
//! Compiled ONLY with the `shim` feature, which no workspace gate turns on,
//! so the marshalling glue stays out of the host test/clippy/coverage surface
//! exactly as `engine/wasm`'s wasm-bindgen shim does. `make napi` builds it
//! with the feature on and runs clippy over it in the same step.
//!
//! Two shapes and the reasons for them:
//!
//! * **Every lifecycle call is an [`AsyncTask`]**, so the work runs on the
//!   libuv threadpool and node's single event loop stays free for the length
//!   of a render. That is why the npm package's surface is async-only.
//!   `abiVersion` is the exception: it reads a constant and has nothing to
//!   hand off.
//! * **One task type over a [`Work`] enum**, rather than four tasks. The four
//!   operations differ only in which arguments they carry, and one `compute`
//!   is one place for the boundary to be crossed.
//!
//! Buffers are copied on the JS thread, before the hand-off: a `Buffer`
//! borrows V8 memory and is not `Send`, so what crosses to the worker is
//! owned bytes.

use crate::call;
use crate::outcome::Outcome;
use napi::bindgen_prelude::{AsyncTask, Buffer};
use napi::{Env, Result, Task};
use napi_derive::napi;

/// One operation's result, as the npm package receives it.
///
/// `status` and `success` both cross on purpose: the package raises for a
/// non-zero `status` (the caller's own mistake) and returns a failed result
/// for `success` false (a fact about a document, a pack or a key).
#[napi(object)]
pub struct JsOutcome {
    pub status: i32,
    pub success: bool,
    pub pdf: Buffer,
    pub json: String,
    pub diagnostics: String,
    pub error: String,
}

impl From<Outcome> for JsOutcome {
    fn from(outcome: Outcome) -> Self {
        JsOutcome {
            status: outcome.status,
            success: outcome.success,
            // Moves the bytes into V8's ownership rather than lending a
            // pointer — there is no handle left for JavaScript to outlive.
            pdf: outcome.pdf.into(),
            json: outcome.json,
            diagnostics: outcome.diagnostics,
            error: outcome.error,
        }
    }
}

/// Which operation a queued call will run, with its arguments owned.
pub enum Work {
    Info,
    Render(Vec<u8>),
    Sign {
        pdf: Vec<u8>,
        key: Vec<u8>,
        certificate: Vec<u8>,
        passphrase: Option<Vec<u8>>,
    },
    Verify {
        pdf: Vec<u8>,
        anchors: Vec<u8>,
    },
}

/// A queued call. One `Task` implementation covers the whole surface.
pub struct Call(Work);

impl Task for Call {
    type Output = Outcome;
    type JsValue = JsOutcome;

    fn compute(&mut self) -> Result<Outcome> {
        Ok(match &self.0 {
            Work::Info => call::engine_info(),
            Work::Render(request) => call::render(request),
            Work::Sign {
                pdf,
                key,
                certificate,
                passphrase,
            } => call::sign(pdf, key, certificate, passphrase.as_deref()),
            Work::Verify { pdf, anchors } => call::verify(pdf, anchors),
        })
    }

    fn resolve(&mut self, _env: Env, output: Outcome) -> Result<JsOutcome> {
        Ok(output.into())
    }
}

/// The ABI revision this addon was built against.
#[napi]
pub fn abi_version() -> u32 {
    call::abi_version()
}

/// This build's engine info: version, capability keys, builtin locales.
#[napi]
pub fn engine_info() -> AsyncTask<Call> {
    AsyncTask::new(Call(Work::Info))
}

/// Renders the document described by the request envelope.
#[napi]
pub fn render(request: Buffer) -> AsyncTask<Call> {
    AsyncTask::new(Call(Work::Render(request.to_vec())))
}

/// Signs already-rendered PDF bytes.
#[napi]
pub fn sign(
    pdf: Buffer,
    key: Buffer,
    certificate: Buffer,
    passphrase: Option<Buffer>,
) -> AsyncTask<Call> {
    AsyncTask::new(Call(Work::Sign {
        pdf: pdf.to_vec(),
        key: key.to_vec(),
        certificate: certificate.to_vec(),
        passphrase: passphrase.map(|bytes| bytes.to_vec()),
    }))
}

/// Verifies a signed PDF against caller-supplied trust anchors.
#[napi]
pub fn verify(pdf: Buffer, anchors: Buffer) -> AsyncTask<Call> {
    AsyncTask::new(Call(Work::Verify {
        pdf: pdf.to_vec(),
        anchors: anchors.to_vec(),
    }))
}
