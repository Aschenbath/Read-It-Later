const assert = require('assert');
const {
  buildEntryFromTab,
  deleteEntry,
  domainFromUrl,
  findEntryByUrl,
  formatSavedAt,
  filterEntries,
  isSafeIconUrl,
  normalizeEntry,
  normalizeUrl,
  sortEntriesForDisplay,
  upsertEntry
} = require('../read-later-core');

const now = 1780732800000; // 2026-06-06T00:00:00.000Z

assert.strictEqual(formatSavedAt(now - 20 * 1000, now), 'Just now');
assert.strictEqual(formatSavedAt(now - 3 * 60 * 1000, now), '3m ago');
assert.strictEqual(formatSavedAt(now - 2 * 60 * 60 * 1000, now), '2h ago');
assert.strictEqual(formatSavedAt(now - 4 * 24 * 60 * 60 * 1000, now), '4d ago');
assert.strictEqual(formatSavedAt(Date.parse('2026-01-02T00:00:00.000Z'), now), 'Jan 2');

assert.strictEqual(normalizeUrl(' https://example.com/read?b=2&a=1#section '), 'https://example.com/read?b=2&a=1');
assert.strictEqual(normalizeUrl('https://example.com/read/'), 'https://example.com/read');
assert.strictEqual(normalizeUrl('chrome://extensions/'), 'chrome://extensions');
assert.strictEqual(normalizeUrl(''), '');
assert.strictEqual(normalizeUrl('not a url'), 'not a url');

assert.strictEqual(domainFromUrl('https://www.bilibili.com/video/BV1xx'), 'www.bilibili.com');
assert.strictEqual(domainFromUrl('chrome://extensions'), 'chrome://extensions');
assert.strictEqual(domainFromUrl('not a url'), 'not a url');
assert.strictEqual(domainFromUrl(''), '');

assert.deepStrictEqual(buildEntryFromTab({
  id: 12,
  title: '  A useful article  ',
  url: 'https://linux.do/t/topic/123#reply-1',
  favIconUrl: 'https://linux.do/favicon.ico'
}, now), {
  id: 'https%3A%2F%2Flinux.do%2Ft%2Ftopic%2F123',
  title: 'A useful article',
  url: 'https://linux.do/t/topic/123',
  domain: 'linux.do',
  favIconUrl: 'https://linux.do/favicon.ico',
  createdAt: now,
  updatedAt: now,
  isRead: false
});

assert.strictEqual(isSafeIconUrl('https://example.com/favicon.ico'), true);
assert.strictEqual(isSafeIconUrl('data:image/png;base64,AAAA'), true);
assert.strictEqual(isSafeIconUrl('chrome://favicon/size/32/https://example.com'), true);
assert.strictEqual(isSafeIconUrl('http://127.0.0.1:8080/logo.png'), false);
assert.strictEqual(isSafeIconUrl('http://localhost:8080/logo.png'), false);
assert.strictEqual(buildEntryFromTab({
  title: 'Local app',
  url: 'http://127.0.0.1:8080/dashboard',
  favIconUrl: 'http://127.0.0.1:8080/logo.png'
}, now).favIconUrl, '');

assert.deepStrictEqual(normalizeEntry({
  title: '',
  url: 'https://example.com/',
  createdAt: 1,
  favIconUrl: 123
}, 2), {
  id: 'https%3A%2F%2Fexample.com',
  title: 'https://example.com',
  url: 'https://example.com',
  domain: 'example.com',
  favIconUrl: '',
  createdAt: 1,
  updatedAt: 2,
  isRead: false
});

const existing = [
  buildEntryFromTab({ title: 'Old title', url: 'https://example.com/post#old' }, now - 1000),
  buildEntryFromTab({ title: 'Other', url: 'https://other.example/path' }, now - 2000)
];

assert.strictEqual(findEntryByUrl(existing, 'https://example.com/post#section').title, 'Old title');
assert.strictEqual(findEntryByUrl(existing, 'https://missing.example/path'), null);

const upserted = upsertEntry(existing, buildEntryFromTab({
  title: 'New title',
  url: 'https://example.com/post#new',
  favIconUrl: 'https://example.com/icon.png'
}, now + 1000));

assert.strictEqual(upserted.changed, true);
assert.strictEqual(upserted.created, false);
assert.strictEqual(upserted.entries.length, 2);
assert.deepStrictEqual(upserted.entries.map(entry => entry.title), ['New title', 'Other']);
assert.strictEqual(upserted.entries[0].createdAt, now - 1000);
assert.strictEqual(upserted.entries[0].updatedAt, now + 1000);
assert.strictEqual(upserted.entries[0].favIconUrl, 'https://example.com/icon.png');

const inserted = upsertEntry(existing, buildEntryFromTab({
  title: 'Fresh',
  url: 'https://fresh.example/read'
}, now + 3000));

assert.strictEqual(inserted.changed, true);
assert.strictEqual(inserted.created, true);
assert.strictEqual(inserted.entries[0].title, 'Fresh');

const sorted = sortEntriesForDisplay([
  { id: 'a', title: 'A', updatedAt: 5 },
  { id: 'b', title: 'B', updatedAt: 10 },
  { id: 'c', title: 'C', updatedAt: 10, createdAt: 20 }
]).map(entry => entry.id);
assert.deepStrictEqual(sorted, ['c', 'b', 'a']);

assert.deepStrictEqual(deleteEntry(existing, existing[0].id).entries.map(entry => entry.title), ['Other']);
assert.strictEqual(deleteEntry(existing, 'missing').changed, false);

const searchable = [
  buildEntryFromTab({ title: 'Oracle Cloud Always Free', url: 'https://www.youtube.com/watch?v=abc' }, now),
  buildEntryFromTab({ title: '统计学 2 小时快速复习', url: 'https://www.bilibili.com/video/BV1abc' }, now),
  buildEntryFromTab({ title: 'TechSpar 开源训练', url: 'https://linux.do/t/topic/456' }, now)
];
assert.deepStrictEqual(filterEntries(searchable, 'linux').map(entry => entry.title), ['TechSpar 开源训练']);
assert.deepStrictEqual(filterEntries(searchable, '统计').map(entry => entry.title), ['统计学 2 小时快速复习']);
assert.deepStrictEqual(filterEntries(searchable, 'YOUTUBE').map(entry => entry.title), ['Oracle Cloud Always Free']);
assert.deepStrictEqual(filterEntries(searchable, '   ').map(entry => entry.title), searchable.map(entry => entry.title));
