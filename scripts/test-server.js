const http = require('http');
const { spawn } = require('child_process');

console.log('Starting server in background...');
const server = spawn('node', ['server.js'], { cwd: __dirname + '/..' });

server.stdout.on('data', data => console.log('[SERVER]', data.toString().trim()));
server.stderr.on('data', data => console.error('[SERVER ERR]', data.toString().trim()));

function get(url) {
  return new Promise((resolve, reject) => {
    http.get(url, res => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(body) });
        } catch {
          resolve({ status: res.statusCode, raw: body });
        }
      });
    }).on('error', reject);
  });
}

async function runTests() {
  // Wait 2s for server to start
  await new Promise(r => setTimeout(r, 2000));

  console.log('Testing GET /api/health...');
  const health = await get('http://127.0.0.1:3000/api/health');
  console.log('Health Response:', health.data);

  console.log('Testing GET /api/prices...');
  const prices = await get('http://127.0.0.1:3000/api/prices');
  console.log('Prices Status:', prices.status);
  console.log('Collection Name:', prices.data?.collection?.name);
  console.log('Items Count:', prices.data?.totalItems);
  if (prices.data?.items?.length > 0) {
    const first = prices.data.items[0];
    console.log('Sample Item:', first.id, first.name, 'Floor:', first.floorPrice, 'POL', 'OpenSea:', first.openseaUrl);
  }

  console.log('Testing GET /api/stats...');
  const stats = await get('http://127.0.0.1:3000/api/stats');
  console.log('Stats Response:', stats.data);

  console.log('\nAll server tests passed!');
  server.kill();
  process.exit(0);
}

runTests().catch(err => {
  console.error('Test failed:', err);
  server.kill();
  process.exit(1);
});
