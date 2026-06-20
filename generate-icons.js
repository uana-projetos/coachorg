const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const svgPath = path.join(__dirname, 'icon-source.svg');
const svgBuffer = fs.readFileSync(svgPath);

const sizes = [72, 96, 128, 144, 152, 180, 192, 384, 512, 1024];

async function generate() {
  if (!fs.existsSync('icons')) fs.mkdirSync('icons');

  for (const size of sizes) {
    await sharp(svgBuffer)
      .resize(size, size)
      .png()
      .toFile(`icons/icon-${size}x${size}.png`);
    console.log(`✓ icon-${size}x${size}.png`);
  }

  // Maskable icon (512x512 com padding 20% para safe zone)
  await sharp(svgBuffer)
    .resize(410, 410)
    .extend({ top: 51, bottom: 51, left: 51, right: 51, background: { r: 15, g: 15, b: 26, alpha: 1 } })
    .png()
    .toFile('icons/icon-512x512-maskable.png');
  console.log('✓ icon-512x512-maskable.png');

  // Apple touch icon (180x180)
  fs.copyFileSync('icons/icon-180x180.png', 'apple-touch-icon.png');
  console.log('✓ apple-touch-icon.png (raiz)');

  // Favicon 32x32
  await sharp(svgBuffer).resize(32, 32).png().toFile('favicon-32x32.png');
  await sharp(svgBuffer).resize(16, 16).png().toFile('favicon-16x16.png');
  console.log('✓ favicons');

  console.log('\nTodos os ícones gerados!');
}

generate().catch(console.error);
