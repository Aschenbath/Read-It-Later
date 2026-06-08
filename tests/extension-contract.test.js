const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const readBytes = file => fs.readFileSync(path.join(root, file));

const manifest = JSON.parse(read('manifest.json'));
assert.strictEqual(manifest.manifest_version, 3);
assert.strictEqual(manifest.name, 'Read It Later');
assert.strictEqual(manifest.action.default_popup, 'popup.html');
assert.ok(manifest.permissions.includes('storage'));
assert.ok(manifest.permissions.includes('tabs'));
assert.ok(manifest.permissions.includes('activeTab'));
const expectedIconSet = {
  '16': 'icons/icon-16.png',
  '32': 'icons/icon-32.png',
  '48': 'icons/icon-48.png',
  '128': 'icons/icon-128.png'
};
assert.deepStrictEqual(manifest.action.default_icon, expectedIconSet);
assert.deepStrictEqual(manifest.icons, expectedIconSet);
Object.values(expectedIconSet).forEach((iconPath) => {
  const bytes = readBytes(iconPath);
  const signature = bytes.subarray(0, 8);
  const expectedSize = Number(path.basename(iconPath).match(/icon-(\d+)\.png/)[1]);
  assert.strictEqual(signature.toString('hex'), '89504e470d0a1a0a', `${iconPath} must be a real PNG`);
  assert.strictEqual(bytes.readUInt32BE(16), expectedSize, `${iconPath} width must match its manifest slot`);
  assert.strictEqual(bytes.readUInt32BE(20), expectedSize, `${iconPath} height must match its manifest slot`);
});
assert.strictEqual(
  manifest.content_security_policy.extension_pages,
  "script-src 'self'; object-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: chrome: https:;"
);

const html = read('popup.html');
assert.ok(html.includes('<link rel="stylesheet" href="styles.css">'));
assert.ok(html.includes('<script src="read-later-core.js"></script>'));
assert.ok(html.includes('<script src="popup.js"></script>'));
[
  'addCurrentPageBtn',
  'emptyActionBtn',
  'emptyCopy',
  'searchInput',
  'clearSearchBtn',
  'entriesList',
  'emptyState',
  'emptyTitle',
  'statusText'
].forEach(id => assert.ok(html.includes(`id="${id}"`), `missing #${id}`));
assert.strictEqual((html.match(/<script/g) || []).length, 2);
assert.ok(html.includes('role="list"'), 'entries list should expose list semantics');

const popupJs = read('popup.js');
[
  'chrome.tabs.query',
  'chrome.storage.local.get',
  'chrome.storage.local.set',
  'ReadLaterCore.upsertEntry',
  'ReadLaterCore.deleteEntry',
  'ReadLaterCore.filterEntries',
  'chrome.tabs.create'
].forEach(fragment => assert.ok(popupJs.includes(fragment), `missing ${fragment}`));
assert.ok(!popupJs.includes('innerHTML = entry.title'));
assert.ok(!popupJs.includes('innerHTML = entry.domain'));
assert.ok(popupJs.includes('function renderEmptyState'), 'popup should render an empty-state that changes for empty list vs no matches');
assert.ok(popupJs.includes("els.emptyActionBtn.dataset.action = hasNoMatches ? 'clear' : 'add'"), 'empty-state action should clear only for no-match searches');
assert.ok(popupJs.includes("els.clearSearchBtn.addEventListener('click'"), 'search should have a one-click clear control');
assert.ok(
  popupJs.includes('if (state.selectionMode && state.selectedIds.size === 0)') &&
  popupJs.includes('exitSelectionMode();'),
  'deselecting the last selected entry should leave selection mode without a second click'
);
assert.ok(!popupJs.includes('In selection mode but no items selected'), 'selection mode should not render a second empty-selection exit state');
assert.ok(popupJs.includes('els.searchInput.value = state.query;'), 'normal render should restore the real search box value after selection mode');
assert.ok(popupJs.includes("event.key === 'Escape'"), 'Escape should clear an active search quickly');
assert.ok(popupJs.includes("event.key.toLowerCase() === 'k'"), 'Ctrl/Command+K should focus search');
assert.ok(popupJs.includes('ReadLaterCore.formatSavedAt'), 'entries should show relative saved time for scanning');
assert.ok(popupJs.includes('ReadLaterCore.findEntryByUrl'), 'popup should detect whether the current tab is already saved');
assert.ok(popupJs.includes("meta.className = 'entry-meta'"), 'entry cards should render a compact metadata row');
assert.ok(popupJs.includes('state.currentTabEntry'), 'popup should track the saved entry for the current tab');
assert.ok(popupJs.includes('function refreshCurrentTabState'), 'popup should refresh current-tab save state');
assert.ok(popupJs.includes('function renderAddButtonState'), 'add button should reflect current-tab save state');
assert.ok(popupJs.includes("event.key === 'ArrowDown'"), 'keyboard navigation should support ArrowDown');
assert.ok(popupJs.includes("event.key === 'ArrowUp'"), 'keyboard navigation should support ArrowUp');
assert.ok(popupJs.includes("event.key === 'Delete'"), 'keyboard navigation should support Delete on focused entries');
assert.ok(popupJs.includes("openButton.className = 'entry-open-button'"), 'entry open action should be separated from delete action');
assert.ok(popupJs.includes("item.classList.toggle('is-current-tab'"), 'current tab entry should be highlighted');
assert.ok(popupJs.includes("viewMode: 'flat'"), 'flat list should be the default until grouped summaries are explicitly requested');
assert.ok(popupJs.includes("document.body.classList.toggle('flat-view', state.viewMode === 'flat')"), 'default flat view should be reflected on the popup body');
assert.ok(!popupJs.includes('markAsRead'), 'opening an entry should not maintain read/unread state');
assert.ok(!popupJs.includes('toggleReadStatus'), 'popup should not expose read/unread toggling');
assert.ok(!popupJs.includes('is-read'), 'entry rendering should not apply read/unread classes');
assert.ok(!popupJs.includes('`${state.entries.length} saved`'), 'idle footer should not show a passive saved count');
assert.ok(!popupJs.includes("const card = document.createElement('button')"), 'entry card should not be a button containing another button');

const css = read('styles.css');
assert.ok(css.includes('.add-button'));
assert.ok(css.includes('.entry-card'));
assert.ok(css.includes('@media (max-width: 420px)'));
assert.ok(!/https?:\/\//.test(css) || css.includes('fonts.googleapis.com'), 'CSS must not depend on remote assets except Google Fonts');
assert.ok(!css.includes('100vw'), 'extension popup width must not depend on the initial viewport width');
assert.ok(/width:\s*380px/.test(css), 'popup should use the compact 380px action width');
assert.ok(/height:\s*615px/.test(css), 'popup should use golden ratio 615px action height');
assert.ok(/min-height:\s*615px/.test(css), 'popup should use the golden ratio 615px action height');
assert.ok(/height:\s*451px/.test(css), 'list shell should be proportioned for the golden ratio popup');
assert.ok(!/min-width:\s*430px/.test(css), 'old oversized popup width should be gone');
assert.ok(!/min-height:\s*640px/.test(css), 'old oversized popup height should be gone');
assert.ok(css.includes('.search-clear-button'), 'search should expose a clear control');
assert.ok(css.includes('.empty-action-button'), 'empty-state should provide an in-context action button');
assert.ok(css.includes('.entry-open-button'), 'entry open button should be styled as the main card action');
assert.ok(css.includes('.entry-meta'), 'entry metadata should be styled for fast scanning');
assert.ok(css.includes('.entry-card.is-current-tab'), 'current tab entry should have a distinct visual state');
assert.ok(css.includes('.add-button.is-saved'), 'add button should have a distinct saved state');
assert.ok(css.includes('.undo-button'), 'undo affordance should be styled');
assert.ok(css.includes('content: attr(data-letter)'), 'fallback icons should render a branded letter mark');
assert.ok(!css.includes('#ffb300'), 'old Chrome-colored fallback mark should be gone');
assert.ok(!css.includes('.is-read'), 'CSS should not style read/unread entry states');
assert.ok(!css.includes('Unread indicator'), 'CSS should not keep a read/unread indicator');

const icon = read('icons/icon.svg');
assert.ok(icon.includes('bookshelf-stack'), 'icon should read as a compact bookshelf');
assert.ok(icon.includes('bookmark-tab'), 'icon should keep a readable save/bookmark mark');
assert.ok(icon.includes('shelf-lines'), 'icon should carry the shelf accent from the new visual direction');
assert.ok(!icon.includes('width="112" height="112"'), 'old flat square icon should be gone');
assert.ok(!icon.includes('<rect x="82" y="61" width="24"'), 'old plus-only icon should be gone');

assert.ok(popupJs.includes("delIcon.className = 'delete-icon'"), 'delete button should use a styled icon span');
assert.ok(!popupJs.includes('del.textContent'), 'delete button should not depend on a text glyph');
assert.ok(popupJs.includes("del.setAttribute('aria-label'"), 'delete button should keep an accessible label');
