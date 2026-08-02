// The tutorial's two surfaces: the chapter/topic launcher dialog and the coach
// mark that walks a running course. Both read the tutorial wiring; the step
// state lives there, never here.

import type { TutorialWiring } from '../hooks/useTutorialWiring';
import { useI18n } from '../i18n/context';
import { CoachOverlay } from '../tutorial/CoachOverlay';
import { COURSE } from '../tutorial/course';
import { TutorialDialog } from '../tutorial/TutorialDialog';
import { TOPICS } from '../tutorial/topics';

export interface TutorialSurfacesProps {
  readonly tutorial: TutorialWiring;
}

export function TutorialSurfaces({ tutorial }: TutorialSurfacesProps) {
  const { t } = useI18n();
  const { currentStep } = tutorial;
  return (
    <>
      <TutorialDialog
        open={tutorial.tutorialOpen}
        onClose={tutorial.closeTutorial}
        course={COURSE}
        topics={TOPICS}
        copy={tutorial.tutorialCopy}
        progress={tutorial.tutorial.progress}
        onStart={(chapter) => {
          tutorial.closeTutorial();
          tutorial.tutorial.start(COURSE, chapter);
        }}
        onStartTopic={(index) => {
          tutorial.closeTutorial();
          tutorial.tutorial.start(TOPICS[index], 0);
        }}
        onRestart={tutorial.tutorial.restart}
        labels={{
          title: t('tutorial.title'),
          close: t('help.close'),
          resume: t('tutorial.resume'),
          start: t('tutorial.start'),
          restart: t('tutorial.restart'),
          complete: t('tutorial.complete'),
          count: (done, total) => t('tutorial.count', { done, total }),
        }}
      />
      {currentStep === null ? null : (
        <CoachOverlay
          copy={currentStep.copy}
          title={currentStep.title}
          progressLabel={currentStep.progressLabel}
          rect={tutorial.tutorial.rect}
          nextLabel={t('tutorial.next')}
          exitLabel={t('tutorial.exit')}
          onNext={currentStep.manual ? tutorial.tutorial.next : undefined}
          onExit={tutorial.tutorial.stop}
        />
      )}
    </>
  );
}
