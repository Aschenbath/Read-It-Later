(function () {
const STORAGE_KEY = 'readLaterItems';

function cleanText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function normalizeUrl(value) {
  const raw = cleanText(value);
  if (!raw) return '';
  try {
    const url = new URL(raw);
    url.hash = '';
    if (url.pathname !== '/' && url.pathname.endsWith('/')) {
      url.pathname = url.pathname.replace(/\/+$/, '');
    }
    if (url.pathname === '/') {
      url.pathname = '';
    }
    const serialized = url.toString();
    if (url.pathname === '/' && !url.search) {
      return serialized.replace(/\/$/, '');
    }
    return serialized;
  } catch {
    return raw.replace(/#.*$/, '').replace(/\/+$/, '');
  }
}

function domainFromUrl(value) {
  const url = normalizeUrl(value);
  if (!url) return '';
  try {
    const parsed = new URL(url);
    if (!/^https?:$/i.test(parsed.protocol)) {
      return `${parsed.protocol}//${parsed.hostname || parsed.pathname}`.replace(/\/+$/, '');
    }
    return parsed.hostname || `${parsed.protocol}//${parsed.pathname}`.replace(/\/+$/, '');
  } catch {
    return url.replace(/^https?:\/\//i, '').split('/')[0] || url;
  }
}

function idFromUrl(value) {
  return encodeURIComponent(normalizeUrl(value));
}

function isSafeIconUrl(value) {
  const raw = cleanText(value);
  if (!raw) return false;
  if (/^data:image\//i.test(raw)) return true;
  try {
    const parsed = new URL(raw);
    return parsed.protocol === 'https:' || parsed.protocol === 'chrome:';
  } catch {
    return false;
  }
}

function normalizeEntry(entry, now = Date.now()) {
  const source = entry || {};
  const url = normalizeUrl(source.url);
  const sourceDomain = cleanText(source.domain);
  const domain = sourceDomain || domainFromUrl(url);
  const title = cleanText(source.title) || url || 'Untitled';
  const createdAt = Number.isFinite(Number(source.createdAt)) ? Number(source.createdAt) : now;
  const updatedAt = Number.isFinite(Number(source.updatedAt)) ? Number(source.updatedAt) : now;
  return {
    id: cleanText(source.id) || idFromUrl(url),
    title,
    url,
    domain,
    favIconUrl: isSafeIconUrl(source.favIconUrl) ? cleanText(source.favIconUrl) : '',
    createdAt,
    updatedAt
  };
}

function buildEntryFromTab(tab, now = Date.now()) {
  const source = tab || {};
  return normalizeEntry({
    title: source.title,
    url: source.url,
    favIconUrl: source.favIconUrl,
    createdAt: now,
    updatedAt: now
  }, now);
}

function sortEntriesForDisplay(entries) {
  return [...(Array.isArray(entries) ? entries : [])].sort((a, b) => {
    const updated = (Number(b.updatedAt) || 0) - (Number(a.updatedAt) || 0);
    if (updated !== 0) return updated;
    return (Number(b.createdAt) || 0) - (Number(a.createdAt) || 0);
  });
}

function formatSavedAt(value, now = Date.now()) {
  const timestamp = Number(value);
  const current = Number(now);
  if (!Number.isFinite(timestamp) || !Number.isFinite(current)) return '';

  const diff = Math.max(0, current - timestamp);
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (diff < minute) return 'Just now';
  if (diff < hour) return `${Math.floor(diff / minute)}m ago`;
  if (diff < day) return `${Math.floor(diff / hour)}h ago`;
  if (diff < 7 * day) return `${Math.floor(diff / day)}d ago`;

  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const date = new Date(timestamp);
  return `${months[date.getMonth()]} ${date.getDate()}`;
}

function findEntryByUrl(entries, url) {
  const key = normalizeUrl(url);
  if (!key) return null;
  const list = Array.isArray(entries) ? entries.map(entry => normalizeEntry(entry)) : [];
  return list.find(entry => normalizeUrl(entry.url) === key) || null;
}

function upsertEntry(entries, entry) {
  const list = Array.isArray(entries) ? entries.map(item => normalizeEntry(item)) : [];
  const nextEntry = normalizeEntry(entry);
  const key = normalizeUrl(nextEntry.url);
  const index = list.findIndex(item => normalizeUrl(item.url) === key);
  if (index === -1) {
    return { entries: sortEntriesForDisplay([nextEntry, ...list]), changed: true, created: true, entry: nextEntry };
  }

  const oldEntry = list[index];
  const oldDomain = oldEntry.domain || '';
  const newDomain = nextEntry.domain || '';

  // Preserve custom domain if old domain differs from extracted domain (user manually grouped it)
  const oldExtractedDomain = domainFromUrl(oldEntry.url);
  const isCustomDomain = oldDomain !== oldExtractedDomain;

  const merged = {
    ...oldEntry,
    ...nextEntry,
    id: oldEntry.id || nextEntry.id,
    createdAt: oldEntry.createdAt || nextEntry.createdAt,
    updatedAt: nextEntry.updatedAt || Date.now(),
    // Preserve custom domain if it was manually set
    domain: isCustomDomain ? oldDomain : newDomain
  };
  const next = [...list];
  next[index] = merged;
  return { entries: sortEntriesForDisplay(next), changed: true, created: false, entry: merged };
}

function deleteEntry(entries, id) {
  const list = Array.isArray(entries) ? entries : [];
  const before = list.length;
  const next = list.filter(entry => entry && String(entry.id) !== String(id));
  return { entries: next, changed: next.length !== before };
}

function filterEntries(entries, query) {
  const list = Array.isArray(entries) ? entries : [];
  const q = cleanText(query);
  if (!q) return [...list];

  // Parse @domain filter
  let domainFilter = '';
  let textQuery = q;
  const domainMatch = q.match(/@(\S+)/);
  if (domainMatch) {
    domainFilter = domainMatch[1].toLowerCase();
    textQuery = q.replace(/@\S+/g, '').trim();
  }

  const textQueryLower = textQuery.toLowerCase();

  return list.filter((entry) => {
    // Domain filter check
    if (domainFilter) {
      const entryDomain = String(entry && entry.domain || '').toLowerCase();
      if (!entryDomain.includes(domainFilter)) {
        return false;
      }
    }

    // Text search check
    if (textQueryLower) {
      const text = [
        entry && entry.title,
        entry && entry.domain,
        entry && entry.url
      ].map(value => String(value || '').toLowerCase()).join(' ');
      return text.includes(textQueryLower);
    }

    return true;
  });
}

function isSavableTab(tab) {
  const url = normalizeUrl(tab && tab.url);
  return !!url && !/^(about:|chrome:\/\/newtab|edge:\/\/newtab)$/i.test(url);
}

function groupEntriesByDomain(entries, customGroups = []) {
  const list = Array.isArray(entries) ? entries : [];
  const byDomain = new Map();
  const customGroupNames = [];

  for (const group of Array.isArray(customGroups) ? customGroups : []) {
    const name = cleanText(group);
    if (name && !byDomain.has(name)) {
      byDomain.set(name, []);
      customGroupNames.push(name);
    }
  }
  const customGroupSet = new Set(customGroupNames);

  for (const entry of list) {
    const domain = entry.domain || 'unknown';
    if (!byDomain.has(domain)) {
      byDomain.set(domain, []);
    }
    byDomain.get(domain).push(entry);
  }

  const groups = [];
  for (const [domain, items] of byDomain) {
    const isCustomGroup = customGroupSet.has(domain);
    // Check if this domain is a real extracted domain or a user-created group name
    const isRealDomain = items.some(entry => {
      const extractedDomain = domainFromUrl(entry.url);
      return extractedDomain === domain;
    });

    if (items.length === 1 && isRealDomain && !isCustomGroup) {
      // Single entry with real domain: show as single item
      groups.push({ type: 'single', entry: items[0] });
    } else {
      // Multiple entries, empty custom groups, or user-created groups: show as group
      groups.push({ type: 'group', domain, entries: items, count: items.length });
    }
  }

  return groups;
}

globalThis.ReadLaterCore = {
  STORAGE_KEY,
  buildEntryFromTab,
  cleanText,
  deleteEntry,
  domainFromUrl,
  findEntryByUrl,
  formatSavedAt,
  filterEntries,
  groupEntriesByDomain,
  idFromUrl,
  isSavableTab,
  isSafeIconUrl,
  normalizeEntry,
  normalizeUrl,
  sortEntriesForDisplay,
  upsertEntry
};

if (typeof module !== 'undefined') {
  module.exports = globalThis.ReadLaterCore;
}
})();
