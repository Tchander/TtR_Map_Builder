import { cityStyleSchema, type CityStyle } from './model';

type ColoredStyle = Exclude<CityStyle, 'classic'>;
const tones: Record<ColoredStyle, [light: string, middle: string, shade: string, edge: string]> = {
  apricot: ['#f6c594', '#e99f62', '#cb824a', '#ad754e'],
  amber: ['#f3bf6a', '#e5a343', '#bf8336', '#9e7139'],
  mandarin: ['#ffc290', '#ef9957', '#cf7940', '#ab6b40'],
  azure: ['#a5d1e3', '#83b9d0', '#619bb3', '#57889d'],
  denim: ['#91acc4', '#7193b2', '#527690', '#46667f'],
  sapphire: ['#779fc8', '#537fae', '#426b98', '#36597d'],
  pistachio: ['#d2dca8', '#b0c084', '#91a460', '#788e57'],
  mint: ['#b4e2c8', '#89c9a8', '#68a889', '#588f74'],
  eucalyptus: ['#a6cfc2', '#79ad9f', '#609486', '#4c7f71'],
  emerald: ['#6eb799', '#438d6c', '#327558', '#2c664e'],
};

// Each vector drawing is centred at (0,0) and has a 10 mm outer diameter.
function defineMarker(style: ColoredStyle): string {
  const [light, middle, shade, edge] = tones[style];
  const id = `city-marker-${style}`;
  const face = `url(#${id}-face)`;
  const diffuseLight = style === 'azure' || style === 'eucalyptus';
  let gradients = `<radialGradient id="${id}-face" ${diffuseLight ? 'cx="40%" cy="22%" r="65%"' : 'cx="32%" cy="24%" r="87%"'}>
    <stop stop-color="${light}"/><stop offset="${diffuseLight ? 73 : 58}%" stop-color="${middle}"/><stop offset="1" stop-color="${shade}"/>
  </radialGradient>`;
  let body = `<circle r="4.84" fill="${face}" stroke="${edge}" stroke-width=".32"/>`;
  switch (style) {
    case 'amber':
      gradients += `<linearGradient id="${id}-rim" x1="25%" y1="0%" x2="75%" y2="100%">
        <stop stop-color="${light}"/><stop offset="37%" stop-color="${middle}"/><stop offset="85%" stop-color="${shade}"/><stop offset="1" stop-color="${edge}"/>
      </linearGradient>`;
      body = `<circle r="4.84" fill="url(#${id}-rim)" stroke="${edge}" stroke-width=".32"/>
        <circle r="4.22" fill="${face}"/><circle r="4.23" fill="none" stroke="${edge}" stroke-width=".15" opacity=".6"/>`;
      break;
    case 'mandarin':
    case 'mint':
      body += `<ellipse transform="rotate(-23)" cx="-.55" cy="-2.7" rx="2.15" ry=".76" fill="${light}" opacity=".55"/>`;
      break;
    case 'azure':
    case 'eucalyptus':
      body = `<circle r="4.86" fill="${face}" stroke="${edge}" stroke-width=".28"/>
        <path d="M-3.7 2.3Q-.9 5.5 2.7 3.4" fill="none" stroke="${shade}" stroke-width=".18" stroke-linecap="round" opacity=".32"/>`;
      break;
    case 'denim':
      body = `<circle r="4.86" fill="${shade}" stroke="${edge}" stroke-width=".28"/>
        <g transform="translate(0 -.39) scale(1 .93)"><circle r="4.61" fill="${face}"/>
          <circle r="4.56" fill="none" stroke="${light}" stroke-width=".13" opacity=".63"/></g>`;
      break;
    case 'sapphire':
    case 'emerald':
      body += `<g fill="none" stroke="${light}" stroke-linecap="round">
        <path d="M-3.28 -1.74 Q-1.55 -4.06 1.10 -3.54" stroke-width=".42" opacity=".80"/>
        <path d="M1.65 3.63Q2.7 3.2 3.28 2.43" stroke-width=".16" opacity=".5"/></g>`;
      break;
  }
  return `${gradients}<g id="${id}"><circle r="4.68" cx=".12" cy=".34" fill="${edge}" opacity=".27" filter="url(#city-soft-edge)" pointer-events="none"/>${body}</g>`;
}

export const cityMarkerDefs = `<filter id="city-soft-edge" x="-35%" y="-35%" width="175%" height="180%"><feGaussianBlur stdDeviation=".27"/></filter>` +
  cityStyleSchema.options.filter(style => style !== 'classic').map(defineMarker).join('');
