# 🌻 Sunflower Land Collectibles — OpenSea Price Tracker

A real-time web application and dashboard to fetch, track, and analyze all item prices for the official [Sunflower Land Collectibles](https://opensea.io/collection/sunflower-land-collectibles) collection on OpenSea (Polygon network).

👉 **Live GitHub Pages Site**: [https://kuro-txt.github.io/sunflower-land-opensea-price-tracker/](https://kuro-txt.github.io/sunflower-land-opensea-price-tracker/)

![OpenSea](https://img.shields.io/badge/OpenSea-Collection-blue?logo=opensea)
![Polygon](https://img.shields.io/badge/Network-Polygon-8247E5?logo=polygon)
![Hosting](https://img.shields.io/badge/Hosted%20On-GitHub%20Pages-brightgreen)
![License](https://img.shields.io/badge/License-MIT-green)

---

## ⚡ Can we fetch prices directly from OpenSea by API?

**Yes, and here is how it is engineered:**

### 1. The Browser CORS Restriction
OpenSea's official REST API v2 (`api.opensea.io`) requires an `X-API-KEY`. If client-side JavaScript in a browser attempts to query `api.opensea.io` directly:
- **CORS blocks it**: OpenSea does not provide `Access-Control-Allow-Origin: *` for public browser origins.
- **Security risk**: Exposing your private OpenSea API key in frontend code on a public static site would leak your credentials.

### 2. The Solution: Multi-Tiered Architecture

| Tier | How it Works | Benefits |
|---|---|---|
| **Tier 1: GitHub Pages Static Feed** | Pre-generated `data/prices.json` committed to the repository. | Instant loading (<50ms), 100% reliable, zero CORS issues, zero API key required. |
| **Tier 2: Automated GitHub Actions Cron** | Runs `.github/workflows/update-prices.yml` in the cloud on a schedule. | Automatically queries the API with your repository secret `OPENSEA_API_KEY` and updates `data/prices.json` automatically without exposing your key. |
| **Tier 3: Client-side Proxy Refresh** | When users click "Refresh" or provide an OpenSea API Key in the UI settings modal, requests route via a CORS proxy. | Live on-demand updates directly from the browser. |
| **Tier 4: Dedicated Node.js Backend** | Run `npm start` locally or deploy to Render / Railway / Vercel. | Full Express API proxy server with built-in in-memory caching. |

---

## ✨ Features

- **⚡ Real-time Item Prices**: Tracks live floor prices, recent sale prices, and circulating supply for all 489 Sunflower Land collectible items.
- **🔍 Instant Search & Token ID Lookup**: Search instantly across all items by name, ID number, or in-game utility perks.
- **🏷️ Utility Boost Badges**: Distinguishes items with active gameplay boosts (e.g. `+0.1 Stone`, `+20% Carrot`, `+1 Fishing minigame attempt`) from cosmetic items.
- **📊 Collection Market Metrics**: Real-time stats bar showing collection floor, median price, average price, total supply, and tracked item count.
- **🎛️ Interactive Filters & Sorting**:
  - Filter by Category: *All Items*, *With Boosts*, *Cosmetic Only*, *< 1 POL*, *1–10 POL*, *> 10 POL*.
  - Sort by: *Floor Price (Asc/Desc)*, *Last Sale*, *Supply (Rarity)*, and *Name (A-Z)*.
- **📱 Dual View Modes**:
  - **Grid View**: Clean visual cards with pricing badges and direct buy links.
  - **Table View**: High-density financial overview.
- **🔗 Direct OpenSea Integration**: 1-click links straight to each item's buy/listing page on OpenSea.

---

## 🌐 Live GitHub Pages Deployment

The static web application is deployed on GitHub Pages:
**[https://kuro-txt.github.io/sunflower-land-opensea-price-tracker/](https://kuro-txt.github.io/sunflower-land-opensea-price-tracker/)**

### Setting up Automatic Price Updates via GitHub Actions:
1. Go to your repository **Settings** → **Secrets and variables** → **Actions**.
2. Add a new repository secret:
   - **Name**: `OPENSEA_API_KEY`
   - **Value**: `your_opensea_api_key_here`
3. The workflow `.github/workflows/update-prices.yml` will automatically query the OpenSea API and commit fresh prices every 4 hours, or you can trigger it manually under the **Actions** tab anytime!

---

## 💻 Local Development

### 1. Clone the Repository
```bash
git clone https://github.com/Kuro-txt/sunflower-land-opensea-price-tracker.git
cd sunflower-land-opensea-price-tracker
npm install
```

### 2. Configure Environment (Optional)
```bash
cp .env.example .env
```

### 3. Run the Development Server
```bash
npm start
```
Open **[http://localhost:3000](http://localhost:3000)** in your browser.

---

## 📜 Contract Details
- **Contract Address**: `0x22d5f9b7337a28424268307d08405d4f4cd4d742`
- **Network**: Polygon (Matic)
- **Token Standard**: ERC-1155 Multi-Token Standard
- **OpenSea Collection**: [sunflower-land-collectibles](https://opensea.io/collection/sunflower-land-collectibles)

---

## 📄 License
MIT License
