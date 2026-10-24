if (typeof importScripts === 'function') importScripts('../browser-api.js', 'file-storage.js');

chrome.action.onClicked.addListener(async tab => {
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['browser-api.js', 'content/modules/selector-generator.js', 'content/content.js']
    });
  } catch (error) {
    await chrome.storage.local.set({ inspectorError: `Cannot inspect this page. Open a regular web page and try again. ${error.message}` });
    await chrome.runtime.openOptionsPage();
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id) return;
  const handle = async () => {
    switch (message.action) {
      case 'recordActivity': {
        const event = message.event;
        if (!event || typeof event.id !== 'string' || event.type !== 'annotation_sent') {
          throw new Error('Invalid activity.');
        }
        if (typeof event.comment !== 'string' || !Array.isArray(event.components) || !event.components.length || !event.device || typeof event.device !== 'object') throw new Error('Missing captured UI or device metadata.');
        event.components.forEach(validateComponent);
        if (!event.snapshot || !/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(event.snapshot.data_url)) throw new Error('Missing snapshot.');
        if (JSON.stringify(event).length > 24 * 1024 * 1024) throw new Error('Message is too large. Remove an attachment and try again.');
        return KarenStorage.append({ ...event, url: sender.tab?.url || event.url, created_at: new Date().toISOString() });
      }
      case 'captureSnapshot': {
        if (!sender.tab) throw new Error('Snapshots must be requested from the inspected page.');
        const before = await chrome.tabs.get(sender.tab.id);
        if (!before.active || before.url !== sender.tab.url) throw new Error('Switch back to the inspected tab and try Send again.');
        const data_url = await chrome.tabs.captureVisibleTab(before.windowId, { format: 'png' });
        const after = await chrome.tabs.get(sender.tab.id);
        if (!after.active || after.url !== before.url) throw new Error('The inspected tab changed during capture. Try Send again.');
        return { data_url, captured_at: new Date().toISOString() };
      }
      case 'getActivity':
        return { activity: await KarenStorage.list(), ...(await chrome.storage.local.get(['activityStatus', 'inspectorError'])) };
      case 'deleteActivity':
        if (typeof message.id !== 'string') throw new Error('Invalid activity ID.');
        return KarenStorage.remove(message.id);
      case 'clearActivity':
        return KarenStorage.clear();
      case 'syncActivity':
        return KarenStorage.enqueue(() => KarenStorage.sync());
      case 'openStorage':
        await chrome.runtime.openOptionsPage();
        return {};
      default:
        throw new Error('Unknown action.');
    }
  };
  handle().then(data => sendResponse({ success: true, ...data }), error => sendResponse({ success: false, error: error.message }));
  return true;
});

function validateComponent(component) {
  if (!component || typeof component.selector !== 'string' || typeof component.tag !== 'string' || !Array.isArray(component.classes) || component.classes.some(name => typeof name !== 'string') || !component.bounds || !['x', 'y', 'width', 'height'].every(key => Number.isFinite(component.bounds[key])) || !component.image || !/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(component.image.data_url)) throw new Error('Invalid captured component.');
}
