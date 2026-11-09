//! Image `fit` math: the drawn size of an asset in its content box, held
//! to the layout length cap. Shared by image items and image table cells.

use shojiku_core::ImageFit;
use shojiku_diagnostics::{Diagnostic, DiagnosticCode as Code, Diagnostics};
use shojiku_layout_box::MAX_RESOLVED_PT;

/// `object-fit` math (CSS): the drawn size for an `iw × ih` asset in a
/// `cw × ch` content box. Aspect-preserving: `contain` fits inside
/// (letterbox), `cover` fills and overflows (min vs max scale).
fn fit_size(fit: ImageFit, (iw, ih): (f64, f64), cw: f64, ch: f64) -> (f64, f64) {
    match fit {
        ImageFit::Contain => {
            let scale = (cw / iw).min(ch / ih);
            (iw * scale, ih * scale)
        }
        ImageFit::Cover => {
            let scale = (cw / iw).max(ch / ih);
            (iw * scale, ih * scale)
        }
        ImageFit::Stretch => (cw, ch),
        ImageFit::None => (iw, ih),
    }
}

/// [`fit_size`], with a drawn width or height over [`MAX_RESOLVED_PT`]
/// replaced by the `contain` size and reported as `length_out_of_range`.
///
/// `none` draws an asset at its intrinsic size (an SVG viewBox unit or a
/// raster pixel per pt) and `cover` scales a long thin asset until its
/// shorter side fills the box, so its longer side can exceed the box many
/// times over: either can compute a drawn size larger than the content
/// box; the renderers scale every path and pixel by that size.
/// `contain` always fits inside the content box, whose own lengths are
/// already capped.
pub(super) fn fitted_size(
    fit: ImageFit,
    intrinsic: (f64, f64),
    cw: f64,
    ch: f64,
    diags: &mut Diagnostics,
) -> (f64, f64) {
    let (dw, dh) = fit_size(fit, intrinsic, cw, ch);
    let longer = dw.max(dh);
    if longer <= MAX_RESOLVED_PT {
        return (dw, dh);
    }
    diags.push(
        Diagnostic::new(Code::LengthOutOfRange)
            .arg("value", longer)
            .arg("max", MAX_RESOLVED_PT),
    );
    fit_size(ImageFit::Contain, intrinsic, cw, ch)
}

#[cfg(test)]
mod tests;
