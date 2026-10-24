# Firefox build

Requires Firefox desktop 140 or later (including compatible Firefox-based browsers).
The Firefox package uses the same extension source and local Pointa server as Chrome.

## Build and load locally

```sh
npm run build:firefox
npm run test:firefox
```

The build uses Node.js and the `zip` command, available on macOS and Linux.
It writes `dist/firefox/` and `dist/pointa-firefox.zip` without modifying the Chrome manifest.

1. Start the local server from this checkout so it includes Firefox origin support:
   `cd annotations-server && npm ci && npm start`.
   Stop an older Pointa daemon first if it already occupies port 4242.
2. Open `about:debugging#/runtime/this-firefox` in Firefox.
3. Choose **Load Temporary Add-on**, then select `dist/firefox/manifest.json`.
4. Allow access to local development sites if Firefox prompts, open your localhost app,
   and click the Pointa toolbar button. Clicking grants permission for screenshots.

Temporary add-ons are removed when Firefox restarts. The ZIP is unsigned;
permanent installation in standard Firefox requires Mozilla signing. This build
does not submit or publish anything. Confirm the `pointa@pointa.dev` add-on ID
with the project owner before submitting it for signing.

## Features and limits

- Annotations, design edits, toolbar, screenshots, local server/MCP integration,
  and resource performance reports use shared code.
- Bug reports retain interactions, page error events, screenshots, and optional
  backend logs. Browser console messages and network request recording are not
  available in this build. The recording panel and saved report metadata state this.
- Automatic responsive viewport emulation is unavailable. Resize the browser
  window manually before capturing a screenshot.
- Screenshot capture requires the recorded tab to be active. It uses that tab's
  window, rather than whichever browser window happens to have focus.

Firefox does not implement Chrome's extension debugger API:
https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Chrome_incompatibilities

The Firefox manifest declares website content, URLs, and website activity sent to
the local server. No new external service or analytics collection is added.
Existing user-triggered AI/Linear integrations still use the local server.

## Validation

`npm run test:firefox` checks packaging, the promise API adapter, missing-debugger
handling, screenshot window selection, and recording limitation metadata.
It also checks that the server accepts Firefox extension origins while rejecting
unrelated website origins.

For Mozilla's package validator, run:

```sh
npx web-ext lint --source-dir dist/firefox
```

The initial build passed all five tests and loaded in an isolated Zen/Gecko 158
profile. Toolbar startup, annotation mode, annotation save/load, and partial bug
recording were exercised against a test server. Screenshot capture without a
toolbar click was correctly rejected for missing `activeTab` permission; capture
after a real toolbar click still needs a manual check.

Mozilla's validator reported zero errors and 42 warnings: 26 existing dynamic
HTML assignments, 15 guarded Chrome debugger API references, and one Android
minimum-version warning. This build targets desktop; store review and Android
compatibility have not been completed.
