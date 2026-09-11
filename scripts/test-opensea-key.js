const apiKey = 'add815580a904473ba7f162c0ccc4926';

async function testKey() {
  console.log('Testing user OpenSea API key...');
  const res = await fetch('https://api.opensea.io/api/v2/listings/collection/sunflower-land-collectibles/best?limit=50', {
    headers: {
      'x-api-key': apiKey,
      'Accept': 'application/json'
    }
  });

  console.log('OpenSea API Status:', res.status, res.statusText);
  if (!res.ok) {
    const text = await res.text();
    console.error('Error response:', text);
    return;
  }

  const json = await res.json();
  console.log('✅ OpenSea API key works! Retrieved listings:', json.listings?.length);
  if (json.listings && json.listings.length > 0) {
    const first = json.listings[0];
    const priceVal = first.price?.current ? parseFloat(first.price.current.value) / Math.pow(10, first.price.current.decimals || 18) : 0;
    console.log('Sample OpenSea Listing:', {
      token_id: first.protocol_data?.parameters?.offer?.[0]?.identifierOrCriteria || first.asset?.identifier,
      currency: first.price?.current?.currency,
      price: priceVal,
      created_at: first.order_created_at
    });
  }
}

testKey().catch(console.error);
