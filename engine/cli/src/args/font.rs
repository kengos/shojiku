//! Flags for the `font` command — creating a user font pack on disk.
//!
//! The only CLI surface that WRITES anything but its own `--output`, so the
//! flags are shaped to make each write deliberate: what family the face
//! joins, under what licence, and — when the font's own `fsType` forbids
//! embedding — an explicit attestation rather than a default.

use clap::{Args, Subcommand, ValueEnum};
use shojiku_core::{FontStyle, FontWeight};
use std::path::PathBuf;

#[derive(Debug, Subcommand)]
pub enum FontCommand {
    /// Add a font file to a font pack, creating the pack if needed.
    ///
    /// Writes `<font-dir>/<pack>/manifest.yml` and copies the face beside
    /// it, pinning the file's sha256 so a later render fails loudly if the
    /// bytes ever change. Rendering with the pack needs `--font-pack <id>`
    /// (or a locale whose `fonts.uses` names it) — a pack is never picked
    /// up implicitly, because what fonts a document used has to be an
    /// input, not a property of the directory it rendered in.
    Add(FontAddArgs),
}

#[derive(Debug, Args)]
pub struct FontAddArgs {
    /// The font file to add (`.ttf` / `.otf`). Copied into the pack.
    pub file: PathBuf,
    /// Font family id — what a template's `style.fontFamily` names. Faces
    /// sharing it are variant-selected by weight/style. Letters, digits,
    /// `-` and `_`, 1–64 characters.
    #[arg(long)]
    pub family: String,
    /// Licence id covering every face in this pack, e.g. `OFL-1.1` or a
    /// vendor's own. One licence per pack: mixed-licence fonts go in
    /// separate packs.
    #[arg(long)]
    pub license: String,
    /// Pack id — the directory name under the font dir. Defaults to the
    /// family id.
    #[arg(long)]
    pub pack: Option<String>,
    /// Face id, unique within the flat global namespace. Defaults to the
    /// family id plus a `-bold` / `-italic` / `-bold-italic` suffix.
    #[arg(long = "face-id")]
    pub face_id: Option<String>,
    /// This face's weight.
    #[arg(long, value_enum, default_value_t = FontWeightArg::Normal)]
    pub weight: FontWeightArg,
    /// This face's slant.
    #[arg(long, value_enum, default_value_t = FontStyleArg::Normal)]
    pub style: FontStyleArg,
    /// Where a host may fetch this face when the file is absent — recorded
    /// as the manifest's `url:` hint. The sha256 stays the guarantee.
    #[arg(long)]
    pub url: Option<String>,
    /// Licence text file to copy into the pack beside the faces.
    #[arg(long = "license-file")]
    pub license_file: Option<PathBuf>,
    /// Mark the pack redistributable (may be bundled into images and
    /// tarballs). Off by default: a licensed font usually may not be.
    #[arg(long)]
    pub redistributable: bool,
    /// Assert a separately-held embedding licence for a face whose OS/2
    /// `fsType` says Restricted. Without it such a face is refused, since
    /// the engine would refuse to render with it anyway.
    #[arg(long = "embedding-attested")]
    pub embedding_attested: bool,
    /// Font dir to create the pack in. Defaults to the first resolved font
    /// dir ($SHOJIKU_FONT_DIR, else ./packs/fonts).
    #[arg(long)]
    pub dir: Option<PathBuf>,
}

/// CLI mirror of [`FontWeight`] (kept separate so shojiku-core stays free
/// of clap), exactly as `AssetModeArg` mirrors `AssetMode`.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, ValueEnum)]
pub enum FontWeightArg {
    #[default]
    Normal,
    Bold,
}

/// CLI mirror of [`FontStyle`].
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, ValueEnum)]
pub enum FontStyleArg {
    #[default]
    Normal,
    Italic,
}

impl From<FontWeightArg> for FontWeight {
    fn from(weight: FontWeightArg) -> Self {
        match weight {
            FontWeightArg::Normal => FontWeight::Normal,
            FontWeightArg::Bold => FontWeight::Bold,
        }
    }
}

impl From<FontStyleArg> for FontStyle {
    fn from(style: FontStyleArg) -> Self {
        match style {
            FontStyleArg::Normal => FontStyle::Normal,
            FontStyleArg::Italic => FontStyle::Italic,
        }
    }
}
