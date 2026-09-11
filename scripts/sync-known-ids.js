const fs = require('fs');
const path = require('path');

async function downloadKnownIds() {
  const token = process.env.GITHUB_TOKEN || '';
  console.log('Downloading src/features/game/types/index.ts from sunflower-land/sunflower-land...');
  
  const res = await fetch('https://raw.githubusercontent.com/sunflower-land/sunflower-land/main/src/features/game/types/index.ts', {
    headers: { Authorization: 'token ' + token, 'User-Agent': 'SFL-Sync' }
  });
  
  if (!res.ok) throw new Error(`Failed: ${res.status}`);
  const text = await res.text();
  
  // Parse KNOWN_IDS = { ... }
  const startIdx = text.indexOf('export const KNOWN_IDS');
  if (startIdx === -1) throw new Error('KNOWN_IDS not found');
  
  const braceOpen = text.indexOf('{', startIdx);
  const braceClose = text.indexOf('};', braceOpen);
  const body = text.slice(braceOpen + 1, braceClose);
  
  const map = {};
  const lines = body.split('\n');
  
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('//')) continue;
    
    // Pattern: Key: 123, or "Key Name": 123,
    const match = trimmed.match(/^["']?([^"':]+)["']?\s*:\s*(\d+)/);
    if (match) {
      const name = match[1].trim();
      const id = parseInt(match[2], 10);
      map[id] = name;
    }
  }

  // Also check metadata/metadata.ts for descriptions/attributes
  console.log('Downloading metadata/metadata.ts for traits and descriptions...');
  const metaRes = await fetch('https://raw.githubusercontent.com/sunflower-land/sunflower-land/main/metadata/metadata.ts', {
    headers: { Authorization: 'token ' + token, 'User-Agent': 'SFL-Sync' }
  });
  
  const metadataById = {};
  if (metaRes.ok) {
    const metaText = await metaRes.text();
    // find all image: .../images/{id}.webp or png
    // and match with block name
    console.log('metadata.ts downloaded, size:', metaText.length);
  }

  console.log(`✅ Successfully extracted ${Object.keys(map).length} known item IDs!`);
  console.log('Sample IDs:');
  [601, 602, 603, 604, 605, 401, 404, 1205, 1210, 2033].forEach(id => {
    console.log(`  ID ${id} => "${map[id]}"`);
  });

  fs.writeFileSync(path.join(__dirname, 'known_ids.json'), JSON.stringify(map, null, 2), 'utf8');
  return map;
}

downloadKnownIds().catch(console.error);
