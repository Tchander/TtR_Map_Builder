import type { ProjectV1 } from './model';

export interface History { past: ProjectV1[]; present: ProjectV1; future: ProjectV1[] }
export const initialHistory = (present: ProjectV1): History => ({ past: [], present, future: [] });
export function commit(history: History, present: ProjectV1, before = history.present): History {
  if (JSON.stringify(before) === JSON.stringify(present)) return { ...history, present: before };
  return { past: [...history.past, before].slice(-100), present, future: [] };
}
export function undo(history: History): History {
  if (!history.past.length) return history;
  return { past: history.past.slice(0, -1), present: history.past.at(-1)!, future: [history.present, ...history.future] };
}
export function redo(history: History): History {
  if (!history.future.length) return history;
  return { past: [...history.past, history.present], present: history.future[0], future: history.future.slice(1) };
}
