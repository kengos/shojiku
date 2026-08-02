//! Reading a result handle from C, and freeing it.
//!
//! Every accessor takes the handle plus out-parameters and returns a status,
//! so a binding has one calling convention to learn instead of one per field,
//! and no accessor has to reserve a value to mean "failed".
//!
//! Buffer accessors LEND: the pointer they write borrows the handle's own
//! bytes and is valid until `shojiku_result_free`. A caller that wants the
//! bytes to outlive the handle copies them, which every one of the four FFI
//! SDKs does anyway on its way to a native string or byte array.
//!
//! # Safety (shared by every function here)
//!
//! `result` must be a handle this library returned and has not yet been
//! passed to `shojiku_result_free`; each out-parameter must be null or point
//! at one writable slot of its type. Nothing here can detect a handle that
//! was already freed — that is the caller's discipline, stated again in
//! `include/shojiku.h`.

use super::ShojikuResult;
use crate::status::{shield_status, SHOJIKU_ERR_NULL_ARG, SHOJIKU_ERR_OUT_OF_RANGE, SHOJIKU_OK};

/// Whether the operation produced what was asked for: 1 or 0.
///
/// # Safety
///
/// See the module-level contract.
#[no_mangle]
pub unsafe extern "C" fn shojiku_result_success(
    result: *const ShojikuResult,
    out: *mut i32,
) -> i32 {
    shield_status(&mut || {
        // SAFETY: the caller's contract covers `result`; `out` is checked
        // before it is written.
        let (Some(result), false) = (unsafe { result.as_ref() }, out.is_null()) else {
            return SHOJIKU_ERR_NULL_ARG;
        };
        // SAFETY: `out` is non-null (checked above) and the caller guarantees
        // it points at one writable `int32_t`.
        unsafe { *out = result.success };
        SHOJIKU_OK
    })
}

/// The rendered or signed PDF bytes. Empty when the operation produced none.
///
/// # Safety
///
/// See the module-level contract.
#[no_mangle]
pub unsafe extern "C" fn shojiku_result_pdf(
    result: *const ShojikuResult,
    out_ptr: *mut *const u8,
    out_len: *mut usize,
) -> i32 {
    // SAFETY: the caller's contract; `buffer` checks every pointer it writes.
    shield_status(&mut || unsafe { buffer(result, out_ptr, out_len, |r| &r.pdf) })
}

/// The operation's JSON payload (engine info), as UTF-8 bytes.
///
/// # Safety
///
/// See the module-level contract.
#[no_mangle]
pub unsafe extern "C" fn shojiku_result_json(
    result: *const ShojikuResult,
    out_ptr: *mut *const u8,
    out_len: *mut usize,
) -> i32 {
    // SAFETY: as above.
    shield_status(&mut || unsafe { buffer(result, out_ptr, out_len, |r| r.json.as_bytes()) })
}

/// The engine's diagnostics as JSON, as UTF-8 bytes. Present on success too —
/// a render that worked can still have warnings.
///
/// # Safety
///
/// See the module-level contract.
#[no_mangle]
pub unsafe extern "C" fn shojiku_result_diagnostics_json(
    result: *const ShojikuResult,
    out_ptr: *mut *const u8,
    out_len: *mut usize,
) -> i32 {
    // SAFETY: as above.
    shield_status(&mut || unsafe { buffer(result, out_ptr, out_len, |r| r.diagnostics.as_bytes()) })
}

/// The `{step, kind, message}` cause as JSON, as UTF-8 bytes. Empty on
/// success.
///
/// # Safety
///
/// See the module-level contract.
#[no_mangle]
pub unsafe extern "C" fn shojiku_result_error_json(
    result: *const ShojikuResult,
    out_ptr: *mut *const u8,
    out_len: *mut usize,
) -> i32 {
    // SAFETY: as above.
    shield_status(&mut || unsafe { buffer(result, out_ptr, out_len, |r| r.error.as_bytes()) })
}

/// How many preview pages the result carries.
///
/// # Safety
///
/// See the module-level contract.
#[no_mangle]
pub unsafe extern "C" fn shojiku_result_page_count(
    result: *const ShojikuResult,
    out: *mut usize,
) -> i32 {
    shield_status(&mut || {
        // SAFETY: the caller's contract covers `result`; `out` is checked
        // before it is written.
        let (Some(result), false) = (unsafe { result.as_ref() }, out.is_null()) else {
            return SHOJIKU_ERR_NULL_ARG;
        };
        // SAFETY: `out` is non-null (checked above).
        unsafe { *out = result.pages.len() };
        SHOJIKU_OK
    })
}

/// One preview page's PNG bytes, by 0-based index.
///
/// # Safety
///
/// See the module-level contract.
#[no_mangle]
pub unsafe extern "C" fn shojiku_result_page_png(
    result: *const ShojikuResult,
    index: usize,
    out_ptr: *mut *const u8,
    out_len: *mut usize,
) -> i32 {
    shield_status(&mut || {
        // SAFETY: the caller's contract covers `result`.
        let Some(result) = (unsafe { result.as_ref() }) else {
            return SHOJIKU_ERR_NULL_ARG;
        };
        let Some(page) = result.pages.get(index) else {
            return SHOJIKU_ERR_OUT_OF_RANGE;
        };
        // SAFETY: `write` checks both out-parameters before writing them.
        unsafe { write(page, out_ptr, out_len) }
    })
}

/// Frees a result handle. A null pointer is a no-op, and every pointer any
/// accessor lent from this handle becomes invalid here.
///
/// # Safety
///
/// See the module-level contract. Freeing the same handle twice is undefined
/// behaviour, as it is for any C allocator.
#[no_mangle]
pub unsafe extern "C" fn shojiku_result_free(result: *mut ShojikuResult) {
    // Shielded like every other entry point that runs code. Dropping our own
    // buffers has no panic in it today, but "the destructor cannot panic" is
    // a claim about every type the handle will ever carry, and this is the
    // one call an SDK makes from inside an ensure/finally block — the worst
    // possible place to unwind from.
    let _ = shield_status(&mut || {
        if result.is_null() {
            return SHOJIKU_OK;
        }
        // SAFETY: non-null (checked above) and, by the caller's contract, a
        // handle from `ShojikuResult::into_raw` that has not been freed.
        // Taking it back into its Box drops the allocation exactly once.
        drop(unsafe { Box::from_raw(result) });
        SHOJIKU_OK
    });
}

/// The shared body of the buffer accessors: borrow the handle, pick the
/// field, write it out. `pick` is a function pointer rather than a generic
/// parameter so this exists once in the binary.
///
/// # Safety
///
/// See the module-level contract.
unsafe fn buffer(
    result: *const ShojikuResult,
    out_ptr: *mut *const u8,
    out_len: *mut usize,
    pick: fn(&ShojikuResult) -> &[u8],
) -> i32 {
    // SAFETY: the caller's contract covers `result`.
    let Some(result) = (unsafe { result.as_ref() }) else {
        return SHOJIKU_ERR_NULL_ARG;
    };
    // SAFETY: `write` checks both out-parameters before writing them.
    unsafe { write(pick(result), out_ptr, out_len) }
}

/// Writes a borrowed slice out as `(pointer, length)`.
///
/// # Safety
///
/// See the module-level contract.
unsafe fn write(bytes: &[u8], out_ptr: *mut *const u8, out_len: *mut usize) -> i32 {
    if out_ptr.is_null() || out_len.is_null() {
        return SHOJIKU_ERR_NULL_ARG;
    }
    // SAFETY: both out-parameters are non-null (checked above) and the caller
    // guarantees each points at one writable slot of its type. The pointer
    // written borrows the handle and is documented to die with it.
    unsafe {
        *out_ptr = bytes.as_ptr();
        *out_len = bytes.len();
    }
    SHOJIKU_OK
}
