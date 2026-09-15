// Sunflower Land OpenSea Price Tracker Client Application
// Sourced directly from OpenSea API v2

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

const ALLOWED_FILTERS = ['all', 'diff', 'boost', 'without-boost', 'no-boost', 'recently-listed', 'cosmetic'];
const ALLOWED_SORTS = ['diff_desc', 'diff_asc', 'price_asc', 'price_desc', 'ingame_asc', 'ingame_desc', 'recently_listed', 'recently_sold', 'last_sale_desc', 'supply_desc', 'supply_asc', 'name_asc'];
const ALLOWED_VIEWS = ['grid', 'table'];

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
const OPENSEA_CONTRACT_ADDRESS = '0x22d5f9b75c524fec1d6619787e582644cd4d7422';

/**
 * Generate official OpenSea item URL on Polygon
 */
function getOpenSeaUrl(itemId) {
  return `https://opensea.io/assets/polygon/${OPENSEA_CONTRACT_ADDRESS}/${itemId}`;
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
 * Compute stats on client side from OpenSea items array
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
    statInGameCount.textContent = inGameListed.length;
  }
  if (statTotalItems) statTotalItems.textContent = items.length;
  if (statBoostCount) statBoostCount.textContent = boostCount;
  if (statProvider) statProvider.textContent = provider;

  const time = new Date(lastUpdated);
  if (statLastUpdated) {
    statLastUpdated.textContent = isNaN(time.getTime()) ? 'Just now' : time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
}

/**
 * Resource token check for Sunflower Land ERC-1155 contract
 * Resources have 18 decimals in the contract, whereas collectibles have 0 decimals.
 */
function isResourceToken(id) {
  const num = Number(id);
  return (num >= 201 && num <= 220) || (num >= 601 && num <= 605) || (num >= 301 && num <= 304);
}

// In-memory cache for live verified floors to prevent redundant OpenSea queries
const liveFloorCache = new Map();
let isFetchingLiveFloors = false;

// Track tokens user clicked to purchase on OpenSea for instant re-verification
const pendingPurchaseTokenIds = new Set();

/**
 * On-demand live floor verification for currently visible items
 * Directly fetches official OpenSea /nfts/{id}/best endpoint in real time
 */
async function refreshVisibleItemFloors(items, force = false) {
  if (!items || !items.length) return;
  if (isFetchingLiveFloors && !force) return;
  const apiKey = customApiKey || localStorage.getItem('opensea_api_key') || 'add815580a904473ba7f162c0ccc4926';
  if (!apiKey) return;

  const now = Date.now();
  const toCheck = items.filter(it => {
    if (force) return true;
    const cached = liveFloorCache.get(it.id);
    return !cached || (now - cached.timestamp > 15000); // 15 seconds TTL for rapid reactivity
  }).slice(0, 48);

  if (!toCheck.length) return;
  isFetchingLiveFloors = true;

  try {
    const headers = { 'x-api-key': apiKey, 'accept': 'application/json' };
    let hasChanges = false;

    for (let i = 0; i < toCheck.length; i += 4) {
      const chunk = toCheck.slice(i, i + 4);
      await Promise.all(chunk.map(async (item) => {
        try {
          const res = await fetch(`https://api.opensea.io/api/v2/listings/collection/sunflower-land-collectibles/nfts/${item.id}/best?_t=${Date.now()}`, {
            headers,
            cache: 'no-store',
            signal: AbortSignal.timeout(6000)
          });
          if (res.status === 404) {
            liveFloorCache.set(item.id, { price: 0, unlisted: true, timestamp: Date.now() });
            item._liveVerified = true;
            item._liveTimestamp = Date.now();
            if (!item.unlisted || item.rawPrice > 0) {
              item.unlisted = true;
              item.rawPrice = 0;
              item.floorPrice = 0;
              hasChanges = true;
            }
            return;
          }
          if (!res.ok) {
            const errText = await res.text().catch(() => '');
            if (res.status === 400 && errText.includes('No listings found')) {
              liveFloorCache.set(item.id, { price: 0, unlisted: true, timestamp: Date.now() });
              item._liveVerified = true;
              item._liveTimestamp = Date.now();
              if (!item.unlisted || item.rawPrice > 0) {
                item.unlisted = true;
                item.rawPrice = 0;
                item.floorPrice = 0;
                hasChanges = true;
              }
            }
            return;
          }
          const data = await res.json();
          // Check if listing is active
          if (data.status && data.status !== 'ACTIVE') {
            liveFloorCache.set(item.id, { price: 0, unlisted: true, timestamp: Date.now() });
            item._liveVerified = true;
            item._liveTimestamp = Date.now();
            if (!item.unlisted || item.rawPrice > 0) {
              item.unlisted = true;
              item.rawPrice = 0;
              item.floorPrice = 0;
              hasChanges = true;
            }
            return;
          }

          const cur = data.price?.current?.currency || 'WETH';
          const dec = data.price?.current?.decimals != null ? data.price.current.decimals : 18;
          const totalVal = data.price?.current?.value ? (Number(data.price.current.value) / Math.pow(10, dec)) : 0;
          const offer = data.protocol_data?.parameters?.offer?.[0];
          const startAmount = Number(offer?.startAmount || '1');

          let unitPrice = totalVal;
          if (isResourceToken(item.id)) {
            if (startAmount < 1e18) return; // ignore micro-dust orders
            unitPrice = totalVal / (startAmount / 1e18);
          } else {
            unitPrice = startAmount > 1 ? totalVal / startAmount : totalVal;
          }

          if (unitPrice > 0 && unitPrice >= 0.00001) {
            liveFloorCache.set(item.id, { price: unitPrice, currency: cur, timestamp: Date.now() });
            item._liveVerified = true;
            item._liveTimestamp = Date.now();
            if (Math.abs(item.rawPrice - unitPrice) > 0.0000001 || item.unlisted) {
              item.rawPrice = unitPrice;
              item.floorPrice = unitPrice;
              item.currency = cur;
              item.unlisted = false;
              hasChanges = true;
            }
          } else {
            // No valid positive price found - mark unlisted
            liveFloorCache.set(item.id, { price: 0, unlisted: true, timestamp: Date.now() });
            item._liveVerified = true;
            item._liveTimestamp = Date.now();
            if (!item.unlisted || item.rawPrice > 0) {
              item.unlisted = true;
              item.rawPrice = 0;
              item.floorPrice = 0;
              hasChanges = true;
            }
          }
        } catch {}
      }));
    }

    if (hasChanges) {
      computeClientStats(allItems, 'OpenSea Live Verified (Real-Time)', new Date(), flowerUsdcRate);
      applyFiltersAndSort(false);
      const syncStatusText = document.getElementById('syncStatusText');
      if (syncStatusText) {
        syncStatusText.textContent = `⚡ Live OpenSea Verified (${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})`;
      }
    }
  } catch (err) {
    console.warn('Live floor check notice:', err);
  } finally {
    isFetchingLiveFloors = false;
  }
}

/**
 * Fetch live fresh listings & events directly from OpenSea API v2 in real-time
 */
async function fetchLiveOpenSeaUpdates() {
  const apiKey = customApiKey || localStorage.getItem('opensea_api_key') || 'add815580a904473ba7f162c0ccc4926';
  if (!apiKey || !allItems.length) return;

  try {
    const headers = {
      'x-api-key': apiKey,
      'accept': 'application/json'
    };

    const [listingEventsRes, saleEventsRes] = await Promise.all([
      fetch(`https://api.opensea.io/api/v2/events/collection/sunflower-land-collectibles?event_type=listing&limit=50&_t=${Date.now()}`, {
        headers,
        cache: 'no-store',
        signal: AbortSignal.timeout(4500)
      }).then(r => r.ok ? r.json() : null).catch(() => null),
      fetch(`https://api.opensea.io/api/v2/events/collection/sunflower-land-collectibles?event_type=sale&limit=50&_t=${Date.now()}`, {
        headers,
        cache: 'no-store',
        signal: AbortSignal.timeout(4500)
      }).then(r => r.ok ? r.json() : null).catch(() => null)
    ]);

    let updatedCount = 0;
    const tokensToVerify = new Set();

    // 1. Process recent live listings (metadata only, do NOT assume listing is active!)
    if (listingEventsRes?.asset_events) {
      for (const ev of listingEventsRes.asset_events) {
        const id = parseInt(ev.asset?.identifier, 10);
        if (!id) continue;
        const target = allItems.find(i => i.id === id);
        if (target) {
          const dec = ev.payment?.decimals || 18;
          const totalVal = ev.payment?.quantity ? (Number(ev.payment.quantity) / Math.pow(10, dec)) : 0;
          let unitPrice = totalVal;
          if (isResourceToken(id)) {
            const rawQty = Number(ev.quantity || 1);
            const tokenUnits = rawQty >= 1e18 ? (rawQty / 1e18) : (rawQty > 0 ? (rawQty / 1e18) : 1);
            if (tokenUnits > 0) unitPrice = totalVal / tokenUnits;
          } else if (ev.quantity && Number(ev.quantity) > 1) {
            unitPrice = totalVal / Number(ev.quantity);
          }

          const ts = (ev.event_timestamp || 0) * 1000;
          target.recentlyListed = true;
          if (!target.lastListedTimestamp || ts > target.lastListedTimestamp) {
            target.lastListedTimestamp = ts;
            target.lastListedPrice = unitPrice;
          }
          tokensToVerify.add(id);
        }
      }
    }

    // 2. Process recent live sales (metadata only)
    if (saleEventsRes?.asset_events) {
      for (const ev of saleEventsRes.asset_events) {
        const id = parseInt(ev.asset?.identifier || ev.nft?.identifier, 10);
        if (!id) continue;
        const target = allItems.find(i => i.id === id);
        if (target) {
          const dec = ev.payment?.decimals || 18;
          const totalVal = ev.payment?.quantity ? (Number(ev.payment.quantity) / Math.pow(10, dec)) : 0;
          let unitPrice = totalVal;
          if (isResourceToken(id)) {
            const rawQty = Number(ev.quantity || 1);
            const tokenUnits = rawQty >= 1e18 ? (rawQty / 1e18) : (rawQty > 0 ? (rawQty / 1e18) : 1);
            if (tokenUnits > 0) unitPrice = totalVal / tokenUnits;
          } else if (ev.quantity && Number(ev.quantity) > 1) {
            unitPrice = totalVal / Number(ev.quantity);
          }

          const ts = (ev.event_timestamp || 0) * 1000;
          target.recentlySold = true;
          if (!target.lastSaleTimestamp || ts > target.lastSaleTimestamp) {
            target.lastSaleTimestamp = ts;
            target.lastSalePrice = unitPrice;
            target.lastSaleCurrency = ev.payment?.symbol || 'WETH';
          }
          tokensToVerify.add(id);
        }
      }
    }

    // 3. Re-verify active floor for all tokens with recent listing or sale activity directly via /best
    if (tokensToVerify.size > 0) {
      const verifyArray = Array.from(tokensToVerify).slice(0, 24);
      await Promise.allSettled(verifyArray.map(async (id) => {
        liveFloorCache.delete(id);
        const target = allItems.find(i => i.id === id);
        if (!target) return;

        try {
          const res = await fetch(`https://api.opensea.io/api/v2/listings/collection/sunflower-land-collectibles/nfts/${id}/best?_t=${Date.now()}`, {
            headers,
            cache: 'no-store',
            signal: AbortSignal.timeout(5000)
          });

          if (res.status === 404) {
            // Unlisted / Sold out on OpenSea
            if (!target.unlisted || target.rawPrice > 0) {
              target.unlisted = true;
              target.rawPrice = 0;
              target.floorPrice = 0;
              liveFloorCache.set(id, { price: 0, unlisted: true, timestamp: Date.now() });
              updatedCount++;
            }
            return;
          }

          if (!res.ok) {
            const errText = await res.text().catch(() => '');
            if (res.status === 400 && errText.includes('No listings found')) {
              if (!target.unlisted || target.rawPrice > 0) {
                target.unlisted = true;
                target.rawPrice = 0;
                target.floorPrice = 0;
                liveFloorCache.set(id, { price: 0, unlisted: true, timestamp: Date.now() });
                updatedCount++;
              }
            }
            return;
          }

          const data = await res.json();
          // Check if listing is active
          if (data.status && data.status !== 'ACTIVE') {
            if (!target.unlisted || target.rawPrice > 0) {
              target.unlisted = true;
              target.rawPrice = 0;
              target.floorPrice = 0;
              liveFloorCache.set(id, { price: 0, unlisted: true, timestamp: Date.now() });
              updatedCount++;
            }
            return;
          }

          const cur = data.price?.current?.currency || 'WETH';
          const dec = data.price?.current?.decimals != null ? data.price.current.decimals : 18;
          const totalVal = data.price?.current?.value ? (Number(data.price.current.value) / Math.pow(10, dec)) : 0;
          const offer = data.protocol_data?.parameters?.offer?.[0];
          const startAmount = Number(offer?.startAmount || '1');

          let unitPrice = totalVal;
          if (isResourceToken(id)) {
            if (startAmount < 1e18) return;
            unitPrice = totalVal / (startAmount / 1e18);
          } else {
            unitPrice = startAmount > 1 ? totalVal / startAmount : totalVal;
          }

          if (unitPrice > 0 && unitPrice >= 0.00001) {
            if (Math.abs(target.rawPrice - unitPrice) > 0.0000001 || target.unlisted) {
              target.rawPrice = unitPrice;
              target.floorPrice = unitPrice;
              target.currency = cur;
              target.unlisted = false;
              target._liveVerified = true;
              target._liveTimestamp = Date.now();
              liveFloorCache.set(id, { price: unitPrice, currency: cur, timestamp: Date.now() });
              updatedCount++;
            }
          } else {
            if (!target.unlisted || target.rawPrice > 0) {
              target.unlisted = true;
              target.rawPrice = 0;
              target.floorPrice = 0;
              liveFloorCache.set(id, { price: 0, unlisted: true, timestamp: Date.now() });
              updatedCount++;
            }
          }
        } catch (e) {
          console.warn(`Floor re-check notice for #${id}:`, e.message);
        }
      }));
    }

    if (updatedCount > 0) {
      computeClientStats(allItems, 'OpenSea Live API v2 (Real-Time)', new Date(), flowerUsdcRate);
      applyFiltersAndSort(false);
      console.log(`⚡ Live OpenSea API updated ${updatedCount} items in real-time!`);
    }
  } catch (err) {
    console.warn('Live OpenSea API fetch notice:', err.message);
  }
}

/**
 * Live fetch for SFL / Flower token exchange rate directly from sfl.world
 * Uses ultra-fast edge proxy with fallback and strict timeout to guarantee instant response without hanging
 */
async function fetchLiveFlowerExchangeRate() {
  const targetUrl = 'https://sfl.world/api/v1.1/exchange';
  const urls = [
    `https://cors-get-proxy.sirjosh.workers.dev/?url=${encodeURIComponent(targetUrl)}`,
    targetUrl,
    `https://api.allorigins.win/raw?url=${encodeURIComponent(targetUrl)}`
  ];

  for (const u of urls) {
    try {
      const res = await fetch(u, { signal: AbortSignal.timeout(2500), cache: 'no-store' });
      if (res.ok) {
        const d = await res.json();
        if (d?.sfl?.usd && Number(d.sfl.usd) > 0) {
          return Number(d.sfl.usd);
        }
      }
    } catch {}
  }
  return null;
}

/**
 * Live fetch for In-Game Marketplace listings directly from sfl.world
 * Queries real-time active listings with edge proxy fallback
 */
async function fetchLiveInGameMarketplace() {
  const targetUrl = 'https://sfl.world/api/v1/nfts';
  const urls = [
    `https://cors-get-proxy.sirjosh.workers.dev/?url=${encodeURIComponent(targetUrl)}`,
    targetUrl
  ];

  for (const u of urls) {
    try {
      const res = await fetch(u, { signal: AbortSignal.timeout(3000), cache: 'no-store' });
      if (res.ok) {
        const d = await res.json();
        const list = d?.collectibles || d?.data || (Array.isArray(d) ? d : null);
        if (list && list.length > 0) {
          return list;
        }
      }
    } catch {}
  }
  return null;
}

/**
 * Automatically sync all 3 data feeds:
 * 1. data/prices.json (Full catalog with floor prices & metadata)
 * 2. data/exchange.json (Live SFL/Flower token exchange rate)
 * 3. data/ingame_nfts.json (SFL In-game marketplace items)
 * Concurrently with live DEX rate & OpenSea API v2 updates
 */
async function syncAllDataOnWebOpen(forceRefresh = false) {
  const syncStatusText = document.getElementById('syncStatusText');
  const syncDot = document.getElementById('syncDot');
  if (syncStatusText) {
    syncStatusText.textContent = 'Syncing live data feeds (Prices, Exchange, In-Game)...';
  }
  if (syncDot) {
    syncDot.className = 'w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping';
  }

  try {
    const timestamp = Date.now();
    const noStore = { cache: 'no-store' };

    // 1. Concurrently fetch all data feeds + live sfl.world exchange API + live in-game marketplace + live ETH market price
    const [pricesRes, exchangeRes, inGameRes, directRate, liveInGameMarket, ethRes] = await Promise.allSettled([
      fetch(`./data/prices.json?v=${timestamp}`, noStore).then(r => r.ok ? r.json() : null),
      fetch(`./data/exchange.json?v=${timestamp}`, noStore).then(r => r.ok ? r.json() : null),
      fetch(`./data/ingame_nfts.json?v=${timestamp}`, noStore).then(r => r.ok ? r.json() : null),
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
    let freshRate = null;
    if (directRateValue && Number(directRateValue) > 0) {
      freshRate = Number(directRateValue);
      console.log('🌸 Live SFL rate fetched fresh from sfl.world:', freshRate);
    } else if (exchangeData?.sfl?.usd && Number(exchangeData.sfl.usd) > 0) {
      freshRate = Number(exchangeData.sfl.usd);
    } else if (exchangeData?.data?.sfl?.usd && Number(exchangeData.data.sfl.usd) > 0) {
      freshRate = Number(exchangeData.data.sfl.usd);
    } else if (pricesData?.flowerUsdcRate) {
      freshRate = Number(pricesData.flowerUsdcRate);
    }

    if (freshRate && freshRate > 0) {
      flowerUsdcRate = freshRate;
      if (statFlowerRate) {
        statFlowerRate.textContent = '$' + flowerUsdcRate.toFixed(4);
      }
    }

    // 3. Parse In-Game marketplace items (preferring real-time live feed if available)
    const inGameMap = new Map();
    const rawList = (liveMarketList && liveMarketList.length > 0)
      ? liveMarketList
      : (inGameData?.collectibles || inGameData?.data || (Array.isArray(inGameData) ? inGameData : []));

    for (const item of rawList) {
      if (item.id != null) {
        inGameMap.set(Number(item.id), {
          floor: item.floor != null ? Number(item.floor) : null,
          lastSalePrice: item.lastSalePrice != null ? Number(item.lastSalePrice) : null,
          supply: item.supply != null ? Number(item.supply) : null,
          name: item.name || '',
          haveBoost: item.have_boost === 1,
          boostText: item.boost_text || ''
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
          if (i._liveVerified) liveMap.set(i.id, i);
        });

        allItems = pricesData.items.map(pItem => {
          const live = liveMap.get(pItem.id);
          // Only preserve live price if it was verified recently (within 2 minutes) AND this is not a force refresh
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

    // 5. Merge In-Game data & live exchange rates into allItems
    for (const item of allItems) {
      const inGameInfo = inGameMap.get(Number(item.id));
      if (inGameInfo) {
        if (inGameInfo.floor !== null) {
          item.inGameFloor = inGameInfo.floor;
          item.inGameFloorUsdc = Number((inGameInfo.floor * flowerUsdcRate).toFixed(4));
        }
        if (!item.boostText && inGameInfo.boostText) {
          item.boostText = inGameInfo.boostText;
          item.haveBoost = inGameInfo.haveBoost;
        }
        if ((!item.name || item.name.startsWith('Sunflower Land #')) && inGameInfo.name) {
          item.name = inGameInfo.name;
        }
        if (inGameInfo.supply && item.supply <= 1) {
          item.supply = inGameInfo.supply;
        }
      } else {
        // If live in-game marketplace data was retrieved and item is missing, it was purchased / unlisted in-game
        if (inGameMap.size > 20) {
          item.inGameFloor = null;
          item.inGameFloorUsdc = null;
        } else if (item.inGameFloor && flowerUsdcRate) {
          item.inGameFloorUsdc = Number((item.inGameFloor * flowerUsdcRate).toFixed(4));
        }
      }
    }

    totalCountEl.textContent = allItems.length;
    // Always use current live timestamp for accurate user visibility
    computeClientStats(allItems, 'Live Synced (OpenSea & In-Game)', new Date(), flowerUsdcRate);
    applyFiltersAndSort();

    // 6. Concurrently trigger live OpenSea API updates (real-time events & best listings)
    fetchLiveOpenSeaUpdates().catch(err => console.warn('OpenSea live update notice:', err));

    // 7. Update UI sync status
    if (syncStatusText) {
      syncStatusText.textContent = `Auto-Synced (${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})`;
    }
    if (syncDot) {
      syncDot.className = 'w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse';
    }
    errorState.classList.add('hidden');
    console.log(`✅ Live synced 3 feeds: prices.json (${allItems.length} items), rate: $${flowerUsdcRate.toFixed(4)}, in-game: ${inGameMap.size} items`);
  } catch (err) {
    console.error('Error during auto-sync:', err);
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
 * Backwards compatibility alias for loadData
 */
async function loadData(forceRefresh = false) {
  return syncAllDataOnWebOpen(forceRefresh);
}

/**
 * Filter & Sort items locally
 */
function applyFiltersAndSort(checkLive = true) {
  let result = [...allItems];

  // 1. Safe Text Search Filter (matches name, token ID with/without #, or utility boost)
  if (currentSearch) {
    const cleanQ = currentSearch.replace(/^#/, '').toLowerCase().trim();
    result = result.filter(item => {
      const name = (item.name || '').toLowerCase();
      const idStr = String(item.id || '');
      const boost = (item.boostText || '').toLowerCase();
      return name.includes(cleanQ) || idStr.includes(cleanQ) || boost.includes(cleanQ);
    });
  }

  // 2. Category Filter
  if (currentFilter === 'diff') {
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
    result.sort((a, b) => {
      const aTime = a.lastListedTimestamp || (a.orderCreatedAt ? a.orderCreatedAt * 1000 : 0);
      const bTime = b.lastListedTimestamp || (b.orderCreatedAt ? b.orderCreatedAt * 1000 : 0);
      return bTime - aTime;
    });
  } else if (currentFilter === 'tier-cheap') {
    result = result.filter(item => !item.unlisted && item.rawPrice > 0 && item.rawPrice < 0.0005);
  } else if (currentFilter === 'tier-mid') {
    result = result.filter(item => !item.unlisted && item.rawPrice >= 0.0005 && item.rawPrice <= 0.005);
  } else if (currentFilter === 'tier-high') {
    result = result.filter(item => !item.unlisted && item.rawPrice > 0.005);
  } else if (currentFilter === 'unlisted') {
    result = result.filter(item => item.unlisted && (!item.inGameFloor || item.inGameFloor <= 0));
  }

  // 3. Sorting
  if (currentSort === 'diff_desc') {
    result.sort((a, b) => {
      const aOS = (!a.unlisted && (a.rawPrice || a.floorPrice)) ? (((a.rawPrice || a.floorPrice) * ethUsdPrice) / (flowerUsdcRate || 1)) : null;
      const aGame = (a.inGameFloor && a.inGameFloor > 0) ? (a.inGameFloor * 0.9) : null;
      const aDiff = (aOS !== null && aGame !== null) ? (aGame - aOS) : -999999999;

      const bOS = (!b.unlisted && (b.rawPrice || b.floorPrice)) ? (((b.rawPrice || b.floorPrice) * ethUsdPrice) / (flowerUsdcRate || 1)) : null;
      const bGame = (b.inGameFloor && b.inGameFloor > 0) ? (b.inGameFloor * 0.9) : null;
      const bDiff = (bOS !== null && bGame !== null) ? (bGame - bOS) : -999999999;

      return bDiff - aDiff;
    });
  } else if (currentSort === 'diff_asc') {
    result.sort((a, b) => {
      const aOS = (!a.unlisted && (a.rawPrice || a.floorPrice)) ? (((a.rawPrice || a.floorPrice) * ethUsdPrice) / (flowerUsdcRate || 1)) : null;
      const aGame = (a.inGameFloor && a.inGameFloor > 0) ? (a.inGameFloor * 0.9) : null;
      const aDiff = (aOS !== null && aGame !== null) ? (aGame - aOS) : 999999999;

      const bOS = (!b.unlisted && (b.rawPrice || b.floorPrice)) ? (((b.rawPrice || b.floorPrice) * ethUsdPrice) / (flowerUsdcRate || 1)) : null;
      const bGame = (b.inGameFloor && b.inGameFloor > 0) ? (b.inGameFloor * 0.9) : null;
      const bDiff = (bOS !== null && bGame !== null) ? (bGame - bOS) : 999999999;

      return aDiff - bDiff;
    });
  } else if (currentSort === 'recently_listed') {
    result.sort((a, b) => {
      if (a.recentlyListed && !b.recentlyListed) return -1;
      if (!a.recentlyListed && b.recentlyListed) return 1;
      const aTime = a.lastListedTimestamp || (a.orderCreatedAt ? a.orderCreatedAt * 1000 : 0);
      const bTime = b.lastListedTimestamp || (b.orderCreatedAt ? b.orderCreatedAt * 1000 : 0);
      return bTime - aTime;
    });
  } else if (currentSort === 'recently_sold') {
    result.sort((a, b) => {
      if (a.recentlySold && !b.recentlySold) return -1;
      if (!a.recentlySold && b.recentlySold) return 1;
      const aTime = a.lastSaleTimestamp || 0;
      const bTime = b.lastSaleTimestamp || 0;
      if (bTime !== aTime) return bTime - aTime;
      return (b.lastSalePrice || 0) - (a.lastSalePrice || 0);
    });
  } else if (currentSort === 'ingame_asc') {
    result.sort((a, b) => {
      const aFloor = a.inGameFloor && a.inGameFloor > 0 ? a.inGameFloor : 999999999;
      const bFloor = b.inGameFloor && b.inGameFloor > 0 ? b.inGameFloor : 999999999;
      return aFloor - bFloor;
    });
  } else if (currentSort === 'ingame_desc') {
    result.sort((a, b) => (b.inGameFloor || 0) - (a.inGameFloor || 0));
  } else if (currentSort === 'last_sale_desc') {
    result.sort((a, b) => (b.lastSalePrice || 0) - (a.lastSalePrice || 0));
  } else if (currentSort === 'price_asc') {
    result.sort((a, b) => {
      if (a.unlisted && !b.unlisted) return 1;
      if (!a.unlisted && b.unlisted) return -1;
      return (a.rawPrice || a.floorPrice || 0) - (b.rawPrice || b.floorPrice || 0);
    });
  } else if (currentSort === 'price_desc') {
    result.sort((a, b) => {
      if (a.unlisted && !b.unlisted) return 1;
      if (!a.unlisted && b.unlisted) return -1;
      return (b.rawPrice || b.floorPrice || 0) - (a.rawPrice || a.floorPrice || 0);
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
    refreshVisibleItemFloors(filteredItems.slice(0, 36), filteredItems.length <= 10);
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
            <span class="text-[9px] text-slate-500 hidden sm:inline">(Net Game − OS Equiv)</span>
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
      <div class="collectible-card bg-slate-900/90 border border-slate-800/90 rounded-2xl p-4 flex flex-col justify-between space-y-3 relative group">
        <div>
          <!-- Header: ID + Badges -->
          <div class="flex items-center justify-between mb-2">
            <span class="font-mono text-[11px] text-slate-400 font-semibold bg-slate-950 px-2 py-0.5 rounded-md border border-slate-800">
              #${item.id}
            </span>
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
                  <span class="text-[9px] font-medium px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">WETH</span>
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
                    <!-- Standard Price & USDC below it -->
                    <div>
                      <div class="text-xs font-black text-pink-400 tracking-tight">
                        ${inGamePriceDisplay} <span class="text-[9px] font-bold text-pink-300/80">SFL</span>
                      </div>
                      ${inGameUsdcDisplay ? `<div class="text-[10px] text-emerald-400 font-mono font-medium">${inGameUsdcDisplay}</div>` : ''}
                    </div>

                    <!-- -10% Price & USDC below it -->
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
          <a href="${getOpenSeaUrl(item.id)}" target="_blank" rel="noopener noreferrer" 
             data-token-id="${item.id}"
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
          <div class="flex items-center flex-wrap gap-1">
            <span>${item.name}</span>
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
          <div>
            <span class="font-extrabold ${isListed ? 'text-amber-400' : 'text-slate-500'}">${priceDisplay}</span>
            ${isListed ? `<span class="text-[10px] text-blue-400 font-bold ml-0.5">${currency}</span>` : ''}
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
          <a href="${getOpenSeaUrl(item.id)}" target="_blank" rel="noopener noreferrer" 
             data-token-id="${item.id}"
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

// Refresh button (forces complete real-time sync across OpenSea + In-Game)
if (refreshBtn) {
  refreshBtn.addEventListener('click', async () => {
    if (refreshIcon) refreshIcon.classList.add('animate-spin-custom');
    const syncStatusText = document.getElementById('syncStatusText');
    if (syncStatusText) syncStatusText.textContent = 'Refreshing live APIs & OpenSea...';
    liveFloorCache.clear();
    isFetchingLiveFloors = false;
    await syncAllDataOnWebOpen(true);
    await checkPendingPurchases();
    if (filteredItems.length > 0) {
      await refreshVisibleItemFloors(filteredItems.slice(0, 48), true);
    }
    if (refreshIcon) refreshIcon.classList.remove('animate-spin-custom');
    if (syncStatusText) {
      syncStatusText.textContent = `⚡ Live Updated (${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})`;
    }
  });
}

// Reset filters
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

/**
 * Synchronize UI controls (filter pills, sort dropdown, grid/table view buttons) with current user preferences
 */
function syncUiPreferences() {
  // Sync filter pill buttons
  document.querySelectorAll('.filter-pill').forEach(btn => {
    if (btn.dataset.filter === currentFilter) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  // Sync sort select dropdown
  if (sortSelect) {
    sortSelect.value = currentSort;
  }

  // Sync view toggle buttons
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

      try {
        await fetch('/api/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ apiKey })
        });
      } catch {
        // static mode
      }

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
  if (btn && btn.dataset.tokenId) {
    const id = Number(btn.dataset.tokenId);
    if (id) {
      pendingPurchaseTokenIds.add(id);
      liveFloorCache.delete(id);
    }
  }
});

async function checkPendingPurchases() {
  if (!pendingPurchaseTokenIds.size) return;
  const ids = Array.from(pendingPurchaseTokenIds);
  const items = allItems.filter(i => ids.includes(i.id));
  if (items.length) {
    await refreshVisibleItemFloors(items, true);
  }
}

// When tab becomes active or focused (e.g. user just completed purchase on OpenSea)
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    checkPendingPurchases();
    if (filteredItems.length > 0) {
      refreshVisibleItemFloors(filteredItems.slice(0, 36), true);
    }
    fetchLiveOpenSeaUpdates();
  }
});

window.addEventListener('focus', () => {
  checkPendingPurchases();
});

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
  if (window.lucide) {
    lucide.createIcons();
  }

  // Restore saved UI preferences (filter, sort dropdown, view mode)
  syncUiPreferences();

  // 1. Instant display if pre-bundled data exists (zero delay)
  if (window.INITIAL_COLLECTIBLES_DATA && window.INITIAL_COLLECTIBLES_DATA.items && window.INITIAL_COLLECTIBLES_DATA.items.length > 0) {
    allItems = window.INITIAL_COLLECTIBLES_DATA.items;
    flowerUsdcRate = window.INITIAL_COLLECTIBLES_DATA.flowerUsdcRate || flowerUsdcRate;
    totalCountEl.textContent = allItems.length;
    computeClientStats(allItems, 'OpenSea + In-Game (Initial)', window.INITIAL_COLLECTIBLES_DATA.lastUpdated, flowerUsdcRate);
    applyFiltersAndSort();
  } else {
    showLoading(true);
  }

  // 2. Automatically sync all 3 feeds (prices.json, exchange.json, ingame_nfts.json) + live APIs on web open!
  syncAllDataOnWebOpen(true);

  // 3. Keep syncing full feeds periodically in the background every 60 seconds
  setInterval(() => {
    syncAllDataOnWebOpen(false);
  }, 60000);

  // 4. Poll live OpenSea events & sales every 20 seconds for real-time reactivity
  setInterval(() => {
    fetchLiveOpenSeaUpdates();
  }, 20000);
});

