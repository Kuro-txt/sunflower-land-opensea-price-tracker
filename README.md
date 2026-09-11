# 🌻 Sunflower Land Collectibles — OpenSea Price Tracker

A real-time web application and dashboard that fetches and tracks item prices for the official [Sunflower Land Collectibles](https://opensea.io/collection/sunflower-land-collectibles) collection on OpenSea (Polygon network).

![Sunflower Land Tracker](https://img.shields.io/badge/OpenSea-Collection-blue?logo=opensea)
![Polygon](https://img.shields.io/badge/Network-Polygon-8247E5?logo=polygon)
![License](https://img.shields.io/badge/License-MIT-green)

---

## ✨ Features

- **⚡ Real-time Item Prices**: Tracks live floor prices, recent sale prices, and circulating supply for all Sunflower Land collectible items.
- **🔍 Instant Search & Token ID Lookup**: Search instantly across hundreds of items by item name, ID number, or in-game perks.
- **🏷️ Utility Boost Badges**: Distinguishes items with active gameplay boosts (e.g. `+0.1 Stone`, `+20% Carrot`, `+1 Fishing minigame attempt`) from cosmetic items.
- **📊 Collection Market Metrics**: Real-time stats bar showing collection floor, median price, average price, total supply, and tracked item count.
- **🎛️ Interactive Filters & Sorting**:
  - Filter by Category: *All Items*, *With Boosts*, *Cosmetic Only*, *< 1 POL*, *1–10 POL*, *> 10 POL*.
  - Sort by: *Floor Price (Asc/Desc)*, *Last Sale*, *Supply (Rarity)*, and *Name (A-Z)*.
- **📱 Dual View Modes**:
  - **Grid View**: Clean visual cards with pricing badges and direct buy links.
  - **Table View**: High-density financial overview.
- **🔗 Direct OpenSea Integration**: 1-click links straight to each item's buy/listing page on OpenSea.
- **🔄 Dual Data Provider Support**:
  - **Zero-Setup Live Market Aggregator**: Works 100% out of the box with no API key needed.
  - **Direct OpenSea v2 API**: Enter an optional OpenSea API Key anytime via the UI settings modal or `.env`.
- **⚡ Built-in In-Memory Cache**: 60-second TTL caching layer prevents API rate limiting and provides sub-millisecond response times.

---

## 🚀 Quick Start

### Prerequisites
- [Node.js](https://nodejs.org/) (v16 or higher)
- npm or yarn

### 1. Clone & Install Dependencies
```bash
git clone https://github.com/<your-username>/sunflower-land-opensea-price-tracker.git
cd sunflower-land-opensea-price-tracker
npm install
```

### 2. Configure Environment (Optional)
Copy `.env.example` to `.env` if you wish to customize port or add an OpenSea API key:
```bash
cp .env.example .env
```

### 3. Run the Server
```bash
npm start
```

Open your browser and navigate to:
```
http://localhost:3000
```

---

## 📡 REST API Reference

The backend provides clean JSON endpoints for programmatic access:

### `GET /api/prices`
Returns all collectible items with their latest prices.
- **Query Parameters**:
  - `refresh=true`: Force bypass cache and fetch fresh data.
  - `search=bear`: Filter by item name or ID.
  - `boost=true|false`: Filter by boost perk availability.
  - `minPrice=1&maxPrice=10`: Price range filters.
  - `sort=price_asc|price_desc|last_sale_desc|supply_asc|supply_desc|name_asc`: Sorting.

#### Example Response:
```json
{
  "success": true,
  "collection": {
    "name": "Sunflower Land Collectibles",
    "slug": "sunflower-land-collectibles",
    "contract": "0x22d5f9b7337a28424268307d08405d4f4cd4d742",
    "openseaUrl": "https://opensea.io/collection/sunflower-land-collectibles",
    "chain": "polygon"
  },
  "cached": true,
  "lastUpdated": "2026-09-11T09:20:00.000Z",
  "totalItems": 184,
  "items": [
    {
      "id": 1210,
      "name": "Brilliant Bear",
      "floorPrice": 0.05,
      "lastSalePrice": 0.0025,
      "supply": 27264,
      "haveBoost": false,
      "boostText": "",
      "openseaUrl": "https://opensea.io/assets/matic/0x22d5f9b7337a28424268307d08405d4f4cd4d742/1210"
    }
  ]
}
```

### `GET /api/stats`
Returns aggregated statistics for the collection:
```json
{
  "success": true,
  "collectionSlug": "sunflower-land-collectibles",
  "totalTrackedItems": 184,
  "collectionFloor": 0.05,
  "maxPrice": 79.8999,
  "averagePrice": 12.34,
  "medianPrice": 4.15,
  "boostItemsCount": 82,
  "totalSupply": 542100
}
```

### `POST /api/settings`
Update or test OpenSea API key at runtime:
```json
{
  "apiKey": "your_opensea_api_key_here"
}
```

---

## 🛠️ Project Structure

```
sunflower-land-tracker/
├── public/
│   ├── index.html         # Main dashboard HTML
│   ├── styles.css         # Custom animations & theme styles
│   └── app.js             # Client search, filter, and rendering logic
├── scripts/
│   └── create-github-repo.js # GitHub repository publisher script
├── .env.example           # Environment template
├── .gitignore             # Git ignore rules
├── package.json           # Dependencies and scripts
├── README.md              # Project documentation
└── server.js              # Express backend & API proxy
```

---

## 📜 Contract Information

- **Contract Address**: `0x22d5f9b7337a28424268307d08405d4f4cd4d742`
- **Network**: Polygon (Matic)
- **Token Standard**: ERC-1155 Multi-Token Standard
- **OpenSea Collection**: [sunflower-land-collectibles](https://opensea.io/collection/sunflower-land-collectibles)

---

## 📄 License
MIT License
