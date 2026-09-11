/**
 * Fetch true real-time listings directly from OpenSea API v2
 * using user's OpenSea API Key: add815580a904473ba7f162c0ccc4926
 */

const fs = require('fs');
const path = require('path');

const OPENSEA_API_KEY = process.env.OPENSEA_API_KEY || 'add815580a904473ba7f162c0ccc4926';
const COLLECTION_SLUG = 'sunflower-land-collectibles';
const CONTRACT_ADDRESS = '0x22d5f9b7337a28424268307d08405d4f4cd4d7422';

// Metadata catalog for names and utility perks
let metadataMap = new Map();
try {
  const src = 'C:/Users/anubh/.gemini/antigravity/brain/4c7eeab6-1321-4755-ad0c-e24a13277640/.system_generated/steps/38/content.md';
  if (fs.existsSync(src)) {
    const content = fs.readFileSync(src, 'utf8');
    const startIdx = content.indexOf('{"collectibles":');
    if (startIdx !== -1) {
      const raw = JSON.parse(content.slice(startIdx).trim());
      (raw.collectibles || []).forEach(item => {
        metadataMap.set(String(item.id), {
          name: item.name,
          haveBoost: Boolean(item.have_boost),
          boostText: item.boost_text || '',
          supply: item.supply || 0
        });
      });
    }
  }
} catch (e) {
  console.warn('Metadata load error:', e.message);
}

async function buildOpenSeaCatalog() {
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
      console.error(`OpenSea API error on page ${page}: ${res.status} - ${errText}`);
      break;
    }

    const data = await res.json();
    const pageListings = data.listings || [];
    allListings.push(...pageListings);
    process.stdout.write(`Page ${page}: ${pageListings.length} listings | Total: ${allListings.length}\r`);

    if (data.next && pageListings.length > 0) {
      nextCursor = data.next;
      page++;
      await new Promise(r => setTimeout(r, 120));
    } else {
      break;
    }
  }

  console.log(`\n✅ Completed OpenSea API fetch: ${allListings.length} total active listings.`);

  // Group listings by Token ID and find best (lowest) unit price
  const tokenListings = new Map();

  for (const l of allListings) {
    const offerItem = l.protocol_data?.parameters?.offer?.[0];
    const tokenId = String(offerItem?.identifierOrCriteria || l.asset?.identifier || '');
    if (!tokenId) continue;

    const priceObj = l.price?.current;
    if (!priceObj) continue;

    const currency = (priceObj.currency || 'WETH').toUpperCase();
    const decimals = priceObj.decimals !== undefined ? priceObj.decimals : 18;
    const rawVal = parseFloat(priceObj.value) / Math.pow(10, decimals);

    const offerQty = parseFloat(offerItem?.startAmount || '1');
    const pricePerUnit = offerQty > 1 ? rawVal / offerQty : rawVal;

    const meta = metadataMap.get(tokenId) || {};

    const itemData = {
      id: parseInt(tokenId, 10) || tokenId,
      name: meta.name || `Sunflower Land #${tokenId}`,
      floorPrice: Number(pricePerUnit.toFixed(6)),
      rawPrice: pricePerUnit,
      totalListingPrice: Number(rawVal.toFixed(6)),
      listingQuantity: offerQty,
      currency: currency === 'MATIC' ? 'POL' : currency,
      supply: meta.supply || 1,
      haveBoost: Boolean(meta.haveBoost),
      boostText: meta.boostText || '',
      orderHash: l.order_hash,
      orderCreatedAt: l.order_created_at,
      openseaUrl: `https://opensea.io/assets/matic/${CONTRACT_ADDRESS}/${tokenId}`,
      contract: CONTRACT_ADDRESS,
      chain: 'polygon',
      source: 'OpenSea API v2'
    };

    if (!tokenListings.has(tokenId) || tokenListings.get(tokenId).rawPrice > itemData.rawPrice) {
      tokenListings.set(tokenId, itemData);
    }
  }

  // Include known catalog items that are currently unlisted on OpenSea
  for (const [idStr, meta] of metadataMap.entries()) {
    if (!tokenListings.has(idStr)) {
      tokenListings.set(idStr, {
        id: parseInt(idStr, 10) || idStr,
        name: meta.name,
        floorPrice: 0,
        rawPrice: 0,
        currency: 'WETH',
        unlisted: true,
        supply: meta.supply,
        haveBoost: meta.haveBoost,
        boostText: meta.boostText,
        openseaUrl: `https://opensea.io/assets/matic/${CONTRACT_ADDRESS}/${idStr}`,
        contract: CONTRACT_ADDRESS,
        chain: 'polygon',
        source: 'OpenSea API v2 (Unlisted)'
      });
    }
  }

  const items = Array.from(tokenListings.values());

  // Sort listed items first by price ascending, unlisted at the end
  items.sort((a, b) => {
    if (a.unlisted && !b.unlisted) return 1;
    if (!a.unlisted && b.unlisted) return -1;
    return a.rawPrice - b.rawPrice;
  });

  const activeListed = items.filter(i => !i.unlisted && i.rawPrice > 0);
  const minFloor = activeListed.length > 0 ? activeListed[0].floorPrice : 0;

  const payload = {
    lastUpdated: new Date().toISOString(),
    collection: {
      name: 'Sunflower Land Collectibles',
      slug: COLLECTION_SLUG,
      contract: CONTRACT_ADDRESS,
      openseaUrl: `https://opensea.io/collection/${COLLECTION_SLUG}`,
      chain: 'polygon'
    },
    provider: 'OpenSea Official API v2',
    currency: 'WETH',
    totalItems: items.length,
    activeListedCount: activeListed.length,
    collectionFloor: minFloor,
    items
  };

  const dataDir = path.join(__dirname, '..', 'data');
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

  fs.writeFileSync(path.join(dataDir, 'prices.json'), JSON.stringify(payload, null, 2), 'utf8');

  const jsContent = `// Pre-bundled OpenSea official prices snapshot\nwindow.INITIAL_COLLECTIBLES_DATA = ${JSON.stringify(payload)};\n`;
  fs.writeFileSync(path.join(__dirname, '..', 'data.js'), jsContent, 'utf8');
  fs.writeFileSync(path.join(__dirname, '..', 'public', 'data.js'), jsContent, 'utf8');

  console.log(`\n🎉 Saved ${items.length} items (${activeListed.length} active OpenSea listings)`);
  console.log(`Collection Floor on OpenSea: ${minFloor} WETH`);
  console.log(`Sample Active OpenSea Items:`);
  activeListed.slice(0, 8).forEach(i => {
    console.log(`  #${i.id} ${i.name}: ${i.floorPrice} ${i.currency}`);
  });
}

buildOpenSeaCatalog().catch(err => {
  console.error('❌ Error building OpenSea catalog:', err);
  process.exit(1);
});
