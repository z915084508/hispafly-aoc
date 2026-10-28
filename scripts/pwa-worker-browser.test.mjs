import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const loadModule = createRequire(import.meta.url);
const { chromium } = loadModule(process.env.AOC_PWA_PLAYWRIGHT || 'playwright');
import { createServer } from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
const here = path.dirname(fileURLToPath(import.meta.url));
import assert from 'node:assert/strict';
const root = path.join(here, '../public');
let version = 'v1';
let writes = 0;
const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1:3310');
  if (url.pathname === '/sw.js') {
    res.writeHead(200, { 'Content-Type': 'application/javascript', 'Cache-Control': 'no-store' });
    return res.end((await fs.readFile(path.join(root, 'sw.js'), 'utf8')).replace('const VERSION = "v1"', `const VERSION = "${version}"`));
  }
  const allowed = ['/offline.html', '/favicon.ico', '/icons/icon-192.png', '/icons/icon-512.png', '/icons/icon-maskable-512.png', '/icons/apple-touch-icon.png'];
  if (allowed.includes(url.pathname)) {
    res.writeHead(200, { 'Content-Type': url.pathname.endsWith('.html') ? 'text/html' : url.pathname.endsWith('.ico') ? 'image/x-icon' : 'image/png' });
    return res.end(await fs.readFile(path.join(root, url.pathname)));
  }
  if (req.method === 'POST') writes++;
  if (url.pathname.startsWith('/api/') || req.headers.rsc) {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store' });
    return res.end(JSON.stringify({ private: 'TEST-ONLY-PRIVATE-DATA', writes }));
  }
  res.writeHead(200, { 'Content-Type': 'text/html', 'Cache-Control': 'private, no-store' });
  res.end('<!doctype html><title>PWA isolated worker harness</title><h1>TEST-ONLY-PRIVATE-DATA</h1><script>navigator.serviceWorker.register("/sw.js", {updateViaCache:"none"})</script>');
});
(async () => {
  await new Promise(resolve => server.listen(3310, '127.0.0.1', resolve));
  for (const channel of (process.env.AOC_PWA_BROWSERS || 'chrome,msedge').split(',')) {
    version = 'v1'; writes = 0;
    const browser = await chromium.launch({ channel, headless: true });
    try {
      const context = await browser.newContext();
      const page = await context.newPage();
      await page.goto('http://127.0.0.1:3310/');
      await page.evaluate(() => navigator.serviceWorker.ready);
      await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
      await page.evaluate(async () => {
        await fetch('/api/test-private');
        await fetch('/flight', { headers: { RSC: '1' } });
        await fetch('/api/test-write', { method: 'POST', body: 'TEST-ONLY' });
        await fetch('/icons/icon-192.png?private=sentinel');
      });
      assert.equal(writes, 1);
      const keys = await page.evaluate(async () => {
        const cache = await caches.open('hispafly-aoc-static-v1');
        return (await cache.keys()).map(r => new URL(r.url).pathname).sort();
      });
      assert.equal(keys.length, 6);
      assert(!keys.some(p => p.startsWith('/api/') || p === '/flight' || p === '/'));
      await context.setOffline(true);
      const offline = await page.goto('http://127.0.0.1:3310/pilot/bookings');
      assert.equal(offline.status(), 503);
      assert((await page.textContent('body')).includes('Necesitas conexión'));
      assert(!(await page.textContent('body')).includes('TEST-ONLY-PRIVATE-DATA'));
      const denied = await page.evaluate(async () => {
        const results = [];
        for (const [path, options] of [['/api/test-private', {}], ['/flight', { headers: { RSC: '1' } }], ['/api/test-write', { method: 'POST' }]]) {
          try { await fetch(path, options); results.push(false); } catch { results.push(true); }
        }
        return results;
      });
      assert(denied.every(Boolean));
      await context.setOffline(false);
      await page.goto('http://127.0.0.1:3310/');
      await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
      assert.equal(writes, 1, 'offline write must not be replayed');
      const otherTab = await context.newPage();
      await otherTab.goto('http://127.0.0.1:3310/');
      await otherTab.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
      version = 'v2';
      await page.evaluate(async () => { const reg = await navigator.serviceWorker.getRegistration(); await reg.update(); });
      await page.evaluate(async () => {
        const reg = await navigator.serviceWorker.getRegistration();
        for (let i = 0; i < 100; i++) {
          if (reg.waiting) return;
          await new Promise(resolve => setTimeout(resolve, 50));
        }
        throw new Error('Updated worker did not enter waiting');
      });
      assert((await page.evaluate(() => caches.keys())).includes('hispafly-aoc-static-v1'), 'old worker not replaced without consent');
      console.log(channel, 'update state', await page.evaluate(async () => {
        const reg = await navigator.serviceWorker.getRegistration();
        return { active: reg.active?.state, waiting: reg.waiting?.state, installing: reg.installing?.state, controller: navigator.serviceWorker.controller?.state };
      }));
      await page.evaluate(async () => {
        const reg = await navigator.serviceWorker.getRegistration();
        const waiting = reg.waiting;
        if (!waiting) throw new Error('Waiting worker disappeared');
        await new Promise(resolve => { navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true }); waiting.postMessage({ type: 'AOC_ACTIVATE_UPDATE' }); });
      });
      await page.waitForFunction(async () => !(await caches.keys()).includes('hispafly-aoc-static-v1'));
      assert((await page.evaluate(() => caches.keys())).includes('hispafly-aoc-static-v2'));
      await context.close();
      console.log(`${channel}: real SW install, private/API/RSC/write exclusions, offline 503, no replay, waiting update and cache cleanup PASS`);
    } finally { await browser.close(); }
  }
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => server.close());
