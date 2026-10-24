// File handles stay in IndexedDB; activity stays durable even when folder access expires.
const KarenStorage = {
  queue: Promise.resolve(),
  enqueue(operation) {
    const result = this.queue.then(operation);
    this.queue = result.catch(() => {});
    return result;
  },
  async directory(handle) {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('KarenActivity', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('settings');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      return await new Promise((resolve, reject) => {
        const tx = db.transaction('settings', handle ? 'readwrite' : 'readonly');
        const store = tx.objectStore('settings');
        const request = handle ? store.put(handle, 'directory') : store.get('directory');
        tx.oncomplete = () => resolve(request.result);
        tx.onabort = () => reject(tx.error || new Error('Folder storage failed.'));
        tx.onerror = () => reject(tx.error);
      });
    } finally {
      db.close();
    }
  },
  async list() {
    const { activity = [] } = await chrome.storage.local.get('activity');
    if (!Array.isArray(activity)) throw new Error('Local activity is damaged; export or recover it before continuing.');
    return activity;
  },
  async append(event) {
    return this.enqueue(async () => {
      const activity = await this.list();
      if (!activity.some(item => item.id === event.id)) {
        activity.push(event);
        await chrome.storage.local.set({ activity });
      }
      return this.sync();
    });
  },
  async remove(id) {
    return this.enqueue(async () => {
      const activity = (await this.list()).filter(item => item.id !== id);
      const { deletedActivityIds = [] } = await chrome.storage.local.get('deletedActivityIds');
      await chrome.storage.local.set({ activity, deletedActivityIds: [...new Set([...deletedActivityIds, id])] });
      return this.sync();
    });
  },
  async clear() {
    return this.enqueue(async () => {
      await chrome.storage.local.set({ activity: [], clearActivityRequested: true, deletedActivityIds: [] });
      return this.sync();
    });
  },
  async sync() {
    try {
      const directory = await this.directory();
      if (!directory) throw new Error('Choose a folder in Local activity to enable automatic JSON saves.');
      const file = await directory.getFileHandle('karen-activity.json', { create: true });
      const text = await (await file.getFile()).text();
      const saved = text.trim() ? JSON.parse(text) : [];
      if (!Array.isArray(saved) || saved.some(item => !item || typeof item !== 'object' || Array.isArray(item) || typeof item.id !== 'string')) {
        throw new Error('karen-activity.json must be a list of objects with IDs. The file was not overwritten.');
      }
      const activity = await this.list();
      const { deletedActivityIds = [], clearActivityRequested = false } = await chrome.storage.local.get(['deletedActivityIds', 'clearActivityRequested']);
      const deleted = new Set(deletedActivityIds);
      const retained = clearActivityRequested ? [] : saved.filter(item => !deleted.has(item.id));
      const ids = new Set(retained.map(item => item.id));
      const merged = [...retained, ...activity.filter(item => !deleted.has(item.id) && !ids.has(item.id))];
      // Keep existing file entries locally too, so a later export retains them.
      await chrome.storage.local.set({ activity: merged });
      const writable = await file.createWritable();
      try {
        await writable.write(JSON.stringify(merged, null, 2) + '\n');
        await writable.close();
      } catch (error) {
        await writable.abort().catch(() => {});
        throw error;
      }
      const status = { folder: directory.name, warning: null, count: merged.length };
      await chrome.storage.local.set({ activityStatus: status, deletedActivityIds: [], clearActivityRequested: false });
      return status;
    } catch (error) {
      const status = { warning: `Saved in this browser only. ${error.message}`, count: (await this.list()).length };
      await chrome.storage.local.set({ activityStatus: status });
      return status;
    }
  }
};
