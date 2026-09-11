/**
 * Script to fetch latest OpenSea / Market prices and save to data/prices.json
 * Can be run manually or automatically via GitHub Actions
 */

const fs = require('fs');
const path = require('path');

const COLLECTION_SLUG = 'sunflower-land-collectibles';
const CONTRACT_ADDRESS = '0x22d5f9b7337a28424268307d08405d4f4cd4d742';
const OPENSEA_API_KEY = process.env.OPENSEA_API_KEY || '';

async function fetchFromLiveMarket() {
  console.log('Fetching prices from live market feed...');
  const res = await fetch('https://sfl.world/api/v1/nfts', {
    headers: { 'User-Agent': 'SunflowerLandPriceTracker/1.0', 'Accept': 'application/json' }
  });
  if (!res.ok) throw new Error(`Market feed HTTP ${res.status}`);
  const json = await res.json();
  const rawList = json.collectibles || [];

  return rawList.map(item => ({
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
}

async function fetchFromOpenSea(apiKey) {
  console.log('Fetching prices from OpenSea v2 API...');
  const res = await fetch(
    `https://api.opensea.io/api/v2/listings/collection/${COLLECTION_SLUG}/best?limit=100`,
    {
      headers: {
        'x-api-key': apiKey,
        'Accept': 'application/json',
        'User-Agent': 'SunflowerLandPriceTracker/1.0'
      }
    }
  );
  if (!res.ok) throw new Error(`OpenSea API HTTP ${res.status}: ${res.statusText}`);
  const json = await res.json();
  const listings = json.listings || [];

  return listings.map(listing => {
    const priceObj = listing.price?.current;
    const rawPrice = priceObj ? parseFloat(priceObj.value) / Math.pow(10, priceObj.decimals || 18) : 0;
    const protocolData = listing.protocol_data?.parameters?.offer?.[0];
    const identifier = protocolData?.identifierOrCriteria || '0';

    return {
      id: parseInt(identifier, 10) || identifier,
      name: `Sunflower Land #${identifier}`,
      floorPrice: rawPrice,
      lastSalePrice: 0,
      supply: 1,
      haveBoost: false,
      boostText: '',
      openseaUrl: `https://opensea.io/assets/matic/${CONTRACT_ADDRESS}/${identifier}`,
      contract: CONTRACT_ADDRESS,
      chain: 'polygon'
    };
  });
}

async function main() {
  let items = [];
  let provider = 'Live Market Aggregator';

  if (OPENSEA_API_KEY) {
    try {
      items = await fetchFromOpenSea(OPENSEA_API_KEY);
      provider = 'OpenSea v2 API';
      console.log(`✅ Successfully fetched ${items.length} items from OpenSea API`);
    } catch (err) {
      console.warn('⚠️ OpenSea API failed, falling back to market feed:', err.message);
      items = await fetchFromLiveMarket();
      provider = 'Live Market Aggregator';
    }
  } else {
    items = await fetchFromLiveMarket();
    console.log(`✅ Successfully fetched ${items.length} items from market feed`);
  }

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
      slug: COLLECTION_SLUG,
      contract: CONTRACT_ADDRESS,
      openseaUrl: `https://opensea.io/collection/${COLLECTION_SLUG}`,
      chain: 'polygon'
    },
    provider,
    totalItems: items.length,
    items
  };

  fs.writeFileSync(outPath, JSON.stringify(payload, null, 2), 'utf-8');
  console.log(`🎉 Saved ${items.length} items to ${outPath}`);
}

main().catch(err => {
  console.error('❌ Failed to fetch prices:', err);
  process.exit(1);
});
