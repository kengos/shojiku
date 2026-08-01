// The course's English copy — the fallback for a Designer running in any
// language other than Japanese. Same keys as `copy.ja.ts`; a parity test pins
// that, so a step added to the course cannot ship with only one language.

export const CHAPTER_TITLES_EN: Record<string, string> = {
  ch0: 'A blank page and its setup',
  ch1: 'A title, and how text is styled',
  ch2: 'Building the header — containers and automatic placement',
  ch3: 'Creating data fields and binding them',
  ch4: 'The line-items table',
  ch5: 'The total row',
  ch6: 'The footer and page numbers',
  ch7: 'Pinning the company seal',
  ch8: 'Finishing and exporting',
};

export const COPY_EN: Record<string, string> = {
  'ch0.blank':
    'This is a blank practice document. Nothing you do here touches the document you had open.',
  'ch0.pageSize':
    'Press "Open document settings" on the right to open the whole-document view, and check under Page setup that the paper is A4, portrait.',
  'ch0.margin':
    'In the same view, set the margin to 24. Lengths are in points — 1pt is about 0.35mm, and A4 is 595pt wide.',
  'ch1.insertText': 'Insert → Text places a box for text.',
  'ch1.type': 'Double-click the box and type "INVOICE".',
  'ch1.bold': 'Make it bold from the format bar above.',
  'ch1.size': 'Set the size to 21.',
  'ch1.align': 'Set the text alignment to centered.',
  'ch1.style':
    'You can name this look and reuse it — use Styles → Save selection as style and call it "Title".',
  'ch2.openPicker':
    'A box that arranges several elements is called a container — open Insert → Container.',
  'ch2.pick':
    'Click the 3-columns-by-1-row cell in the grid. You get a container with three slots side by side.',
  'ch2.left': 'Double-click the left slot and type the customer name.',
  'ch2.rest': 'Do the same for the middle ("Date: ") and the right ("No. ").',
  'ch2.gap':
    'Selecting a slot shows a Parent container card at the top of the right panel — set its Gap to 8 (the space between slots).',
  'ch2.ratio':
    "Set the ratio to 1:2:1, left to right. The numbers are each slot's share of the width, so the middle one becomes twice as wide.",
  'ch2.auto':
    'The X/Y on the Placement tab read "auto" in grey. The tool computes positions for you — the only places you type coordinates are the repeating band in chapter 6 and the seal in chapter 7.',
  'ch3.openField':
    'Values that change with every issue (customer, date, amount) become data fields — open Insert → Create data field.',
  'ch3.create':
    'Create one text field named "customer". Field names use plain ASCII letters — a name outside that set cannot be dropped into the middle of a sentence.',
  'ch3.dataTab': 'Open the Data fields tab on the left. Your new field is listed there.',
  'ch3.bind': 'Drag "customer" onto the page. The text becomes the sample value.',
  'ch3.chip':
    'Drag the date field into the middle of the "Date: " text. It lands mid-sentence as a chip.',
  'ch3.sample':
    'Open the editor from the gear on the Data fields tab and edit the customer value. The page follows immediately.',
  'ch3.format': 'Choose the "symbol" display format for the amount. It now prints like ¥300,000.',
  'ch4.openIterable':
    'Repeating data whose row count varies — like line items — goes in as list data. Choose Insert → Place list data.',
  'ch4.create':
    'Create a list named "items" with name, qty, price and amount, and place it as a table.',
  'ch4.drawn': 'The table is drawn with one row per sample row, and a header row on top.',
  'ch4.width': 'In the Columns section on the right, set the amount column width to 90.',
  'ch4.alignRight':
    'Right-align the quantity, unit price and amount columns, one column at a time. Numbers read best right-aligned.',
  'ch4.paginate':
    'In the data-field editor, add more rows to the line items. Once they stop fitting, a second page appears below and the header row repeats on it.',
  'ch5.container': 'As in chapter 2, place a 2-columns-by-1-row container under the table.',
  'ch5.total':
    'Type "Total " in the right slot and drag the amount field in as a chip, as you did in chapter 3.',
  'ch5.ratio': 'Set the ratio to 3:1, so the right slot takes a quarter and the total sits right.',
  'ch5.bold':
    'Make the total bold. A one-off look like this is fine to set directly, without naming a style.',
  'ch6.selectFooter':
    'A band printed at the same place on every page is a footer (bottom) or header (top) — select the footer in the Structure tab on the left.',
  'ch6.insertText': 'Insert → Text places the company name in the band.',
  'ch6.place':
    'A band prints at the same spot on every page, so you give it coordinates — set X to 24 and Y to 762 (the area inside the margins is 794pt tall, so 762 sits just above the bottom edge).',
  'ch6.pageNumber': 'Insert → Page number. It fills in automatically at print time, like "1 / 3".',
  'ch6.everyPage': 'Check that the same footer appears on every page.',
  'ch7.image': 'Insert → Place image, and choose the seal image.',
  'ch7.pin':
    'Press "Pinned" on the Placement tab. It looks the same, but from now on this image stays put as other elements come and go (press "Auto" to return it to the flow at any time).',
  'ch7.move': 'Set X 480 / Y 40. You can also drag it on the page — and undo with ⌘Z if it slips.',
  'ch8.diagnostics':
    'Check that the warning list at the bottom is empty. Anything wrong is listed there, and clicking a warning jumps to the element.',
  'ch8.sample':
    'In the data-field editor, swap the sample data once more and watch the whole document follow.',
  'ch8.export': 'File → Export writes the result out.',
  'ch8.done':
    'That is the whole flow. The invoice you built makes a fine starting point for your own template.',
  // Topic-specific steps (reused steps show their course sentence via copyId).
  'topic-containers.grid':
    'Click the 3-columns-by-2-rows cell in the grid. You get a table-like container with six slots.',
  'topic-containers.columns': 'Set Columns to 4 in the right panel. One more slot appears across.',
  'topic-containers.nest':
    'With a slot selected, Insert → Container drops the new container INSIDE that slot (the target is previewed).',
  'topic-binding.dataTab':
    'Open the Data fields tab on the left to see the fields this document uses.',
  'topic-binding.rebind':
    'Click the customer field and, in Data field on the right panel, rebind it to a different field.',
  'topic-binding.rechip':
    'Delete the date chip in "Date: {date}", then drag "date" back in. Chips mid-sentence can be removed and re-inserted.',
  'topic-table.paste':
    'If you have a table in Excel, Insert → Paste table is a shortcut — it infers the columns from the copied cells.',
  'topic-placement.explain':
    'This document’s header holds three texts inside a container. The tool positions the inner elements automatically (the Placement tab shows X/Y as grey "auto").',
  'topic-placement.pin':
    'Select the left text and press "Pinned" on the Placement tab. It looks the same, but from now on this element stays put as others come and go.',
  'topic-placement.move':
    'Change X/Y and only the pinned element moves. You can also drag it on the page — undo with ⌘Z if it slips.',
  'topic-placement.unpin':
    'Press "Auto" again to release the pin and return it to the flow — the tool recomputes the position.',
  'topic-style.origin':
    'Click "INVOICE" and each control on the right panel shows an origin badge — size from style "Title", colour from the default. The three kinds (style / inherited / default) show where a value comes from.',
  'topic-style.update':
    'First update the "Title" style itself — change its size from the style picker’s update row, and every place that uses it follows at once.',
  'topic-style.override':
    'Now select the title and change its size directly from the format bar. Its origin flips from the style to this element, and it no longer follows the style — an override affects only this element.',
};

/** Topic titles (shown in the launcher), keyed by topic/chapter id. */
export const TOPIC_TITLES_EN: Record<string, string> = {
  'topic-containers': 'Containers and arrangement',
  'topic-binding': 'Data binding',
  'topic-table': 'Tables (list data)',
  'topic-footer': 'Footer and page numbers',
  'topic-placement': 'Pinned vs. automatic placement',
  'topic-style': 'Styles and where a value comes from',
};

/** One-line topic subtitles for the launcher, keyed by topic id. */
export const TOPIC_SUBTITLES_EN: Record<string, string> = {
  'topic-containers': 'Stacking, tables, nesting, adding slots',
  'topic-binding': 'Rebinding a field, inserting a chip',
  'topic-table': 'Pasting a table from Excel',
  'topic-footer': 'Header band, page numbers',
  'topic-placement': 'Toggling pinned/auto and reflowing',
  'topic-style': 'Reading origin badges, updating a style',
};

/** Launcher section headers + the trust-note intro. */
export const LAUNCHER_EN = {
  sectionCourse: 'Full course',
  sectionTopics: 'Topics (focused, 2–3 min)',
  intro:
    'The course walks the whole flow; a topic drills one thing. Both run on a practice document, so your own document is never changed.',
};
