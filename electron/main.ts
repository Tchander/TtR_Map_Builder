import { app, BrowserWindow, Menu, dialog, ipcMain, nativeImage, type IpcMainInvokeEvent } from 'electron';
import { readFile, writeFile, rename, unlink, stat } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { parseProject, parseProjectText, serializeProject } from '../src/model';
import type { Result } from '../src/bridge';

let window: BrowserWindow;
let projectPath: string | null = null;
let dirty = false;
let allowClose = false;
const MAX_FILE = 150 * 1024 * 1024;

async function atomicWrite(filename: string, content: string | Uint8Array) {
  const temporary = `${filename}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, content, { flag: 'wx' });
    await rename(temporary, filename);
  } finally { await unlink(temporary).catch(() => {}); }
}
function handle<T>(channel: string, fn: (...args: any[]) => Promise<T>) {
  ipcMain.handle(channel, async (event: IpcMainInvokeEvent, ...args: any[]): Promise<Result<T>> => {
    if (event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame) return { ok: false, error: 'Недопустимый запрос.' };
    try { return { ok: true, value: await fn(...args) }; }
    catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      const friendly = code === 'EACCES' || code === 'EPERM' ? 'Нет доступа к файлу. Выберите другую папку или закройте файл в другой программе.'
        : code === 'ENOSPC' ? 'Недостаточно места на диске.'
          : code === 'ENOENT' ? 'Файл или папка не найдены.' : error instanceof Error ? error.message : 'Не удалось выполнить операцию.';
      return { ok: false, error: friendly };
    }
  });
}
function verifyImage(dataUrl: string) {
  const image = nativeImage.createFromDataURL(dataUrl);
  if (image.isEmpty()) throw new Error('Не удалось прочитать изображение подложки.');
  const { width, height } = image.getSize();
  if (width * height > 100_000_000) throw new Error('Подложка слишком большая. Максимум 100 мегапикселей.');
  return { pixelWidth: width, pixelHeight: height };
}
function setupIpc() {
  handle('project:open', async () => {
    const result = await dialog.showOpenDialog(window, { title: 'Открыть проект', filters: [{ name: 'Проект TtR Map Builder', extensions: ['json'] }], properties: ['openFile'] });
    if (result.canceled || !result.filePaths[0]) return null;
    const filename = result.filePaths[0];
    if ((await stat(filename)).size > MAX_FILE) throw new Error('Файл проекта превышает 150 МБ.');
    const project = parseProjectText(await readFile(filename, 'utf8'));
    if (project.background) verifyImage(project.background.dataUrl);
    projectPath = filename;
    return { project, path: filename };
  });
  handle('project:save', async (input: unknown, saveAs: boolean) => {
    const project = parseProject(input);
    let filename = projectPath;
    if (!filename || saveAs) {
      const result = await dialog.showSaveDialog(window, { title: 'Сохранить проект', defaultPath: filename ?? 'Моя карта.ttrmap.json', filters: [{ name: 'Проект TtR Map Builder', extensions: ['ttrmap.json'] }] });
      if (result.canceled || !result.filePath) return null;
      filename = /\.json$/i.test(result.filePath) ? result.filePath : `${result.filePath}.ttrmap.json`;
    }
    await atomicWrite(filename, serializeProject(project));
    projectPath = filename;
    return filename;
  });
  ipcMain.handle('project:reset', () => { projectPath = null; });
  handle('image:open', async () => {
    const result = await dialog.showOpenDialog(window, { title: 'Загрузить подложку', filters: [{ name: 'Изображение', extensions: ['png', 'jpg', 'jpeg'] }], properties: ['openFile'] });
    if (result.canceled || !result.filePaths[0]) return null;
    const filename = result.filePaths[0];
    if ((await stat(filename)).size > 75 * 1024 * 1024) throw new Error('Изображение превышает 75 МБ.');
    const bytes = await readFile(filename);
    const png = bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
    if (!png && !jpeg) throw new Error('Поддерживаются изображения PNG и JPEG.');
    const dataUrl = `data:image/${png ? 'png' : 'jpeg'};base64,${bytes.toString('base64')}`;
    return { dataUrl, name: path.basename(filename), ...verifyImage(dataUrl) };
  });
  handle('file:export', async (kind: unknown, data: unknown) => {
    if (kind !== 'svg' && kind !== 'png') throw new Error('Неизвестный формат экспорта.');
    if (kind === 'svg' && typeof data !== 'string') throw new Error('Некорректные данные SVG.');
    if (kind === 'png' && !(data instanceof Uint8Array)) throw new Error('Некорректные данные PNG.');
    const content = data as string | Uint8Array;
    if (content.length > 500_000_000) throw new Error('Экспортируемый файл слишком большой.');
    const name = projectPath ? path.basename(projectPath).replace(/(\.ttrmap)?\.json$/i, '') : 'Моя карта';
    const result = await dialog.showSaveDialog(window, { title: `Экспорт ${kind.toUpperCase()}`, defaultPath: `${name}.${kind}`, filters: [{ name: kind.toUpperCase(), extensions: [kind] }] });
    if (result.canceled || !result.filePath) return null;
    const filename = result.filePath.toLowerCase().endsWith(`.${kind}`) ? result.filePath : `${result.filePath}.${kind}`;
    await atomicWrite(filename, content);
    return filename;
  });
  ipcMain.handle('project:confirm', async () => {
    const result = await dialog.showMessageBox(window, { type: 'question', title: 'Несохранённые изменения', message: 'Сохранить изменения в проекте?', detail: 'После закрытия несохранённые изменения будут потеряны.', buttons: ['Сохранить', 'Не сохранять', 'Отмена'], defaultId: 0, cancelId: 2, noLink: true });
    return ['save', 'discard', 'cancel'][result.response];
  });
  ipcMain.on('project:dirty', (event, value) => {
    if (event.sender === window.webContents) { dirty = value === true; window.setDocumentEdited(dirty); }
  });
  ipcMain.on('window:close-approved', event => {
    if (event.sender === window.webContents) { allowClose = true; window.close(); }
  });
}

app.setName('TtR Map Builder');
app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  window = new BrowserWindow({
    width: 1440, height: 940, minWidth: 1080, minHeight: 700,
    title: 'TtR Map Builder', backgroundColor: '#f7f8fa',
    icon: path.join(__dirname, '../assets/icon.png'), show: false,
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), nodeIntegration: false, contextIsolation: true, sandbox: true, spellcheck: false },
  });
  setupIpc();
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', event => event.preventDefault());
  window.webContents.session.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
  window.once('ready-to-show', () => window.show());
  window.on('close', event => {
    if (!allowClose) { event.preventDefault(); window.webContents.send('window:close-request'); }
  });
  if (!app.isPackaged && process.env.VITE_DEV_SERVER_URL) window.loadURL(process.env.VITE_DEV_SERVER_URL);
  else window.loadFile(path.join(__dirname, '../dist/index.html'));
});
app.on('window-all-closed', () => app.quit());
