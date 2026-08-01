//! `shojiku-image` — image assets for the render pipeline.
//!
//! Owns everything between "an image was referenced" and "positioned,
//! validated bytes/vectors are ready to draw": source classification
//! (bundled file / data URI / inline SVG / remote URL), the host-side
//! [`AssetPolicy`] deciding which sources are acceptable per item, the
//! raster header checks, the SVG subset parser, and the [`AssetStore`]
//! that layout measures from and renderers draw from (mirroring how
//! `FontStore` is shared between those stages).

mod decode;
mod error;
mod geom;
mod policy;
mod prepare;
mod raster;
mod source;
mod store;
mod svg;

pub use decode::{decode_raster, RgbaImage};
pub use error::ImageError;
pub use geom::PathCmd;
pub use policy::{AssetMode, AssetPolicy};
pub use prepare::{
    asset_key, cell_asset_key, prepare_assets, prepare_assets_injected, MAX_CELL_IMAGE_ASSETS,
};
pub use raster::{checked_dimensions, sniff, RasterFormat};
pub use source::{classify, decode_data_uri, DataUriPayload, ImageSource};
pub use store::{Asset, AssetKind, AssetStore};
pub use svg::{
    parse_svg, GradientStop, GradientTransform, LinearGradient, RadialGradient, SpreadMode,
    SvgLimits, SvgPaint, SvgPath, SvgTree,
};
