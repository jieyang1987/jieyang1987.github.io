/* Rasterize the hand-drawn SVG master. Requires sharp in Node module resolution.
 * Run: node scripts/build-favicons.js
 * Generated assets are committed; deployment and checks do not require sharp.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const root = path.resolve(__dirname, '..');
const assets = path.join(root, 'static/assets');
const output = path.join(root, 'output/favicon-design');
const icoSizes = [16, 32, 48, 64, 128, 256];
async function build() {
  fs.mkdirSync(output, { recursive: true });
  const ico = path.join(assets, 'favicon.ico');
  const backup = path.join(output, 'favicon-before.ico');
  if (fs.existsSync(ico) && !fs.existsSync(backup)) fs.copyFileSync(ico, backup);
  const source = fs.readFileSync(path.join(assets, 'favicon.svg'));
  const png = size => sharp(source, { density: 384 }).resize(size, size).png().toBuffer();
  const images = await Promise.all(icoSizes.map(png));
  const header = Buffer.alloc(6 + icoSizes.length * 16);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(icoSizes.length, 4);
  let offset = header.length;
  icoSizes.forEach((size, i) => {
    const entry = 6 + i * 16;
    header[entry] = header[entry + 1] = size === 256 ? 0 : size;
    header.writeUInt16LE(1, entry + 4);
    header.writeUInt16LE(32, entry + 6);
    header.writeUInt32LE(images[i].length, entry + 8);
    header.writeUInt32LE(offset, entry + 12);
    offset += images[i].length;
  });
  fs.writeFileSync(ico, Buffer.concat([header, ...images]));
  fs.writeFileSync(path.join(assets, 'favicon-96.png'), await png(96));
  fs.writeFileSync(path.join(assets, 'favicon-512.png'), await png(512));
  await sharp(source, { density: 384 }).resize(180, 180).flatten({ background: '#172635' }).png()
    .toFile(path.join(assets, 'apple-touch-icon.png'));
  const sheet = `<svg xmlns="http://www.w3.org/2000/svg" width="1100" height="690">
    <rect width="1100" height="690" fill="#f3f7fb"/>
    <g font-family="Arial, sans-serif" fill="#172635">
      <text x="52" y="48" font-size="13" letter-spacing="3">YJ / PERSONAL IDENTITY</text>
      <text x="1048" y="48" text-anchor="end" font-size="13" fill="#536a7d">JIE YANG</text>
      <line x1="52" y1="70" x2="1048" y2="70" stroke="#cfdeeb"/>
      <rect x="52" y="104" width="370" height="328" rx="20" fill="#ffffff"/>
      <text x="472" y="164" font-size="48">A mark of your own.</text>
      <text x="474" y="208" font-size="23">YJ / Yang Jie</text>
      <text x="474" y="254" font-size="16" fill="#536a7d">One compact monogram. Two connected initials.</text>
      <text x="474" y="281" font-size="16" fill="#536a7d">Drawn as paths, not tied to a font.</text>
      <rect x="474" y="328" width="28" height="28" rx="7" fill="#172635"/>
      <rect x="513" y="328" width="28" height="28" rx="7" fill="#ffffff" stroke="#cfdeeb"/>
      <rect x="552" y="328" width="28" height="28" rx="7" fill="#a7d5f2"/>
      <text x="474" y="391" font-size="13" fill="#536a7d">INK NAVY / WHITE / SIGNAL BLUE</text>
      <text x="52" y="476" font-size="12" letter-spacing="2" fill="#536a7d">AT ACTUAL SIZE</text>
      <rect x="52" y="493" width="310" height="139" rx="12" fill="#ffffff"/>
      <text x="85" y="608" font-size="12" fill="#536a7d">16 px</text>
      <text x="164" y="608" font-size="12" fill="#536a7d">32 px</text>
      <text x="263" y="608" font-size="12" fill="#536a7d">48 px</text>
      <text x="389" y="476" font-size="12" letter-spacing="2" fill="#536a7d">LIGHT TAB</text>
      <rect x="389" y="493" width="319" height="139" rx="12" fill="#e6edf4"/>
      <rect x="407" y="536" width="283" height="48" rx="10" fill="#ffffff"/>
      <text x="452" y="566" font-size="14">Jie Yang | Westlake University</text>
      <text x="735" y="476" font-size="12" letter-spacing="2" fill="#536a7d">DARK TAB</text>
      <rect x="735" y="493" width="313" height="139" rx="12" fill="#101923"/>
      <rect x="753" y="536" width="277" height="48" rx="10" fill="#293746"/>
      <text x="798" y="566" font-size="14" fill="#edf5fc">Jie Yang | Westlake University</text>
      <text x="52" y="666" font-size="12" fill="#536a7d">Favicon design preview / local website assets</text>
    </g>
  </svg>`;
  const specs = [[224,125,156], [16,94,548], [32,166,540], [48,258,532], [16,421,552], [16,767,552]];
  const overlays = await Promise.all(specs.map(async ([size,left,top]) => ({ input: await png(size), left, top })));
  await sharp(Buffer.from(sheet)).composite(overlays).png().toFile(path.join(output, 'favicon-preview.png'));
  console.log('Built SVG-derived PNGs, 6-resolution ICO, touch icon and preview. Original ICO preserved in output/favicon-design.');
}
if (require.main === module) build().catch(error => { console.error(error); process.exitCode = 1; });
module.exports = { build, icoSizes };
