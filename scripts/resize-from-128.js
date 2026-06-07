const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const iconDir = path.join(__dirname, '..', 'icons');
const icon128Path = path.join(iconDir, 'icon-128.png');

// 检查 icon-128.png 是否存在
if (!fs.existsSync(icon128Path)) {
  console.error('❌ icon-128.png not found!');
  console.log('Please download icon-128.png from the HTML page first.');
  process.exit(1);
}

const stats = fs.statSync(icon128Path);
console.log(`✓ Found icon-128.png (${stats.size} bytes)`);

if (stats.size < 1000) {
  console.warn('⚠️  File size is very small. Make sure you downloaded the correct file.');
}

// 使用 ImageMagick 的 convert 命令缩放图标
const sizes = [16, 32, 48];

async function resizeIcon(targetSize) {
  const outPath = path.join(iconDir, `icon-${targetSize}.png`);

  return new Promise((resolve, reject) => {
    // Windows 自带的 convert.exe 不是 ImageMagick，需要用 magick convert
    // 如果没有 ImageMagick，使用 PowerShell System.Drawing
    const psScript = `
Add-Type -AssemblyName System.Drawing
$img = [System.Drawing.Image]::FromFile("${icon128Path.replace(/\\/g, '\\\\')}")
$newImg = New-Object System.Drawing.Bitmap(${targetSize}, ${targetSize})
$graphics = [System.Drawing.Graphics]::FromImage($newImg)
$graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$graphics.DrawImage($img, 0, 0, ${targetSize}, ${targetSize})
$newImg.Save("${outPath.replace(/\\/g, '\\\\')}", [System.Drawing.Imaging.ImageFormat]::Png)
$graphics.Dispose()
$newImg.Dispose()
$img.Dispose()
`;

    const proc = spawn('powershell.exe', ['-NoProfile', '-Command', psScript]);

    let stderr = '';
    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      if (code === 0 && fs.existsSync(outPath)) {
        const size = fs.statSync(outPath).size;
        console.log(`✓ Generated icon-${targetSize}.png (${size} bytes)`);
        resolve();
      } else {
        console.error(`✗ Failed to generate icon-${targetSize}.png`);
        if (stderr) console.error(stderr);
        reject(new Error(`Exit code: ${code}`));
      }
    });
  });
}

(async () => {
  console.log('\nGenerating other sizes from icon-128.png...\n');

  for (const size of sizes) {
    try {
      await resizeIcon(size);
    } catch (err) {
      console.error(`Error for ${size}:`, err.message);
    }
  }

  console.log('\n✅ Done! All icons generated.');
  console.log('Now you can reload the extension (Remove + Load unpacked).');
})();
