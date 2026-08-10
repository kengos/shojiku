//! The closed diagnostic-code registry.
//!
//! [`DiagnosticCode`] is the engine's stable, append-only contract with
//! translating consumers (the React GUI's ICU catalog keys off it). Being a
//! closed enum, the compiler enforces uniqueness and hands us the registry
//! for free: every code's [`Severity`](crate::Severity), [`Category`], and
//! English message template lives here in one table, so a code's message can
//! never drift from its declared args. **Codes and their per-code arg keys
//! (the `{placeholder}`s in each template) are frozen once shipped** — add
//! new codes, never rename or repurpose an existing one.

use crate::category::Category;
use crate::Severity;

/// Expands one table into the [`DiagnosticCode`] enum plus its accessors.
macro_rules! diagnostic_codes {
    ($( $variant:ident = $wire:literal, $sev:ident, $cat:ident, $template:literal; )*) => {
        /// A stable, machine-readable diagnostic identifier.
        #[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
        pub enum DiagnosticCode {
            $( #[doc = $wire] $variant, )*
        }

        impl DiagnosticCode {
            /// Every code, for registry enumeration and exhaustiveness tests.
            pub const ALL: &'static [DiagnosticCode] = &[ $( DiagnosticCode::$variant, )* ];

            /// The stable wire string — the ICU catalog key.
            pub fn as_str(self) -> &'static str {
                match self { $( DiagnosticCode::$variant => $wire, )* }
            }

            /// The default severity carried by this code.
            pub fn severity(self) -> Severity {
                match self { $( DiagnosticCode::$variant => Severity::$sev, )* }
            }

            /// The semantic (re-categorizable) domain of this code.
            pub fn category(self) -> Category {
                match self { $( DiagnosticCode::$variant => Category::$cat, )* }
            }

            /// The English message template, with `{arg}` placeholders.
            pub fn template(self) -> &'static str {
                match self { $( DiagnosticCode::$variant => $template, )* }
            }

            /// Parses a wire string back into a code, if known.
            pub fn from_wire(s: &str) -> Option<DiagnosticCode> {
                match s { $( $wire => Some(DiagnosticCode::$variant), )* _ => None }
            }
        }
    };
}

diagnostic_codes! {
    // Parse (located errors mapped from CoreError).
    ParseError = "parse_error", Error, Parse, "failed to parse {what} at `{path}`: {detail}";
    NonFiniteNumber = "non_finite_number", Error, Parse, "{what} contains non-finite numbers (NaN/Infinity), which are not allowed";

    // Data — bindings, params, image sources.
    UnknownDataKey = "unknown_data_key", Error, Data, "data key `{key}` is not declared in {source}";
    UnknownFormat = "unknown_format", Error, Data, "format `{format}` is not declared for `{key}`";
    MissingData = "missing_data", Warning, Data, "params do not contain {scope}`{key}`";
    UnusedBinding = "unused_binding", Warning, Data, "binding declaration `{name}` is not used by any interpolated text in this item";
    BindingShadowsKey = "binding_shadows_key", Warning, Data, "binding declaration `{name}` shadows a data key of the same name; the declaration wins";
    InvalidBindingName = "invalid_binding_name", Warning, Data, "binding declaration `{name}` can never be referenced: an interpolation name accepts only A-Z a-z 0-9 _ .";
    InterpolationKeyCharset = "interpolation_key_charset", Warning, Data, "`{text}` prints literally: an interpolation key accepts only A-Z a-z 0-9 _ . — declare a name under `bindings` to bind this key";
    NotAnArray = "not_an_array", Error, Data, "`{key}` is not an array";
    EmptyDefinitions = "empty_definitions", Warning, Data, "definitions declares no properties; every binding will be reported as an unknown key — check the top-level structure of the file";
    ImageSourceConflict = "image_source_conflict", Error, Data, "image items must set either `src` or `data`, not both";
    ImageSourceMissing = "image_source_missing", Error, Data, "image items need `src` or `data`";
    ColumnContentConflict = "column_content_conflict", Error, Data, "table columns render either `data` or `cell`, not both (`{key}` is inert on a `cell` column); `cell` wins";
    ColumnContentMissing = "column_content_missing", Error, Data, "table columns need `data` or `cell`";
    EmptyImageItem = "empty_image_item", Warning, Data, "image item has neither `src` nor `data`";
    EmptyTextItem = "empty_text_item", Warning, Data, "text item has neither `text` nor `data`";
    EmptyCharGridItem = "empty_char_grid_item", Warning, Data, "char_grid item has neither `text` nor `data`";
    EmptyQrCodeItem = "empty_qr_code_item", Warning, Data, "qr_code has no content to encode";
    RubyMarkupInvalid = "ruby_markup_invalid", Warning, Data, "{detail}";
    AozoraNoteIgnored = "aozora_note_ignored", Warning, Data, "aozora note `{note}` is not one the engine acts on; it renders literally";
    MarkContentConflict = "mark_content_conflict", Warning, Data, "checkbox sets both `checked` and `data`; `data` wins";
    MarkBindingNotBoolean = "mark_binding_not_boolean", Warning, Data, "`{key}` is not a boolean field; a mark without `equals` expects one";
    MarkEqualsTypeMismatch = "mark_equals_type_mismatch", Warning, Data, "`{key}` value type differs from `equals`; mark not drawn";
    MarkEqualsNotDeclared = "mark_equals_not_declared", Warning, Data, "`{key}` declares an `enum` that does not list this `equals` value; the mark can never be drawn";
    MarkValueNotBool = "mark_value_not_bool", Warning, Data, "`{key}` is not a boolean; mark not drawn";
    RowConditionNotBoolean = "row_condition_not_boolean", Warning, Data, "`{key}` is not a boolean field; a row condition without `equals` expects one";
    RowConditionTypeMismatch = "row_condition_type_mismatch", Warning, Data, "`{key}` value type differs from `equals`; row style not applied";
    RowConditionEqualsNotDeclared = "row_condition_equals_not_declared", Warning, Data, "`{key}` declares an `enum` that does not list this `equals` value; the row style can never apply";
    RowConditionValueNotBool = "row_condition_value_not_bool", Warning, Data, "`{key}` is not a boolean; row style not applied";
    EmptyLinkUrl = "empty_link_url", Warning, Data, "link URL is empty; link dropped";
    UnsupportedLinkScheme = "unsupported_link_scheme", Warning, Data, "link URL must be http/https/mailto/tel without control characters; link dropped";
    DocumentMetadataControlChars = "document_metadata_control_chars", Warning, Data, "`document.{key}` contains control characters; it is not written to the PDF";
    DocumentMetadataTooLong = "document_metadata_too_long", Warning, Data, "`document.{key}` is over {max} bytes; it is not written to the PDF";
    InvalidDocumentLanguage = "invalid_document_language", Warning, Data, "`document.{key}` is not a language tag (only A-Z a-z 0-9 and `-`); it is not written to the PDF";
    ParamsMissingRequired = "params_missing_required", Warning, Data, "params do not contain required key `{key}`";
    ParamsTypeMismatch = "params_type_mismatch", Warning, Data, "`{key}` expects {expected}, got {actual}";
    ParamsOutOfRange = "params_out_of_range", Warning, Data, "`{key}` value {value} is {relation} {limit}";
    ParamsLengthOutOfRange = "params_length_out_of_range", Warning, Data, "`{key}` {kind} {count} is {relation} {limit}";
    ParamsEnumMismatch = "params_enum_mismatch", Warning, Data, "`{key}` value is not one of the declared `enum` values";
    ParamsUnknownKey = "params_unknown_key", Warning, Data, "params key `{key}` is not declared in definitions";
    DefinitionsFormatIgnored = "definitions_format_ignored", Warning, Data, "`{key}`: format `{format}` does not apply to type `{type}`; treated as plain {type}";
    DefinitionsEnumLabelsIgnored = "definitions_enum_labels_ignored", Warning, Data, "`{key}`: `enum` value labels apply to plain text fields only; `{type}` values render unlabeled";

    // Style — style registry, named styles, spans.
    SpanContentConflict = "span_content_conflict", Warning, Style, "conflicting content keys on this item; {winner} takes precedence";
    EmptySpan = "empty_span", Warning, Style, "span has neither `text` nor `data`";
    EmptyRubyEntry = "empty_ruby_entry", Warning, Style, "ruby entry needs a non-empty `base` and `text`; entry skipped";
    RubyEntryTooLong = "ruby_entry_too_long", Warning, Style, "ruby `base`/`text` is longer than {max} characters; entry skipped";
    IgnoredSpanStyle = "ignored_span_style", Warning, Style, "span style keys have no effect on spans: {keys}";
    ShapeStyleIgnored = "shape_style_ignored", Warning, Style, "style keys have no effect on a {item}: {keys}";
    ShapeBorderSidesIgnored = "shape_border_sides_ignored", Warning, Style, "a {item} draws a uniform border; per-side values reduce to the top side";
    UndefinedStyleName = "undefined_style_name", Warning, Style, "styleName `{name}` is not defined in the `styles` registry";
    InvalidColor = "invalid_color", Warning, Style, "`{value}` is not a #rrggbb color; {fallback}";

    // Format — formatter degradations.
    FormatError = "format_error", Warning, Format, "`{key}`: {detail}";
    UnknownFormatVariant = "unknown_format_variant", Warning, Format, "`{key}`: {detail}";
    UnknownCurrency = "unknown_currency", Warning, Format, "`{key}`: {detail}";
    UnknownUnit = "unknown_unit", Warning, Format, "`{key}`: {detail}";
    FormatPatternIgnored = "format_pattern_ignored", Warning, Format, "inline pattern on `{key}` ignored; patterns apply only to date/datetime";
    ReservedFormatName = "reserved_format_name", Error, Format, "`{name}` is a field type name and cannot name a format";

    // Font.
    UnknownFontFamily = "unknown_font_family", Warning, Font, "fontFamily `{family}` matches no loaded family or face id; using the default face";
    MissingGlyph = "missing_glyph", Warning, Font, "font `{font}` has no glyph for these characters, which render as blank boxes: {chars}";

    // Asset.
    MissingAsset = "missing_asset", Warning, Asset, "image asset `{key}` was not loaded; item skipped";
    SvgUnsupported = "svg_unsupported", Warning, Asset, "image asset: {detail}";
    InvalidImageAsset = "invalid_image_asset", Error, Asset, "{detail}";
    InvalidImageData = "invalid_image_data", Warning, Asset, "{detail}";
    DynamicImageDenied = "dynamic_image_denied", Error, Asset, "the asset policy denies dynamic image content{scope}";
    RemoteAssetUnsupported = "remote_asset_unsupported", Error, Asset, "remote image `{url}` is not fetched by the engine; bundle the file with the template instead";
    AssetsRootMissing = "assets_root_missing", Error, Asset, "no assets directory is configured; cannot resolve `{path}`";
    AssetTraversal = "asset_traversal", Error, Asset, "asset path `{path}` escapes the assets directory";

    // Layout — placement, sizing, overflow, context misuse.
    LengthOutOfRange = "length_out_of_range", Warning, Layout, "resolved length {value}pt exceeds ±{max}pt; value dropped";
    PercentOfAuto = "percent_of_auto", Warning, Layout, "`%` cannot resolve against an auto-height container; value dropped";
    OrientationIgnored = "orientation_ignored", Warning, Layout, "`orientation: landscape` is ignored for a custom page size; express the orientation in the dimensions instead";
    PageMarginTooLarge = "page_margin_too_large", Warning, Layout, "{axis} page margins ({a}pt + {b}pt) consume the page {dimension} {total}pt; using 0";
    InvalidFontSize = "invalid_font_size", Warning, Layout, "fontSize {value} is not a positive finite number; using {default}";
    FontSizeOutOfRange = "font_size_out_of_range", Warning, Layout, "fontSize {value}pt exceeds the {max}pt cap; using {default}";
    InvalidLineHeight = "invalid_line_height", Warning, Layout, "lineHeight {value} is not a positive finite number; using {default}";
    LineHeightOutOfRange = "line_height_out_of_range", Warning, Layout, "lineHeight {value} exceeds the {max} cap; using {default}";
    InvalidLetterSpacing = "invalid_letter_spacing", Warning, Layout, "letterSpacing {value} is not a finite value within ±{max}pt; using 0";
    InvalidBorderWidth = "invalid_border_width", Warning, Layout, "borderWidth {value} is not within 0..={max}pt; drawing no border";
    InvalidLineWidth = "invalid_line_width", Warning, Layout, "line width {value} is not within 0..={max}pt; using {default}";
    InvalidBorderRadius = "invalid_border_radius", Warning, Layout, "borderRadius {value} did not resolve to a non-negative length; using {fallback}";
    BorderRadiusIgnored = "border_radius_ignored", Warning, Style, "borderRadius has no effect on {context}; drawing square corners";
    InvalidOpacity = "invalid_opacity", Warning, Layout, "opacity {value} is not within 0..=1; drawing opaque";
    InvalidColumnWidth = "invalid_column_width", Warning, Layout, "column width resolved to {value}pt; using 0";
    InvalidCellPadding = "invalid_cell_padding", Warning, Layout, "cellPadding {value} is negative; using 0";
    InvalidRowHeight = "invalid_row_height", Warning, Layout, "{what} height resolved to {value}pt; ignoring it";
    InvalidCellSize = "invalid_cell_size", Warning, Layout, "char_grid cell size {value}pt is not positive and finite; item skipped";
    InvalidFlexGrow = "invalid_flex_grow", Warning, Layout, "flexGrow must be a non-negative finite number; got {value}, using 0";
    RectMissingSize = "rect_missing_size", Warning, Layout, "rect items need box.w and box.h; item skipped";
    ImageMissingSize = "image_missing_size", Warning, Layout, "image items need a positive box.w and box.h; item skipped";
    QrMissingSize = "qr_missing_size", Warning, Layout, "qr_code items need a positive box.w and box.h; item skipped";
    QrModuleTooSmall = "qr_module_too_small", Warning, Layout, "qr modules are {module}pt (< {min}pt); the printed code may not scan";
    MarkMissingSize = "mark_missing_size", Warning, Layout, "ellipse/checkbox items need a positive box.w and box.h; item skipped";
    ContainerOverflow = "container_overflow", Warning, Layout, "container content ({content}pt) exceeds its content height ({avail}pt)";
    GridCellOverflow = "grid_cell_overflow", Warning, Layout, "grid child ({child}pt) exceeds its {track}pt {extent}";
    // RETIRED — emitted by nothing. Its single free-text `{detail}` arg
    // held a whole English sentence, which a translating consumer could
    // only pass through. The reasons it covered were enumerable, so each
    // became its own number-carrying code (see the layout tail below).
    // The entry stays because codes and arg keys are append-only and a
    // consumer may still hold a catalog key for it.
    HorizontalOverflow = "horizontal_overflow", Warning, Layout, "{detail}";
    TextOverflow = "text_overflow", Warning, Layout, "text overflows the box height ({content}pt content vs {avail}pt available)";
    CharGridOverflow = "char_grid_overflow", Warning, Layout, "char_grid content exceeds the single sheet ({cells} cells) available outside a flow body; {dropped} characters dropped";
    RubyOverflow = "ruby_overflow", Warning, Layout, "a ruby reading is longer than its base run even at the {min}pt floor and overflows it";
    SectionOverflow = "section_overflow", Warning, Layout, "item is taller than the flow region and will overflow the page";
    SpanOverflowUnsupported = "span_overflow_unsupported", Warning, Layout, "textOverflow: shrink|ellipsis is not yet supported on span text; overflowing like visible";
    TableTooWide = "table_too_wide", Warning, Layout, "table columns total {total}pt but the flow is {avail}pt wide";
    RowOverflow = "row_overflow", Error, Layout, "table `{key}` overflows and autoPageBreak is disabled";
    HeaderGroupSpanClamped = "header_group_span_clamped", Warning, Layout, "headerGroups span more columns than the table has; extra groups dropped";
    LayoutKeyOnLeaf = "layout_key_on_leaf", Warning, Layout, "box layout keys (type/direction/gap/alignItems/justifyContent/columns/rows/columnGap/rowGap) lay out children and only apply to `container` boxes (and repeat cells); ignored here";
    GridKeyIgnored = "grid_key_ignored", Warning, Layout, "columns/rows/columnGap/rowGap require `box.type: grid`; ignored under flex layout";
    TablePaginationKeyIgnored = "table_pagination_key_ignored", Warning, Layout, "repeatHeader/autoPageBreak/keepTogether only act on a flow-body table; a table inside a container, an absolute body, or a band renders as one bounded block and ignores them";
    IgnoredColumnKey = "ignored_column_key", Warning, Layout, "`fit` only applies to `type: image` columns; ignored";
    SpanOutsideGrid = "span_outside_grid", Warning, Layout, "columnSpan/rowSpan only act inside a `box.type: grid` parent; ignored";
    GridFrNoBasis = "grid_fr_no_basis", Warning, Layout, "`fr` row tracks need a definite container height; sized as auto rows instead";
    ReflowBudgetExhausted = "reflow_budget_exhausted", Warning, Layout, "too many nested re-flowing boxes (auto-height stretch rows, flexGrow columns, fr-over-auto grids); the innermost children keep their content size";
    CutMarksClipped = "cut_marks_clipped", Warning, Layout, "cutMarks have no room outside the grid on the {sides} side(s) of the sheet; those ticks are omitted";
    VerticalTextUnsupported = "vertical_text_unsupported", Warning, Layout, "{feature} does not support vertical writing (writingMode: vertical_rl) in v1";
    RubyBaseNotFound = "ruby_base_not_found", Warning, Layout, "ruby base `{base}` was not found in the drawn text; reading skipped";
    VerticalStyleIgnored = "vertical_style_ignored", Warning, Layout, "`{prop}` is ignored on a vertical (writingMode: vertical_rl) block";
    PageNumberInBody = "page_number_in_body", Warning, Layout, "page_number items are only supported in header/footer bands";
    PageNumberInContainer = "page_number_in_container", Warning, Layout, "page_number items are only supported directly in header/footer bands; item skipped";
    RepeatInAbsoluteBody = "repeat_in_absolute_body", Warning, Layout, "repeat items require a flow body; item skipped";
    RepeatInBand = "repeat_in_band", Warning, Layout, "repeat items are not supported in header/footer bands; item skipped";
    RepeatInContainer = "repeat_in_container", Warning, Layout, "repeat items are not supported inside containers or cells; item skipped";
    RepeatFlowInAbsoluteBody = "repeat_flow_in_absolute_body", Warning, Layout, "repeat_flow items require a flow body; item skipped";
    RepeatFlowInBand = "repeat_flow_in_band", Warning, Layout, "repeat_flow items are not supported in header/footer bands; item skipped";
    RepeatFlowInContainer = "repeat_flow_in_container", Warning, Layout, "repeat_flow items are not supported inside containers or cells; item skipped";
    PageBreakInAbsoluteBody = "page_break_in_absolute_body", Warning, Layout, "page_break items require a flow body; item skipped";
    PageBreakInBand = "page_break_in_band", Warning, Layout, "page_break items require a flow body; item skipped";
    PageBreakInContainer = "page_break_in_container", Warning, Layout, "page_break items require a flow body; item skipped";
    TableInCell = "table_in_cell", Warning, Layout, "tables inside a repeat or table cell are not supported yet; item skipped";

    // Limits — caps and clamps.
    ContainerDepthExceeded = "container_depth_exceeded", Error, Limits, "containers nest deeper than {max} levels";
    PageOverflow = "page_overflow", Error, Limits, "layout exceeded {max} pages; output truncated";
    TooManySpans = "too_many_spans", Warning, Limits, "item lists {count} spans (over the {max} cap); only the first {max} render";
    TooManyRubyEntries = "too_many_ruby_entries", Warning, Limits, "item lists {count} ruby entries (over the {max} cap); only the first {max} apply";
    TooManyStyles = "too_many_styles", Warning, Limits, "the `styles` registry has {count} entries (over the {max} cap); check for generated bloat";
    TooManyStyleNames = "too_many_style_names", Warning, Limits, "item lists {count} styleNames (over the {max} cap); only the first {max} apply";
    TooManyFormats = "too_many_formats", Warning, Limits, "template defines {count} named formats (over the {max} cap); extra entries are ignored";
    TooManyRowConditions = "too_many_row_conditions", Warning, Limits, "table lists {count} row conditionalStyles (over the {max} cap); only the first {max} apply";
    TooManyBindings = "too_many_bindings", Warning, Limits, "item declares {count} bindings (over the {max} cap); check for generated bloat";
    TooManyDocumentEntries = "too_many_document_entries", Warning, Limits, "`document.{key}` lists {count} entries (over the {max} cap); only the first {max} are written";
    LinkUrlTooLong = "link_url_too_long", Warning, Limits, "link URL exceeds {max} bytes; link dropped";
    QrContentTooLong = "qr_content_too_long", Warning, Limits, "qr_code content is {bytes} bytes (over the {max} cap); item skipped";
    CharGridClamped = "char_grid_clamped", Warning, Limits, "grid {columns}×{lines} is outside 1..={max} cells per sheet; clamped to {clamped_columns}×{clamped_lines}";
    CharGridMarkupClamped = "char_grid_markup_clamped", Warning, Limits, "aozora note `{note}` asks for {value} where the grid allows at most {max}; clamped to {max}";
    GridSpanClamped = "grid_span_clamped", Warning, Limits, "grid span {columns}×{rows} clamped to {clamped_columns}×{clamped_rows}";
    GridTracksClamped = "grid_tracks_clamped", Warning, Limits, "{detail}";
    ImpositionGridClamped = "imposition_grid_clamped", Warning, Limits, "grid {columns}×{rows} is over the {max} cells/page cap (or has a zero axis); clamped to {clamped_columns}×{clamped_rows}";
    CellImageAssetsCapped = "cell_image_assets_capped", Warning, Limits, "per-element cell images exceed the {max} cap; the rest are skipped";
    // The horizontal-overflow family. `horizontal_overflow` above carries
    // its whole sentence in a free-text `{detail}` arg, so a translating
    // consumer can only pass the English through; these carry NUMBERS and
    // nothing else, so each catalog writes its own sentence. One code per
    // reason rather than one code with a `{where}` discriminator — an enum
    // value would reach a non-English reader in English either way.
    SheetOverflow = "sheet_overflow", Warning, Layout, "item reaches {over}pt past the right edge of the sheet and renders off-paper";
    ChildOverflow = "child_overflow", Warning, Layout, "child overflows its {avail}pt content box by {over}pt";
    GridColumnOverflow = "grid_column_overflow", Warning, Layout, "grid child ({child}pt) is wider than the {track}pt column run it spans ({span} tracks)";
    FlowItemOverflow = "flow_item_overflow", Warning, Layout, "item reaches {over}pt past the right edge of the {avail}pt flow region and renders off-sheet";
    FlexRowOverflow = "flex_row_overflow", Warning, Layout, "row children need {needed}pt but the content box is only {avail}pt wide; the row overflows";
    VerticalTextOverflow = "vertical_text_overflow", Warning, Layout, "vertical text needs {columns} columns ({needed}pt) but the box is {avail}pt wide";
    // An item's `visible:` presence binding. The same four faults the form
    // marks and table row conditions each carry, under this surface's own
    // codes: every message names what the fault COSTS ("item not shown"),
    // and a shared code could not say that for three different surfaces.
    VisibleNotBoolean = "visible_not_boolean", Warning, Data, "`{key}` is not a boolean field; a `visible` binding without `equals` expects one";
    VisibleEqualsNotDeclared = "visible_equals_not_declared", Warning, Data, "`{key}` declares an `enum` that does not list this `equals` value; the item can never be shown";
    VisibleTypeMismatch = "visible_type_mismatch", Warning, Data, "`{key}` value type differs from `equals`; item not shown";
    VisibleValueNotBool = "visible_value_not_bool", Warning, Data, "`{key}` is not a boolean; item not shown";
    // A `line` endpoint anchored to another item (`from: { item: … }`).
    // Every one of these draws NOTHING rather than guessing a position:
    // a leader line to the wrong place is worse than an absent one, and
    // each message names the id it was looking for.
    AnchorUnknownTarget = "anchor_unknown_target", Warning, Layout, "no item has `id: {item}`; the anchored item is not drawn";
    AnchorCrossPage = "anchor_cross_page", Warning, Layout, "the anchored endpoints land on different pages; the line is not drawn";
    AnchorAmbiguousTarget = "anchor_ambiguous_target", Warning, Layout, "`id: {item}` is placed more than once on this page; the anchored item uses the first placement";
}

#[cfg(test)]
#[path = "code/tests.rs"]
mod tests;
