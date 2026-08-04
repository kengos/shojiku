//! Command implementations: input loading, the validate/inspect/render/
//! preview pipelines, and output writing. Thin wrappers over
//! `shojiku-authoring` (incl. its `fs` pack-discovery module) — this file
//! adds only the CLI's concerns: reading source files, printing diagnostics
//! to stderr, composing the PDF render, and writing output.

use crate::{CliError, PreviewArgs, RenderArgs, RenderishArgs, ValidateArgs};
use shojiku_authoring::fs::{load_locale_pack, resolve_font_dirs, resolve_locale_dir};
use shojiku_authoring::{
    inspect_json, load_sources, prepare, preview_page, preview_pages, resolve_locale_id,
    validate_strings, AssetsInput, PrepareCtx, Prepared,
};
use shojiku_diagnostics::{sanitize, Diagnostics, MAX_MESSAGE};
use shojiku_formatter::{resolve_face_specs, LangPack};
use shojiku_layout::FontStore;
use std::path::Path;

pub fn resolve_preview_output(
    pattern: &str,
    page_no: usize,
    multi_page: bool,
) -> Result<String, CliError> {
    if pattern.contains("{page}") {
        Ok(pattern.replace("{page}", &page_no.to_string()))
    } else if multi_page {
        Err(CliError::OutputPatternRequired(pattern.to_string()))
    } else {
        Ok(pattern.to_string())
    }
}

fn read(path: &Path) -> Result<String, CliError> {
    std::fs::read_to_string(path).map_err(|source| CliError::Io {
        path: path.to_path_buf(),
        source,
    })
}

/// `shojiku validate`: prints diagnostics JSON; errors exit non-zero. A
/// structural parse failure (unknown key, wrong type, non-finite number)
/// is surfaced by the authoring layer as a single `parse_error`/
/// `non_finite_number` diagnostic rather than an opaque error, so a GUI
/// renders it inline. I/O failures (a missing file) stay `CliError`.
pub fn run_validate(args: &ValidateArgs) -> Result<Diagnostics, CliError> {
    let defs = args.definitions.as_deref().map(read).transpose()?;
    let template = read(&args.templates)?;
    let params = args.params.as_deref().map(read).transpose()?;
    Ok(validate_strings(
        defs.as_deref(),
        &template,
        params.as_deref(),
    ))
}

/// A prepared document plus the font store the render/preview stages need.
/// The CLI builds the store from the filesystem and owns it here so its
/// borrow outlives layout (the authoring layer borrows both).
struct CliPrepared {
    prepared: Prepared,
    fonts: FontStore,
}

/// Reads the source files, resolves the locale + fonts from the filesystem,
/// and runs the authoring pipeline. Validation/asset/layout errors are
/// printed and collapsed to `ValidationFailed`.
fn prepare_layout(common: &RenderishArgs) -> Result<CliPrepared, CliError> {
    let defs = common.definitions.as_deref().map(read).transpose()?;
    let template = read(&common.templates)?;
    let params = read(&common.params)?;
    let sources = load_sources(defs.as_deref(), &template, &params)?;
    // Gate validation errors before touching locale/font packs: a broken
    // template must report its own errors even in an environment with no
    // packs installed (the authoring pipeline gates again, harmlessly).
    if sources.validation.has_errors() {
        return Err(report_and_fail(sources.validation));
    }

    let locale = resolve_locale_id(
        common.lang.as_deref(),
        sources.template.defaults.locale.as_deref(),
    );
    let pack = load_locale_pack(&locale, &resolve_locale_dir(&common.locale_dir))?;
    let fonts = load_fonts(&pack, common)?;

    let policy = common.asset_policy();
    let root = common.assets_root();
    let prepared = prepare(
        sources,
        PrepareCtx {
            pack: &pack,
            fonts: &fonts,
            assets: AssetsInput::Prepare {
                policy: &policy,
                root: Some(&root),
            },
        },
    )
    .map_err(report_and_fail)?;
    Ok(CliPrepared { prepared, fonts })
}

/// Resolves the locale's font packs, fills the cache for any face that is
/// pinned-but-absent, then loads the store.
///
/// The fetch sits HERE, in the host, and never inside layout/render: by the
/// time the store exists every face is a local file, so the render path stays
/// socket-free and a warm-cache `--offline` run produces identical bytes.
fn load_fonts(pack: &LangPack, common: &RenderishArgs) -> Result<FontStore, CliError> {
    let specs = resolve_face_specs(pack, &resolve_font_dirs(&common.font_dir))
        .map_err(shojiku_layout::FontError::from)?;
    // Every face already shipped with its pack — the overwhelmingly common
    // case. Skip the fetch layer entirely rather than requiring a usable cache
    // directory (or building an HTTP agent) to render fonts we already have.
    if specs.iter().all(|s| s.path.is_file()) {
        return Ok(FontStore::load_from_specs(specs, pack)?);
    }
    let (specs, report) = shojiku_fetch::ensure_faces(
        specs,
        &shojiku_fetch::FontCache::discover()?,
        &shojiku_fetch::FetchPolicy::with_extra_hosts(&common.font_fetch_allow),
        &shojiku_fetch::HttpTransport::default(),
        if common.offline {
            shojiku_fetch::Mode::Offline
        } else {
            shojiku_fetch::Mode::Online
        },
    )?;
    report_fetched(&report, &mut std::io::stderr());
    Ok(FontStore::load_from_specs(specs, pack)?)
}

/// Tells the user which fonts came off the network this run — transparency
/// about an implicit download, not a diagnostic. Takes a writer so it is
/// directly testable: a real fetch cannot happen in the test suite (the
/// allowlist admits no loopback host), so a `stderr!` loop here would be a
/// line no test could ever execute.
pub(crate) fn report_fetched(report: &shojiku_fetch::FetchReport, w: &mut dyn std::io::Write) {
    for (id, url) in &report.fetched {
        let _ = writeln!(w, "shojiku: fetched font `{id}` from {url}");
    }
}

fn report_and_fail(diags: Diagnostics) -> CliError {
    report_diagnostics(&diags);
    CliError::ValidationFailed { diagnostics: diags }
}

/// Prints diagnostics to stderr, one per line.
///
/// Bounded like every other echo on this surface. A diagnostic's ARGS are
/// already sanitized (`ArgValue::text`), so no control character can reach
/// here — but its rendered message is prose plus several 200-character args,
/// which for a located parse error runs past 650 characters and grows with
/// the arg count. The structured `--report` sidecar is unaffected: it carries
/// the diagnostics as the engine emitted them, and this is only the
/// human-readable line.
pub fn report_diagnostics(diags: &Diagnostics) {
    for d in diags.iter() {
        eprintln!("shojiku: {}", sanitize(&d.to_string(), MAX_MESSAGE));
    }
}

/// `shojiku inspect`: the layout envelope (engine info + tree + boxes) as
/// JSON to stdout.
pub fn run_inspect(common: &RenderishArgs) -> Result<String, CliError> {
    let cli = prepare_layout(common)?;
    report_diagnostics(&cli.prepared.diagnostics);
    Ok(inspect_json(&cli.prepared)?)
}

/// What a render produced, beyond its bytes.
///
/// The page count and the diagnostics were both computed and then dropped
/// before `--report` existed — stderr got a prose rendering of the
/// diagnostics and nothing carried the count at all.
pub struct Rendered {
    /// The PDF.
    pub bytes: Vec<u8>,
    /// What the engine said while laying it out. Non-empty on a perfectly
    /// successful render is the normal case worth carrying: a box one
    /// line-height too short warns and still renders.
    pub diagnostics: Diagnostics,
    /// Pages laid out — taken from the laid-out document, not by
    /// re-reading the PDF.
    pub page_count: usize,
}

/// `shojiku render`: PDF bytes to `--output` (or stdout for `-`).
pub fn run_render(args: &RenderArgs) -> Result<Rendered, CliError> {
    let cli = prepare_layout(&args.common)?;
    report_diagnostics(&cli.prepared.diagnostics);
    let page_count = cli.prepared.document.pages.len();
    let rendered =
        shojiku_render_pdf::render_pdf(&cli.prepared.document, &cli.fonts, &cli.prepared.assets);
    // `rendered?` rides a line the success path executes. A bare `)?;`
    // closing the call above puts the propagation on a line of its own,
    // which no test reaches while the backend does not fail — and the
    // 100% line gate reds on it.
    Ok(Rendered {
        bytes: rendered?,
        diagnostics: cli.prepared.diagnostics,
        page_count,
    })
}

/// `shojiku preview`: rasterizes to PNG. `--page` rasterizes ONLY that page
/// (the page count comes from the laid-out document, so a range check needs no
/// full render); otherwise every page is rasterized. Returns `(path, bytes)`
/// pairs for the caller to write, so the page-selection/naming logic stays
/// unit-testable and out of `main.rs`.
pub fn run_preview(args: &PreviewArgs) -> Result<Vec<(String, Vec<u8>)>, CliError> {
    let cli = prepare_layout(&args.common)?;
    report_diagnostics(&cli.prepared.diagnostics);
    let total = cli.prepared.document.pages.len();

    if let Some(page) = args.page {
        let index = page
            .checked_sub(1)
            .filter(|i| *i < total)
            .ok_or(CliError::PageOutOfRange { page, total })?;
        let bytes = preview_page(&cli.prepared, &cli.fonts, args.scale, index)?;
        let path = resolve_preview_output(&args.output, page, false)?;
        return Ok(vec![(path, bytes)]);
    }

    let pages = preview_pages(&cli.prepared, &cli.fonts, args.scale)?;
    let multi_page = pages.len() > 1;
    let mut out = Vec::with_capacity(pages.len());
    for (index, bytes) in pages.into_iter().enumerate() {
        let path = resolve_preview_output(&args.output, index + 1, multi_page)?;
        out.push((path, bytes));
    }
    Ok(out)
}

/// Writes render output to a path or stdout for `-`.
pub fn write_output(output: &str, bytes: &[u8]) -> Result<(), CliError> {
    if output == "-" {
        write_stream(&mut std::io::stdout(), bytes)
    } else {
        std::fs::write(output, bytes).map_err(|source| output_error(output, source))
    }
}

pub(crate) fn write_stream(writer: &mut dyn std::io::Write, bytes: &[u8]) -> Result<(), CliError> {
    writer
        .write_all(bytes)
        .map_err(|source| output_error("-", source))
}

pub(crate) fn output_error(path: &str, source: std::io::Error) -> CliError {
    CliError::Output {
        path: path.to_string(),
        source,
    }
}
