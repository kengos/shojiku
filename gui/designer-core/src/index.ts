// Public surface of designer-core.

export {
  clampTemplateMaxBytes,
  MAX_ALIAS_COUNT,
  MAX_TEMPLATE_BYTES,
  MAX_TEMPLATE_BYTES_CEILING,
  parseTemplate,
  readNode,
  readTemplate,
  serializeTemplate,
  TemplateParseError,
} from './document';
export {
  type BatchResult,
  Editor,
  type EditorChange,
  type EditorChangeSource,
  type EditorListener,
  type EditorOptions,
  MAX_BATCH_OPS,
  type ReadFn,
} from './editor';
export { MAX_HISTORY, MAX_HISTORY_BYTES, trimHistory } from './history';
export type { Op, OpError, OpErrorCode, OpResult, ScalarValue, SnippetValue } from './ops';
export {
  applyOp,
  isSnippetValue,
  MAX_KEY_DEPTH,
  MAX_SNIPPET_DEPTH,
  MAX_SNIPPET_NODES,
  MAX_STRING_VALUES,
} from './ops';
export type { PathSegment } from './path';
export { formatPath, PathSyntaxError, parsePath, toYamlPath } from './path';
export type * from './wire';
