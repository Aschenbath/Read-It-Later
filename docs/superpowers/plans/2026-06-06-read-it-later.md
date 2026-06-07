# Read It Later Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a self-contained MV3 popup extension that saves the current webpage into a local Read It Later list.

**Architecture:** Pure list behavior lives in `read-later-core.js`, while `popup.js` only adapts Chrome APIs and DOM rendering. Static files stay dependency-free so the folder can be loaded directly via `chrome://extensions`.

**Tech Stack:** Manifest V3, vanilla HTML/CSS/JavaScript, `chrome.storage.local`, `chrome.tabs`, Node `assert` tests.

---

### Task 1: Core Behavior

**Files:**
- Create: `read-later-core.js`
- Create: `tests/read-later-core.test.js`

- [ ] Test URL normalization, domain extraction, current-tab entry creation, upsert de-duplication, deletion, sorting, and search filtering.
- [ ] Implement the pure functions with CommonJS export support for tests and `globalThis.ReadLaterCore` for the popup.

### Task 2: Extension Surface

**Files:**
- Create: `manifest.json`
- Create: `popup.html`
- Create: `styles.css`
- Create: `popup.js`
- Create: `icons/icon.svg`

- [ ] Create a Manifest V3 popup with `storage`, `tabs`, and `activeTab` permissions.
- [ ] Build the screenshot-like popup layout and add/delete/open/search behavior.
- [ ] Keep CSP local-only and avoid inline script.

### Task 3: Contracts, Docs, Verification

**Files:**
- Create: `tests/extension-contract.test.js`
- Create: `README.md`
- Create: `history.md`

- [ ] Verify manifest shape, popup script/style references, required UI IDs, and no remote assets.
- [ ] Document load instructions.
- [ ] Run `node --test tests/*.test.js` and `node --check popup.js read-later-core.js`.
