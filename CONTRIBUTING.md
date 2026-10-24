# Contributing

Load `extension/` as an unpacked Chromium extension and reload it after changes. No backend or dependency installation is needed.

Run `npm test` before submitting changes. Manually check selecting a component, typing and clearing a comment, reopening the inspector, and choosing/reconnecting a project folder. Verify `karen-activity.json` is a JSON array and captures from two tabs are retained.

`npm run build:firefox` packages the shared extension sources for Firefox. Firefox uses local browser storage and manual JSON export.
