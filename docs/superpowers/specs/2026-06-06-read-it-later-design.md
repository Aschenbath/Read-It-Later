# Read It Later Extension Design

## Goal

Build a local Chrome/Edge Manifest V3 popup extension that closely matches the provided Read It Later screenshot and lets Gilbert save the current tab for later reading.

## Scope

- Popup UI with title, search box, top-right add button, favicon list rows, title/domain text, and delete control.
- Add current active tab from the popup using `chrome.tabs.query`.
- Store entries in `chrome.storage.local`.
- De-duplicate by canonicalized URL, refreshing title/favicon/time when the page is added again.
- Filter entries by title, URL, or domain.
- Open saved links by clicking a row.
- Keep the extension self-contained under `D:\Codex\Dont_dele\extensions\read-it-later-extension`.

## Architecture

- `read-later-core.js`: pure data functions for normalization, upsert, delete, filtering, sorting, and URL/domain helpers.
- `popup.js`: Chrome API adapter and DOM rendering.
- `popup.html` / `styles.css`: extension popup surface.
- `tests/*.test.js`: Node-based tests for core behavior and static extension contracts.

## Non-Goals

- No web sync, account system, context menu, side panel, or CRX packaging in this first version.
- No external dependencies or remote assets.
