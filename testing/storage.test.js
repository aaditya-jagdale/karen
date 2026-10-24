import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import test from 'node:test';
import vm from 'node:vm';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
function fixture(contents = '[]') {
  const data = {};
  let disk = contents;
  let failWrite = false;
  let failLocal = false;
  const chrome = { storage: { local: {
    get: async keys => structuredClone(Object.fromEntries((Array.isArray(keys) ? keys : [keys]).map(key => [key, data[key]]))),
    set: async values => {
      if (failLocal && values.activity) throw new Error('Storage full');
      Object.assign(data, structuredClone(values));
    }
  } } };
  const directory = {
    name: 'project',
    getFileHandle: async () => ({
      getFile: async () => ({ text: async () => disk }),
      createWritable: async () => {
        if (failWrite) throw new Error('Permission denied');
        let next;
        return { write: async text => { next = text; }, close: async () => { disk = next; }, abort: async () => {} };
      }
    })
  };
  const storage = vm.runInNewContext(read('extension/background/file-storage.js') + '\nKarenStorage;', { chrome });
  storage.directory = async () => directory;
  return { storage, data, chrome, disk: () => disk, failWrite: value => { failWrite = value; }, failLocal: value => { failLocal = value; } };
}

test('concurrent activities, duplicate retries, and existing file entries survive', async () => {
  const f = fixture('[{"id":"existing","type":"element_selected"}]');
  await Promise.all(Array.from({ length: 20 }, (_, i) => f.storage.append({ id: String(i), type: 'comment_changed', comment: `edit ${i}` })));
  await f.storage.append({ id: '0', type: 'comment_changed', comment: 'edit 0' });
  const disk = JSON.parse(f.disk());
  assert.equal(disk.length, 21);
  assert.equal(disk[0].id, 'existing');
  assert.deepEqual(disk.slice(1).map(item => item.id), Array.from({ length: 20 }, (_, i) => String(i)));
  assert.deepEqual(f.data.activity, disk);
});

test('disk failure retains activity locally and reconnect flushes it', async () => {
  const f = fixture();
  f.failWrite(true);
  assert.match((await f.storage.append({ id: '1' })).warning, /browser only/);
  assert.equal(f.data.activity.length, 1);
  assert.equal(f.disk(), '[]');
  f.failWrite(false);
  assert.equal((await f.storage.enqueue(() => f.storage.sync())).warning, null);
  assert.equal(JSON.parse(f.disk())[0].id, '1');
});

test('malformed or incompatible files are never overwritten', async () => {
  for (const original of ['{bad json', '{}', '[null]', '[{"comment":"no id"}]']) {
    const f = fixture(original);
    assert.ok((await f.storage.append({ id: 'new' })).warning);
    assert.equal(f.disk(), original);
    assert.equal(f.data.activity[0].id, 'new');
  }
});

test('failed local writes surface errors and do not poison later writes', async () => {
  const f = fixture();
  f.failLocal(true);
  await assert.rejects(f.storage.append({ id: 'retry' }), /Storage full/);
  assert.equal(f.disk(), '[]');
  f.failLocal(false);
  await f.storage.append({ id: 'retry' });
  assert.equal(JSON.parse(f.disk()).length, 1);
});

test('no chosen folder still saves locally', async () => {
  const f = fixture();
  f.storage.directory = async () => undefined;
  assert.match((await f.storage.append({ id: 'offline' })).warning, /Choose a folder/);
  assert.equal(f.data.activity[0].id, 'offline');
});

test('delete and clear persist without deleted file entries returning', async () => {
  const f = fixture('[{"id":"one"},{"id":"two"},{"id":"disk-only"}]');
  await f.storage.sync();
  await f.storage.remove('two');
  assert.deepEqual(JSON.parse(f.disk()).map(item => item.id), ['one', 'disk-only']);
  assert.deepEqual(f.data.deletedActivityIds, []);
  await f.storage.clear();
  assert.deepEqual(JSON.parse(f.disk()), []);
  assert.deepEqual(f.data.activity, []);
  assert.equal(f.data.clearActivityRequested, false);
});

test('offline deletions remain pending and apply when folder access returns', async () => {
  const f = fixture('[{"id":"one"},{"id":"two"}]');
  await f.storage.sync();
  f.failWrite(true);
  assert.match((await f.storage.remove('one')).warning, /browser only/);
  assert.deepEqual(f.data.deletedActivityIds, ['one']);
  f.failWrite(false);
  await f.storage.sync();
  assert.deepEqual(JSON.parse(f.disk()).map(item => item.id), ['two']);

  f.failWrite(true);
  await f.storage.clear();
  assert.equal(f.data.clearActivityRequested, true);
  f.failWrite(false);
  await f.storage.sync();
  assert.deepEqual(JSON.parse(f.disk()), []);
});

test('background validates messages and uses the sending tab URL', async () => {
  const f = fixture();
  let listener;
  f.chrome.action = { onClicked: { addListener() {} } };
  f.chrome.runtime = { id: 'karen', onMessage: { addListener(fn) { listener = fn; } } };
  vm.runInNewContext(read('extension/background/background.js'), { chrome: f.chrome, KarenStorage: f.storage });
  const send = event => new Promise(resolve => listener({ action: 'recordActivity', event }, { id: 'karen', tab: { url: 'https://example.test/' } }, resolve));
  assert.equal((await send({ id: 'bad', type: 'unexpected' })).success, false);
  assert.equal((await send({ id: 'bad', type: 'comment_changed' })).success, false);
  const image = { data_url: 'data:image/png;base64,dGVzdA==', mime_type: 'image/png' };
  const sent = { id: 'ok', type: 'annotation_sent', url: 'spoofed', comment: 'Change this', components: [
    { selector: '#button', tag: 'button', classes: ['primary'], bounds: { x: 0, y: 0, width: 10, height: 10 }, image }
  ], device: { viewport: { width: 100, height: 100 } }, snapshot: image };
  assert.equal((await send(sent)).success, true);
  assert.equal(f.data.activity[0].url, 'https://example.test/');
  assert.ok(f.data.activity[0].created_at);
});

test('Firefox build contains the shared storage and no server permissions', () => {
  execFileSync(process.execPath, ['scripts/build-firefox.js']);
  const manifest = JSON.parse(read('dist/firefox/manifest.json'));
  assert.deepEqual(manifest.background.scripts, ['browser-api.js', 'background/file-storage.js', 'background/background.js']);
  assert.equal(manifest.permissions.includes('debugger'), false);
  assert.equal(manifest.host_permissions, undefined);
  for (const script of manifest.background.scripts) assert.ok(existsSync(new URL('../dist/firefox/' + script, import.meta.url)));
  assert.equal(manifest.options_ui.page, 'storage/storage.html');
});


test('snapshot uses the sender window, refuses inactive tabs, and stores a complete submission', async () => {
  const f = fixture();
  let listener;
  let active = true;
  let captures = 0;
  f.chrome.action = { onClicked: { addListener() {} } };
  f.chrome.runtime = { id: 'karen', onMessage: { addListener(fn) { listener = fn; } } };
  f.chrome.tabs = {
    get: async () => ({ active, windowId: 7, url: 'https://example.test/' }),
    captureVisibleTab: async (windowId, options) => {
      assert.equal(windowId, 7);
      assert.equal(options.format, 'png');
      captures++;
      return 'data:image/png;base64,dGVzdA==';
    }
  };
  vm.runInNewContext(read('extension/background/background.js'), { chrome: f.chrome, KarenStorage: f.storage });
  const send = message => new Promise(resolve => listener(message, { id: 'karen', tab: { id: 1, url: 'https://example.test/' } }, resolve));
  const snapshot = await send({ action: 'captureSnapshot' });
  assert.equal(snapshot.success, true);
  active = false;
  assert.equal((await send({ action: 'captureSnapshot' })).success, false);
  assert.equal(captures, 1);
  const image = { data_url: 'data:image/png;base64,dGVzdA==', mime_type: 'image/png' };
  const event = { id: 'sent', type: 'annotation_sent', comment: 'Change this', components: [
    { selector: '#button', tag: 'button', classes: ['primary'], bounds: { x: 0, y: 0, width: 10, height: 10 }, image }
  ], device: { viewport: { width: 100, height: 100 } }, snapshot };
  assert.equal((await send({ action: 'recordActivity', event })).success, true);
  assert.equal(JSON.parse(f.disk())[0].components.length, 1);
  assert.equal(JSON.parse(f.disk())[0].snapshot.data_url, snapshot.data_url);
  assert.equal((await send({ action: 'recordActivity', event: { ...event, snapshot: null } })).success, false);
  assert.equal((await send({ action: 'recordActivity', event: { ...event, components: [{ selector: '#button' }] } })).success, false);
  assert.equal((await send({ action: 'recordActivity', event: { ...event, device: null } })).success, false);
  f.chrome.tabs.captureVisibleTab = async () => { active = false; return snapshot.data_url; };
  active = true;
  assert.equal((await send({ action: 'captureSnapshot' })).success, false);
});
