const fs = require('fs');
const path = require('path');

// 读取 SVG
const svgPath = path.join(__dirname, '..', 'icons', 'icon.svg');
const svgContent = fs.readFileSync(svgPath, 'utf8');

console.log('SVG file read successfully');
console.log('SVG length:', svgContent.length, 'bytes');
console.log('SVG preview:', svgContent.substring(0, 200));

// 验证 SVG 是否包含必要的元素
const hasBookshelf = svgContent.includes('id="bookshelf-stack"');
const hasBookmark = svgContent.includes('id="bookmark-tab"');
const hasShelf = svgContent.includes('id="shelf-lines"');

console.log('\nSVG structure validation:');
console.log('- bookshelf-stack:', hasBookshelf ? 'YES' : 'NO');
console.log('- bookmark-tab:', hasBookmark ? 'YES' : 'NO');
console.log('- shelf-lines:', hasShelf ? 'YES' : 'NO');

if (hasBookshelf && hasBookmark && hasShelf) {
  console.log('\n✓ SVG structure is valid for icon generation');
} else {
  console.log('\n✗ SVG structure is incomplete');
}
