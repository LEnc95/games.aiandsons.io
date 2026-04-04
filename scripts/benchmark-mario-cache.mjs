import { chromium } from 'playwright';
import http from 'http';
import fs from 'fs';
import path from 'path';

const PORT = 3004;
let fetchCount = 0;
const server = http.createServer((req, res) => {
  if (req.url === '/mario' || req.url === '/mario/') {
    const html = fs.readFileSync(path.join(process.cwd(), 'mario/index.html'), 'utf8');
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(html);
  } else if (req.url.includes('levels.json')) {
    fetchCount++;
    setTimeout(() => {
      const json = fs.readFileSync(path.join(process.cwd(), 'mario/levels.json'), 'utf8');
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=3600',
        'Date': new Date().toUTCString(),
        'Last-Modified': new Date(Date.now() - 100000).toUTCString()
      });
      res.end(json);
    }, 150);
  } else {
    res.writeHead(200);
    res.end();
  }
});

server.listen(PORT, async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  let fetchStart = 0;
  let fetchEnd = 0;

  page.on('request', request => {
    if (request.url().includes('levels.json')) {
      fetchStart = Date.now();
    }
  });

  page.on('response', response => {
    if (response.url().includes('levels.json')) {
      fetchEnd = Date.now();
    }
  });

  const t0 = performance.now();
  await page.goto(`http://localhost:${PORT}/mario`);
  await page.waitForFunction(() => {
    const btn = document.getElementById('startBtn');
    return btn && btn.textContent === 'Start';
  });
  const firstTime = performance.now() - t0;

  const firstCount = fetchCount;

  // Navigate away and back to simulate a new page load
  await page.goto('about:blank');

  const t1 = performance.now();
  await page.goto(`http://localhost:${PORT}/mario`);
  await page.waitForFunction(() => {
    const btn = document.getElementById('startBtn');
    return btn && btn.textContent === 'Start';
  });
  const secondTime = performance.now() - t1;

  const secondCount = fetchCount;

  console.log(`With no-store:`);
  console.log(`Initial load fetch count: ${firstCount}, time: ${Math.round(firstTime)}ms`);
  console.log(`Subsequent load fetch count: ${secondCount}, time: ${Math.round(secondTime)}ms`);

  await browser.close();
  server.close();
});
