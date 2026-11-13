export function pngDimensions(widthMm: number, heightMm: number, dpi: number) {
  const width = Math.max(1, Math.round(widthMm / 25.4 * dpi));
  const height = Math.max(1, Math.round(heightMm / 25.4 * dpi));
  if (!Number.isFinite(width) || !Number.isFinite(height) || width > 16_384 || height > 16_384 || width * height > 100_000_000) {
    throw new Error('PNG слишком большой: максимум 16 384 px на сторону и 100 Мп. Уменьшите DPI или экспортируйте SVG.');
  }
  return { width, height };
}
export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
/** Replace density metadata without recompressing or modifying image pixels. */
export function withPngDpi(bytes: Uint8Array, dpi: number): Uint8Array {
  if (bytes.length < 33 || ![137, 80, 78, 71, 13, 10, 26, 10].every((value, i) => bytes[i] === value)) throw new Error('Некорректный PNG.');
  const chunk = new Uint8Array(21);
  const view = new DataView(chunk.buffer);
  view.setUint32(0, 9);
  chunk.set([112, 72, 89, 115], 4); // pHYs
  const ppm = Math.round(dpi / 0.0254);
  view.setUint32(8, ppm); view.setUint32(12, ppm); chunk[16] = 1;
  view.setUint32(17, crc32(chunk.subarray(4, 17)));
  const parts: Uint8Array[] = [bytes.subarray(0, 8)];
  const input = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let at = 8; at < bytes.length;) {
    if (at + 12 > bytes.length) throw new Error('Некорректный PNG.');
    const length = input.getUint32(at), end = at + length + 12;
    if (end > bytes.length) throw new Error('Некорректный PNG.');
    const type = String.fromCharCode(...bytes.subarray(at + 4, at + 8));
    if (type !== 'pHYs') parts.push(bytes.subarray(at, end));
    if (type === 'IHDR') parts.push(chunk);
    at = end;
  }
  const output = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) { output.set(part, offset); offset += part.length; }
  return output;
}
export async function rasterizeSvg(svg: string, width: number, height: number, dpi: number): Promise<Uint8Array> {
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
  const canvas = document.createElement('canvas');
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    canvas.width = width; canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Не удалось создать PNG. Попробуйте меньшее разрешение.');
    context.drawImage(image, 0, 0, width, height);
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('Не удалось создать PNG. Уменьшите DPI.')), 'image/png'));
    return withPngDpi(new Uint8Array(await blob.arrayBuffer()), dpi);
  } finally { URL.revokeObjectURL(url); canvas.width = 0; canvas.height = 0; }
}
