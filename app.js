// Sunflower Land OpenSea Price Tracker Client Application
// Sourced directly from OpenSea API v2

let allItems = [];
let filteredItems = [];
let currentFilter = 'all';
let currentSearch = '';
let currentSort = 'price_asc';
let currentView = 'grid';
let isLoading = false;
let flowerUsdcRate = 0.19501167;
let customApiKey = localStorage.getItem('opensea_api_key') || 'add815580a904473ba7f162c0ccc4926';

// Approx ETH price in USD for real-time reference
const ETH_USD_ESTIMATE = 2500;
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
  const usd = wethPrice * ETH_USD_ESTIMATE;
  if (usd < 0.01) return '<$0.01 USD';
  return `~$${usd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD`;
}

/**
 * Format In-Game Price (FLOWER Token)
 */
function formatFlowerPrice(num) {
  if (num === null || num === undefined || isNaN(num) || num <= 0) return 'Unlisted';
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

  statFloor.textContent = formatCryptoPrice(minPrice);
  if (statFlowerRate) {
    statFlowerRate.textContent = '$' + (flowerRate || flowerUsdcRate).toFixed(4);
  }
  if (statInGameCount) {
    statInGameCount.textContent = inGameListed.length;
  }
  statTotalItems.textContent = items.length;
  statBoostCount.textContent = boostCount;
  statProvider.textContent = provider;

  const time = new Date(lastUpdated);
  statLastUpdated.textContent = isNaN(time.getTime()) ? 'Just now' : time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
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

    const [listingEventsRes, saleEventsRes, bestListingsRes] = await Promise.all([
      fetch('https://api.opensea.io/api/v2/events/collection/sunflower-land-collectibles?event_type=listing&limit=50', { headers }).then(r => r.ok ? r.json() : null).catch(() => null),
      fetch('https://api.opensea.io/api/v2/events/collection/sunflower-land-collectibles?event_type=sale&limit=50', { headers }).then(r => r.ok ? r.json() : null).catch(() => null),
      fetch('https://api.opensea.io/api/v2/listings/collection/sunflower-land-collectibles/best?limit=50', { headers }).then(r => r.ok ? r.json() : null).catch(() => null)
    ]);

    let updatedCount = 0;

    // 1. Process recent live listings
    if (listingEventsRes?.asset_events) {
      for (const ev of listingEventsRes.asset_events) {
        const id = parseInt(ev.asset?.identifier, 10);
        if (!id) continue;
        const target = allItems.find(i => i.id === id);
        if (target) {
          const dec = ev.payment?.decimals || 18;
          const price = ev.payment?.quantity ? (Number(ev.payment.quantity) / Math.pow(10, dec)) : 0;
          const ts = (ev.event_timestamp || 0) * 1000;
          target.recentlyListed = true;
          if (!target.lastListedTimestamp || ts > target.lastListedTimestamp) {
            target.lastListedTimestamp = ts;
            target.lastListedPrice = price;
          }
          if (target.unlisted && price > 0) {
            target.unlisted = false;
            target.rawPrice = price;
            target.floorPrice = price;
          }
          updatedCount++;
        }
      }
    }

    // 2. Process recent live sales
    if (saleEventsRes?.asset_events) {
      for (const ev of saleEventsRes.asset_events) {
        const id = parseInt(ev.asset?.identifier || ev.nft?.identifier, 10);
        if (!id) continue;
        const target = allItems.find(i => i.id === id);
        if (target) {
          const dec = ev.payment?.decimals || 18;
          const price = ev.payment?.quantity ? (Number(ev.payment.quantity) / Math.pow(10, dec)) : 0;
          const ts = (ev.event_timestamp || 0) * 1000;
          target.recentlySold = true;
          if (!target.lastSaleTimestamp || ts > target.lastSaleTimestamp) {
            target.lastSaleTimestamp = ts;
            target.lastSalePrice = price;
            target.lastSaleCurrency = ev.payment?.symbol || 'WETH';
          }
          updatedCount++;
        }
      }
    }

    // 3. Process live best floor listings
    if (bestListingsRes?.listings) {
      for (const l of bestListingsRes.listings) {
        const offer = l.protocol_data?.parameters?.offer?.[0];
        const id = parseInt(offer?.identifierOrCriteria, 10);
        if (!id) continue;
        const target = allItems.find(i => i.id === id);
        if (target) {
          const dec = l.price?.current?.decimals != null ? l.price.current.decimals : 18;
          const totalVal = l.price?.current?.value ? (Number(l.price.current.value) / Math.pow(10, dec)) : 0;
          const startAmount = Number(offer?.startAmount || '1');
          const unitPrice = startAmount > 1 ? totalVal / startAmount : totalVal;
          if (unitPrice > 0) {
            target.unlisted = false;
            target.rawPrice = unitPrice;
            target.floorPrice = unitPrice;
            target.currency = l.price?.current?.currency || 'WETH';
          }
          updatedCount++;
        }
      }
    }

    if (updatedCount > 0) {
      computeClientStats(allItems, 'OpenSea Live API v2 (Real-Time)', new Date(), flowerUsdcRate);
      applyFiltersAndSort();
      console.log(`⚡ Live OpenSea API updated ${updatedCount} items in real-time!`);
    }
  } catch (err) {
    console.warn('Live OpenSea API fetch notice:', err.message);
  }
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
    syncStatusText.textContent = 'Syncing data feeds (Prices, Exchange, In-Game)...';
  }
  if (syncDot) {
    syncDot.className = 'w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping';
  }

  try {
    const timestamp = Date.now();

    // 1. Concurrently fetch all 3 data feeds + live DEX rate
    const [pricesRes, exchangeRes, inGameRes, dexRes] = await Promise.allSettled([
      fetch(`./data/prices.json?v=${timestamp}`).then(r => r.ok ? r.json() : null),
      fetch(`./data/exchange.json?v=${timestamp}`).then(r => r.ok ? r.json() : null),
      fetch(`./data/ingame_nfts.json?v=${timestamp}`).then(r => r.ok ? r.json() : null),
      fetch('https://api.dexscreener.com/latest/dex/tokens/0xD1f9c58e33933a993A3891F8acFe05a68E1afC05').then(r => r.ok ? r.json() : null).catch(() => null)
    ]);

    const pricesData = pricesRes.status === 'fulfilled' ? pricesRes.value : null;
    const exchangeData = exchangeRes.status === 'fulfilled' ? exchangeRes.value : null;
    const inGameData = inGameRes.status === 'fulfilled' ? inGameRes.value : null;
    const dexData = dexRes.status === 'fulfilled' ? dexRes.value : null;

    // 2. Parse live Flower / SFL token exchange rate
    let freshRate = null;
    if (dexData?.pairs && dexData.pairs.length > 0) {
      const bestPair = dexData.pairs.find(p => p.priceUsd && Number(p.priceUsd) > 0);
      if (bestPair) {
        freshRate = parseFloat(bestPair.priceUsd);
      }
    }
    if (!freshRate && exchangeData) {
      const sflRate = exchangeData.sfl?.usd || exchangeData.data?.sfl?.usd;
      if (sflRate && Number(sflRate) > 0) {
        freshRate = Number(sflRate);
      }
    }
    if (!freshRate && pricesData?.flowerUsdcRate) {
      freshRate = pricesData.flowerUsdcRate;
    }
    if (freshRate && freshRate > 0) {
      flowerUsdcRate = freshRate;
      if (statFlowerRate) {
        statFlowerRate.textContent = '$' + flowerUsdcRate.toFixed(4);
      }
    }

    // 3. Parse In-Game marketplace items
    const inGameMap = new Map();
    if (inGameData) {
      const list = inGameData.collectibles || inGameData.data || (Array.isArray(inGameData) ? inGameData : []);
      for (const item of list) {
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
    }

    // 4. Update Catalog with prices.json or memory fallback
    if (pricesData && Array.isArray(pricesData.items) && pricesData.items.length > 0) {
      allItems = pricesData.items;
    } else if (!allItems.length && window.INITIAL_COLLECTIBLES_DATA?.items) {
      allItems = window.INITIAL_COLLECTIBLES_DATA.items;
    }

    if (!allItems.length) {
      throw new Error('Could not load collectible prices from data feeds.');
    }

    // 5. Merge In-Game data & live exchange rates into allItems
    for (const item of allItems) {
      const inGameInfo = inGameMap.get(item.id);
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
      } else if (item.inGameFloor && flowerUsdcRate) {
        item.inGameFloorUsdc = Number((item.inGameFloor * flowerUsdcRate).toFixed(4));
      }
    }

    totalCountEl.textContent = allItems.length;
    computeClientStats(allItems, 'Auto-Synced (Prices, Exchange & In-Game)', pricesData?.lastUpdated || new Date(), flowerUsdcRate);
    applyFiltersAndSort();

    // 6. Concurrently trigger live OpenSea API updates (real-time events & best listings)
    fetchLiveOpenSeaUpdates().catch(err => console.warn('OpenSea live update notice:', err));

    // 7. Update UI sync status
    if (syncStatusText) {
      syncStatusText.textContent = 'Auto-Synced (Prices, Exchange & In-Game)';
    }
    if (syncDot) {
      syncDot.className = 'w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse';
    }
    errorState.classList.add('hidden');
    console.log(`✅ Auto-synced 3 feeds: prices.json (${allItems.length} items), exchange.json ($${flowerUsdcRate.toFixed(4)}), ingame_nfts.json (${inGameMap.size} items)`);
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
function applyFiltersAndSort() {
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
  if (currentFilter === 'recently-listed') {
    result = result.filter(item => item.recentlyListed);
  } else if (currentFilter === 'recently-sold') {
    result = result.filter(item => item.recentlySold);
  } else if (currentFilter === 'ingame') {
    result = result.filter(item => item.inGameFloor && item.inGameFloor > 0);
  } else if (currentFilter === 'boost') {
    result = result.filter(item => item.haveBoost);
  } else if (currentFilter === 'cosmetic') {
    result = result.filter(item => !item.haveBoost);
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
  if (currentSort === 'recently_listed') {
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

  renderItems();
}

/**
 * Render items in current view mode
 */
function renderItems() {
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

    const statusPill = isListed
      ? `<span class="inline-flex items-center space-x-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20">
          <span class="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse"></span>
          <span>OS Listed</span>
        </span>`
      : `<span class="px-2 py-0.5 rounded-md text-[10px] font-medium bg-slate-800 text-slate-500 border border-slate-700/40">
          OS Unlisted
        </span>`;

    const recentSaleBadge = item.recentlySold
      ? `<span class="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30">
          <span>🔥 Sold</span>
        </span>`
      : '';

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
              ${recentSaleBadge}
              ${statusPill}
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
        <div class="space-y-2.5 pt-2 border-t border-slate-800/80">
          <div class="grid grid-cols-2 gap-2">
            <!-- OpenSea Floor -->
            <div class="bg-slate-950/70 p-2.5 rounded-xl border border-slate-800/60 flex flex-col justify-between">
              <div>
                <div class="flex items-center space-x-1 mb-1">
                  <span class="w-1.5 h-1.5 rounded-full bg-blue-400"></span>
                  <span class="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">OpenSea</span>
                </div>
                <div class="text-xs font-black ${isListed ? 'text-amber-400' : 'text-slate-500'} tracking-tight">
                  ${priceDisplay} ${isListed ? `<span class="text-[9px] font-bold text-blue-400">${currency}</span>` : ''}
                </div>
              </div>
              ${usdDisplay ? `<span class="text-[10px] text-slate-500 font-mono mt-0.5">${usdDisplay}</span>` : '<span class="text-[10px] text-slate-600 block mt-0.5">-</span>'}
            </div>

            <!-- In-Game Floor (FLOWER + USDC) -->
            <div class="bg-slate-950/70 p-2.5 rounded-xl border ${hasInGame ? 'border-pink-500/30 bg-pink-950/10' : 'border-slate-800/60'} flex flex-col justify-between">
              <div>
                <div class="flex items-center space-x-1 mb-1">
                  <span class="text-[10px]">🌸</span>
                  <span class="text-[10px] ${hasInGame ? 'text-pink-300 font-semibold' : 'text-slate-400 font-semibold'} uppercase tracking-wider">In-Game</span>
                </div>
                <div class="text-xs font-black ${hasInGame ? 'text-pink-400' : 'text-slate-500'} tracking-tight">
                  ${inGamePriceDisplay} ${hasInGame ? `<span class="text-[9px] font-bold text-pink-300/80">SFL</span>` : ''}
                </div>
              </div>
              ${inGameUsdcDisplay ? `<span class="text-[10px] text-emerald-400 font-mono font-medium mt-0.5">${inGameUsdcDisplay}</span>` : '<span class="text-[10px] text-slate-600 block mt-0.5">-</span>'}
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
             class="w-full mt-1 inline-flex items-center justify-center space-x-1.5 py-2 rounded-xl text-xs font-semibold bg-blue-600/20 hover:bg-blue-600 text-blue-300 hover:text-white border border-blue-500/30 hover:border-blue-500 transition shadow-sm group-hover:shadow-blue-500/20">
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

    const recentSaleBadge = item.recentlySold
      ? `<span class="ml-1.5 inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30">🔥 Sold</span>`
      : '';

    const listedAgo = item.lastListedTimestamp ? formatTimeAgo(item.lastListedTimestamp) : '';
    const recentListedBadge = item.recentlyListed
      ? `<span class="ml-1.5 inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-sky-500/15 text-sky-300 border border-sky-500/30" title="Listed ${listedAgo || 'recently'} on OpenSea">⚡ Listed ${listedAgo ? `(${listedAgo})` : ''}</span>`
      : '';

    return `
      <tr class="hover:bg-slate-800/40 transition">
        <td class="py-3 px-4 font-mono text-slate-400 font-semibold">#${item.id}</td>
        <td class="py-3 px-4 font-bold text-white">
          <div class="flex items-center flex-wrap gap-1">
            <span>${item.name}</span>
            ${recentListedBadge}
            ${recentSaleBadge}
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
          ${usdDisplay && isListed ? `<span class="text-[10px] text-slate-500 font-mono block">${usdDisplay}</span>` : ''}
        </td>
        <!-- In-Game Floor (FLOWER + USDC) -->
        <td class="py-3 px-4 text-right">
          <div>
            <span class="font-extrabold ${hasInGame ? 'text-pink-400' : 'text-slate-500'}">${inGamePriceDisplay}</span>
            ${hasInGame ? `<span class="text-[10px] text-pink-300/80 font-bold ml-0.5">SFL</span>` : ''}
          </div>
          ${inGameUsdcDisplay && hasInGame ? `<span class="text-[10px] text-emerald-400 font-mono block font-medium">${inGameUsdcDisplay}</span>` : ''}
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
             class="inline-flex items-center space-x-1 px-2.5 py-1 rounded-lg text-[11px] font-medium bg-blue-600/10 text-blue-400 hover:bg-blue-600 hover:text-white border border-blue-500/20 transition">
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
    applyFiltersAndSort();
  });
});

// Sort select
sortSelect.addEventListener('change', (e) => {
  currentSort = e.target.value;
  applyFiltersAndSort();
});

// View mode toggle
viewGridBtn.addEventListener('click', () => {
  currentView = 'grid';
  viewGridBtn.classList.add('bg-slate-800', 'text-amber-400');
  viewGridBtn.classList.remove('text-slate-400');
  viewTableBtn.classList.remove('bg-slate-800', 'text-amber-400');
  viewTableBtn.classList.add('text-slate-400');
  renderItems();
});

viewTableBtn.addEventListener('click', () => {
  currentView = 'table';
  viewTableBtn.classList.add('bg-slate-800', 'text-amber-400');
  viewTableBtn.classList.remove('text-slate-400');
  viewGridBtn.classList.remove('bg-slate-800', 'text-amber-400');
  viewGridBtn.classList.add('text-slate-400');
  renderItems();
});

// Refresh button
refreshBtn.addEventListener('click', () => {
  loadData(true);
});

// Reset filters
resetFiltersBtn.addEventListener('click', () => {
  searchInput.value = '';
  currentSearch = '';
  clearSearchBtn.classList.add('hidden');
  document.querySelectorAll('.filter-pill').forEach(b => b.classList.remove('active'));
  document.querySelector('[data-filter="all"]').classList.add('active');
  currentFilter = 'all';
  currentSort = 'price_asc';
  sortSelect.value = 'price_asc';
  applyFiltersAndSort();
});

// Settings Modal
openSettingsBtn.addEventListener('click', () => {
  openseaApiKeyInput.value = customApiKey;
  settingsModal.classList.remove('hidden');
});

closeSettingsBtn.addEventListener('click', () => {
  settingsModal.classList.add('hidden');
});

cancelSettingsBtn.addEventListener('click', () => {
  settingsModal.classList.add('hidden');
});

saveSettingsBtn.addEventListener('click', async () => {
  const apiKey = openseaApiKeyInput.value.trim();
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
  loadData(true);
});

// Keyboard shortcuts
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !settingsModal.classList.contains('hidden')) {
    settingsModal.classList.add('hidden');
  }
  if (e.key === '/' && document.activeElement !== searchInput) {
    e.preventDefault();
    searchInput.focus();
  }
});

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
  if (window.lucide) {
    lucide.createIcons();
  }

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

  // 3. Keep syncing periodically in the background every 60 seconds
  setInterval(() => {
    syncAllDataOnWebOpen(false);
  }, 60000);
});
