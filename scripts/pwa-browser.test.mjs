import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const loadModule = createRequire(import.meta.url);
const { chromium } = loadModule(process.env.AOC_PWA_PLAYWRIGHT || 'playwright');
import { createServer } from 'node:http';
import fs from 'node:fs/promises';
import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
const here = path.dirname(fileURLToPath(import.meta.url));
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
const output = path.resolve(process.env.AOC_PWA_TEST_OUTPUT || path.join(here, '../tmp/pwa-browser'));
mkdirSync(output, { recursive: true });
const repo = path.resolve(here, '..');
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => /^(path|systemroot|windir|comspec|temp|tmp|userprofile|appdata|localappdata|programfiles|programfiles\(x86\)|programdata|processor_architecture|number_of_processors|pathext|systemdrive)$/i.test(key)));
Object.assign(env, { DATABASE_URL: 'postgresql://build:build@127.0.0.1:1/build?connect_timeout=1', DIRECT_URL: 'postgresql://build:build@127.0.0.1:1/build?connect_timeout=1', AOC_RUN_MIGRATIONS: 'false', AOC_RUN_STAFF_BOOTSTRAP: 'false', NEXT_TELEMETRY_DISABLED: '1', NODE_ENV: 'production' });
const app = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', '3307'], { cwd: repo, env, stdio: 'ignore' });
let version = 'v1';
const server = createServer(async (req, res) => {
  try {
    if (req.url === '/sw.js') {
      res.writeHead(200, { 'Content-Type': 'application/javascript', 'Cache-Control': 'no-store' });
      return res.end((await fs.readFile(path.join(here, '../public/sw.js'), 'utf8')).replace('const VERSION = "v1"', `const VERSION = "${version}"`));
    }
    const response = await fetch('http://127.0.0.1:3307' + req.url, { redirect: 'manual', headers: { ...req.headers, host: '127.0.0.1:3311' } });
    res.writeHead(response.status, Object.fromEntries([...response.headers].filter(([key]) => !['transfer-encoding', 'content-encoding', 'content-length'].includes(key))));
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch (error) { res.writeHead(502); res.end(String(error)); }
});
async function waitControlled(page) {
  await Promise.race([page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (navigator.serviceWorker.controller) return;
    await new Promise(resolve => navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true }));
  }), new Promise((_, reject) => setTimeout(() => reject(Error('SW control timeout')), 15000))]);
}
(async () => {
  for (let i = 0; i < 100; i++) {
    try { const r=await fetch('http://127.0.0.1:3307/'); if(r.ok) break; } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
    if(i===99) throw Error('Local production server not ready');
  }
  await new Promise(resolve => server.listen(3311, '127.0.0.1', resolve));
  const results = [];
  for (const channel of (process.env.AOC_PWA_BROWSERS || 'chrome,msedge').split(',')) {
    version = 'v1';
    const profile = path.join(tmpdir(), `pwa-${channel}-${Date.now()}`);
    const context = await chromium.launchPersistentContext(profile, { channel, headless: true, locale: 'es-ES' });
    const browser = context.browser();
    try {
      await context.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
      const page = await context.newPage();
      const errors = [];
      page.on('console', message => { if (message.type() === 'error') console.log(channel, 'console', message.text()); });
      page.on('pageerror', error => errors.push(error.message));
      assert.equal((await page.goto('http://127.0.0.1:3311/')).status(), 200);
      await waitControlled(page);
      console.log(channel, 'SW controlled');
      const cdp = await context.newCDPSession(page);
      assert.equal(await page.locator('meta[name=apple-mobile-web-app-capable]').getAttribute('content'), 'yes');
      assert.equal(await page.locator('link[rel=apple-touch-icon]').getAttribute('href'), '/icons/apple-touch-icon.png');
      const manifest = await cdp.send('Page.getAppManifest');
      assert.equal(JSON.parse(manifest.data).display, 'standalone');
      assert.equal(manifest.errors.length, 0);
      const installability = await cdp.send('Page.getInstallabilityErrors');
      console.log(channel, 'installability', installability);
      assert.deepEqual(installability.installabilityErrors, []);
      for (const route of ['/', '/pilot', '/admin-login']) {
        for (const width of [360, 390, 412, 768, 1280, 1920]) {
          await page.setViewportSize({ width, height: 900 });
          await page.goto('http://127.0.0.1:3311' + route);
          console.log(channel, route, width);
          const layout = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, width: document.documentElement.clientWidth }));
          assert(layout.scroll <= layout.width + 1, `${channel} ${route} ${width}px overflows: ${JSON.stringify(layout)}`);
          if (route === '/pilot' && width === 390) {
            assert.equal(await page.locator('input[name=email]').evaluate(el => getComputedStyle(el).fontSize), '16px');
            if (channel === 'chrome') await page.screenshot({ path: path.join(output, 'AOC-PWA-mobile-login.png'), fullPage: true });
          }
        }
      }
      await page.goto('http://127.0.0.1:3311/pilot/dashboard');
      assert(new URL(page.url()).pathname === '/pilot', 'unauthenticated dashboard remains protected');
      await page.goto('http://127.0.0.1:3311/');
      await page.locator('.pwa-install summary').click();
      assert((await page.locator('.pwa-help').textContent()).includes('iPhone / iPad'));
      await page.evaluate(() => {
        window.__pwaPromptCalls = 0;
        const event = new Event('beforeinstallprompt', { cancelable: true });
        event.prompt = async () => { window.__pwaPromptCalls++; };
        event.userChoice = Promise.resolve({ outcome: 'dismissed' });
        window.dispatchEvent(event);
      });
      const installButton = page.getByRole('button', { name: 'Instalar HISPAFLY AOC' });
      await installButton.waitFor();
      assert.equal(await page.evaluate(() => window.__pwaPromptCalls), 0, 'no automatic popup');
      await installButton.click();
      await page.waitForFunction(() => window.__pwaPromptCalls === 1);
      await page.evaluate(() => window.dispatchEvent(new Event('appinstalled')));
      await page.locator('.pwa-install').waitFor({ state: 'hidden' });
      const other = await context.newPage();
      await other.goto('http://127.0.0.1:3311/');
      await waitControlled(other);
      await other.evaluate(() => { const input = document.createElement('textarea'); input.id = 'test-unsaved'; input.value = 'unsaved test'; document.body.append(input); });
      version = 'v2';
      await page.evaluate(async () => { const reg = await navigator.serviceWorker.getRegistration(); await reg.update(); });
      await page.locator('.pwa-update').waitFor({ state: 'visible' });
      await Promise.all([
        page.waitForNavigation({ waitUntil: 'networkidle' }),
        page.getByRole('button', { name: 'Actualizar y recargar' }).click(),
      ]);
      await page.evaluate(async () => {
        for (let i = 0; i < 100; i++) {
          if (!(await caches.keys()).includes('hispafly-aoc-static-v1')) return;
          await new Promise(resolve => setTimeout(resolve, 50));
        }
        throw Error('Old cache was not removed after update');
      });
      assert.equal(await other.locator('#test-unsaved').inputValue(), 'unsaved test', 'update must not reload other tabs');
      await Promise.all([
        other.waitForNavigation({ waitUntil: 'networkidle' }),
        other.getByRole('button', { name: 'Actualizar y recargar' }).click(),
      ]);
      assert.equal(await other.locator('#test-unsaved').count(), 0, 'second tab can explicitly reload after another tab activates');
      assert.deepEqual(errors, []);
      const standalone = await browser.newContext();
      await standalone.addInitScript(() => Object.defineProperty(navigator, 'standalone', { value: true }));
      const installedPage = await standalone.newPage();
      await installedPage.goto('http://127.0.0.1:3311/');
      await installedPage.waitForLoadState('networkidle');
      assert.equal(await installedPage.locator('.pwa-install').count(), 0);
      await standalone.close();
      results.push({ channel, version: browser.version(), secondTabExplicitReload: true, manifest: 'pass', installability: 'no errors', widths: [360, 390, 412, 768, 1280, 1920], pages: ['gateway', 'pilot login', 'staff login'], noAutomaticPrompt: true, installedHelpHidden: true, swUpdateUI: true, otherTabPreserved: true, unauthenticatedPilotGuard: true, pageErrors: errors });
      console.log(channel + ': production UI, manifest installability, 18 layout cases, install interaction, installed-state hiding, SW update and other-tab preservation PASS');
    } finally { await context.close(); }
  }
  await fs.writeFile(path.join(output, 'AOC-PWA-browser-results.json'), JSON.stringify({ date: '2026-10-28', browsers: results, note: 'Headless local browser checks; not physical-device installation or authenticated operational acceptance.' }, null, 2));
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => { server.close(); app.kill(); });
