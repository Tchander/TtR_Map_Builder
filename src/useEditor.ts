import { useCallback, useRef, useState } from 'react';
import { createProject, type Project } from './model';
import { commit, initialHistory, undo, redo, type History } from './history';

export function useEditor() {
  const [history, setHistory] = useState(() => initialHistory(createProject()));
  const ref = useRef(history);
  const replace = useCallback((next: History) => { ref.current = next; setHistory(next); }, []);
  const edit = useCallback((update: (project: Project) => Project) => {
    replace(commit(ref.current, update(ref.current.present)));
  }, [replace]);
  const preview = useCallback((next: Project) => replace({ ...ref.current, present: next }), [replace]);
  const finish = useCallback((before: Project) => replace(commit(ref.current, ref.current.present, before)), [replace]);
  const reset = useCallback((next: Project) => replace(initialHistory(next)), [replace]);
  return {
    project: history.present, edit, preview, finish, reset,
    current: useCallback(() => ref.current.present, []),
    undo: useCallback(() => replace(undo(ref.current)), [replace]),
    redo: useCallback(() => replace(redo(ref.current)), [replace]),
    canUndo: history.past.length > 0, canRedo: history.future.length > 0,
  };
}
export type Editor = ReturnType<typeof useEditor>;
