import { colorHex, wagonColor, type Project, type MapObject, type Wagon } from './model';
import { connectionPoints, routeConnections } from './routes';

export const xml = (text: string) => text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
function wagonDecoration(wagon: Wagon, width: number, height: number): string {
  if (wagon.kind === 'locomotive') {
    // A side-on steam engine with a cab window, chimney, cowcatcher and drive wheels.
    const scale = Math.min(width / 31, height / 17);
    return `<g transform="scale(${wagon.locomotiveFlipped ? -scale : scale} ${scale})" fill="#242831">
      <path fill-rule="evenodd" d="M-13-6H-3V-4H-4V-1H0V-3H3V-1H6V-5H5V-6H10V-5H9V0Q11 0 11 2V3L14 5H-13V3H-12V-4H-13ZM-10-4V-1H-7V-4Z"/>
      <path d="M5-8Q6-10 8-9Q10-11 12-10Q14-9 15-10Q13-7 10-8Q8-7 5-8Z" transform="translate(-1 1.7) scale(.8)"/>
      <circle cx="-9" cy="4" r="2.9"/><circle cx="-2" cy="4" r="2.9"/><circle cx="5" cy="4" r="2.9"/>
      <path d="M-9 4H5" fill="none" stroke="#e6e9ed" stroke-width=".85" stroke-linecap="round"/>
    </g>`;
  }
  if (wagon.kind === 'tunnel') {
    // The artwork is in mm on the default 26 × 9 mm wagon, inside its 0.45 mm stroke.
    const scale = Math.min(width / (26 - .45), height / (9 - .45));
    const ink = wagon.color === 'black' ? '#e4e5e1' : '#30363b';
    return `<path transform="scale(${scale})" fill="${ink}" opacity=".72" d="M-8.5 2.95 L-3.05 -3.1 L-.85 -.85 L1.65 -3.55 L8.5 2.95 H2.2 V1.8 A2.2 2.2 0 0 0 -2.2 1.8 V2.95 Z"/>`;
  }
  return '';
}

export function objectMarkup(object: MapObject, sizes: Project['sizes'], interactive = false): string {
  const id = interactive ? ` data-object-id="${xml(object.id)}"` : '';
  if (object.type === 'wagon') {
    const stroke = Math.min(0.45, sizes.wagonLength / 4, sizes.wagonWidth / 4);
    const width = sizes.wagonLength - stroke, height = sizes.wagonWidth - stroke;
    const radius = Math.min(1.2, height / 4, width / 4);
    const fill = colorHex(wagonColor(object.kind, object.color));
    return `<g${id} transform="translate(${object.x} ${object.y}) rotate(${object.angle})"><rect x="${-width / 2}" y="${-height / 2}" width="${width}" height="${height}" rx="${radius}" fill="${fill}" stroke="#34383e" stroke-width="${stroke}"/>${wagonDecoration(object, width, height)}</g>`;
  }
  const stroke = Math.min(0.5, sizes.cityDiameter / 5);
  const fontSize = sizes.cityLabelFontSize;
  const labelStroke = fontSize * (2.8 / 19.5); // Halo-to-type ratio from the Georgia specimen.
  const label = object.name ? `<text${interactive ? ' data-part="label"' : ''} x="${object.labelOffset.x}" y="${object.labelOffset.y}" font-family="Georgia, serif" font-size="${fontSize}" font-weight="700" fill="#503b34" stroke="#fff7e5" stroke-width="${labelStroke}" stroke-linejoin="round" paint-order="stroke fill">${xml(object.name)}</text>` : '';
  return `<g${id} transform="translate(${object.x} ${object.y})"><circle r="${(sizes.cityDiameter - stroke) / 2}" fill="white" stroke="#34383e" stroke-width="${stroke}"/>${label}</g>`;
}
export function backgroundMarkup(project: Project): string {
  const bg = project.background;
  if (!bg || !bg.visible) return '';
  return `<image href="${xml(bg.dataUrl)}" x="${bg.x}" y="${bg.y}" width="${bg.width}" height="${bg.height}" opacity="${bg.opacity}" preserveAspectRatio="none"/>`;
}
export function connectionsMarkup(project: Project): string {
  return project.routes.filter(r => r.showConnections).flatMap(routeConnections).map(c => {
    const [a, b] = connectionPoints(project, c);
    return `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="#34383e" stroke-width="0.3" stroke-linecap="butt"/>`;
  }).join('');
}
export function sceneMarkup(project: Project, interactive = false): string {
  // Cities stay above the wagon network, independently of creation order.
  return (interactive ? '' : connectionsMarkup(project)) + [...project.objects.filter(o => o.type === 'wagon'), ...project.objects.filter(o => o.type === 'city')]
    .map(object => objectMarkup(object, project.sizes, interactive)).join('');
}
export function exportSvg(project: Project, includeBackground = true): string {
  const { width, height } = project.board;
  return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${width}mm" height="${height}mm" viewBox="0 0 ${width} ${height}" overflow="hidden"><defs><clipPath id="board"><rect width="${width}" height="${height}"/></clipPath></defs><g clip-path="url(#board)"><rect width="${width}" height="${height}" fill="white"/>${includeBackground ? backgroundMarkup(project) : ''}${sceneMarkup(project)}</g></svg>`;
}
