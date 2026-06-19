const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const assets = [
  { svg: 'banner-checkout.svg', sizes: [{ w: 1280, h: 720, name: 'banner-checkout' }] },
  { svg: 'product-cover.svg', sizes: [
    { w: 1024, h: 1024, name: 'product-cover-1024' },
    { w: 600, h: 600, name: 'product-cover-600' },
    { w: 200, h: 200, name: 'product-logo-200' }
  ]},
  { svg: 'social-banner.svg', sizes: [
    { w: 1200, h: 630, name: 'social-banner-fb' },
    { w: 1080, h: 1080, name: 'social-banner-ig' }
  ]}
];

async function run() {
  for (const a of assets) {
    const svgBuf = fs.readFileSync(path.join('assets', a.svg));
    for (const s of a.sizes) {
      const out = path.join('assets', s.name + '.png');
      await sharp(svgBuf).resize(s.w, s.h, { fit: 'cover' }).png().toFile(out);
      console.log('✓ ' + out + ' (' + s.w + 'x' + s.h + ')');
    }
  }
  console.log('\nTodos os assets gerados!');
}

run().catch(console.error);
