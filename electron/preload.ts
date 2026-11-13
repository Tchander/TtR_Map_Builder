import { contextBridge, ipcRenderer } from 'electron';
import type { DesktopApi } from '../src/bridge';

const api: DesktopApi = {
  openProject: () => ipcRenderer.invoke('project:open'),
  saveProject: (project, saveAs) => ipcRenderer.invoke('project:save', project, saveAs),
  resetPath: () => ipcRenderer.invoke('project:reset'),
  importImage: () => ipcRenderer.invoke('image:open'),
  exportFile: (kind, data) => ipcRenderer.invoke('file:export', kind, data),
  confirmUnsaved: () => ipcRenderer.invoke('project:confirm'),
  setDirty: dirty => ipcRenderer.send('project:dirty', dirty),
  onCloseRequested: callback => {
    const handler = () => callback();
    ipcRenderer.on('window:close-request', handler);
    return () => ipcRenderer.removeListener('window:close-request', handler);
  },
  finishClose: () => ipcRenderer.send('window:close-approved'),
};
contextBridge.exposeInMainWorld('desktop', api);
