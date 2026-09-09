import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

async function buildAppIcons() {
  console.log('Generating InterviewOS app icon from iOS.jpeg...');
  const inputPath = path.join(rootDir, 'iOS.jpeg');

  const { data, info } = await sharp(inputPath).raw().toBuffer({ resolveWithObject: true });
  const w = info.width, h = info.height;

  // True symmetrical center & radii of the squircle
  const cx = 616;
  const cy = 592.5;
  const a = 607;
  const b = 586.5;
  const n = 4.85;

  const rgba = Buffer.alloc(w * h * 4);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const srcIdx = (y * w + x) * 3;
      const dstIdx = (y * w + x) * 4;

      const r = data[srcIdx];
      const g = data[srcIdx + 1];
      const b_val = data[srcIdx + 2];

      const dx = Math.abs(x - cx) / a;
      const dy = Math.abs(y - cy) / b;
      const dist = Math.pow(dx, n) + Math.pow(dy, n);

      let alpha = 255;
      if (dist > 1.0) {
        const delta = dist - 1.0;
        if (delta > 0.015) {
          alpha = 0;
        } else {
          alpha = Math.round(255 * (1 - delta / 0.015));
        }
      }

      // Clear cream background / drop shadow in corners
      if (dist > 0.92) {
        const isCream = (r > 200 && g > 190 && b_val > 150 && (r - b_val < 45));
        const isShadow = (r > 130 && g > 120 && b_val > 110 && Math.abs(r - g) < 20 && Math.abs(r - b_val) < 25);
        if (isCream || isShadow) {
          alpha = 0;
        }
      }

      rgba[dstIdx] = r;
      rgba[dstIdx + 1] = g;
      rgba[dstIdx + 2] = b_val;
      rgba[dstIdx + 3] = alpha;
    }
  }

  // Extract squircle bounding box and resize to standard 1024x1024
  const master1024Buffer = await sharp(rgba, { raw: { width: w, height: h, channels: 4 } })
    .extract({ left: 9, top: 6, width: 1214, height: 1173 })
    .resize(1024, 1024, { fit: 'fill' })
    .png({ compressionLevel: 9 })
    .toBuffer();

  // 1. In-app and root asset icons
  const target1024Files = [
    path.join(rootDir, 'src/components/icon.png'),
    path.join(rootDir, 'assets/icon.png'),
    path.join(rootDir, 'assets/answercue/app-icon-1024.png'),
    path.join(rootDir, 'assets/answercue/app-icon-dark-1024.png'),
    path.join(rootDir, 'assets/icons/png/icon_1024x1024.png'),
  ];

  if (fs.existsSync(path.join(rootDir, 'website/public'))) {
    target1024Files.push(path.join(rootDir, 'website/public/icon.png'));
  }

  for (const file of target1024Files) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    await sharp(master1024Buffer).toFile(file);
    console.log(`Saved: ${path.relative(rootDir, file)}`);
  }

  // 2. Linux PNG sizes
  const sizes = [16, 32, 64, 128, 256, 512];
  for (const s of sizes) {
    const outPath = path.join(rootDir, `assets/icons/png/icon_${s}x${s}.png`);
    await sharp(master1024Buffer)
      .resize(s, s, { fit: 'fill' })
      .png({ compressionLevel: 9 })
      .toFile(outPath);
    console.log(`Saved: assets/icons/png/icon_${s}x${s}.png`);
  }

  // 3. macOS .icns via iconutil
  const iconsetDir = path.join(rootDir, 'assets/icons/mac/InterviewOS.iconset');
  fs.mkdirSync(iconsetDir, { recursive: true });

  const iconsetSpecs = [
    { name: 'icon_16x16.png', size: 16 },
    { name: 'icon_16x16@2x.png', size: 32 },
    { name: 'icon_32x32.png', size: 32 },
    { name: 'icon_32x32@2x.png', size: 64 },
    { name: 'icon_128x128.png', size: 128 },
    { name: 'icon_128x128@2x.png', size: 256 },
    { name: 'icon_256x256.png', size: 256 },
    { name: 'icon_256x256@2x.png', size: 512 },
    { name: 'icon_512x512.png', size: 512 },
    { name: 'icon_512x512@2x.png', size: 1024 },
  ];

  for (const spec of iconsetSpecs) {
    await sharp(master1024Buffer)
      .resize(spec.size, spec.size, { fit: 'fill' })
      .png({ compressionLevel: 9 })
      .toFile(path.join(iconsetDir, spec.name));
  }

  const macIcnsPath = path.join(rootDir, 'assets/icons/mac/icon.icns');
  execSync(`iconutil -c icns "${iconsetDir}" -o "${macIcnsPath}"`);
  console.log(`Generated: assets/icons/mac/icon.icns`);

  // Copy to legacy / other icns locations
  const otherIcnsPaths = [
    path.join(rootDir, 'assets/answercue/answercue.icns'),
    path.join(rootDir, 'assets/icon.icns'),
    path.join(rootDir, 'src/icons/AppIcon.icns'),
  ];
  for (const p of otherIcnsPaths) {
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.copyFileSync(macIcnsPath, p);
    console.log(`Copied icns to: ${path.relative(rootDir, p)}`);
  }

  // Cleanup iconset directory
  fs.rmSync(iconsetDir, { recursive: true, force: true });

  // 4. Windows .ico builder
  const icoSizes = [16, 24, 32, 48, 64, 128, 256];
  const pngBuffers = [];
  for (const s of icoSizes) {
    const buf = await sharp(master1024Buffer)
      .resize(s, s, { fit: 'fill' })
      .png({ compressionLevel: 9 })
      .toBuffer();
    pngBuffers.push({ size: s, buffer: buf });
  }

  // Pack into ICO format
  const headerSize = 6;
  const entrySize = 16;
  const numImages = pngBuffers.length;
  let currentOffset = headerSize + numImages * entrySize;

  const icoHeader = Buffer.alloc(headerSize);
  icoHeader.writeUInt16LE(0, 0); // reserved
  icoHeader.writeUInt16LE(1, 2); // 1 = ICO
  icoHeader.writeUInt16LE(numImages, 4);

  const entryBuffers = [];
  for (const img of pngBuffers) {
    const entry = Buffer.alloc(entrySize);
    entry.writeUInt8(img.size >= 256 ? 0 : img.size, 0); // width
    entry.writeUInt8(img.size >= 256 ? 0 : img.size, 1); // height
    entry.writeUInt8(0, 2); // color palette count
    entry.writeUInt8(0, 3); // reserved
    entry.writeUInt16LE(1, 4); // color planes
    entry.writeUInt16LE(32, 6); // bits per pixel
    entry.writeUInt32LE(img.buffer.length, 8); // image byte size
    entry.writeUInt32LE(currentOffset, 12); // image offset
    entryBuffers.push(entry);
    currentOffset += img.buffer.length;
  }

  const finalIcoBuffer = Buffer.concat([
    icoHeader,
    ...entryBuffers,
    ...pngBuffers.map(p => p.buffer),
  ]);

  const winIcoPath = path.join(rootDir, 'assets/icons/win/icon.ico');
  fs.mkdirSync(path.dirname(winIcoPath), { recursive: true });
  fs.writeFileSync(winIcoPath, finalIcoBuffer);
  console.log(`Generated: assets/icons/win/icon.ico`);

  console.log('All icons successfully created!');
}

buildAppIcons().catch(err => {
  console.error(err);
  process.exit(1);
});
