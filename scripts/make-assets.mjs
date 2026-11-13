import { PNG } from 'pngjs';
import { mkdir, writeFile } from 'node:fs/promises';

await mkdir('assets', { recursive: true });
const png = new PNG({ width: 256, height: 256 });
for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {
  const i = (y * 256 + x) * 4;
  const cx = Math.max(32, Math.min(223, x)), cy = Math.max(32, Math.min(223, y));
  const inside = (x - cx) ** 2 + (y - cy) ** 2 <= 32 ** 2;
  let color = [180, 93, 66];
  const circle = (px, py, r) => (x - px) ** 2 + (y - py) ** 2 <= r * r;
  const path = ((x > 60 && x < 100 && y > 154 && y < 177) || (x > 110 && x < 142 && y > 120 && y < 143) || (x > 150 && x < 186 && y > 84 && y < 107));
  if (path || circle(57, 187, 17) || circle(201, 69, 17)) color = [255, 249, 236];
  png.data.set([...color, inside ? 255 : 0], i);
}
const bytes = PNG.sync.write(png);
await writeFile('assets/icon.png', bytes);
const header = Buffer.alloc(22);
header.writeUInt16LE(1, 2); header.writeUInt16LE(1, 4);
header.writeUInt16LE(1, 10); header.writeUInt16LE(32, 12);
header.writeUInt32LE(bytes.length, 14); header.writeUInt32LE(22, 18);
await writeFile('assets/icon.ico', Buffer.concat([header, bytes]));
