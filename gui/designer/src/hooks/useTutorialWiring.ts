// The in-app tutorial's wiring. The tutorial reads and replaces the document
// through the SAME surfaces the user's own actions use; it holds no editor of
// its own. Its whole view of the world is: ops the editor committed, the
// selection, how many pages the engine produced, and a closed set of UI moments
// that change no template bytes. Nothing here reads the DOM.

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { EditorController } from '../editor/useEditor';
import type { I18n } from '../i18n/context';
import { activeText, type SampleSet, updateActive } from '../sample/variants';
import { type CourseCopy, chapterTitle, courseCopy, stepCopy } from '../tutorial/copy';
import { COURSE } from '../tutorial/course';
import { TOPICS } from '../tutorial/topics';
import type { TutorialStore, UiEventId } from '../tutorial/types';
import { type TutorialController, useTutorial } from '../tutorial/useTutorial';

export interface TutorialWiringOptions {
  readonly editor: EditorController;
  readonly sampleSetRef: { readonly current: SampleSet };
  readonly commitSet: (next: SampleSet) => void;
  /** A whole-document swap reseeds the save/export review's baseline. */
  readonly setBaselineText: (text: string) => void;
  readonly selection: string | null;
  readonly pageCount: number;
  readonly tutorialStore: TutorialStore | undefined;
  readonly locale: string;
  readonly t: I18n['t'];
}

export interface TutorialWiring {
  readonly tutorial: TutorialController;
  readonly tutorialCopy: CourseCopy;
  /** What the coach mark shows for the active step: its sentence, the chapter it
   * belongs to, and how far in the reader is. Null while no session is running. */
  readonly currentStep: {
    readonly copy: string;
    readonly title: string;
    readonly progressLabel: string;
    readonly manual: boolean;
  } | null;
  readonly tutorialOpen: boolean;
  readonly closeTutorial: () => void;
  readonly openTutorial: () => void;
  /** Offered, never imposed: the suggestion appears only for a reader with no
   * recorded progress, and dismissing it is remembered. */
  readonly showTutorialHint: boolean;
  readonly uiEvent: (id: UiEventId) => void;
}

export function useTutorialWiring({
  editor,
  sampleSetRef,
  commitSet,
  setBaselineText,
  selection,
  pageCount,
  tutorialStore,
  locale,
  t,
}: TutorialWiringOptions): TutorialWiring {
  const [tutorialOpen, setTutorialOpen] = useState(false);
  const tutorial = useTutorial(
    COURSE,
    TOPICS,
    {
      currentText: () => editor.text,
      currentParams: () => activeText(sampleSetRef.current),
      setText: (text) => {
        editor.replaceDocument(text);
        setBaselineText(text);
      },
      setParams: (next) => commitSet(updateActive(sampleSetRef.current, next)),
    },
    tutorialStore,
  );
  const tutorialCopy = useMemo(() => courseCopy(locale), [locale]);
  const currentStep = useMemo(() => {
    if (tutorial.session === null) {
      return null;
    }
    const { unit, chapter, step } = tutorial.session;
    const chapterData = unit.chapters[chapter];
    const stepData = chapterData.steps[step];
    const copy = stepCopy(tutorialCopy, stepData.copyId ?? stepData.id);
    /* v8 ignore next 3 -- unreachable: the drift test pins a sentence in both languages for every course AND topic step id, so a step without copy cannot ship. */
    if (copy === null) {
      return null;
    }
    const before = unit.chapters
      .slice(0, chapter)
      .reduce((sum, entry) => sum + entry.steps.length, 0);
    const total = unit.chapters.reduce((sum, entry) => sum + entry.steps.length, 0);
    return {
      copy,
      title: chapterTitle(tutorialCopy, chapterData.id),
      progressLabel: t('tutorial.count', { done: before + step + 1, total }),
      manual: 'auto' in stepData.done,
    };
  }, [tutorial.session, tutorialCopy, t]);
  const closeTutorial = useCallback(() => setTutorialOpen(false), []);
  const openTutorial = () => {
    tutorial.reload();
    setTutorialOpen(true);
  };
  const observe = tutorial.observe;
  useEffect(
    () => editor.subscribe((change) => observe({ kind: 'ops', ops: change.ops })),
    [editor.subscribe, observe],
  );
  useEffect(() => {
    observe({ kind: 'selection', path: selection });
  }, [selection, observe]);
  useEffect(() => {
    observe({ kind: 'pageCount', count: pageCount });
  }, [pageCount, observe]);
  const uiEvent = useCallback((id: UiEventId) => observe({ kind: 'ui', id }), [observe]);
  const reloadTutorial = tutorial.reload;
  useEffect(() => {
    reloadTutorial();
  }, [reloadTutorial]);
  const showTutorialHint =
    tutorial.session === null &&
    !tutorial.progress.dismissed &&
    tutorial.progress.completed.length === 0;

  return {
    tutorial,
    tutorialCopy,
    currentStep,
    tutorialOpen,
    closeTutorial,
    openTutorial,
    showTutorialHint,
    uiEvent,
  };
}
