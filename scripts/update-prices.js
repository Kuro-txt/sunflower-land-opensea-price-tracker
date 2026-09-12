/**
 * Unified Price Updater
 * Fetches fresh OpenSea listings, recent listing events, recent sales,
 * in-game marketplace floors, and live FLOWER -> USDC exchange rate.
 *
 * Usage:
 *   node scripts/update-prices.js [OPENSEA_API_KEY]
 */

const fs = require('fs');
const path = require('path');
const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');

const OPENSEA_API_KEY = process.env.OPENSEA_API_KEY || process.argv[2] || 'add815580a904473ba7f162c0ccc4926';
const COLLECTION_SLUG = 'sunflower-land-collectibles';
const CONTRACT_ADDRESS = '0x22d5f9b75c524fec1d6619787e582644cd4d7422';
const ROOT_DIR = path.resolve(__dirname, '..');

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

// 2. Fetch live In-Game Marketplace Prices
async function fetchInGamePrices() {
  console.log('🎮 Fetching live in-game marketplace prices...');
  const inGameMap = new Map();
  try {
    const data = await fetchWithRetry('https://sfl.world/api/v1/nfts');
    const list = data?.collectibles || data?.data || (Array.isArray(data) ? data : []);
    for (const item of list) {
      if (item.id && item.floor) {
        inGameMap.set(String(item.id), {
          floor: Number(item.floor),
          lastSalePrice: item.lastSalePrice ? Number(item.lastSalePrice) : 0,
          supply: item.supply ? Number(item.supply) : 1,
          haveBoost: item.have_boost === 1,
          boostText: item.boost_text || '',
          name: item.name || ''
        });
      }
    }
    console.log(`✅ Fetched ${inGameMap.size} in-game listed items.`);
    fs.writeFileSync(path.join(ROOT_DIR, 'data', 'ingame_nfts.json'), JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.warn('⚠️ Could not fetch in-game prices from API, checking local fallback:', err.message);
    const localFile = path.join(ROOT_DIR, 'data', 'ingame_nfts.json');
    if (fs.existsSync(localFile)) {
      const local = JSON.parse(fs.readFileSync(localFile, 'utf8'));
      const list = local?.collectibles || local?.data || (Array.isArray(local) ? local : []);
      list.forEach(item => {
        if (item.id && item.floor) {
          inGameMap.set(String(item.id), {
            floor: Number(item.floor),
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
  return inGameMap;
}

// Verify exact OpenSea floor price for in-game traded items directly via /nfts/{id}/best
async function verifyOpenSeaFloorsForInGameItems(inGameMap, listingsByToken) {
  console.log(`🔍 Verifying live OpenSea floors for ${inGameMap.size} in-game active items...`);
  const ids = Array.from(inGameMap.keys());
  const batchSize = 8;
  let verifiedCount = 0;

  for (let i = 0; i < ids.length; i += batchSize) {
    const chunk = ids.slice(i, i + batchSize);
    await Promise.all(chunk.map(async (id) => {
      try {
        const res = await fetch(`https://api.opensea.io/api/v2/listings/collection/${COLLECTION_SLUG}/nfts/${id}/best`, {
          headers: { 'x-api-key': OPENSEA_API_KEY, 'accept': 'application/json' }
        });
        if (!res.ok) return;
        const data = await res.json();
        const cur = data.price?.current?.currency || 'WETH';
        const dec = data.price?.current?.decimals != null ? data.price.current.decimals : 18;
        const totalVal = data.price?.current?.value ? (Number(data.price.current.value) / Math.pow(10, dec)) : 0;
        const offer = data.protocol_data?.parameters?.offer?.[0];
        const startAmount = Number(offer?.startAmount || '1');

        let unitPrice = totalVal;
        if (isResourceToken(id)) {
          if (startAmount < 1e18) return;
          unitPrice = totalVal / (startAmount / 1e18);
          if (unitPrice < 0.00001 || unitPrice > 500) return;
        } else {
          unitPrice = startAmount > 1 ? totalVal / startAmount : totalVal;
          if (unitPrice < 0.000001) return;
        }

        if (unitPrice > 0) {
          listingsByToken.set(id, [{
            unitPrice,
            currency: cur,
            orderCreatedAt: data.order_created_at
          }]);
          verifiedCount++;
        }
      } catch {}
    }));
    process.stdout.write(`  Verified ${Math.min(i + batchSize, ids.length)}/${ids.length} in-game items (${verifiedCount} listed on OS)\r`);
    await sleep(100);
  }
  console.log(`\n✅ Verified ${verifiedCount} in-game items actively listed on OpenSea.`);
}

// 3. Fetch all OpenSea active listings
async function fetchAllOpenSeaListings() {
  console.log('🌊 Fetching all active listings from OpenSea API...');
  const listingsByToken = new Map();
  let next = '';
  let page = 1;
  let totalListings = 0;

  while (true) {
    let url = `https://api.opensea.io/api/v2/listings/collection/${COLLECTION_SLUG}/all?limit=100`;
    if (next) url += `&next=${encodeURIComponent(next)}`;

    try {
      const data = await fetchWithRetry(url, { 'x-api-key': OPENSEA_API_KEY });
      const batch = data.listings || [];
      totalListings += batch.length;

      for (const l of batch) {
        const offer = l.protocol_data?.parameters?.offer?.[0];
        const id = offer?.identifierOrCriteria;
        if (!id) continue;

        const cur = l.price?.current?.currency || 'WETH';
        const dec = l.price?.current?.decimals != null ? l.price.current.decimals : 18;
        const totalVal = l.price?.current?.value ? (Number(l.price.current.value) / Math.pow(10, dec)) : 0;
        const startAmount = Number(offer?.startAmount || '1');

        let unitPrice = totalVal;
        if (isResourceToken(id)) {
          // Resources have 18 decimals in the Sunflower Land contract
          if (startAmount < 1e18) continue; // Skip micro-dust orders (<1 whole item)
          unitPrice = totalVal / (startAmount / 1e18);
          if (unitPrice < 0.00001 || unitPrice > 500) continue; // Skip spam orders
        } else {
          unitPrice = startAmount > 1 ? totalVal / startAmount : totalVal;
          if (unitPrice < 0.000001) continue; // Skip micro-dust
        }

        if (!listingsByToken.has(id)) {
          listingsByToken.set(id, []);
        }
        listingsByToken.get(id).push({
          unitPrice,
          currency: cur,
          orderCreatedAt: l.order_created_at
        });
      }

      process.stdout.write(`  Page ${page}: got ${batch.length} listings | Total: ${totalListings} | Tokens: ${listingsByToken.size}\r`);

      if (!data.next || batch.length === 0) break;
      next = data.next;
      page++;
      await sleep(150);
    } catch (err) {
      console.error(`\n❌ Error fetching OpenSea listings page ${page}:`, err.message);
      break;
    }
  }

  console.log(`\n✅ Finished OpenSea listings: ${totalListings} listings across ${listingsByToken.size} tokens.`);
  return listingsByToken;
}

// 4. Fetch real-time Recent Listing Events
async function fetchRecentListingEvents() {
  console.log('⚡ Fetching real-time recent listing events from OpenSea...');
  const recentListings = new Map();
  let next = '';

  for (let page = 1; page <= 3; page++) {
    let url = `https://api.opensea.io/api/v2/events/collection/${COLLECTION_SLUG}?event_type=listing&limit=50`;
    if (next) url += `&next=${encodeURIComponent(next)}`;

    try {
      const data = await fetchWithRetry(url, { 'x-api-key': OPENSEA_API_KEY });
      const events = data.asset_events || [];

      for (const ev of events) {
        const id = String(ev.asset?.identifier || '');
        if (!id) continue;

        const dec = ev.payment?.decimals || 18;
        const price = ev.payment?.quantity ? (Number(ev.payment.quantity) / Math.pow(10, dec)) : 0;
        const timestampMs = (ev.event_timestamp || 0) * 1000;

        if (!recentListings.has(id) || timestampMs > recentListings.get(id).timestampMs) {
          recentListings.set(id, {
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
      console.error('Error fetching recent listing events:', err.message);
      break;
    }
  }

  console.log(`✅ Found ${recentListings.size} recently listed tokens.`);
  return recentListings;
}

// 5. Fetch real-time Recent Sale Events
async function fetchRecentSaleEvents() {
  console.log('🔥 Fetching real-time recent sale events from OpenSea...');
  const recentSales = new Map();
  let next = '';

  for (let page = 1; page <= 3; page++) {
    let url = `https://api.opensea.io/api/v2/events/collection/${COLLECTION_SLUG}?event_type=sale&limit=50`;
    if (next) url += `&next=${encodeURIComponent(next)}`;

    try {
      const data = await fetchWithRetry(url, { 'x-api-key': OPENSEA_API_KEY });
      const events = data.asset_events || [];

      for (const ev of events) {
        const id = String(ev.asset?.identifier || ev.nft?.identifier || '');
        if (!id) continue;

        const dec = ev.payment?.decimals || 18;
        const price = ev.payment?.quantity ? (Number(ev.payment.quantity) / Math.pow(10, dec)) : 0;
        const timestampMs = (ev.event_timestamp || 0) * 1000;

        if (!recentSales.has(id) || timestampMs > recentSales.get(id).timestampMs) {
          recentSales.set(id, {
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
      console.error('Error fetching recent sale events:', err.message);
      break;
    }
  }

  console.log(`✅ Found ${recentSales.size} recently sold tokens.`);
  return recentSales;
}

async function main() {
  console.log('🚀 Starting fresh price update...\n');

  const flowerRate = await fetchExchangeRate();
  const inGameMap = await fetchInGamePrices();
  const listingsByToken = new Map();

  // 1. Verify exact live OpenSea floors for all active in-game traded items
  await verifyOpenSeaFloorsForInGameItems(inGameMap, listingsByToken);

  // 2. Fetch recent listing and sale events from OpenSea
  const [recentListings, recentSales] = await Promise.all([
    fetchRecentListingEvents(),
    fetchRecentSaleEvents()
  ]);

  // Load known official IDs
  const knownIdsPath = path.join(ROOT_DIR, 'scripts', 'known_ids.json');
  const knownIds = JSON.parse(fs.readFileSync(knownIdsPath, 'utf8'));

  // Load existing metadata (boosts, etc.)
  const existingPricesPath = path.join(ROOT_DIR, 'data', 'prices.json');
  const existingPrices = fs.existsSync(existingPricesPath) ? JSON.parse(fs.readFileSync(existingPricesPath, 'utf8')) : { items: [] };
  const existingMap = new Map();
  (existingPrices.items || []).forEach(i => existingMap.set(String(i.id), i));

  const allIds = new Set([
    ...Object.keys(knownIds).map(k => String(k)),
    ...Array.from(listingsByToken.keys()).map(k => String(k)),
    ...Array.from(inGameMap.keys()).map(k => String(k)),
    ...Array.from(existingMap.keys()).map(k => String(k))
  ]);

  const items = [];

  for (const idStr of allIds) {
    const numId = parseInt(idStr, 10);
    const inGameInfo = inGameMap.get(idStr);
    const existing = existingMap.get(idStr) || {};
    const officialName = (inGameInfo && inGameInfo.name) ? inGameInfo.name : (knownIds[numId] || existing.name || `Sunflower Land #${numId}`);

    const tokenListings = listingsByToken.get(idStr) || [];
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

    const rl = recentListings.get(idStr);
    const recentlyListed = Boolean(rl);
    const lastListedTimestamp = rl ? rl.timestampMs : (existing.recentlyListed ? existing.lastListedTimestamp : 0);
    const lastListedPrice = rl ? rl.price : (existing.recentlyListed ? existing.lastListedPrice : 0);

    // If item was unlisted in floor check but has an active recent listing event
    if (!isListed && rl && rl.price > 0 && rl.price >= 0.00001 && (!isResourceToken(numId) || rl.price < 100)) {
      isListed = true;
      rawPrice = rl.price;
      floorPrice = rl.price;
      currency = rl.currency || 'WETH';
    }

    const rs = recentSales.get(idStr) || (existing.recentlySold ? { timestampMs: existing.lastSaleTimestamp, price: existing.lastSalePrice, currency: existing.lastSaleCurrency } : null);
    const recentlySold = Boolean(rs);
    const lastSalePrice = rs ? rs.price : 0;
    const lastSaleCurrency = rs ? (rs.currency || 'WETH') : 'WETH';
    const lastSaleTimestamp = rs ? rs.timestampMs : 0;

    let inGameFloor = inGameInfo ? inGameInfo.floor : (existing.inGameFloor || null);
    if (inGameFloor) inGameFloor = Number(inGameFloor.toFixed(4));
    const inGameFloorUsdc = inGameFloor ? Number((inGameFloor * flowerRate).toFixed(4)) : null;

    const haveBoost = inGameInfo ? inGameInfo.haveBoost : Boolean(existing.haveBoost);
    const boostText = (inGameInfo && inGameInfo.boostText) ? inGameInfo.boostText : (existing.boostText || '');
    const supply = (inGameInfo && inGameInfo.supply > 1) ? inGameInfo.supply : (existing.supply || 1);

    items.push({
      id: numId,
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
      openseaUrl: `https://opensea.io/assets/polygon/${CONTRACT_ADDRESS}/${numId}`
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
