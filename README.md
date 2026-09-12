# 🌻 Sunflower Land Price Tracker (OpenSea & In-Game Marketplace)

A high-performance live web dashboard to track, compare, and analyze all item prices across both **OpenSea** (WETH) and the **Sunflower Land In-Game Marketplace** (🌸 FLOWER / SFL converted to USDC).

👉 **Live Dashboard**: [https://kuro-txt.github.io/sunflower-land-opensea-price-tracker/](https://kuro-txt.github.io/sunflower-land-opensea-price-tracker/)

![OpenSea](https://img.shields.io/badge/OpenSea-Collection-blue?logo=opensea)
![Polygon](https://img.shields.io/badge/Network-Polygon-8247E5?logo=polygon)
![Hosting](https://img.shields.io/badge/Hosted%20On-GitHub%20Pages-brightgreen)
![License](https://img.shields.io/badge/License-MIT-green)

---

## ✨ Features

- **🌸 Side-by-Side Marketplace Comparison**:
  - **OpenSea Floor**: Real-time lowest active listing in WETH with estimated USD value.
  - **In-Game Floor**: Real-time lowest price in Flower Token (SFL) converted to USDC using live exchange rates.
- **⚡ Recently Listed Filter**:
  - Direct integration with OpenSea Events API (`event_type=listing`) to surface the newest listings with relative timestamps (e.g. `⚡ Listed (2h ago)`).
- **🔥 Recently Sold Tracking**:
  - OpenSea sale events (`event_type=sale`) showing the last transaction price and date.
- **📋 1,477 Item Official Catalog**:
  - Mapped directly with Sunflower Land's official game repository (`KNOWN_IDS`) across crops, resources, tools, buildings, collectibles, and wearables.
- **🔍 Instant Filter & Search**:
  - Search by official name, numeric ID (e.g. `603` or `#603`), or gameplay perk keyword.
  - Filter pills: *Recently Listed*, *Recently Sold*, *In-Game Listed*, *With Boosts*, *Cosmetic Only*, and price tier filters.
- **📱 Dual View Modes**:
  - **Grid View**: Clean cards with dual price containers and direct OpenSea buy buttons.
  - **Table View**: High-density financial table with dedicated in-game floor columns.

---

## 🏗️ Clean Project Structure

```
├── index.html                    # Main web dashboard interface
├── app.js                        # Frontend app logic & real-time client-side price fetchers
├── styles.css                    # Dashboard styling & Tailwind utilities
├── data.js                       # Pre-bundled instant loading dataset
├── data/
│   ├── prices.json               # Full catalog with floor prices & metadata
│   ├── exchange.json             # Live SFL/Flower token exchange rate
│   └── ingame_nfts.json          # SFL In-game marketplace items
├── scripts/
│   ├── update-prices.js          # Unified, clean script to fetch fresh OpenSea + In-Game prices
│   ├── create-github-repo.js     # GitHub publisher and repository synchronizer
│   └── known_ids.json            # 1,476 item names & metadata from Sunflower Land repo
├── .github/
│   └── workflows/
│       └── update-prices.yml     # Automated GitHub Action to refresh prices on schedule
├── .env.example                  # Clean configuration template
├── .gitignore                    # Standard Node.js & local file ignores
├── .nojekyll                     # GitHub Pages bypass
├── package.json                  # Minimal dependencies & run scripts
└── README.md                     # Clean, professional documentation
```

---

## ⚡ Fetching Fresh Prices

### Option 1: Automatic Scheduled Updates (GitHub Actions)
The repository includes `.github/workflows/update-prices.yml` which automatically fetches fresh prices and commits the latest catalog:
- **Hourly Cron**: Automatically executes every hour in the cloud.
- **Manual Trigger**: Navigate to your GitHub repository's **Actions** tab → **Update Collectibles Prices** → click **Run workflow**.

### Option 2: Local CLI Update
To fetch fresh prices from OpenSea and the in-game market manually:
```bash
npm run update-prices
```

---

## 📜 Contract Details
- **Contract Address**: `0x22d5f9b75c524fec1d6619787e582644cd4d7422`
- **Network**: Polygon
- **Token Standard**: ERC-1155 Multi-Token Standard
- **OpenSea Collection**: [sunflower-land-collectibles](https://opensea.io/collection/sunflower-land-collectibles)

---

## 📄 License
MIT License
