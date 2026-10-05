// The open document with ONE change — its `defaults.currency` set to another
// code — for asking the engine what a data item with its own currency renders.
//
// The format catalog samples amounts at the template's `defaults.currency`
// (engine/authoring/src/formats.rs), and a data item's own `currency:` beats
// that code at render. So the honest sample for such an item is the catalog of
// this copy: the engine formats it, the GUI only changed which code it asks
// about. The copy never reaches the editor or the file.
//
// The code goes in through the op layer (a quoted scalar), never by splicing
// text, so a code carrying `: ` or a line break cannot change the copy's shape.
// Every `defaults:` key is optional on the wire, so creating the block is legal.

import { Editor } from '@shojiku/designer-core';

/** The document text with `defaults.currency` set to `code`, or `null` when the
 * document does not parse or its `defaults` is not a map. */
export function withCurrency(text: string, code: string): string | null {
  let editor: Editor;
  try {
    editor = Editor.create(text);
  } catch {
    return null;
  }
  const result = editor.apply({ op: 'setScalar', keys: ['defaults', 'currency'], value: code });
  return result.ok ? editor.text() : null;
}
