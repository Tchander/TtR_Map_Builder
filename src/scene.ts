import { colorHex, type ProjectV1, type MapObject } from './model';

export const xml = (text: string) => text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
export function objectMarkup(object: MapObject, sizes: ProjectV1['sizes'], interactive = false): string {
  const id = interactive ? ` data-object-id="${xml(object.id)}"` : '';
  if (object.type === 'wagon') {
    const stroke = Math.min(0.45, sizes.wagonLength / 4, sizes.wagonWidth / 4);
    const width = sizes.wagonLength - stroke, height = sizes.wagonWidth - stroke;
    const radius = Math.min(1.2, height / 4, width / 4);
    return `<g${id} transform="translate(${object.x} ${object.y}) rotate(${object.angle})"><rect x="${-width / 2}" y="${-height / 2}" width="${width}" height="${height}" rx="${radius}" fill="${colorHex(object.color)}" stroke="#34383e" stroke-width="${stroke}"/></g>`;
  }
  const stroke = Math.min(0.5, sizes.cityDiameter / 5);
  const label = object.name ? `<text${interactive ? ' data-part="label"' : ''} x="${object.labelOffset.x}" y="${object.labelOffset.y}" font-family="Arial, sans-serif" font-size="3.5" font-weight="600" fill="#293440" stroke="white" stroke-width="0.9" stroke-linejoin="round" paint-order="stroke fill">${xml(object.name)}</text>` : '';
  return `<g${id} transform="translate(${object.x} ${object.y})"><circle r="${(sizes.cityDiameter - stroke) / 2}" fill="white" stroke="#34383e" stroke-width="${stroke}"/>${label}</g>`;
}
export function backgroundMarkup(project: ProjectV1): string {
  const bg = project.background;
  if (!bg || !bg.visible) return '';
  return `<image href="${xml(bg.dataUrl)}" x="${bg.x}" y="${bg.y}" width="${bg.width}" height="${bg.height}" opacity="${bg.opacity}" preserveAspectRatio="none"/>`;
}
export function sceneMarkup(project: ProjectV1, interactive = false): string {
  // Cities stay above the wagon network, independently of creation order.
  return [...project.objects.filter(o => o.type === 'wagon'), ...project.objects.filter(o => o.type === 'city')]
    .map(object => objectMarkup(object, project.sizes, interactive)).join('');
}
export function exportSvg(project: ProjectV1, includeBackground = true): string {
  const { width, height } = project.board;
  return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${width}mm" height="${height}mm" viewBox="0 0 ${width} ${height}" overflow="hidden"><defs><clipPath id="board"><rect width="${width}" height="${height}"/></clipPath></defs><g clip-path="url(#board)"><rect width="${width}" height="${height}" fill="white"/>${includeBackground ? backgroundMarkup(project) : ''}${sceneMarkup(project)}</g></svg>`;
}
