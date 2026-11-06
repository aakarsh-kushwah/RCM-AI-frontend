import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import opentype from 'opentype.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SVG_PATH = path.join(ROOT, 'public', 'teamdekho-icon.svg');
const FONT_PATH = path.join(ROOT, 'scripts', 'Inter-ExtraBold.ttf');
const OUT = path.join(ROOT, 'public');

const INDIGO = '#4f6bff', VIOLET = '#9a5cff', AQUA = '#12c6d8';
const INK = '#0a2540';
const DEKHO_FROM = '#0f7f90', DEKHO_TO = '#14b8b0';
const S = 1024;

const die = (m) => { console.error('ERROR: ' + m); process.exit(1); };
if (!fs.existsSync(SVG_PATH)) die(`missing ${SVG_PATH}`);
if (!fs.existsSync(FONT_PATH)) die(`missing ${FONT_PATH} (download static Inter-ExtraBold.ttf)`);

const svgBuf = fs.readFileSync(SVG_PATH);
const meta = await sharp(svgBuf, { density: 300 }).metadata();
const ratio = meta.width / meta.height;
const logoURI = 'data:image/svg+xml;base64,' + svgBuf.toString('base64');
const fontFile = fs.readFileSync(FONT_PATH);
const font = opentype.parse(fontFile.buffer.slice(fontFile.byteOffset, fontFile.byteOffset + fontFile.byteLength));

function textPath(str, x, y, size) {
  const k = size / font.unitsPerEm;
  let cx = x, d = '';
  for (const ch of str) {
    const g = font.charToGlyph(ch);
    d += g.getPath(cx, y, size).toPathData(2);
    cx += g.advanceWidth * k;
  }
  return { d, width: cx - x };
}

function logoImage(box, cx, cy) {
  const w = ratio >= 1 ? box : box * ratio;
  const h = ratio >= 1 ? box / ratio : box;
  return `<image href="${logoURI}" x="${cx - w / 2}" y="${cy - h / 2}" width="${w}" height="${h}"/>`;
}

const wrap = (inner, bg = '') =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}">${bg}${inner}</svg>`;

function splashSvg() {
  const c = S / 2, R = Math.round(S * 0.46);
  const size = S * 0.095, gap = S * 0.025;
  const wTeam = textPath('TEAM', 0, 0, size).width;
  const wDekho = textPath('DEKHO', 0, 0, size).width;
  const x0 = c - (wTeam + gap + wDekho) / 2;
  const base = S * 0.60 + size * 0.8;
  const xD = x0 + wTeam + gap;
  const pTeam = textPath('TEAM', x0, base, size).d;
  const pDekho = textPath('DEKHO', xD, base, size).d;
  const dots = [[-90, INDIGO], [30, VIOLET], [150, AQUA]].map(([a, col]) => {
    const x = c + R * Math.cos((a * Math.PI) / 180), y = c + R * Math.sin((a * Math.PI) / 180);
    return `<circle cx="${x}" cy="${y}" r="17" fill="#fff" stroke="${col}" stroke-width="6"/>`;
  }).join('');
  return wrap(`
    <defs>
      <linearGradient id="ring" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="${S}" y2="${S}">
        <stop offset="0" stop-color="${INDIGO}"/><stop offset=".55" stop-color="${VIOLET}"/><stop offset="1" stop-color="${AQUA}"/>
      </linearGradient>
      <linearGradient id="dekho" gradientUnits="userSpaceOnUse" x1="${xD}" y1="0" x2="${xD + wDekho}" y2="0">
        <stop offset="0" stop-color="${DEKHO_FROM}"/><stop offset="1" stop-color="${DEKHO_TO}"/>
      </linearGradient>
    </defs>
    <circle cx="${c}" cy="${c}" r="${R}" fill="none" stroke="rgba(120,130,200,.22)" stroke-width="3"/>
    <circle cx="${c}" cy="${c}" r="${R}" fill="none" stroke="url(#ring)" stroke-width="8"/>
    ${dots}
    ${logoImage(S * 0.34, c, S * 0.27 + (S * 0.34) / 2)}
    <path d="${pTeam}" fill="${INK}"/>
    <path d="${pDekho}" fill="url(#dekho)"/>`);
}

const iconSvg = (scale, bg) =>
  wrap(logoImage(S * scale, S / 2, S / 2), bg ? `<rect width="${S}" height="${S}" fill="${bg}"/>` : '');

const render = (svg, size, file, flatten) => {
  let img = sharp(Buffer.from(svg), { density: 96 }).resize(size, size);
  if (flatten) img = img.flatten({ background: '#ffffff' });
  return img.png({ compressionLevel: 9 }).toFile(path.join(OUT, file));
};

fs.mkdirSync(path.join(OUT, 'icons'), { recursive: true });
const splash = splashSvg();
const maskable = iconSvg(0.58, '#ffffff');
await Promise.all([
  render(splash, 192, 'icons/splash-192.png'),
  render(splash, 512, 'icons/splash-512.png'),
  render(maskable, 192, 'icons/maskable-192.png'),
  render(maskable, 512, 'icons/maskable-512.png'),
  render(iconSvg(0.70, '#ffffff'), 180, 'apple-touch-icon.png', true),
  render(iconSvg(0.92), 32, 'favicon-32.png'),
]);
console.log('Icons written to', OUT);
