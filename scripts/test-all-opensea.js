const apiKey = 'add815580a904473ba7f162c0ccc4926';

async function fetchAllOpenSeaListings() {
  console.log('Fetching all OpenSea listings for sunflower-land-collectibles...');
  let listings = [];
  let nextCursor = '';
  let page = 1;

  while (true) {
    let url = 'https://api.opensea.io/api/v2/listings/collection/sunflower-land-collectibles/best?limit=100';
    if (nextCursor) {
      url += `&next=${encodeURIComponent(nextCursor)}`;
    }

    const res = await fetch(url, {
      headers: {
        'x-api-key': apiKey,
        'Accept': 'application/json'
      }
    });

    if (!res.ok) {
      console.error(`Page ${page} failed: ${res.status} ${res.statusText}`);
      break;
    }

    const json = await res.json();
    const pageListings = json.listings || [];
    listings.push(...pageListings);
    console.log(`Page ${page}: got ${pageListings.length} listings (total so far: ${listings.length})`);

    if (json.next && pageListings.length > 0) {
      nextCursor = json.next;
      page++;
      // Be respectful to rate limits
      await new Promise(r => setTimeout(r, 250));
    } else {
      break;
    }
  }

  console.log(`\n🎉 Total OpenSea best listings found: ${listings.length}`);
  
  // Group by token ID
  const map = new Map();
  for (const l of listings) {
    const tokenId = l.protocol_data?.parameters?.offer?.[0]?.identifierOrCriteria || l.asset?.identifier;
    const priceObj = l.price?.current;
    const currency = priceObj?.currency || 'WETH';
    const decimals = priceObj?.decimals || 18;
    const price = priceObj ? parseFloat(priceObj.value) / Math.pow(10, decimals) : 0;

    if (!map.has(tokenId) || map.get(tokenId).price > price) {
      map.set(tokenId, {
        tokenId,
        currency,
        price,
        orderHash: l.order_hash,
        orderCreated: l.order_created_at
      });
    }
  }

  console.log(`Unique tokens with active OpenSea listings: ${map.size}`);
  const sample = Array.from(map.values()).slice(0, 5);
  console.log('Sample OpenSea items:', sample);
}

fetchAllOpenSeaListings().catch(console.error);
