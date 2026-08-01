// Public surface of the DOCUMENT-CONTENT models: what a host persists, feeds in
// or generates — definition edits, imported images, reusable blocks, the sample
// params substrate and its named variants, and the text-editing chip context.
// Re-exported wholesale by the package index.

export { sanitizeDefsEdits } from '../data/defsPlan';
export { type ImageCodec, type ImportOutcome, importImageFile } from '../image/import';
// Image import: the injected browser-glue contract + the pure budgets/refusal
// types a host wires (the real canvas codec lives in the app's browser entry).
export {
  DEFAULT_IMAGE_BUDGETS,
  type ImageBudgets,
  type ImageKind,
  type ImportRefusal,
} from '../image/model';
// Reusable-block library types + the restore-time sanitizer (a host persists the
// app-global block library and hands it back through `DesignerProps.blocks`).
export {
  MAX_BLOCK_NAME_CHARS,
  MAX_BLOCKS,
  type SavedBlock,
  sanitizeBlocks,
} from '../insert/blockModel';
// Sample-data model (pure): the params substrate (types, kinds, parse /
// serialize, value coercion), the editable view over it, and the named edit
// primitives — plus the value-synth injection seam below.
export { addSampleField, addSampleRow, removeSampleRow, setSampleValue } from '../sample/edit';
export {
  type ExtendResult,
  extendParams,
  fillMissingParams,
  generateParams,
} from '../sample/generate';
export { MAX_GENERATED_ROWS } from '../sample/genWalk';
export { inferDefinitions } from '../sample/inferStub';
export {
  clipText,
  coerceSampleValue,
  MAX_PARAMS_BYTES,
  parseParams,
  type SampleArrayGroup,
  type SampleField,
  type SampleGroup,
  type SampleKind,
  type SamplePath,
  type SampleRow,
  type SampleScalar,
  type SampleView,
  serializeParams,
} from '../sample/model';
export {
  baselineSynth,
  hashKey,
  type SynthConstraints,
  type SynthSpec,
  type ValueSynth,
} from '../sample/synth';
export {
  activeText,
  addVariant,
  buildSampleSet,
  DEFAULT_VARIANT_ID,
  MAX_VARIANTS,
  type PresetVariant,
  removeVariant,
  type SampleSet,
  type SampleVariant,
  switchVariant,
  updateActive,
  type VariantLabels,
  type VariantRefusal,
  type VariantResult,
  variantDisplayName,
} from '../sample/variants';
// Sample-variant model (pure; the named sample-data sets the preview switches
// between). Its draft-serializable projection + restore is `variantsStore`.
export {
  restoreSampleSet,
  type StoredSampleSet,
  type StoredVariant,
  toStored,
} from '../sample/variantsStore';
export { readSampleView } from '../sample/view';
export { type ChipContext, chipContextFor } from '../text/chipContext';
export type { Declaration, PendingDecl } from '../text/declModel';
export { TextEditor, type TextEditorProps } from '../text/TextEditor';
