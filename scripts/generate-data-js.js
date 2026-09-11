const fs = require('fs');
const path = require('path');

const pricesPath = path.join(__dirname, '..', 'data', 'prices.json');
if (!fs.existsSync(pricesPath)) {
  console.error('prices.json not found');
  process.exit(1);
}

const data = fs.readFileSync(pricesPath, 'utf8');
const jsContent = `// Pre-bundled static data for instant GitHub Pages rendering
window.INITIAL_COLLECTIBLES_DATA = ${data.trim()};
`;

fs.writeFileSync(path.join(__dirname, '..', 'data.js'), jsContent, 'utf8');
fs.writeFileSync(path.join(__dirname, '..', 'public', 'data.js'), jsContent, 'utf8');
console.log('✅ Created data.js with pre-bundled collectibles data');
