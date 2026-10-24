# Karen

A local-only browser extension for inspecting components and writing comments. No server, account, AI integration, or network service is required.

## Use

1. In desktop Chrome or Edge, open `chrome://extensions` (or `edge://extensions`), enable Developer mode, and load the `extension/` folder as an unpacked extension.
2. Open the extension's **Options → Local activity → Choose project folder**. Choose `/Users/aaditya/projects/karen` (or wherever you cloned this repository).
3. Open your page and click the Karen extension. A floating toolbar appears; drag its logo to move it, or focus the logo and use arrow keys. The comment button opens your draft and the list button opens Local activity. Click a component to prepare its DOM context and a cropped PNG image, then type a comment. **Inspect another component** adds another component to the same draft. Remove any component with its × button. Nothing is stored until **Send** saves one entry containing the comment, remaining components, and a PNG snapshot of the visible page (without the inspector). Escape stops inspection or closes the panel.
4. Activity is automatically written to `karen-activity.json` in the selected folder as a JSON array of objects. **Local activity** shows sent entries as image tiles. Open a tile to review its full comment and component images. The page snapshot is under a collapsed context section. Click any component image or page snapshot to inspect it with zoom, Fit, and 100% controls; scroll to pan and press Escape to close. Draft component thumbnails also open the viewer. You can also delete entries, copy or export the complete JSON, and clear the complete history.

Browsers require a folder selection before allowing disk writes. If permission expires, use **Reconnect folder**. Until access returns, activity remains in extension-local storage and the inspector displays a warning. Uninstalling the extension clears that browser copy; keep the JSON file. Reload open pages after updating the extension.

File URLs require enabling **Allow access to file URLs** in the extension's settings. Browser-internal pages cannot be inspected. Inspection targets the top-level document; embedded frames and closed shadow roots are not traversed.

## JSON

The JSON list contains only submitted messages. Each entry has `id`, `type: "annotation_sent"`, `url`, `page_title`, `created_at`, `comment`, captured components, device metadata, and the visible-page snapshot.

Each component contains only its CSS selector, tag, class list, bounds, and cropped PNG image. No computed CSS is copied.

Device metadata includes the browser and platform identifiers exposed by the browser, locale and timezone, viewport and screen sizes, pixel ratio, orientation, color and motion preferences, touch capability, online and cookie-enabled status, and available hardware/network hints. Location, cookie contents, form values, page text, and arbitrary DOM attributes are not captured. Capture files are gitignored.

Writes from extension tabs are serialized. Existing JSON entries are merged by ID; invalid files are left untouched, with new activity retained in the browser. Do not edit the file concurrently while capturing. Every write rewrites the JSON list, intended for local development sessions.

## Firefox

Run `npm run build:firefox`, then load `dist/firefox/manifest.json` via `about:debugging` → This Firefox → Load Temporary Add-on. Firefox captures activity in browser-local storage; use **Export JSON** to save it into the repository. Direct automatic folder writes are available in desktop Chromium browsers only. Temporary add-on storage may be lost when the add-on is removed.

## Development

No dependencies or build step are required for Chrome. Run `npm test` for storage and packaging checks. `testing/demo-app/index.html` is a local page for manual inspection.

Open `testing/inspector.test.html` in a browser for the inspector smoke check (selection, comments, clearing, reopening, and paused interactions). It uses a simulated extension message transport; folder permissions still need a manual check in the installed extension.

Each `annotation_sent` entry contains `comment`, a `components` array with class lists and cropped PNG images, `device` metadata, and a `snapshot` with the visible UI as a PNG data URL. Failed sends retain the draft in the open page; closing/reloading the page does not restore the composer. Component and page snapshot capture require the inspected tab to remain active. Images increase the size of the JSON history; use this for local development sessions.
