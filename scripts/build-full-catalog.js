/**
 * Complete OpenSea Catalog Builder
 * 1. Uses official KNOWN_IDS from sunflower-land repository (known_ids.json)
 *    so items show as "Iron", "Wood", "Stone", "Gold", "Egg", "Chef Bear", etc.
 * 2. Fetches real OpenSea listing prices from OpenSea API v2.
 * 3. Fetches recent sales from OpenSea API v2 events endpoint so "Recently Sold" filter works.
 */

const fs = require('fs');
const path = require('path');

const OPENSEA_API_KEY = process.env.OPENSEA_API_KEY || 'add815580a904473ba7f162c0ccc4926';
const COLLECTION_SLUG = 'sunflower-land-collectibles';
const CONTRACT_ADDRESS = '0x22d5f9b7337a28424268307d08405d4f4cd4d7422';

// 1. Load Known IDs extracted from sunflower-land repo
let knownIdsMap = {};
try {
  const knownPath = path.join(__dirname, 'known_ids.json');
  if (fs.existsSync(knownPath)) {
    knownIdsMap = JSON.parse(fs.readFileSync(knownPath, 'utf8'));
  }
} catch (e) {
  console.warn('Could not load known_ids.json:', e.message);
}

// 2. Load boosts and descriptions from previous catalog
let boostsMap = {};
try {
  const prevPath = path.join(__dirname, '..', 'data', 'prices.json');
  if (fs.existsSync(prevPath)) {
    const prev = JSON.parse(fs.readFileSync(prevPath, 'utf8'));
    (prev.items || []).forEach(i => {
      boostsMap[String(i.id)] = {
        haveBoost: i.haveBoost,
        boostText: i.boostText,
        supply: i.supply || 0
      };
    });
  }
} catch (e) {
  console.warn('Could not load previous boosts:', e.message);
}

async function fetchOpenSeaSales() {
  console.log('Fetching recent sales from OpenSea API...');
  const salesByToken = new Map();
  try {
    const res = await fetch(`https://api.opensea.io/api/v2/events/collection/${COLLECTION_SLUG}?event_type=sale&limit=50`, {
      headers: {
        'x-api-key': OPENSEA_API_KEY,
        'Accept': 'application/json',
        'User-Agent': 'SunflowerLandPriceTracker/1.0'
      }
    });

    if (res.ok) {
      const data = await res.json();
      const events = data.asset_events || [];
      console.log(`✅ Retrieved ${events.length} recent OpenSea sale events.`);

      for (const ev of events) {
        const tokenId = String(ev.nft?.identifier || '');
        if (!tokenId) continue;

        const priceQuantity = parseFloat(ev.payment?.quantity || '0');
        const decimals = ev.payment?.decimals !== undefined ? ev.payment.decimals : 18;
        const salePrice = priceQuantity / Math.pow(10, decimals);
        const symbol = (ev.payment?.symbol || 'WETH').toUpperCase();
        const saleTimestamp = ev.event_timestamp ? ev.event_timestamp * 1000 : Date.now();

        if (!salesByToken.has(tokenId) || salesByToken.get(tokenId).timestamp < saleTimestamp) {
          salesByToken.set(tokenId, {
            price: Number(salePrice.toFixed(6)),
            currency: symbol === 'MATIC' ? 'POL' : symbol,
            timestamp: saleTimestamp,
            dateStr: new Date(saleTimestamp).toLocaleDateString(),
            txHash: ev.transaction
          });
        }
      }
    }
  } catch (err) {
    console.warn('Failed to fetch recent sales:', err.message);
  }
  return salesByToken;
}

async function buildFullCatalog() {
  console.log(`🌐 Building complete catalog from OpenSea API and Sunflower Land repo...`);
  
  // 1. Fetch recent sales
  const recentSales = await fetchOpenSeaSales();

  // 2. Fetch active OpenSea listings
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
        'User-Agent': 'SunflowerLandPriceTracker/1.0'
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

  console.log(`\n✅ Finished fetching OpenSea listings: ${allListings.length} total listings.`);

  // 3. Map tokens to best OpenSea price
  const tokenMap = new Map();

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

    // Resolve official item name from sunflower-land repo KNOWN_IDS!
    const officialName = knownIdsMap[tokenId] || knownIdsMap[parseInt(tokenId, 10)];
    const boostInfo = boostsMap[tokenId] || {};

    const saleInfo = recentSales.get(tokenId);

    const record = {
      id: parseInt(tokenId, 10) || tokenId,
      name: officialName || `Collectible #${tokenId}`,
      floorPrice: Number(pricePerUnit.toFixed(6)),
      rawPrice: pricePerUnit,
      totalListingPrice: Number(rawVal.toFixed(6)),
      listingQuantity: offerQty,
      currency: currency === 'MATIC' ? 'POL' : currency,
      supply: boostInfo.supply || 1,
      haveBoost: Boolean(boostInfo.haveBoost),
      boostText: boostInfo.boostText || '',
      unlisted: false,
      lastSalePrice: saleInfo ? saleInfo.price : 0,
      lastSaleCurrency: saleInfo ? saleInfo.currency : 'WETH',
      lastSaleTimestamp: saleInfo ? saleInfo.timestamp : 0,
      recentlySold: Boolean(saleInfo),
      orderHash: l.order_hash,
      orderCreatedAt: l.order_created_at,
      openseaUrl: `https://opensea.io/assets/matic/${CONTRACT_ADDRESS}/${tokenId}`,
      imageUrl: `https://sunflower-land.com/play/erc1155/images/${tokenId}.webp`,
      contract: CONTRACT_ADDRESS,
      chain: 'polygon',
      source: 'OpenSea API v2'
    };

    if (!tokenMap.has(tokenId) || tokenMap.get(tokenId).rawPrice > record.rawPrice) {
      tokenMap.set(tokenId, record);
    }
  }

  // 4. Also include known items from the repo catalog that are unlisted
  for (const [idStr, name] of Object.entries(knownIdsMap)) {
    if (!tokenMap.has(idStr)) {
      const boostInfo = boostsMap[idStr] || {};
      const saleInfo = recentSales.get(idStr);

      tokenMap.set(idStr, {
        id: parseInt(idStr, 10) || idStr,
        name: name,
        floorPrice: 0,
        rawPrice: 0,
        currency: 'WETH',
        unlisted: true,
        supply: boostInfo.supply || 1,
        haveBoost: Boolean(boostInfo.haveBoost),
        boostText: boostInfo.boostText || '',
        lastSalePrice: saleInfo ? saleInfo.price : 0,
        lastSaleCurrency: saleInfo ? saleInfo.currency : 'WETH',
        lastSaleTimestamp: saleInfo ? saleInfo.timestamp : 0,
        recentlySold: Boolean(saleInfo),
        openseaUrl: `https://opensea.io/assets/matic/${CONTRACT_ADDRESS}/${idStr}`,
        imageUrl: `https://sunflower-land.com/play/erc1155/images/${idStr}.webp`,
        contract: CONTRACT_ADDRESS,
        chain: 'polygon',
        source: 'OpenSea API v2 (Unlisted)'
      });
    }
  }

  const items = Array.from(tokenMap.values());

  // Sort listed first (by price asc), then unlisted
  items.sort((a, b) => {
    if (a.unlisted && !b.unlisted) return 1;
    if (!a.unlisted && b.unlisted) return -1;
    return a.rawPrice - b.rawPrice;
  });

  const activeListed = items.filter(i => !i.unlisted && i.rawPrice > 0.00001);
  const minFloor = activeListed.length > 0 ? activeListed[0].floorPrice : 0;
  const recentlySoldItems = items.filter(i => i.recentlySold);

  console.log(`\n🎉 Total Items in Catalog: ${items.length}`);
  console.log(`Active OpenSea Listings: ${activeListed.length}`);
  console.log(`Items with Recent OpenSea Sales: ${recentlySoldItems.length}`);
  console.log(`OpenSea Floor: ${minFloor} WETH`);

  // Verify ID 603, 601, 602 names
  console.log('Sample verified names:');
  [601, 602, 603, 604, 605, 401, 404, 1205, 1210, 2033].forEach(id => {
    const it = tokenMap.get(String(id));
    if (it) console.log(`  ID ${id} => Name: "${it.name}", Price: ${it.floorPrice} ${it.currency}, Unlisted: ${it.unlisted}`);
  });

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
    recentlySoldCount: recentlySoldItems.length,
    collectionFloor: minFloor,
    items
  };

  const dataDir = path.join(__dirname, '..', 'data');
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

  fs.writeFileSync(path.join(dataDir, 'prices.json'), JSON.stringify(payload, null, 2), 'utf8');

  const jsContent = `// Pre-bundled OpenSea official prices snapshot with Sunflower Land repo names\nwindow.INITIAL_COLLECTIBLES_DATA = ${JSON.stringify(payload)};\n`;
  fs.writeFileSync(path.join(__dirname, '..', 'data.js'), jsContent, 'utf8');
  fs.writeFileSync(path.join(__dirname, '..', 'public', 'data.js'), jsContent, 'utf8');

  console.log('✅ Updated data/prices.json, data.js, and public/data.js!');
}

buildFullCatalog().catch(err => {
  console.error('❌ Error in buildFullCatalog:', err);
  process.exit(1);
});
