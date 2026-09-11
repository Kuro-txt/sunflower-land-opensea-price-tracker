const d = require('../data/prices.json');

console.log('Total items in catalog:', d.totalItems);
console.log('Active OpenSea listings:', d.activeListedCount);

// Group by currency
const currencies = {};
d.items.filter(i => !i.unlisted).forEach(i => {
  currencies[i.currency] = (currencies[i.currency] || 0) + 1;
});
console.log('Listings by currency on OpenSea:', currencies);

// Items listed in POL
const polItems = d.items.filter(i => !i.unlisted && i.currency === 'POL');
console.log(`\nItems listed in POL on OpenSea (${polItems.length} items):`);
polItems.slice(0, 10).forEach(i => {
  console.log(`  #${i.id} ${i.name}: ${i.floorPrice} POL (boost: ${i.haveBoost ? i.boostText : 'None'})`);
});

// Items listed in WETH (with price > 0.0001)
const wethCollectibles = d.items.filter(i => !i.unlisted && i.currency === 'WETH' && i.floorPrice >= 0.0001);
console.log(`\nNotable Collectibles listed in WETH on OpenSea (${wethCollectibles.length} items):`);
wethCollectibles.slice(0, 10).forEach(i => {
  console.log(`  #${i.id} ${i.name}: ${i.floorPrice} WETH`);
});
