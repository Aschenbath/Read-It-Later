(function () {
const ReadLaterCore = globalThis.ReadLaterCore;
const storageKey = ReadLaterCore.STORAGE_KEY;
const expandedDomainsStorageKey = 'readLaterExpandedDomains';
const viewModeStorageKey = 'readLaterViewMode';
const customGroupsStorageKey = 'readLaterCustomGroups';

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
  openedDomainTabs: new Map(), // domain -> array of tab IDs
  selectionMode: false,
  selectedIds: new Set(),
  pendingGroupSelectedIds: [],
  showCreateGroup: false,
  viewMode: 'flat' // 'grouped' or 'flat'
};

const els = {};
let statusTimer = null;
const pendingStorageEchoes = new Map();

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
  fallback.dataset.letter = (raw.charAt(0) || '?').toUpperCase();
  return fallback;
}

function chromeGet(keys) {
  return new Promise((resolve) => {
    chrome.storage.local.get(keys, (result) => {
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
    'openedDomainTabs'
  ].forEach(key => {
    if (changes[key] && !consumeStorageEcho(key, changes[key])) {
      shouldReload = true;
    }
  });
  return shouldReload;
}

function currentTab() {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
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

async function loadEntries() {
  const result = await chromeGet({
    [storageKey]: [],
    openedDomainTabs: {},
    [expandedDomainsStorageKey]: [],
    [viewModeStorageKey]: 'flat',
    [customGroupsStorageKey]: []
  });
  const entries = Array.isArray(result[storageKey]) ? result[storageKey] : [];
  state.entries = ReadLaterCore.sortEntriesForDisplay(entries.map(entry => ReadLaterCore.normalizeEntry(entry)));

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
  state.viewMode = result[viewModeStorageKey] === 'grouped' ? 'grouped' : 'flat';

  await refreshCurrentTabState({ render: false, force: true });
  render();
}

async function persist(entries) {
  state.entries = ReadLaterCore.sortEntriesForDisplay(entries);
  await setPopupStorage({ [storageKey]: state.entries });
  render();
}

async function persistOpenedTabs() {
  const openedTabsObj = Object.fromEntries(state.openedDomainTabs);
  await setPopupStorage({ openedDomainTabs: openedTabsObj });
}

async function persistExpandedDomains() {
  await setPopupStorage({ [expandedDomainsStorageKey]: Array.from(state.expandedDomains) });
}

async function persistViewMode() {
  await setPopupStorage({ [viewModeStorageKey]: state.viewMode });
}

async function persistCustomGroups() {
  await setPopupStorage({ [customGroupsStorageKey]: state.customGroups });
}

function enterSelectionMode() {
  state.selectionMode = true;
  state.selectedIds.clear();
  state.pendingGroupSelectedIds = [];
  state.showCreateGroup = false;
  document.body.classList.add('selection-mode');
}

function exitSelectionMode() {
  state.selectionMode = false;
  state.selectedIds.clear();
  state.pendingGroupSelectedIds = [];
  state.showCreateGroup = false;
  document.body.classList.remove('selection-mode');
  render();
}

function toggleViewMode() {
  state.viewMode = state.viewMode === 'grouped' ? 'flat' : 'grouped';
  document.body.classList.toggle('flat-view', state.viewMode === 'flat');

  persistViewMode().catch((error) => {
    setStatus(error && error.message ? error.message : 'Could not save view mode');
  });

  render();
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
  if (state.selectionMode && state.selectedIds.size === 0) {
    exitSelectionMode();
    return;
  }
  render();
}

async function deleteSelectedEntries() {
  if (state.selectedIds.size === 0) return;

  const idsToDelete = Array.from(state.selectedIds);
  const newEntries = state.entries.filter(e => !idsToDelete.includes(e.id));

  // Add leaving animation to all selected cards
  const cards = idsToDelete.map(id =>
    els.entriesList.querySelector(`[data-id="${CSS.escape(id)}"]`)
  ).filter(Boolean);

  cards.forEach(card => {
    if (!card.classList.contains('leaving')) {
      card.classList.add('leaving');
    }
  });

  // Wait for animation
  if (cards.length > 0) {
    await new Promise(resolve => setTimeout(resolve, 160));
  }

  state.selectionMode = false;
  state.selectedIds.clear();
  state.pendingGroupSelectedIds = [];
  state.showCreateGroup = false;
  document.body.classList.remove('selection-mode');

  await persist(newEntries);
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

  state.showCreateGroup = false;
  state.selectionMode = false;
  state.selectedIds.clear();
  state.pendingGroupSelectedIds = [];
  state.emptyGroupDeleteArmed.delete(groupName);
  document.body.classList.remove('selection-mode');

  if (movedCount === 0) {
    setStatus('Select pages before creating a group');
    render();
    return false;
  }

  if (!state.customGroups.includes(groupName)) {
    state.customGroups = [...state.customGroups, groupName];
  }
  state.expandedDomains.delete(groupName);
  state.entries = ReadLaterCore.sortEntriesForDisplay(updatedEntries);

  await setPopupStorage({
    [storageKey]: state.entries,
    [customGroupsStorageKey]: state.customGroups,
    [expandedDomainsStorageKey]: Array.from(state.expandedDomains)
  });
  render();
  return true;
}

async function createCustomGroup(groupName) {
  const targetDomain = ReadLaterCore.cleanText(groupName);
  if (!targetDomain) return;

  if (!state.customGroups.includes(targetDomain)) {
    state.customGroups = [...state.customGroups, targetDomain];
  }

  state.expandedDomains.delete(targetDomain);
  state.emptyGroupDeleteArmed.delete(targetDomain);
  state.showCreateGroup = false;
  state.pendingGroupSelectedIds = [];
  await Promise.all([
    persistCustomGroups(),
    persistExpandedDomains()
  ]);
  render();
}

async function removeCustomGroup(groupName) {
  const targetDomain = ReadLaterCore.cleanText(groupName);
  if (!targetDomain) return;

  state.customGroups = state.customGroups.filter(group => group !== targetDomain);
  state.expandedDomains.delete(targetDomain);
  state.emptyGroupDeleteArmed.delete(targetDomain);
  await Promise.all([
    persistCustomGroups(),
    persistExpandedDomains()
  ]);
  render();
}

function syncCurrentTabEntry() {
  state.currentTabEntry = state.currentTab && ReadLaterCore.isSavableTab(state.currentTab)
    ? ReadLaterCore.findEntryByUrl(state.entries, state.currentTab.url)
    : null;
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

function openEntry(entry) {
  if (entry && entry.url) {
    chrome.tabs.create({ url: entry.url });
  }
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

async function removeEntry(entry) {
  const next = ReadLaterCore.deleteEntry(state.entries, entry.id);
  if (!next.changed) return;

  // Clean up selection state if the entry was selected
  if (state.selectedIds.has(entry.id)) {
    state.selectedIds.delete(entry.id);
  }

  const card = els.entriesList.querySelector(`[data-id="${CSS.escape(entry.id)}"]`);
  if (card) {
    // Prevent double-deletion by checking if already leaving
    if (card.classList.contains('leaving')) return;

    card.classList.add('leaving');
    await new Promise(resolve => {
      const onAnimationEnd = () => {
        card.removeEventListener('animationend', onAnimationEnd);
        resolve();
      };
      card.addEventListener('animationend', onAnimationEnd);
      setTimeout(() => {
        card.removeEventListener('animationend', onAnimationEnd);
        resolve();
      }, 160);
    });
  }

  await persist(next.entries);
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
  if (entryAge < 2000) {
    item.style.animation = 'entryIn 0.32s cubic-bezier(0.34, 1.56, 0.64, 1)';
  }

  // Make entry draggable in selection mode
  if (state.selectionMode && state.selectedIds.has(entry.id)) {
    item.draggable = true;
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

  openButton.appendChild(makeIcon(entry));
  openButton.appendChild(title);
  openButton.appendChild(meta);
  item.appendChild(openButton);
  item.appendChild(del);

  // Long press detection
  let longPressTimer = null;
  let touchMoved = false;
  let suppressNextClickAfterLongPress = false;

  const startLongPress = (e) => {
    if (state.selectionMode) return;
    touchMoved = false;
    longPressTimer = setTimeout(() => {
      suppressNextClickAfterLongPress = true;
      enterSelectionMode();
      toggleSelection(entry.id);
    }, 500);
  };

  const cancelLongPress = () => {
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }
  };

  const handleMove = () => {
    touchMoved = true;
    cancelLongPress();
  };

  openButton.addEventListener('mousedown', startLongPress);
  openButton.addEventListener('touchstart', startLongPress, { passive: true });
  openButton.addEventListener('mouseup', cancelLongPress);
  openButton.addEventListener('mouseleave', cancelLongPress);
  openButton.addEventListener('touchend', cancelLongPress);
  openButton.addEventListener('touchcancel', cancelLongPress);
  openButton.addEventListener('mousemove', handleMove);
  openButton.addEventListener('touchmove', handleMove, { passive: true });

  openButton.addEventListener('click', (e) => {
    if (suppressNextClickAfterLongPress) {
      e.preventDefault();
      suppressNextClickAfterLongPress = false;
      return;
    }
    if (state.selectionMode) {
      e.preventDefault();
      toggleSelection(entry.id);
    } else if (!touchMoved) {
      openEntry(entry);
    }
  });

  del.addEventListener('click', () => removeEntry(entry));

  // Drag events for selection mode
  item.addEventListener('dragstart', (e) => {
    if (state.selectionMode && state.selectedIds.has(entry.id)) {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', entry.id);
      item.classList.add('is-dragging');
    }
  });

  item.addEventListener('dragend', () => {
    item.classList.remove('is-dragging');
  });

  return item;
}

function renderCreateGroupItem(selectedIds = state.pendingGroupSelectedIds) {
  const pendingSelectedIds = Array.isArray(selectedIds)
    ? selectedIds.filter(Boolean)
    : [];
  const item = document.createElement('div');
  item.className = 'create-group-item';

  const button = document.createElement('button');
  button.className = 'create-group-button';
  button.type = 'button';
  button.textContent = '+ Create new group...';

  const inputWrap = document.createElement('div');
  inputWrap.className = 'create-group-input-wrap hidden';

  const input = document.createElement('input');
  input.className = 'create-group-input';
  input.type = 'text';
  input.placeholder = 'Enter group name...';

  inputWrap.appendChild(input);
  item.appendChild(button);
  item.appendChild(inputWrap);

  // Drop zone for creating new group
  button.addEventListener('dragover', (e) => {
    if (state.selectionMode && state.selectedIds.size > 0) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      button.classList.add('is-drag-over');
    }
  });

  button.addEventListener('dragleave', () => {
    button.classList.remove('is-drag-over');
  });

  button.addEventListener('drop', (e) => {
    e.preventDefault();
    button.classList.remove('is-drag-over');
    // Show input on drop
    button.classList.add('hidden');
    inputWrap.classList.remove('hidden');
    input.focus();
  });

  button.addEventListener('click', () => {
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

        if (pendingSelectedIds.length > 0) {
          await commitSelectionToGroup(targetDomain, { selectedIds: pendingSelectedIds });
        } else {
          // No selection: just create empty group as drop target
          await createCustomGroup(groupName);
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

  const header = document.createElement('div');
  header.className = 'domain-group-header';
  if (group.count > 0) {
    header.setAttribute('role', 'button');
    header.tabIndex = 0;
    header.setAttribute('aria-label', `${group.count} pages from ${group.domain}`);
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
  count.textContent = `${group.count} pages`;

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
      removeCustomGroup(group.domain).catch((error) => {
        setStatus(error && error.message ? error.message : 'Could not remove group');
      });
      return;
    }

    state.emptyGroupDeleteArmed.add(group.domain);
    header.classList.add('is-delete-armed');
  };

  if (group.count === 0) {
    chevron.setAttribute('role', 'button');
    chevron.tabIndex = 0;
    chevron.setAttribute('aria-label', `Remove empty group ${group.domain}`);
  }

  chevron.addEventListener('click', activateEmptyGroupRemoval);
  chevron.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') {
      return;
    }
    activateEmptyGroupRemoval(e);
  });

  // Quick actions for the group (only show for non-empty groups)
  if (group.count > 0) {
    const actions = document.createElement('span');
    actions.className = 'domain-group-actions';

    const toggleBtn = document.createElement('button');
    toggleBtn.className = 'domain-group-action-btn';
    toggleBtn.type = 'button';
    toggleBtn.dataset.domain = group.domain;

    const isOpened = state.openedDomainTabs.has(group.domain);
    toggleBtn.title = isOpened ? `Close all ${group.count} tabs` : `Open all ${group.count} pages`;
    toggleBtn.setAttribute('aria-label', isOpened ? `Close all ${group.count} tabs from ${group.domain}` : `Open all ${group.count} pages from ${group.domain}`);
    toggleBtn.innerHTML = isOpened
      ? '<span class="action-icon action-icon-close-all" aria-hidden="true"></span>'
      : '<span class="action-icon action-icon-open-all" aria-hidden="true"></span>';

    if (isOpened) {
      toggleBtn.classList.add('is-opened');
    }

    actions.appendChild(toggleBtn);
    header.appendChild(actions);

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
          for (const tabId of tabIds) {
            try {
              await chrome.tabs.remove(tabId);
            } catch (err) {
              // Tab might already be closed manually.
            }
          }
          state.openedDomainTabs.delete(domain);
          await persistOpenedTabs();

          // Update button UI
          const iconSpan = toggleBtn.querySelector('.action-icon');
          if (iconSpan) {
            iconSpan.className = 'action-icon action-icon-open-all';
          }
          toggleBtn.classList.remove('is-opened');
          toggleBtn.title = `Open all ${group.count} pages`;
          toggleBtn.setAttribute('aria-label', `Open all ${group.count} pages from ${group.domain}`);
        } else {
          // Open all tabs for this domain
          const tabIds = [];
          for (const entry of group.entries) {
            if (entry && entry.url) {
              const tab = await chrome.tabs.create({ url: entry.url, active: false });
              if (tab && Number.isInteger(tab.id)) {
                tabIds.push(tab.id);
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
            toggleBtn.title = `Close all ${group.count} tabs`;
            toggleBtn.setAttribute('aria-label', `Close all ${group.count} tabs from ${group.domain}`);
          } else {
            state.openedDomainTabs.delete(domain);
            await persistOpenedTabs();
          }
        }
      } finally {
        toggleBtn.disabled = false;
      }
    });
  }

  const contentWrap = document.createElement('div');
  contentWrap.className = 'domain-group-content';
  const shouldExpand = isExpanded;
  if (shouldExpand) {
    contentWrap.classList.add('is-expanded');
  }

  const toggleExpansion = () => {
    if (group.count === 0) return;

    state.emptyGroupDeleteArmed.clear();
    const previousPositions = snapshotListPositions();
    const wasExpanded = state.expandedDomains.has(group.domain);

    // Prevent clicks during animation
    header.classList.add('is-animating');

    if (wasExpanded) {
      state.expandedDomains.delete(group.domain);
      persistExpandedDomains().catch((error) => {
        setStatus(error && error.message ? error.message : 'Could not save group state');
      });
      contentWrap.classList.remove('is-revealing');
      contentWrap.classList.remove('is-expanded');
      header.setAttribute('aria-expanded', 'false');
      animateListReflow(previousPositions, { exclude: container });
      setTimeout(() => {
        header.classList.remove('is-animating');
      }, 300);
    } else {
      state.expandedDomains.add(group.domain);
      persistExpandedDomains().catch((error) => {
        setStatus(error && error.message ? error.message : 'Could not save group state');
      });
      header.setAttribute('aria-expanded', 'true');
      contentWrap.classList.add('is-expanded');
      contentWrap.classList.add('is-revealing');
      animateListReflow(previousPositions, { exclude: container });

      setTimeout(() => {
        contentWrap.classList.remove('is-revealing');
        header.classList.remove('is-animating');
      }, 300);
    }
  };

  header.addEventListener('click', (e) => {
    if (e.target.closest('.domain-group-actions')) {
      return;
    }
    if (group.count === 0) return;
    toggleExpansion();
  });

  header.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') {
      return;
    }
    if (group.count === 0) return;
    e.preventDefault();
    toggleExpansion();
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

  // Drop zone for dragging entries to this group
  header.addEventListener('dragover', (e) => {
    if (state.selectionMode && state.selectedIds.size > 0) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      header.classList.add('is-drag-over');
    }
  });

  header.addEventListener('dragleave', () => {
    header.classList.remove('is-drag-over');
  });

  header.addEventListener('drop', async (e) => {
    e.preventDefault();
    header.classList.remove('is-drag-over');
    if (state.selectionMode && state.selectedIds.size > 0) {
      await commitSelectionToGroup(group.domain);
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

function render() {
  syncCurrentTabEntry();

  if (state.selectionMode && state.selectedIds.size === 0) {
    state.selectionMode = false;
    state.pendingGroupSelectedIds = [];
    state.showCreateGroup = false;
    document.body.classList.remove('selection-mode');
  }
  document.body.classList.toggle('flat-view', !state.selectionMode && state.viewMode === 'flat');

  const visible = ReadLaterCore.filterEntries(ReadLaterCore.sortEntriesForDisplay(state.entries), state.query);
  state.visibleEntries = visible;

  let elements;
  const effectiveViewMode = state.selectionMode ? 'grouped' : state.viewMode;
  if (effectiveViewMode === 'flat') {
    // Flat view: render all entries directly without grouping
    elements = visible.map(entry => renderEntry(entry));
  } else {
    // Grouped view: group by domain
    const customGroupsForRender = state.query && !state.selectionMode ? [] : state.customGroups;
    const groups = ReadLaterCore.groupEntriesByDomain(visible, customGroupsForRender);
    elements = groups.map(group => {
      if (group.type === 'single') {
        return renderEntry(group.entry);
      } else {
        return renderDomainGroup(group);
      }
    });
  }

  // Insert "Create new group" item at the top in selection mode
  if (state.selectionMode && state.showCreateGroup && state.selectedIds.size > 0) {
    if (!state.pendingGroupSelectedIds.length) {
      state.pendingGroupSelectedIds = Array.from(state.selectedIds);
    }
    const createGroupItem = renderCreateGroupItem(state.pendingGroupSelectedIds);
    elements.unshift(createGroupItem);
  }

  els.entriesList.replaceChildren(...elements);
  renderEmptyState(visible, elements.length);
  renderAddButtonState();

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
  els.deleteSelectedBtn.addEventListener('click', deleteSelectedEntries);
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
        deleteSelectedEntries();
        return;
      }
      // In normal mode, delete focused entry
      const entry = focusedEntry();
      if (entry) {
        event.preventDefault();
        removeEntry(entry);
      }
      return;
    }
    if (event.key === 'Enter') {
      const entry = focusedEntry();
      if (entry && document.activeElement !== els.searchInput) {
        event.preventDefault();
        openEntry(entry);
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
  document.body.classList.toggle('flat-view', state.viewMode === 'flat');
  bind();
  loadEntries().catch((error) => {
    setStatus(error && error.message ? error.message : 'Could not load list');
  });

  // Listen for storage changes from background script (e.g., Alt+1 shortcut)
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (shouldReloadFromStorageChange(changes, areaName)) {
      loadEntries().catch((error) => {
        console.error('Failed to reload entries:', error);
      });
    }
  });
}

document.addEventListener('DOMContentLoaded', init);
})();
