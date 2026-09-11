const fs = require('fs');
const path = require('path');

const src = 'C:/Users/anubh/.gemini/antigravity/brain/4c7eeab6-1321-4755-ad0c-e24a13277640/.system_generated/steps/38/content.md';
const content = fs.readFileSync(src, 'utf8');

// Find JSON substring
const startIdx = content.indexOf('{"collectibles":');
if (startIdx === -1) {
  console.error('Could not find collectibles JSON in source');
  process.exit(1);
}

const rawJsonStr = content.slice(startIdx).trim();
const raw = JSON.parse(rawJsonStr);

const CONTRACT_ADDRESS = '0x22d5f9b7337a28424268307d08405d4f4cd4d742';
const items = (raw.collectibles || []).map(item => ({
  id: item.id,
  name: item.name || `Collectible #${item.id}`,
  floorPrice: typeof item.floor === 'number' ? item.floor : parseFloat(item.floor) || 0,
  lastSalePrice: typeof item.lastSalePrice === 'number' ? item.lastSalePrice : parseFloat(item.lastSalePrice) || 0,
  supply: item.supply || 0,
  haveBoost: Boolean(item.have_boost),
  boostText: item.boost_text || '',
  openseaUrl: `https://opensea.io/assets/matic/${CONTRACT_ADDRESS}/${item.id}`,
  contract: CONTRACT_ADDRESS,
  chain: 'polygon'
}));

items.sort((a, b) => a.floorPrice - b.floorPrice);

const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const outPath = path.join(dataDir, 'prices.json');
const payload = {
  lastUpdated: new Date().toISOString(),
  collection: {
    name: 'Sunflower Land Collectibles',
    slug: 'sunflower-land-collectibles',
    contract: CONTRACT_ADDRESS,
    openseaUrl: 'https://opensea.io/collection/sunflower-land-collectibles',
    chain: 'polygon'
  },
  provider: 'Live Market Aggregator',
  totalItems: items.length,
  items
};

fs.writeFileSync(outPath, JSON.stringify(payload, null, 2), 'utf8');
console.log(`✅ Successfully wrote ${items.length} collectibles to ${outPath}`);
