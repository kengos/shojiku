// The data-item editor's definition ACTIONS and what follows them: a plain edit
// (refused at the edit-list cap), the definitions undo (refused when its
// template / sample reverse cannot be applied), and rename / delete — after
// which the selection follows the renamed node or moves to the deleted one's
// parent, and the rail's status line says what happened.

import type { Op } from '@shojiku/designer-core';
import { useState } from 'react';
import { useI18n } from '../i18n/context';
import { MAX_DEFS_EDITS } from './defsPlan';
import type { DefsNode } from './defsTree';
import type { RestructureActions } from './detailContext';
import { SELECTION_SEP } from './editorModel';
import type { RestructureHost } from './editorProps';
import { useRefusalText } from './RenameForm';
import type { RefIndex } from './refs/types';
import { renameRefusal } from './renamePlan';
import { nodeLabel } from './treeModel';

export interface NodeActionsOptions {
  readonly tree: DefsNode | null;
  readonly definitions: string;
  readonly refs: RefIndex | null;
  readonly editable: boolean;
  readonly projectScoped: boolean;
  readonly sampleReadOnly: boolean;
  readonly onDefinitionEdit?: (op: Op) => boolean | undefined;
  readonly onUndoDefinition?: () => boolean | readonly string[] | undefined;
  readonly restructure?: RestructureHost;
  readonly select: (id: string | null) => void;
}

export interface NodeActions {
  readonly notice: string | null;
  readonly dispatchDefEdit: (op: Op | null) => boolean;
  readonly undo?: () => void;
  readonly actions?: RestructureActions;
}

/** The selection id of a node's parent: its keys path without its own
 * `properties` + name, and without the `items` step into a table's rows. */
function parentId(node: DefsNode): string {
  const keys = node.keysPath.slice(0, -2);
  return (keys[keys.length - 1] === 'items' ? keys.slice(0, -1) : keys).join(SELECTION_SEP);
}

export function useNodeActions(options: NodeActionsOptions): NodeActions {
  const { tree, definitions, refs, onDefinitionEdit, onUndoDefinition, restructure, select } =
    options;
  const { t } = useI18n();
  const refusalText = useRefusalText();
  const [notice, setNotice] = useState<string | null>(null);
  const capNotice = () => t('data.error.edit_cap', { edits: MAX_DEFS_EDITS, undo: t('data.undo') });

  const dispatchDefEdit = (op: Op | null): boolean => {
    if (op === null || onDefinitionEdit === undefined) {
      return true;
    }
    const accepted = onDefinitionEdit(op) !== false;
    setNotice(accepted ? null : capNotice());
    return accepted;
  };

  const undo =
    onUndoDefinition === undefined
      ? undefined
      : () => {
          const outcome = onUndoDefinition();
          setNotice(outcome === false ? t('data.notice.undoRefused') : null);
          // An undone rename puts the node back under its old name: keep it
          // selected there rather than dropping the selection.
          if (Array.isArray(outcome)) {
            select(outcome.join(SELECTION_SEP));
          }
        };

  const actions: RestructureActions | undefined =
    restructure === undefined || !options.editable || tree === null
      ? undefined
      : {
          projectScoped: options.projectScoped,
          sampleReadOnly: options.sampleReadOnly,
          check: (node, name) => renameRefusal({ definitions, refs }, node, name),
          rename: (node, name) => {
            const refusal = restructure.rename(node, name);
            if (refusal === null) {
              select([...node.keysPath.slice(0, -1), name].join(SELECTION_SEP));
              setNotice(null);
            }
            return refusal;
          },
          remove: (node) => {
            const refusal = restructure.remove(node);
            if (refusal !== null) {
              setNotice(refusalText(refusal, node.name));
              return;
            }
            select(parentId(node));
            setNotice(t('data.notice.deleted', { label: nodeLabel(node), undo: t('data.undo') }));
          },
        };

  return { notice, dispatchDefEdit, undo, actions };
}
