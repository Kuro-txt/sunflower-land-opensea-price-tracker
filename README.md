# 🌻 Sunflower Land Price Tracker & Arbitrage Scanner

[![Live Dashboard](https://img.shields.io/badge/Live%20Dashboard-GitHub%20Pages-brightgreen?logo=github-pages)](https://kuro-txt.github.io/sunflower-land-opensea-price-tracker/)
[![Network](https://img.shields.io/badge/Network-Polygon%20PoS-8247E5?logo=polygon)](https://polygonscan.com/address/0x22d5f9b75c524fec1d6619787e582644cd4d7422)
[![OpenSea](https://img.shields.io/badge/Marketplace-OpenSea-blue?logo=opensea)](https://opensea.io/collection/sunflower-land-collectibles)
[![License](https://img.shields.io/badge/License-MIT-success)](LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://github.com/Kuro-txt/sunflower-land-opensea-price-tracker/pulls)

A high-performance, real-time analytics dashboard and arbitrage scanner comparing **Sunflower Land In-Game Marketplace** prices against **OpenSea floor listings** for all 1,476+ official collectibles, wearables, resources, and boosts.

👉 **Launch Web App**: [https://kuro-txt.github.io/sunflower-land-opensea-price-tracker/](https://kuro-txt.github.io/sunflower-land-opensea-price-tracker/)

---

## 📑 Table of Contents
- [Overview](#-overview)
- [Key Features](#-key-features)
- [Arbitrage Formula](#-arbitrage-formula)
- [Repository Structure](#-repository-structure)
- [Quick Start & Local Development](#-quick-start--local-development)
- [Data Synchronization](#-data-synchronization)
- [Automated GitHub Actions](#-automated-github-actions)
- [Smart Contract Reference](#-smart-contract-reference)
- [Contributing](#-contributing)
- [License](#-license)

---

## 🌟 Overview

Sunflower Land players frequently trade assets across two distinct marketplaces:
1. **The In-Game Marketplace**: Denominated in Flower Token (**SFL**), with an integrated 10% trading fee.
2. **OpenSea (Polygon)**: Denominated in Wrapped Ethereum (**WETH**), subject to standard network fees.

Due to independent liquidity pools and currency denominations, significant price discrepancies (arbitrage spreads) often emerge between in-game SFL prices and OpenSea secondary listings. This dashboard bridges that gap by normalizing all prices to both USD and SFL in real time, calculating net margins after game fees, and instantly flagging profitable trading opportunities.

---

## ⚡ Key Features

- **📊 Instant Arbitrage / Price Difference Sorting**:
  - Automatically compares in-game net proceeds against the OpenSea floor equivalent.
  - Highlights positive spreads where in-game value exceeds OpenSea purchase cost.
- **⚡ Live On-Demand OpenSea Verification**:
  - Live client-side query verifies the exact active floor directly against OpenSea's NFT listing API (`/nfts/{id}/best`).
  - Filters out micro-dust listings, fractional spam, and stale off-chain signatures.
  - Automatically handles 18-decimal resources vs. 0-decimal collectible units.
- **🌸 Real-Time SFL/USDC Exchange Rate Syncer**:
  - Directly syncs with official exchange tickers (`https://sfl.world/api/v1.1/exchange`).
  - High-resilience client fallback proxy ensures rates update even behind restrictive CORS environments.
- **🎛️ Multi-Faceted Filters & Fast Search**:
  - **Filter Pills**: `📊 Price Diff`, `⚡ With Boosts`, `✨ Without Boosts (Cosmetic)`, `🏪 In-Game Listed`, `🌊 OpenSea Listed`.
  - **Instant Search**: Match by token name, exact token ID (e.g. `603` or `#603`), or in-game perk description (e.g. `+0.1 Wheat`, `Speed`).
- **💾 LocalStorage State Persistence**:
  - Remembers your active filters, search keywords, sort preferences, and layout mode between page reloads.
- **📱 Responsive Dual View**:
  - **Card Grid View**: Rich visual presentation with artwork, perk badges, and side-by-side pricing containers.
  - **High-Density Table View**: Financial tabular layout designed for fast multi-item arbitrage comparison.

---

## 🧮 Arbitrage Formula

$$\text{Price Difference (SFL)} = \text{In-Game Net Floor} - \text{OpenSea In-Game Equivalent}$$

Where:
- $\text{In-Game Net Floor} = \text{In-Game Listing} \times 0.90$ (accounting for the 10% in-game marketplace fee)
- $\text{OpenSea In-Game Equivalent} = \frac{\text{OpenSea Floor (WETH)} \times \text{ETH Price (USD)}}{\text{SFL Price (USD)}}$

A **positive difference** ($> 0$) indicates that selling the asset on the in-game market yields higher net SFL than purchasing it on OpenSea.

---

## 🏗️ Repository Structure

```
sunflower-land-opensea-price-tracker/
├── .github/
│   ├── ISSUE_TEMPLATE/
│   │   ├── bug_report.md             # Issue template for bugs & discrepancies
│   │   └── feature_request.md        # Issue template for feature requests
│   ├── workflows/
│   │   └── update-prices.yml         # Scheduled GitHub Action (hourly catalog sync)
│   ├── dependabot.yml                # Automated dependency vulnerability updates
│   └── PULL_REQUEST_TEMPLATE.md      # Template for contributions & PRs
├── data/
│   ├── exchange.json                 # Cached SFL/USDC & ETH/USD exchange rates
│   ├── ingame_nfts.json              # Cached Sunflower Land in-game listings
│   └── prices.json                   # Consolidated catalog with verified prices & perks
├── scripts/
│   ├── create-github-repo.js         # Git-free sync & deployment engine via GitHub API
│   ├── known_ids.json                # 1,476 item definitions mapped to official game IDs
│   └── update-prices.js              # Production updater script (OpenSea + In-Game)
├── .env.example                      # Configuration template for API keys & contract details
├── .gitignore                        # Comprehensive ignore rules for Node, OS & IDEs
├── .nojekyll                         # Enables raw GitHub Pages asset serving
├── app.js                            # Frontend application engine & live price verifiers
├── data.js                           # Pre-bundled dataset for instant first-paint rendering
├── index.html                        # Main web application layout
├── LICENSE                           # Official MIT License
├── package.json                      # Project metadata, dependencies & run scripts
├── README.md                         # Project documentation
└── styles.css                        # Custom styling & Tailwind CSS extensions
```

---

## 💻 Quick Start & Local Development

### Prerequisites
- [Node.js](https://nodejs.org/) v18 or higher
- (Optional) OpenSea API Key for unlimited rate limits during bulk data rebuilds

### 1. Clone Repository
```bash
git clone https://github.com/Kuro-txt/sunflower-land-opensea-price-tracker.git
cd sunflower-land-opensea-price-tracker
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Launch Local Server
```bash
npm start
```
Then open `http://localhost:3000` (or `http://localhost:5000`) in your browser.

---

## 🔄 Data Synchronization

### Rebuilding Price Data Locally
To fetch the latest listings across both OpenSea and the Sunflower Land marketplace:
```bash
npm run update-prices
```
This script will:
1. Read `scripts/known_ids.json` (1,476 items).
2. Fetch current in-game listings from the official Sunflower Land API.
3. Query the latest exchange rates for SFL and WETH.
4. Verify active OpenSea floor listings.
5. Generate `data/prices.json`, `data/exchange.json`, `data/ingame_nfts.json`, and pre-bundled `data.js`.

### Synchronizing to GitHub
To commit and deploy all local updates directly to GitHub Pages (even on machines without `git` CLI installed):
```bash
npm run sync <YOUR_GITHUB_TOKEN>
```

---

## 🤖 Automated GitHub Actions

The repository includes an automated workflow at [`.github/workflows/update-prices.yml`](.github/workflows/update-prices.yml):
- **Hourly Cron**: Executes at minute 0 of every hour to keep prices current.
- **Manual Trigger**: Go to **Actions** → **Update Collectibles Prices** → **Run workflow**.

> **Note**: To enable workflow write commits in your fork, ensure your repository has **Workflow permissions** set to *Read and write permissions* under **Settings** → **Actions** → **General**.

---

## 📜 Smart Contract Reference

| Contract | Network | Address |
|---|---|---|
| **Sunflower Land Collectibles (ERC-1155)** | Polygon PoS | [`0x22d5f9b75c524fec1d6619787e582644cd4d7422`](https://polygonscan.com/address/0x22d5f9b75c524fec1d6619787e582644cd4d7422) |
| **Sunflower Land Token (SFL ERC-20)** | Polygon PoS | [`0xd1f9c58e33933a99703feec371ac053e14195155`](https://polygonscan.com/address/0xd1f9c58e33933a99703feec371ac053e14195155) |
| **Wrapped Ether (WETH ERC-20)** | Polygon PoS | [`0x7ceb23fd6bc0add59e62ac25578270cff1b9f619`](https://polygonscan.com/address/0x7ceb23fd6bc0add59e62ac25578270cff1b9f619) |

---

## 🤝 Contributing

Contributions, bug reports, and feature suggestions are always welcome!
1. Fork the Project
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3. Commit your Changes (`git commit -m 'feat: Add AmazingFeature'`)
4. Push to the Branch (`git push origin feature/AmazingFeature`)
5. Open a [Pull Request](https://github.com/Kuro-txt/sunflower-land-opensea-price-tracker/pulls)

---

## 📄 License

Distributed under the **MIT License**. See [`LICENSE`](LICENSE) for more details.

---

*Sunflower Land game assets, sprites, and tokenomics are the property of [Thought Farm Pty Ltd](https://sunflower-land.com).*
