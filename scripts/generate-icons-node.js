const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const iconDir = path.join(__dirname, '..', 'icons');
const svgPath = path.join(iconDir, 'icon.svg');
const sizes = [16, 32, 48, 128];

// 使用 Chrome DevTools Protocol 更可靠地渲染
async function generateWithCDP(size) {
  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { margin: 0; padding: 0; width: ${size}px; height: ${size}px; overflow: hidden; background: transparent; }
    svg { width: ${size}px; height: ${size}px; display: block; }
  </style>
</head>
<body>
${fs.readFileSync(svgPath, 'utf8')}
</body>
</html>`;

  const tempHtml = path.join(__dirname, `temp-${size}.html`);
  fs.writeFileSync(tempHtml, html, 'utf8');

  const outPath = path.join(iconDir, `icon-${size}.png`);

  // 使用 Chrome --screenshot 参数，增加延迟确保渲染完成
  const chrome = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const edge = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
  const browser = fs.existsSync(edge) ? edge : chrome;

  const args = [
    '--headless=new',
    '--disable-gpu',
    '--hide-scrollbars',
    `--screenshot=${outPath}`,
    `--window-size=${size},${size}`,
    '--default-background-color=0',
    '--force-device-scale-factor=1',
    `file:///${tempHtml.replace(/\\/g, '/')}`
  ];

  return new Promise((resolve, reject) => {
    const proc = spawn(browser, args);

    proc.on('close', (code) => {
      fs.unlinkSync(tempHtml);

      if (code === 0 && fs.existsSync(outPath)) {
        const stats = fs.statSync(outPath);
        console.log(`✓ Generated icon-${size}.png (${stats.size} bytes)`);
        resolve();
      } else {
        reject(new Error(`Failed to generate icon-${size}.png`));
      }
    });

    proc.on('error', reject);
  });
}

(async () => {
  console.log('Generating icons from SVG...\n');

  for (const size of sizes) {
    try {
      await generateWithCDP(size);
    } catch (err) {
      console.error(`✗ Failed for size ${size}:`, err.message);
    }
  }

  console.log('\nDone!');
})();
