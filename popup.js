(function () {
const ReadLaterCore = globalThis.ReadLaterCore;
const storageKey = ReadLaterCore.STORAGE_KEY;
const expandedDomainsStorageKey = 'readLaterExpandedDomains';
const viewModeStorageKey = 'readLaterViewMode';
const customGroupsStorageKey = 'readLaterCustomGroups';
const pinnedGroupsStorageKey = 'readLaterPinnedGroups';
const entryOrderStorageKey = 'readLaterEntryOrder';
const groupOrderStorageKey = 'readLaterGroupOrder';
const state = {
  entries: [],
  query: '',
  busy: false,
  visibleEntries: [],
  currentTab: null,
  currentTabEntry: null,
  expandedDomains: new Set(),
  emptyGroupDeleteArmed: new Set(),
  customGroups: [],
  pinnedGroups: new Set(),
  entryOrder: [],
  groupOrder: [],
  openedDomainTabs: new Map(), // domain -> array of tab IDs
  selectionMode: false,
  groupOrganize: false,
  selectedIds: new Set(),
  pendingGroupSelectedIds: [],
  showCreateGroup: false,
  viewMode: 'flat', // 'grouped' or 'flat'
  isTransitioningMode: false,
  editingEntryId: null
};

const els = {};
let statusTimer = null;
const pendingStorageEchoes = new Map();
const ENTRY_EXIT_ANIMATION_MS = 220;
const GROUP_CARD_EXIT_MS = 350;
const GROUP_CARD_STAGGER_MS = 60;
const GROUP_CARD_STAGGER_LIMIT = 8;
const GROUP_CONTENT_CLOSE_MS = 300;

// Drag auto-scroll: while dragging a selected card toward the top/bottom edge
// of the popup, scroll the .app container in that direction so a target group
// that sits off-screen can be reached without stopping to scroll the touchpad
// mid-drag. Native HTML5 dragover only fires on pointer movement, so the actual
// scrolling runs on its own rAF loop driven by the last tracked pointer Y; this
// keeps scrolling even when the pointer is held still inside an edge zone.
const DRAG_SCROLL_EDGE_PX = 64;
const DRAG_SCROLL_MAX_SPEED = 16;
const dragAutoScroll = {
  rafId: null,
  velocity: 0,
  active: false,
  start() {
    if (!els.app) return;
    this.active = true;
    this.velocity = 0;
    if (this.rafId === null && typeof requestAnimationFrame === 'function') {
      this.rafId = requestAnimationFrame(() => this.step());
    }
  },
  track(clientY) {
    if (!this.active || typeof clientY !== 'number' || Number.isNaN(clientY)) {
      return;
    }
    const container = els.app;
    if (!container || typeof container.getBoundingClientRect !== 'function') {
      this.velocity = 0;
      return;
    }
    const rect = container.getBoundingClientRect();
    const topZone = rect.top + DRAG_SCROLL_EDGE_PX;
    const bottomZone = rect.bottom - DRAG_SCROLL_EDGE_PX;
    if (clientY < topZone) {
      const depth = Math.min(topZone - clientY, DRAG_SCROLL_EDGE_PX);
      this.velocity = -DRAG_SCROLL_MAX_SPEED * (depth / DRAG_SCROLL_EDGE_PX);
    } else if (clientY > bottomZone) {
      const depth = Math.min(clientY - bottomZone, DRAG_SCROLL_EDGE_PX);
      this.velocity = DRAG_SCROLL_MAX_SPEED * (depth / DRAG_SCROLL_EDGE_PX);
    } else {
      this.velocity = 0;
    }
  },
  step() {
    if (!this.active) {
      this.rafId = null;
      return;
    }
    const container = els.app;
    if (container && this.velocity !== 0) {
      container.scrollTop += this.velocity;
    }
    this.rafId = typeof requestAnimationFrame === 'function'
      ? requestAnimationFrame(() => this.step())
      : null;
  },
  stop() {
    this.active = false;
    this.velocity = 0;
    if (this.rafId !== null && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(this.rafId);
    }
    this.rafId = null;
  }
};

// Drag-to-reorder (organize mode): an entry drag reorders cards within their own
// list (a group, or the flat list); a group-header drag reorders the groups. The
// active drag is tracked here so a header can tell an entry drop (reclassify)
// apart from a group drop (reorder), and so cross-list entry drops are ignored.
const activeDrag = { kind: null, entryIds: [], groupKey: null, context: null };
let lastDropTarget = null;

function setDropIndicator(element, position) {
  if (lastDropTarget && lastDropTarget !== element) {
    lastDropTarget.classList.remove('is-drop-before', 'is-drop-after');
  }
  element.classList.remove('is-drop-before', 'is-drop-after');
  element.classList.add(position === 'after' ? 'is-drop-after' : 'is-drop-before');
  lastDropTarget = element;
}

function clearDropIndicator() {
  if (lastDropTarget) {
    lastDropTarget.classList.remove('is-drop-before', 'is-drop-after');
    lastDropTarget = null;
  }
}

function dropPositionFromPointer(element, clientY) {
  if (!element || typeof element.getBoundingClientRect !== 'function' || typeof clientY !== 'number') {
    return 'after';
  }
  const rect = element.getBoundingClientRect();
  return (clientY - rect.top) < rect.height / 2 ? 'before' : 'after';
}

// Reorder context for an entry card: the group domain when inside a group,
// '__flat__' for a flat-view top-level card, or null when not reorderable (a
// grouped-view top-level single keeps its default placement in v1).
function entryReorderContext(card) {
  const groupEl = card && typeof card.closest === 'function' ? card.closest('.domain-group') : null;
  if (groupEl) {
    return groupEl.dataset && groupEl.dataset.domain ? groupEl.dataset.domain : '';
  }
  return state.viewMode === 'flat' ? '__flat__' : null;
}

function domEntryOrder() {
  if (!els.entriesList || typeof els.entriesList.querySelectorAll !== 'function') return [];
  return Array.from(els.entriesList.querySelectorAll('.entry-card'))
    .map(card => (card.dataset ? card.dataset.id : ''))
    .filter(Boolean);
}

function domGroupOrder() {
  if (!els.entriesList || typeof els.entriesList.querySelectorAll !== 'function') return [];
  return Array.from(els.entriesList.querySelectorAll('.domain-group'))
    .map(node => (node.dataset ? node.dataset.domain : ''))
    .filter(Boolean);
}

async function commitEntryReorder(targetEntryId, position) {
  const movedIds = activeDrag.entryIds.map(String).filter(Boolean);
  if (!movedIds.length || targetEntryId == null || movedIds.includes(String(targetEntryId))) {
    return;
  }
  const nextOrder = ReadLaterCore.reorderIds(domEntryOrder(), movedIds, targetEntryId, position);
  try {
    await persistEntryOrder(nextOrder);
  } catch (error) {
    setStatus(error && error.message ? error.message : 'Could not save order');
    return;
  }
  state.entryOrder = nextOrder;
  render();
}

async function commitGroupReorder(targetGroupKey, position) {
  const movedKey = activeDrag.groupKey;
  if (!movedKey || targetGroupKey == null || movedKey === String(targetGroupKey)) {
    return;
  }
  const nextOrder = ReadLaterCore.reorderGroupKeys(domGroupOrder(), movedKey, targetGroupKey, position);
  try {
    await persistGroupOrder(nextOrder);
  } catch (error) {
    setStatus(error && error.message ? error.message : 'Could not save group order');
    return;
  }
  state.groupOrder = nextOrder;
  render();
}

function byId(id) {
  return document.getElementById(id);
}

function setStatus(text, options = {}) {
  els.statusText.textContent = text || '';
  els.statusText.classList.remove('is-fading');

  // Clear any existing timer
  if (statusTimer) {
    clearTimeout(statusTimer);
    statusTimer = null;
  }

  // Auto-clear after delay (default 3 seconds)
  if (text && options.autoClear !== false) {
    const delay = options.delay || 3000;
    statusTimer = setTimeout(() => {
      // Fade out before clearing
      els.statusText.classList.add('is-fading');
      setTimeout(() => {
        els.statusText.textContent = '';
        els.statusText.classList.remove('is-fading');
      }, 300); // Match CSS transition duration
      statusTimer = null;
    }, delay);
  }
}

function makeFallbackIcon(entry) {
  const fallback = document.createElement('span');
  const raw = String((entry && (entry.domain || entry.title)) || '?').replace(/^www\./i, '');
  fallback.className = 'fallback-icon';
  const letter = document.createElement('span');
  letter.className = 'fallback-icon-letter';
  letter.textContent = (raw.charAt(0) || '?').toUpperCase();
  letter.setAttribute('aria-hidden', 'true');
  fallback.appendChild(letter);
  return fallback;
}

function chromeGet(keys) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(keys, (result) => {
      const err = chrome.runtime && chrome.runtime.lastError;
      if (err) {
        reject(new Error(err.message || String(err)));
        return;
      }
      resolve(result || {});
    });
  });
}

function chromeSet(values) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.set(values, () => {
      const err = chrome.runtime && chrome.runtime.lastError;
      if (err) reject(new Error(err.message || String(err)));
      else resolve();
    });
  });
}

function storageFingerprint(value) {
  try {
    return JSON.stringify(value);
  } catch (error) {
    return String(value);
  }
}

function trackStorageEchoes(values) {
  Object.entries(values || {}).forEach(([key, value]) => {
    const echoes = pendingStorageEchoes.get(key) || [];
    echoes.push(storageFingerprint(value));
    pendingStorageEchoes.set(key, echoes);
  });
}

function clearTrackedStorageEchoes(values) {
  Object.entries(values || {}).forEach(([key, value]) => {
    const echoes = pendingStorageEchoes.get(key);
    if (!echoes || echoes.length === 0) return;

    const fingerprint = storageFingerprint(value);
    const index = echoes.indexOf(fingerprint);
    if (index >= 0) {
      echoes.splice(index, 1);
    }
    if (echoes.length === 0) {
      pendingStorageEchoes.delete(key);
    }
  });
}

async function setPopupStorage(values) {
  trackStorageEchoes(values);
  try {
    await chromeSet(values);
  } catch (error) {
    clearTrackedStorageEchoes(values);
    throw error;
  }
}

function consumeStorageEcho(key, change) {
  const echoes = pendingStorageEchoes.get(key);
  if (!echoes || echoes.length === 0 || !change) {
    return false;
  }

  const fingerprint = storageFingerprint(change.newValue);
  const index = echoes.indexOf(fingerprint);
  if (index < 0) {
    return false;
  }

  echoes.splice(index, 1);
  if (echoes.length === 0) {
    pendingStorageEchoes.delete(key);
  }
  return true;
}

function shouldReloadFromStorageChange(changes, areaName) {
  if (areaName !== 'local') return false;

  let shouldReload = false;
  [
    storageKey,
    customGroupsStorageKey,
    expandedDomainsStorageKey,
    viewModeStorageKey,
    pinnedGroupsStorageKey,
    entryOrderStorageKey,
    groupOrderStorageKey,
    'openedDomainTabs'
  ].forEach(key => {
    if (changes[key] && !consumeStorageEcho(key, changes[key])) {
      shouldReload = true;
    }
  });
  return shouldReload;
}

function currentTab() {
  return new Promise((resolve, reject) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const err = chrome.runtime && chrome.runtime.lastError;
      if (err) {
        reject(new Error(err.message || String(err)));
        return;
      }
      resolve((tabs || [])[0] || null);
    });
  });
}

function normalizeOpenedDomainTabs(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return new Map();
  }

  const normalized = new Map();
  Object.entries(value).forEach(([domain, tabIds]) => {
    const cleanDomain = ReadLaterCore.cleanText(domain);
    const cleanTabIds = Array.isArray(tabIds)
      ? tabIds.map(tabId => Number(tabId)).filter(tabId => Number.isInteger(tabId))
      : [];
    if (cleanDomain && cleanTabIds.length > 0) {
      normalized.set(cleanDomain, cleanTabIds);
    }
  });
  return normalized;
}

function pageCountLabel(count) {
  const value = Number(count) || 0;
  return `${value} ${value === 1 ? 'page' : 'pages'}`;
}

function tabCountLabel(count) {
  const value = Number(count) || 0;
  return `${value} ${value === 1 ? 'tab' : 'tabs'}`;
}

function isMissingTabError(error) {
  const message = String(error && error.message ? error.message : error || '');
  return /no tab with id|invalid tab id|cannot find tab/i.test(message);
}

async function loadEntries() {
  const result = await chromeGet({
    [storageKey]: [],
    openedDomainTabs: {},
    [expandedDomainsStorageKey]: [],
    [viewModeStorageKey]: 'flat',
    [customGroupsStorageKey]: [],
    [pinnedGroupsStorageKey]: [],
    [entryOrderStorageKey]: [],
    [groupOrderStorageKey]: []
  });
  state.entries = ReadLaterCore.normalizeEntries(result[storageKey]);

  // Restore opened domain tabs state
  const savedOpenedTabs = result.openedDomainTabs || {};
  state.openedDomainTabs = normalizeOpenedDomainTabs(savedOpenedTabs);
  const savedExpandedDomains = Array.isArray(result[expandedDomainsStorageKey])
    ? result[expandedDomainsStorageKey]
    : [];
  state.expandedDomains = new Set(savedExpandedDomains.filter(domain => typeof domain === 'string' && domain));
  state.customGroups = Array.isArray(result[customGroupsStorageKey])
    ? result[customGroupsStorageKey].map(group => ReadLaterCore.cleanText(group)).filter(Boolean)
    : [];
  state.pinnedGroups = new Set(
    Array.isArray(result[pinnedGroupsStorageKey])
      ? result[pinnedGroupsStorageKey].map(group => ReadLaterCore.cleanText(group)).filter(Boolean)
      : []
  );
  state.viewMode = result[viewModeStorageKey] === 'grouped' ? 'grouped' : 'flat';
  state.entryOrder = Array.isArray(result[entryOrderStorageKey])
    ? result[entryOrderStorageKey].map(id => String(id)).filter(Boolean)
    : [];
  state.groupOrder = Array.isArray(result[groupOrderStorageKey])
    ? result[groupOrderStorageKey].map(key => ReadLaterCore.cleanText(key)).filter(Boolean)
    : [];

  let currentTabError = null;
  try {
    await refreshCurrentTabState({ render: false, force: true });
  } catch (error) {
    currentTabError = error;
    state.currentTab = null;
    syncCurrentTabEntry();
  }
  render();
  if (currentTabError) {
    setStatus(currentTabError.message || 'Could not detect current tab');
  }
}

async function persist(entries) {
  const nextEntries = ReadLaterCore.sortEntriesForDisplay(entries);
  await setPopupStorage({ [storageKey]: nextEntries });
  state.entries = nextEntries;
  render();
}

async function persistOpenedTabs() {
  const openedTabsObj = Object.fromEntries(state.openedDomainTabs);
  await setPopupStorage({ openedDomainTabs: openedTabsObj });
}

async function persistExpandedDomains() {
  await setPopupStorage({ [expandedDomainsStorageKey]: Array.from(state.expandedDomains) });
}

async function persistViewMode(viewMode = state.viewMode) {
  await setPopupStorage({ [viewModeStorageKey]: viewMode });
}

async function persistCustomGroups() {
  await setPopupStorage({ [customGroupsStorageKey]: state.customGroups });
}

async function persistPinnedGroups(pinnedGroups = state.pinnedGroups) {
  await setPopupStorage({ [pinnedGroupsStorageKey]: Array.from(pinnedGroups) });
}

async function persistEntryOrder(entryOrder = state.entryOrder) {
  await setPopupStorage({ [entryOrderStorageKey]: [...entryOrder] });
}

async function persistGroupOrder(groupOrder = state.groupOrder) {
  await setPopupStorage({ [groupOrderStorageKey]: [...groupOrder] });
}

function enterSelectionMode(options = {}) {
  state.selectionMode = true;
  state.selectedIds.clear();
  state.pendingGroupSelectedIds = [];
  state.showCreateGroup = false;
  state.editingEntryId = null;
  // Entered by long-pressing a group header (vs an entry): organize mode then
  // persists without any selected entry so groups can be dragged to reorder.
  state.groupOrganize = options.groupOrganize === true;
  document.body.classList.add('selection-mode');
}

function exitSelectionMode() {
  state.selectionMode = false;
  state.selectedIds.clear();
  state.pendingGroupSelectedIds = [];
  state.showCreateGroup = false;
  state.editingEntryId = null;
  state.groupOrganize = false;
  document.body.classList.remove('selection-mode');
  render();
}

async function toggleViewMode() {
  if (state.selectionMode) return;
  if (state.isTransitioningMode) return;
  state.isTransitioningMode = true;

  if (els.viewModeBtn) {
    els.viewModeBtn.disabled = true;
  }

  const previousMode = state.viewMode;
  const isCurrentlyGrouped = previousMode === 'grouped';
  const nextMode = isCurrentlyGrouped ? 'flat' : 'grouped';
  const exitClass = isCurrentlyGrouped ? 'mode-exit-grouped' : 'mode-exit-flat';
  const enterClass = isCurrentlyGrouped ? 'mode-enter-flat' : 'mode-enter-grouped';
  const rollbackEnterClass = isCurrentlyGrouped ? 'mode-enter-grouped' : 'mode-enter-flat';
  const persistNextMode = persistViewMode(nextMode)
    .then(() => ({ ok: true }))
    .catch(error => ({ ok: false, error }));

  document.body.classList.add(exitClass);

  if (isCurrentlyGrouped) {
    const domainGroups = els.entriesList.querySelectorAll('.domain-group');
    domainGroups.forEach(group => {
      group.classList.add('is-transitioning');
      const cards = group.querySelectorAll('.entry-card');
      cards.forEach(card => card.classList.add('is-exiting'));
    });
  } else {
    const cards = els.entriesList.querySelectorAll('.entry-card');
    cards.forEach(card => card.classList.add('is-exiting'));
  }

  await new Promise(resolve => setTimeout(resolve, 600));

  document.body.classList.remove(exitClass);

  const persistResult = await persistNextMode;
  if (!persistResult.ok) {
    const error = persistResult.error;
    state.viewMode = previousMode;
    document.body.classList.toggle('flat-view', state.viewMode === 'flat');
    document.body.classList.add(rollbackEnterClass);
    render();
    setStatus(error && error.message ? error.message : 'Could not save view mode');
    await new Promise(resolve => setTimeout(resolve, 700));
    document.body.classList.remove(rollbackEnterClass);
    state.isTransitioningMode = false;
    renderViewModeButtonState();
    return;
  }

  state.viewMode = nextMode;
  document.body.classList.toggle('flat-view', state.viewMode === 'flat');
  document.body.classList.add(enterClass);

  render();

  await new Promise(resolve => setTimeout(resolve, 700));

  document.body.classList.remove(enterClass);
  state.isTransitioningMode = false;
  renderViewModeButtonState();
}

function toggleSelection(entryId) {
  if (state.selectedIds.has(entryId)) {
    state.selectedIds.delete(entryId);
  } else {
    state.selectedIds.add(entryId);
  }
  if (state.selectionMode && state.showCreateGroup) {
    state.pendingGroupSelectedIds = Array.from(state.selectedIds);
  }
  if (state.selectionMode && state.selectedIds.size === 0 && !state.groupOrganize) {
    exitSelectionMode();
    return;
  }
  render();
}

async function deleteSelectedEntries() {
  if (state.selectedIds.size === 0) return;

  const idsToDelete = Array.from(state.selectedIds);
  const nextEntries = ReadLaterCore.sortEntriesForDisplay(
    state.entries.filter(e => !idsToDelete.includes(e.id))
  );

  // Add leaving animation to all selected cards
  const cards = idsToDelete.map(id =>
    els.entriesList.querySelector(`[data-id="${CSS.escape(id)}"]`)
  ).filter(Boolean);

  cards.forEach(card => {
    markCardLeaving(card);
  });

  // Wait for animation
  if (cards.length > 0) {
    await new Promise(resolve => setTimeout(resolve, ENTRY_EXIT_ANIMATION_MS));
  }

  try {
    await setPopupStorage({ [storageKey]: nextEntries });
  } catch (error) {
    render();
    throw error;
  }

  state.entries = nextEntries;
  state.selectionMode = false;
  state.selectedIds.clear();
  state.pendingGroupSelectedIds = [];
  state.showCreateGroup = false;
  document.body.classList.remove('selection-mode');
  render();
}

async function commitSelectionToGroup(targetDomain, options = {}) {
  const groupName = ReadLaterCore.cleanText(targetDomain);
  if (!groupName) return false;

  const selectedIds = options.selectedIds
    ? new Set(options.selectedIds)
    : new Set(state.selectedIds);
  if (selectedIds.size === 0) {
    return false;
  }

  let movedCount = 0;
  const updatedEntries = state.entries.map(entry => {
    if (!selectedIds.has(entry.id)) {
      return entry;
    }
    movedCount += 1;
    return { ...entry, domain: groupName };
  });

  if (movedCount === 0) {
    setStatus('Select pages before creating a group');
    render();
    return false;
  }

  const nextCustomGroups = state.customGroups.includes(groupName)
    ? state.customGroups
    : [...state.customGroups, groupName];
  const nextExpandedDomains = new Set(state.expandedDomains);
  nextExpandedDomains.delete(groupName);
  const nextEntries = ReadLaterCore.sortEntriesForDisplay(updatedEntries);

  await setPopupStorage({
    [storageKey]: nextEntries,
    [customGroupsStorageKey]: nextCustomGroups,
    [expandedDomainsStorageKey]: Array.from(nextExpandedDomains)
  });

  state.showCreateGroup = false;
  state.selectionMode = false;
  state.selectedIds.clear();
  state.pendingGroupSelectedIds = [];
  state.emptyGroupDeleteArmed.delete(groupName);
  document.body.classList.remove('selection-mode');
  state.customGroups = nextCustomGroups;
  state.expandedDomains = nextExpandedDomains;
  state.entries = nextEntries;
  render();
  return true;
}

async function createCustomGroup(groupName) {
  const targetDomain = ReadLaterCore.cleanText(groupName);
  if (!targetDomain) return;

  const nextCustomGroups = state.customGroups.includes(targetDomain)
    ? state.customGroups
    : [...state.customGroups, targetDomain];
  const nextExpandedDomains = new Set(state.expandedDomains);
  nextExpandedDomains.delete(targetDomain);

  await setPopupStorage({
    [customGroupsStorageKey]: nextCustomGroups,
    [expandedDomainsStorageKey]: Array.from(nextExpandedDomains)
  });

  state.customGroups = nextCustomGroups;
  state.expandedDomains = nextExpandedDomains;
  state.emptyGroupDeleteArmed.delete(targetDomain);
  state.showCreateGroup = false;
  state.pendingGroupSelectedIds = [];
  render();
}

async function removeCustomGroup(groupName) {
  const targetDomain = ReadLaterCore.cleanText(groupName);
  if (!targetDomain) return;

  const nextCustomGroups = state.customGroups.filter(group => group !== targetDomain);
  const nextExpandedDomains = new Set(state.expandedDomains);
  nextExpandedDomains.delete(targetDomain);
  const nextPinnedGroups = new Set(state.pinnedGroups);
  nextPinnedGroups.delete(targetDomain);

  await setPopupStorage({
    [customGroupsStorageKey]: nextCustomGroups,
    [expandedDomainsStorageKey]: Array.from(nextExpandedDomains),
    [pinnedGroupsStorageKey]: Array.from(nextPinnedGroups)
  });

  state.customGroups = nextCustomGroups;
  state.expandedDomains = nextExpandedDomains;
  state.pinnedGroups = nextPinnedGroups;
  state.emptyGroupDeleteArmed.delete(targetDomain);
  render();
}

function syncCurrentTabEntry() {
  state.currentTabEntry = state.currentTab && ReadLaterCore.isSavableTab(state.currentTab)
    ? ReadLaterCore.findEntryByUrl(state.entries, state.currentTab.url)
    : null;
}

function markCardLeaving(card) {
  if (!card || card.classList.contains('leaving')) {
    return false;
  }
  card.style.animation = '';
  card.classList.add('leaving');
  return true;
}

async function refreshCurrentTabState(options = {}) {
  if (!state.currentTab || options.force) {
    state.currentTab = await currentTab();
  }
  syncCurrentTabEntry();
  if (options.render !== false) {
    render();
  } else {
    renderAddButtonState();
  }
}

function makeIcon(entry = {}) {
  const wrap = document.createElement('span');
  wrap.className = 'entry-icon';
  if (entry.favIconUrl) {
    const img = document.createElement('img');
    img.src = entry.favIconUrl;
    img.alt = '';
    img.referrerPolicy = 'no-referrer';
    img.addEventListener('error', () => {
      wrap.replaceChildren(makeFallbackIcon(entry));
    }, { once: true });
    wrap.appendChild(img);
  } else {
    wrap.appendChild(makeFallbackIcon(entry));
  }
  return wrap;
}

async function openEntry(entry) {
  if (!entry || !entry.url) {
    return false;
  }
  await chrome.tabs.create({ url: entry.url });
  return true;
}

function reportOpenEntryError(error) {
  setStatus(error && error.message ? error.message : 'Could not open page', { autoClear: false });
}

function reportDeleteError(error) {
  setStatus(error && error.message ? error.message : 'Could not remove page', { autoClear: false });
}

function reportPinError(error) {
  setStatus(error && error.message ? error.message : 'Could not update pin', { autoClear: false });
}

function setEmptyGroupChevronLabel(chevron, domain, isConfirming) {
  if (!chevron || !domain) return;
  const label = isConfirming
    ? `Confirm remove empty group ${domain}`
    : `Remove empty group ${domain}`;
  chevron.title = label;
  chevron.setAttribute('aria-label', label);
}

function clearEmptyGroupDeleteArming() {
  state.emptyGroupDeleteArmed.clear();
  if (!els.entriesList || typeof els.entriesList.querySelectorAll !== 'function') return;

  Array.from(els.entriesList.querySelectorAll('.domain-group-header')).forEach((header) => {
    if (!header.classList || !header.classList.contains('is-delete-armed')) return;

    header.classList.remove('is-delete-armed');
    const container = typeof header.closest === 'function'
      ? header.closest('.domain-group')
      : null;
    const domain = container && container.dataset ? container.dataset.domain : '';
    const chevron = typeof header.querySelector === 'function'
      ? header.querySelector('.domain-group-chevron')
      : null;
    setEmptyGroupChevronLabel(chevron, domain, false);
  });
}

function snapshotListPositions() {
  const positions = new Map();
  if (!els.entriesList || typeof els.entriesList.querySelectorAll !== 'function') {
    return positions;
  }

  Array.from(els.entriesList.children).forEach((child) => {
    if (child && typeof child.getBoundingClientRect === 'function') {
      positions.set(child, child.getBoundingClientRect().top);
    }
  });
  return positions;
}

function animateListReflow(previousPositions, options = {}) {
  if (!previousPositions || previousPositions.size === 0) return;
  const excluded = options.exclude || null;

  requestAnimationFrame(() => {
    Array.from(els.entriesList.children).forEach((child) => {
      if (!child || child === excluded || typeof child.getBoundingClientRect !== 'function') {
        return;
      }
      const previousTop = previousPositions.get(child);
      if (typeof previousTop !== 'number') return;

      const nextTop = child.getBoundingClientRect().top;
      const delta = previousTop - nextTop;
      if (Math.abs(delta) < 1 || typeof child.animate !== 'function') return;

      child.animate(
        [
          { transform: `translateY(${delta}px)` },
          { transform: 'translateY(0)' }
        ],
        {
          duration: 260,
          easing: 'cubic-bezier(0.16, 1, 0.3, 1)'
        }
      );
    });
  });
}


async function toggleEntryPinned(entry) {
  const next = ReadLaterCore.togglePinnedEntry(state.entries, entry && entry.id);
  if (!next.changed) return;

  await setPopupStorage({ [storageKey]: next.entries });
  state.entries = next.entries;
  render();
}

async function toggleGroupPinned(domain) {
  const groupName = ReadLaterCore.cleanText(domain);
  if (!groupName) return;

  const nextPinnedGroups = new Set(state.pinnedGroups);
  if (nextPinnedGroups.has(groupName)) {
    nextPinnedGroups.delete(groupName);
  } else {
    nextPinnedGroups.add(groupName);
  }

  await persistPinnedGroups(nextPinnedGroups);
  state.pinnedGroups = nextPinnedGroups;
  render();
}

async function removeEntry(entry) {
  const next = ReadLaterCore.deleteEntry(state.entries, entry.id);
  if (!next.changed) return;
  const wasSelected = state.selectedIds.has(entry.id);

  const card = els.entriesList.querySelector(`[data-id="${CSS.escape(entry.id)}"]`);
  if (card) {
    if (!markCardLeaving(card)) return;
    await new Promise(resolve => {
      const onAnimationEnd = () => {
        card.removeEventListener('animationend', onAnimationEnd);
        resolve();
      };
      card.addEventListener('animationend', onAnimationEnd);
      setTimeout(() => {
        card.removeEventListener('animationend', onAnimationEnd);
        resolve();
      }, ENTRY_EXIT_ANIMATION_MS);
    });
  }

  try {
    await persist(next.entries);
  } catch (error) {
    render();
    throw error;
  }

  if (wasSelected) {
    state.selectedIds.delete(entry.id);
    state.pendingGroupSelectedIds = state.pendingGroupSelectedIds.filter(id => id !== entry.id);
    if (state.selectionMode && state.selectedIds.size === 0 && !state.groupOrganize) {
      exitSelectionMode();
    } else {
      render();
    }
  }
}

function focusTitleEditor(entryId) {
  requestAnimationFrame(() => {
    if (!els.entriesList || !entryId) return;
    const card = els.entriesList.querySelector(`[data-id="${CSS.escape(entryId)}"]`);
    const input = card ? card.querySelector('.entry-title-input') : null;
    if (!input) return;
    input.focus();
    input.select();
  });
}

async function commitEntryTitle(entry, title) {
  const next = ReadLaterCore.renameEntryTitle(state.entries, entry && entry.id, title, Date.now());
  if (!next.changed) {
    state.editingEntryId = null;
    render();
    return;
  }

  try {
    await setPopupStorage({ [storageKey]: next.entries });
    state.entries = next.entries;
    state.editingEntryId = null;
    render();
  } catch (error) {
    state.editingEntryId = null;
    render();
    setStatus(error && error.message ? error.message : 'Could not rename page');
  }
}

function cancelEntryTitleEdit() {
  state.editingEntryId = null;
  render();
}

function renderEntryTitleEditor(entry) {
  const editor = document.createElement('div');
  editor.className = 'entry-title-editor';

  const input = document.createElement('input');
  input.className = 'entry-title-input';
  input.type = 'text';
  input.value = entry.title || '';
  input.maxLength = 180;
  input.setAttribute('aria-label', `Rename ${entry.title}`);

  const actions = document.createElement('span');
  actions.className = 'entry-title-edit-actions';

  const save = document.createElement('button');
  save.className = 'entry-title-save-button';
  save.type = 'button';
  save.title = 'Save name';
  save.setAttribute('aria-label', 'Save entry name');
  const saveIcon = document.createElement('span');
  saveIcon.className = 'save-title-icon';
  saveIcon.setAttribute('aria-hidden', 'true');
  save.appendChild(saveIcon);

  const cancel = document.createElement('button');
  cancel.className = 'entry-title-cancel-button';
  cancel.type = 'button';
  cancel.title = 'Cancel rename';
  cancel.setAttribute('aria-label', 'Cancel rename');
  const cancelIcon = document.createElement('span');
  cancelIcon.className = 'cancel-title-icon';
  cancelIcon.setAttribute('aria-hidden', 'true');
  cancel.appendChild(cancelIcon);

  actions.appendChild(save);
  actions.appendChild(cancel);
  editor.appendChild(makeIcon(entry));
  editor.appendChild(input);
  editor.appendChild(actions);

  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      return commitEntryTitle(entry, input.value);
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      cancelEntryTitleEdit();
    }
  });
  save.addEventListener('click', () => commitEntryTitle(entry, input.value));
  cancel.addEventListener('click', cancelEntryTitleEdit);

  return editor;
}

function renderEntry(entry) {
  const item = document.createElement('article');
  item.className = 'entry-card';
  item.dataset.id = entry.id;
  item.setAttribute('role', 'listitem');
  item.classList.toggle('is-current-tab', !!state.currentTabEntry && state.currentTabEntry.id === entry.id);
  item.classList.toggle('is-selected', state.selectedIds.has(entry.id));

  // Add entrance animation for newly added entries (within last 2 seconds)
  const entryAge = Date.now() - (entry.updatedAt || entry.createdAt || 0);
  if (!state.isTransitioningMode && entryAge < 2000) {
    item.style.animation = 'entryIn 0.32s cubic-bezier(0.34, 1.56, 0.64, 1)';
  }

  // Modeless: every card is draggable (click opens, drag reorders/classifies).
  item.draggable = true;

  if (state.editingEntryId === entry.id) {
    item.classList.add('is-editing-title');
    item.appendChild(renderEntryTitleEditor(entry));
    return item;
  }

  const openButton = document.createElement('button');
  openButton.className = 'entry-open-button';
  openButton.type = 'button';
  openButton.title = entry.url;
  openButton.setAttribute('aria-label', `Open ${entry.title}`);
  openButton.dataset.entryId = entry.id;

  const title = document.createElement('span');
  title.className = 'entry-title';
  title.textContent = entry.title;
  if (entry.title && entry.title.length > 35) {
    title.title = entry.title;
    // Flip the hover tooltip above the title when the card sits low in the
    // list, so the list-shell overflow clip cannot cut the tooltip off.
    title.addEventListener('mouseenter', () => {
      if (
        typeof title.getBoundingClientRect !== 'function' ||
        !els.entriesList ||
        typeof els.entriesList.getBoundingClientRect !== 'function'
      ) {
        return;
      }
      const titleRect = title.getBoundingClientRect();
      const listRect = els.entriesList.getBoundingClientRect();
      const titleCenter = titleRect.top + titleRect.height / 2;
      const flipThreshold = listRect.top + listRect.height * 0.6;
      title.classList.toggle('tooltip-above', titleCenter > flipThreshold);
    });
  }

  const savedAt = document.createElement('span');
  savedAt.className = 'entry-saved-at';
  savedAt.textContent = ReadLaterCore.formatSavedAt(entry.updatedAt || entry.createdAt);

  const meta = document.createElement('span');
  meta.className = 'entry-meta';
  meta.appendChild(savedAt);

  const del = document.createElement('button');
  del.className = 'delete-button';
  del.type = 'button';
  del.title = 'Remove';
  del.setAttribute('aria-label', `Remove ${entry.title}`);
  const delIcon = document.createElement('span');
  delIcon.className = 'delete-icon';
  delIcon.setAttribute('aria-hidden', 'true');
  del.appendChild(delIcon);

  const isPinned = entry.pinned === true;
  const pin = document.createElement('button');
  pin.className = isPinned ? 'pin-button is-pinned' : 'pin-button';
  pin.type = 'button';
  pin.title = isPinned ? 'Unpin' : 'Pin';
  pin.setAttribute('aria-label', `${isPinned ? 'Unpin' : 'Pin'} ${entry.title}`);
  const pinIcon = document.createElement('span');
  pinIcon.className = 'pin-icon';
  pinIcon.setAttribute('aria-hidden', 'true');
  pin.appendChild(pinIcon);

  const edit = document.createElement('button');
  edit.className = 'edit-title-button';
  edit.type = 'button';
  edit.title = 'Rename';
  edit.setAttribute('aria-label', `Rename ${entry.title}`);
  const editIcon = document.createElement('span');
  editIcon.className = 'edit-title-icon';
  editIcon.setAttribute('aria-hidden', 'true');
  edit.appendChild(editIcon);

  openButton.appendChild(makeIcon(entry));
  openButton.appendChild(title);
  openButton.appendChild(meta);
  item.appendChild(openButton);
  if (!state.selectionMode) {
    item.appendChild(pin);
    item.appendChild(edit);
  }
  item.appendChild(del);

  openButton.addEventListener('click', () => openEntry(entry).catch(reportOpenEntryError));

  del.addEventListener('click', () => removeEntry(entry).catch(reportDeleteError));
  pin.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    return toggleEntryPinned(entry).catch(reportPinError);
  });
  edit.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    state.editingEntryId = entry.id;
    render();
    focusTitleEditor(entry.id);
  });

  // Modeless drag: any card starts a single-entry drag (reorder or classify).
  item.addEventListener('dragstart', (e) => {
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', entry.id);
    }
    item.classList.add('is-dragging');
    activeDrag.kind = 'entry';
    activeDrag.entryIds = [entry.id];
    activeDrag.groupKey = null;
    activeDrag.context = entryReorderContext(item);
    dragAutoScroll.start();
  });

  item.addEventListener('dragend', () => {
    item.classList.remove('is-dragging');
    activeDrag.kind = null;
    activeDrag.entryIds = [];
    activeDrag.context = null;
    clearDropIndicator();
    dragAutoScroll.stop();
  });

  // Drop target for reordering entries within the same list (a group, or flat).
  // Cross-list drops are ignored here; moving a card to another group goes
  // through the group header (reclassify) instead.
  item.addEventListener('dragover', (e) => {
    if (activeDrag.kind !== 'entry' || activeDrag.entryIds.includes(entry.id)) return;
    const context = entryReorderContext(item);
    if (context === null || context !== activeDrag.context) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
    setDropIndicator(item, dropPositionFromPointer(item, e.clientY));
  });

  item.addEventListener('dragleave', () => {
    if (lastDropTarget === item) clearDropIndicator();
  });

  item.addEventListener('drop', (e) => {
    if (activeDrag.kind !== 'entry' || activeDrag.entryIds.includes(entry.id)) return;
    const context = entryReorderContext(item);
    if (context === null || context !== activeDrag.context) return;
    e.preventDefault();
    e.stopPropagation();
    const position = dropPositionFromPointer(item, e.clientY);
    clearDropIndicator();
    return commitEntryReorder(entry.id, position).catch((error) => {
      setStatus(error && error.message ? error.message : 'Could not save order');
    });
  });

  return item;
}

function renderCreateGroupItem() {
  const item = document.createElement('div');
  item.className = 'create-group-item';

  const button = document.createElement('button');
  button.className = 'create-group-button';
  button.type = 'button';
  button.textContent = '+ New group';

  const inputWrap = document.createElement('div');
  inputWrap.className = 'create-group-input-wrap hidden';

  const input = document.createElement('input');
  input.className = 'create-group-input';
  input.type = 'text';
  input.placeholder = 'Enter group name...';

  inputWrap.appendChild(input);
  item.appendChild(button);
  item.appendChild(inputWrap);

  // An entry dropped here is moved into the new group once it is named.
  let droppedEntryId = null;

  button.addEventListener('dragover', (e) => {
    if (activeDrag.kind === 'entry') {
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
      button.classList.add('is-drag-over');
    }
  });

  button.addEventListener('dragleave', () => {
    button.classList.remove('is-drag-over');
  });

  button.addEventListener('drop', (e) => {
    e.preventDefault();
    button.classList.remove('is-drag-over');
    droppedEntryId = activeDrag.kind === 'entry' ? activeDrag.entryIds[0] : null;
    // Show input on drop
    button.classList.add('hidden');
    inputWrap.classList.remove('hidden');
    input.focus();
  });

  button.addEventListener('click', () => {
    droppedEntryId = null;
    button.classList.add('hidden');
    inputWrap.classList.remove('hidden');
    input.focus();
  });

  input.addEventListener('keydown', async (e) => {
    if (e.key === 'Enter') {
      e.preventDefault(); // Prevent form submission
      const groupName = input.value.trim();
      if (groupName) {
        // Disable input during creation to prevent double-submit
        input.disabled = true;
        const targetDomain = ReadLaterCore.cleanText(groupName);

        try {
          if (droppedEntryId) {
            await commitSelectionToGroup(targetDomain, { selectedIds: [droppedEntryId] });
          } else {
            // No dragged entry: just create an empty group as a drop target
            await createCustomGroup(groupName);
          }
        } catch (error) {
          input.disabled = false;
          setStatus(error && error.message ? error.message : 'Could not create group');
        }
      } else {
        // Empty input, just close the input field
        button.classList.remove('hidden');
        inputWrap.classList.add('hidden');
        input.value = '';
      }
    } else if (e.key === 'Escape') {
      button.classList.remove('hidden');
      inputWrap.classList.add('hidden');
      input.value = '';
    }
  });

  input.addEventListener('blur', () => {
    // Only clean up if not disabled (disabled means we're in the middle of merging)
    if (!input.disabled) {
      setTimeout(() => {
        button.classList.remove('hidden');
        inputWrap.classList.add('hidden');
        input.value = '';
      }, 150);
    }
  });

  return item;
}

function renderDomainGroup(group) {
  const container = document.createElement('div');
  container.className = 'domain-group';
  container.dataset.domain = group.domain;

  const isExpanded = state.expandedDomains.has(group.domain);
  const isPinnedGroup = state.pinnedGroups.has(group.domain);
  container.classList.toggle('is-pinned', isPinnedGroup);

  const header = document.createElement('div');
  header.className = 'domain-group-header';
  if (group.count > 0) {
    header.setAttribute('role', 'button');
    header.tabIndex = 0;
    header.setAttribute('aria-label', `${pageCountLabel(group.count)} from ${group.domain}`);
    header.setAttribute('aria-expanded', isExpanded ? 'true' : 'false');
  }

  // Use the first entry's favicon for the group
  const firstEntry = group.entries[0];
  header.appendChild(makeIcon(firstEntry));

  const info = document.createElement('span');
  info.className = 'domain-group-info';

  const domainText = document.createElement('span');
  domainText.className = 'domain-group-name';
  domainText.textContent = group.domain;

  const count = document.createElement('span');
  count.className = 'domain-group-count';
  count.textContent = pageCountLabel(group.count);

  info.appendChild(domainText);
  info.appendChild(count);
  header.appendChild(info);

  const chevron = document.createElement('span');
  chevron.className = 'domain-group-chevron';
  if (group.count > 0) {
    chevron.setAttribute('aria-hidden', 'true');
  }
  chevron.style.cursor = 'pointer';
  header.appendChild(chevron);

  // Empty groups do not expand. Their chevron is a two-click remove affordance.
  const activateEmptyGroupRemoval = (e) => {
    if (group.count > 0) return;
    e.preventDefault();
    e.stopPropagation();

    const wasExpanded = state.emptyGroupDeleteArmed.has(group.domain);
    if (group.count === 0 && wasExpanded) {
      return removeCustomGroup(group.domain).catch((error) => {
        setStatus(error && error.message ? error.message : 'Could not remove group');
      });
    }

    state.emptyGroupDeleteArmed.add(group.domain);
    header.classList.add('is-delete-armed');
    setEmptyGroupChevronLabel(chevron, group.domain, true);
  };

  if (group.count === 0) {
    chevron.setAttribute('role', 'button');
    chevron.tabIndex = 0;
    header.classList.toggle('is-delete-armed', state.emptyGroupDeleteArmed.has(group.domain));
    setEmptyGroupChevronLabel(chevron, group.domain, state.emptyGroupDeleteArmed.has(group.domain));
  }

  chevron.addEventListener('click', activateEmptyGroupRemoval);
  chevron.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') {
      return;
    }
    activateEmptyGroupRemoval(e);
  });

  if (!state.selectionMode) {
    const actions = document.createElement('span');
    actions.className = 'domain-group-actions';

    const pinBtn = document.createElement('button');
    pinBtn.className = isPinnedGroup ? 'domain-group-action-btn group-pin-button is-pinned' : 'domain-group-action-btn group-pin-button';
    pinBtn.type = 'button';
    pinBtn.dataset.domain = group.domain;
    pinBtn.title = isPinnedGroup ? 'Unpin group' : 'Pin group';
    pinBtn.setAttribute('aria-label', `${isPinnedGroup ? 'Unpin' : 'Pin'} group ${group.domain}`);
    const pinIcon = document.createElement('span');
    pinIcon.className = 'pin-icon';
    pinIcon.setAttribute('aria-hidden', 'true');
    pinBtn.appendChild(pinIcon);
    actions.appendChild(pinBtn);

    let toggleBtn = null;
    if (group.count > 0) {
      toggleBtn = document.createElement('button');
      toggleBtn.className = 'domain-group-action-btn domain-group-batch-button';
      toggleBtn.type = 'button';
      toggleBtn.dataset.domain = group.domain;

      const openedTabIds = Array.isArray(state.openedDomainTabs.get(group.domain))
        ? state.openedDomainTabs.get(group.domain).filter(tabId => Number.isInteger(tabId))
        : [];
      const isOpened = openedTabIds.length > 0;
      toggleBtn.title = isOpened ? `Close all ${tabCountLabel(openedTabIds.length)}` : `Open all ${pageCountLabel(group.count)}`;
      toggleBtn.setAttribute('aria-label', isOpened ? `Close all ${tabCountLabel(openedTabIds.length)} from ${group.domain}` : `Open all ${pageCountLabel(group.count)} from ${group.domain}`);
      toggleBtn.innerHTML = isOpened
        ? '<span class="action-icon action-icon-close-all" aria-hidden="true"></span>'
        : '<span class="action-icon action-icon-open-all" aria-hidden="true"></span>';

      if (isOpened) {
        toggleBtn.classList.add('is-opened');
      }

      actions.appendChild(toggleBtn);
    }
    header.appendChild(actions);

    pinBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      return toggleGroupPinned(group.domain).catch(reportPinError);
    });

    if (toggleBtn) {
      toggleBtn.addEventListener('click', async (e) => {
      e.stopPropagation();

      // Prevent double-click
      if (toggleBtn.disabled) return;
      toggleBtn.disabled = true;

      const domain = group.domain;
      const isCurrentlyOpened = state.openedDomainTabs.has(domain);

      try {
        if (isCurrentlyOpened) {
          // Close all tabs for this domain
          const tabIds = Array.isArray(state.openedDomainTabs.get(domain))
            ? state.openedDomainTabs.get(domain).filter(tabId => Number.isInteger(tabId))
            : [];
          const failedTabIds = [];
          for (const tabId of tabIds) {
            try {
              await chrome.tabs.remove(tabId);
            } catch (err) {
              if (!isMissingTabError(err)) {
                failedTabIds.push(tabId);
              }
            }
          }
          if (failedTabIds.length > 0) {
            state.openedDomainTabs.set(domain, failedTabIds);
          } else {
            state.openedDomainTabs.delete(domain);
          }
          await persistOpenedTabs();

          // Update button UI
          const iconSpan = toggleBtn.querySelector('.action-icon');
          if (failedTabIds.length > 0) {
            if (iconSpan) {
              iconSpan.className = 'action-icon action-icon-close-all';
            }
            toggleBtn.classList.add('is-opened');
            toggleBtn.title = `Close all ${tabCountLabel(failedTabIds.length)}`;
            toggleBtn.setAttribute('aria-label', `Close all ${tabCountLabel(failedTabIds.length)} from ${group.domain}`);
            setStatus(`Closed ${tabIds.length - failedTabIds.length} of ${tabIds.length} tabs; ${failedTabIds.length} failed`, { autoClear: false });
          } else {
            if (iconSpan) {
              iconSpan.className = 'action-icon action-icon-open-all';
            }
            toggleBtn.classList.remove('is-opened');
            toggleBtn.title = `Open all ${pageCountLabel(group.count)}`;
            toggleBtn.setAttribute('aria-label', `Open all ${pageCountLabel(group.count)} from ${group.domain}`);
          }
        } else {
          // Open all tabs for this domain
          const tabIds = [];
          let failedCount = 0;
          for (const entry of group.entries) {
            if (entry && entry.url) {
              try {
                const tab = await chrome.tabs.create({ url: entry.url, active: false });
                if (tab && Number.isInteger(tab.id)) {
                  tabIds.push(tab.id);
                } else {
                  failedCount += 1;
                }
              } catch (err) {
                failedCount += 1;
              }
            }
          }

          if (tabIds.length > 0) {
            state.openedDomainTabs.set(domain, tabIds);
            await persistOpenedTabs();

            // Update button UI
            const iconSpan = toggleBtn.querySelector('.action-icon');
            if (iconSpan) {
              iconSpan.className = 'action-icon action-icon-close-all';
            }
            toggleBtn.classList.add('is-opened');
            toggleBtn.title = `Close all ${tabCountLabel(tabIds.length)}`;
            toggleBtn.setAttribute('aria-label', `Close all ${tabCountLabel(tabIds.length)} from ${group.domain}`);
            if (failedCount > 0) {
              setStatus(`Opened ${tabIds.length} of ${group.entries.length} pages; ${failedCount} failed`, { autoClear: false });
            }
          } else {
            state.openedDomainTabs.delete(domain);
            await persistOpenedTabs();
            if (failedCount > 0) {
              setStatus(`Could not open ${failedCount === 1 ? 'page' : 'pages'}`, { autoClear: false });
            }
          }
        }
      } catch (error) {
        setStatus(error && error.message ? error.message : 'Could not update tab state', { autoClear: false });
      } finally {
        toggleBtn.disabled = false;
      }
      });
    }
  }

  const contentWrap = document.createElement('div');
  contentWrap.className = 'domain-group-content';
  const shouldExpand = isExpanded;
  if (shouldExpand) {
    contentWrap.classList.add('is-expanded');
  }
  let groupAnimationTimer = null;
  let groupUnlockTimer = null;

  function clearPendingGroupAnimation() {
    if (groupAnimationTimer !== null) {
      clearTimeout(groupAnimationTimer);
      groupAnimationTimer = null;
    }
    if (groupUnlockTimer !== null) {
      clearTimeout(groupUnlockTimer);
      groupUnlockTimer = null;
    }
  }

  const toggleExpansion = async () => {
    if (group.count === 0) return;

    clearEmptyGroupDeleteArming();
    clearPendingGroupAnimation();
    contentWrap.classList.remove('is-collapsing');
    contentWrap.style.maxHeight = '';
    header.classList.remove('is-animating');

    const previousPositions = snapshotListPositions();
    const wasExpanded = state.expandedDomains.has(group.domain);

    header.classList.add('is-animating');

    if (wasExpanded) {
      state.expandedDomains.delete(group.domain);
      try {
        await persistExpandedDomains();
      } catch (error) {
        state.expandedDomains.add(group.domain);
        header.setAttribute('aria-expanded', 'true');
        contentWrap.classList.remove('is-collapsing');
        contentWrap.classList.add('is-expanded');
        header.classList.remove('is-animating');
        setStatus(error && error.message ? error.message : 'Could not save group state');
        return;
      }
      header.setAttribute('aria-expanded', 'false');
      contentWrap.classList.add('is-collapsing');

      const cardExitMs = GROUP_CARD_EXIT_MS +
        GROUP_CARD_STAGGER_MS * (Math.min(group.count, GROUP_CARD_STAGGER_LIMIT) - 1);
      groupAnimationTimer = setTimeout(() => {
        groupAnimationTimer = null;
        contentWrap.style.maxHeight = `${contentWrap.scrollHeight}px`;
        contentWrap.classList.remove('is-expanded');
        contentWrap.classList.remove('is-collapsing');
        contentWrap.offsetHeight;
        contentWrap.style.maxHeight = '0px';
        animateListReflow(previousPositions, { exclude: container });

        groupUnlockTimer = setTimeout(() => {
          groupUnlockTimer = null;
          contentWrap.style.maxHeight = '';
          header.classList.remove('is-animating');
        }, GROUP_CONTENT_CLOSE_MS);
      }, cardExitMs);
    } else {
      state.expandedDomains.add(group.domain);
      try {
        await persistExpandedDomains();
      } catch (error) {
        state.expandedDomains.delete(group.domain);
        header.setAttribute('aria-expanded', 'false');
        contentWrap.classList.remove('is-expanded');
        contentWrap.classList.remove('is-collapsing');
        header.classList.remove('is-animating');
        setStatus(error && error.message ? error.message : 'Could not save group state');
        return;
      }
      header.setAttribute('aria-expanded', 'true');
      contentWrap.offsetHeight;
      contentWrap.classList.add('is-expanded');
      animateListReflow(previousPositions, { exclude: container });

      groupUnlockTimer = setTimeout(() => {
        groupUnlockTimer = null;
        header.classList.remove('is-animating');
      }, 1050);
    }
  };

  // Modeless: the header is draggable to reorder groups (a click still expands;
  // the native drag threshold separates click from drag), and is a drop target
  // for an entry drag (reclassify) and a group drag (reorder).
  header.draggable = true;
  header.addEventListener('dragstart', (e) => {
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', `group:${group.domain}`);
    }
    activeDrag.kind = 'group';
    activeDrag.groupKey = group.domain;
    activeDrag.entryIds = [];
    activeDrag.context = null;
    container.classList.add('is-dragging');
    dragAutoScroll.start();
  });
  header.addEventListener('dragend', () => {
    container.classList.remove('is-dragging');
    activeDrag.kind = null;
    activeDrag.groupKey = null;
    clearDropIndicator();
    dragAutoScroll.stop();
  });

  header.addEventListener('click', (e) => {
    if (e.target.closest('.domain-group-actions')) {
      return;
    }
    if (group.count === 0) return;
    return toggleExpansion();
  });

  header.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') {
      return;
    }
    if (group.count === 0) return;
    e.preventDefault();
    return toggleExpansion();
  });

  const content = document.createElement('div');
  content.className = 'domain-group-entries';
  group.entries.forEach((entry) => {
    const card = renderEntry(entry);
    content.appendChild(card);
  });

  contentWrap.appendChild(content);
  container.appendChild(header);
  container.appendChild(contentWrap);

  header.addEventListener('dragover', (e) => {
    if (activeDrag.kind === 'entry') {
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
      header.classList.add('is-drag-over');
      return;
    }
    if (activeDrag.kind === 'group' && activeDrag.groupKey !== group.domain) {
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
      setDropIndicator(container, dropPositionFromPointer(header, e.clientY));
    }
  });

  header.addEventListener('dragleave', () => {
    header.classList.remove('is-drag-over');
    if (lastDropTarget === container) clearDropIndicator();
  });

  header.addEventListener('drop', async (e) => {
    e.preventDefault();
    header.classList.remove('is-drag-over');
    if (activeDrag.kind === 'group') {
      const position = dropPositionFromPointer(header, e.clientY);
      clearDropIndicator();
      try {
        await commitGroupReorder(group.domain, position);
      } catch (error) {
        setStatus(error && error.message ? error.message : 'Could not save group order');
      }
      return;
    }
    if (activeDrag.kind === 'entry' && activeDrag.entryIds.length > 0) {
      try {
        await commitSelectionToGroup(group.domain, { selectedIds: activeDrag.entryIds });
      } catch (error) {
        setStatus(error && error.message ? error.message : 'Could not move pages');
      }
    }
  });

  return container;
}

function renderEmptyState(visible, renderedCount = visible.length) {
  const isEmpty = state.entries.length === 0;
  const hasNoMatches = !isEmpty && state.query;
  els.emptyState.classList.toggle('hidden', renderedCount !== 0);
  els.emptyTitle.textContent = hasNoMatches ? 'No matching pages' : 'No pages yet';
  els.emptyCopy.textContent = hasNoMatches
    ? 'Clear the search to return to your saved reading queue.'
    : 'Save the current tab when you want a quiet reading queue.';
  els.emptyActionBtn.textContent = hasNoMatches ? 'Clear search' : 'Save current page';
  els.emptyActionBtn.dataset.action = hasNoMatches ? 'clear' : 'add';
}

function renderAddButtonState() {
  if (state.selectionMode) {
    // In selection mode, button toggles "Create new group" visibility
    els.addCurrentPageBtn.classList.remove('is-saved');
    els.addCurrentPageBtn.classList.add('is-selection-mode');
    els.addCurrentPageBtn.title = state.showCreateGroup
      ? 'Hide create group input'
      : 'Show create group input';
    els.addCurrentPageBtn.setAttribute('aria-label', state.showCreateGroup
      ? 'Hide create group input'
      : 'Show create group input');
    els.addCurrentPageBtn.disabled = false;
  } else {
    // Normal mode
    els.addCurrentPageBtn.classList.remove('is-selection-mode');
    els.addCurrentPageBtn.disabled = false;
    const isSaved = !!state.currentTabEntry;
    els.addCurrentPageBtn.classList.toggle('is-saved', isSaved);
    els.addCurrentPageBtn.title = isSaved ? 'Remove current page' : 'Add current page';
    els.addCurrentPageBtn.setAttribute(
      'aria-label',
      isSaved ? 'Remove current page from Read It Later' : 'Add current page'
    );
  }
}

function renderViewModeButtonState() {
  if (state.selectionMode) {
    const lockedLabel = 'Grouped view is locked while organizing';
    els.viewModeBtn.disabled = true;
    els.viewModeBtn.title = lockedLabel;
    els.viewModeBtn.setAttribute('aria-label', lockedLabel);
    return;
  }

  const nextLabel = state.viewMode === 'flat'
    ? 'Show grouped view'
    : 'Show flat list';
  els.viewModeBtn.disabled = state.isTransitioningMode;
  els.viewModeBtn.title = nextLabel;
  els.viewModeBtn.setAttribute('aria-label', nextLabel);
}

function render() {
  syncCurrentTabEntry();

  if (state.selectionMode && state.selectedIds.size === 0 && !state.groupOrganize) {
    state.selectionMode = false;
    state.pendingGroupSelectedIds = [];
    state.showCreateGroup = false;
    document.body.classList.remove('selection-mode');
  }
  document.body.classList.toggle('flat-view', state.viewMode === 'flat');

  const visible = ReadLaterCore.filterEntries(ReadLaterCore.sortEntriesForDisplay(state.entries), state.query);

  let elements;
  // Organize (selection) mode follows the current view: flat view reorders the
  // linear list, grouped view reorders within/between groups and classifies.
  const effectiveViewMode = state.viewMode;
  if (effectiveViewMode === 'flat') {
    // Flat view: render all entries directly, honouring the manual flat order.
    const orderedFlat = ReadLaterCore.orderEntriesByManual(visible, state.entryOrder);
    state.visibleEntries = orderedFlat;
    elements = orderedFlat.map(entry => renderEntry(entry));
  } else {
    state.visibleEntries = visible;
    // Grouped view: group by domain, honouring manual group + within-group order
    const customGroupsForRender = state.query && !state.selectionMode ? [] : state.customGroups;
    const groups = ReadLaterCore.groupEntriesByDomain(
      visible,
      customGroupsForRender,
      Array.from(state.pinnedGroups),
      { groupOrder: state.groupOrder, entryOrder: state.entryOrder }
    );
    elements = groups.map(group => {
      if (group.type === 'single') {
        return renderEntry(group.entry);
      } else {
        return renderDomainGroup(group);
      }
    });
  }

  // Always offer a compact "New group" row at the bottom of grouped view, so new
  // groups can be made (and dragged into) without any mode.
  if (effectiveViewMode === 'grouped' && visible.length > 0) {
    elements.push(renderCreateGroupItem());
  }

  els.entriesList.replaceChildren(...elements);
  renderEmptyState(visible, elements.length);
  renderAddButtonState();
  renderViewModeButtonState();

  // Update search box based on selection mode
  if (state.selectionMode) {
    if (state.selectedIds.size > 0) {
      // In selection mode with items selected, show selection count and exit button
      els.searchInput.value = `${state.selectedIds.size} selected`;
      els.searchInput.disabled = true;
      els.clearSearchBtn.classList.remove('hidden');
      els.clearSearchBtn.title = 'Exit selection mode';
      els.clearSearchBtn.setAttribute('aria-label', 'Exit selection mode');
      els.deleteSelectedBtn.classList.remove('hidden');
      els.deleteSelectedBtn.title = `Delete ${state.selectedIds.size} selected`;
      els.deleteSelectedBtn.setAttribute('aria-label', `Delete ${state.selectedIds.size} selected`);
    } else {
      // Organize mode entered via a group-header long-press: no entry selected,
      // but keep an explicit exit affordance and a clear label.
      els.searchInput.value = 'Reorder groups';
      els.searchInput.disabled = true;
      els.clearSearchBtn.classList.remove('hidden');
      els.clearSearchBtn.title = 'Exit organize mode';
      els.clearSearchBtn.setAttribute('aria-label', 'Exit organize mode');
      els.deleteSelectedBtn.classList.add('hidden');
    }
  } else {
    // Normal mode
    els.searchInput.value = state.query;
    els.searchInput.disabled = false;
    els.clearSearchBtn.classList.toggle('hidden', !state.query);
    els.clearSearchBtn.title = 'Clear search';
    els.clearSearchBtn.setAttribute('aria-label', 'Clear search');
    els.deleteSelectedBtn.classList.add('hidden'); // Always hide in normal mode
  }

}

async function addCurrentPage() {
  // In selection mode, show create group item
  if (state.selectionMode) {
    if (state.showCreateGroup) {
      state.showCreateGroup = false;
      state.pendingGroupSelectedIds = [];
    } else {
      state.pendingGroupSelectedIds = Array.from(state.selectedIds);
      state.showCreateGroup = state.pendingGroupSelectedIds.length > 0;
    }
    render();
    return;
  }

  if (state.busy) return;
  state.busy = true;
  els.addCurrentPageBtn.disabled = true;
  try {
    const tab = state.currentTab && ReadLaterCore.isSavableTab(state.currentTab)
      ? state.currentTab
      : await currentTab();
    state.currentTab = tab;
    if (!ReadLaterCore.isSavableTab(tab)) {
      setStatus('This page cannot be saved');
      return;
    }

    // Toggle: if already saved, remove it; otherwise add it
    if (state.currentTabEntry) {
      // Remove the current page
      await removeEntry(state.currentTabEntry);
    } else {
      // Add the current page
      const entry = ReadLaterCore.buildEntryFromTab(tab, Date.now());
      const next = ReadLaterCore.upsertEntry(state.entries, entry);
      await persist(next.entries);
    }
  } catch (error) {
    setStatus(error && error.message ? error.message : 'Could not save page');
  } finally {
    state.busy = false;
    els.addCurrentPageBtn.disabled = false;
  }
}

function setSearch(value, options = {}) {
  state.query = value;
  els.searchInput.value = value;
  render();
  if (options.focus !== false) {
    els.searchInput.focus();
  }
}

function focusEntry(index) {
  const buttons = Array.from(els.entriesList.querySelectorAll('.entry-open-button'));
  if (!buttons.length) return;
  const next = Math.max(0, Math.min(index, buttons.length - 1));
  buttons[next].focus();
}

function focusedEntryIndex() {
  const buttons = Array.from(els.entriesList.querySelectorAll('.entry-open-button'));
  return buttons.indexOf(document.activeElement);
}

function focusedEntry() {
  const entryId = document.activeElement && document.activeElement.dataset
    ? document.activeElement.dataset.entryId
    : '';
  if (!entryId) return null;
  return state.entries.find(entry => String(entry.id) === String(entryId)) || null;
}

function bind() {
  els.addCurrentPageBtn.addEventListener('click', addCurrentPage);
  els.emptyActionBtn.addEventListener('click', () => {
    if (els.emptyActionBtn.dataset.action === 'clear') {
      setSearch('');
      return;
    }
    addCurrentPage();
  });
  els.clearSearchBtn.addEventListener('click', () => {
    if (state.selectionMode) {
      exitSelectionMode();
    } else {
      setSearch('');
    }
  });
  els.deleteSelectedBtn.addEventListener('click', () => {
    deleteSelectedEntries().catch(reportDeleteError);
  });
  els.viewModeBtn.addEventListener('click', toggleViewMode);


  // Debounce search input for performance
  let searchDebounceTimer = null;
  els.searchInput.addEventListener('input', () => {
    const value = els.searchInput.value;

    // Update clear button immediately for instant visual feedback
    if (!state.selectionMode) {
      els.clearSearchBtn.classList.toggle('hidden', !value);
    }

    clearTimeout(searchDebounceTimer);
    searchDebounceTimer = setTimeout(() => {
      state.query = value;
      render();
    }, 150);
  });

  // Auto-scroll the popup while dragging a selected card near its top/bottom
  // edges so an off-screen target group can be reached mid-drag.
  document.addEventListener('dragover', (event) => {
    dragAutoScroll.track(event.clientY);
  });
  document.addEventListener('drop', () => dragAutoScroll.stop());
  document.addEventListener('dragend', () => dragAutoScroll.stop());
  document.addEventListener('dragleave', (event) => {
    if (!event.relatedTarget) {
      dragAutoScroll.velocity = 0;
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      if (state.selectionMode) {
        event.preventDefault();
        exitSelectionMode();
        return;
      }
      if (state.query) {
        event.preventDefault();
        setSearch('', { focus: false });
        return;
      }
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      els.searchInput.focus();
      els.searchInput.select();
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'a') {
      // In selection mode, select all visible entries
      if (state.selectionMode) {
        event.preventDefault();
        state.visibleEntries.forEach(entry => {
          state.selectedIds.add(entry.id);
        });
        render();
        return;
      }
    }
    if (event.key === 'ArrowDown') {
      const current = focusedEntryIndex();
      if (current >= 0 || document.activeElement === els.searchInput) {
        event.preventDefault();
        focusEntry(current + 1);
      }
      return;
    }
    if (event.key === 'ArrowUp') {
      const current = focusedEntryIndex();
      if (current >= 0) {
        event.preventDefault();
        focusEntry(current - 1);
      }
      return;
    }
    if (event.key === 'Delete') {
      // In selection mode, delete all selected entries
      if (state.selectionMode && state.selectedIds.size > 0) {
        event.preventDefault();
        return deleteSelectedEntries().catch(reportDeleteError);
      }
      // In normal mode, delete focused entry
      const entry = focusedEntry();
      if (entry) {
        event.preventDefault();
        return removeEntry(entry).catch(reportDeleteError);
      }
      return;
    }
    if (event.key === 'Enter') {
      const entry = focusedEntry();
      if (entry && document.activeElement !== els.searchInput) {
        event.preventDefault();
        return openEntry(entry).catch(reportOpenEntryError);
      }
    }
  });
}

function init() {
  els.addCurrentPageBtn = byId('addCurrentPageBtn');
  els.emptyActionBtn = byId('emptyActionBtn');
  els.emptyCopy = byId('emptyCopy');
  els.searchInput = byId('searchInput');
  els.clearSearchBtn = byId('clearSearchBtn');
  els.deleteSelectedBtn = byId('deleteSelectedBtn');
  els.viewModeBtn = byId('viewModeBtn');
  els.entriesList = byId('entriesList');
  els.emptyState = byId('emptyState');
  els.emptyTitle = byId('emptyTitle');
  els.statusText = byId('statusText');
  els.app = (typeof document.querySelector === 'function') ? document.querySelector('.app') : null;
  document.body.classList.toggle('flat-view', state.viewMode === 'flat');
  renderViewModeButtonState();
  bind();
  loadEntries().catch((error) => {
    setStatus(error && error.message ? error.message : 'Could not load list');
  });

  // Listen for storage changes from background script (e.g., Alt+1 shortcut)
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (shouldReloadFromStorageChange(changes, areaName)) {
      loadEntries().catch((error) => {
        console.error('Failed to reload entries:', error);
        setStatus(error && error.message ? error.message : 'Could not reload list');
      });
    }
  });
}

document.addEventListener('DOMContentLoaded', init);
})();
