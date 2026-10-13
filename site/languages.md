---
title: "Setting up a language other than Japanese or English"
description: "Two languages are compiled into the engine. Chinese, Hindi, Filipino and Thai arrive as locale packs — a file you point the engine at. How to load one, and where the typesetting itself changes."
---

# Documents in a language the engine does not build in

Two languages ship inside the binary: `ja-JP` and `en-US`.
Everything else is a file.
Point the engine at one YAML file under `packs/locale/` and your documents come out in that language.
The build does not change.

Locale data compiled into the engine travels with every copy of it, and a service that only prints Taiwanese invoices has no reason to carry Hindi month names. Japanese and English are the exception on purpose. Because they are compiled in, the engine can render without reading a single file, and that is what lets the WASM bundle work in a browser with nothing else fetched.

## What a pack decides

One pack carries the values a reader of the document actually sees.

- **Currency**: the default code, its symbol, its name in that language, and which side of the number the symbol goes
- **Dates**: patterns like `d MMM y`, plus month and weekday names
- **Numbers**: the group and decimal separators, and how digits are grouped
- **Units**: the word attached to a quantity, so `3` becomes `3 รายการ`
- **Fonts**: which font pack has the glyphs, and which one supplies the Latin they lack

Nothing in the template names a language.
`defaults.locale` takes a tag, and the pack decides what the values look like.
The receipts in the [Gallery](/gallery) are the same layout at the same coordinates, six times over. What differs between them is the locale tag and the labels written in that language.

## Loading one

Add a line to the template.

```yaml
defaults:
  locale: zh-TW
  currency: TWD
```

Then let the engine find the file. On the command line that is `--locale-dir`, or `$SHOJIKU_LOCALE_DIR`, or `./packs/locale` if you set neither.

```bash
shojiku render --templates templates.yml --params params.json \
  --locale-dir ./packs/locale --output out.pdf
```

In a browser or a Workers isolate there is no file to read, so you hand the engine the pack's text directly: `setLocale(tag, text)`.

A tag with neither a pack nor a builtin does not quietly fall back to another language. The render fails, and the error lists the builtin tags and every directory it searched.

## The packs that ship

| Locale | Currency | Date | Fonts |
| --- | --- | --- | --- |
| `zh-TW` | TWD | `y年M月d日` | Noto Sans TC |
| `zh-CN` | CNY | `y年M月d日` | Noto Sans SC |
| `hi-IN` | INR | `d MMM y` | Noto Sans Devanagari + Noto Sans |
| `fil-PH` | PHP | `MMM d, y` | Noto Sans |
| `th-TH` | THB | `d MMM y` | Noto Sans Thai + Noto Sans |

Fonts work the same way: the pack names them, and nothing scans your system.
The Devanagari and Thai faces carry no Latin at all, so those two packs list `noto-sans` behind them for it.
Filipino uses the Latin script, so its pack ships no font of its own.

## Where the typesetting itself differs

A pack is data, so adding one does not change how anything is laid out. Three languages are the exception, and each is handled inside the engine.

**Chinese line-break prohibition.** A closing bracket or a full stop may not start a line. When one lands there, the character before it is moved down as well, so the pair stays together at the head of the new line. The same characters are held back in Chinese and in Japanese, and `lineBreak` selects how strict the rule is.

**Indian digit grouping.** `₹1,23,45,678` groups three digits from the right and then two at a time. The widths are numbers the pack supplies, so the grouping code takes no locale argument at all.

**Thai word segmentation and the Buddhist era.** Thai is written without spaces between words, so a segmenter decides where a line may break ([details](/reference/text)). Dates print in the Buddhist era: 2026 comes out as 2569. For the Gregorian year, ask the date field for its `gregorian` variant.

## Adding a language

Adding a locale requires no engine change.
Write one entry in `PACK_CONFIG` in `scripts/gen-locale-builtins.py` and run the script; the values come from CLDR.
If that entry names a font pack the repository does not have yet, building the font pack is separate work.

::: warning About the wording
Nobody who worked on this page reads Thai or Chinese.
The numbers and formats come straight from CLDR, but the word choices have not been checked by anyone who would notice if they read strangely on a real document.
If something is wrong, please [open an issue](https://github.com/kengos/shojiku/issues).
:::
