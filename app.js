// Sunflower Land OpenSea Price Tracker Client Application
// Supports both Sunflower Land Collectibles & Bumpkin Wearables NFT contracts on Polygon!

// Preference management helpers for remembering user configuration
function getSavedPreference(key, fallback, allowedList) {
  try {
    const val = localStorage.getItem(key);
    if (val && (!allowedList || allowedList.includes(val))) {
      return val;
    }
  } catch {}
  return fallback;
}

function savePreference(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {}
}

const ALLOWED_FILTERS = ['all', 'collectibles', 'wearables', 'diff', 'boost', 'without-boost', 'no-boost', 'recently-listed', 'cosmetic'];
const ALLOWED_SORTS = ['diff_desc', 'diff_asc', 'price_asc', 'price_desc', 'ingame_asc', 'ingame_desc', 'recently_listed', 'recently_sold', 'last_sale_desc', 'supply_desc', 'supply_asc', 'name_asc'];
const ALLOWED_VIEWS = ['grid', 'table'];

const COLLECTIONS = {
  collectibles: {
    key: 'collectibles',
    slug: 'sunflower-land-collectibles',
    contract: '0x22d5f9b75c524fec1d6619787e582644cd4d7422',
    name: 'Collectibles'
  },
  wearables: {
    key: 'wearables',
    slug: 'bumpkin-wearables',
    contract: '0x4bb5b2461e9ef782152c3a96698b2a4cf55b6162',
    name: 'Wearables'
  }
};

let allItems = [];
let filteredItems = [];
let currentFilter = getSavedPreference('sfl_filter', 'all', ALLOWED_FILTERS);
let currentSearch = '';
let currentSort = getSavedPreference('sfl_sort', 'price_asc', ALLOWED_SORTS);
let currentView = getSavedPreference('sfl_view', 'grid', ALLOWED_VIEWS);
let isLoading = false;
let flowerUsdcRate = 0.19009181;
let customApiKey = localStorage.getItem('opensea_api_key') || 'add815580a904473ba7f162c0ccc4926';

// Live ETH price in USD (auto-updated from live market API)
let ethUsdPrice = 2500;

/**
 * Get unique composite item key (e.g. "collectibles_481" vs "wearables_481")
 */
function getItemKey(item) {
  if (!item) return '';
  if (typeof item === 'string') return item;
  if (item.key) return item.key;
  const col = item.collection || 'collectibles';
  return `${col}_${item.id}`;
}

/**
 * Generate official OpenSea item URL on Polygon (routing accurately to Collectibles vs Wearables)
 */
function getOpenSeaUrl(item) {
  if (typeof item === 'object' && item !== null) {
    if (item.openseaUrl) return item.openseaUrl;
    const col = item.collection === 'wearables' ? 'wearables' : 'collectibles';
    const contract = item.contractAddress || COLLECTIONS[col].contract;
    return `https://opensea.io/assets/polygon/${contract}/${item.id}`;
  }
  return `https://opensea.io/assets/polygon/0x22d5f9b75c524fec1d6619787e582644cd4d7422/${item}`;
}

function isResourceToken(id, collection = 'collectibles') {
  if (collection !== 'collectibles') return false;
  const num = Number(id);
  return (num >= 201 && num <= 220) || (num >= 601 && num <= 605) || (num >= 301 && num <= 304);
}

// DOM Elements
const itemsGrid = document.getElementById('itemsGrid');
const itemsTableContainer = document.getElementById('itemsTableContainer');
const itemsTableBody = document.getElementById('itemsTableBody');
const loadingState = document.getElementById('loadingState');
const errorState = document.getElementById('errorState');
const emptyState = document.getElementById('emptyState');
const filteredCountEl = document.getElementById('filteredCount');
const totalCountEl = document.getElementById('totalCount');

// Stats Elements
const statFloor = document.getElementById('statFloor');
const statFlowerRate = document.getElementById('statFlowerRate');
const statInGameCount = document.getElementById('statInGameCount');
const statTotalItems = document.getElementById('statTotalItems');
const statBoostCount = document.getElementById('statBoostCount');
const statProvider = document.getElementById('statProvider');
const statLastUpdated = document.getElementById('statLastUpdated');

// Controls
const searchInput = document.getElementById('searchInput');
const clearSearchBtn = document.getElementById('clearSearchBtn');
const sortSelect = document.getElementById('sortSelect');
const viewGridBtn = document.getElementById('viewGridBtn');
const viewTableBtn = document.getElementById('viewTableBtn');
const refreshBtn = document.getElementById('refreshBtn');
const refreshIcon = document.getElementById('refreshIcon');
const resetFiltersBtn = document.getElementById('resetFiltersBtn');

// Modal Elements
const settingsModal = document.getElementById('settingsModal');
const openSettingsBtn = document.getElementById('openSettingsBtn');
const closeSettingsBtn = document.getElementById('closeSettingsBtn');
const cancelSettingsBtn = document.getElementById('cancelSettingsBtn');
const saveSettingsBtn = document.getElementById('saveSettingsBtn');
const openseaApiKeyInput = document.getElementById('openseaApiKeyInput');

/**
 * Format OpenSea Crypto Price (WETH)
 */
function formatCryptoPrice(num) {
  if (num === null || num === undefined || isNaN(num) || num <= 0) return 'Unlisted';
  if (num < 0.000001) return '<0.0001';
  if (num < 0.0001) return num.toFixed(6);
  if (num < 0.001) return num.toFixed(5);
  if (num < 1) return num.toFixed(4);
  return num.toLocaleString(undefined, { maximumFractionDigits: 3 });
}

/**
 * Format relative time ago for listing/sale timestamps
 */
function formatTimeAgo(timestampMs) {
  if (!timestampMs) return '';
  const diffSec = Math.floor((Date.now() - timestampMs) / 1000);
  if (diffSec < 60) return 'Just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHrs = Math.floor(diffMin / 60);
  if (diffHrs < 24) return `${diffHrs}h ago`;
  const diffDays = Math.floor(diffHrs / 24);
  return `${diffDays}d ago`;
}

/**
 * Format USD equivalent
 */
function formatUsdEstimate(wethPrice) {
  if (!wethPrice || wethPrice <= 0) return '';
  const usd = wethPrice * ethUsdPrice;
  if (usd < 0.01) return '<$0.01 USD';
  return `~$${usd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD`;
}

/**
 * Format In-Game Price (FLOWER / SFL Token)
 */
function formatFlowerPrice(num) {
  if (num === null || num === undefined || isNaN(num) || num <= 0) return '0';
  if (num < 0.00001) return '<0.0001';
  if (num < 0.001) return num.toFixed(4);
  if (num < 1) return num.toFixed(3);
  if (num < 100) return num.toFixed(2);
  return num.toLocaleString(undefined, { maximumFractionDigits: 1 });
}

/**
 * Format Flower Price converted to USDC
 */
function formatFlowerUsdc(flowerPrice) {
  if (!flowerPrice || flowerPrice <= 0 || !flowerUsdcRate) return '';
  const usdc = flowerPrice * flowerUsdcRate;
  if (usdc < 0.01) return '<$0.01 USDC';
  return `~$${usdc.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDC`;
}

/**
 * Convert OpenSea WETH price to Flower / SFL token equivalent based on live USD exchange rates
 */
function formatOpenSeaFlowerEquivalent(wethPrice) {
  if (!wethPrice || wethPrice <= 0 || !flowerUsdcRate || flowerUsdcRate <= 0) return '';
  const usd = wethPrice * ethUsdPrice;
  const flowerEquiv = usd / flowerUsdcRate;
  return `≈ ${formatFlowerPrice(flowerEquiv)} SFL`;
}

/**
 * Show Loading Skeletons
 */
function showLoading(show) {
  isLoading = show;
  if (show) {
    refreshIcon.classList.add('animate-spin-custom');
    loadingState.classList.remove('hidden');
    itemsGrid.classList.add('hidden');
    itemsTableContainer.classList.add('hidden');
    emptyState.classList.add('hidden');
    errorState.classList.add('hidden');

    loadingState.innerHTML = Array(8).fill(0).map(() => `
      <div class="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 animate-pulse space-y-3">
        <div class="flex justify-between items-center">
          <div class="h-4 w-12 bg-slate-800 rounded-full"></div>
          <div class="h-4 w-16 bg-slate-800 rounded-full"></div>
        </div>
        <div class="h-5 w-3/4 bg-slate-800 rounded"></div>
        <div class="h-10 bg-slate-800/80 rounded-xl"></div>
        <div class="pt-2 flex justify-between">
          <div class="h-4 w-20 bg-slate-800 rounded"></div>
          <div class="h-4 w-20 bg-slate-800 rounded"></div>
        </div>
      </div>
    `).join('');
  } else {
    refreshIcon.classList.remove('animate-spin-custom');
    loadingState.classList.add('hidden');
  }
}

/**
 * Compute stats on client side from items array
 */
function computeClientStats(items, provider = 'OpenSea + In-Game', lastUpdated = new Date(), flowerRate = flowerUsdcRate) {
  const listedWithPrice = items.filter(i => !i.unlisted && i.rawPrice > 0.000000001);
  const prices = listedWithPrice.map(i => i.rawPrice);
  const minPrice = prices.length ? Math.min(...prices) : 0;
  const inGameListed = items.filter(i => i.inGameFloor && i.inGameFloor > 0);
  const boostCount = items.filter(i => i.haveBoost).length;

  if (statFloor) {
    statFloor.textContent = formatCryptoPrice(minPrice);
  }
  if (statFlowerRate) {
    statFlowerRate.textContent = '$' + (flowerRate || flowerUsdcRate).toFixed(4);
  }
  if (statInGameCount) {
    statInGameCount.textContent = inGameListed.length.toLocaleString();
  }
  if (statTotalItems) {
    statTotalItems.textContent = items.length.toLocaleString();
  }
  if (statBoostCount) {
    statBoostCount.textContent = boostCount.toLocaleString();
  }
  if (statProvider) {
    statProvider.textContent = provider;
  }
  if (statLastUpdated) {
    const d = lastUpdated instanceof Date ? lastUpdated : new Date(lastUpdated);
    statLastUpdated.textContent = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }
}

// Memory Cache & Request Queue for OpenSea API
const liveFloorCache = new Map();
let isBatchVerifying = false;
const pendingPurchaseTokenIds = new Set();

const OpenSeaRateLimiter = {
  queue: [],
  processing: false,
  rateLimitUntil: 0,
  minDelayMs: 350,
  lastRequestTime: 0,

  isRateLimited() {
    return Date.now() < this.rateLimitUntil;
  },

  async schedule(fn, priority = false) {
    if (this.isRateLimited()) {
      return { rateLimited: true };
    }
    return new Promise((resolve, reject) => {
      const task = { fn, resolve, reject };
      if (priority) {
        this.queue.unshift(task);
      } else {
        this.queue.push(task);
      }
      this.processQueue();
    });
  },

  async processQueue() {
    if (this.processing) return;
    this.processing = true;

    while (this.queue.length > 0) {
      const now = Date.now();
      if (now < this.rateLimitUntil) {
        const remaining = this.queue.splice(0);
        remaining.forEach(t => t.resolve({ rateLimited: true }));
        break;
      }

      const elapsed = Date.now() - this.lastRequestTime;
      if (elapsed < this.minDelayMs) {
        await new Promise(r => setTimeout(r, this.minDelayMs - elapsed));
      }

      const task = this.queue.shift();
      if (!task) break;

      this.lastRequestTime = Date.now();
      try {
        const result = await task.fn();
        task.resolve(result);
      } catch (err) {
        task.reject(err);
      }
    }

    this.processing = false;
  },

  handleRateLimit() {
    this.rateLimitUntil = Date.now() + 30000;
    console.warn('⚠️ OpenSea 429 Too Many Requests detected. Pausing client live checks for 30s.');
    const syncStatusText = document.getElementById('syncStatusText');
    if (syncStatusText) {
      syncStatusText.textContent = '⚠️ OpenSea rate limit hit — cooling down (30s)';
    }
  }
};

/**
 * Fetch authoritative best active listing for a single token directly from OpenSea
 */
async function fetchTokenBestListing(itemOrKey, priority = false) {
  const apiKey = customApiKey || localStorage.getItem('opensea_api_key') || 'add815580a904473ba7f162c0ccc4926';
  if (!apiKey) return null;

  let item = null;
  if (typeof itemOrKey === 'object' && itemOrKey !== null) {
    item = itemOrKey;
  } else {
    item = allItems.find(i => getItemKey(i) === itemOrKey || String(i.id) === String(itemOrKey));
  }
  if (!item) return null;

  if (OpenSeaRateLimiter.isRateLimited()) {
    return { rateLimited: true };
  }

  const colSlug = item.collectionSlug || (item.collection === 'wearables' ? 'bumpkin-wearables' : 'sunflower-land-collectibles');

  return OpenSeaRateLimiter.schedule(async () => {
    try {
      const res = await fetch(`https://api.opensea.io/api/v2/listings/collection/${colSlug}/nfts/${item.id}/best`, {
        headers: {
          'x-api-key': apiKey,
          'accept': 'application/json'
        },
        cache: 'no-store',
        signal: AbortSignal.timeout(6000)
      });

      if (res.status === 429) {
        OpenSeaRateLimiter.handleRateLimit();
        return { rateLimited: true };
      }

      if (res.status === 404) {
        return { unlisted: true, price: 0 };
      }

      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        if (res.status === 400 && errText.includes('No listings found')) {
          return { unlisted: true, price: 0 };
        }
        return null;
      }

      const data = await res.json();
      if (data.status && data.status !== 'ACTIVE') {
        return { unlisted: true, price: 0 };
      }

      const cur = data.price?.current?.currency || 'WETH';
      const dec = data.price?.current?.decimals != null ? data.price.current.decimals : 18;
      const totalVal = data.price?.current?.value ? (Number(data.price.current.value) / Math.pow(10, dec)) : 0;
      const offer = data.protocol_data?.parameters?.offer?.[0];
      const startAmount = Number(offer?.startAmount || '1');

      let unitPrice = totalVal;
      if (item.collection === 'collectibles' && isResourceToken(item.id)) {
        if (startAmount < 1e18) return null;
        unitPrice = totalVal / (startAmount / 1e18);
      } else {
        unitPrice = startAmount > 1 ? totalVal / startAmount : totalVal;
      }

      if (unitPrice > 0 && unitPrice >= 0.00001) {
        return { unlisted: false, price: unitPrice, currency: cur };
      } else {
        return { unlisted: true, price: 0 };
      }
    } catch (err) {
      return null;
    }
  }, priority);
}

/**
 * Verify and update a single item floor in real time
 */
async function verifySingleItemFloor(itemOrKey, priority = true) {
  let item = typeof itemOrKey === 'object' ? itemOrKey : allItems.find(i => getItemKey(i) === itemOrKey || String(i.id) === String(itemOrKey));
  if (!item) return false;

  const result = await fetchTokenBestListing(item, priority);
  if (!result || result.rateLimited) return false;

  const itemKey = getItemKey(item);
  let changed = false;
  liveFloorCache.set(itemKey, {
    price: result.price || 0,
    unlisted: !!result.unlisted,
    currency: result.currency || 'WETH',
    timestamp: Date.now()
  });

  item._liveVerified = true;
  item._liveTimestamp = Date.now();

  if (result.unlisted) {
    if (!item.unlisted || item.rawPrice > 0) {
      item.unlisted = true;
      item.rawPrice = 0;
      item.floorPrice = 0;
      changed = true;
    }
  } else if (result.price > 0) {
    if (Math.abs((item.rawPrice || 0) - result.price) > 0.0000001 || item.unlisted) {
      item.rawPrice = result.price;
      item.floorPrice = result.price;
      item.currency = result.currency || 'WETH';
      item.unlisted = false;
      changed = true;
    }
  }

  if (changed) {
    computeClientStats(allItems, 'Live Verified (OpenSea)', new Date(), flowerUsdcRate);
    applyFiltersAndSort(false);
  }
  return true;
}

/**
 * Polite on-demand live floor verification for visible items
 */
async function refreshVisibleItemFloors(items, maxCount = 8, force = false) {
  if (!items || !items.length) return;
  if (isBatchVerifying || OpenSeaRateLimiter.isRateLimited()) return;

  const now = Date.now();
  const toCheck = items.filter(it => {
    if (force) return true;
    const itemKey = getItemKey(it);
    const cached = liveFloorCache.get(itemKey);
    return !cached || (now - cached.timestamp > 60000);
  }).slice(0, maxCount);

  if (!toCheck.length) return;
  isBatchVerifying = true;

  try {
    let hasChanges = false;
    for (const item of toCheck) {
      if (OpenSeaRateLimiter.isRateLimited()) break;
      const res = await fetchTokenBestListing(item, false);
      if (!res || res.rateLimited) continue;

      const itemKey = getItemKey(item);
      liveFloorCache.set(itemKey, {
        price: res.price || 0,
        unlisted: !!res.unlisted,
        currency: res.currency || 'WETH',
        timestamp: Date.now()
      });
      item._liveVerified = true;
      item._liveTimestamp = Date.now();

      if (res.unlisted) {
        if (!item.unlisted || item.rawPrice > 0) {
          item.unlisted = true;
          item.rawPrice = 0;
          item.floorPrice = 0;
          hasChanges = true;
        }
      } else if (res.price > 0) {
        if (Math.abs((item.rawPrice || 0) - res.price) > 0.0000001 || item.unlisted) {
          item.rawPrice = res.price;
          item.floorPrice = res.price;
          item.currency = res.currency || 'WETH';
          item.unlisted = false;
          hasChanges = true;
        }
      }
    }

    if (hasChanges) {
      computeClientStats(allItems, 'OpenSea Live Verified', new Date(), flowerUsdcRate);
      applyFiltersAndSort(false);
    }
  } finally {
    isBatchVerifying = false;
  }
}

/**
 * Live fetch for SFL / Flower token exchange rate directly from sfl.world
 */
async function fetchLiveFlowerExchangeRate() {
  const targetUrl = 'https://sfl.world/api/v1.1/exchange';
  const urls = [
    `https://cors-get-proxy.sirjosh.workers.dev/?url=${encodeURIComponent(targetUrl)}`,
    `https://api.allorigins.win/raw?url=${encodeURIComponent(targetUrl)}`
  ];

  for (const u of urls) {
    try {
      const res = await fetch(u, { signal: AbortSignal.timeout(8000), cache: 'no-store' });
      if (res.ok) {
        const d = await res.json();
        const rate = d?.sfl?.usd || d?.data?.sfl?.usd;
        if (rate && Number(rate) > 0) {
          return Number(rate);
        }
      }
    } catch {}
  }
  return null;
}

/**
 * Live fetch for In-Game Marketplace listings directly from sfl.world (collectibles + wearables)
 */
async function fetchLiveInGameMarketplace() {
  const targetUrl = 'https://sfl.world/api/v1/nfts';
  const urls = [
    `https://cors-get-proxy.sirjosh.workers.dev/?url=${encodeURIComponent(targetUrl)}`,
    `https://api.allorigins.win/raw?url=${encodeURIComponent(targetUrl)}`
  ];

  for (const u of urls) {
    try {
      const res = await fetch(u, { signal: AbortSignal.timeout(8000), cache: 'no-store' });
      if (res.ok) {
        const d = await res.json();
        const list = [];
        if (d?.collectibles && Array.isArray(d.collectibles)) {
          d.collectibles.forEach(c => list.push({ ...c, collection: 'collectibles' }));
        }
        if (d?.wearables && Array.isArray(d.wearables)) {
          d.wearables.forEach(w => list.push({ ...w, collection: 'wearables' }));
        }
        if (list.length > 0) {
          return list;
        }
      }
    } catch {}
  }
  return null;
}

/**
 * Live fetch for recent listing and sale events from OpenSea for both collections
 */
async function fetchLiveOpenSeaUpdates() {
  const apiKey = customApiKey || localStorage.getItem('opensea_api_key') || 'add815580a904473ba7f162c0ccc4926';
  if (!apiKey || OpenSeaRateLimiter.isRateLimited()) return;

  const collections = ['collectibles', 'wearables'];
  for (const col of collections) {
    const slug = COLLECTIONS[col].slug;
    try {
      const [listRes, saleRes] = await Promise.allSettled([
        fetch(`https://api.opensea.io/api/v2/events/collection/${slug}?event_type=listing&limit=50&_t=${Date.now()}`, {
          headers: { 'x-api-key': apiKey, 'accept': 'application/json' },
          cache: 'no-store',
          signal: AbortSignal.timeout(7000)
        }),
        fetch(`https://api.opensea.io/api/v2/events/collection/${slug}?event_type=sale&limit=50&_t=${Date.now()}`, {
          headers: { 'x-api-key': apiKey, 'accept': 'application/json' },
          cache: 'no-store',
          signal: AbortSignal.timeout(7000)
        })
      ]);

      if (listRes.status === 'fulfilled' && listRes.value.status === 429) {
        OpenSeaRateLimiter.handleRateLimit();
        return;
      }
      if (saleRes.status === 'fulfilled' && saleRes.value.status === 429) {
        OpenSeaRateLimiter.handleRateLimit();
        return;
      }

      const listData = listRes.status === 'fulfilled' && listRes.value.ok ? await listRes.value.json() : null;
      const saleData = saleRes.status === 'fulfilled' && saleRes.value.ok ? await saleRes.value.json() : null;

      let catalogChanged = false;

      if (listData?.asset_events) {
        for (const ev of listData.asset_events) {
          const id = Number(ev.asset?.identifier);
          if (!id) continue;
          const targetKey = `${col}_${id}`;
          const item = allItems.find(i => getItemKey(i) === targetKey);
          if (!item) continue;

          const dec = ev.payment?.decimals || 18;
          const price = ev.payment?.quantity ? (Number(ev.payment.quantity) / Math.pow(10, dec)) : 0;
          const ts = (ev.event_timestamp || 0) * 1000;

          if (price > 0 && (!item.lastListedTimestamp || ts > item.lastListedTimestamp)) {
            item.recentlyListed = true;
            item.lastListedTimestamp = ts;
            item.lastListedPrice = price;
            catalogChanged = true;
          }
        }
      }

      if (saleData?.asset_events) {
        for (const ev of saleData.asset_events) {
          const id = Number(ev.asset?.identifier || ev.nft?.identifier);
          if (!id) continue;
          const targetKey = `${col}_${id}`;
          const item = allItems.find(i => getItemKey(i) === targetKey);
          if (!item) continue;

          const dec = ev.payment?.decimals || 18;
          const price = ev.payment?.quantity ? (Number(ev.payment.quantity) / Math.pow(10, dec)) : 0;
          const ts = (ev.event_timestamp || 0) * 1000;

          if (price > 0 && (!item.lastSaleTimestamp || ts > item.lastSaleTimestamp)) {
            item.recentlySold = true;
            item.lastSaleTimestamp = ts;
            item.lastSalePrice = price;
            item.lastSaleCurrency = ev.payment?.symbol || 'WETH';
            catalogChanged = true;
          }
        }
      }

      if (catalogChanged) {
        applyFiltersAndSort(false);
      }
    } catch {}
  }
}

/**
 * Automatically sync all 3 data feeds:
 * 1. data/prices.json (Full catalog with floor prices & metadata)
 * 2. data/exchange.json (Live SFL/Flower token exchange rate)
 * 3. data/ingame_nfts.json (SFL In-game marketplace items)
 */
async function syncAllDataOnWebOpen(forceRefresh = false) {
  const syncStatusText = document.getElementById('syncStatusText');
  const syncDot = document.getElementById('syncDot');
  if (syncStatusText) {
    syncStatusText.textContent = 'Syncing live data feeds (Prices, Exchange, In-Game)...';
  }
  if (syncDot) {
    syncDot.className = 'w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse';
  }

  try {
    const timestamp = Date.now();
    const noStore = { cache: 'no-store' };

    // Resolve base path dynamically
    let feedBase = './';
    try {
      const loc = window.location.href.split('?')[0].split('#')[0];
      const lastSlash = loc.lastIndexOf('/');
      feedBase = loc.substring(0, lastSlash + 1);
    } catch {}

    const [pricesRes, exchangeRes, inGameRes, directRate, liveInGameMarket, ethRes] = await Promise.allSettled([
      fetch(`${feedBase}data/prices.json?v=${timestamp}`, noStore).then(r => r.ok ? r.json() : null),
      fetch(`${feedBase}data/exchange.json?v=${timestamp}`, noStore).then(r => r.ok ? r.json() : null),
      fetch(`${feedBase}data/ingame_nfts.json?v=${timestamp}`, noStore).then(r => r.ok ? r.json() : null),
      fetchLiveFlowerExchangeRate(),
      fetchLiveInGameMarketplace(),
      fetch('https://api.binance.com/api/v3/ticker/price?symbol=ETHUSDT', noStore).then(r => r.ok ? r.json() : null).catch(() => null)
    ]);

    const pricesData = pricesRes.status === 'fulfilled' ? pricesRes.value : null;
    const exchangeData = exchangeRes.status === 'fulfilled' ? exchangeRes.value : null;
    const inGameData = inGameRes.status === 'fulfilled' ? inGameRes.value : null;
    const directRateValue = directRate.status === 'fulfilled' ? directRate.value : null;
    const liveMarketList = liveInGameMarket.status === 'fulfilled' ? liveInGameMarket.value : null;
    const ethData = ethRes.status === 'fulfilled' ? ethRes.value : null;

    if (ethData?.price) {
      const p = parseFloat(ethData.price);
      if (p > 500 && p < 20000) {
        ethUsdPrice = p;
      }
    }

    // 2. Parse live Flower / SFL token exchange rate directly from sfl.world API
    if (directRateValue && Number(directRateValue) > 0) {
      flowerUsdcRate = Number(directRateValue);
      console.log('🌸 Live SFL rate fetched fresh from sfl.world:', flowerUsdcRate);
    } else if (!flowerUsdcRate || flowerUsdcRate <= 0) {
      if (exchangeData?.sfl?.usd && Number(exchangeData.sfl.usd) > 0) {
        flowerUsdcRate = Number(exchangeData.sfl.usd);
      } else if (exchangeData?.data?.sfl?.usd && Number(exchangeData.data.sfl.usd) > 0) {
        flowerUsdcRate = Number(exchangeData.data.sfl.usd);
      } else if (pricesData?.flowerUsdcRate) {
        flowerUsdcRate = Number(pricesData.flowerUsdcRate);
      }
    }

    if (statFlowerRate && flowerUsdcRate > 0) {
      statFlowerRate.textContent = '$' + flowerUsdcRate.toFixed(4);
    }

    // 3. Parse In-Game marketplace items by composite key (collectibles_ID vs wearables_ID)
    const inGameMap = new Map();
    const isLiveInGame = Boolean(liveMarketList && liveMarketList.length > 0);
    
    if (isLiveInGame) {
      for (const item of liveMarketList) {
        if (item.id != null) {
          const col = item.collection || 'collectibles';
          const key = `${col}_${item.id}`;
          inGameMap.set(key, {
            id: Number(item.id),
            collection: col,
            floor: item.floor != null ? Number(item.floor) : null,
            lastSalePrice: item.lastSalePrice != null ? Number(item.lastSalePrice) : null,
            supply: item.supply != null ? Number(item.supply) : null,
            name: item.name || '',
            haveBoost: item.have_boost === 1,
            boostText: item.boost_text || ''
          });
        }
      }
    } else if (inGameData) {
      if (Array.isArray(inGameData.collectibles)) {
        inGameData.collectibles.forEach(item => {
          if (item.id != null) {
            inGameMap.set(`collectibles_${item.id}`, {
              id: Number(item.id),
              collection: 'collectibles',
              floor: item.floor != null ? Number(item.floor) : null,
              lastSalePrice: item.lastSalePrice != null ? Number(item.lastSalePrice) : null,
              supply: item.supply != null ? Number(item.supply) : null,
              name: item.name || '',
              haveBoost: item.have_boost === 1,
              boostText: item.boost_text || ''
            });
          }
        });
      }
      if (Array.isArray(inGameData.wearables)) {
        inGameData.wearables.forEach(item => {
          if (item.id != null) {
            inGameMap.set(`wearables_${item.id}`, {
              id: Number(item.id),
              collection: 'wearables',
              floor: item.floor != null ? Number(item.floor) : null,
              lastSalePrice: item.lastSalePrice != null ? Number(item.lastSalePrice) : null,
              supply: item.supply != null ? Number(item.supply) : null,
              name: item.name || '',
              haveBoost: item.have_boost === 1,
              boostText: item.boost_text || ''
            });
          }
        });
      }
    }

    // 4. Update Catalog with prices.json or memory fallback without clobbering live-verified prices
    if (pricesData && Array.isArray(pricesData.items) && pricesData.items.length > 0) {
      if (!allItems.length) {
        allItems = pricesData.items;
      } else {
        const liveMap = new Map();
        allItems.forEach(i => {
          if (i._liveVerified) liveMap.set(getItemKey(i), i);
        });

        allItems = pricesData.items.map(pItem => {
          const itemKey = getItemKey(pItem);
          const live = liveMap.get(itemKey);
          const liveStillFresh = !forceRefresh && live && live._liveTimestamp && (Date.now() - live._liveTimestamp < 120000);
          if (liveStillFresh) {
            return {
              ...pItem,
              rawPrice: live.rawPrice,
              floorPrice: live.floorPrice,
              currency: live.currency,
              unlisted: live.unlisted,
              recentlySold: live.recentlySold || pItem.recentlySold,
              lastSalePrice: live.lastSalePrice || pItem.lastSalePrice,
              lastSaleTimestamp: Math.max(live.lastSaleTimestamp || 0, pItem.lastSaleTimestamp || 0),
              _liveVerified: true,
              _liveTimestamp: live._liveTimestamp
            };
          }
          return pItem;
        });
      }
    } else if (!allItems.length && window.INITIAL_COLLECTIBLES_DATA?.items) {
      allItems = window.INITIAL_COLLECTIBLES_DATA.items;
    }

    if (!allItems.length) {
      throw new Error('Could not load collectible prices from data feeds.');
    }

    // 5. Merge In-Game data & live exchange rates into allItems using composite keys
    for (const item of allItems) {
      const itemKey = getItemKey(item);
      const inGameInfo = inGameMap.get(itemKey);
      if (inGameInfo) {
        if (inGameInfo.floor !== null) {
          if (isLiveInGame || item.inGameFloor == null) {
            item.inGameFloor = inGameInfo.floor;
          }
          if (item.inGameFloor != null && flowerUsdcRate) {
            item.inGameFloorUsdc = Number((item.inGameFloor * flowerUsdcRate).toFixed(4));
          }
        }
        if (!item.boostText && inGameInfo.boostText) {
          item.boostText = inGameInfo.boostText;
          item.haveBoost = inGameInfo.haveBoost;
        }
        if ((!item.name || item.name.startsWith('Sunflower Land #') || item.name.startsWith('Wearable #')) && inGameInfo.name) {
          item.name = inGameInfo.name;
        }
        if (inGameInfo.supply && item.supply <= 1) {
          item.supply = inGameInfo.supply;
        }
      } else {
        if (isLiveInGame && inGameMap.size > 20) {
          item.inGameFloor = null;
          item.inGameFloorUsdc = null;
        } else if (item.inGameFloor && flowerUsdcRate) {
          item.inGameFloorUsdc = Number((item.inGameFloor * flowerUsdcRate).toFixed(4));
        }
      }
    }

    totalCountEl.textContent = allItems.length;
    computeClientStats(allItems, 'Live Synced (OpenSea & In-Game)', new Date(), flowerUsdcRate);
    applyFiltersAndSort(false);

    // 6. Polite background verification for top visible items
    if (filteredItems.length > 0) {
      setTimeout(() => {
        refreshVisibleItemFloors(filteredItems, 8);
      }, 500);
    }

    // 7. Update UI sync status
    if (syncStatusText) {
      syncStatusText.textContent = `Auto-Synced (${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})`;
    }
    if (syncDot) {
      syncDot.className = 'w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse';
    }

    // 8. Fetch live OpenSea events in background
    fetchLiveOpenSeaUpdates();

  } catch (err) {
    console.error('Error in syncAllDataOnWebOpen:', err);
    if (syncStatusText) {
      syncStatusText.textContent = 'Sync notice: using cached feeds';
    }
    if (syncDot) {
      syncDot.className = 'w-1.5 h-1.5 rounded-full bg-yellow-400';
    }
    if (!allItems.length) {
      errorState.classList.remove('hidden');
      document.getElementById('errorMessage').textContent = err.message;
    }
  } finally {
    showLoading(false);
  }
}

/**
 * Filter & Sort items locally
 */
function applyFiltersAndSort(checkLive = true) {
  let result = [...allItems];

  // 1. Text Search Filter (matches name, token ID, boost, or collection name)
  if (currentSearch) {
    const cleanQ = currentSearch.replace(/^#/, '').toLowerCase().trim();
    result = result.filter(item => {
      const name = (item.name || '').toLowerCase();
      const idStr = String(item.id || '');
      const boost = (item.boostText || '').toLowerCase();
      const col = (item.collection || 'collectibles').toLowerCase();
      return name.includes(cleanQ) || idStr.includes(cleanQ) || boost.includes(cleanQ) || col.includes(cleanQ);
    });
  }

  // 2. Category Filter
  if (currentFilter === 'collectibles') {
    result = result.filter(item => item.collection === 'collectibles' || !item.collection);
  } else if (currentFilter === 'wearables') {
    result = result.filter(item => item.collection === 'wearables');
  } else if (currentFilter === 'diff') {
    result = result.filter(item => {
      const isListed = !item.unlisted && ((item.rawPrice && item.rawPrice > 0) || (item.floorPrice && item.floorPrice > 0));
      const hasInGame = item.inGameFloor && item.inGameFloor > 0;
      return isListed && hasInGame;
    });
  } else if (currentFilter === 'boost') {
    result = result.filter(item => item.haveBoost);
  } else if (currentFilter === 'without-boost' || currentFilter === 'no-boost' || currentFilter === 'cosmetic') {
    result = result.filter(item => !item.haveBoost);
  } else if (currentFilter === 'recently-listed') {
    result = result.filter(item => item.recentlyListed);
  }

  // Helper to get precise Price Diff (Net Game - OpenSea Equiv)
  const calcItemDiff = (item) => {
    const isListed = !item.unlisted && ((item.rawPrice && item.rawPrice > 0) || (item.floorPrice && item.floorPrice > 0));
    const hasInGame = item.inGameFloor != null && item.inGameFloor > 0;
    if (!isListed || !hasInGame || !flowerUsdcRate || flowerUsdcRate <= 0) return null;
    const openSeaSfl = (((item.rawPrice || item.floorPrice) * ethUsdPrice) / flowerUsdcRate);
    const inGameNetSfl = item.inGameFloor * 0.9;
    return inGameNetSfl - openSeaSfl;
  };

  // 3. Sorting
  if (currentSort === 'diff_desc') {
    result.sort((a, b) => {
      const aDiff = calcItemDiff(a);
      const bDiff = calcItemDiff(b);
      const aHas = aDiff !== null;
      const bHas = bDiff !== null;
      if (aHas && !bHas) return -1;
      if (!aHas && bHas) return 1;
      if (!aHas && !bHas) return (a.id - b.id);
      return bDiff - aDiff;
    });
  } else if (currentSort === 'diff_asc') {
    result.sort((a, b) => {
      const aDiff = calcItemDiff(a);
      const bDiff = calcItemDiff(b);
      const aHas = aDiff !== null;
      const bHas = bDiff !== null;
      if (aHas && !bHas) return -1;
      if (!aHas && bHas) return 1;
      if (!aHas && !bHas) return (a.id - b.id);
      return aDiff - bDiff;
    });
  } else if (currentSort === 'recently_listed') {
    result.sort((a, b) => {
      const aTime = a.lastListedTimestamp || (a.orderCreatedAt ? a.orderCreatedAt * 1000 : 0);
      const bTime = b.lastListedTimestamp || (b.orderCreatedAt ? b.orderCreatedAt * 1000 : 0);
      const aHas = aTime > 0;
      const bHas = bTime > 0;
      if (aHas && !bHas) return -1;
      if (!aHas && bHas) return 1;
      return bTime - aTime;
    });
  } else if (currentSort === 'recently_sold') {
    result.sort((a, b) => {
      const aTime = a.lastSaleTimestamp || 0;
      const bTime = b.lastSaleTimestamp || 0;
      const aHas = aTime > 0;
      const bHas = bTime > 0;
      if (aHas && !bHas) return -1;
      if (!aHas && bHas) return 1;
      if (bTime !== aTime) return bTime - aTime;
      return (b.lastSalePrice || 0) - (a.lastSalePrice || 0);
    });
  } else if (currentSort === 'ingame_asc') {
    result.sort((a, b) => {
      const aHas = a.inGameFloor != null && a.inGameFloor > 0;
      const bHas = b.inGameFloor != null && b.inGameFloor > 0;
      if (aHas && !bHas) return -1;
      if (!aHas && bHas) return 1;
      if (!aHas && !bHas) return (a.id - b.id);
      return a.inGameFloor - b.inGameFloor;
    });
  } else if (currentSort === 'ingame_desc') {
    result.sort((a, b) => {
      const aHas = a.inGameFloor != null && a.inGameFloor > 0;
      const bHas = b.inGameFloor != null && b.inGameFloor > 0;
      if (aHas && !bHas) return -1;
      if (!aHas && bHas) return 1;
      if (!aHas && !bHas) return (a.id - b.id);
      return b.inGameFloor - a.inGameFloor;
    });
  } else if (currentSort === 'last_sale_desc') {
    result.sort((a, b) => {
      const aHas = a.lastSalePrice != null && a.lastSalePrice > 0;
      const bHas = b.lastSalePrice != null && b.lastSalePrice > 0;
      if (aHas && !bHas) return -1;
      if (!aHas && bHas) return 1;
      if (!aHas && !bHas) return (a.id - b.id);
      return b.lastSalePrice - a.lastSalePrice;
    });
  } else if (currentSort === 'price_asc') {
    result.sort((a, b) => {
      const aListed = !a.unlisted && ((a.rawPrice && a.rawPrice > 0) || (a.floorPrice && a.floorPrice > 0));
      const bListed = !b.unlisted && ((b.rawPrice && b.rawPrice > 0) || (b.floorPrice && b.floorPrice > 0));
      if (aListed && !bListed) return -1;
      if (!aListed && bListed) return 1;
      if (!aListed && !bListed) return (a.id - b.id);
      return (a.rawPrice || a.floorPrice) - (b.rawPrice || b.floorPrice);
    });
  } else if (currentSort === 'price_desc') {
    result.sort((a, b) => {
      const aListed = !a.unlisted && ((a.rawPrice && a.rawPrice > 0) || (a.floorPrice && a.floorPrice > 0));
      const bListed = !b.unlisted && ((b.rawPrice && b.rawPrice > 0) || (b.floorPrice && b.floorPrice > 0));
      if (aListed && !bListed) return -1;
      if (!aListed && bListed) return 1;
      if (!aListed && !bListed) return (a.id - b.id);
      return (b.rawPrice || b.floorPrice) - (a.rawPrice || a.floorPrice);
    });
  } else if (currentSort === 'supply_desc') {
    result.sort((a, b) => (b.supply || 0) - (a.supply || 0));
  } else if (currentSort === 'supply_asc') {
    result.sort((a, b) => (a.supply || 0) - (b.supply || 0));
  } else if (currentSort === 'name_asc') {
    result.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  }

  filteredItems = result;
  filteredCountEl.textContent = filteredItems.length;

  renderItems(checkLive);
}

/**
 * Render items in current view mode
 */
function renderItems(checkLive = true) {
  if (filteredItems.length === 0) {
    itemsGrid.classList.add('hidden');
    itemsTableContainer.classList.add('hidden');
    emptyState.classList.remove('hidden');
    return;
  }

  emptyState.classList.add('hidden');

  if (currentView === 'grid') {
    itemsTableContainer.classList.add('hidden');
    itemsGrid.classList.remove('hidden');
    renderGridView();
  } else {
    itemsGrid.classList.add('hidden');
    itemsTableContainer.classList.remove('hidden');
    renderTableView();
  }

  if (window.lucide) {
    lucide.createIcons();
  }

  if (checkLive && filteredItems.length > 0) {
    refreshVisibleItemFloors(filteredItems, filteredItems.length <= 8 ? filteredItems.length : 8);
  }
}

/**
 * Render Grid View
 */
function renderGridView() {
  itemsGrid.innerHTML = filteredItems.map(item => {
    const isListed = !item.unlisted && (item.rawPrice > 0 || item.floorPrice > 0);
    const priceDisplay = isListed ? formatCryptoPrice(item.rawPrice || item.floorPrice) : 'Unlisted';
    const currency = item.currency || 'WETH';
    const usdDisplay = isListed ? formatUsdEstimate(item.rawPrice || item.floorPrice) : '';

    const hasInGame = item.inGameFloor && item.inGameFloor > 0;
    const inGamePriceDisplay = hasInGame ? formatFlowerPrice(item.inGameFloor) : 'Unlisted';
    const inGameUsdcDisplay = hasInGame ? formatFlowerUsdc(item.inGameFloor) : '';

    const itemKey = getItemKey(item);
    const isWearable = item.collection === 'wearables';
    const collectionBadge = isWearable
      ? `<span class="inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-purple-500/15 text-purple-300 border border-purple-500/30">👕 Wearable</span>`
      : `<span class="inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30">🌻 Collectible</span>`;

    const boostBadge = item.haveBoost
      ? `<span class="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" title="${item.boostText}">
          <span>⚡ Boost</span>
        </span>`
      : `<span class="px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-800 text-slate-400 border border-slate-700/50">
          🎨 Cosmetic
        </span>`;

    const listedAgo = item.lastListedTimestamp ? formatTimeAgo(item.lastListedTimestamp) : '';
    const recentListedBadge = item.recentlyListed
      ? `<span class="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-sky-500/15 text-sky-300 border border-sky-500/30" title="Listed ${listedAgo || 'recently'} on OpenSea">
          <span>⚡ Listed ${listedAgo ? `(${listedAgo})` : ''}</span>
        </span>`
      : '';

    const boostDetail = item.haveBoost && item.boostText
      ? `<p class="text-[11px] text-emerald-300/90 line-clamp-1 bg-emerald-950/40 px-2 py-1 rounded-lg border border-emerald-900/30" title="${item.boostText}">
          ${item.boostText}
        </p>`
      : '';

    const lastSaleDisplay = item.lastSalePrice > 0
      ? `<div class="flex items-center justify-between bg-amber-950/20 px-2.5 py-1.5 rounded-xl border border-amber-900/30 text-[11px]">
          <span class="text-amber-400 font-medium">Last Sold (OS)</span>
          <div class="text-right">
            <span class="font-bold text-amber-300 font-mono">${formatCryptoPrice(item.lastSalePrice)}</span>
            <span class="text-[10px] text-amber-400/80 font-bold ml-0.5">${item.lastSaleCurrency || 'WETH'}</span>
          </div>
        </div>`
      : '';

    // In-Game Equiv (OpenSea price converted to SFL)
    const openSeaSfl = (isListed && flowerUsdcRate > 0) ? (((item.rawPrice || item.floorPrice) * ethUsdPrice) / flowerUsdcRate) : 0;
    // In-Game price after 10% fee
    const inGameNetSfl = hasInGame ? (item.inGameFloor * 0.9) : 0;
    // Difference = In-Game (After -10% Fee) - OpenSea In-Game Equiv
    const hasDiff = isListed && hasInGame && openSeaSfl > 0 && inGameNetSfl > 0;
    const diffSfl = hasDiff ? (inGameNetSfl - openSeaSfl) : null;
    const diffUsdc = (diffSfl !== null && flowerUsdcRate > 0) ? (diffSfl * flowerUsdcRate) : null;

    let diffBadge = '';
    if (hasDiff) {
      const isPositive = diffSfl >= 0;
      const sign = isPositive ? '+' : '-';
      const absSfl = Math.abs(diffSfl);
      const absUsdc = Math.abs(diffUsdc);
      const sflFormatted = `${sign}${formatFlowerPrice(absSfl)} SFL`;
      const usdcFormatted = `(${sign}$${absUsdc < 0.01 ? '<0.01' : absUsdc.toFixed(2)} USDC)`;

      diffBadge = `
        <div class="flex items-center justify-between px-2.5 py-1.5 rounded-xl ${isPositive ? 'bg-emerald-950/30 border border-emerald-500/25' : 'bg-rose-950/30 border border-rose-500/25'} text-xs">
          <div class="flex items-center space-x-1.5">
            <span class="w-1.5 h-1.5 rounded-full ${isPositive ? 'bg-emerald-400 animate-pulse' : 'bg-rose-400'}"></span>
            <span class="text-[10px] font-bold tracking-wider uppercase text-slate-300">Price Diff</span>
          </div>
          <div class="font-mono font-bold text-xs flex items-baseline space-x-1">
            <span class="${isPositive ? 'text-emerald-400' : 'text-rose-400'}">${sflFormatted}</span>
            <span class="text-[10px] text-slate-400 font-normal">${usdcFormatted}</span>
          </div>
        </div>
      `;
    } else {
      diffBadge = `
        <div class="flex items-center justify-between px-2.5 py-1 rounded-xl bg-slate-950/40 border border-slate-800/50 text-[10px] text-slate-500">
          <div class="flex items-center space-x-1.5">
            <span class="w-1.5 h-1.5 rounded-full bg-slate-600"></span>
            <span class="uppercase tracking-wider font-semibold text-slate-400">Price Diff</span>
          </div>
          <span class="font-mono text-[10px]">${!isListed && !hasInGame ? 'Both Unlisted' : (!isListed ? 'OpenSea Unlisted' : 'In-Game Unlisted')}</span>
        </div>
      `;
    }

    return `
      <div class="collectible-card bg-slate-900/90 border border-slate-800/90 rounded-2xl p-4 flex flex-col justify-between space-y-3 relative group" data-item-key="${itemKey}">
        <div>
          <!-- Header: ID + Collection + Badges -->
          <div class="flex items-center justify-between mb-2">
            <div class="flex items-center space-x-1.5">
              <span class="font-mono text-[11px] text-slate-400 font-semibold bg-slate-950 px-2 py-0.5 rounded-md border border-slate-800">
                #${item.id}
              </span>
              ${collectionBadge}
            </div>
            <div class="flex items-center space-x-1.5">
              ${recentListedBadge}
              ${boostBadge}
            </div>
          </div>

          <!-- Name -->
          <h4 class="font-bold text-sm text-white group-hover:text-amber-400 transition line-clamp-1" title="${item.name}">
            ${item.name}
          </h4>

          <!-- Boost Details if present -->
          ${boostDetail ? `<div class="mt-2">${boostDetail}</div>` : ''}
        </div>

        <!-- Pricing Area: Side-by-side OpenSea vs In-Game -->
        <div class="space-y-2 pt-2 border-t border-slate-800/80">
          <!-- Price Difference on top of OpenSea and In-Game cards -->
          ${diffBadge}

          <div class="grid grid-cols-2 gap-2">
            <!-- OpenSea Floor -->
            <div class="bg-slate-950/70 p-2.5 rounded-xl border border-slate-800/80 flex flex-col justify-between hover:border-blue-500/40 transition">
              <div>
                <div class="flex items-center justify-between mb-1.5">
                  <div class="flex items-center space-x-1">
                    <span class="w-1.5 h-1.5 rounded-full bg-blue-400"></span>
                    <span class="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">OpenSea</span>
                  </div>
                  <div class="flex items-center space-x-1">
                    <button class="verify-token-btn text-slate-500 hover:text-amber-400 transition p-0.5 rounded cursor-pointer" data-item-key="${itemKey}" title="Check live OpenSea floor">
                      <i data-lucide="refresh-cw" class="w-2.5 h-2.5"></i>
                    </button>
                    <span class="text-[9px] font-medium px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">WETH</span>
                  </div>
                </div>
                ${isListed ? `
                  <div class="space-y-1.5">
                    <div>
                      <div class="text-xs font-black text-amber-400 tracking-tight">
                        ${priceDisplay} <span class="text-[9px] font-bold text-blue-400">${currency}</span>
                      </div>
                      <div class="text-[10px] text-slate-400 font-mono font-medium">
                        ${usdDisplay}
                      </div>
                    </div>

                    <div class="pt-1.5 border-t border-slate-800/80">
                      <div class="text-[9px] uppercase tracking-wider text-slate-500 font-medium">In-Game Equiv</div>
                      <div class="text-[11px] font-bold text-amber-300 font-mono flex items-center space-x-1 mt-0.5">
                        <span>🌸</span>
                        <span>${formatOpenSeaFlowerEquivalent(item.rawPrice || item.floorPrice)}</span>
                      </div>
                    </div>
                  </div>
                ` : `
                  <div class="py-2.5">
                    <div class="text-xs font-bold text-slate-500 tracking-tight">Unlisted</div>
                    <span class="text-[10px] text-slate-600 block mt-0.5">-</span>
                  </div>
                `}
              </div>
            </div>

            <!-- In-Game Floor (FLOWER + USDC) with -10% calculation -->
            <div class="bg-slate-950/70 p-2.5 rounded-xl border ${hasInGame ? 'border-pink-500/30 bg-pink-950/10 hover:border-pink-500/50' : 'border-slate-800/80'} flex flex-col justify-between transition">
              <div>
                <div class="flex items-center justify-between mb-1.5">
                  <div class="flex items-center space-x-1">
                    <span class="text-[10px]">🌸</span>
                    <span class="text-[10px] ${hasInGame ? 'text-pink-300 font-semibold' : 'text-slate-400 font-semibold'} uppercase tracking-wider">In-Game</span>
                  </div>
                  <span class="text-[9px] font-medium px-1.5 py-0.5 rounded ${hasInGame ? 'bg-pink-500/10 text-pink-300 border border-pink-500/20' : 'bg-slate-800 text-slate-500'}">SFL</span>
                </div>
                ${hasInGame ? `
                  <div class="space-y-1.5">
                    <div>
                      <div class="text-xs font-black text-pink-400 tracking-tight">
                        ${inGamePriceDisplay} <span class="text-[9px] font-bold text-pink-300/80">SFL</span>
                      </div>
                      ${inGameUsdcDisplay ? `<div class="text-[10px] text-emerald-400 font-mono font-medium">${inGameUsdcDisplay}</div>` : ''}
                    </div>

                    <div class="pt-1.5 border-t border-pink-500/20">
                      <div class="text-[9px] uppercase tracking-wider text-slate-400 font-medium">After -10% Fee</div>
                      <div class="flex items-baseline justify-between mt-0.5">
                        <span class="text-[11px] font-bold text-pink-300 font-mono">${formatFlowerPrice(item.inGameFloor * 0.9)} SFL</span>
                        <span class="text-[10px] text-slate-400 font-mono">${formatFlowerUsdc(item.inGameFloor * 0.9)}</span>
                      </div>
                    </div>
                  </div>
                ` : `
                  <div class="py-2.5">
                    <div class="text-xs font-bold text-slate-500 tracking-tight">Unlisted</div>
                    <span class="text-[10px] text-slate-600 block mt-0.5">-</span>
                  </div>
                `}
              </div>
            </div>
          </div>

          <!-- Last Sold if available -->
          ${lastSaleDisplay}

          <!-- Supply Metric -->
          <div class="flex items-center justify-between text-[11px] text-slate-400 px-1">
            <span>Market: <strong class="text-blue-400 font-medium">OpenSea + Game</strong></span>
            <span>Supply: <strong class="text-slate-200">${item.supply > 1 ? item.supply.toLocaleString() : 'NFT'}</strong></span>
          </div>

          <!-- OpenSea Action Button -->
          <a href="${getOpenSeaUrl(item)}" target="_blank" rel="noopener noreferrer" 
             data-item-key="${itemKey}"
             class="buy-opensea-btn w-full mt-1 inline-flex items-center justify-center space-x-1.5 py-2 rounded-xl text-xs font-semibold bg-blue-600/20 hover:bg-blue-600 text-blue-300 hover:text-white border border-blue-500/30 hover:border-blue-500 transition shadow-sm group-hover:shadow-blue-500/20">
            <i data-lucide="external-link" class="w-3.5 h-3.5"></i>
            <span>${isListed ? 'Buy on OpenSea' : 'View on OpenSea'}</span>
          </a>
        </div>
      </div>
    `;
  }).join('');
}

/**
 * Render Table View
 */
function renderTableView() {
  itemsTableBody.innerHTML = filteredItems.map(item => {
    const isListed = !item.unlisted && (item.rawPrice > 0 || item.floorPrice > 0);
    const priceDisplay = isListed ? formatCryptoPrice(item.rawPrice || item.floorPrice) : 'Unlisted';
    const currency = item.currency || 'WETH';
    const usdDisplay = isListed ? formatUsdEstimate(item.rawPrice || item.floorPrice) : '';

    const hasInGame = item.inGameFloor && item.inGameFloor > 0;
    const inGamePriceDisplay = hasInGame ? formatFlowerPrice(item.inGameFloor) : 'Unlisted';
    const inGameUsdcDisplay = hasInGame ? formatFlowerUsdc(item.inGameFloor) : '';

    const itemKey = getItemKey(item);
    const isWearable = item.collection === 'wearables';
    const collectionBadge = isWearable
      ? `<span class="inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-purple-500/15 text-purple-300 border border-purple-500/30">👕 Wearable</span>`
      : `<span class="inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30">🌻 Collectible</span>`;

    const boostBadge = item.haveBoost
      ? `<span class="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" title="${item.boostText}">
          <span>⚡ Boost</span>
        </span>`
      : `<span class="px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-800 text-slate-400">
          Cosmetic
        </span>`;

    const listedAgo = item.lastListedTimestamp ? formatTimeAgo(item.lastListedTimestamp) : '';
    const recentListedBadge = item.recentlyListed
      ? `<span class="ml-1.5 inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-sky-500/15 text-sky-300 border border-sky-500/30" title="Listed ${listedAgo || 'recently'} on OpenSea">⚡ Listed ${listedAgo ? `(${listedAgo})` : ''}</span>`
      : '';

    // In-Game Equiv (OpenSea price converted to SFL)
    const openSeaSfl = (isListed && flowerUsdcRate > 0) ? (((item.rawPrice || item.floorPrice) * ethUsdPrice) / flowerUsdcRate) : 0;
    // In-Game price after 10% fee
    const inGameNetSfl = hasInGame ? (item.inGameFloor * 0.9) : 0;
    // Difference = In-Game (After -10% Fee) - OpenSea In-Game Equiv
    const hasDiff = isListed && hasInGame && openSeaSfl > 0 && inGameNetSfl > 0;
    const diffSfl = hasDiff ? (inGameNetSfl - openSeaSfl) : null;
    const diffUsdc = (diffSfl !== null && flowerUsdcRate > 0) ? (diffSfl * flowerUsdcRate) : null;

    return `
      <tr class="hover:bg-slate-800/40 transition">
        <td class="py-3 px-4 font-mono text-slate-400 font-semibold">#${item.id}</td>
        <td class="py-3 px-4 font-bold text-white">
          <div class="flex items-center flex-wrap gap-1.5">
            <span>${item.name}</span>
            ${collectionBadge}
            ${recentListedBadge}
          </div>
        </td>
        <td class="py-3 px-4">
          <div class="flex items-center space-x-2">
            ${boostBadge}
            ${item.boostText ? `<span class="text-[11px] text-slate-400 truncate max-w-xs" title="${item.boostText}">${item.boostText}</span>` : ''}
          </div>
        </td>
        <!-- OpenSea Floor -->
        <td class="py-3 px-4 text-right">
          <div class="inline-flex items-center justify-end space-x-1.5">
            <button class="verify-token-btn text-slate-500 hover:text-amber-400 transition p-0.5 rounded cursor-pointer" data-item-key="${itemKey}" title="Check live OpenSea floor">
              <i data-lucide="refresh-cw" class="w-3 h-3"></i>
            </button>
            <div>
              <span class="font-extrabold ${isListed ? 'text-amber-400' : 'text-slate-500'}">${priceDisplay}</span>
              ${isListed ? `<span class="text-[10px] text-blue-400 font-bold ml-0.5">${currency}</span>` : ''}
            </div>
          </div>
          ${isListed ? `
            <div class="text-[10px] text-slate-400 font-mono">
              <span>${usdDisplay}</span>
              <span class="text-amber-300 font-medium ml-1">(${formatOpenSeaFlowerEquivalent(item.rawPrice || item.floorPrice)})</span>
            </div>
          ` : '<span class="text-[10px] text-slate-600 block">-</span>'}
        </td>
        <!-- In-Game Floor (FLOWER + USDC) with -10% calculation -->
        <td class="py-3 px-4 text-right">
          ${hasInGame ? `
            <div class="inline-flex items-start justify-end space-x-3 text-right">
              <div>
                <div class="font-extrabold text-pink-400">
                  ${inGamePriceDisplay} <span class="text-[10px] text-pink-300/80 font-bold ml-0.5">SFL</span>
                </div>
                <div class="text-[10px] text-emerald-400 font-mono font-medium">
                  ${inGameUsdcDisplay}
                </div>
              </div>
              <div class="pl-2.5 border-l border-slate-800/80 text-right">
                <div class="font-bold text-pink-300 text-xs">
                  <span class="text-[10px] text-slate-400 font-normal">-10%: </span>${formatFlowerPrice(item.inGameFloor * 0.9)} <span class="text-[9px] font-bold text-pink-300/80">SFL</span>
                </div>
                <div class="text-[10px] text-slate-400 font-mono">
                  ${formatFlowerUsdc(item.inGameFloor * 0.9)}
                </div>
              </div>
            </div>
          ` : `
            <div>
              <span class="font-extrabold text-slate-500">Unlisted</span>
              <span class="text-[10px] text-slate-600 block">-</span>
            </div>
          `}
        </td>
        <!-- Difference (SFL) -->
        <td class="py-3 px-4 text-right">
          ${hasDiff ? `
            <div class="font-mono font-bold ${diffSfl >= 0 ? 'text-emerald-400' : 'text-rose-400'}">
              ${diffSfl >= 0 ? '+' : ''}${formatFlowerPrice(diffSfl)} SFL
            </div>
            <span class="text-[10px] text-slate-400 font-mono block">
              (${diffSfl >= 0 ? '+' : '-'}$${Math.abs(diffUsdc) < 0.01 ? '<0.01' : Math.abs(diffUsdc).toFixed(2)} USDC)
            </span>
          ` : `<span class="text-slate-600 font-mono text-[11px]">-</span>`}
        </td>
        <!-- Last Sold -->
        <td class="py-3 px-4 text-right">
          ${item.lastSalePrice > 0 ? `
            <span class="font-bold text-amber-300 font-mono">${formatCryptoPrice(item.lastSalePrice)}</span>
            <span class="text-[10px] text-amber-400/80 font-bold ml-0.5">${item.lastSaleCurrency || 'WETH'}</span>
          ` : `<span class="text-slate-600">-</span>`}
        </td>
        <!-- Supply -->
        <td class="py-3 px-4 text-right text-slate-300 font-mono">
          ${item.supply > 1 ? item.supply.toLocaleString() : '1'}
        </td>
        <!-- Actions -->
        <td class="py-3 px-4 text-center">
          <a href="${getOpenSeaUrl(item)}" target="_blank" rel="noopener noreferrer" 
             data-item-key="${itemKey}"
             class="buy-opensea-btn inline-flex items-center space-x-1 px-2.5 py-1 rounded-lg text-[11px] font-medium bg-blue-600/10 text-blue-400 hover:bg-blue-600 hover:text-white border border-blue-500/20 transition">
            <i data-lucide="external-link" class="w-3 h-3"></i>
            <span>${isListed ? 'Buy' : 'View'}</span>
          </a>
        </td>
      </tr>
    `;
  }).join('');
}

// Event Listeners
searchInput.addEventListener('input', (e) => {
  currentSearch = e.target.value;
  if (currentSearch.length > 0) {
    clearSearchBtn.classList.remove('hidden');
  } else {
    clearSearchBtn.classList.add('hidden');
  }
  applyFiltersAndSort();
});

clearSearchBtn.addEventListener('click', () => {
  searchInput.value = '';
  currentSearch = '';
  clearSearchBtn.classList.add('hidden');
  applyFiltersAndSort();
  searchInput.focus();
});

// Category filter pills
document.querySelectorAll('.filter-pill').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.filter-pill').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentFilter = btn.dataset.filter;
    if (currentFilter === 'diff') {
      if (currentSort !== 'diff_desc' && currentSort !== 'diff_asc') {
        currentSort = 'diff_desc';
        if (sortSelect) sortSelect.value = 'diff_desc';
        savePreference('sfl_sort', 'diff_desc');
      }
    }
    savePreference('sfl_filter', currentFilter);
    applyFiltersAndSort();
  });
});

// Sort select
if (sortSelect) {
  sortSelect.addEventListener('change', (e) => {
    currentSort = e.target.value;
    savePreference('sfl_sort', currentSort);
    applyFiltersAndSort();
  });
}

// View mode toggle
if (viewGridBtn) {
  viewGridBtn.addEventListener('click', () => {
    currentView = 'grid';
    savePreference('sfl_view', 'grid');
    viewGridBtn.classList.add('bg-slate-800', 'text-amber-400');
    viewGridBtn.classList.remove('text-slate-400');
    viewTableBtn.classList.remove('bg-slate-800', 'text-amber-400');
    viewTableBtn.classList.add('text-slate-400');
    renderItems();
  });
}

if (viewTableBtn) {
  viewTableBtn.addEventListener('click', () => {
    currentView = 'table';
    savePreference('sfl_view', 'table');
    viewTableBtn.classList.add('bg-slate-800', 'text-amber-400');
    viewTableBtn.classList.remove('text-slate-400');
    viewGridBtn.classList.remove('bg-slate-800', 'text-amber-400');
    viewGridBtn.classList.add('text-slate-400');
    renderItems();
  });
}

// Auto-Refresh & Limit Timer Management
let isGlobalRefreshing = false;
const AUTO_REFRESH_INTERVAL_SECONDS = 20;
const BUTTON_LIMIT_COOLDOWN_SECONDS = 8;
let autoRefreshCountdown = AUTO_REFRESH_INTERVAL_SECONDS;
let buttonCooldownCountdown = 0;
let autoRefreshInterval = null;

function updateRefreshButtonUi() {
  const refreshBtn = document.getElementById('refreshBtn');
  const refreshIcon = document.getElementById('refreshIcon');
  const refreshBtnLabel = document.getElementById('refreshBtnLabel') || refreshBtn?.querySelector('span');
  const refreshTimerBadge = document.getElementById('refreshTimerBadge');

  if (!refreshBtn) return;

  if (isGlobalRefreshing) {
    refreshBtn.disabled = true;
    if (refreshIcon) refreshIcon.classList.add('animate-spin-custom');
    if (refreshBtnLabel) refreshBtnLabel.textContent = 'Syncing';
    if (refreshTimerBadge) refreshTimerBadge.textContent = '...';
    return;
  }

  if (refreshIcon) refreshIcon.classList.remove('animate-spin-custom');

  if (buttonCooldownCountdown > 0) {
    refreshBtn.disabled = true;
    if (refreshBtnLabel) refreshBtnLabel.textContent = 'Wait';
    if (refreshTimerBadge) {
      refreshTimerBadge.textContent = `${buttonCooldownCountdown}s`;
      refreshTimerBadge.title = `Cooldown active (${buttonCooldownCountdown}s remaining)`;
    }
  } else {
    refreshBtn.disabled = false;
    if (refreshBtnLabel) refreshBtnLabel.textContent = 'Refresh';
    if (refreshTimerBadge) {
      refreshTimerBadge.textContent = `${autoRefreshCountdown}s`;
      refreshTimerBadge.title = `Auto-refreshes in ${autoRefreshCountdown}s (Click to refresh now)`;
    }
  }
}

async function performControlledRefresh(source = 'auto') {
  if (isGlobalRefreshing) {
    console.log(`[AutoRefresh] ⏳ Refresh already running (ignoring ${source} call)`);
    return;
  }

  isGlobalRefreshing = true;
  updateRefreshButtonUi();

  const syncStatusText = document.getElementById('syncStatusText');
  const syncDot = document.getElementById('syncDot');

  if (syncStatusText) {
    syncStatusText.textContent = source === 'manual' 
      ? 'Refreshing feeds & live rates...' 
      : 'Auto-refreshing feeds (20s)...';
  }
  if (syncDot) {
    syncDot.className = 'w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse';
  }

  try {
    if (source === 'manual' && filteredItems.length > 0) {
      filteredItems.slice(0, 8).forEach(it => liveFloorCache.delete(getItemKey(it)));
    }

    await syncAllDataOnWebOpen(source === 'manual');
    await checkPendingPurchases();

    if (filteredItems.length > 0 && !OpenSeaRateLimiter.isRateLimited()) {
      await refreshVisibleItemFloors(filteredItems, 8, source === 'manual');
    }

    if (syncStatusText) {
      syncStatusText.textContent = `Auto-Synced (${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})`;
    }
    if (syncDot) {
      syncDot.className = 'w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse';
    }
  } catch (err) {
    console.warn(`[AutoRefresh] Refresh notice:`, err);
  } finally {
    isGlobalRefreshing = false;
    updateRefreshButtonUi();
  }
}

function initAutoRefreshAndTimer() {
  if (autoRefreshInterval) clearInterval(autoRefreshInterval);

  autoRefreshCountdown = AUTO_REFRESH_INTERVAL_SECONDS;
  buttonCooldownCountdown = 0;
  updateRefreshButtonUi();

  autoRefreshInterval = setInterval(() => {
    if (buttonCooldownCountdown > 0) {
      buttonCooldownCountdown--;
    }

    if (!isGlobalRefreshing) {
      autoRefreshCountdown--;

      if (autoRefreshCountdown <= 0) {
        autoRefreshCountdown = AUTO_REFRESH_INTERVAL_SECONDS;
        performControlledRefresh('auto');
      }
    }

    updateRefreshButtonUi();
  }, 1000);
}

if (refreshBtn) {
  refreshBtn.addEventListener('click', async () => {
    if (isGlobalRefreshing || buttonCooldownCountdown > 0) {
      return;
    }

    buttonCooldownCountdown = BUTTON_LIMIT_COOLDOWN_SECONDS;
    autoRefreshCountdown = AUTO_REFRESH_INTERVAL_SECONDS;

    await performControlledRefresh('manual');
  });
}

if (resetFiltersBtn) {
  resetFiltersBtn.addEventListener('click', () => {
    searchInput.value = '';
    currentSearch = '';
    clearSearchBtn.classList.add('hidden');
    document.querySelectorAll('.filter-pill').forEach(b => b.classList.remove('active'));
    document.querySelector('[data-filter="all"]')?.classList.add('active');
    currentFilter = 'all';
    currentSort = 'price_asc';
    if (sortSelect) sortSelect.value = 'price_asc';
    savePreference('sfl_filter', 'all');
    savePreference('sfl_sort', 'price_asc');
    applyFiltersAndSort();
  });
}

function syncUiPreferences() {
  document.querySelectorAll('.filter-pill').forEach(btn => {
    if (btn.dataset.filter === currentFilter) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  if (sortSelect) {
    sortSelect.value = currentSort;
  }

  if (currentView === 'table') {
    if (viewTableBtn) {
      viewTableBtn.classList.add('bg-slate-800', 'text-amber-400');
      viewTableBtn.classList.remove('text-slate-400');
    }
    if (viewGridBtn) {
      viewGridBtn.classList.remove('bg-slate-800', 'text-amber-400');
      viewGridBtn.classList.add('text-slate-400');
    }
  } else {
    if (viewGridBtn) {
      viewGridBtn.classList.add('bg-slate-800', 'text-amber-400');
      viewGridBtn.classList.remove('text-slate-400');
    }
    if (viewTableBtn) {
      viewTableBtn.classList.remove('bg-slate-800', 'text-amber-400');
      viewTableBtn.classList.add('text-slate-400');
    }
  }
}

// Settings Modal
if (openSettingsBtn && settingsModal) {
  openSettingsBtn.addEventListener('click', () => {
    if (openseaApiKeyInput) openseaApiKeyInput.value = customApiKey;
    settingsModal.classList.remove('hidden');
  });

  if (closeSettingsBtn) {
    closeSettingsBtn.addEventListener('click', () => {
      settingsModal.classList.add('hidden');
    });
  }

  if (cancelSettingsBtn) {
    cancelSettingsBtn.addEventListener('click', () => {
      settingsModal.classList.add('hidden');
    });
  }

  if (saveSettingsBtn) {
    saveSettingsBtn.addEventListener('click', async () => {
      const apiKey = openseaApiKeyInput ? openseaApiKeyInput.value.trim() : '';
      customApiKey = apiKey;
      localStorage.setItem('opensea_api_key', apiKey);
      settingsModal.classList.add('hidden');
      syncAllDataOnWebOpen(true);
    });
  }
}

// Keyboard shortcuts
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && settingsModal && !settingsModal.classList.contains('hidden')) {
    settingsModal.classList.add('hidden');
  }
  if (e.key === '/' && document.activeElement !== searchInput) {
    e.preventDefault();
    if (searchInput) searchInput.focus();
  }
});

// Track user clicks on "Buy on OpenSea" to immediately re-verify when returning to app
document.addEventListener('click', (e) => {
  const btn = e.target.closest('.buy-opensea-btn');
  if (btn && btn.dataset.itemKey) {
    const key = btn.dataset.itemKey;
    pendingPurchaseTokenIds.add(key);
    liveFloorCache.delete(key);
  }
});

async function checkPendingPurchases() {
  if (!pendingPurchaseTokenIds.size) return;
  const keys = Array.from(pendingPurchaseTokenIds);
  pendingPurchaseTokenIds.clear();
  for (const key of keys) {
    await verifySingleItemFloor(key, true);
  }
}

// Click handler for per-item live OpenSea floor verification
document.addEventListener('click', async (e) => {
  const btn = e.target.closest('.verify-token-btn');
  if (btn && btn.dataset.itemKey) {
    e.preventDefault();
    e.stopPropagation();
    const key = btn.dataset.itemKey;
    const icon = btn.querySelector('[data-lucide="refresh-cw"], svg');
    if (icon) icon.classList.add('animate-spin-custom');
    try {
      const ok = await verifySingleItemFloor(key, true);
      if (ok) {
        btn.classList.add('text-emerald-400');
        setTimeout(() => btn.classList.remove('text-emerald-400'), 1500);
      }
    } finally {
      if (icon) icon.classList.remove('animate-spin-custom');
    }
  }
});

let lastVisibilityCheckTime = 0;

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    const now = Date.now();
    if (now - lastVisibilityCheckTime < 10000) return;
    lastVisibilityCheckTime = now;
    checkPendingPurchases();
  }
});

window.addEventListener('focus', () => {
  const now = Date.now();
  if (now - lastVisibilityCheckTime < 10000) return;
  lastVisibilityCheckTime = now;
  checkPendingPurchases();
});

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
  if (window.lucide) {
    lucide.createIcons();
  }

  syncUiPreferences();

  if (window.INITIAL_COLLECTIBLES_DATA && window.INITIAL_COLLECTIBLES_DATA.items && window.INITIAL_COLLECTIBLES_DATA.items.length > 0) {
    allItems = window.INITIAL_COLLECTIBLES_DATA.items;
    flowerUsdcRate = window.INITIAL_COLLECTIBLES_DATA.flowerUsdcRate || flowerUsdcRate;
    totalCountEl.textContent = allItems.length;
    computeClientStats(allItems, 'OpenSea + In-Game (Initial)', window.INITIAL_COLLECTIBLES_DATA.lastUpdated, flowerUsdcRate);
    applyFiltersAndSort(false);
  } else {
    showLoading(true);
  }

  syncAllDataOnWebOpen(true);
  initAutoRefreshAndTimer();
});
