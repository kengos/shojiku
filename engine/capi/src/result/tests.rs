//! Tests for the handle: what each constructor puts in it, what the
//! accessors lend back, and the free discipline the whole ABI rests on.

use super::*;
use crate::status::{SHOJIKU_ERR_NULL_ARG, SHOJIKU_ERR_OUT_OF_RANGE, SHOJIKU_OK};

/// A buffer accessor's C signature, so one helper can drive all four.
type BufferAccessor = unsafe extern "C" fn(*const ShojikuResult, *mut *const u8, *mut usize) -> i32;

/// Calls a buffer accessor and copies out what it lent.
fn read(accessor: BufferAccessor, handle: *const ShojikuResult) -> (i32, Vec<u8>) {
    let mut ptr: *const u8 = std::ptr::null();
    let mut len: usize = 0;
    // SAFETY: `handle` is a live handle from `into_raw`, and both
    // out-parameters are local slots of the right type.
    let status = unsafe { accessor(handle, &mut ptr, &mut len) };
    if status != SHOJIKU_OK || len == 0 {
        return (status, Vec::new());
    }
    // SAFETY: the accessor reported `len` readable bytes at `ptr`, borrowed
    // from a handle that is still alive here.
    (
        status,
        unsafe { std::slice::from_raw_parts(ptr, len) }.to_vec(),
    )
}

/// Every way an accessor can be called wrong, for one buffer accessor.
fn assert_refuses_nulls(accessor: BufferAccessor, handle: *const ShojikuResult) {
    let mut ptr: *const u8 = std::ptr::null();
    let mut len: usize = 0;
    // SAFETY: passing null where the contract allows it to be checked.
    unsafe {
        assert_eq!(
            accessor(std::ptr::null(), &mut ptr, &mut len),
            SHOJIKU_ERR_NULL_ARG,
            "a null handle must be refused"
        );
        assert_eq!(
            accessor(handle, std::ptr::null_mut(), &mut len),
            SHOJIKU_ERR_NULL_ARG,
            "a null out-pointer must be refused"
        );
        assert_eq!(
            accessor(handle, &mut ptr, std::ptr::null_mut()),
            SHOJIKU_ERR_NULL_ARG,
            "a null out-length must be refused"
        );
    }
}

#[test]
fn a_json_result_carries_only_its_payload() {
    let result = ShojikuResult::json("{\"version\":\"0.1.0\"}".into());
    assert_eq!(result.success_for_test(), 1);
    assert_eq!(result.json_for_test(), "{\"version\":\"0.1.0\"}");
    assert!(result.pdf_for_test().is_empty());
    assert!(result.pages_for_test().is_empty());
    assert!(result.error_for_test().is_empty());
}

#[test]
fn the_document_constructors_each_carry_their_own_payload() {
    let validated = ShojikuResult::diagnostics("{\"items\":[]}".into());
    assert_eq!(validated.success_for_test(), 1);
    assert_eq!(validated.diagnostics_for_test(), "{\"items\":[]}");

    let rendered = ShojikuResult::pdf(b"%PDF-1.7".to_vec(), "{\"items\":[]}".into());
    assert_eq!(rendered.pdf_for_test(), b"%PDF-1.7");
    assert_eq!(rendered.diagnostics_for_test(), "{\"items\":[]}");

    let previewed = ShojikuResult::pages(vec![b"one".to_vec(), b"two".to_vec()], "[]".into());
    assert_eq!(previewed.pages_for_test().len(), 2);
    assert_eq!(previewed.success_for_test(), 1);

    let verified = ShojikuResult::report("{\"valid\":true}".into(), "{\"items\":[]}".into());
    assert_eq!(verified.success_for_test(), 1);
    assert_eq!(verified.json_for_test(), "{\"valid\":true}");
    assert_eq!(verified.diagnostics_for_test(), "{\"items\":[]}");
}

#[test]
fn a_json_payload_can_be_attached_to_a_result_built_some_other_way() {
    // Two operations need this, and the second is the load-bearing one. A
    // render adds its page count beside the bytes; a FAILED verification
    // still owes the caller the report, because that is what names the
    // checks this release never performed. Dropping it on a failure is how
    // a missing capability becomes a promise nobody made.
    let rendered = ShojikuResult::pdf(b"%PDF-1.7".to_vec(), "{\"items\":[]}".into())
        .with_json("{\"pageCount\":3}".into());
    assert_eq!(rendered.success_for_test(), 1);
    assert_eq!(rendered.pdf_for_test(), b"%PDF-1.7");
    assert_eq!(rendered.json_for_test(), "{\"pageCount\":3}");

    let refused = ShojikuResult::failed(None, "{\"kind\":\"signature\"}".into())
        .with_json("{\"valid\":false}".into());
    assert_eq!(refused.success_for_test(), 0);
    assert_eq!(refused.json_for_test(), "{\"valid\":false}");
    assert_eq!(refused.error_for_test(), "{\"kind\":\"signature\"}");
}

#[test]
fn a_failed_result_is_unsuccessful_with_or_without_diagnostics() {
    let with = ShojikuResult::failed(Some("{\"items\":[1]}".into()), "{}".into());
    assert_eq!(with.success_for_test(), 0);
    assert_eq!(with.diagnostics_for_test(), "{\"items\":[1]}");

    let without = ShojikuResult::failed(None, "{}".into());
    assert_eq!(without.success_for_test(), 0);
    assert!(without.diagnostics_for_test().is_empty());
}

#[test]
fn every_buffer_accessor_lends_its_own_field_and_refuses_nulls() {
    let handle = ShojikuResult::pdf(b"%PDF-bytes".to_vec(), "{\"items\":[]}".into()).into_raw();

    assert_eq!(read(shojiku_result_pdf, handle).1, b"%PDF-bytes");
    assert_eq!(
        read(shojiku_result_diagnostics_json, handle).1,
        b"{\"items\":[]}"
    );
    // Empty fields lend an empty buffer rather than failing.
    assert_eq!(read(shojiku_result_json, handle), (SHOJIKU_OK, Vec::new()));
    assert_eq!(
        read(shojiku_result_error_json, handle),
        (SHOJIKU_OK, Vec::new())
    );

    for accessor in [
        shojiku_result_pdf as BufferAccessor,
        shojiku_result_json,
        shojiku_result_diagnostics_json,
        shojiku_result_error_json,
    ] {
        assert_refuses_nulls(accessor, handle);
    }

    // SAFETY: a live handle from `into_raw`, freed exactly once.
    unsafe { shojiku_result_free(handle) };
}

#[test]
fn success_and_page_count_read_back_through_their_out_parameters() {
    let handle = ShojikuResult::pages(vec![b"a".to_vec(), b"b".to_vec()], "[]".into()).into_raw();
    let mut success: i32 = -1;
    let mut count: usize = 0;
    // SAFETY: a live handle and two local out-slots.
    unsafe {
        assert_eq!(shojiku_result_success(handle, &mut success), SHOJIKU_OK);
        assert_eq!(shojiku_result_page_count(handle, &mut count), SHOJIKU_OK);
        // Both refuse a null handle and a null out-slot.
        assert_eq!(
            shojiku_result_success(std::ptr::null(), &mut success),
            SHOJIKU_ERR_NULL_ARG
        );
        assert_eq!(
            shojiku_result_success(handle, std::ptr::null_mut()),
            SHOJIKU_ERR_NULL_ARG
        );
        assert_eq!(
            shojiku_result_page_count(std::ptr::null(), &mut count),
            SHOJIKU_ERR_NULL_ARG
        );
        assert_eq!(
            shojiku_result_page_count(handle, std::ptr::null_mut()),
            SHOJIKU_ERR_NULL_ARG
        );
    }
    assert_eq!(success, 1);
    assert_eq!(count, 2);
    // SAFETY: freed exactly once.
    unsafe { shojiku_result_free(handle) };
}

#[test]
fn a_page_is_read_by_index_and_past_the_end_says_so() {
    let handle =
        ShojikuResult::pages(vec![b"first".to_vec(), b"second".to_vec()], "[]".into()).into_raw();
    let mut ptr: *const u8 = std::ptr::null();
    let mut len: usize = 0;
    // SAFETY: a live handle and two local out-slots.
    unsafe {
        assert_eq!(
            shojiku_result_page_png(handle, 1, &mut ptr, &mut len),
            SHOJIKU_OK
        );
        assert_eq!(std::slice::from_raw_parts(ptr, len), b"second");
        // Past the end is its own status, not a null buffer the caller has
        // to interpret.
        assert_eq!(
            shojiku_result_page_png(handle, 2, &mut ptr, &mut len),
            SHOJIKU_ERR_OUT_OF_RANGE
        );
        assert_eq!(
            shojiku_result_page_png(std::ptr::null(), 0, &mut ptr, &mut len),
            SHOJIKU_ERR_NULL_ARG
        );
        assert_eq!(
            shojiku_result_page_png(handle, 0, std::ptr::null_mut(), &mut len),
            SHOJIKU_ERR_NULL_ARG
        );
        shojiku_result_free(handle);
    }
}

#[test]
fn freeing_null_is_a_no_op() {
    // An SDK's ensure/finally block frees whatever it has, and after a failed
    // call that is null. Making it legal is what keeps the release path in
    // one place in every binding.
    // SAFETY: a null handle is explicitly a no-op.
    unsafe { shojiku_result_free(std::ptr::null_mut()) };
}
