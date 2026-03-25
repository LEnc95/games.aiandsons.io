const WebSocket = require('ws');

const url = 'wss://clubpenguin-world-6owms56gxq-uc.a.run.app/ws';
console.log(`Testing connection to: ${url}`);

const ws = new WebSocket(url, {
  headers: {
    Origin: 'https://games.aiandsons.io'
  }
});

ws.on('open', () => {
  console.log('Connected successfully!');
  ws.close();
});

ws.on('error', (err) => {
  console.error('WebSocket error:', err.message);
});

ws.on('close', (code, reason) => {
  console.log(`Closed with code: ${code}, reason: ${reason}`);
});

ws.on('unexpected-response', (req, res) => {
  console.error(`Unexpected response: ${res.statusCode} ${res.statusMessage}`);
  res.on('data', (chunk) => {
    console.error(`Body: ${chunk.toString()}`);
  });
});
