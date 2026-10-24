import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

const root = fileURLToPath(new URL('../', import.meta.url));
const read = path => readFileSync(join(root, path), 'utf8');
const backgroundSource = read('extension/background/background.js').replace(/new PointaBackground\(\);\s*$/, '');

test('Firefox package uses shared sources, promise APIs and supported permissions', () => {
  const chromeManifest = read('extension/manifest.json');
  execFileSync(process.execPath, ['scripts/build-firefox.js'], { cwd: root });
  const manifest = JSON.parse(read('dist/firefox/manifest.json'));
  assert.equal(read('extension/manifest.json'), chromeManifest);
  assert.equal(manifest.version, JSON.parse(chromeManifest).version);
  assert.deepEqual(manifest.background.scripts, ['browser-api.js', 'background/background.js']);
  assert.equal(manifest.background.service_worker, undefined);
  assert.equal(manifest.permissions.includes('debugger'), false);
  assert.equal(manifest.browser_specific_settings.gecko.strict_min_version, '140.0');
  assert.ok(manifest.host_permissions.includes('*://localhost/*'));
  assert.ok(existsSync(join(root, 'dist/pointa-firefox.zip')));
  for (const script of manifest.background.scripts) {
    assert.ok(existsSync(join(root, 'dist/firefox', script)));
  }
  const api = { storage: { local: { get: async () => ({ theme: 'dark' }) } } };
  const firefox = vm.createContext({ browser: api, chrome: {} });
  vm.runInContext(read('extension/browser-api.js'), firefox);
  assert.equal(firefox.chrome, api);
  const chrome = vm.createContext({ chrome: api });
  vm.runInContext(read('extension/browser-api.js'), chrome);
  assert.equal(chrome.chrome, api);
});

test('missing Firefox debugger does not break startup or remaining recording features', async () => {
  const Background = vm.runInNewContext(backgroundSource + '\nPointaBackground;', { chrome: {}, console });
  const background = Object.create(Background.prototype);
  background.cdpRecordings = new Map();
  assert.doesNotThrow(() => background.setupCDPEventListener());
  await assert.rejects(background.startCDPRecording(1), /network requests are not captured/);
  await assert.rejects(background.setViewport(1, 375, 812), /unavailable in Firefox/);
  await background.resetViewport(1);
  const events = await background.stopCDPRecording(1);
  assert.equal(events.network.length, 0);
  assert.equal(events.console.length, 0);
});

test('screenshots use the requesting window and refuse an inactive tab', async () => {
  let active = true;
  const captures = [];
  const Background = vm.runInNewContext(backgroundSource + '\nPointaBackground;', {
    console: { error() {} },
    chrome: { tabs: {
      get: async id => ({ id, active, windowId: 7 }),
      captureVisibleTab: async (windowId, options) => {
        captures.push({ windowId, options });
        return 'data:image/png;base64,test';
      }
    } }
  });
  const background = Object.create(Background.prototype);
  background.viewportOverrides = new Map();
  assert.equal(await background.captureScreenshot(42), 'data:image/png;base64,test');
  assert.equal(captures[0].windowId, 7);
  assert.equal(captures[0].options.format, 'png');
  active = false;
  await assert.rejects(background.captureScreenshot(42), /Switch back/);
  assert.equal(captures.length, 1);
});

test('recording retains unsupported-capture warnings in its metadata', async () => {
  const warning = 'Console messages and network requests are not captured.';
  const recorder = vm.runInNewContext(read('extension/content/modules/bug-recorder.js') + '\nBugRecorder;', {
    window: { location: { href: 'http://localhost:3000/' } },
    navigator: { userAgent: 'Firefox/140.0' },
    console: { warn() {} },
    chrome: { runtime: { sendMessage: async () => ({ success: false, error: warning }) } }
  });
  recorder.captureWindowErrors = () => {};
  recorder.captureInteractions = () => {};
  recorder.addTimelineEvent = () => {};
  await recorder.startRecording();
  assert.equal(recorder.isRecording, true);
  assert.equal(recorder.recordingData.metadata.captureWarnings[0], warning);
});

test('server CORS accepts Firefox extensions without accepting remote websites', () => {
  const source = read('annotations-server/lib/server.js');
  const serverClass = source.slice(source.indexOf('class LocalAnnotationsServer'), source.indexOf('// Start server in stdio mode'));
  const Server = vm.runInNewContext(serverClass + '\nLocalAnnotationsServer;', { cors: options => options });
  let corsOptions;
  const stop = new Error('Captured CORS middleware');
  const server = Object.create(Server.prototype);
  server.app = { use(options) { corsOptions = options; throw stop; } };
  assert.throws(() => server.setupExpress(), error => error === stop);
  for (const origin of ['moz-extension://test-id', 'chrome-extension://test-id', 'http://localhost:3000']) {
    corsOptions.origin(origin, (error, allowed) => {
      assert.equal(error, null);
      assert.equal(allowed, true);
    });
  }
  corsOptions.origin('https://example.com', error => assert.match(error.message, /Not allowed/));
});
