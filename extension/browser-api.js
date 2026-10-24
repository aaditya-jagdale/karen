// Firefox's browser namespace provides the promises used throughout the extension.
if (typeof browser !== 'undefined') {
  globalThis.chrome = browser;
}
