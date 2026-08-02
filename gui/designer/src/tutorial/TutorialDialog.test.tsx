import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { courseCopy } from './copy';
import { TutorialDialog } from './TutorialDialog';
import type { TutorialProgress } from './types';

const LABELS = {
  title: 'Tutorial',
  close: 'Close',
  resume: 'Resume',
  start: 'Start the course',
  restart: 'Clear progress',
  complete: 'Done',
  count: (done: number, total: number) => `${done} / ${total}`,
};

const autoStep = (id: string) =>
  ({ id, anchor: { kind: 'panel', selector: 'panel' }, done: { auto: true } }) as const;

// Two real topic ids so the merged title/subtitle copy resolves them, plus one
// with no copy at all — its title falls back to the id and it renders no
// subtitle (the null-subtitle branch). Topics carry TWO steps so their `/ 2`
// badges never collide with the course's single-step ch1 (`0 / 1`).
const TOPICS = [
  {
    id: 'topic-containers',
    chapters: [
      {
        id: 'topic-containers',
        seed: 't0',
        steps: [autoStep('topic-containers.a'), autoStep('topic-containers.b')],
      },
    ],
  },
  {
    id: 'topic-binding',
    chapters: [
      {
        id: 'topic-binding',
        seed: 't1',
        steps: [autoStep('topic-binding.a'), autoStep('topic-binding.b')],
      },
    ],
  },
  {
    id: 'topic-nosub',
    chapters: [
      {
        id: 'topic-nosub',
        seed: 't2',
        steps: [autoStep('topic-nosub.a'), autoStep('topic-nosub.b')],
      },
    ],
  },
];

function draw(progress: TutorialProgress) {
  const onStart = vi.fn();
  const onStartTopic = vi.fn();
  const onRestart = vi.fn();
  const onClose = vi.fn();
  render(
    <TutorialDialog
      open
      onClose={onClose}
      course={{
        id: 'test',
        chapters: [
          { id: 'ch0', seed: 's0', steps: [autoStep('ch0.a'), autoStep('ch0.b')] },
          { id: 'ch1', seed: 's1', steps: [autoStep('ch1.a')] },
        ],
      }}
      topics={TOPICS}
      copy={courseCopy('en')}
      progress={progress}
      onStart={onStart}
      onStartTopic={onStartTopic}
      onRestart={onRestart}
      labels={LABELS}
    />,
  );
  return { onStart, onStartTopic, onRestart, onClose };
}

describe('TutorialDialog', () => {
  it('lists every chapter with how much of it is finished', () => {
    draw({ completed: ['ch0.a'], dismissed: false });
    expect(screen.getByText('A blank page and its setup')).toBeTruthy();
    expect(screen.getByText('1 / 2')).toBeTruthy();
    expect(screen.getByText('0 / 1')).toBeTruthy();
  });

  it('marks a finished chapter as done rather than counting it', () => {
    draw({ completed: ['ch0.a', 'ch0.b'], dismissed: false });
    expect(screen.getByText('Done')).toBeTruthy();
  });

  it('offers to start from the top for a first-time reader', () => {
    const { onStart } = draw({ completed: [], dismissed: false });
    const action = screen.getByTestId('tutorial-resume');
    expect(action.textContent).toBe('Start the course');
    fireEvent.click(action);
    expect(onStart).toHaveBeenCalledWith(0);
  });

  it('resumes at the chapter holding the first unfinished step', () => {
    const { onStart } = draw({ completed: ['ch0.a', 'ch0.b'], dismissed: false });
    const action = screen.getByTestId('tutorial-resume');
    expect(action.textContent).toBe('Resume');
    fireEvent.click(action);
    expect(onStart).toHaveBeenCalledWith(1);
  });

  it('offers a restart once the course is finished', () => {
    const { onStart } = draw({ completed: ['ch0.a', 'ch0.b', 'ch1.a'], dismissed: false });
    expect(screen.getByTestId('tutorial-resume').textContent).toBe('Start the course');
    fireEvent.click(screen.getByTestId('tutorial-resume'));
    expect(onStart).toHaveBeenCalledWith(0);
  });

  it('starts a chapter picked directly from the list', () => {
    const { onStart } = draw({ completed: [], dismissed: false });
    fireEvent.click(screen.getByText('A title, and how text is styled'));
    expect(onStart).toHaveBeenCalledWith(1);
  });

  it('clears recorded progress on request', () => {
    const { onRestart } = draw({ completed: ['ch0.a'], dismissed: false });
    fireEvent.click(screen.getByRole('button', { name: 'Clear progress' }));
    expect(onRestart).toHaveBeenCalledOnce();
  });

  it('closes from the × and from Escape', () => {
    const { onClose } = draw({ completed: [], dismissed: false });
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledOnce();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose.mock.calls.length).toBeGreaterThan(1);
  });

  it('lists the topics under their own section, with title, subtitle and progress', () => {
    // topic-containers fully done (2/2 → complete); topic-binding half (1/2).
    draw({
      completed: ['topic-containers.a', 'topic-containers.b', 'topic-binding.a'],
      dismissed: false,
    });
    expect(screen.getByText('Full course')).toBeTruthy();
    expect(screen.getByText('Topics (focused, 2–3 min)')).toBeTruthy();
    expect(screen.getByText('Containers and arrangement')).toBeTruthy();
    expect(screen.getByText('Stacking, tables, nesting, adding slots')).toBeTruthy();
    // The subtitle-less topic falls back to its id and renders no subtitle.
    expect(screen.getByText('topic-nosub')).toBeTruthy();
    // A half-done topic shows its own `/ 2` count (unique — the course uses /2 and /1).
    expect(screen.getByText('1 / 2')).toBeTruthy();
  });

  it('starts a topic picked from the topics section', () => {
    const { onStartTopic } = draw({ completed: [], dismissed: false });
    fireEvent.click(screen.getByText('Data binding'));
    expect(onStartTopic).toHaveBeenCalledWith(1);
  });

  it('shows the practice-document trust note', () => {
    draw({ completed: [], dismissed: false });
    expect(screen.getByText(/your own document is never changed/)).toBeTruthy();
  });
});
