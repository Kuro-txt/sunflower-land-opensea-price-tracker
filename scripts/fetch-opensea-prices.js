/**
 * Fetch true real-time listings directly from OpenSea API v2
 * using the authorized OpenSea API key
 */

const fs = require('fs');
const path = require('path');

const OPENSEA_API_KEY = process.env.OPENSEA_API_KEY || 'add815580a904473ba7f162c0ccc4926';
const COLLECTION_SLUG = 'sunflower-land-collectibles';
const CONTRACT_ADDRESS = '0x22d5f9b75c524fec1d6619787e582644cd4d7422';

// Load existing metadata catalog (names, boosts, etc.)
let metadataMap = new Map();
try {
  const existingPath = path.join(__dirname, '..', 'data', 'prices.json');
  if (fs.existsSync(existingPath)) {
    const existing = JSON.parse(fs.readFileSync(existingPath, 'utf8'));
    (existing.items || []).forEach(item => {
      metadataMap.set(String(item.id), {
        name: item.name,
        haveBoost: item.haveBoost,
        boostText: item.boostText,
        supply: item.supply || 0
      });
    });
  }
} catch (e) {
  console.warn('Could not load existing metadata:', e.message);
}

async function fetchAllOpenSeaListings() {
  console.log(`🌐 Fetching official listings from OpenSea API for "${COLLECTION_SLUG}"...`);
  let allListings = [];
  let nextCursor = '';
  let page = 1;

  while (true) {
    let url = `https://api.opensea.io/api/v2/listings/collection/${COLLECTION_SLUG}/best?limit=100`;
    if (nextCursor) {
      url += `&next=${encodeURIComponent(nextCursor)}`;
    }

    const res = await fetch(url, {
      headers: {
        'x-api-key': OPENSEA_API_KEY,
        'Accept': 'application/json',
        'User-Agent': 'SunflowerLandOpenSeaTracker/1.0'
      }
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`OpenSea API error on page ${page}: ${res.status} ${res.statusText} - ${errText}`);
    }

    const data = await res.json();
    const pageListings = data.listings || [];
    allListings.push(...pageListings);
    console.log(`  Page ${page}: received ${pageListings.length} listings (running total: ${allListings.length})`);

    if (data.next && pageListings.length > 0) {
      nextCursor = data.next;
      page++;
      await new Promise(r => setTimeout(r, 200)); // rate limit safety
    } else {
      break;
    }
  }

  console.log(`✅ Completed OpenSea API fetch: ${allListings.length} total active listings.`);

  // Map each token to its best OpenSea listing
  const itemsMap = new Map();
  for (const listing of allListings) {
    const tokenId = String(listing.protocol_data?.parameters?.offer?.[0]?.identifierOrCriteria || listing.asset?.identifier || '');
    if (!tokenId) continue;

    const priceObj = listing.price?.current;
    const currency = priceObj?.currency || 'POL';
    const decimals = priceObj?.decimals || 18;
    const priceVal = priceObj ? parseFloat(priceObj.value) / Math.pow(10, decimals) : 0;

    const meta = metadataMap.get(tokenId) || {};

    const itemRecord = {
      id: parseInt(tokenId, 10) || tokenId,
      name: meta.name || `Sunflower Land #${tokenId}`,
      floorPrice: Number(priceVal.toFixed(4)),
      currency: currency === 'MATIC' ? 'POL' : currency,
      lastSalePrice: 0,
      supply: meta.supply || 1,
      haveBoost: Boolean(meta.haveBoost),
      boostText: meta.boostText || '',
      orderHash: listing.order_hash,
      orderCreatedAt: listing.order_created_at,
      openseaUrl: `https://opensea.io/assets/matic/${CONTRACT_ADDRESS}/${tokenId}`,
      contract: CONTRACT_ADDRESS,
      chain: 'polygon',
      source: 'OpenSea API v2'
    };

    if (!itemsMap.has(tokenId) || itemsMap.get(tokenId).floorPrice > itemRecord.floorPrice) {
      itemsMap.set(tokenId, itemRecord);
    }
  }

  const items = Array.from(itemsMap.values());
  items.sort((a, b) => a.floorPrice - b.floorPrice);

  const payload = {
    lastUpdated: new Date().toISOString(),
    collection: {
      name: 'Sunflower Land Collectibles',
      slug: COLLECTION_SLUG,
      contract: CONTRACT_ADDRESS,
      openseaUrl: `https://opensea.io/collection/${COLLECTION_SLUG}`,
      chain: 'polygon'
    },
    provider: 'OpenSea Official REST API v2',
    totalItems: items.length,
    items
  };

  // 1. Write to data/prices.json
  const dataDir = path.join(__dirname, '..', 'data');
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(path.join(dataDir, 'prices.json'), JSON.stringify(payload, null, 2), 'utf8');

  // 2. Write to root and public data.js for zero-latency static GitHub Pages
  const jsContent = `// Pre-bundled OpenSea official prices snapshot\nwindow.INITIAL_COLLECTIBLES_DATA = ${JSON.stringify(payload)};\n`;
  fs.writeFileSync(path.join(__dirname, '..', 'data.js'), jsContent, 'utf8');
  fs.writeFileSync(path.join(__dirname, '..', 'public', 'data.js'), jsContent, 'utf8');

  console.log(`\n🎉 Success! Processed ${items.length} items with genuine OpenSea prices.`);
  console.log(`Lowest floor listing on OpenSea: ${items[0].floorPrice} ${items[0].currency} (${items[0].name})`);
  return payload;
}

fetchAllOpenSeaListings().catch(err => {
  console.error('❌ Failed to fetch from OpenSea:', err.message);
  process.exit(1);
});
