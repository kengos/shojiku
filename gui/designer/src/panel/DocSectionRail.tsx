// The document-settings section rail: the view's table of contents AND its
// navigation. Each entry carries the section's one-line summary, so the rail
// answers "where is X" without opening every section.

import { useI18n } from '../i18n/context';
import { type DocSection, SECTION_ORDER, SECTION_TITLE_KEYS } from './docSections';

export interface DocSectionRailProps {
  readonly current: DocSection;
  readonly summaries: Readonly<Record<DocSection, string>>;
  /** The sections to list. Defaults to all of them; the page narrows it
   * when the engine lacks a section's capability, so a gated-off section
   * leaves no row that opens onto nothing. */
  readonly sections?: readonly DocSection[];
  readonly onSelect: (section: DocSection) => void;
}

export function DocSectionRail({
  current,
  summaries,
  sections = SECTION_ORDER,
  onSelect,
}: DocSectionRailProps) {
  const { t } = useI18n();
  return (
    <nav
      className="w-[184px] shrink-0 overflow-y-auto border-r border-border bg-chrome p-2"
      aria-label={t('docSettings.sections')}
    >
      {sections.map((section) => (
        <button
          key={section}
          type="button"
          aria-current={section === current}
          className={`mb-0.5 block w-full cursor-pointer rounded-md border-0 px-2.5 py-2 text-left ${
            section === current ? 'bg-bg font-semibold text-accent' : 'bg-transparent text-text'
          }`}
          onClick={() => onSelect(section)}
        >
          {t(SECTION_TITLE_KEYS[section])}
          <span className="mt-0.5 block text-sm font-normal text-muted">{summaries[section]}</span>
        </button>
      ))}
    </nav>
  );
}
