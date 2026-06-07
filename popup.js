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
  expandedDomains: new Set()
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
  const result = await chromeGet({ [storageKey]: [] });
  const entries = Array.isArray(result[storageKey]) ? result[storageKey] : [];
  state.entries = ReadLaterCore.sortEntriesForDisplay(entries.map(entry => ReadLaterCore.normalizeEntry(entry)));
  await refreshCurrentTabState({ render: false, force: true });
  render();
}

async function persist(entries) {
  state.entries = ReadLaterCore.sortEntriesForDisplay(entries);
  await chromeSet({ [storageKey]: state.entries });
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

  openButton.addEventListener('click', () => openEntry(entry));
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

  header.addEventListener('click', () => {
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
  if (state.query) {
    setStatus(`${visible.length} matched`);
  } else {
    setStatus('');
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
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && state.query) {
      event.preventDefault();
      setSearch('', { focus: false });
      return;
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
  bind();
  loadEntries().catch((error) => {
    setStatus(error && error.message ? error.message : 'Could not load list');
  });
}

document.addEventListener('DOMContentLoaded', init);
})();
