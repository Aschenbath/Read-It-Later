// 生成简单的纯色图标作为临时方案
const fs = require('fs');
const path = require('path');
const { createCanvas } = require('canvas');

const iconDir = path.join(__dirname, '..', 'icons');
const sizes = [16, 32, 48, 128];

sizes.forEach(size => {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');

  // 背景
  ctx.fillStyle = '#7a6651';
  ctx.fillRect(0, 0, size, size);

  // 简单的书本形状
  const scale = size / 128;
  ctx.fillStyle = '#5e4d3b';
  ctx.fillRect(30 * scale, 32 * scale, 20 * scale, 66 * scale);
  ctx.fillRect(54 * scale, 28 * scale, 24 * scale, 70 * scale);

  // 保存
  const outPath = path.join(iconDir, `icon-${size}.png`);
  const buffer = canvas.toBuffer('image/png');
  fs.writeFileSync(outPath, buffer);

  console.log(`✓ Generated icon-${size}.png (${buffer.length} bytes)`);
});

console.log('\nDone!');
