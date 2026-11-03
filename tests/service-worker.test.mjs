import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

const SOURCE = await readFile(new URL('../sw.js', import.meta.url), 'utf8');
const APP_SCOPE = 'https://example.github.io/swar-sadhika-android/';

class FakeResponse {
  constructor(body, { ok = true, type = 'basic' } = {}) {
    this.body = body;
    this.ok = ok;
    this.type = type;
  }
  clone() { return new FakeResponse(this.body, { ok: this.ok, type: this.type }); }
  async text() { return this.body; }
}

function createHarness({ fetchImpl = async () => new FakeResponse('network') } = {}) {
  const listeners = new Map();
  const entries = new Map();
  let skipWaitingCalled = false;
  let claimCalled = false;
  const deleted = [];

  function responseKey(request) {
    return typeof request === 'string' ? new URL(request, APP_SCOPE).href : request.url;
  }

  const caches = {
    async open(name) {
      if (!entries.has(name)) entries.set(name, new Map());
      const store = entries.get(name);
      return {
        async addAll(paths) {
          for (const path of paths) store.set(new URL(path, APP_SCOPE).href, new FakeResponse(`shell:${path}`));
        },
        async put(request, response) { store.set(responseKey(request), response.clone()); },
        async match(request) {
          const response = store.get(responseKey(request));
          return response ? response.clone() : undefined;
        }
      };
    },
    async keys() { return [...entries.keys()]; },
    async delete(name) { deleted.push(name); return entries.delete(name); }
  };

  const self = {
    registration: { scope: APP_SCOPE },
    clients: { async claim() { claimCalled = true; } },
    async skipWaiting() { skipWaitingCalled = true; },
    addEventListener(name, callback) { listeners.set(name, callback); }
  };

  runInNewContext(SOURCE, { self, caches, fetch: fetchImpl, URL, Set, Promise });

  async function dispatch(name, extra = {}) {
    let waitPromise = Promise.resolve();
    let responsePromise;
    const event = {
      ...extra,
      waitUntil(promise) { waitPromise = Promise.resolve(promise); },
      respondWith(promise) { responsePromise = Promise.resolve(promise); }
    };
    const listener = listeners.get(name);
    assert.ok(listener, `listener ${name} should be registered`);
    listener(event);
    await waitPromise;
    return { responsePromise, waitPromise };
  }

  return {
    caches, entries, deleted,
    async install() { await dispatch('install'); },
    async activate() { await dispatch('activate'); },
    async fetch(url, method = 'GET') {
      const result = await dispatch('fetch', { request: { url, method } });
      return result.responsePromise;
    },
    get skipWaitingCalled() { return skipWaitingCalled; },
    get claimCalled() { return claimCalled; }
  };
}

const ACTIVE_CACHE = 'swar-sadhika-android-v8';

test('install pre-caches the app shell and activates the new worker', async () => {
  const harness = createHarness();
  await harness.install();
  assert.equal(harness.skipWaitingCalled, true);
  assert.ok(harness.entries.has(ACTIVE_CACHE));
  const shell = harness.entries.get(ACTIVE_CACHE);
  assert.ok(shell.has(`${APP_SCOPE}index.html?v=0.7.0`));
  assert.ok(shell.has(`${APP_SCOPE}progress.json`));
  assert.ok(!shell.has(`${APP_SCOPE}assets/user-avatar.webp`));
});

test('activate removes only app-owned old caches and preserves unrelated apps', async () => {
  const harness = createHarness();
  await harness.install();
  for (const name of [
    'swar-sadhika-android-v6',
    'swar-sadhika-web-v5',
    'swar-sadhika-web-v6',
    'another-github-pages-app-v4',
    'swar-sadhika-female-chant-studio-v2'
  ]) harness.entries.set(name, new Map());

  await harness.activate();
  const names = await harness.caches.keys();
  assert.deepEqual([...harness.deleted].sort(), [
    'swar-sadhika-android-v6', 'swar-sadhika-web-v5', 'swar-sadhika-web-v6'
  ].sort());
  assert.ok(names.includes(ACTIVE_CACHE));
  assert.ok(names.includes('another-github-pages-app-v4'));
  assert.ok(names.includes('swar-sadhika-female-chant-studio-v2'));
  assert.equal(harness.claimCalled, true);
});

test('same-origin requests outside this app scope are left to the browser', async () => {
  const harness = createHarness();
  const crossOrigin = await harness.fetch('https://cdn.example.net/file.js');
  const siblingPath = await harness.fetch('https://example.github.io/swar-sadhika-android-extra/file.js');
  assert.equal(crossOrigin, undefined);
  assert.equal(siblingPath, undefined);
  assert.equal((await harness.caches.keys()).length, 0);
});

test('non-GET requests are not intercepted', async () => {
  const harness = createHarness();
  const response = await harness.fetch(`${APP_SCOPE}submit`, 'POST');
  assert.equal(response, undefined);
  assert.equal((await harness.caches.keys()).length, 0);
});

test('successful app GET responses are cached in the app cache', async () => {
  let networkCalls = 0;
  const harness = createHarness({
    fetchImpl: async () => { networkCalls += 1; return new FakeResponse('fresh app response'); }
  });
  const url = `${APP_SCOPE}assets/example.js`;
  const first = await harness.fetch(url);
  assert.equal(await first.text(), 'fresh app response');
  assert.equal(networkCalls, 1);
  const second = await harness.fetch(url);
  assert.equal(await second.text(), 'fresh app response');
  assert.equal(networkCalls, 1, 'second request should be served from cache');
});

test('progress.json is refreshed from network and used as an offline fallback', async () => {
  let online = true;
  const harness = createHarness({
    fetchImpl: async () => {
      if (!online) throw new Error('offline');
      return new FakeResponse('progress-v1');
    }
  });
  const url = `${APP_SCOPE}progress.json`;
  assert.equal(await (await harness.fetch(url)).text(), 'progress-v1');
  online = false;
  assert.equal(await (await harness.fetch(url)).text(), 'progress-v1');
});

test('uncached progress.json fails transparently when offline', async () => {
  const harness = createHarness({ fetchImpl: async () => { throw new Error('offline'); } });
  await assert.rejects(() => harness.fetch(`${APP_SCOPE}progress.json`), /offline/);
});

test('error and opaque responses are returned but never cached', async () => {
  const responses = [
    new FakeResponse('server-error', { ok: false, type: 'basic' }),
    new FakeResponse('opaque-response', { ok: true, type: 'opaque' })
  ];
  const harness = createHarness({ fetchImpl: async () => responses.shift() });
  const firstUrl = `${APP_SCOPE}assets/error.js`;
  const secondUrl = `${APP_SCOPE}assets/opaque.js`;
  assert.equal(await (await harness.fetch(firstUrl)).text(), 'server-error');
  assert.equal(await (await harness.fetch(secondUrl)).text(), 'opaque-response');
  const appCache = harness.entries.get(ACTIVE_CACHE);
  assert.ok(!appCache.has(firstUrl));
  assert.ok(!appCache.has(secondUrl));
});
