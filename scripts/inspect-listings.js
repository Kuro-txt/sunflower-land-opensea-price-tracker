const apiKey = 'add815580a904473ba7f162c0ccc4926';

async function inspectSampleListings() {
  const res = await fetch('https://api.opensea.io/api/v2/listings/collection/sunflower-land-collectibles/best?limit=50', {
    headers: {
      'x-api-key': apiKey,
      'Accept': 'application/json'
    }
  });

  const data = await res.json();
  console.log('Got', data.listings?.length, 'listings.');
  for (const l of (data.listings || []).slice(0, 10)) {
    const id = l.protocol_data?.parameters?.offer?.[0]?.identifierOrCriteria || l.asset?.identifier;
    const offerAmt = l.protocol_data?.parameters?.offer?.[0]?.startAmount;
    const priceVal = l.price?.current?.value;
    const decimals = l.price?.current?.decimals;
    const curr = l.price?.current?.currency;
    const totalConsideration = l.protocol_data?.parameters?.consideration?.reduce((sum, c) => sum + BigInt(c.startAmount), 0n);
    console.log(`Token ${id}: currency=${curr}, priceVal=${priceVal}, decimals=${decimals}, offerAmount=${offerAmt}, totalConsideration=${totalConsideration}`);
  }
}

inspectSampleListings().catch(console.error);
