// The rule editor's 「書式設定のスタイル」 row: one sample tile per format preset
// (`rulePresets`), drawn in the format it applies — Sheets' conditional-format
// style samples, as pictures rather than names. The tile matching the rule's
// wire is pressed. The eight format controls below it stay the way to adjust
// anything a preset set.
//
// The colours drawn are the presets' own constants, never document strings, so
// they may reach an inline style as they are.

import { useI18n } from '../i18n/context';
import { TipBubble } from '../ui/TipBubble';
import { RULE_PRESETS } from './rulePresets';

export function RulePresetGallery({
  active,
  onPick,
}: {
  /** The preset the rule's wire matches, or `null`. */
  readonly active: string | null;
  readonly onPick: (id: string) => void;
}) {
  const { t } = useI18n();
  return (
    <fieldset className="m-0 mb-2 border-0 p-0">
      <legend className="mb-1 p-0 text-muted text-xs">{t('panel.rulePreset.title')}</legend>
      <div className="flex flex-wrap gap-1">
        {[...RULE_PRESETS].map(([id, preset]) => (
          // The hover group is the tile, so pointing at it names the preset;
          // the name is also the button's accessible name.
          <span key={id} className="group/tip relative inline-flex">
            <button
              type="button"
              aria-pressed={id === active}
              aria-label={t(`panel.rulePreset.${id}`)}
              className="h-7 w-9 cursor-pointer rounded-md border border-solid border-border p-0 text-sm aria-pressed:outline aria-pressed:outline-2 aria-pressed:outline-accent"
              // A paper-white ground in both schemes: the tile is a sample of
              // the PAGE, like the table-style thumbnails.
              style={{
                background: preset.backgroundColor ?? '#ffffff',
                color: preset.color ?? '#202124',
                fontWeight: preset.fontWeight ?? 'normal',
              }}
              // Re-picking the preset the rule already carries authors nothing.
              onClick={() => {
                if (id !== active) {
                  onPick(id);
                }
              }}
            >
              Aa
            </button>
            <TipBubble text={t(`panel.rulePreset.${id}`)} />
          </span>
        ))}
      </div>
    </fieldset>
  );
}
