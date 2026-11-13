import { copyFile } from 'node:fs/promises';
await copyFile('release/TtR Map Builder.exe', 'TtR Map Builder.exe');
console.log('Готово: TtR Map Builder.exe');
