import type { Project } from './model';

export type Result<T> = { ok: true; value: T } | { ok: false; error: string };
export interface ImageAsset { dataUrl: string; name: string; pixelWidth: number; pixelHeight: number }
export interface DesktopApi {
  openProject(): Promise<Result<{ project: Project; path: string } | null>>;
  saveProject(project: Project, saveAs: boolean): Promise<Result<string | null>>;
  resetPath(): Promise<void>;
  importImage(): Promise<Result<ImageAsset | null>>;
  exportFile(kind: 'svg' | 'png', data: string | Uint8Array): Promise<Result<string | null>>;
  confirmUnsaved(): Promise<'save' | 'discard' | 'cancel'>;
  setDirty(dirty: boolean): void;
  onCloseRequested(callback: () => void): () => void;
  finishClose(): void;
}
declare global { interface Window { desktop: DesktopApi } }
