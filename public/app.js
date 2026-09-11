// Sunflower Land OpenSea Price Tracker Client Application
// Supports both Static GitHub Pages and Node.js Server environments

let allItems = [];
let filteredItems = [];
let currentFilter = 'all';
let currentSearch = '';
let currentSort = 'price_asc';
let currentView = 'grid'; // 'grid' or 'table'
let isLoading = false;
let customApiKey = localStorage.getItem('opensea_api_key') || '';

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
const statTotalItems = document.getElementById('statTotalItems');
const statBoostCount = document.getElementById('statBoostCount');
const statMedian = document.getElementById('statMedian');
const statAvg = document.getElementById('statAvg');
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
 * Format currency number
 */
function formatNumber(num, decimals = 3) {
  if (num === null || num === undefined || isNaN(num)) return '0';
  if (num === 0) return '0';
  if (num < 0.001) return '<0.001';
  return Number(num).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals
  });
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
function computeClientStats(items, provider = 'GitHub Pages Data', lastUpdated = new Date()) {
  const prices = items.map(i => i.floorPrice).filter(p => p > 0);
  const minPrice = prices.length ? Math.min(...prices) : 0;
  const maxPrice = prices.length ? Math.max(...prices) : 0;
  const avgPrice = prices.length ? prices.reduce((a, b) => a + b, 0) / prices.length : 0;
  const sortedPrices = [...prices].sort((a, b) => a - b);
  const medianPrice = sortedPrices.length ? sortedPrices[Math.floor(sortedPrices.length / 2)] : 0;
  const boostCount = items.filter(i => i.haveBoost).length;

  statFloor.textContent = formatNumber(minPrice, 3);
  statTotalItems.textContent = items.length;
  statBoostCount.textContent = boostCount;
  statMedian.textContent = formatNumber(medianPrice, 2);
  statAvg.textContent = formatNumber(avgPrice, 2);
  statProvider.textContent = provider;

  const time = new Date(lastUpdated);
  statLastUpdated.textContent = isNaN(time.getTime()) ? 'Just now' : time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/**
 * Fetch stats from backend if running with server, otherwise compute client-side
 */
async function loadStats() {
  try {
    const res = await fetch('/api/stats');
    if (res.ok) {
      const data = await res.json();
      if (data.success) {
        statFloor.textContent = formatNumber(data.collectionFloor, 3);
        statTotalItems.textContent = data.totalTrackedItems;
        statBoostCount.textContent = data.boostItemsCount;
        statMedian.textContent = formatNumber(data.medianPrice, 2);
        statAvg.textContent = formatNumber(data.averagePrice, 2);
        statProvider.textContent = data.provider || 'Live Market';
        const time = new Date(data.lastUpdated);
        statLastUpdated.textContent = time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        return;
      }
    }
  } catch {
    // Backend not available (running statically on GitHub Pages)
  }
  computeClientStats(allItems);
}

/**
 * Smart data fetcher:
 * 1. Tries local backend `/api/prices` if running on Node server.
 * 2. If static (GitHub Pages): loads `./data/prices.json`.
 * 3. On explicit refresh: also tries live market feed / CORS proxy.
 */
async function loadData(forceRefresh = false) {
  showLoading(true);
  try {
    let loaded = false;
    let data = null;

    // 1. Try local server API first
    try {
      const url = `/api/prices${forceRefresh ? '?refresh=true' : ''}`;
      const res = await fetch(url);
      if (res.ok) {
        data = await res.json();
        if (data && data.success && data.items) {
          loaded = true;
          allItems = data.items;
          statProvider.textContent = data.provider || 'Live API Server';
        }
      }
    } catch {
      // Local backend not present, running on static GitHub Pages
    }

    // 2. If running statically on GitHub Pages or force refresh:
    if (!loaded) {
      // If user has set an OpenSea API Key and clicked refresh, try OpenSea v2 via CORS proxy
      if (forceRefresh && customApiKey) {
        try {
          const targetUrl = encodeURIComponent('https://api.opensea.io/api/v2/listings/collection/sunflower-land-collectibles/best?limit=100');
          const proxyRes = await fetch(`https://api.allorigins.win/raw?url=${targetUrl}`, {
            headers: { 'x-api-key': customApiKey }
          });
          if (proxyRes.ok) {
            const osData = await proxyRes.json();
            if (osData && osData.listings) {
              const CONTRACT = '0x22d5f9b7337a28424268307d08405d4f4cd4d742';
              allItems = osData.listings.map(l => {
                const priceVal = l.price?.current ? parseFloat(l.price.current.value) / Math.pow(10, l.price.current.decimals || 18) : 0;
                const id = l.protocol_data?.parameters?.offer?.[0]?.identifierOrCriteria || '0';
                return {
                  id: parseInt(id, 10) || id,
                  name: `Sunflower Land #${id}`,
                  floorPrice: priceVal,
                  lastSalePrice: 0,
                  supply: 1,
                  haveBoost: false,
                  boostText: '',
                  openseaUrl: `https://opensea.io/assets/matic/${CONTRACT}/${id}`
                };
              });
              loaded = true;
              computeClientStats(allItems, 'OpenSea v2 API (Direct)');
            }
          }
        } catch (e) {
          console.warn('Direct OpenSea proxy failed, falling back to static snapshot:', e);
        }
      }

      // Load static data/prices.json
      if (!loaded) {
        const pathsToTry = ['./data/prices.json', 'data/prices.json', '/data/prices.json'];
        for (const p of pathsToTry) {
          try {
            const res = await fetch(p + '?v=' + Date.now());
            if (res.ok) {
              data = await res.json();
              if (data && data.items) {
                allItems = data.items;
                loaded = true;
                computeClientStats(allItems, data.provider || 'GitHub Pages Feed', data.lastUpdated);
                break;
              }
            }
          } catch {
            // try next path
          }
        }
      }
    }

    if (!loaded || !allItems.length) {
      throw new Error('Unable to load collectibles data. Check internet connection or CORS settings.');
    }

    totalCountEl.textContent = allItems.length;
    applyFiltersAndSort();
  } catch (err) {
    console.error('Error loading data:', err);
    errorState.classList.remove('hidden');
    document.getElementById('errorMessage').textContent = err.message;
  } finally {
    showLoading(false);
  }
}

/**
 * Filter & Sort items locally
 */
function applyFiltersAndSort() {
  let result = [...allItems];

  // 1. Text Search Filter
  if (currentSearch) {
    const q = currentSearch.toLowerCase();
    result = result.filter(item => 
      item.name.toLowerCase().includes(q) || 
      String(item.id).includes(q) ||
      (item.boostText && item.boostText.toLowerCase().includes(q))
    );
  }

  // 2. Category Filter
  if (currentFilter === 'boost') {
    result = result.filter(item => item.haveBoost);
  } else if (currentFilter === 'cosmetic') {
    result = result.filter(item => !item.haveBoost);
  } else if (currentFilter === 'tier-cheap') {
    result = result.filter(item => item.floorPrice < 1);
  } else if (currentFilter === 'tier-mid') {
    result = result.filter(item => item.floorPrice >= 1 && item.floorPrice <= 10);
  } else if (currentFilter === 'tier-high') {
    result = result.filter(item => item.floorPrice > 10);
  }

  // 3. Sorting
  if (currentSort === 'price_asc') {
    result.sort((a, b) => a.floorPrice - b.floorPrice);
  } else if (currentSort === 'price_desc') {
    result.sort((a, b) => b.floorPrice - a.floorPrice);
  } else if (currentSort === 'last_sale_desc') {
    result.sort((a, b) => b.lastSalePrice - a.lastSalePrice);
  } else if (currentSort === 'supply_desc') {
    result.sort((a, b) => b.supply - a.supply);
  } else if (currentSort === 'supply_asc') {
    result.sort((a, b) => a.supply - b.supply);
  } else if (currentSort === 'name_asc') {
    result.sort((a, b) => a.name.localeCompare(b.name));
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
    const boostBadge = item.haveBoost
      ? `<span class="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" title="${item.boostText}">
          <span>⚡ Boost</span>
        </span>`
      : `<span class="px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-800 text-slate-400 border border-slate-700/50">
          🎨 Cosmetic
        </span>`;

    const boostDetail = item.haveBoost && item.boostText
      ? `<p class="text-[11px] text-emerald-300/90 line-clamp-1 bg-emerald-950/40 px-2 py-1 rounded-lg border border-emerald-900/30" title="${item.boostText}">
          ${item.boostText}
        </p>`
      : '';

    return `
      <div class="collectible-card bg-slate-900/90 border border-slate-800/90 rounded-2xl p-4 flex flex-col justify-between space-y-3 relative group">
        <div>
          <!-- Header: ID + Badge -->
          <div class="flex items-center justify-between mb-2">
            <span class="font-mono text-[11px] text-slate-400 font-semibold bg-slate-950 px-2 py-0.5 rounded-md border border-slate-800">
              #${item.id}
            </span>
            ${boostBadge}
          </div>

          <!-- Name -->
          <h4 class="font-bold text-sm text-white group-hover:text-amber-400 transition line-clamp-1" title="${item.name}">
            ${item.name}
          </h4>

          <!-- Boost Details if present -->
          ${boostDetail ? `<div class="mt-2">${boostDetail}</div>` : ''}
        </div>

        <!-- Pricing & Stats Area -->
        <div class="space-y-2.5 pt-2 border-t border-slate-800/80">
          <!-- Floor Price Row -->
          <div class="flex items-baseline justify-between bg-slate-950/60 p-2.5 rounded-xl border border-slate-800/50">
            <span class="text-[11px] text-slate-400 font-medium">Floor Price</span>
            <div class="text-right">
              <span class="text-base font-black text-amber-400 tracking-tight">${formatNumber(item.floorPrice)}</span>
              <span class="text-[10px] font-bold text-amber-500">POL</span>
            </div>
          </div>

          <!-- Extra Metrics -->
          <div class="flex items-center justify-between text-[11px] text-slate-400 px-1">
            <span>Last Sale: <strong class="text-slate-200">${item.lastSalePrice > 0 ? formatNumber(item.lastSalePrice) + ' POL' : 'None'}</strong></span>
            <span>Supply: <strong class="text-slate-200">${item.supply.toLocaleString()}</strong></span>
          </div>

          <!-- OpenSea Action Button -->
          <a href="${item.openseaUrl}" target="_blank" rel="noopener noreferrer" 
             class="w-full mt-1 inline-flex items-center justify-center space-x-1.5 py-2 rounded-xl text-xs font-semibold bg-blue-600/20 hover:bg-blue-600 text-blue-300 hover:text-white border border-blue-500/30 hover:border-blue-500 transition shadow-sm group-hover:shadow-blue-500/20">
            <i data-lucide="external-link" class="w-3.5 h-3.5"></i>
            <span>View on OpenSea</span>
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
    const boostBadge = item.haveBoost
      ? `<span class="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" title="${item.boostText}">
          <span>⚡ Boost</span>
        </span>`
      : `<span class="px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-800 text-slate-400">
          Cosmetic
        </span>`;

    return `
      <tr class="hover:bg-slate-800/40 transition">
        <td class="py-3 px-4 font-mono text-slate-400 font-semibold">#${item.id}</td>
        <td class="py-3 px-4 font-bold text-white">${item.name}</td>
        <td class="py-3 px-4">
          <div class="flex items-center space-x-2">
            ${boostBadge}
            ${item.boostText ? `<span class="text-[11px] text-slate-400 truncate max-w-xs" title="${item.boostText}">${item.boostText}</span>` : ''}
          </div>
        </td>
        <td class="py-3 px-4 text-right">
          <span class="font-extrabold text-amber-400">${formatNumber(item.floorPrice)}</span>
          <span class="text-[10px] text-amber-500 font-bold">POL</span>
        </td>
        <td class="py-3 px-4 text-right text-slate-300">
          ${item.lastSalePrice > 0 ? formatNumber(item.lastSalePrice) + ' POL' : '-'}
        </td>
        <td class="py-3 px-4 text-right text-slate-300 font-mono">
          ${item.supply.toLocaleString()}
        </td>
        <td class="py-3 px-4 text-center">
          <a href="${item.openseaUrl}" target="_blank" rel="noopener noreferrer" 
             class="inline-flex items-center space-x-1 px-2.5 py-1 rounded-lg text-[11px] font-medium bg-blue-600/10 text-blue-400 hover:bg-blue-600 hover:text-white border border-blue-500/20 transition">
            <i data-lucide="external-link" class="w-3 h-3"></i>
            <span>OpenSea</span>
          </a>
        </td>
      </tr>
    `;
  }).join('');
}

// Event Listeners

// Search input
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

// Category pills
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

// View switchers
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

// Reset filters button
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

  // Also notify local server if available
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
  loadData(false);
});
