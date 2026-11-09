//! Unit tests for the device-space range check on drawn SVG paths.

use super::*;

fn square(side: f32) -> tiny_skia::Path {
    tiny_skia::PathBuilder::from_rect(
        tiny_skia::Rect::from_xywh(0.0, 0.0, side, side).expect("rect"),
    )
}

#[test]
fn a_path_within_the_device_range_is_drawn() {
    assert!(within_device_range(
        &square(1e3),
        Transform::from_scale(8.0, 8.0),
        0.0
    ));
    // The corner exactly at the limit is within it.
    assert!(within_device_range(
        &square(MAX_DEVICE_PX),
        Transform::identity(),
        0.0
    ));
}

#[test]
fn a_path_reaching_past_the_device_range_is_not_drawn() {
    // Past the limit by its geometry, by the transform scale, by the
    // translation, and only by its stroke.
    assert!(!within_device_range(
        &square(2e7),
        Transform::identity(),
        0.0
    ));
    assert!(!within_device_range(
        &square(1e7),
        Transform::from_scale(2.0, 2.0),
        0.0
    ));
    assert!(!within_device_range(
        &square(10.0),
        Transform::from_translate(0.0, -2e7),
        0.0
    ));
    assert!(within_device_range(
        &square(1.6e7),
        Transform::identity(),
        0.0
    ));
    assert!(!within_device_range(
        &square(1.6e7),
        Transform::identity(),
        1e6
    ));
}

#[test]
fn a_rotated_path_is_checked_at_its_mapped_corners() {
    // Unrotated, a 1.3e7 square is within the range; rotated 45 degrees its
    // far corner maps to about (0, 1.84e7), past it.
    assert!(within_device_range(
        &square(1.3e7),
        Transform::identity(),
        0.0
    ));
    assert!(!within_device_range(
        &square(1.3e7),
        Transform::from_rotate(45.0),
        0.0
    ));
}
