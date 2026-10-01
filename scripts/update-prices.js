/**
 * Unified Multi-Collection Price Updater
 * Supports both Sunflower Land Collectibles & Bumpkin Wearables NFT contracts on Polygon!
 *
 * Usage:
 *   node scripts/update-prices.js [OPENSEA_API_KEY]
 */

const fs = require('fs');
const path = require('path');
const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');

const OPENSEA_API_KEY = process.env.OPENSEA_API_KEY || process.argv[2] || 'add815580a904473ba7f162c0ccc4926';
const ROOT_DIR = path.resolve(__dirname, '..');

const COLLECTIONS = {
  collectibles: {
    key: 'collectibles',
    slug: 'sunflower-land-collectibles',
    contract: '0x22d5f9b75c524fec1d6619787e582644cd4d7422',
    name: 'Sunflower Land Collectibles'
  },
  wearables: {
    key: 'wearables',
    slug: 'bumpkin-wearables',
    contract: '0x4bb5b2461e9ef782152c3a96698b2a4cf55b6162',
    name: 'Bumpkin Wearables'
  }
};

function makeItemKey(collection, id) {
  return `${collection}_${id}`;
}

function isResourceToken(id) {
  const num = Number(id);
  return (num >= 201 && num <= 220) || (num >= 601 && num <= 605) || (num >= 301 && num <= 304);
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function fetchWithRetry(url, headers = {}, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        headers: {
          'accept': 'application/json',
          'user-agent': 'SunflowerLandPriceTracker/2.0',
          ...headers
        }
      });
      if (res.status === 429) {
        console.warn(`    ⚠️ Rate limited (429). Waiting 5s (attempt ${attempt}/${retries})...`);
        await sleep(5000);
        continue;
      }
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${await res.text()}`);
      }
      return await res.json();
    } catch (err) {
      if (attempt === retries) throw err;
      console.warn(`    ⚠️ Attempt ${attempt} failed: ${err.message}. Retrying in 2s...`);
      await sleep(2000);
    }
  }
}

// 1. Fetch live Flower Token (SFL) Exchange Rate
async function fetchExchangeRate() {
  console.log('🌸 Fetching live Flower token exchange rate...');
  try {
    const data = await fetchWithRetry('https://sfl.world/api/v1.1/exchange');
    const rate = data?.sfl?.usd || data?.data?.sfl?.usd || 0.19009181;
    console.log(`✅ Live Rate: 1 FLOWER ≈ $${rate.toFixed(4)} USDC`);
    fs.writeFileSync(path.join(ROOT_DIR, 'data', 'exchange.json'), JSON.stringify(data, null, 2), 'utf8');
    return rate;
  } catch (err) {
    console.warn('⚠️ Could not fetch exchange rate, using fallback rate:', err.message);
    return 0.19501167;
  }
}

// 2. Fetch live In-Game Marketplace Prices for Collectibles & Wearables
async function fetchInGamePrices() {
  console.log('🎮 Fetching live in-game marketplace prices (collectibles + wearables)...');
  const inGameMap = new Map();
  try {
    const data = await fetchWithRetry('https://sfl.world/api/v1/nfts');
    if (data) {
      if (Array.isArray(data.collectibles)) {
        for (const item of data.collectibles) {
          if (item.id != null) {
            inGameMap.set(makeItemKey('collectibles', item.id), {
              id: Number(item.id),
              collection: 'collectibles',
              floor: item.floor != null ? Number(item.floor) : null,
              lastSalePrice: item.lastSalePrice ? Number(item.lastSalePrice) : 0,
              supply: item.supply ? Number(item.supply) : 1,
              haveBoost: item.have_boost === 1,
              boostText: item.boost_text || '',
              name: item.name || ''
            });
          }
        }
      }
      if (Array.isArray(data.wearables)) {
        for (const item of data.wearables) {
          if (item.id != null) {
            inGameMap.set(makeItemKey('wearables', item.id), {
              id: Number(item.id),
              collection: 'wearables',
              floor: item.floor != null ? Number(item.floor) : null,
              lastSalePrice: item.lastSalePrice ? Number(item.lastSalePrice) : 0,
              supply: item.supply ? Number(item.supply) : 1,
              haveBoost: item.have_boost === 1,
              boostText: item.boost_text || '',
              name: item.name || ''
            });
          }
        }
      }
    }
    console.log(`✅ Fetched ${inGameMap.size} in-game listed items.`);
    fs.writeFileSync(path.join(ROOT_DIR, 'data', 'ingame_nfts.json'), JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.warn('⚠️ Could not fetch in-game prices from API, checking local fallback:', err.message);
    const localFile = path.join(ROOT_DIR, 'data', 'ingame_nfts.json');
    if (fs.existsSync(localFile)) {
      const local = JSON.parse(fs.readFileSync(localFile, 'utf8'));
      if (Array.isArray(local.collectibles)) {
        local.collectibles.forEach(item => {
          if (item.id != null) {
            inGameMap.set(makeItemKey('collectibles', item.id), {
              id: Number(item.id),
              collection: 'collectibles',
              floor: item.floor != null ? Number(item.floor) : null,
              lastSalePrice: item.lastSalePrice ? Number(item.lastSalePrice) : 0,
              supply: item.supply ? Number(item.supply) : 1,
              haveBoost: item.have_boost === 1,
              boostText: item.boost_text || '',
              name: item.name || ''
            });
          }
        });
      }
      if (Array.isArray(local.wearables)) {
        local.wearables.forEach(item => {
          if (item.id != null) {
            inGameMap.set(makeItemKey('wearables', item.id), {
              id: Number(item.id),
              collection: 'wearables',
              floor: item.floor != null ? Number(item.floor) : null,
              lastSalePrice: item.lastSalePrice ? Number(item.lastSalePrice) : 0,
              supply: item.supply ? Number(item.supply) : 1,
              haveBoost: item.have_boost === 1,
              boostText: item.boost_text || '',
              name: item.name || ''
            });
          }
        });
      }
    }
  }
  return inGameMap;
}

// Helper to fetch best floor with automatic rate-limit backoff
async function fetchBestFloorWithRetry(collection, id, maxRetries = 4) {
  const colSlug = COLLECTIONS[collection]?.slug || COLLECTIONS.collectibles.slug;
  const url = `https://api.opensea.io/api/v2/listings/collection/${colSlug}/nfts/${id}/best`;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(url, {
        headers: {
          'x-api-key': OPENSEA_API_KEY,
          'accept': 'application/json',
          'user-agent': 'SunflowerLandPriceTracker/2.0'
        }
      });
      if (res.status === 404) {
        return { status: 404 };
      }
      if (res.status === 429) {
        await sleep(1500 * attempt);
        continue;
      }
      if (!res.ok) {
        if (attempt === maxRetries) return null;
        await sleep(1000);
        continue;
      }
      return { status: 200, data: await res.json() };
    } catch {
      if (attempt === maxRetries) return null;
      await sleep(1000);
    }
  }
  return null;
}

// Verify exact OpenSea floor price for in-game traded items directly via /nfts/{id}/best
async function verifyOpenSeaFloorsForInGameItems(inGameMap, listingsByKey, verifiedUnlistedKeys) {
  console.log(`🔍 Verifying live OpenSea floors for ${inGameMap.size} in-game active items across collections...`);
  const keys = Array.from(inGameMap.keys());
  const batchSize = 4;
  let verifiedCount = 0;

  for (let i = 0; i < keys.length; i += batchSize) {
    const chunk = keys.slice(i, i + batchSize);
    await Promise.all(chunk.map(async (key) => {
      const itemInfo = inGameMap.get(key);
      if (!itemInfo) return;
      try {
        const res = await fetchBestFloorWithRetry(itemInfo.collection, itemInfo.id);
        if (!res) return;
        if (res.status === 404) {
          verifiedUnlistedKeys.add(key);
          return;
        }

        const data = res.data;
        if (data?.status && data.status !== 'ACTIVE') {
          verifiedUnlistedKeys.add(key);
          return;
        }

        const cur = data?.price?.current?.currency || 'WETH';
        const dec = data?.price?.current?.decimals != null ? data.price.current.decimals : 18;
        const totalVal = data?.price?.current?.value ? (Number(data.price.current.value) / Math.pow(10, dec)) : 0;
        const offer = data?.protocol_data?.parameters?.offer?.[0];
        const startAmount = Number(offer?.startAmount || '1');

        let unitPrice = totalVal;
        if (itemInfo.collection === 'collectibles' && isResourceToken(itemInfo.id)) {
          if (startAmount < 1e18) return;
          unitPrice = totalVal / (startAmount / 1e18);
          if (unitPrice < 0.00001 || unitPrice > 500) return;
        } else {
          unitPrice = startAmount > 1 ? totalVal / startAmount : totalVal;
          if (unitPrice < 0.000001) return;
        }

        if (unitPrice > 0) {
          const entry = {
            unitPrice,
            currency: cur,
            orderCreatedAt: data?.order_created_at || 0
          };
          listingsByKey.set(key, [entry]);
          verifiedCount++;
        }
      } catch {}
    }));
    process.stdout.write(`  Verified ${Math.min(i + batchSize, keys.length)}/${keys.length} items (${verifiedCount} listed on OS)\r`);
    await sleep(200);
  }
  console.log(`\n✅ Verified ${verifiedCount} in-game items actively listed on OpenSea.`);
}

// Fetch real-time Recent Listing Events for a specific collection
async function fetchRecentListingEvents(collection = 'collectibles') {
  const colSlug = COLLECTIONS[collection]?.slug || COLLECTIONS.collectibles.slug;
  console.log(`⚡ Fetching recent listing events for ${colSlug}...`);
  const recentListings = new Map();
  let next = '';

  for (let page = 1; page <= 3; page++) {
    let url = `https://api.opensea.io/api/v2/events/collection/${colSlug}?event_type=listing&limit=50`;
    if (next) url += `&next=${encodeURIComponent(next)}`;

    try {
      const data = await fetchWithRetry(url, { 'x-api-key': OPENSEA_API_KEY });
      const events = data.asset_events || [];

      for (const ev of events) {
        const id = String(ev.asset?.identifier || '');
        if (!id) continue;

        const key = makeItemKey(collection, id);
        const dec = ev.payment?.decimals || 18;
        const price = ev.payment?.quantity ? (Number(ev.payment.quantity) / Math.pow(10, dec)) : 0;
        const timestampMs = (ev.event_timestamp || 0) * 1000;

        if (!recentListings.has(key) || timestampMs > recentListings.get(key).timestampMs) {
          recentListings.set(key, {
            recentlyListed: true,
            timestampMs,
            price,
            currency: ev.payment?.symbol || 'WETH'
          });
        }
      }

      if (!data.next || events.length === 0) break;
      next = data.next;
      await sleep(150);
    } catch (err) {
      console.error(`Error fetching recent listing events for ${colSlug}:`, err.message);
      break;
    }
  }

  console.log(`✅ Found ${recentListings.size} recently listed ${collection}.`);
  return recentListings;
}

// Fetch real-time Recent Sale Events for a specific collection
async function fetchRecentSaleEvents(collection = 'collectibles') {
  const colSlug = COLLECTIONS[collection]?.slug || COLLECTIONS.collectibles.slug;
  console.log(`🔥 Fetching recent sale events for ${colSlug}...`);
  const recentSales = new Map();
  let next = '';

  for (let page = 1; page <= 3; page++) {
    let url = `https://api.opensea.io/api/v2/events/collection/${colSlug}?event_type=sale&limit=50`;
    if (next) url += `&next=${encodeURIComponent(next)}`;

    try {
      const data = await fetchWithRetry(url, { 'x-api-key': OPENSEA_API_KEY });
      const events = data.asset_events || [];

      for (const ev of events) {
        const id = String(ev.asset?.identifier || ev.nft?.identifier || '');
        if (!id) continue;

        const key = makeItemKey(collection, id);
        const dec = ev.payment?.decimals || 18;
        const price = ev.payment?.quantity ? (Number(ev.payment.quantity) / Math.pow(10, dec)) : 0;
        const timestampMs = (ev.event_timestamp || 0) * 1000;

        if (!recentSales.has(key) || timestampMs > recentSales.get(key).timestampMs) {
          recentSales.set(key, {
            recentlySold: true,
            timestampMs,
            price,
            currency: ev.payment?.symbol || 'WETH'
          });
        }
      }

      if (!data.next || events.length === 0) break;
      next = data.next;
      await sleep(150);
    } catch (err) {
      console.error(`Error fetching recent sale events for ${colSlug}:`, err.message);
      break;
    }
  }

  console.log(`✅ Found ${recentSales.size} recently sold ${collection}.`);
  return recentSales;
}

async function main() {
  console.log('🚀 Starting fresh multi-collection price update...\n');

  const flowerRate = await fetchExchangeRate();
  const inGameMap = await fetchInGamePrices();
  const listingsByKey = new Map();
  const verifiedUnlistedKeys = new Set();

  // 1. Verify exact live OpenSea floors for all active in-game traded items
  await verifyOpenSeaFloorsForInGameItems(inGameMap, listingsByKey, verifiedUnlistedKeys);

  // 2. Fetch recent listing and sale events for both Collectibles & Wearables
  const [colListings, colSales, wearListings, wearSales] = await Promise.all([
    fetchRecentListingEvents('collectibles'),
    fetchRecentSaleEvents('collectibles'),
    fetchRecentListingEvents('wearables'),
    fetchRecentSaleEvents('wearables')
  ]);

  const recentListings = new Map([...colListings, ...wearListings]);
  const recentSales = new Map([...colSales, ...wearSales]);

  // 3. Immediately re-verify floor for tokens with recent activity
  const activityKeys = new Set([...Array.from(recentSales.keys()), ...Array.from(recentListings.keys())]);
  console.log(`🔍 Verifying live OpenSea floors for ${activityKeys.size} tokens with recent activity...`);
  for (const actKey of activityKeys) {
    const [col, idStr] = actKey.split('_');
    const actId = Number(idStr);
    try {
      const res = await fetchBestFloorWithRetry(col, actId);
      if (res?.status === 404) {
        verifiedUnlistedKeys.add(actKey);
        listingsByKey.delete(actKey);
      } else if (res?.status === 200 && res.data) {
        const data = res.data;
        if (data?.status && data.status !== 'ACTIVE') {
          verifiedUnlistedKeys.add(actKey);
          listingsByKey.delete(actKey);
          continue;
        }

        const cur = data?.price?.current?.currency || 'WETH';
        const dec = data?.price?.current?.decimals != null ? data.price.current.decimals : 18;
        const totalVal = data?.price?.current?.value ? (Number(data.price.current.value) / Math.pow(10, dec)) : 0;
        const offer = data?.protocol_data?.parameters?.offer?.[0];
        const startAmount = Number(offer?.startAmount || '1');

        let unitPrice = totalVal;
        if (col === 'collectibles' && isResourceToken(actId)) {
          if (startAmount >= 1e18) {
            unitPrice = totalVal / (startAmount / 1e18);
          }
        } else {
          unitPrice = startAmount > 1 ? totalVal / startAmount : totalVal;
        }

        if (unitPrice > 0 && unitPrice >= 0.00001) {
          const entry = {
            unitPrice,
            currency: cur,
            orderCreatedAt: data?.order_created_at || 0
          };
          listingsByKey.set(actKey, [entry]);
        } else {
          verifiedUnlistedKeys.add(actKey);
          listingsByKey.delete(actKey);
        }
      }
    } catch {}
    await sleep(150);
  }

  // Load known official Collectibles IDs
  const knownIdsPath = path.join(ROOT_DIR, 'scripts', 'known_ids.json');
  const knownIds = JSON.parse(fs.readFileSync(knownIdsPath, 'utf8'));

  // Load existing metadata from prices.json
  const existingPricesPath = path.join(ROOT_DIR, 'data', 'prices.json');
  const existingPrices = fs.existsSync(existingPricesPath) ? JSON.parse(fs.readFileSync(existingPricesPath, 'utf8')) : { items: [] };
  const existingMap = new Map();
  (existingPrices.items || []).forEach(i => {
    const col = i.collection || 'collectibles';
    existingMap.set(makeItemKey(col, i.id), i);
  });

  // Build complete unified set of unique composite keys
  const allKeys = new Set([
    // All known collectibles
    ...Object.keys(knownIds).map(k => makeItemKey('collectibles', k)),
    // All in-game collectibles and wearables
    ...Array.from(inGameMap.keys()),
    // All active OpenSea listings
    ...Array.from(listingsByKey.keys()),
    // All existing keys
    ...Array.from(existingMap.keys())
  ]);

  const items = [];

  for (const itemKey of allKeys) {
    const [collection, idStr] = itemKey.split('_');
    const numId = parseInt(idStr, 10);
    const colConfig = COLLECTIONS[collection] || COLLECTIONS.collectibles;
    const inGameInfo = inGameMap.get(itemKey);
    const existing = existingMap.get(itemKey) || {};

    let officialName = '';
    if (inGameInfo && inGameInfo.name) {
      officialName = inGameInfo.name;
    } else if (collection === 'collectibles' && knownIds[numId]) {
      officialName = knownIds[numId];
    } else if (existing.name) {
      officialName = existing.name;
    } else {
      officialName = collection === 'wearables' ? `Wearable #${numId}` : `Sunflower Land #${numId}`;
    }

    const tokenListings = listingsByKey.get(itemKey) || [];
    let isListed = tokenListings.length > 0;
    let rawPrice = 0;
    let floorPrice = 0;
    let currency = 'WETH';
    let orderCreatedAt = 0;

    if (isListed) {
      tokenListings.sort((a, b) => a.unitPrice - b.unitPrice);
      rawPrice = tokenListings[0].unitPrice;
      floorPrice = tokenListings[0].unitPrice;
      currency = tokenListings[0].currency;
      orderCreatedAt = Math.max(...tokenListings.map(l => l.orderCreatedAt || 0));
    }

    const rl = recentListings.get(itemKey);
    const recentlyListed = Boolean(rl);
    const lastListedTimestamp = rl ? rl.timestampMs : (existing.recentlyListed ? existing.lastListedTimestamp : 0);
    const lastListedPrice = rl ? rl.price : (existing.recentlyListed ? existing.lastListedPrice : 0);

    const rs = recentSales.get(itemKey) || (existing.recentlySold ? { timestampMs: existing.lastSaleTimestamp, price: existing.lastSalePrice, currency: existing.lastSaleCurrency } : null);
    const recentlySold = Boolean(rs);
    const lastSalePrice = rs ? rs.price : 0;
    const lastSaleCurrency = rs ? (rs.currency || 'WETH') : 'WETH';
    const lastSaleTimestamp = rs ? rs.timestampMs : 0;

    let inGameFloor = inGameInfo ? inGameInfo.floor : (inGameMap.size > 20 ? null : (existing.inGameFloor || null));
    if (inGameFloor) inGameFloor = Number(inGameFloor.toFixed(4));
    const inGameFloorUsdc = inGameFloor ? Number((inGameFloor * flowerRate).toFixed(4)) : null;

    const haveBoost = inGameInfo ? inGameInfo.haveBoost : Boolean(existing.haveBoost);
    const boostText = (inGameInfo && inGameInfo.boostText) ? inGameInfo.boostText : (existing.boostText || '');
    const supply = (inGameInfo && inGameInfo.supply > 1) ? inGameInfo.supply : (existing.supply || 1);

    items.push({
      key: itemKey,
      id: numId,
      collection: collection,
      collectionName: colConfig.name,
      collectionSlug: colConfig.slug,
      contractAddress: colConfig.contract,
      name: officialName,
      rawPrice,
      floorPrice,
      currency,
      supply,
      haveBoost,
      boostText,
      unlisted: !isListed,
      lastSalePrice,
      lastSaleCurrency,
      lastSaleTimestamp,
      recentlySold,
      recentlyListed,
      lastListedTimestamp,
      lastListedPrice,
      orderCreatedAt,
      inGameFloor,
      inGameFloorUsdc,
      openseaUrl: `https://opensea.io/assets/polygon/${colConfig.contract}/${numId}`
    });
  }

  // Sort items: listed items first by price ascending, then unlisted items by ID
  items.sort((a, b) => {
    if (!a.unlisted && b.unlisted) return -1;
    if (a.unlisted && !b.unlisted) return 1;
    if (!a.unlisted && !b.unlisted) return (a.rawPrice || 0) - (b.rawPrice || 0);
    return a.id - b.id;
  });

  const payload = {
    success: true,
    provider: 'OpenSea Official REST API v2 + In-Game Marketplace',
    lastUpdated: new Date().toISOString(),
    flowerUsdcRate: flowerRate,
    totalItems: items.length,
    activeOpenSeaCount: items.filter(i => !i.unlisted).length,
    activeInGameCount: items.filter(i => i.inGameFloor && i.inGameFloor > 0).length,
    recentlyListedCount: items.filter(i => i.recentlyListed).length,
    recentlySoldCount: items.filter(i => i.recentlySold).length,
    items
  };

  const jsonStr = JSON.stringify(payload);
  const jsStr = `window.INITIAL_COLLECTIBLES_DATA = ${jsonStr};\n`;

  // Write to root data
  fs.writeFileSync(path.join(ROOT_DIR, 'data', 'prices.json'), jsonStr, 'utf8');
  fs.writeFileSync(path.join(ROOT_DIR, 'data.js'), jsStr, 'utf8');

  console.log('\n================ UPDATE COMPLETE ================');
  console.log(`Total items: ${items.length}`);
  console.log(`Active OpenSea listings: ${payload.activeOpenSeaCount}`);
  console.log(`Active In-Game listings: ${payload.activeInGameCount}`);
  console.log(`Recently Listed: ${payload.recentlyListedCount}`);
  console.log(`Recently Sold: ${payload.recentlySoldCount}`);
  console.log(`Catalog size: ${(jsonStr.length / 1024).toFixed(1)} KB`);
}

main().catch(err => {
  console.error('Fatal error during price update:', err);
  process.exit(1);
});
