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
const readme = read('README.md');
assert.ok(html.includes('<link rel="stylesheet" href="styles.css">'));
assert.ok(html.includes('<script src="read-later-core.js"></script>'));
assert.ok(html.includes('<script src="popup.js"></script>'));
[
  'addCurrentPageBtn',
  'emptyActionBtn',
  'emptyCopy',
  'searchInput',
  'clearSearchBtn',
  'deleteSelectedBtn',
  'viewModeBtn',
  'entriesList',
  'emptyState',
  'emptyTitle',
  'statusText'
].forEach(id => assert.ok(html.includes(`id="${id}"`), `missing #${id}`));
assert.strictEqual((html.match(/<script/g) || []).length, 2);
assert.ok(html.includes('role="list"'), 'entries list should expose list semantics');
assert.ok(!html.includes('\u9983'), 'popup HTML should not expose mojibake glyphs');
assert.ok(html.includes('class="delete-selected-icon"'), 'bulk delete should use a styled icon span instead of a text glyph');
assert.ok(
  /id="viewModeBtn"[\s\S]*title="Show grouped view"[\s\S]*aria-label="Show grouped view"/.test(html),
  'initial view-mode button label should match the default flat view next action'
);

const popupJs = read('popup.js');
const backgroundJs = read('background.js');
[
  'chrome.tabs.query',
  'chrome.storage.local.get',
  'chrome.storage.local.set',
  'ReadLaterCore.upsertEntry',
  'ReadLaterCore.deleteEntry',
  'ReadLaterCore.filterEntries',
  'chrome.tabs.create'
].forEach(fragment => assert.ok(popupJs.includes(fragment), `missing ${fragment}`));
const currentTabBlock = popupJs.match(/function currentTab\(\) \{[\s\S]*?\n\}/)?.[0] || '';
assert.ok(
  currentTabBlock.includes('chrome.runtime') &&
    currentTabBlock.includes('lastError') &&
    currentTabBlock.includes('reject(new Error'),
  'currentTab() should surface chrome.tabs.query runtime.lastError instead of treating failures as no active tab'
);
assert.ok(!popupJs.includes('innerHTML = entry.title'));
assert.ok(!popupJs.includes('innerHTML = entry.domain'));
assert.ok(popupJs.includes('function renderEmptyState'), 'popup should render an empty-state that changes for empty list vs no matches');
assert.ok(popupJs.includes("els.emptyActionBtn.dataset.action = hasNoMatches ? 'clear' : 'add'"), 'empty-state action should clear only for no-match searches');
assert.ok(popupJs.includes("els.clearSearchBtn.addEventListener('click'"), 'search should have a one-click clear control');
assert.ok(
  popupJs.includes('function renderEmptyState(visible, renderedCount = visible.length)'),
  'empty-state visibility should account for rendered empty custom groups, not only visible entries'
);
assert.ok(
  popupJs.includes('renderEmptyState(visible, elements.length)'),
  'render should hide the empty-state when empty custom groups are rendered'
);
const enterSelectionModeBlock = popupJs.match(/function enterSelectionMode\(\) \{[\s\S]*?\n\}/)?.[0] || '';
assert.ok(!enterSelectionModeBlock.includes('render();'), 'long-press selection should not render an empty selection state before selecting the pressed entry');
assert.ok(
  popupJs.includes('async function commitSelectionToGroup'),
  'selection grouping should use one atomic transaction for create/move/exit'
);
assert.ok(
  popupJs.includes('const selectedIds = options.selectedIds') &&
  popupJs.includes(': new Set(state.selectedIds);'),
  'selection grouping should snapshot selected ids before any async storage write'
);
assert.ok(
  popupJs.includes('pendingGroupSelectedIds'),
  'inline create-group flow should keep a frozen selected-id snapshot while the user types'
);
assert.ok(
  popupJs.includes('state.pendingGroupSelectedIds = Array.from(state.selectedIds);'),
  'clicking the selection-mode add button should snapshot selected ids before rendering the create-group input'
);
assert.ok(
  popupJs.includes('const selectedIds = options.selectedIds') &&
  popupJs.includes('await commitSelectionToGroup(targetDomain, { selectedIds: pendingSelectedIds });'),
  'create-group Enter should commit the frozen selected-id snapshot instead of rereading live selection state'
);
assert.ok(
  popupJs.includes('state.selectionMode = false;') &&
  popupJs.includes('state.selectedIds.clear();') &&
  popupJs.includes("document.body.classList.remove('selection-mode');"),
  'creating or dropping into a group should move selected entries and return to normal mode'
);
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
assert.ok(
  popupJs.includes('ReadLaterCore.renameEntryTitle') &&
    popupJs.includes('state.editingEntryId') &&
    popupJs.includes("edit.className = 'edit-title-button'") &&
    popupJs.includes("input.className = 'entry-title-input'"),
  'entry cards should support inline custom names through the shared rename helper'
);
assert.ok(popupJs.includes("meta.className = 'entry-meta'"), 'entry cards should render a compact metadata row');
assert.ok(popupJs.includes('state.currentTabEntry'), 'popup should track the saved entry for the current tab');
assert.ok(popupJs.includes('function refreshCurrentTabState'), 'popup should refresh current-tab save state');
assert.ok(popupJs.includes('function renderAddButtonState'), 'add button should reflect current-tab save state');
assert.ok(popupJs.includes('function normalizeOpenedDomainTabs'), 'persisted batch-open tab state should be normalized before use');
assert.ok(
  popupJs.includes('filter(tabId => Number.isInteger(tabId))'),
  'persisted batch-open tab ids should keep only integer tab ids'
);
assert.ok(
  popupJs.includes('if (tab && Number.isInteger(tab.id))'),
  'batch open should store only real tab ids returned by chrome.tabs.create'
);
assert.ok(
  popupJs.includes('const openedTabIds = Array.isArray(state.openedDomainTabs.get(group.domain))') &&
    popupJs.includes('tabCountLabel(openedTabIds.length)') &&
    popupJs.includes('tabCountLabel(tabIds.length)'),
  'batch-open close labels should reflect actual tracked tab ids, not total group page count'
);
assert.ok(!popupJs.includes('console.log('), 'popup should not leave debug logging in normal interaction paths');
assert.ok(
  popupJs.includes('document.activeElement.dataset.entryId'),
  'keyboard Enter/Delete should resolve the focused entry by its DOM entry id, not by a flat visibleEntries index'
);
assert.ok(
  popupJs.includes('async function openEntry') &&
    popupJs.includes('function reportOpenEntryError') &&
    popupJs.includes('return openEntry(entry).catch(reportOpenEntryError);'),
  'single-entry open actions should await tab creation failures and surface them instead of fire-and-forget'
);
assert.ok(
  !popupJs.includes('return index >= 0 ? state.visibleEntries[index] : null;'),
  'grouped-view keyboard actions must not map focused DOM index to flat visibleEntries order'
);
assert.ok(popupJs.includes("event.key === 'ArrowDown'"), 'keyboard navigation should support ArrowDown');
assert.ok(popupJs.includes("event.key === 'ArrowUp'"), 'keyboard navigation should support ArrowUp');
assert.ok(popupJs.includes("event.key === 'Delete'"), 'keyboard navigation should support Delete on focused entries');
assert.ok(popupJs.includes("openButton.className = 'entry-open-button'"), 'entry open action should be separated from delete action');
assert.ok(popupJs.includes("item.classList.toggle('is-current-tab'"), 'current tab entry should be highlighted');
assert.ok(popupJs.includes('suppressNextClickAfterLongPress'), 'long press selection should not be immediately undone by the follow-up click event');
assert.ok(popupJs.includes("openButton.addEventListener('mouseleave', cancelLongPress)"), 'long press should cancel when the pointer leaves the entry');
assert.ok(popupJs.includes("openButton.addEventListener('touchcancel', cancelLongPress)"), 'long press should cancel on touchcancel');
assert.ok(!popupJs.includes('entry.timestamp'), 'entry insertion animation should use stored created/updated timestamps, not a missing timestamp field');
const deleteSelectedBlock = popupJs.match(/async function deleteSelectedEntries\(\) \{[\s\S]*?\n\}/)?.[0] || '';
assert.ok(
  deleteSelectedBlock.includes('await setPopupStorage({ [storageKey]: nextEntries });') &&
    deleteSelectedBlock.includes('state.entries = nextEntries;') &&
    deleteSelectedBlock.includes('state.selectionMode = false;') &&
    deleteSelectedBlock.includes('catch (error)') &&
    deleteSelectedBlock.includes('render();') &&
    deleteSelectedBlock.indexOf('await setPopupStorage({ [storageKey]: nextEntries });') < deleteSelectedBlock.indexOf('state.selectionMode = false;'),
  'bulk delete should commit selection cleanup only after storage write succeeds and should re-render on failure'
);
assert.ok(
  popupJs.includes('function reportDeleteError') &&
    popupJs.includes('deleteSelectedEntries().catch(reportDeleteError)') &&
    popupJs.includes('removeEntry(entry).catch(reportDeleteError)'),
  'delete entry actions should catch storage failures and surface them instead of fire-and-forget'
);
const removeEntryBlock = popupJs.match(/async function removeEntry\(entry\) \{[\s\S]*?\n\}/)?.[0] || '';
assert.ok(
  removeEntryBlock.includes('const wasSelected = state.selectedIds.has(entry.id);') &&
    removeEntryBlock.includes('await persist(next.entries);') &&
    removeEntryBlock.includes('state.selectedIds.delete(entry.id);') &&
    removeEntryBlock.includes('state.pendingGroupSelectedIds = state.pendingGroupSelectedIds.filter') &&
    removeEntryBlock.indexOf('await persist(next.entries);') < removeEntryBlock.indexOf('state.selectedIds.delete(entry.id);'),
  'single-entry delete should preserve selection state until storage persistence succeeds'
);
assert.ok(
  popupJs.includes('const ENTRY_EXIT_ANIMATION_MS = 220;') &&
    popupJs.includes('function markCardLeaving') &&
    popupJs.includes("card.style.animation = '';") &&
    popupJs.includes('markCardLeaving(card)') &&
    popupJs.includes('setTimeout(resolve, ENTRY_EXIT_ANIMATION_MS)'),
  'entry deletion should clear fresh inline entryIn and wait for the full CSS entryOut animation'
);
assert.ok(popupJs.includes("viewMode: 'flat'"), 'flat list should be the default until grouped summaries are explicitly requested');
assert.ok(popupJs.includes("document.body.classList.toggle('flat-view', state.viewMode === 'flat')"), 'default flat view should be reflected on the popup body');
assert.ok(
  popupJs.includes("const effectiveViewMode = state.selectionMode ? 'grouped' : state.viewMode"),
  'selection/classification mode should render grouped view so newly created groups are visible as drop targets'
);
assert.ok(
  popupJs.includes("document.body.classList.toggle('flat-view', !state.selectionMode && state.viewMode === 'flat')"),
  'selection/classification mode should not keep flat-view presentation active'
);
assert.ok(popupJs.includes('readLaterExpandedDomains'), 'expanded group state should be stored under a stable key');
assert.ok(popupJs.includes('readLaterViewMode'), 'grouped/flat view mode should be stored under a stable key');
assert.ok(popupJs.includes('readLaterCustomGroups'), 'user-created groups should be stored independently from entry domains');
assert.ok(popupJs.includes('state.expandedDomains = new Set'), 'expanded group state should be restored when the popup opens');
assert.ok(popupJs.includes('state.customGroups ='), 'user-created groups should be restored when the popup opens');
assert.ok(popupJs.includes('function persistExpandedDomains'), 'expanded/collapsed group state should be persisted after toggles');
assert.ok(popupJs.includes('function persistViewMode'), 'grouped/flat view choice should be persisted after toggles');
assert.ok(popupJs.includes('function persistCustomGroups'), 'user-created groups should be persisted after creation');
assert.ok(popupJs.includes('async function createCustomGroup'), 'create-group input should still support creating an empty group when nothing is selected');
assert.ok(popupJs.includes('await commitSelectionToGroup(targetDomain, { selectedIds: pendingSelectedIds });'), 'pressing Enter with selected entries should move them into the new group immediately');
assert.ok(!popupJs.includes('prompt('), 'manual grouping should use the inline create-group input, not a browser prompt');
const createCustomGroupBlock = popupJs.match(/async function createCustomGroup\(groupName\) \{[\s\S]*?\n\}/)?.[0] || '';
assert.ok(!createCustomGroupBlock.includes('state.expandedDomains.add(targetDomain);'), 'empty custom group creation should not persist an expanded empty panel');
assert.ok(
  popupJs.includes('const customGroupsForRender = state.query && !state.selectionMode ? [] : state.customGroups'),
  'normal search should not keep unrelated empty custom groups visible'
);
assert.ok(
  popupJs.includes('ReadLaterCore.groupEntriesByDomain(visible, customGroupsForRender)'),
  'group rendering should include empty user-created groups only when they are useful as visible groups/drop targets'
);
assert.ok(
  popupJs.includes('const isExpanded = state.expandedDomains.has(group.domain);'),
  'selection/classification mode should keep classified groups compact until the user opens them'
);
assert.ok(
  !popupJs.includes('const hasSelectedEntry = state.selectionMode'),
  'selection/classification mode should not auto-expand groups just because they contain selected entries'
);
assert.ok(
  !popupJs.includes('In selection mode, merge selected entries to this group'),
  'clicking a group in selection mode should open/collapse it instead of silently moving selected entries'
);
const groupDropBlock = popupJs.match(/header\.addEventListener\('drop', async \(e\) => \{[\s\S]*?\n  \}\);/)?.[0] || '';
assert.ok(
  groupDropBlock.includes('try {') &&
    groupDropBlock.includes('await commitSelectionToGroup(group.domain);') &&
    groupDropBlock.includes('catch (error)') &&
    groupDropBlock.includes('Could not move pages'),
  'drop-to-group should catch storage failures and surface them instead of leaving an unhandled rejection'
);
assert.ok(
  popupJs.includes('async function removeCustomGroup'),
  'empty user-created groups should be removable from the grouped workspace'
);
assert.ok(
  popupJs.includes('group.count === 0 && wasExpanded'),
  'empty group deletion should be explicitly guarded by its empty count'
);
assert.ok(
  popupJs.includes('state.emptyGroupDeleteArmed'),
  'empty groups should use a chevron-only two-click delete arm instead of expanding empty content'
);
assert.ok(
  popupJs.includes("header.addEventListener('click'"),
  'non-empty group headers should toggle when clicked anywhere on the header'
);
assert.ok(
  popupJs.includes('if (group.count === 0) return;'),
  'empty group header body clicks should not expand or delete the group'
);
assert.ok(
  popupJs.includes('await commitSelectionToGroup(group.domain);'),
  'dropping selected entries onto an existing group should move them and return to normal mode'
);
assert.ok(
  popupJs.includes('function makeIcon(entry = {})'),
  'empty user-created groups should render a fallback icon instead of crashing on undefined entry favIconUrl'
);
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
assert.ok(!/height:\s*451px/.test(css), 'list shell should not reserve a fixed inner scroller height');
assert.ok(
  /\.app\s*\{[\s\S]*?overflow-y:\s*auto;/.test(css),
  'the whole popup app should scroll so the title and search move away with the list'
);
assert.ok(
  /\.list-shell\s*\{[\s\S]*?overflow:\s*visible;/.test(css),
  'list shell should not clip the bottom of the visible reading queue'
);
assert.ok(
  /\.entries-list\s*\{[\s\S]*?overflow-y:\s*visible;/.test(css),
  'entries list should flow in the main popup scroll instead of keeping its own inner scroller'
);
assert.ok(!/min-width:\s*430px/.test(css), 'old oversized popup width should be gone');
assert.ok(!/min-height:\s*640px/.test(css), 'old oversized popup height should be gone');
assert.ok(css.includes('.search-clear-button'), 'search should expose a clear control');
assert.ok(css.includes('.empty-action-button'), 'empty-state should provide an in-context action button');
assert.ok(css.includes('.entry-open-button'), 'entry open button should be styled as the main card action');
assert.ok(css.includes('.edit-title-button'), 'entry cards should expose a compact rename icon button');
assert.ok(css.includes('.entry-title-editor'), 'inline title editing should keep a dedicated card editor surface');
assert.ok(css.includes('.entry-meta'), 'entry metadata should be styled for fast scanning');
assert.ok(css.includes('.entry-card.is-current-tab'), 'current tab entry should have a distinct visual state');
assert.ok(css.includes('.add-button.is-saved'), 'add button should have a distinct saved state');
assert.ok(css.includes('.add-button.is-selection-mode'), 'selection-mode add button should have an explicit create-group visual state');
assert.ok(
  /\.entries-list\s*\{[\s\S]*?overflow-anchor:\s*none;/.test(css),
  'list scroll anchoring should not pull stable groups when another group expands'
);
assert.ok(
  !/\.add-button\.is-selection-mode \.add-icon\s*\{\s*opacity:\s*0\.5;/.test(css),
  'selection-mode add button should not look disabled'
);
assert.ok(!css.includes('.undo-button'), 'stale undo styles should be removed because the undo affordance no longer exists');
assert.ok(css.includes('.delete-selected-icon'), 'bulk delete button should use a CSS-drawn icon');
assert.ok(css.includes('.domain-group-header.is-delete-armed'), 'empty group delete arm state should have visible feedback');
assert.ok(!css.includes('transition: all'), 'popup motion should transition explicit properties instead of animating every property');
const entryHoverBlock = css.match(/\.entry-card:hover \.entry-open-button,[\s\S]*?\n\}/)?.[0] || '';
const groupHeaderHoverBlock = css.match(/\.domain-group-header:hover,[\s\S]*?\n\}/)?.[0] || '';
const selectionGroupHoverBlock = css.match(/\.selection-mode \.domain-group-header:hover,[\s\S]*?\n\}/)?.[0] || '';
const groupHeaderAnimatingBlock = css.match(/\.domain-group-header\.is-animating\s*\{[\s\S]*?\n\}/)?.[0] || '';
assert.ok(
  entryHoverBlock && !entryHoverBlock.includes('transform:'),
  'hovering a saved page should not lift, scale, or move the card'
);
assert.ok(
  groupHeaderHoverBlock && !groupHeaderHoverBlock.includes('transform:'),
  'hovering a group header should not lift, scale, or move the group'
);
assert.ok(
  selectionGroupHoverBlock && !selectionGroupHoverBlock.includes('transform:'),
  'selection-mode group hover/drop feedback should not scale the group'
);
assert.ok(
  !groupHeaderAnimatingBlock.includes('pointer-events: none'),
  'group headers should stay immediately clickable while their expand/collapse animation is settling'
);
const groupContentBlock = css.match(/\.domain-group-content\s*\{[\s\S]*?\n\}/)?.[0] || '';
assert.ok(
  groupContentBlock &&
    groupContentBlock.includes('max-height: 0') &&
    groupContentBlock.includes('max-height 0.3s cubic-bezier(0.22, 0.61, 0.36, 1)') &&
    !/max-height 0\.3s cubic-bezier\(0\.22, 0\.61, 0\.36, 1\)\s+0\.\d+s/.test(groupContentBlock),
  'group content max-height collapse must start immediately after the card exit phase, with no dead transition delay'
);
assert.ok(
  popupJs.includes('function snapshotListPositions') &&
  popupJs.includes('function animateListReflow'),
  'group expansion should keep FLIP reflow alongside the staged card choreography'
);
assert.ok(
  popupJs.includes("contentWrap.classList.add('is-collapsing')") &&
    popupJs.includes("contentWrap.classList.remove('is-collapsing')"),
  'group collapse should keep the explicit is-collapsing animation phase'
);
assert.ok(
  popupJs.includes('let groupAnimationTimer = null;') &&
    popupJs.includes('let groupUnlockTimer = null;') &&
    popupJs.includes('function clearPendingGroupAnimation()') &&
    popupJs.includes('clearTimeout(groupAnimationTimer)') &&
    popupJs.includes('clearTimeout(groupUnlockTimer)'),
  'rapid group toggles should cancel stale expand/collapse cleanup timers before scheduling the next animation'
);
const toggleExpansionBlock = popupJs.match(/const toggleExpansion = async \(\) => \{[\s\S]*?\n  \};/)?.[0] || '';
assert.ok(
  toggleExpansionBlock &&
    toggleExpansionBlock.includes('await persistExpandedDomains();') &&
    toggleExpansionBlock.includes('state.expandedDomains.add(group.domain);') &&
    toggleExpansionBlock.includes('state.expandedDomains.delete(group.domain);') &&
    toggleExpansionBlock.includes("header.classList.remove('is-animating')"),
  'group expand/collapse should await persisted state and roll back visual state on storage failure'
);
assert.ok(
  !toggleExpansionBlock.includes('persistExpandedDomains().catch'),
  'group expand/collapse persistence should not be fire-and-forget'
);
assert.ok(
  toggleExpansionBlock.includes('contentWrap.style.maxHeight = `${contentWrap.scrollHeight}px`;') &&
    toggleExpansionBlock.includes("contentWrap.style.maxHeight = '0px';"),
  'group collapse should animate max-height down from the real rendered height so the close is a visible motion instead of a delayed snap'
);
assert.ok(
  toggleExpansionBlock.includes('Math.min(group.count, GROUP_CARD_STAGGER_LIMIT)') &&
    popupJs.includes('const GROUP_CARD_EXIT_MS = 350;') &&
    popupJs.includes('const GROUP_CARD_STAGGER_MS = 60;'),
  'group collapse wait should scale with the actual staggered card count instead of always waiting for the worst-case stagger'
);
assert.ok(
  popupJs.includes('contentWrap.offsetHeight;') &&
    !popupJs.includes('requestAnimationFrame(() => {\n      requestAnimationFrame(() => {\n        contentWrap.classList.add(\'is-expanded\');'),
  'group expansion should keep forced reflow for user-opened groups without replaying already-expanded groups after render'
);
const groupedEntryBlock = css.match(/\.domain-group-entries \.entry-card\s*\{[\s\S]*?\n\}/)?.[0] || '';
assert.ok(
  groupedEntryBlock &&
    groupedEntryBlock.includes('opacity: 0') &&
    groupedEntryBlock.includes('translateX(-35px) scale(0.9)') &&
    groupedEntryBlock.includes('transform 0.35s cubic-bezier(0.22, 0.61, 0.36, 1)'),
  'grouped cards should keep their staged left-side expand/collapse transform'
);
const entryCardBlock = css.match(/\.entry-card\s*\{[\s\S]*?\n\}/)?.[0] || '';
assert.ok(
  entryCardBlock && !/animation:\s*entryIn/.test(entryCardBlock),
  'entry cards should not replay default entryIn after mode-enter classes are removed'
);
assert.ok(
  popupJs.includes("!state.isTransitioningMode && entryAge < 2000") &&
    popupJs.includes("item.style.animation = 'entryIn"),
  'fresh-entry animation should stay opt-in through renderEntry and be suppressed during mode switches'
);
const domainContentBlock = css.match(/\.domain-group-content\s*\{[\s\S]*?\n\}/)?.[0] || '';
assert.ok(
  domainContentBlock && domainContentBlock.includes('overflow: hidden'),
  'collapsed group content should clip child cards so grouped mode-enter cannot visually expose collapsed groups'
);
const toggleViewModeBlock = popupJs.match(/(?:async )?function toggleViewMode\(\) \{[\s\S]*?\n\}/)?.[0] || '';
assert.ok(toggleViewModeBlock, 'popup should keep a dedicated view-mode toggle function');
assert.ok(toggleViewModeBlock.startsWith('async function'), 'view-mode switching should keep its async two-phase transition');
assert.ok(toggleViewModeBlock.includes('state.isTransitioningMode'), 'view-mode switching should guard against overlapping transitions');
assert.ok(toggleViewModeBlock.includes('mode-exit-grouped') && toggleViewModeBlock.includes('mode-exit-flat'), 'view-mode switching should attach exit animation classes');
assert.ok(toggleViewModeBlock.includes('mode-enter-flat') && toggleViewModeBlock.includes('mode-enter-grouped'), 'view-mode switching should attach enter animation classes in both directions');
assert.ok(toggleViewModeBlock.includes("card.classList.add('is-exiting')"), 'view-mode switching should keep the original per-card exit animation hook');
assert.ok(toggleViewModeBlock.includes("group.classList.add('is-transitioning')"), 'view-mode switching should keep the original per-group exit animation hook');
assert.ok(toggleViewModeBlock.includes('setTimeout(resolve, 600)') && toggleViewModeBlock.includes('setTimeout(resolve, 700)'), 'view-mode switching should keep the original two-phase mode timing');
assert.ok(
  toggleViewModeBlock.includes('const previousMode = state.viewMode;') &&
    toggleViewModeBlock.includes('const nextMode =') &&
    toggleViewModeBlock.includes('const persistNextMode = persistViewMode(nextMode)') &&
    toggleViewModeBlock.includes(".then(() => ({ ok: true }))") &&
    toggleViewModeBlock.includes("catch(error => ({ ok: false, error }))") &&
    toggleViewModeBlock.includes('const persistResult = await persistNextMode;') &&
    toggleViewModeBlock.includes('state.viewMode = previousMode;') &&
    toggleViewModeBlock.includes('state.isTransitioningMode = false;'),
  'view-mode switching should start storage persistence during exit motion, still treat it as the commit boundary, and roll back cleanly on failure'
);
assert.ok(
  toggleViewModeBlock.indexOf('const persistNextMode = persistViewMode(nextMode)') < toggleViewModeBlock.indexOf('document.body.classList.add(exitClass)'),
  'view-mode persistence should start before the exit animation so storage latency is hidden behind motion'
);
assert.ok(
  !toggleViewModeBlock.includes('persistViewMode().catch'),
  'view-mode persistence should not be fire-and-forget during mode transitions'
);
assert.ok(css.includes('body.mode-exit-grouped') && css.includes('body.mode-exit-flat'), 'CSS should include full-list view-mode exit animations');
assert.ok(css.includes('body.mode-enter-grouped') && css.includes('body.mode-enter-flat'), 'CSS should include full-list view-mode enter animations');
assert.ok(
  css.includes('body.mode-exit-grouped .domain-group') &&
    css.includes('body.mode-exit-grouped .domain-group-entries .entry-card.is-exiting') &&
    css.includes('body.mode-exit-flat .entry-card.is-exiting'),
  'mode exit animations should keep the original group/card choreography'
);
assert.ok(
  css.includes('cardEnterGrouped') &&
    css.includes('cardEnterFlat') &&
    css.includes('containerFadeIn'),
  'mode enter animations should keep the original grouped/flat keyframes'
);
assert.ok(
  /body\.mode-enter-flat \.entry-card/.test(css) &&
    /body\.mode-enter-grouped \.domain-group-content\.is-expanded \.domain-group-entries \.entry-card/.test(css) &&
    /body\.mode-exit-flat \.entry-card/.test(css) &&
    /body\.mode-exit-grouped \.domain-group-entries \.entry-card/.test(css),
  'mode switching should target the same individual cards as the established choreography'
);
assert.ok(
  !/body\.mode-enter-grouped\s+\.domain-group-entries\s+\.entry-card/.test(css),
  'grouped mode-enter should not animate cards from collapsed groups'
);
assert.ok(
  css.includes('body.mode-enter-grouped .domain-group-content.is-expanded .domain-group-entries .entry-card'),
  'mode-enter grouped cards should override already-expanded group-card transition state'
);
assert.ok(
  /body\.mode-enter-grouped \.domain-group-content\.is-expanded \.domain-group-entries \.entry-card\s*\{[\s\S]*?transition:\s*none;[\s\S]*?animation:\s*cardEnterGrouped[\s\S]*?\sboth;/.test(css),
  'mode-enter grouped cards should use the mode animation, not local expand transition state'
);
assert.ok(
  /body\.mode-enter-flat \.entry-card\s*\{[\s\S]*?animation:\s*cardEnterFlat[\s\S]*?\sboth;/.test(css),
  'mode-enter flat cards should hold their first animation frame during stagger delays'
);
assert.ok(
  css.includes('.domain-group-entries .entry-card:nth-child(even)') &&
    css.includes('translateX(35px) scale(0.9)') &&
    css.includes('.domain-group-content.is-collapsing .domain-group-entries .entry-card:nth-child(even)'),
  'local group expand/collapse should keep the alternating left/right choreography'
);
assert.ok(!css.includes('.entries-list.fade-bottom'), 'bottom list fade should stay removed so the last card remains fully visible');
assert.ok(!css.includes('mask-image:'), 'popup list should not use mask-image clipping on saved entries');
assert.ok(!popupJs.includes('function updateScrollFades()'), 'popup should not maintain obsolete inner-list fade state');
assert.ok(
  popupJs.includes("title.classList.toggle('tooltip-above'") &&
    css.includes('.entry-title.tooltip-above[title]:hover::after'),
  'long-title tooltips should flip above low cards so the list clip cannot cut them off'
);
assert.ok(
  popupJs.includes('count.textContent = pageCountLabel(group.count);') &&
    !popupJs.includes('pages from ${group.domain}`'),
  'group header count and aria label should use the shared singular/plural page label'
);
assert.ok(!css.includes('.entry-domain'), 'dead per-card domain styling should stay removed');
assert.ok(
  /\.entry-open-button:focus-visible\s*\{[^}]*outline: 2px solid rgba\(79, 155, 133, 0\.45\)/.test(css) &&
    /\.delete-button:focus-visible\s*\{[^}]*outline: 2px solid rgba\(184, 92, 87, 0\.35\)/.test(css),
  'keyboard focus on entry cards and delete buttons should show a visible focus ring'
);
assert.ok(
  popupJs.includes("letter.className = 'fallback-icon-letter'") &&
    css.includes('.fallback-icon-letter') &&
    !css.includes('content: attr(data-letter)'),
  'fallback icons should use a real centered letter node instead of pseudo-content that visually drifts with CJK glyphs'
);
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
assert.ok(!html.includes('\u{1f5d1}'), 'bulk delete button should not depend on an emoji glyph');
assert.ok(!readme.includes('\u{1f5d1}'), 'README should describe the CSS delete button without promising an emoji glyph');
assert.ok(popupJs.includes("del.setAttribute('aria-label'"), 'delete button should keep an accessible label');

assert.ok(backgroundJs.includes('ReadLaterCore.STORAGE_KEY'), 'background shortcut should use the shared storage key');
assert.ok(backgroundJs.includes('ReadLaterCore.normalizeEntries'), 'background shortcut should rebuild stored entries through the shared recovery helper');
assert.ok(backgroundJs.includes('ReadLaterCore.findEntryByUrl'), 'background shortcut should detect existing entries with normalized URLs');
assert.ok(backgroundJs.includes('ReadLaterCore.deleteEntry'), 'background shortcut should remove the normalized existing entry');
assert.ok(backgroundJs.includes('ReadLaterCore.upsertEntry'), 'background shortcut should add pages through the shared dedupe logic');
assert.ok(!backgroundJs.includes('e.url === entry.url'), 'background shortcut must not compare raw URLs');
assert.ok(!backgroundJs.includes('chrome.notifications.getAll'), 'notification cleanup should clear only the notification it created');
assert.ok(
  backgroundJs.includes('chrome.notifications.create') &&
    backgroundJs.includes('chrome.notifications.clear') &&
    backgroundJs.includes('chrome.runtime') &&
    backgroundJs.includes('lastError') &&
    backgroundJs.includes('Failed to create notification') &&
    backgroundJs.includes('Failed to clear notification'),
  'background notification create/clear callbacks should surface chrome.runtime.lastError'
);
assert.ok(
  popupJs.includes('ReadLaterCore.normalizeEntries(result[storageKey])'),
  'popup startup should rebuild stored entries through the shared recovery helper before render'
);
assert.ok(
  read('read-later-core.js').includes('function normalizeEntries') &&
    read('read-later-core.js').includes('isSavableUrl(entry.url)'),
  'shared storage recovery should drop entries that cannot be saved/opened by the current URL policy'
);
assert.ok(
  read('read-later-core.js').includes("const LOCAL_FILE_DOMAIN = 'Local Files';") &&
    read('read-later-core.js').includes("if (parsed.protocol === 'file:')") &&
    read('read-later-core.js').includes('return true;') &&
    read('read-later-core.js').includes('function renameEntryTitle'),
  'local file saving should allow file:// URLs under a unified Local Files group and keep custom-title support in core'
);

const storageChangedBlock = popupJs.match(/chrome\.storage\.onChanged\.addListener\(\(changes, areaName\) => \{[\s\S]*?\n  \}\);/)?.[0] || '';
assert.ok(
  storageChangedBlock.includes('shouldReloadFromStorageChange(changes, areaName)'),
  'popup storage listener should delegate reload decisions through the storage echo guard'
);
assert.ok(
  storageChangedBlock.includes('Failed to reload entries:') &&
    storageChangedBlock.includes('setStatus('),
  'popup storage reload failures should be visible to the user instead of console-only'
);
const shouldReloadBlock = popupJs.match(/function shouldReloadFromStorageChange\(changes, areaName\) \{[\s\S]*?\n\}/)?.[0] || '';
assert.ok(
  shouldReloadBlock.includes('let shouldReload = false;') &&
  shouldReloadBlock.includes('forEach(key =>') &&
  shouldReloadBlock.includes('if (changes[key] && !consumeStorageEcho(key, changes[key]))') &&
  shouldReloadBlock.includes('return shouldReload;') &&
  shouldReloadBlock.includes('storageKey') &&
  shouldReloadBlock.includes('customGroupsStorageKey') &&
  shouldReloadBlock.includes('expandedDomainsStorageKey') &&
  shouldReloadBlock.includes('viewModeStorageKey') &&
  shouldReloadBlock.includes("'openedDomainTabs'"),
  'popup should reload when entries, custom groups, expanded state, view mode, or opened-tab state change in storage'
);
assert.ok(
  popupJs.includes('const pendingStorageEchoes = new Map();') &&
  popupJs.includes('async function setPopupStorage') &&
  popupJs.includes('function consumeStorageEcho'),
  'popup-originated storage writes should be tracked so their onChanged echo does not reload the same popup'
);
assert.strictEqual(
  (popupJs.match(/await chromeSet\(/g) || []).length,
  1,
  'business storage writes should go through setPopupStorage; chromeSet should only be awaited by the echo-guard wrapper'
);
