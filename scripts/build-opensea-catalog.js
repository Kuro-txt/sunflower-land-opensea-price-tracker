/**
 * Fetch true real-time listings directly from OpenSea API v2
 * 1. Paginates best active listings for sunflower-land-collectibles
 * 2. Fetches recently sold events (last 7 days) per token
 * 3. For items with generic names (Sunflower Land #X), resolves real name from OpenSea NFT API
 * 4. Writes data/prices.json, data.js, and public/data.js
 */

const fs = require('fs');
const path = require('path');

const OPENSEA_API_KEY = process.env.OPENSEA_API_KEY || 'add815580a904473ba7f162c0ccc4926';
const COLLECTION_SLUG = 'sunflower-land-collectibles';
const CONTRACT_ADDRESS = '0x22d5f9b7337a28424268307d08405d4f4cd4d7422';
const CHAIN = 'matic';
const METADATA_DELAY_MS = 200; // 5 req/s ? safe within 600/hr free tier

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function fetchWithRetry(url, opts, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, opts);
      if (res.status === 429) {
        console.warn(`  Rate limited (429). Waiting 10s... attempt ${attempt}/${retries}`);
        await sleep(10000);
        continue;
      }
      return res;
    } catch (err) {
      if (attempt === retries) throw err;
      await sleep(2000);
    }
  }
}

// --- Load local sfl.world metadata as a fallback name/boost source ---
let sflMetadataMap = new Map();
try {
  const src = 'C:/Users/anubh/.gemini/antigravity/brain/4c7eeab6-1321-4755-ad0c-e24a13277640/.system_generated/steps/38/content.md';
  if (fs.existsSync(src)) {
    const content = fs.readFileSync(src, 'utf8');
    const startIdx = content.indexOf('{"collectibles":');
    if (startIdx !== -1) {
      const raw = JSON.parse(content.slice(startIdx).trim());
      (raw.collectibles || []).forEach(item => {
        sflMetadataMap.set(String(item.id), {
          name: item.name,
          haveBoost: Boolean(item.have_boost),
          boostText: item.boost_text || '',
          supply: item.supply || 0
        });
      });
      console.log('Loaded ' + sflMetadataMap.size + ' items from local SFL metadata cache.');
    }
  }
} catch (e) {
  console.warn('Metadata load error:', e.message);
}

// --- Step 1: Fetch all active listings ---
async function fetchAllListings() {
  console.log('\nFetching active listings from OpenSea for "' + COLLECTION_SLUG + '"...');
  const allListings = [];
  let nextCursor = '';
  let page = 1;

  while (true) {
    let url = 'https://api.opensea.io/api/v2/listings/collection/' + COLLECTION_SLUG + '/best?limit=100';
    if (nextCursor) url += '&next=' + encodeURIComponent(nextCursor);

    const res = await fetchWithRetry(url, {
      headers: { 'x-api-key': OPENSEA_API_KEY, 'Accept': 'application/json' }
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error('Listing API error page ' + page + ': ' + res.status + ' - ' + errText);
      break;
    }

    const data = await res.json();
    const pageListings = data.listings || [];
    allListings.push(...pageListings);
    process.stdout.write('  Page ' + page + ': ' + pageListings.length + ' listings | Total: ' + allListings.length + '\r');

    if (data.next && pageListings.length > 0) {
      nextCursor = data.next;
      page++;
      await sleep(120);
    } else {
      break;
    }
  }
  console.log('\nFetched ' + allListings.length + ' total active listings.');
  return allListings;
}

// --- Step 2: Fetch recently sold events (last 7 days) ---
async function fetchRecentSales() {
  console.log('\nFetching recent sale events from OpenSea...');
  const sales = new Map();
  const sevenDaysAgo = Math.floor((Date.now() - 7 * 24 * 3600 * 1000) / 1000);

  let nextCursor = '';
  let page = 1;
  let totalFetched = 0;
  let reachedOld = false;

  while (!reachedOld) {
    let url = 'https://api.opensea.io/api/v2/events/collection/' + COLLECTION_SLUG + '?event_type=sale&limit=50';
    if (nextCursor) url += '&next=' + encodeURIComponent(nextCursor);

    const res = await fetchWithRetry(url, {
      headers: { 'x-api-key': OPENSEA_API_KEY, 'Accept': 'application/json' }
    });

    if (!res.ok) {
      const errText = await res.text();
      console.warn('Sales API error page ' + page + ': ' + res.status + ' - ' + errText);
      break;
    }

    const data = await res.json();
    const events = data.asset_events || [];
    totalFetched += events.length;
    process.stdout.write('  Sales page ' + page + ': ' + events.length + ' events | Total: ' + totalFetched + '\r');

    for (const evt of events) {
      const closedAt = evt.closing_date || evt.event_timestamp;
      if (closedAt && closedAt < sevenDaysAgo) {
        reachedOld = true;
        break;
      }
      const tokenId = String(evt.nft ? evt.nft.identifier : (evt.asset ? evt.asset.token_id : ''));
      if (!tokenId) continue;

      const decimals = (evt.payment && evt.payment.decimals != null) ? evt.payment.decimals : 18;
      const salePrice = (evt.payment && evt.payment.quantity)
        ? parseFloat(evt.payment.quantity) / Math.pow(10, decimals)
        : 0;

      const existing = sales.get(tokenId);
      if (!existing || (salePrice > 0 && salePrice > existing.lastSalePrice)) {
        sales.set(tokenId, {
          lastSalePrice: salePrice,
          lastSaleCurrency: (evt.payment && evt.payment.symbol) ? evt.payment.symbol : 'WETH',
          lastSaleDate: closedAt ? new Date(closedAt * 1000).toISOString() : null,
          recentlySold: true
        });
      }
    }

    if (!data.next || events.length === 0) break;
    nextCursor = data.next;
    page++;
    await sleep(150);
  }

  console.log('\nFound ' + sales.size + ' unique tokens sold in last 7 days.');
  return sales;
}

// --- Step 3: Fetch real names for generic-named items via OpenSea NFT API ---
async function fetchMissingNames(tokenIds) {
  console.log('\nFetching real names for ' + tokenIds.length + ' items from OpenSea NFT API...');
  const nameMap = new Map();

  for (let i = 0; i < tokenIds.length; i++) {
    const tokenId = tokenIds[i];
    const url = 'https://api.opensea.io/api/v2/chain/' + CHAIN + '/contract/' + CONTRACT_ADDRESS + '/nfts/' + tokenId;

    try {
      const res = await fetchWithRetry(url, {
        headers: { 'x-api-key': OPENSEA_API_KEY, 'Accept': 'application/json' }
      });

      if (res.ok) {
        const data = await res.json();
        const nft = data.nft;
        if (nft) {
          nameMap.set(String(tokenId), {
            name: nft.name || ('Sunflower Land #' + tokenId),
            imageUrl: nft.image_url || ''
          });
        }
      } else {
        console.warn('  Token ' + tokenId + ': HTTP ' + res.status);
      }
    } catch (err) {
      console.warn('  Token ' + tokenId + ' fetch error: ' + err.message);
    }

    const resolved = nameMap.get(String(tokenId));
    process.stdout.write('[' + (i + 1) + '/' + tokenIds.length + '] #' + tokenId + ' -> ' + (resolved ? resolved.name : '?') + '                    \r');
    await sleep(METADATA_DELAY_MS);
  }

  console.log('\nResolved ' + nameMap.size + ' names from OpenSea.');
  return nameMap;
}

// --- Main ---
async function buildOpenSeaCatalog() {
  const allListings = await fetchAllListings();
  const recentSales = await fetchRecentSales();

  const tokenListings = new Map();

  for (const l of allListings) {
    const offerItem = l.protocol_data && l.protocol_data.parameters && l.protocol_data.parameters.offer
      ? l.protocol_data.parameters.offer[0]
      : null;
    const tokenId = String(
      (offerItem && offerItem.identifierOrCriteria) ||
      (l.asset && l.asset.identifier) || ''
    );
    if (!tokenId) continue;

    const priceObj = l.price && l.price.current;
    if (!priceObj) continue;

    const currency = (priceObj.currency || 'WETH').toUpperCase();
    const decimals = priceObj.decimals !== undefined ? priceObj.decimals : 18;
    const rawVal = parseFloat(priceObj.value) / Math.pow(10, decimals);
    const offerQty = parseFloat((offerItem && offerItem.startAmount) || '1');
    const pricePerUnit = offerQty > 1 ? rawVal / offerQty : rawVal;

    const sflMeta = sflMetadataMap.get(tokenId) || {};
    const saleMeta = recentSales.get(tokenId) || {};

    const itemData = {
      id: parseInt(tokenId, 10) || tokenId,
      name: sflMeta.name || ('Sunflower Land #' + tokenId),
      floorPrice: Number(pricePerUnit.toFixed(6)),
      rawPrice: pricePerUnit,
      totalListingPrice: Number(rawVal.toFixed(6)),
      listingQuantity: offerQty,
      currency: currency === 'MATIC' ? 'POL' : currency,
      supply: sflMeta.supply || 1,
      haveBoost: Boolean(sflMeta.haveBoost),
      boostText: sflMeta.boostText || '',
      lastSalePrice: saleMeta.lastSalePrice || 0,
      lastSaleCurrency: saleMeta.lastSaleCurrency || 'WETH',
      lastSaleDate: saleMeta.lastSaleDate || null,
      recentlySold: saleMeta.recentlySold || false,
      orderHash: l.order_hash,
      orderCreatedAt: l.order_created_at,
      openseaUrl: 'https://opensea.io/assets/matic/' + CONTRACT_ADDRESS + '/' + tokenId,
      contract: CONTRACT_ADDRESS,
      chain: 'polygon',
      source: 'OpenSea API v2'
    };

    if (!tokenListings.has(tokenId) || tokenListings.get(tokenId).rawPrice > itemData.rawPrice) {
      tokenListings.set(tokenId, itemData);
    }
  }

  // Merge recent sale data into listed tokens
  for (const [tokenId, saleMeta] of recentSales.entries()) {
    if (tokenListings.has(tokenId)) {
      const item = tokenListings.get(tokenId);
      item.lastSalePrice = saleMeta.lastSalePrice;
      item.lastSaleCurrency = saleMeta.lastSaleCurrency;
      item.lastSaleDate = saleMeta.lastSaleDate;
      item.recentlySold = true;
    }
  }

  // Include unlisted items from local catalog
  for (const [idStr, meta] of sflMetadataMap.entries()) {
    if (!tokenListings.has(idStr)) {
      const saleMeta = recentSales.get(idStr) || {};
      tokenListings.set(idStr, {
        id: parseInt(idStr, 10) || idStr,
        name: meta.name,
        floorPrice: 0,
        rawPrice: 0,
        lastSalePrice: saleMeta.lastSalePrice || 0,
        lastSaleCurrency: saleMeta.lastSaleCurrency || 'WETH',
        lastSaleDate: saleMeta.lastSaleDate || null,
        recentlySold: saleMeta.recentlySold || false,
        currency: 'WETH',
        unlisted: true,
        supply: meta.supply,
        haveBoost: meta.haveBoost,
        boostText: meta.boostText,
        openseaUrl: 'https://opensea.io/assets/matic/' + CONTRACT_ADDRESS + '/' + idStr,
        contract: CONTRACT_ADDRESS,
        chain: 'polygon',
        source: 'OpenSea API v2 (Unlisted)'
      });
    }
  }

  // Find items with generic names and resolve via OpenSea NFT API
  const needsName = [];
  for (const [tokenId, item] of tokenListings.entries()) {
    if (item.name === ('Sunflower Land #' + tokenId) || !item.name) {
      needsName.push(tokenId);
    }
  }

  if (needsName.length > 0) {
    console.log('\n' + needsName.length + ' items still have generic names. Resolving...');
    const realNames = await fetchMissingNames(needsName);
    for (const [tokenId, meta] of realNames.entries()) {
      if (tokenListings.has(tokenId)) {
        const item = tokenListings.get(tokenId);
        item.name = meta.name;
        if (meta.imageUrl) item.imageUrl = meta.imageUrl;
      }
    }
  }

  const items = Array.from(tokenListings.values());

  items.sort((a, b) => {
    if (a.unlisted && !b.unlisted) return 1;
    if (!a.unlisted && b.unlisted) return -1;
    return a.rawPrice - b.rawPrice;
  });

  const activeListed = items.filter(i => !i.unlisted && i.rawPrice > 0);
  const recentlySoldCount = items.filter(i => i.recentlySold).length;
  const minFloor = activeListed.length > 0 ? activeListed[0].rawPrice : 0;

  const payload = {
    lastUpdated: new Date().toISOString(),
    collection: {
      name: 'Sunflower Land Collectibles',
      slug: COLLECTION_SLUG,
      contract: CONTRACT_ADDRESS,
      openseaUrl: 'https://opensea.io/collection/' + COLLECTION_SLUG,
      chain: 'polygon'
    },
    provider: 'OpenSea Official API v2',
    currency: 'WETH',
    totalItems: items.length,
    activeListedCount: activeListed.length,
    recentlySoldCount: recentlySoldCount,
    collectionFloor: minFloor,
    items: items
  };

  const dataDir = path.join(__dirname, '..', 'data');
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

  fs.writeFileSync(path.join(dataDir, 'prices.json'), JSON.stringify(payload, null, 2), 'utf8');

  const jsContent = '// Pre-bundled OpenSea official prices snapshot\nwindow.INITIAL_COLLECTIBLES_DATA = ' + JSON.stringify(payload) + ';\n';
  fs.writeFileSync(path.join(__dirname, '..', 'data.js'), jsContent, 'utf8');
  fs.writeFileSync(path.join(__dirname, '..', 'public', 'data.js'), jsContent, 'utf8');

  console.log('\nDone! ' + items.length + ' items | ' + activeListed.length + ' listed | ' + recentlySoldCount + ' recently sold');
  console.log('Collection Floor: ' + minFloor + ' WETH');
  activeListed.slice(0, 5).forEach(i => {
    console.log('  #' + i.id + ' ' + i.name + ': ' + i.rawPrice.toFixed(6) + ' ' + i.currency + (i.recentlySold ? ' [sold recently]' : ''));
  });
}

buildOpenSeaCatalog().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
