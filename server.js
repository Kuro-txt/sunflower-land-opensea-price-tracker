const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

const COLLECTION_SLUG = process.env.COLLECTION_SLUG || 'sunflower-land-collectibles';
const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS || '0x22d5f9b7337a28424268307d08405d4f4cd4d742';
let customOpenSeaApiKey = process.env.OPENSEA_API_KEY || '';

// Middleware
app.use(cors());
app.use(express.json());

// Serve static assets from both public and root directory
app.use(express.static(path.join(__dirname, 'public')));
app.use('/data', express.static(path.join(__dirname, 'data')));
app.use(express.static(__dirname));

// Cache storage
let cache = {
  data: null,
  timestamp: 0,
  provider: 'Live Market Provider',
};
const CACHE_TTL_MS = 60 * 1000; // 60 seconds

/**
 * Fetch Sunflower Land items from default live market provider
 */
async function fetchFromLiveMarket() {
  try {
    const response = await fetch('https://sfl.world/api/v1/nfts', {
      headers: {
        'User-Agent': 'SunflowerLandPriceTracker/1.0',
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`Market provider returned status ${response.status}`);
    }

    const json = await response.json();
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
  } catch (err) {
    // Fallback to local snapshot if available
    const snapshotPath = path.join(__dirname, 'data', 'prices.json');
    if (fs.existsSync(snapshotPath)) {
      console.log('Loading fallback from local data/prices.json');
      const snap = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
      return snap.items || [];
    }
    throw err;
  }
}

/**
 * Fetch Sunflower Land best listings from OpenSea v2 API (requires OpenSea API Key)
 */
async function fetchFromOpenSea(apiKey) {
  const response = await fetch(
    `https://api.opensea.io/api/v2/listings/collection/${COLLECTION_SLUG}/best?limit=100`,
    {
      headers: {
        'x-api-key': apiKey,
        'Accept': 'application/json',
        'User-Agent': 'SunflowerLandPriceTracker/1.0'
      }
    }
  );

  if (!response.ok) {
    throw new Error(`OpenSea API returned status ${response.status}: ${response.statusText}`);
  }

  const json = await response.json();
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

/**
 * Get items data with caching
 */
async function getCollectibles(forceRefresh = false) {
  const now = Date.now();
  if (!forceRefresh && cache.data && (now - cache.timestamp < CACHE_TTL_MS)) {
    return {
      items: cache.data,
      cached: true,
      lastUpdated: cache.timestamp,
      provider: cache.provider
    };
  }

  let items = [];
  let provider = 'Live Market Aggregator';

  if (customOpenSeaApiKey) {
    try {
      items = await fetchFromOpenSea(customOpenSeaApiKey);
      provider = 'OpenSea v2 API (Direct)';
    } catch (err) {
      console.warn('OpenSea API failed, falling back to Market Provider:', err.message);
      items = await fetchFromLiveMarket();
      provider = `Live Market Aggregator (OpenSea fallback)`;
    }
  } else {
    items = await fetchFromLiveMarket();
  }

  items.sort((a, b) => a.floorPrice - b.floorPrice);

  cache = {
    data: items,
    timestamp: now,
    provider: provider
  };

  return {
    items,
    cached: false,
    lastUpdated: now,
    provider
  };
}

// Routes
// 1. GET /api/prices
app.get('/api/prices', async (req, res) => {
  try {
    const forceRefresh = req.query.refresh === 'true';
    const { items, cached, lastUpdated, provider } = await getCollectibles(forceRefresh);

    let filtered = [...items];

    if (req.query.search) {
      const q = req.query.search.toLowerCase().trim();
      filtered = filtered.filter(item => 
        item.name.toLowerCase().includes(q) || String(item.id).includes(q)
      );
    }

    if (req.query.boost === 'true') {
      filtered = filtered.filter(item => item.haveBoost);
    } else if (req.query.boost === 'false') {
      filtered = filtered.filter(item => !item.haveBoost);
    }

    if (req.query.minPrice) {
      const min = parseFloat(req.query.minPrice);
      if (!isNaN(min)) filtered = filtered.filter(item => item.floorPrice >= min);
    }
    if (req.query.maxPrice) {
      const max = parseFloat(req.query.maxPrice);
      if (!isNaN(max)) filtered = filtered.filter(item => item.floorPrice <= max);
    }

    const sort = req.query.sort || 'price_asc';
    if (sort === 'price_asc') {
      filtered.sort((a, b) => a.floorPrice - b.floorPrice);
    } else if (sort === 'price_desc') {
      filtered.sort((a, b) => b.floorPrice - a.floorPrice);
    } else if (sort === 'last_sale_desc') {
      filtered.sort((a, b) => b.lastSalePrice - a.lastSalePrice);
    } else if (sort === 'supply_desc') {
      filtered.sort((a, b) => b.supply - a.supply);
    } else if (sort === 'supply_asc') {
      filtered.sort((a, b) => a.supply - b.supply);
    } else if (sort === 'name_asc') {
      filtered.sort((a, b) => a.name.localeCompare(b.name));
    }

    res.json({
      success: true,
      collection: {
        name: 'Sunflower Land Collectibles',
        slug: COLLECTION_SLUG,
        contract: CONTRACT_ADDRESS,
        openseaUrl: `https://opensea.io/collection/${COLLECTION_SLUG}`,
        chain: 'polygon'
      },
      cached,
      provider,
      lastUpdated: new Date(lastUpdated).toISOString(),
      totalItems: items.length,
      filteredCount: filtered.length,
      items: filtered
    });
  } catch (error) {
    console.error('Error fetching prices:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch items price'
    });
  }
});

// 2. GET /api/stats
app.get('/api/stats', async (req, res) => {
  try {
    const { items, lastUpdated, provider } = await getCollectibles(false);

    const prices = items.map(i => i.floorPrice).filter(p => p > 0);
    const minPrice = prices.length ? Math.min(...prices) : 0;
    const maxPrice = prices.length ? Math.max(...prices) : 0;
    const avgPrice = prices.length ? prices.reduce((a, b) => a + b, 0) / prices.length : 0;
    const sortedPrices = [...prices].sort((a, b) => a - b);
    const medianPrice = sortedPrices.length ? sortedPrices[Math.floor(sortedPrices.length / 2)] : 0;
    const boostCount = items.filter(i => i.haveBoost).length;
    const totalSupply = items.reduce((acc, cur) => acc + (cur.supply || 0), 0);

    res.json({
      success: true,
      collectionSlug: COLLECTION_SLUG,
      contractAddress: CONTRACT_ADDRESS,
      provider,
      lastUpdated: new Date(lastUpdated).toISOString(),
      totalTrackedItems: items.length,
      collectionFloor: minPrice,
      maxPrice: Number(maxPrice.toFixed(4)),
      averagePrice: Number(avgPrice.toFixed(4)),
      medianPrice: Number(medianPrice.toFixed(4)),
      boostItemsCount: boostCount,
      totalSupply
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 3. POST /api/settings
app.post('/api/settings', (req, res) => {
  const { apiKey } = req.body;
  customOpenSeaApiKey = (apiKey || '').trim();
  cache.data = null;
  res.json({
    success: true,
    hasApiKey: Boolean(customOpenSeaApiKey),
    message: customOpenSeaApiKey ? 'OpenSea API Key updated successfully.' : 'API Key cleared.'
  });
});

// 4. GET /api/health
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    hasOpenSeaKey: Boolean(customOpenSeaApiKey),
    collectionSlug: COLLECTION_SLUG
  });
});

// Fallback to root index.html or public/index.html
app.get('*', (req, res) => {
  const rootIndex = path.join(__dirname, 'index.html');
  if (fs.existsSync(rootIndex)) {
    return res.sendFile(rootIndex);
  }
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`===================================================`);
  console.log(` Sunflower Land OpenSea Price Tracker`);
  console.log(` Server running on http://localhost:${PORT}`);
  console.log(` Collection: https://opensea.io/collection/${COLLECTION_SLUG}`);
  console.log(`===================================================`);
});
