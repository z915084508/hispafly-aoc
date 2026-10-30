import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { test } from "node:test";
import manifest from "../src/app/manifest.ts";
import { GET as getPublicBuild } from "../src/app/api/pwa/version/route.ts";

const root = new URL("../", import.meta.url);
const workerSource = await readFile(new URL("public/sw.js", root), "utf8");

test("public version endpoint returns only a build marker and forbids caching", async () => {
  const response = await getPublicBuild();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("Cache-Control"), /no-store/);
  const payload = await response.json();
  assert.deepEqual(Object.keys(payload), ["buildId"]);
  assert.equal(typeof payload.buildId, "string");
});

function worker(fetchOverride) {
  const listeners = new Map();
  const stores = new Map();
  const operations = { claims: 0, skips: 0 };
  const caches = {
    async open(name) {
      if (!stores.has(name)) stores.set(name, new Map());
      const entries = stores.get(name);
      return {
        async put(path, response) { entries.set(path, response.clone()); },
        async match(path) { return entries.get(path)?.clone(); },
      };
    },
    async keys() { return [...stores.keys()]; },
    async delete(name) { return stores.delete(name); },
  };
  const self = {
    location: { origin: "https://aoc.test" },
    clients: { async claim() { operations.claims++; } },
    async skipWaiting() { operations.skips++; },
    addEventListener(name, callback) { listeners.set(name, callback); },
  };
  vm.runInNewContext(workerSource, {
    self, caches, URL, Response,
    fetch: fetchOverride ?? (async (path) => new Response(String(path), {
      headers: { "Content-Type": String(path).endsWith(".html") ? "text/html" : String(path).endsWith(".ico") ? "image/x-icon" : "image/png" },
    })),
  });
  async function lifecycle(type, data) {
    const promises = [];
    listeners.get(type)({ data, waitUntil(promise) { promises.push(promise); } });
    await Promise.all(promises);
  }
  function request(path, { method = "GET", headers = {}, mode = "cors" } = {}) {
    let response;
    listeners.get("fetch")({
      request: { url: new URL(path, self.location.origin).href, method, headers: new Headers(headers), mode },
      respondWith(promise) { response = promise; },
    });
    return response;
  }
  return { stores, operations, lifecycle, request };
}

test("manifest has stable identity, required icons and unrestricted orientation", async () => {
  const value = manifest();
  assert.equal(value.name, "HISPAFLY AOC");
  assert.equal(value.short_name, "HISPAFLY");
  assert.equal(value.id, "/");
  assert.equal(value.start_url, "/");
  assert.equal(value.scope, "/");
  assert.equal(value.display, "standalone");
  assert.equal(value.orientation, undefined);
  for (const icon of value.icons) {
    const png = await readFile(new URL(`public${icon.src}`, root));
    assert.equal(png.subarray(1, 4).toString(), "PNG");
    assert.equal(`${png.readUInt32BE(16)}x${png.readUInt32BE(20)}`, icon.sizes);
  }
  assert(value.icons.some((icon) => icon.purpose === "maskable"));
  const apple = await readFile(new URL("public/icons/apple-touch-icon.png", root));
  assert.equal(apple.readUInt32BE(16), 180);
  assert.equal(apple.readUInt32BE(20), 180);
  const ico = await readFile(new URL("public/favicon.ico", root));
  assert.equal(ico.readUInt16LE(2), 1);
  assert.equal(ico.readUInt16LE(4), 3);
});

test("install stores only six public files, no app shell, credentials or business responses", async () => {
  const requests = [];
  const instance = worker(async (path, options) => {
    requests.push({ path, options });
    return new Response("public", { headers: { "Content-Type": path.endsWith(".html") ? "text/html" : "image/png" } });
  });
  await instance.lifecycle("install");
  const paths = [...instance.stores.values()].flatMap((store) => [...store.keys()]);
  assert.equal(paths.length, 6);
  assert(paths.every((path) => path.startsWith("/icons/") || ["/offline.html", "/favicon.ico"].includes(path)));
  assert(requests.every(({ options }) => options.credentials === "omit" && options.redirect === "error"));
  assert.equal(instance.operations.skips, 0);
});

test("private, redirected and unexpected MIME responses fail install without caching", async () => {
  for (const headers of [
    { "Content-Type": "text/html", "Cache-Control": "private" },
    { "Content-Type": "text/html", "Cache-Control": "no-store" },
    { "Content-Type": "application/json" },
  ]) {
    const instance = worker(async () => new Response("sensitive", { headers }));
    await assert.rejects(instance.lifecycle("install"), /Unsafe PWA/);
    assert.equal(instance.stores.size, 0);
  }
  const redirected = worker(async () => Response.redirect("https://aoc.test/pilot"));
  await assert.rejects(redirected.lifecycle("install"));
  assert.equal(redirected.stores.size, 0);
});

test("API, writes, external URLs, RSC and server actions bypass worker handling", () => {
  const instance = worker();
  for (const path of ["/api/auth/local/me", "/api/pwa/version", "/api/efb/pilot/bookings", "/api/ofp/secret/pdf", "/api/cron/native-flight-generation"]) {
    assert.equal(instance.request(path, { mode: "navigate" }), undefined);
  }
  assert.equal(instance.request("/pilot/bookings", { method: "POST" }), undefined);
  assert.equal(instance.request("/pilot", { mode: "navigate", headers: { RSC: "1" } }), undefined);
  assert.equal(instance.request("/pilot", { headers: { "Next-Action": "action" } }), undefined);
  assert.equal(instance.request("/pilot", { headers: { "Next-Router-Prefetch": "1" } }), undefined);
  assert.equal(instance.request("https://external.test/file.pdf", { mode: "navigate" }), undefined);
  assert.equal(instance.request("/icons/icon-192.png?token=secret"), undefined);
  assert.equal(instance.request("/icons/icon-192.png", { headers: { Range: "bytes=0-5" } }), undefined);
});

test("online navigations are always network-only and never stored, including errors", async () => {
  const calls = [];
  const instance = worker(async (request, options) => {
    calls.push({ request, options });
    return new Response("private pilot data", { status: 403 });
  });
  const response = await instance.request("/pilot/dashboard", { mode: "navigate" });
  assert.equal(response.status, 403);
  assert.equal(await response.text(), "private pilot data");
  assert.equal(calls[0].options.cache, "no-store");
  assert.equal(instance.stores.size, 0);
});

test("offline navigation is a generic no-store 503, never stale operational HTML", async () => {
  const instance = worker(async () => { throw new TypeError("offline"); });
  instance.stores.set("hispafly-aoc-static-v1", new Map([["/offline.html", new Response("generic offline")]]));
  const response = await instance.request("/pilot/bookings?private=value", { mode: "navigate" });
  assert.equal(response.status, 503);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.equal(await response.text(), "generic offline");
});

test("activation removes only this app's old caches; updates require explicit message", async () => {
  const instance = worker();
  instance.stores.set("hispafly-aoc-static-old", new Map());
  instance.stores.set("hispafly-aoc-static-v1", new Map());
  instance.stores.set("unrelated-app", new Map());
  await instance.lifecycle("activate");
  assert(!instance.stores.has("hispafly-aoc-static-old"));
  assert(instance.stores.has("unrelated-app"));
  assert(instance.stores.has("hispafly-aoc-static-v1"));
  assert.equal(instance.operations.claims, 1);
  assert.equal(instance.operations.skips, 0);
  await instance.lifecycle("message", { type: "unrelated" });
  assert.equal(instance.operations.skips, 0);
  await instance.lifecycle("message", { type: "AOC_ACTIVATE_UPDATE" });
  assert.equal(instance.operations.skips, 1);
});
