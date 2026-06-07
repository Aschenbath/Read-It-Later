(function () {
const ReadLaterCore = globalThis.ReadLaterCore;
const storageKey = ReadLaterCore.STORAGE_KEY;

const state = {
  entries: [],
  query: '',
  busy: false,
  visibleEntries: [],
  currentTab: null,
  currentTabEntry: null,
  expandedDomains: new Set(),
  openedDomainTabs: new Map(), // domain -> array of tab IDs
  selectionMode: false,
  selectedIds: new Set()
};

const els = {};

function byId(id) {
  return document.getElementById(id);
}

function setStatus(text) {
  els.statusText.textContent = text || '';
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

function currentTab() {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      resolve((tabs || [])[0] || null);
    });
  });
}

async function loadEntries() {
  const result = await chromeGet({ [storageKey]: [], openedDomainTabs: {} });
  const entries = Array.isArray(result[storageKey]) ? result[storageKey] : [];
  state.entries = ReadLaterCore.sortEntriesForDisplay(entries.map(entry => ReadLaterCore.normalizeEntry(entry)));

  // Restore opened domain tabs state
  const savedOpenedTabs = result.openedDomainTabs || {};
  state.openedDomainTabs = new Map(Object.entries(savedOpenedTabs));

  await refreshCurrentTabState({ render: false, force: true });
  render();
}

async function persist(entries) {
  state.entries = ReadLaterCore.sortEntriesForDisplay(entries);
  await chromeSet({ [storageKey]: state.entries });
  render();
}

async function persistOpenedTabs() {
  const openedTabsObj = Object.fromEntries(state.openedDomainTabs);
  await chromeSet({ openedDomainTabs: openedTabsObj });
}

function enterSelectionMode() {
  state.selectionMode = true;
  state.selectedIds.clear();
  document.body.classList.add('selection-mode');
  render();
}

function exitSelectionMode() {
  state.selectionMode = false;
  state.selectedIds.clear();
  document.body.classList.remove('selection-mode');
  render();
}

function toggleSelection(entryId) {
  if (state.selectedIds.has(entryId)) {
    state.selectedIds.delete(entryId);
  } else {
    state.selectedIds.add(entryId);
  }
  render();
}

async function createGroupFromSelection() {
  if (state.selectedIds.size === 0) return;

  const groupName = prompt('Enter group name:', '');
  if (!groupName || !groupName.trim()) {
    return;
  }

  const trimmedName = groupName.trim();
  const selectedEntries = state.entries.filter(e => state.selectedIds.has(e.id));

  // Update domain for selected entries
  const updatedEntries = state.entries.map(entry => {
    if (state.selectedIds.has(entry.id)) {
      return { ...entry, domain: trimmedName };
    }
    return entry;
  });

  await persist(updatedEntries);
  exitSelectionMode();
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

function makeIcon(entry) {
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

async function markAsRead(entry) {
  if (!entry || entry.isRead) return;

  const index = state.entries.findIndex(e => e.id === entry.id);
  if (index === -1) return;

  state.entries[index] = { ...state.entries[index], isRead: true };
  await persist(state.entries);
}

async function toggleReadStatus(entry) {
  if (!entry) return;

  const index = state.entries.findIndex(e => e.id === entry.id);
  if (index === -1) return;

  state.entries[index] = { ...state.entries[index], isRead: !state.entries[index].isRead };
  await persist(state.entries);
}

async function removeEntry(entry) {
  const next = ReadLaterCore.deleteEntry(state.entries, entry.id);
  if (!next.changed) return;

  const card = els.entriesList.querySelector(`[data-id="${CSS.escape(entry.id)}"]`);
  if (card) {
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
  item.classList.toggle('is-read', !!entry.isRead);
  item.classList.toggle('is-selected', state.selectedIds.has(entry.id));

  // Selection mode checkbox
  if (state.selectionMode) {
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'entry-checkbox';
    checkbox.checked = state.selectedIds.has(entry.id);
    checkbox.addEventListener('change', (e) => {
      e.stopPropagation();
      toggleSelection(entry.id);
    });
    item.appendChild(checkbox);
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

  const domain = document.createElement('span');
  domain.className = 'entry-domain';
  domain.textContent = entry.domain || entry.url;

  const savedAt = document.createElement('span');
  savedAt.className = 'entry-saved-at';
  savedAt.textContent = ReadLaterCore.formatSavedAt(entry.updatedAt || entry.createdAt);

  const meta = document.createElement('span');
  meta.className = 'entry-meta';
  meta.appendChild(domain);
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

  const startLongPress = (e) => {
    if (state.selectionMode) return;
    touchMoved = false;
    longPressTimer = setTimeout(() => {
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
  openButton.addEventListener('touchend', cancelLongPress);
  openButton.addEventListener('mousemove', handleMove);
  openButton.addEventListener('touchmove', handleMove, { passive: true });

  openButton.addEventListener('click', (e) => {
    if (state.selectionMode) {
      e.preventDefault();
      toggleSelection(entry.id);
    } else if (!touchMoved) {
      openEntry(entry);
      markAsRead(entry);
    }
  });

  openButton.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    if (!state.selectionMode) {
      toggleReadStatus(entry);
    }
  });

  del.addEventListener('click', () => removeEntry(entry));

  return item;
}

function renderDomainGroup(group) {
  const container = document.createElement('div');
  container.className = 'domain-group';
  container.dataset.domain = group.domain;

  const isExpanded = state.expandedDomains.has(group.domain);

  const header = document.createElement('button');
  header.className = 'domain-group-header';
  header.type = 'button';
  header.setAttribute('aria-label', `${group.count} pages from ${group.domain}`);
  header.setAttribute('aria-expanded', isExpanded ? 'true' : 'false');

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
  chevron.setAttribute('aria-hidden', 'true');
  header.appendChild(chevron);

  // Quick actions for the group
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

  const contentWrap = document.createElement('div');
  contentWrap.className = 'domain-group-content';
  if (!isExpanded) {
    contentWrap.style.display = 'none';
  }

  const content = document.createElement('div');
  content.className = 'domain-group-entries';
  group.entries.forEach((entry, index) => {
    const card = renderEntry(entry);
    card.style.setProperty('--stack-index', index);
    content.appendChild(card);
  });

  contentWrap.appendChild(content);
  container.appendChild(header);
  container.appendChild(contentWrap);

  header.addEventListener('click', (e) => {
    // Don't toggle if clicking action buttons
    if (e.target.closest('.domain-group-actions')) {
      return;
    }

    const wasExpanded = state.expandedDomains.has(group.domain);
    if (wasExpanded) {
      state.expandedDomains.delete(group.domain);
      header.setAttribute('aria-expanded', 'false');
      contentWrap.style.maxHeight = contentWrap.scrollHeight + 'px';
      requestAnimationFrame(() => {
        contentWrap.style.maxHeight = '0';
        contentWrap.style.opacity = '0';
      });
      setTimeout(() => {
        contentWrap.style.display = 'none';
      }, 320);
    } else {
      state.expandedDomains.add(group.domain);
      header.setAttribute('aria-expanded', 'true');
      contentWrap.style.display = 'block';
      contentWrap.style.maxHeight = '0';
      contentWrap.style.opacity = '0';
      requestAnimationFrame(() => {
        contentWrap.style.maxHeight = contentWrap.scrollHeight + 'px';
        contentWrap.style.opacity = '1';
      });
      setTimeout(() => {
        contentWrap.style.maxHeight = 'none';
      }, 320);
    }
  });

  toggleBtn.addEventListener('click', async (e) => {
    e.stopPropagation();

    const domain = group.domain;
    const isCurrentlyOpened = state.openedDomainTabs.has(domain);

    if (isCurrentlyOpened) {
      // Close all tabs for this domain
      const tabIds = state.openedDomainTabs.get(domain) || [];
      for (const tabId of tabIds) {
        try {
          await chrome.tabs.remove(tabId);
        } catch (err) {
          // Tab might already be closed manually
          console.log('Tab already closed:', tabId);
        }
      }
      state.openedDomainTabs.delete(domain);
      await persistOpenedTabs();

      // Update button UI
      toggleBtn.classList.remove('is-opened');
      toggleBtn.title = `Open all ${group.count} pages`;
      toggleBtn.setAttribute('aria-label', `Open all ${group.count} pages from ${group.domain}`);
      toggleBtn.innerHTML = '<span class="action-icon action-icon-open-all" aria-hidden="true"></span>';
    } else {
      // Open all tabs for this domain
      const tabIds = [];
      for (const entry of group.entries) {
        if (entry && entry.url) {
          const tab = await chrome.tabs.create({ url: entry.url, active: false });
          tabIds.push(tab.id);
        }
      }
      state.openedDomainTabs.set(domain, tabIds);
      await persistOpenedTabs();

      // Update button UI
      toggleBtn.classList.add('is-opened');
      toggleBtn.title = `Close all ${group.count} tabs`;
      toggleBtn.setAttribute('aria-label', `Close all ${group.count} tabs from ${group.domain}`);
      toggleBtn.innerHTML = '<span class="action-icon action-icon-close-all" aria-hidden="true"></span>';
    }
  });

  return container;
}

function renderEmptyState(visible) {
  const isEmpty = state.entries.length === 0;
  const hasNoMatches = !isEmpty && state.query;
  els.emptyState.classList.toggle('hidden', visible.length !== 0);
  els.emptyTitle.textContent = hasNoMatches ? 'No matching pages' : 'No pages yet';
  els.emptyCopy.textContent = hasNoMatches
    ? 'Clear the search to return to your saved reading queue.'
    : 'Save the current tab when you want a quiet reading queue.';
  els.emptyActionBtn.textContent = hasNoMatches ? 'Clear search' : 'Save current page';
  els.emptyActionBtn.dataset.action = hasNoMatches ? 'clear' : 'add';
}

function renderAddButtonState() {
  const isSaved = !!state.currentTabEntry;
  els.addCurrentPageBtn.classList.toggle('is-saved', isSaved);
  els.addCurrentPageBtn.title = isSaved ? 'Current page is saved' : 'Add current page';
  els.addCurrentPageBtn.setAttribute(
    'aria-label',
    isSaved ? 'Current page is already saved' : 'Add current page'
  );
}

function render() {
  syncCurrentTabEntry();
  const visible = ReadLaterCore.filterEntries(ReadLaterCore.sortEntriesForDisplay(state.entries), state.query);
  state.visibleEntries = visible;

  const groups = ReadLaterCore.groupEntriesByDomain(visible);
  const elements = groups.map(group => {
    if (group.type === 'single') {
      return renderEntry(group.entry);
    } else {
      return renderDomainGroup(group);
    }
  });

  els.entriesList.replaceChildren(...elements);
  renderEmptyState(visible);
  renderAddButtonState();
  els.clearSearchBtn.classList.toggle('hidden', !state.query);

  // Update selection toolbar
  if (state.selectionMode) {
    els.selectionToolbar.classList.remove('hidden');
    els.selectionCount.textContent = `${state.selectedIds.size} selected`;
    els.createGroupBtn.disabled = state.selectedIds.size === 0;
  } else {
    els.selectionToolbar.classList.add('hidden');
  }
}

async function addCurrentPage() {
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
  const index = focusedEntryIndex();
  return index >= 0 ? state.visibleEntries[index] : null;
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
    setSearch('');
  });
  els.searchInput.addEventListener('input', () => {
    state.query = els.searchInput.value;
    render();
  });
  els.cancelSelectionBtn.addEventListener('click', exitSelectionMode);
  els.createGroupBtn.addEventListener('click', createGroupFromSelection);
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
      const entry = focusedEntry();
      if (entry) {
        event.preventDefault();
        removeEntry(entry);
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
  els.entriesList = byId('entriesList');
  els.emptyState = byId('emptyState');
  els.emptyTitle = byId('emptyTitle');
  els.statusText = byId('statusText');
  els.selectionToolbar = byId('selectionToolbar');
  els.cancelSelectionBtn = byId('cancelSelectionBtn');
  els.createGroupBtn = byId('createGroupBtn');
  els.selectionCount = byId('selectionCount');
  bind();
  loadEntries().catch((error) => {
    setStatus(error && error.message ? error.message : 'Could not load list');
  });

  // Listen for storage changes from background script (e.g., Alt+1 shortcut)
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'local' && changes[storageKey]) {
      loadEntries().catch((error) => {
        console.error('Failed to reload entries:', error);
      });
    }
  });
}

document.addEventListener('DOMContentLoaded', init);
})();
