// The tutorial launcher: the through-course's chapters and the topic shorts,
// each with what the reader has finished, a resume entry point for the course,
// and a restart. Opened from Help; it never starts anything by itself, so a
// reader who opens it out of curiosity can close it and lose nothing.

import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import type { CourseCopy } from './copy';
import { chapterTitle, topicSubtitle } from './copy';
import { chapterProgress, resumeAt } from './model';
import type { TutorialCourse, TutorialProgress, TutorialTopic } from './types';

export interface TutorialDialogProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly course: TutorialCourse;
  readonly topics: readonly TutorialTopic[];
  readonly copy: CourseCopy;
  readonly progress: TutorialProgress;
  /** Start (or re-enter) the course at a chapter. */
  readonly onStart: (chapter: number) => void;
  /** Start a topic short (index into `topics`). */
  readonly onStartTopic: (topic: number) => void;
  /** Forget the recorded progress. */
  readonly onRestart: () => void;
  readonly labels: {
    readonly title: string;
    readonly close: string;
    readonly resume: string;
    readonly start: string;
    readonly restart: string;
    readonly complete: string;
    /** Renders as "3 / 7". */
    readonly count: (done: number, total: number) => string;
  };
}

function ProgressBadge({
  done,
  total,
  completeLabel,
  count,
}: {
  done: number;
  total: number;
  completeLabel: string;
  count: (done: number, total: number) => string;
}) {
  const finished = done === total;
  return (
    <span className={`shrink-0 text-xs ${finished ? 'font-semibold text-accent' : 'text-muted'}`}>
      {finished ? completeLabel : count(done, total)}
    </span>
  );
}

export function TutorialDialog({
  open,
  onClose,
  course,
  topics,
  copy,
  progress,
  onStart,
  onStartTopic,
  onRestart,
  labels,
}: TutorialDialogProps) {
  const resume = resumeAt(course, progress);
  // "Resume" only means something to a reader who is part-way through the
  // course: with nothing done (or everything done) the honest word is "start".
  const started = progress.completed.length > 0 && resume !== null;
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={labels.title}
      closeLabel={labels.close}
      footer={
        <>
          <Button variant="ghost" onClick={onRestart}>
            {labels.restart}
          </Button>
          <Button
            onClick={() => onStart(resume === null ? 0 : resume.chapter)}
            data-testid="tutorial-resume"
          >
            {started ? labels.resume : labels.start}
          </Button>
        </>
      }
    >
      <p className="mb-3 text-xs text-muted">{copy.launcher.intro}</p>

      <div className="mb-1 mt-3.5 flex items-center gap-2 text-xs font-semibold text-muted first:mt-0">
        {copy.launcher.sectionCourse}
        <span className="h-px flex-1 bg-border" />
      </div>
      <ol className="m-0 flex list-none flex-col gap-0.5 p-0">
        {course.chapters.map((chapter, index) => {
          const done = chapterProgress(course, progress, index);
          return (
            <li key={chapter.id}>
              <button
                type="button"
                onClick={() => onStart(index)}
                className="flex w-full cursor-pointer items-baseline justify-between gap-3 rounded-md border-0 bg-transparent px-2 py-1.5 text-left text-text hover:bg-bg"
              >
                <span className="text-sm">{chapterTitle(copy, chapter.id)}</span>
                <ProgressBadge
                  done={done.done}
                  total={done.total}
                  completeLabel={labels.complete}
                  count={labels.count}
                />
              </button>
            </li>
          );
        })}
      </ol>

      <div className="mb-1 mt-3.5 flex items-center gap-2 text-xs font-semibold text-muted">
        {copy.launcher.sectionTopics}
        <span className="h-px flex-1 bg-border" />
      </div>
      <ol className="m-0 flex list-none flex-col gap-0.5 p-0">
        {topics.map((topic, index) => {
          const done = chapterProgress(topic, progress, 0);
          const subtitle = topicSubtitle(copy, topic.id);
          return (
            <li key={topic.id}>
              <button
                type="button"
                onClick={() => onStartTopic(index)}
                className="flex w-full cursor-pointer items-baseline justify-between gap-3 rounded-md border-0 bg-transparent px-2 py-1.5 text-left text-text hover:bg-bg"
              >
                <span className="flex flex-col">
                  <span className="text-sm">{chapterTitle(copy, topic.id)}</span>
                  {subtitle !== null && <span className="text-xs text-muted">{subtitle}</span>}
                </span>
                <ProgressBadge
                  done={done.done}
                  total={done.total}
                  completeLabel={labels.complete}
                  count={labels.count}
                />
              </button>
            </li>
          );
        })}
      </ol>
    </Modal>
  );
}
