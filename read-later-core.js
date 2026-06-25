(function () {
const STORAGE_KEY = 'readLaterItems';
const SAVABLE_PROTOCOLS = new Set([
  'http:',
  'https:',
  'arc:',
  'brave:',
  'chrome:',
  'chrome-untrusted:',
  'devtools:',
  'edge:',
  'opera:',
  'vivaldi:'
]);
const BLOCKED_ABOUT_PATHS = new Set(['blank', 'srcdoc']);
const LOCAL_FILE_DOMAIN = 'Local Files';
const SAFE_DATA_IMAGE_TYPES = new Set([
  'avif',
  'bmp',
  'gif',
  'jpeg',
  'jpg',
  'png',
  'vnd.microsoft.icon',
  'webp',
  'x-icon'
]);

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
    if (parsed.protocol === 'file:') {
      return LOCAL_FILE_DOMAIN;
    }
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

function isSavableUrl(value) {
  const url = normalizeUrl(value);
  if (!url) return false;
  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'about:') {
      const path = cleanText(parsed.pathname).toLowerCase();
      return !!path && !BLOCKED_ABOUT_PATHS.has(path);
    }
    if (parsed.protocol === 'file:') {
      return true;
    }
    return SAVABLE_PROTOCOLS.has(parsed.protocol);
  } catch {
    return false;
  }
}

function isSafeIconUrl(value) {
  const raw = cleanText(value);
  if (!raw) return false;
  const dataImageMatch = raw.match(/^data:image\/([a-z0-9.+-]+)(?:[;,]|$)/i);
  if (dataImageMatch) {
    return SAFE_DATA_IMAGE_TYPES.has(dataImageMatch[1].toLowerCase());
  }
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
  const normalized = {
    id: cleanText(source.id) || idFromUrl(url),
    title,
    url,
    domain,
    favIconUrl: isSafeIconUrl(source.favIconUrl) ? cleanText(source.favIconUrl) : '',
    createdAt,
    updatedAt
  };
  if (source.customTitle === true) {
    normalized.customTitle = true;
  }
  if (source.pinned === true) {
    normalized.pinned = true;
  }
  return normalized;
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

function isCustomDomainEntry(entry) {
  if (!entry || !entry.domain || !entry.url) return false;
  return entry.domain !== domainFromUrl(entry.url);
}

function isNewerEntry(candidate, current) {
  const candidateUpdated = Number(candidate && candidate.updatedAt) || 0;
  const currentUpdated = Number(current && current.updatedAt) || 0;
  if (candidateUpdated !== currentUpdated) {
    return candidateUpdated > currentUpdated;
  }
  return (Number(candidate && candidate.createdAt) || 0) >= (Number(current && current.createdAt) || 0);
}

function mergeRecoveredEntry(current, candidate) {
  const winner = isNewerEntry(candidate, current) ? candidate : current;
  const other = winner === candidate ? current : candidate;
  const winnerCustomDomain = isCustomDomainEntry(winner) ? winner.domain : '';
  const otherCustomDomain = isCustomDomainEntry(other) ? other.domain : '';
  const customTitleEntry = current.customTitle && candidate.customTitle
    ? winner
    : current.customTitle
      ? current
      : candidate.customTitle
        ? candidate
        : null;
  const merged = {
    ...winner,
    title: customTitleEntry ? customTitleEntry.title : winner.title,
    createdAt: Math.min(Number(current.createdAt) || 0, Number(candidate.createdAt) || 0),
    updatedAt: Math.max(Number(current.updatedAt) || 0, Number(candidate.updatedAt) || 0),
    domain: winnerCustomDomain || otherCustomDomain || winner.domain,
    favIconUrl: winner.favIconUrl || other.favIconUrl || ''
  };
  if (customTitleEntry) {
    merged.customTitle = true;
  } else {
    delete merged.customTitle;
  }
  if (current.pinned === true || candidate.pinned === true) {
    merged.pinned = true;
  } else {
    delete merged.pinned;
  }
  return merged;
}

function normalizeEntries(entries, now = Date.now()) {
  const list = Array.isArray(entries) ? entries : [];
  const byUrl = new Map();
  for (const item of list) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      continue;
    }
    const entry = normalizeEntry(item, now);
    if (!entry.id || !isSavableUrl(entry.url)) {
      continue;
    }
    const key = normalizeUrl(entry.url);
    const current = byUrl.get(key);
    byUrl.set(key, current ? mergeRecoveredEntry(current, entry) : entry);
  }
  return sortEntriesForDisplay(Array.from(byUrl.values()));
}

function sortEntriesForDisplay(entries) {
  return [...(Array.isArray(entries) ? entries : [])].sort((a, b) => {
    const pinned = (b.pinned === true ? 1 : 0) - (a.pinned === true ? 1 : 0);
    if (pinned !== 0) return pinned;
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
  const list = normalizeEntries(entries);
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
  const preserveCustomTitle = oldEntry.customTitle === true && !!oldEntry.title;

  const merged = {
    ...oldEntry,
    ...nextEntry,
    id: oldEntry.id || nextEntry.id,
    title: preserveCustomTitle ? oldEntry.title : nextEntry.title,
    createdAt: oldEntry.createdAt || nextEntry.createdAt,
    updatedAt: nextEntry.updatedAt || Date.now(),
    // Preserve custom domain if it was manually set
    domain: isCustomDomain ? oldDomain : newDomain
  };
  if (preserveCustomTitle) {
    merged.customTitle = true;
  } else {
    delete merged.customTitle;
  }
  const next = [...list];
  next[index] = merged;
  return { entries: sortEntriesForDisplay(next), changed: true, created: false, entry: merged };
}

function togglePinnedEntry(entries, id) {
  const list = normalizeEntries(entries);
  const index = list.findIndex(entry => entry && String(entry.id) === String(id));
  if (index < 0) {
    return { entries: list, changed: false, entry: null };
  }

  const current = list[index];
  const nextEntry = { ...current };
  if (current.pinned === true) {
    delete nextEntry.pinned;
  } else {
    nextEntry.pinned = true;
  }
  const next = [...list];
  next[index] = nextEntry;
  return { entries: sortEntriesForDisplay(next), changed: true, entry: nextEntry };
}

function renameEntryTitle(entries, id, title, now = Date.now()) {
  const nextTitle = cleanText(title);
  if (!nextTitle) {
    return { entries: normalizeEntries(entries), changed: false, entry: null };
  }
  const list = normalizeEntries(entries);
  const index = list.findIndex(entry => entry && String(entry.id) === String(id));
  if (index < 0) {
    return { entries: list, changed: false, entry: null };
  }
  const current = list[index];
  if (current.title === nextTitle && current.customTitle === true) {
    return { entries: list, changed: false, entry: current };
  }
  const renamed = {
    ...current,
    title: nextTitle,
    customTitle: true,
    updatedAt: now
  };
  const next = [...list];
  next[index] = renamed;
  return { entries: sortEntriesForDisplay(next), changed: true, entry: renamed };
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
      const entryDomains = [
        entry && entry.domain,
        entry && domainFromUrl(entry.url)
      ].map(value => String(value || '').toLowerCase());
      if (!entryDomains.some(domain => domain.includes(domainFilter))) {
        return false;
      }
    }

    // Text search check
    if (textQueryLower) {
      const text = [
        entry && entry.title,
        entry && entry.domain,
        entry && domainFromUrl(entry.url),
        entry && entry.url
      ].map(value => String(value || '').toLowerCase()).join(' ');
      return text.includes(textQueryLower);
    }

    return true;
  });
}

function isSavableTab(tab) {
  return isSavableUrl(tab && tab.url);
}

function groupEntriesByDomain(entries, customGroups = [], pinnedGroups = []) {
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
  const pinnedGroupSet = new Set(
    (Array.isArray(pinnedGroups) ? pinnedGroups : [])
      .map(group => cleanText(group))
      .filter(Boolean)
  );

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
      const group = { type: 'group', domain, entries: items, count: items.length };
      if (pinnedGroupSet.has(domain)) {
        group.pinned = true;
      }
      groups.push(group);
    }
  }

  return groups.sort((a, b) => (b.pinned === true ? 1 : 0) - (a.pinned === true ? 1 : 0));
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
  isSavableUrl,
  isSafeIconUrl,
  normalizeEntries,
  normalizeEntry,
  normalizeUrl,
  renameEntryTitle,
  sortEntriesForDisplay,
  togglePinnedEntry,
  upsertEntry
};

if (typeof module !== 'undefined') {
  module.exports = globalThis.ReadLaterCore;
}
})();
