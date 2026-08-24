// Zero-dependency inline-SVG icon set. Each draws with `currentColor`, so an
// icon inside a Button/IconButton follows that control's text token in both
// schemes. Decorative (`aria-hidden`) — the accessible name comes from the
// enclosing control. `size` overrides the 16px default; other SVG props pass
// through. No CSS.
// line-budget-exempt: data table — splitting it adds no cohesion

import type { ReactNode, SVGProps } from 'react';

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'width' | 'height'> {
  /** Square edge in px (default 16). */
  readonly size?: number;
}

function Svg({ size = 16, children, ...rest }: IconProps & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  );
}

export function IconPlus(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M8 3.5v9M3.5 8h9" />
    </Svg>
  );
}

export function IconMinus(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M3.5 8h9" />
    </Svg>
  );
}

export function IconUndo(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M6 4.5L3 7.5l3 3M3 7.5h6.5a3.5 3.5 0 0 1 0 7H6" />
    </Svg>
  );
}

export function IconRedo(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M10 4.5l3 3-3 3M13 7.5H6.5a3.5 3.5 0 0 0 0 7H10" />
    </Svg>
  );
}

export function IconClose(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 4l8 8M12 4l-8 8" />
    </Svg>
  );
}

export function IconChevronDown(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 6l4 4 4-4" />
    </Svg>
  );
}

/** A checkmark — the selected-entry marker in a single-choice menu. */
export function IconCheck(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M3.5 8.5l3 3 6-7" />
    </Svg>
  );
}

/** Three vertical dots — a list row's overflow-actions menu (the secondary
 * actions a row keeps off its face). */
export function IconMore(props: IconProps) {
  return (
    <Svg {...props} strokeWidth={2}>
      <path d="M8 3.4v0.1M8 7.95v0.1M8 12.5v0.1" />
    </Svg>
  );
}

export function IconSearch(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="7" cy="7" r="3.75" />
      <path d="M14 14l-3.6-3.6" />
    </Svg>
  );
}

export function IconTrash(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M3 4.5h10M6.5 4.5V3h3v1.5M5 4.5l.5 8h5l.5-8" />
    </Svg>
  );
}

/** A gear — the settings/edit affordance (opens the data-item editor). */
export function IconGear(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="8" cy="8" r="2" />
      <path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M12.6 3.4l-1.4 1.4M4.8 11.2l-1.4 1.4" />
    </Svg>
  );
}

/** A question mark in a circle — the contextual-help affordance. */
export function IconHelp(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="8" cy="8" r="6" />
      <path d="M6.3 6.2a1.7 1.7 0 0 1 3.3.5c0 1.1-1.6 1.4-1.6 2.5" />
      <path d="M8 11.6v0.1" />
    </Svg>
  );
}

/** Text aligned left — four rules flush left (the gdoc glyph). */
export function IconAlignLeft(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M2.5 3.5h11M2.5 6.5h7M2.5 9.5h11M2.5 12.5h7" />
    </Svg>
  );
}

/** Text centered — alternating full/short rules, centered. */
export function IconAlignCenter(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M2.5 3.5h11M4.5 6.5h7M2.5 9.5h11M4.5 12.5h7" />
    </Svg>
  );
}

/** Text aligned right — four rules flush right. */
export function IconAlignRight(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M2.5 3.5h11M6.5 6.5h7M2.5 9.5h11M6.5 12.5h7" />
    </Svg>
  );
}

/** A bordered square — the border-editor toolbar affordance. */
export function IconBorder(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="2.75" y="2.75" width="10.5" height="10.5" rx="1" />
    </Svg>
  );
}

/** A window with its left column split off — the show/hide toggle for the
 * left tool pane. */
export function IconPanelLeft(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="2.5" y="3" width="11" height="10" rx="1.5" />
      <path d="M6.5 3v10" />
    </Svg>
  );
}

/** Three side-by-side bars — a `direction: row` container (arrange in a row). */
export function IconLayoutRow(props: IconProps) {
  return (
    <Svg {...props} strokeWidth={1.4}>
      <rect x="1.5" y="4" width="3.6" height="8" rx="1" />
      <rect x="6.2" y="4" width="3.6" height="8" rx="1" />
      <rect x="10.9" y="4" width="3.6" height="8" rx="1" />
    </Svg>
  );
}

/** Three stacked bars — a `direction: column` container (stack vertically). */
export function IconLayoutColumn(props: IconProps) {
  return (
    <Svg {...props} strokeWidth={1.4}>
      <rect x="3" y="1.8" width="10" height="3.4" rx="1" />
      <rect x="3" y="6.3" width="10" height="3.4" rx="1" />
      <rect x="3" y="10.8" width="10" height="3.4" rx="1" />
    </Svg>
  );
}

/** Items hung from a top rule — cross-axis `alignItems: start`. */
export function IconAlignTop(props: IconProps) {
  return (
    <Svg {...props} strokeWidth={1.4}>
      <path d="M2 3h12M5 6v7M11 6v4" />
    </Svg>
  );
}

/** Items centered on a middle rule — `alignItems: center`. */
export function IconAlignMiddle(props: IconProps) {
  return (
    <Svg {...props} strokeWidth={1.4}>
      <path d="M2 8h12M5 4v8M11 5.5v5" />
    </Svg>
  );
}

/** Items resting on a bottom rule — `alignItems: end`. */
export function IconAlignBottom(props: IconProps) {
  return (
    <Svg {...props} strokeWidth={1.4}>
      <path d="M2 13h12M5 3v7M11 6v4" />
    </Svg>
  );
}

/** An item pulled to both rules — `alignItems: stretch`. */
export function IconAlignStretch(props: IconProps) {
  return (
    <Svg {...props} strokeWidth={1.4}>
      <path d="M2 3h12M2 13h12M8 5.5v5M6.5 7 8 5.5 9.5 7M6.5 9 8 10.5 9.5 9" />
    </Svg>
  );
}

// ---------------------------------------------------------------------------
// Object align / distribute marks (multi-select cluster). Distinct from
// the text/flex alignment icons above: these show two/three OBJECTS lining up
// to a guide edge (filled rects) or spacing out evenly, the Figma vocabulary.
// The guide is a stroked line; the objects are `fill=currentColor` rects.
// ---------------------------------------------------------------------------

export function IconObjAlignLeft(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M2.5 2.5v11" />
      <rect x="4.5" y="3.5" width="8" height="3" rx="1" fill="currentColor" stroke="none" />
      <rect x="4.5" y="9.5" width="5" height="3" rx="1" fill="currentColor" stroke="none" />
    </Svg>
  );
}

export function IconObjAlignCenterX(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M8 2.5v11" />
      <rect x="4" y="3.5" width="8" height="3" rx="1" fill="currentColor" stroke="none" />
      <rect x="5.5" y="9.5" width="5" height="3" rx="1" fill="currentColor" stroke="none" />
    </Svg>
  );
}

export function IconObjAlignRight(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M13.5 2.5v11" />
      <rect x="3.5" y="3.5" width="8" height="3" rx="1" fill="currentColor" stroke="none" />
      <rect x="6.5" y="9.5" width="5" height="3" rx="1" fill="currentColor" stroke="none" />
    </Svg>
  );
}

export function IconObjAlignTop(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M2.5 2.5h11" />
      <rect x="3.5" y="4.5" width="3" height="8" rx="1" fill="currentColor" stroke="none" />
      <rect x="9.5" y="4.5" width="3" height="5" rx="1" fill="currentColor" stroke="none" />
    </Svg>
  );
}

export function IconObjAlignMiddleY(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M2.5 8h11" />
      <rect x="3.5" y="4" width="3" height="8" rx="1" fill="currentColor" stroke="none" />
      <rect x="9.5" y="5.5" width="3" height="5" rx="1" fill="currentColor" stroke="none" />
    </Svg>
  );
}

export function IconObjAlignBottom(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M2.5 13.5h11" />
      <rect x="3.5" y="3.5" width="3" height="8" rx="1" fill="currentColor" stroke="none" />
      <rect x="9.5" y="6.5" width="3" height="5" rx="1" fill="currentColor" stroke="none" />
    </Svg>
  );
}

export function IconObjDistributeH(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="1.5" y="4" width="2.5" height="8" rx="1" fill="currentColor" stroke="none" />
      <rect x="6.75" y="4" width="2.5" height="8" rx="1" fill="currentColor" stroke="none" />
      <rect x="12" y="4" width="2.5" height="8" rx="1" fill="currentColor" stroke="none" />
    </Svg>
  );
}

export function IconObjDistributeV(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="4" y="1.5" width="8" height="2.5" rx="1" fill="currentColor" stroke="none" />
      <rect x="4" y="6.75" width="8" height="2.5" rx="1" fill="currentColor" stroke="none" />
      <rect x="4" y="12" width="8" height="2.5" rx="1" fill="currentColor" stroke="none" />
    </Svg>
  );
}

// ---------------------------------------------------------------------------
// Item-type marks — one per node kind the layer tree lists (`tree/kindIcons`).
// Read at 14px in a tree row, so the design constraint is DISTINGUISHABILITY at
// that size, not detail. The four grid-shaped kinds are deliberately pulled
// apart: a table has an asymmetric heavy top rule, a char_grid is a uniform
// dense mesh, a repeat is four SEPARATED blocks, a qr_code is corner finders.
// ---------------------------------------------------------------------------

/** A portrait page of text lines — the whole document (the layer tree's whole-document
 * root row). Lined, against the section mark's filled band. */
export function IconDocument(props: IconProps) {
  return (
    <Svg {...props} strokeWidth={1.4}>
      <rect x="3" y="1.5" width="10" height="13" rx="1.2" />
      <path d="M5.5 5.25h5M5.5 8h5M5.5 10.75h3" />
    </Svg>
  );
}

/** A portrait page with one band filled edge to edge — a document section
 * (header/body/footer). The band runs HORIZONTALLY, against the column mark's
 * vertical block, so the two do not share a silhouette at row size. */
export function IconSection(props: IconProps) {
  return (
    <Svg {...props} strokeWidth={1.4}>
      <rect x="3" y="1.5" width="10" height="13" rx="1.2" />
      <path d="M3 6h10v3.2H3z" fill="currentColor" stroke="none" />
    </Svg>
  );
}

/** The same page with its filled band at the TOP — a header. The three section
 * marks are one family: identical page outline, band where that section
 * actually prints. Position carries the meaning rather than a letter, because
 * the initial of "header" is only an H in one of the six shipped locales. */
export function IconSectionHeader(props: IconProps) {
  return (
    <Svg {...props} strokeWidth={1.4}>
      <rect x="3" y="1.5" width="10" height="13" rx="1.2" />
      <path d="M3 2.6h10v2.6H3z" fill="currentColor" stroke="none" />
    </Svg>
  );
}

/** The same page with its filled band at the BOTTOM — a footer. */
export function IconSectionFooter(props: IconProps) {
  return (
    <Svg {...props} strokeWidth={1.4}>
      <rect x="3" y="1.5" width="10" height="13" rx="1.2" />
      <path d="M3 10.8h10v2.6H3z" fill="currentColor" stroke="none" />
    </Svg>
  );
}

/** A capital T on its baseline — a text item. */
export function IconText(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M3.5 4.5V3h9v1.5M8 3v10M6 13h4" />
    </Svg>
  );
}

/** A plain rectangle — a rect item. */
export function IconRect(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="2.5" y="4" width="11" height="8" rx="1" />
    </Svg>
  );
}

/** A corner-to-corner stroke — a line item. */
export function IconLine(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M3 13L13 3" />
    </Svg>
  );
}

/** A framed grid with a heavy header rule — a table item. */
export function IconTable(props: IconProps) {
  return (
    <Svg {...props} strokeWidth={1.4}>
      <rect x="2.5" y="3" width="11" height="10" rx="1" />
      <path d="M2.5 6.5h11" strokeWidth={1.9} />
      <path d="M2.5 9.75h11M8 6.5v6.5" />
    </Svg>
  );
}

/** A number sign — the page-number item. */
export function IconPageNumber(props: IconProps) {
  return (
    <Svg {...props} strokeWidth={1.4}>
      <path d="M6.25 3l-1.5 10M11.25 3l-1.5 10M3.75 6.25h8.5M3.25 9.75h8.5" />
    </Svg>
  );
}

/** A framed picture — an image item. */
export function IconImage(props: IconProps) {
  return (
    <Svg {...props} strokeWidth={1.4}>
      <rect x="2" y="3" width="12" height="10" rx="1.5" />
      <circle cx="5.75" cy="6.5" r="1.1" />
      <path d="M2.4 11.75l3.35-3.1 2.4 2.2 2.6-2.6 3.25 3" />
    </Svg>
  );
}

/** A dashed frame — a container (matching the canvas container outline). */
export function IconContainer(props: IconProps) {
  return (
    <Svg {...props} strokeWidth={1.4}>
      <rect x="2.5" y="3" width="11" height="10" rx="1" strokeDasharray="2.4 1.9" />
    </Svg>
  );
}

/** Four separated blocks — an n-up repeat. */
export function IconRepeat(props: IconProps) {
  return (
    <Svg {...props} strokeWidth={1.4}>
      <rect x="2.25" y="2.75" width="5" height="4.5" rx="1" />
      <rect x="8.75" y="2.75" width="5" height="4.5" rx="1" />
      <rect x="2.25" y="8.75" width="5" height="4.5" rx="1" />
      <rect x="8.75" y="8.75" width="5" height="4.5" rx="1" />
    </Svg>
  );
}

/** Stacked blocks beside a downward arrow — a repeat that FLOWS onward. */
export function IconRepeatFlow(props: IconProps) {
  return (
    <Svg {...props} strokeWidth={1.4}>
      <rect x="1.75" y="2.75" width="8" height="3.4" rx="1" />
      <rect x="1.75" y="7.9" width="8" height="3.4" rx="1" />
      <path d="M13 3.25v8.5M11.5 10.25L13 11.75l1.5-1.5" />
    </Svg>
  );
}

/** Three corner finders and a scatter of cells — a QR code. */
export function IconQrCode(props: IconProps) {
  return (
    <Svg {...props} strokeWidth={1.3}>
      <rect x="2" y="2" width="4.75" height="4.75" rx="0.8" />
      <rect x="9.25" y="2" width="4.75" height="4.75" rx="0.8" />
      <rect x="2" y="9.25" width="4.75" height="4.75" rx="0.8" />
      <path d="M9.5 9.5v0.1M12.5 9.5v0.1M9.5 12.5v0.1M12.5 12.5v0.1" strokeWidth={2} />
    </Svg>
  );
}

/** Bulleted rules — a list item. */
export function IconList(props: IconProps) {
  return (
    <Svg {...props} strokeWidth={1.4}>
      <path d="M3 4.25v0.1M3 8v0.1M3 11.75v0.1" strokeWidth={2.2} />
      <path d="M6 4.25h7M6 8h7M6 11.75h7" />
    </Svg>
  );
}

/** A dashed cut between two page edges — a page break. */
export function IconPageBreak(props: IconProps) {
  return (
    <Svg {...props} strokeWidth={1.4}>
      <path d="M4 2.5h8M4 13.5h8" />
      <path d="M1.5 8h3M6.5 8h3M11.5 8h3" />
    </Svg>
  );
}

/** A uniform dense mesh — the genkoyoshi character grid. */
export function IconCharGrid(props: IconProps) {
  return (
    <Svg {...props} strokeWidth={1.2}>
      <rect x="2" y="2" width="12" height="12" rx="0.8" />
      <path d="M6 2v12M10 2v12M2 6h12M2 10h12" />
    </Svg>
  );
}

/** A circle — an ellipse item. */
export function IconEllipse(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="8" cy="8" r="5.5" />
    </Svg>
  );
}

/** A ticked box — a checkbox item. */
export function IconCheckbox(props: IconProps) {
  return (
    <Svg {...props} strokeWidth={1.4}>
      <rect x="2.5" y="2.5" width="11" height="11" rx="2" />
      <path d="M5 8.2l2.2 2.2 4-4.4" />
    </Svg>
  );
}

/** A framed grid with its FIRST column filled — one table column. */
export function IconColumn(props: IconProps) {
  return (
    <Svg {...props} strokeWidth={1.4}>
      <rect x="2.5" y="3" width="11" height="10" rx="1" />
      <rect x="2.5" y="3" width="4" height="10" rx="1" fill="currentColor" stroke="none" />
      <path d="M6.5 3v10" />
    </Svg>
  );
}

/** A wide banner over three column ticks — a table header group spanning the
 * columns beneath it (the column mark's counterpart). */
export function IconHeaderGroup(props: IconProps) {
  return (
    <Svg {...props} strokeWidth={1.4}>
      <rect x="2.5" y="3" width="11" height="4" rx="1" fill="currentColor" stroke="none" />
      <rect x="2.5" y="9" width="11" height="4" rx="1" />
      <path d="M6.2 9v4M9.8 9v4" />
    </Svg>
  );
}

/** A diamond — the generic mark for an item kind the tree does not know. */
export function IconItem(props: IconProps) {
  return (
    <Svg {...props} strokeWidth={1.4}>
      <path d="M8 2.5l5.5 5.5L8 13.5 2.5 8z" />
    </Svg>
  );
}

/** A four-point spark — the AI-copilot mark (the assistant/idea vocabulary). */
export function IconSparkle(props: IconProps) {
  return (
    <Svg {...props} strokeWidth={1.4}>
      <path d="M8 2.5c.5 2.6 1.4 3.5 4 4-2.6.5-3.5 1.4-4 4-.5-2.6-1.4-3.5-4-4 2.6-.5 3.5-1.4 4-4z" />
      <path d="M12.5 10.5c.25 1.3.7 1.75 2 2-1.3.25-1.75.7-2 2-.25-1.3-.7-1.75-2-2 1.3-.25 1.75-.7 2-2z" />
    </Svg>
  );
}
