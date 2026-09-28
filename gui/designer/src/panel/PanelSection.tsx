// One collapsible section of the property panel — the shape of Google Docs'
// 「Table properties」 sidebar: a heading row that opens and closes the
// section, and, while it is closed, one muted line saying what the section is
// currently set to. Reading a value needs no click; only changing one does.
//
// The heading row is two SIBLINGS: the toggle (a button inside the heading, the
// WAI-ARIA accordion pattern) and the section's one `?`. The `?` is a button of
// its own, and a button nested in a button is invalid markup that a screen
// reader flattens — the same rule `StepperField` states for labels.
//
// A closed section's body is not rendered at all, like an inactive tab's: the
// panel's fields are uncontrolled and keyed by value, so a remount on reopen
// shows the document's current value rather than a stale entry. The open state
// itself lives in `sectionOpenState`, which outlives the tabs.

import { type ReactNode, useId } from 'react';
import { HelpHint } from '../help/HelpHint';
import { useI18n } from '../i18n/context';
import { IconChevronDown } from '../ui/icons';
import { type SectionId, useSectionOpen } from './sectionOpenState';

export interface PanelSectionProps {
  readonly id: SectionId;
  readonly title: string;
  /** What the section is set to, shown only while it is closed. */
  readonly summary: string;
  /** The section's explanation, behind its one `?` (the bubble's lead line is
   * the section title). Absent = no `?`. */
  readonly help?: string;
  /** Open before the reader has toggled it — the first section of a tab. */
  readonly defaultOpen?: boolean;
  readonly children: ReactNode;
}

export function PanelSection({
  id,
  title,
  summary,
  help,
  defaultOpen = false,
  children,
}: PanelSectionProps) {
  const { t } = useI18n();
  const [open, toggle] = useSectionOpen(id, defaultOpen);
  const ids = useId();
  const bodyId = `${ids}body`;
  const titleId = `${ids}title`;
  const summaryId = `${ids}summary`;
  const summarised = !open && summary !== '';
  return (
    <section className="-mx-3 border-border border-b" data-section={id}>
      <div className="flex items-start gap-1 pr-3">
        <h3 className="m-0 min-w-0 flex-1 font-normal text-sm">
          <button
            type="button"
            aria-expanded={open}
            aria-controls={open ? bodyId : undefined}
            // The NAME is the title alone; the summary is a DESCRIPTION. It is a
            // status readout that always resolves and can carry document text
            // (group labels, style names), so folding it into the name would
            // re-read it on every visit and put document strings in a name.
            aria-labelledby={titleId}
            aria-describedby={summarised ? summaryId : undefined}
            onClick={toggle}
            className="grid w-full cursor-pointer grid-cols-[14px_1fr] items-center gap-x-1.5 border-0 bg-transparent py-2.5 pl-3 text-left text-text"
          >
            {/* One chevron, rotated a quarter turn when collapsed — the shipped
                disclosure look (the layer tree's rows). */}
            <IconChevronDown
              size={12}
              data-collapsed={open ? undefined : ''}
              className="text-muted transition-transform data-collapsed:-rotate-90"
            />
            <span id={titleId} className="font-semibold">
              {title}
            </span>
            {summarised ? (
              // Two lines at most: the panel is ~255px wide, and a summary can
              // carry document text (group labels, style names) of any length.
              <span
                id={summaryId}
                className="col-start-2 line-clamp-2 break-words text-muted text-xs"
              >
                {summary}
              </span>
            ) : null}
          </button>
        </h3>
        {help === undefined ? null : (
          <span className="pt-2.5">
            <HelpHint label={t('panel.section.helpLabel', { title })} title={title} body={help} />
          </span>
        )}
      </div>
      {open ? (
        <div id={bodyId} className="px-3 pb-3">
          {children}
        </div>
      ) : null}
    </section>
  );
}
