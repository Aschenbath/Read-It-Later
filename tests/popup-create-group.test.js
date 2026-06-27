const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const popupSource = fs.readFileSync(path.join(root, 'popup.js'), 'utf8');
const ReadLaterCore = require('../read-later-core');

class TestClassList {
  constructor(element) {
    this.element = element;
    this.names = new Set();
  }

  setFrom(value) {
    this.names = new Set(String(value || '').split(/\s+/).filter(Boolean));
  }

  sync() {
    this.element._className = Array.from(this.names).join(' ');
  }

  add(...names) {
    names.forEach(name => this.names.add(name));
    this.sync();
  }

  remove(...names) {
    names.forEach(name => this.names.delete(name));
    this.sync();
  }

  contains(name) {
    return this.names.has(name);
  }

  toggle(name, force) {
    const shouldAdd = force === undefined ? !this.names.has(name) : !!force;
    if (shouldAdd) {
      this.names.add(name);
    } else {
      this.names.delete(name);
    }
    this.sync();
    return shouldAdd;
  }
}

class TestElement {
  constructor(tagName, ownerDocument) {
    this.tagName = String(tagName || '').toUpperCase();
    this.ownerDocument = ownerDocument;
    this.children = [];
    this.parentNode = null;
    this.attributes = {};
    this.dataset = {};
    this.eventListeners = {};
    this.style = {
      setProperty(name, value) {
        this[name] = value;
      }
    };
    this.scrollHeight = 0;
    this.value = '';
    this.textContent = '';
    this.disabled = false;
    this._className = '';
    this.classList = new TestClassList(this);
  }

  get className() {
    return this._className;
  }

  set className(value) {
    this._className = String(value || '');
    this.classList.setFrom(this._className);
  }

  appendChild(child) {
    child.parentNode = this;
    this.children.push(child);
    return child;
  }

  replaceChildren(...children) {
    this.children.forEach(child => {
      child.parentNode = null;
    });
    this.children = [];
    children.forEach(child => this.appendChild(child));
  }

  setAttribute(name, value) {
    this.attributes[name] = String(value);
    if (name === 'id') {
      this.id = String(value);
    }
    if (name.startsWith('data-')) {
      const key = name.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
      this.dataset[key] = String(value);
    }
  }

  getAttribute(name) {
    return this.attributes[name];
  }

  addEventListener(type, listener) {
    if (!this.eventListeners[type]) {
      this.eventListeners[type] = [];
    }
    this.eventListeners[type].push(listener);
  }

  removeEventListener(type, listener) {
    const listeners = this.eventListeners[type] || [];
    this.eventListeners[type] = listeners.filter(item => item !== listener);
  }

  dispatchEvent(event) {
    const dispatched = {
      bubbles: false,
      defaultPrevented: false,
      propagationStopped: false,
      preventDefault() {
        this.defaultPrevented = true;
      },
      stopPropagation() {
        this.propagationStopped = true;
      },
      ...event
    };
    dispatched.target = dispatched.target || this;
    dispatched.currentTarget = this;
    const results = (this.eventListeners[dispatched.type] || []).map(listener => listener(dispatched));
    if (dispatched.bubbles && !dispatched.propagationStopped && this.parentNode) {
      results.push(...this.parentNode.dispatchEvent(dispatched));
    }
    return results;
  }

  click() {
    return this.dispatchEvent({ type: 'click', bubbles: true });
  }

  focus() {
    this.ownerDocument.activeElement = this;
  }

  select() {}

  closest(selector) {
    let current = this;
    while (current) {
      if (current.matches(selector)) {
        return current;
      }
      current = current.parentNode;
    }
    return null;
  }

  matches(selector) {
    if (selector.startsWith('.')) {
      return this.classList.contains(selector.slice(1));
    }
    if (selector.startsWith('#')) {
      return this.id === selector.slice(1);
    }
    const dataMatch = selector.match(/^\[data-([a-z-]+)="(.+)"\]$/);
    if (dataMatch) {
      const key = dataMatch[1].replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
      return this.dataset[key] === dataMatch[2];
    }
    return this.tagName.toLowerCase() === selector.toLowerCase();
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }

  querySelectorAll(selector) {
    const matches = [];
    const visit = (node) => {
      node.children.forEach(child => {
        if (child.matches(selector)) {
          matches.push(child);
        }
        visit(child);
      });
    };
    visit(this);
    return matches;
  }
}

class TestDocument {
  constructor() {
    this.body = new TestElement('body', this);
    this.activeElement = this.body;
    this.eventListeners = {};
    this.elementsById = new Map();
  }

  createElement(tagName) {
    return new TestElement(tagName, this);
  }

  getElementById(id) {
    return this.elementsById.get(id) || null;
  }

  addEventListener(type, listener) {
    if (!this.eventListeners[type]) {
      this.eventListeners[type] = [];
    }
    this.eventListeners[type].push(listener);
  }
}

function instrumentPopup(source) {
  return source.replace(
    'function render() {\n',
    "function render() {\n  if (globalThis.__renderBodyClasses) globalThis.__renderBodyClasses.push(document.body.className);\n"
  ).replace(
    /document\.addEventListener\('DOMContentLoaded', init\);\s*\}\)\(\);\s*$/,
    [
      'globalThis.__popupTest = {',
      '  state,',
      '  els,',
      '  renderCreateGroupItem,',
      '  createCustomGroup,',
      '  removeCustomGroup,',
      '  commitSelectionToGroup,',
      '  renderDomainGroup,',
      '  render,',
      '  loadEntries,',
      '  addCurrentPage,',
      '  removeEntry,',
      '  toggleEntryPinned,',
      '  deleteSelectedEntries,',
      '  toggleViewMode,',
      '  init,',
      '  persistExpandedDomains,',
      '  persistViewMode,',
      '  __renderBodyClasses: globalThis.__renderBodyClasses,',
      '};',
      "document.addEventListener('DOMContentLoaded', init);",
      '})();'
    ].join('\n')
  );
}

function createHarness(options = {}) {
  const activeTab = options.tab || null;
  let getError = options.getError || '';
  const setError = options.setError || '';
  const queryError = options.queryError || '';
  const createResults = Array.isArray(options.createResults) ? [...options.createResults] : [];
  const removeFailures = new Set(options.removeFailures || []);
  const removeFailureMessages = options.removeFailureMessages || {};
  const document = new TestDocument();
  const storage = {};
  const createdTabs = [];
  const removedTabs = [];
  const getCalls = [];
  const setCalls = [];
  const changeListeners = [];
  const consoleErrors = [];
  const timers = [];
  const context = {
    ReadLaterCore,
    chrome: {
      runtime: {},
      storage: {
        local: {
          get(keys, callback) {
            getCalls.push(keys);
            if (getError) {
              context.chrome.runtime.lastError = { message: getError };
              callback(undefined);
              context.chrome.runtime.lastError = null;
              return;
            }
            const result = {};
            Object.entries(keys || {}).forEach(([key, fallback]) => {
              result[key] = Object.prototype.hasOwnProperty.call(storage, key) ? storage[key] : fallback;
            });
            callback(result);
          },
          set(values, callback) {
            setCalls.push(values);
            if (setError) {
              context.chrome.runtime.lastError = { message: setError };
              callback();
              context.chrome.runtime.lastError = null;
              return;
            }
            const changes = {};
            Object.entries(values || {}).forEach(([key, newValue]) => {
              changes[key] = {
                oldValue: storage[key],
                newValue
              };
            });
            Object.assign(storage, values);
            callback();
            changeListeners.forEach(listener => listener(changes, 'local'));
          }
        },
        onChanged: {
          addListener(listener) {
            changeListeners.push(listener);
          }
        }
      },
      tabs: {
        query(query, callback) {
          if (queryError) {
            context.chrome.runtime.lastError = { message: queryError };
            callback(undefined);
            context.chrome.runtime.lastError = null;
            return;
          }
          callback(activeTab ? [activeTab] : []);
        },
        async create(args) {
          createdTabs.push(args);
          const next = createResults.length > 0
            ? createResults.shift()
            : { id: 1000 + createdTabs.length };
          if (next instanceof Error) {
            throw next;
          }
          return next;
        },
        async remove(tabId) {
          removedTabs.push(tabId);
          if (removeFailures.has(tabId)) {
            throw new Error(removeFailureMessages[tabId] || `Could not close tab ${tabId}`);
          }
        }
      }
    },
    CSS: {
      escape(value) {
        return String(value);
      }
    },
    Date,
    Math,
    Promise,
    clearTimeout(timer) {
      const index = timers.indexOf(timer);
      if (index >= 0) {
        timers.splice(index, 1);
      }
    },
    console: {
      error(...args) {
        consoleErrors.push(args);
      }
    },
    document,
    requestAnimationFrame(callback) {
      callback();
    },
    __renderBodyClasses: [],
    setTimeout(callback, delay = 0) {
      if (options.deferAnimationTimers && delay > 0 && delay < 1000) {
        const timer = { callback, delay };
        timers.push(timer);
        return timer;
      }
      if (delay >= 3000) {
        return { callback, delay };
      }
      return callback();
    }
  };
  context.globalThis = context;

  vm.createContext(context);
  vm.runInContext(instrumentPopup(popupSource), context, { filename: 'popup.js' });

  const api = context.__popupTest;
  const makeElement = tagName => document.createElement(tagName);
  const elementById = (id, tagName = 'div') => {
    const element = makeElement(tagName);
    element.setAttribute('id', id);
    document.elementsById.set(id, element);
    return element;
  };
  Object.assign(api.els, {
    addCurrentPageBtn: elementById('addCurrentPageBtn', 'button'),
    clearSearchBtn: elementById('clearSearchBtn', 'button'),
    deleteSelectedBtn: elementById('deleteSelectedBtn', 'button'),
    emptyActionBtn: elementById('emptyActionBtn', 'button'),
    emptyCopy: elementById('emptyCopy', 'span'),
    emptyState: elementById('emptyState', 'div'),
    emptyTitle: elementById('emptyTitle', 'strong'),
    entriesList: elementById('entriesList', 'div'),
    searchInput: elementById('searchInput', 'input'),
    statusText: elementById('statusText', 'p'),
    viewModeBtn: elementById('viewModeBtn', 'button')
  });

  return {
    api,
    changeListeners,
    consoleErrors,
    createdTabs,
    document,
    getCalls,
    removedTabs,
    setCalls,
    setGetError(error) {
      getError = error || '';
    },
    storage,
    timers
  };
}

async function dispatchAndWait(element, event) {
  const results = element.dispatchEvent(event);
  await Promise.all(results.filter(result => result && typeof result.then === 'function'));
}

async function flushPromises(count = 6) {
  for (let i = 0; i < count; i += 1) {
    await Promise.resolve();
  }
  await new Promise(resolve => setImmediate(resolve));
}

async function main() {
  {
    const { api, storage } = createHarness();
    const entry = ReadLaterCore.buildEntryFromTab({
      title: 'Extensions',
      url: 'https://example.com/extensions'
    }, 1000);
    api.state.entries = [entry];
    api.state.selectionMode = false;
    api.state.selectedIds.clear();
    api.state.pendingGroupSelectedIds = [entry.id];

    const item = api.renderCreateGroupItem([entry.id]);
    item.querySelector('.create-group-button').click();
    const input = item.querySelector('.create-group-input');
    input.value = 'aaa';

    await dispatchAndWait(input, { type: 'keydown', key: 'Enter' });

    assert.strictEqual(storage[ReadLaterCore.STORAGE_KEY][0].domain, 'aaa');
    assert.deepStrictEqual(Array.from(storage.readLaterCustomGroups), ['aaa']);
  }

  {
    const { api } = createHarness();
    const entry = ReadLaterCore.buildEntryFromTab({
      title: 'Single page group',
      url: 'https://docs.example/solo'
    }, 1000);
    entry.domain = 'Solo Group';
    api.state.entries = [entry];
    api.state.customGroups = ['Solo Group'];
    api.state.viewMode = 'grouped';
    api.render();

    const count = api.els.entriesList.querySelector('.domain-group-count');
    assert.ok(count, 'single-entry custom group should render as a group');
    assert.strictEqual(count.textContent, '1 page', 'single-entry group count should use the singular page label');
  }

  {
    const { api } = createHarness();
    api.state.customGroups = ['Temp'];
    api.state.emptyGroupDeleteArmed.add('Temp');

    await api.removeCustomGroup('Temp');

    assert.strictEqual(api.state.emptyGroupDeleteArmed.has('Temp'), false);

    api.state.emptyGroupDeleteArmed.add('Temp');
    await api.createCustomGroup('Temp');

    assert.strictEqual(api.state.emptyGroupDeleteArmed.has('Temp'), false);
  }

  {
    const { api, storage } = createHarness({
      tab: { title: 'Unsaved Docs', url: 'https://docs.example/unsaved' },
      setError: 'Storage write failed'
    });
    api.init();
    await Promise.resolve();
    await Promise.resolve();

    await api.addCurrentPage();

    assert.deepStrictEqual(api.state.entries, [], 'failed add should roll back in-memory entries');
    assert.strictEqual(storage[ReadLaterCore.STORAGE_KEY], undefined, 'failed add should not persist entries');
    assert.strictEqual(api.state.currentTabEntry, null, 'failed add should not mark the current tab as saved');
  }

  {
    const { api, storage } = createHarness({ setError: 'Storage write failed' });
    const entry = ReadLaterCore.buildEntryFromTab({
      title: 'Keep me visible',
      url: 'https://docs.example/keep'
    }, 1000);
    api.state.entries = [entry];
    api.render();

    await assert.rejects(
      () => api.removeEntry(entry),
      /Storage write failed/
    );

    assert.deepStrictEqual(api.state.entries.map(item => item.id), [entry.id], 'failed remove should keep in-memory entry');
    assert.strictEqual(storage[ReadLaterCore.STORAGE_KEY], undefined, 'failed remove should not persist deletion');
    const card = api.els.entriesList.querySelector(`[data-id="${entry.id}"]`);
    assert.ok(card, 'failed remove should render the original card again');
    assert.strictEqual(card.classList.contains('leaving'), false, 'failed remove should not leave the card in its exit state');
  }

  {
    const { api, storage } = createHarness({ setError: 'Storage write failed' });
    const entry = ReadLaterCore.buildEntryFromTab({
      title: 'Keep selected',
      url: 'https://docs.example/keep-selected'
    }, 1000);
    api.state.entries = [entry];
    api.state.selectionMode = true;
    api.state.selectedIds.add(entry.id);
    api.state.pendingGroupSelectedIds = [entry.id];
    api.render();

    await assert.rejects(
      () => api.removeEntry(entry),
      /Storage write failed/
    );

    assert.deepStrictEqual(api.state.entries.map(item => item.id), [entry.id], 'failed selected-entry remove should keep the entry in memory');
    assert.strictEqual(storage[ReadLaterCore.STORAGE_KEY], undefined, 'failed selected-entry remove should not persist deletion');
    assert.deepStrictEqual(Array.from(api.state.selectedIds), [entry.id], 'failed selected-entry remove should keep selection state');
    assert.deepStrictEqual(api.state.pendingGroupSelectedIds, [entry.id]);
    const card = api.els.entriesList.querySelector(`[data-id="${entry.id}"]`);
    assert.ok(card, 'failed selected-entry remove should render the original card again');
    assert.strictEqual(card.classList.contains('leaving'), false);
  }

  {
    const { api, storage } = createHarness({ setError: 'Storage write failed' });
    const entries = [
      ReadLaterCore.buildEntryFromTab({ title: 'Selected A', url: 'https://docs.example/a' }, 1000),
      ReadLaterCore.buildEntryFromTab({ title: 'Selected B', url: 'https://docs.example/b' }, 1000),
      ReadLaterCore.buildEntryFromTab({ title: 'Unselected C', url: 'https://docs.example/c' }, 1000)
    ];
    api.state.entries = entries;
    api.state.selectionMode = true;
    api.state.selectedIds.add(entries[0].id);
    api.state.selectedIds.add(entries[1].id);
    api.state.pendingGroupSelectedIds = [entries[0].id, entries[1].id];
    api.state.showCreateGroup = true;
    api.render();

    await assert.rejects(
      () => api.deleteSelectedEntries(),
      /Storage write failed/
    );

    assert.deepStrictEqual(api.state.entries.map(entry => entry.id), entries.map(entry => entry.id), 'failed bulk delete should keep entries in memory');
    assert.strictEqual(storage[ReadLaterCore.STORAGE_KEY], undefined, 'failed bulk delete should not persist deletion');
    assert.strictEqual(api.state.selectionMode, true, 'failed bulk delete should keep selection mode active');
    assert.deepStrictEqual(Array.from(api.state.selectedIds), [entries[0].id, entries[1].id]);
    assert.deepStrictEqual(api.state.pendingGroupSelectedIds, [entries[0].id, entries[1].id]);
    assert.strictEqual(api.state.showCreateGroup, true);
    assert.strictEqual(
      Array.from(api.els.entriesList.querySelectorAll('.entry-card')).some(card => card.classList.contains('leaving')),
      false,
      'failed bulk delete should not leave selected cards in their exit state'
    );
  }

  {
    const { api, storage } = createHarness({ setError: 'Storage write failed' });

    await assert.rejects(
      () => api.createCustomGroup('Draft Group'),
      /Storage write failed/
    );

    assert.deepStrictEqual(Array.from(api.state.customGroups), [], 'failed empty group creation should roll back custom groups');
    assert.strictEqual(api.state.expandedDomains.has('Draft Group'), false);
    assert.strictEqual(api.state.emptyGroupDeleteArmed.has('Draft Group'), false);
    assert.strictEqual(storage.readLaterCustomGroups, undefined, 'failed empty group creation should not persist custom groups');
  }

  {
    const { api } = createHarness({ setError: 'Storage write failed' });
    const item = api.renderCreateGroupItem([]);
    item.querySelector('.create-group-button').click();
    const input = item.querySelector('.create-group-input');
    input.value = 'Draft Group';

    await dispatchAndWait(input, { type: 'keydown', key: 'Enter' });

    assert.strictEqual(input.disabled, false, 'failed inline group creation should unlock the input');
    assert.deepStrictEqual(Array.from(api.state.customGroups), []);
  }

  {
    const { api, storage } = createHarness({ setError: 'Storage write failed' });
    const entry = ReadLaterCore.buildEntryFromTab({
      title: 'Move me later',
      url: 'https://docs.example/move'
    }, 1000);
    api.state.entries = [entry];
    api.state.selectionMode = true;
    api.state.selectedIds.add(entry.id);
    api.state.pendingGroupSelectedIds = [entry.id];
    api.state.showCreateGroup = true;
    api.state.emptyGroupDeleteArmed.add('Docs');

    await assert.rejects(
      () => api.commitSelectionToGroup('Docs'),
      /Storage write failed/
    );

    assert.strictEqual(api.state.selectionMode, true, 'failed group move should keep selection mode active');
    assert.deepStrictEqual(Array.from(api.state.selectedIds), [entry.id]);
    assert.deepStrictEqual(api.state.pendingGroupSelectedIds, [entry.id]);
    assert.strictEqual(api.state.showCreateGroup, true);
    assert.strictEqual(api.state.emptyGroupDeleteArmed.has('Docs'), true);
    assert.deepStrictEqual(Array.from(api.state.customGroups), []);
    assert.strictEqual(api.state.entries[0].domain, 'docs.example');
    assert.strictEqual(storage[ReadLaterCore.STORAGE_KEY], undefined, 'failed group move should not persist entries');
  }

  {
    const { api, storage } = createHarness({ setError: 'Storage write failed' });
    const entry = ReadLaterCore.buildEntryFromTab({
      title: 'Dragged page',
      url: 'https://drag.example/page'
    }, 1000);
    api.state.entries = [entry];
    api.state.selectionMode = true;
    api.state.selectedIds.add(entry.id);
    api.state.pendingGroupSelectedIds = [entry.id];
    api.state.showCreateGroup = true;

    const node = api.renderDomainGroup({
      type: 'group',
      domain: 'Docs',
      entries: [ReadLaterCore.buildEntryFromTab({
        title: 'Existing docs page',
        url: 'https://docs.example/existing'
      }, 1000)],
      count: 1
    });
    const header = node.querySelector('.domain-group-header');

    await dispatchAndWait(header, { type: 'drop', target: header });

    assert.strictEqual(api.els.statusText.textContent, 'Storage write failed');
    assert.deepStrictEqual(api.state.entries.map(item => item.domain), ['drag.example']);
    assert.strictEqual(api.state.selectionMode, true, 'failed drop-to-group should keep selection mode active');
    assert.deepStrictEqual(Array.from(api.state.selectedIds), [entry.id]);
    assert.deepStrictEqual(api.state.pendingGroupSelectedIds, [entry.id]);
    assert.strictEqual(api.state.showCreateGroup, true);
    assert.strictEqual(storage[ReadLaterCore.STORAGE_KEY], undefined, 'failed drop-to-group should not persist entries');
  }

  {
    const { api } = createHarness();
    const entry = ReadLaterCore.buildEntryFromTab({
      title: 'Grouped page',
      url: 'https://docs.example/read'
    }, 1000);
    const group = {
      type: 'group',
      domain: 'Docs',
      entries: [entry],
      count: 1
    };
    const node = api.renderDomainGroup(group);
    const header = node.querySelector('.domain-group-header');

    await dispatchAndWait(header, { type: 'click', target: header });

    assert.strictEqual(api.state.expandedDomains.has('Docs'), true);
    assert.strictEqual(header.getAttribute('aria-expanded'), 'true');

    await dispatchAndWait(header, { type: 'click', target: header });

    assert.strictEqual(api.state.expandedDomains.has('Docs'), false);
    assert.strictEqual(header.getAttribute('aria-expanded'), 'false');
  }

  {
    const { api, storage } = createHarness({ setError: 'Storage write failed' });
    const entry = ReadLaterCore.buildEntryFromTab({
      title: 'Grouped page',
      url: 'https://docs.example/read'
    }, 1000);
    const node = api.renderDomainGroup({
      type: 'group',
      domain: 'Docs',
      entries: [entry],
      count: 1
    });
    const header = node.querySelector('.domain-group-header');
    const contentWrap = node.querySelector('.domain-group-content');

    await dispatchAndWait(header, { type: 'click', target: header });
    await flushPromises();

    assert.strictEqual(api.els.statusText.textContent, 'Storage write failed');
    assert.strictEqual(api.state.expandedDomains.has('Docs'), false, 'failed expand persistence should roll back expanded state');
    assert.strictEqual(header.getAttribute('aria-expanded'), 'false', 'failed expand persistence should restore aria state');
    assert.strictEqual(contentWrap.classList.contains('is-expanded'), false, 'failed expand persistence should collapse the panel again');
    assert.strictEqual(storage.readLaterExpandedDomains, undefined, 'failed expand persistence should not write storage');
  }

  {
    const { api, storage } = createHarness({ setError: 'Storage write failed' });
    const entry = ReadLaterCore.buildEntryFromTab({
      title: 'Grouped page',
      url: 'https://docs.example/read'
    }, 1000);
    api.state.expandedDomains.add('Docs');
    const node = api.renderDomainGroup({
      type: 'group',
      domain: 'Docs',
      entries: [entry],
      count: 1
    });
    const header = node.querySelector('.domain-group-header');
    const contentWrap = node.querySelector('.domain-group-content');

    await dispatchAndWait(header, { type: 'click', target: header });
    await flushPromises();

    assert.strictEqual(api.els.statusText.textContent, 'Storage write failed');
    assert.strictEqual(api.state.expandedDomains.has('Docs'), true, 'failed collapse persistence should restore expanded state');
    assert.strictEqual(header.getAttribute('aria-expanded'), 'true', 'failed collapse persistence should restore aria state');
    assert.strictEqual(contentWrap.classList.contains('is-expanded'), true, 'failed collapse persistence should keep the panel open');
    assert.strictEqual(contentWrap.classList.contains('is-collapsing'), false, 'failed collapse persistence should clear the collapsing phase');
    assert.strictEqual(storage.readLaterExpandedDomains, undefined, 'failed collapse persistence should not write storage');
  }

  {
    const { api } = createHarness();
    const entry = ReadLaterCore.buildEntryFromTab({
      title: 'Restored grouped page',
      url: 'https://docs.example/restored'
    }, 1000);
    api.state.expandedDomains.add('Docs');

    const node = api.renderDomainGroup({
      type: 'group',
      domain: 'Docs',
      entries: [entry],
      count: 1
    });
    const contentWrap = node.querySelector('.domain-group-content');

    assert.strictEqual(contentWrap.classList.contains('is-expanded'), true, 'already-expanded groups should not replay the open animation after render');
  }

  {
    const { api } = createHarness();
    api.state.customGroups = ['Empty'];
    const node = api.renderDomainGroup({
      type: 'group',
      domain: 'Empty',
      entries: [],
      count: 0
    });
    const header = node.querySelector('.domain-group-header');
    const chevron = node.querySelector('.domain-group-chevron');

    assert.strictEqual(header.getAttribute('role'), undefined);
    assert.strictEqual(header.tabIndex, undefined);
    assert.strictEqual(header.getAttribute('aria-expanded'), undefined);

    header.click();

    assert.strictEqual(api.state.expandedDomains.has('Empty'), false);
    assert.strictEqual(api.state.emptyGroupDeleteArmed.has('Empty'), false);
    assert.deepStrictEqual(Array.from(api.state.customGroups), ['Empty']);

    await dispatchAndWait(chevron, { type: 'click', target: chevron, bubbles: true });

    assert.strictEqual(api.state.expandedDomains.has('Empty'), false);
    assert.strictEqual(api.state.emptyGroupDeleteArmed.has('Empty'), true);
    assert.deepStrictEqual(Array.from(api.state.customGroups), ['Empty']);

    await dispatchAndWait(chevron, { type: 'click', target: chevron, bubbles: true });

    assert.strictEqual(api.state.expandedDomains.has('Empty'), false);
    assert.strictEqual(api.state.emptyGroupDeleteArmed.has('Empty'), false);
    assert.deepStrictEqual(Array.from(api.state.customGroups), []);
  }

  {
    const { api } = createHarness();
    api.state.customGroups = ['Keyboard Empty'];
    const node = api.renderDomainGroup({
      type: 'group',
      domain: 'Keyboard Empty',
      entries: [],
      count: 0
    });
    const chevron = node.querySelector('.domain-group-chevron');

    assert.strictEqual(chevron.getAttribute('role'), 'button');
    assert.strictEqual(chevron.tabIndex, 0);
    assert.strictEqual(chevron.title, 'Remove empty group Keyboard Empty');
    assert.strictEqual(chevron.getAttribute('aria-label'), 'Remove empty group Keyboard Empty');

    await dispatchAndWait(chevron, { type: 'keydown', key: 'Enter' });

    assert.strictEqual(api.state.emptyGroupDeleteArmed.has('Keyboard Empty'), true);
    assert.deepStrictEqual(Array.from(api.state.customGroups), ['Keyboard Empty']);
    assert.strictEqual(chevron.title, 'Confirm remove empty group Keyboard Empty');
    assert.strictEqual(chevron.getAttribute('aria-label'), 'Confirm remove empty group Keyboard Empty');

    await dispatchAndWait(chevron, { type: 'keydown', key: 'Enter' });
    await Promise.resolve();
    await Promise.resolve();

    assert.strictEqual(api.state.emptyGroupDeleteArmed.has('Keyboard Empty'), false);
    assert.deepStrictEqual(Array.from(api.state.customGroups), []);
  }

  {
    const { api } = createHarness();
    api.state.emptyGroupDeleteArmed.add('Prearmed Empty');
    const node = api.renderDomainGroup({
      type: 'group',
      domain: 'Prearmed Empty',
      entries: [],
      count: 0
    });
    const header = node.querySelector('.domain-group-header');
    const chevron = node.querySelector('.domain-group-chevron');

    assert.strictEqual(header.classList.contains('is-delete-armed'), true);
    assert.strictEqual(chevron.title, 'Confirm remove empty group Prearmed Empty');
    assert.strictEqual(chevron.getAttribute('aria-label'), 'Confirm remove empty group Prearmed Empty');
  }

  {
    const { api } = createHarness({
      createResults: [new Error('Cannot open saved page')]
    });
    const entry = ReadLaterCore.buildEntryFromTab({
      title: 'Open failure',
      url: 'https://docs.example/fail-open'
    }, 1000);
    api.state.entries = [entry];
    api.render();
    const button = api.els.entriesList.querySelector('.entry-open-button');

    await dispatchAndWait(button, { type: 'click', target: button });
    await Promise.resolve();

    assert.strictEqual(api.els.statusText.textContent, 'Cannot open saved page');
  }

  {
    const { api } = createHarness();
    api.state.customGroups = ['Empty'];
    const emptyNode = api.renderDomainGroup({
      type: 'group',
      domain: 'Empty',
      entries: [],
      count: 0
    });
    const entry = ReadLaterCore.buildEntryFromTab({
      title: 'Grouped page',
      url: 'https://docs.example/read'
    }, 1000);
    const docsNode = api.renderDomainGroup({
      type: 'group',
      domain: 'Docs',
      entries: [entry],
      count: 1
    });
    api.els.entriesList.replaceChildren(emptyNode, docsNode);

    const emptyHeader = emptyNode.querySelector('.domain-group-header');
    const emptyChevron = emptyNode.querySelector('.domain-group-chevron');
    const docsHeader = docsNode.querySelector('.domain-group-header');

    emptyChevron.click();

    assert.strictEqual(api.state.emptyGroupDeleteArmed.has('Empty'), true);
    assert.strictEqual(emptyHeader.classList.contains('is-delete-armed'), true);
    assert.strictEqual(emptyChevron.getAttribute('aria-label'), 'Confirm remove empty group Empty');

    docsHeader.click();

    assert.strictEqual(api.state.emptyGroupDeleteArmed.has('Empty'), false);
    assert.strictEqual(emptyHeader.classList.contains('is-delete-armed'), false);
    assert.strictEqual(emptyChevron.title, 'Remove empty group Empty');
    assert.strictEqual(emptyChevron.getAttribute('aria-label'), 'Remove empty group Empty');
  }

  {
    const { api, getCalls } = createHarness();

    api.init();
    await Promise.resolve();
    await Promise.resolve();
    getCalls.length = 0;

    api.state.expandedDomains.add('Docs');
    await api.persistExpandedDomains();
    await Promise.resolve();
    await Promise.resolve();

    assert.strictEqual(getCalls.length, 0, 'popup-originated expanded-state writes should not reload and re-render the same popup');

    api.state.viewMode = 'grouped';
    await api.persistViewMode();
    await Promise.resolve();
    await Promise.resolve();

    assert.strictEqual(getCalls.length, 0, 'popup-originated view-mode writes should not reload and re-render the same popup');
  }

  {
    const { api, changeListeners, setGetError } = createHarness();

    api.init();
    await Promise.resolve();
    await Promise.resolve();
    setGetError('Storage reload failed');

    changeListeners.forEach(listener => listener({
      [ReadLaterCore.STORAGE_KEY]: { oldValue: [], newValue: [] }
    }, 'local'));
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    assert.strictEqual(
      api.els.statusText.textContent,
      'Storage reload failed',
      'external storage reload failures should be visible in the popup'
    );
  }

  {
    const { api, storage } = createHarness();
    storage[ReadLaterCore.STORAGE_KEY] = [
      null,
      { title: 'Blank URL', url: '' },
      { title: 'Malformed URL', url: 'not a url' },
      { title: 'Script URL', url: 'javascript:alert(1)' },
      {
        title: 'Recovered page',
        url: 'https://docs.example/recovered#section',
        favIconUrl: 'data:image/svg+xml,<svg onload="alert(1)"></svg>',
        updatedAt: 1000
      }
    ];

    await api.loadEntries();

    assert.deepStrictEqual(api.state.entries.map(entry => entry.url), ['https://docs.example/recovered']);
    assert.strictEqual(api.state.entries[0].favIconUrl, '');
  }

  {
    const { api, storage } = createHarness();
    storage[ReadLaterCore.STORAGE_KEY] = [
      {
        title: 'Older duplicate',
        url: 'https://docs.example/duplicate#old',
        domain: 'Docs Queue',
        createdAt: 1000,
        updatedAt: 2000
      },
      {
        title: 'Newest duplicate',
        url: 'https://docs.example/duplicate#new',
        createdAt: 3000,
        updatedAt: 5000
      },
      {
        title: 'Other page',
        url: 'https://other.example/read',
        updatedAt: 4000
      }
    ];

    await api.loadEntries();

    assert.deepStrictEqual(api.state.entries.map(entry => entry.url), [
      'https://docs.example/duplicate',
      'https://other.example/read'
    ]);
    assert.strictEqual(api.state.entries[0].title, 'Newest duplicate');
    assert.strictEqual(api.state.entries[0].domain, 'Docs Queue');
    assert.strictEqual(api.state.entries[0].createdAt, 1000);
    assert.strictEqual(api.state.entries[0].updatedAt, 5000);
  }

  {
    const { api } = createHarness({ getError: 'Storage read failed' });
    const existing = ReadLaterCore.buildEntryFromTab({
      title: 'Existing page',
      url: 'https://docs.example/existing'
    }, 1000);
    api.state.entries = [existing];

    await assert.rejects(
      () => api.loadEntries(),
      /Storage read failed/,
      'popup storage reads should surface chrome.runtime.lastError'
    );
    assert.deepStrictEqual(
      api.state.entries.map(entry => entry.url),
      ['https://docs.example/existing'],
      'failed startup reads should not replace the current list with an empty fallback'
    );
  }

  {
    const { api, storage } = createHarness({ queryError: 'Cannot access active tab' });
    storage[ReadLaterCore.STORAGE_KEY] = [
      ReadLaterCore.buildEntryFromTab({
        title: 'Saved without active tab',
        url: 'https://docs.example/saved'
      }, 1000)
    ];

    await api.loadEntries();

    assert.deepStrictEqual(
      api.state.entries.map(entry => entry.url),
      ['https://docs.example/saved'],
      'startup active-tab query failures should not block saved entries from loading'
    );
    assert.strictEqual(api.state.currentTab, null);
    assert.strictEqual(api.state.currentTabEntry, null);
    assert.strictEqual(
      api.els.statusText.textContent,
      'Cannot access active tab',
      'startup active-tab query failures should still surface the Chrome runtime error'
    );
  }

  {
    const { api, storage } = createHarness({
      tab: {
        title: 'Brave Settings',
        url: 'brave://settings/',
        favIconUrl: 'chrome://favicon/size/32/brave://settings'
      }
    });

    await api.loadEntries();
    await api.addCurrentPage();

    assert.strictEqual(storage[ReadLaterCore.STORAGE_KEY].length, 1);
    assert.strictEqual(storage[ReadLaterCore.STORAGE_KEY][0].title, 'Brave Settings');
    assert.strictEqual(storage[ReadLaterCore.STORAGE_KEY][0].url, 'brave://settings');
    assert.strictEqual(storage[ReadLaterCore.STORAGE_KEY][0].domain, 'brave://settings');
  }

  {
    const { api, storage } = createHarness({
      tab: {
        title: 'stats-review.pdf',
        url: 'file:///F:/2.%20ObsidianNotes/SCAU/stats-review.pdf#page=34',
        favIconUrl: 'file:///F:/2.%20ObsidianNotes/SCAU/stats-review.png'
      }
    });

    await api.loadEntries();
    await api.addCurrentPage();

    assert.strictEqual(storage[ReadLaterCore.STORAGE_KEY].length, 1);
    assert.strictEqual(storage[ReadLaterCore.STORAGE_KEY][0].title, 'stats-review.pdf');
    assert.strictEqual(storage[ReadLaterCore.STORAGE_KEY][0].url, 'file:///F:/2.%20ObsidianNotes/SCAU/stats-review.pdf');
    assert.strictEqual(storage[ReadLaterCore.STORAGE_KEY][0].domain, 'Local Files');
    assert.strictEqual(storage[ReadLaterCore.STORAGE_KEY][0].favIconUrl, '');
  }

  {
    const { api, storage } = createHarness({
      tab: {
        title: 'stats-review.md',
        url: 'file:///F:/2.%20ObsidianNotes/SCAU/stats-review.md#chapter-1',
        favIconUrl: 'file:///F:/2.%20ObsidianNotes/SCAU/stats-review.png'
      }
    });

    await api.loadEntries();
    await api.addCurrentPage();

    assert.strictEqual(storage[ReadLaterCore.STORAGE_KEY].length, 1);
    assert.strictEqual(storage[ReadLaterCore.STORAGE_KEY][0].title, 'stats-review.md');
    assert.strictEqual(storage[ReadLaterCore.STORAGE_KEY][0].url, 'file:///F:/2.%20ObsidianNotes/SCAU/stats-review.md');
    assert.strictEqual(storage[ReadLaterCore.STORAGE_KEY][0].domain, 'Local Files');
    assert.strictEqual(storage[ReadLaterCore.STORAGE_KEY][0].favIconUrl, '');
  }

  {
    const { api, storage } = createHarness({
      tab: {
        title: '软件工程概念刷题',
        url: 'file:///F:/SCAU/%E5%88%B7%E9%A2%98%E6%80%BB%E5%85%A5%E5%8F%A3.html#software',
        favIconUrl: 'file:///F:/SCAU/favicon.ico'
      }
    });

    await api.loadEntries();
    await api.addCurrentPage();

    assert.strictEqual(storage[ReadLaterCore.STORAGE_KEY].length, 1);
    assert.strictEqual(storage[ReadLaterCore.STORAGE_KEY][0].title, '软件工程概念刷题');
    assert.strictEqual(storage[ReadLaterCore.STORAGE_KEY][0].url, 'file:///F:/SCAU/%E5%88%B7%E9%A2%98%E6%80%BB%E5%85%A5%E5%8F%A3.html');
    assert.strictEqual(storage[ReadLaterCore.STORAGE_KEY][0].domain, 'Local Files');
    assert.strictEqual(storage[ReadLaterCore.STORAGE_KEY][0].favIconUrl, '');
  }

  {
    const { api } = createHarness({ queryError: 'Cannot access active tab' });

    await api.addCurrentPage();

    assert.strictEqual(
      api.els.statusText.textContent,
      'Cannot access active tab',
      'current tab query failures should surface the Chrome runtime error'
    );
    assert.strictEqual(api.state.currentTab, null);
    assert.strictEqual(api.state.entries.length, 0);
  }

  {
    const { api } = createHarness();
    const tab = {
      title: 'Saved current page',
      url: 'https://example.com/current'
    };
    const entry = ReadLaterCore.buildEntryFromTab(tab, 1000);

    api.state.entries = [entry];
    api.state.currentTab = tab;
    api.render();

    assert.strictEqual(api.els.addCurrentPageBtn.classList.contains('is-saved'), true);
    assert.strictEqual(api.els.addCurrentPageBtn.title, 'Remove current page');
    assert.strictEqual(api.els.addCurrentPageBtn.getAttribute('aria-label'), 'Remove current page from Read It Later');
  }

  {
    const { api, storage } = createHarness();
    const older = ReadLaterCore.buildEntryFromTab({ title: 'Older page', url: 'https://docs.example/older' }, 1000);
    const newer = ReadLaterCore.buildEntryFromTab({ title: 'Newer page', url: 'https://docs.example/newer' }, 2000);
    api.state.entries = [newer, older];
    api.render();

    const olderCard = api.els.entriesList.querySelector(`[data-id="${older.id}"]`);
    const pinButton = olderCard.querySelector('.pin-button');
    assert.ok(pinButton, 'entry cards should expose a pin affordance');
    assert.strictEqual(pinButton.title, 'Pin');
    assert.strictEqual(pinButton.getAttribute('aria-label'), 'Pin Older page');

    await dispatchAndWait(pinButton, { type: 'click', target: pinButton, bubbles: true });

    assert.strictEqual(storage[ReadLaterCore.STORAGE_KEY][0].id, older.id, 'pinned entry should persist at the top');
    assert.strictEqual(storage[ReadLaterCore.STORAGE_KEY][0].pinned, true);
    assert.strictEqual(api.state.entries[0].id, older.id);
    const pinnedButton = api.els.entriesList.querySelector(`[data-id="${older.id}"]`).querySelector('.pin-button');
    assert.strictEqual(pinnedButton.classList.contains('is-pinned'), true);
    assert.strictEqual(pinnedButton.title, 'Unpin');
    assert.strictEqual(pinnedButton.getAttribute('aria-label'), 'Unpin Older page');
  }

  {
    const { api, storage } = createHarness();
    const older = { ...ReadLaterCore.buildEntryFromTab({ title: 'Older pinned', url: 'https://docs.example/older-pinned' }, 1000), pinned: true };
    const newer = ReadLaterCore.buildEntryFromTab({ title: 'Newer page', url: 'https://docs.example/newer-page' }, 2000);
    api.state.entries = ReadLaterCore.sortEntriesForDisplay([older, newer]);
    api.render();

    const pinButton = api.els.entriesList.querySelector(`[data-id="${older.id}"]`).querySelector('.pin-button');
    await dispatchAndWait(pinButton, { type: 'click', target: pinButton, bubbles: true });

    assert.strictEqual(storage[ReadLaterCore.STORAGE_KEY][0].id, newer.id, 'unpinned entry should return to normal timestamp ordering');
    assert.strictEqual(storage[ReadLaterCore.STORAGE_KEY][1].id, older.id);
    assert.strictEqual(storage[ReadLaterCore.STORAGE_KEY][1].pinned, undefined);
    assert.strictEqual(api.state.entries[0].id, newer.id);
  }

  {
    const { api, storage } = createHarness({ setError: 'Storage write failed' });
    const older = ReadLaterCore.buildEntryFromTab({ title: 'Older page', url: 'https://docs.example/fail-pin' }, 1000);
    const newer = ReadLaterCore.buildEntryFromTab({ title: 'Newer page', url: 'https://docs.example/fail-newer' }, 2000);
    api.state.entries = [newer, older];
    api.render();

    const pinButton = api.els.entriesList.querySelector(`[data-id="${older.id}"]`).querySelector('.pin-button');
    await dispatchAndWait(pinButton, { type: 'click', target: pinButton, bubbles: true });

    assert.strictEqual(storage[ReadLaterCore.STORAGE_KEY], undefined);
    assert.deepStrictEqual(api.state.entries.map(entry => entry.id), [newer.id, older.id]);
    assert.strictEqual(api.state.entries.find(entry => entry.id === older.id).pinned, undefined);
    assert.strictEqual(api.els.statusText.textContent, 'Storage write failed');
  }

  {
    const { api, storage } = createHarness();
    const docsEntries = [
      ReadLaterCore.buildEntryFromTab({ title: 'Docs older', url: 'https://docs.example/older' }, 1000),
      ReadLaterCore.buildEntryFromTab({ title: 'Docs newer', url: 'https://docs.example/newer' }, 2000)
    ].map(entry => ({ ...entry, domain: 'Docs' }));
    const newsEntries = [
      ReadLaterCore.buildEntryFromTab({ title: 'News older', url: 'https://news.example/older' }, 3000),
      ReadLaterCore.buildEntryFromTab({ title: 'News newer', url: 'https://news.example/newer' }, 4000)
    ].map(entry => ({ ...entry, domain: 'News' }));
    api.state.entries = [...newsEntries, ...docsEntries];
    api.state.viewMode = 'grouped';
    api.render();

    assert.strictEqual(api.els.entriesList.children[0].dataset.domain, 'News');
    const docsGroup = api.els.entriesList.querySelector(`[data-domain="Docs"]`);
    const pinButton = docsGroup.querySelector('.group-pin-button');
    assert.ok(pinButton, 'group headers should expose a pin affordance');
    assert.strictEqual(pinButton.title, 'Pin group');
    assert.strictEqual(pinButton.getAttribute('aria-label'), 'Pin group Docs');
    assert.ok(pinButton.querySelector('.pin-icon'), 'group pin should use the shared outline pin icon');

    await dispatchAndWait(pinButton, { type: 'click', target: pinButton, bubbles: true });

    assert.deepStrictEqual(Array.from(storage.readLaterPinnedGroups), ['Docs']);
    assert.strictEqual(api.state.pinnedGroups.has('Docs'), true);
    assert.strictEqual(api.els.entriesList.children[0].dataset.domain, 'Docs', 'pinned group should render before newer unpinned groups');
    const pinnedButton = api.els.entriesList.children[0].querySelector('.group-pin-button');
    assert.strictEqual(pinnedButton.classList.contains('is-pinned'), true);
    assert.strictEqual(pinnedButton.title, 'Unpin group');
    assert.strictEqual(pinnedButton.getAttribute('aria-label'), 'Unpin group Docs');
  }

  {
    const { api, storage } = createHarness({ setError: 'Storage write failed' });
    const docsEntries = [
      ReadLaterCore.buildEntryFromTab({ title: 'Docs older', url: 'https://docs.example/older-fail' }, 1000),
      ReadLaterCore.buildEntryFromTab({ title: 'Docs newer', url: 'https://docs.example/newer-fail' }, 2000)
    ].map(entry => ({ ...entry, domain: 'Docs' }));
    api.state.entries = docsEntries;
    api.state.viewMode = 'grouped';
    api.render();

    const pinButton = api.els.entriesList.querySelector('.group-pin-button');
    await dispatchAndWait(pinButton, { type: 'click', target: pinButton, bubbles: true });

    assert.strictEqual(storage.readLaterPinnedGroups, undefined);
    assert.strictEqual(api.state.pinnedGroups.has('Docs'), false);
    assert.strictEqual(api.els.statusText.textContent, 'Storage write failed');
  }

  {
    const { api, storage } = createHarness();
    const entry = ReadLaterCore.buildEntryFromTab({
      title: 'Automatically generated PDF from existing images.',
      url: 'file:///F:/2.%20ObsidianNotes/SCAU/stats-review.pdf'
    }, 1000);
    api.state.entries = [entry];
    api.render();

    const editButton = api.els.entriesList.querySelector('.edit-title-button');
    assert.ok(editButton, 'entry cards should expose a rename affordance');

    editButton.click();
    const input = api.els.entriesList.querySelector('.entry-title-input');
    assert.ok(input, 'clicking rename should render an inline title editor');
    assert.strictEqual(input.value, 'Automatically generated PDF from existing images.');
    input.value = '统计学期末复习 PDF';

    await dispatchAndWait(input, { type: 'keydown', key: 'Enter' });

    assert.strictEqual(storage[ReadLaterCore.STORAGE_KEY][0].title, '统计学期末复习 PDF');
    assert.strictEqual(storage[ReadLaterCore.STORAGE_KEY][0].customTitle, true);
    assert.strictEqual(api.state.entries[0].title, '统计学期末复习 PDF');
    assert.strictEqual(api.els.entriesList.querySelector('.entry-title-input'), null);
  }

  {
    const { api, storage } = createHarness({ setError: 'Storage write failed' });
    const entry = ReadLaterCore.buildEntryFromTab({
      title: 'Original title',
      url: 'https://example.com/original'
    }, 1000);
    api.state.entries = [entry];
    api.render();

    api.els.entriesList.querySelector('.edit-title-button').click();
    const input = api.els.entriesList.querySelector('.entry-title-input');
    input.value = 'Should not persist';

    await dispatchAndWait(input, { type: 'keydown', key: 'Enter' });

    assert.strictEqual(storage[ReadLaterCore.STORAGE_KEY], undefined);
    assert.strictEqual(api.state.entries[0].title, 'Original title');
    assert.strictEqual(api.els.statusText.textContent, 'Storage write failed');
  }

  {
    const { api, timers } = createHarness({ deferAnimationTimers: true });
    const tab = {
      title: 'Fresh current page',
      url: 'https://example.com/fresh-current'
    };
    const entry = ReadLaterCore.buildEntryFromTab(tab, Date.now());

    api.state.entries = [entry];
    api.state.currentTab = tab;
    api.render();

    const card = api.els.entriesList.querySelector(`[data-id="${entry.id}"]`);
    assert.ok(card, 'fresh current page should render before removal');
    assert.ok(/entryIn/.test(card.style.animation), 'fresh current page starts with the entryIn animation');

    const removal = api.addCurrentPage();
    await Promise.resolve();

    assert.strictEqual(card.classList.contains('leaving'), true, 'top-right current-page removal should mark the card as leaving');
    assert.strictEqual(card.style.animation || '', '', 'leaving should clear inline entryIn so CSS entryOut can run');
    assert.ok(timers[0] && timers[0].delay >= 200, 'current-page removal should wait for the full entryOut duration before rendering');

    timers.shift().callback();
    await removal;

    assert.deepStrictEqual(api.state.entries, []);
  }

  {
    const { api } = createHarness();

    api.state.viewMode = 'flat';
    api.render();

    assert.strictEqual(api.els.viewModeBtn.title, 'Show grouped view');
    assert.strictEqual(api.els.viewModeBtn.getAttribute('aria-label'), 'Show grouped view');

    api.state.viewMode = 'grouped';
    api.render();

    assert.strictEqual(api.els.viewModeBtn.title, 'Show flat list');
    assert.strictEqual(api.els.viewModeBtn.getAttribute('aria-label'), 'Show flat list');
  }

  {
    const { api } = createHarness();

    api.state.viewMode = 'flat';
    api.state.selectionMode = true;
    api.state.selectedIds.add('selected-entry');
    api.render();

    assert.strictEqual(api.els.viewModeBtn.disabled, true);
    assert.strictEqual(api.els.viewModeBtn.title, 'Grouped view is locked while organizing');
    assert.strictEqual(api.els.viewModeBtn.getAttribute('aria-label'), 'Grouped view is locked while organizing');
  }

  {
    const { api, createdTabs, storage } = createHarness({
      createResults: [
        { id: 101 },
        new Error('Cannot open second tab'),
        { id: 103 }
      ]
    });
    const entries = [
      ReadLaterCore.buildEntryFromTab({ title: 'Docs A', url: 'https://docs.example/a' }, 1000),
      ReadLaterCore.buildEntryFromTab({ title: 'Docs B', url: 'https://docs.example/b' }, 1000),
      ReadLaterCore.buildEntryFromTab({ title: 'Docs C', url: 'https://docs.example/c' }, 1000)
    ].map(entry => ({ ...entry, domain: 'Docs' }));
    const node = api.renderDomainGroup({
      type: 'group',
      domain: 'Docs',
      entries,
      count: entries.length
    });
    const button = node.querySelector('.domain-group-batch-button');

    await dispatchAndWait(button, { type: 'click', target: button });

    assert.strictEqual(createdTabs.length, 3, 'batch open should keep trying entries after one create failure');
    assert.deepStrictEqual(Array.from(api.state.openedDomainTabs.get('Docs')), [101, 103]);
    assert.deepStrictEqual(JSON.parse(JSON.stringify(storage.openedDomainTabs)), { Docs: [101, 103] });
    assert.strictEqual(button.classList.contains('is-opened'), true);
    assert.strictEqual(button.title, 'Close all 2 tabs');
    assert.strictEqual(api.els.statusText.textContent, 'Opened 2 of 3 pages; 1 failed');
  }

  {
    const { api, createdTabs, storage } = createHarness({
      createResults: [
        { id: 101 },
        {},
        { id: 103 }
      ]
    });
    const entries = [
      ReadLaterCore.buildEntryFromTab({ title: 'Docs A', url: 'https://docs.example/a' }, 1000),
      ReadLaterCore.buildEntryFromTab({ title: 'Docs B', url: 'https://docs.example/b' }, 1000),
      ReadLaterCore.buildEntryFromTab({ title: 'Docs C', url: 'https://docs.example/c' }, 1000)
    ].map(entry => ({ ...entry, domain: 'Docs' }));
    const node = api.renderDomainGroup({
      type: 'group',
      domain: 'Docs',
      entries,
      count: entries.length
    });
    const button = node.querySelector('.domain-group-batch-button');

    await dispatchAndWait(button, { type: 'click', target: button });

    assert.strictEqual(createdTabs.length, 3, 'batch open should still attempt every entry when one tab response has no id');
    assert.deepStrictEqual(Array.from(api.state.openedDomainTabs.get('Docs')), [101, 103]);
    assert.deepStrictEqual(JSON.parse(JSON.stringify(storage.openedDomainTabs)), { Docs: [101, 103] });
    assert.strictEqual(button.title, 'Close all 2 tabs');
    assert.strictEqual(api.els.statusText.textContent, 'Opened 2 of 3 pages; 1 failed');
  }

  {
    const { api, removedTabs, storage } = createHarness({ removeFailures: [202] });
    api.state.openedDomainTabs.set('Docs', [201, 202, 203]);
    const entry = {
      ...ReadLaterCore.buildEntryFromTab({ title: 'Docs A', url: 'https://docs.example/a' }, 1000),
      domain: 'Docs'
    };
    const node = api.renderDomainGroup({
      type: 'group',
      domain: 'Docs',
      entries: [entry],
      count: 1
    });
    const button = node.querySelector('.domain-group-batch-button');

    await dispatchAndWait(button, { type: 'click', target: button });

    assert.deepStrictEqual(removedTabs, [201, 202, 203], 'batch close should attempt every tracked tab');
    assert.deepStrictEqual(Array.from(api.state.openedDomainTabs.get('Docs')), [202]);
    assert.deepStrictEqual(JSON.parse(JSON.stringify(storage.openedDomainTabs)), { Docs: [202] });
    assert.strictEqual(button.classList.contains('is-opened'), true);
    assert.strictEqual(button.title, 'Close all 1 tab');
    assert.strictEqual(api.els.statusText.textContent, 'Closed 2 of 3 tabs; 1 failed');
  }

  {
    const { api, removedTabs, storage } = createHarness({
      removeFailures: [202],
      removeFailureMessages: { 202: 'No tab with id: 202.' }
    });
    api.state.openedDomainTabs.set('Docs', [201, 202, 203]);
    const entry = {
      ...ReadLaterCore.buildEntryFromTab({ title: 'Docs A', url: 'https://docs.example/a' }, 1000),
      domain: 'Docs'
    };
    const node = api.renderDomainGroup({
      type: 'group',
      domain: 'Docs',
      entries: [entry],
      count: 1
    });
    const button = node.querySelector('.domain-group-batch-button');

    await dispatchAndWait(button, { type: 'click', target: button });

    assert.deepStrictEqual(removedTabs, [201, 202, 203], 'batch close should still attempt every tracked tab when one id is stale');
    assert.strictEqual(api.state.openedDomainTabs.has('Docs'), false);
    assert.deepStrictEqual(JSON.parse(JSON.stringify(storage.openedDomainTabs)), {});
    assert.strictEqual(button.classList.contains('is-opened'), false);
    assert.strictEqual(button.title, 'Open all 1 page');
    assert.strictEqual(api.els.statusText.textContent, '');
  }

  {
    const { api } = createHarness();
    const now = Date.now();
    api.state.viewMode = 'flat';
    api.state.entries = [
      ReadLaterCore.buildEntryFromTab({ title: 'Docs A', url: 'https://docs.example/a' }, now),
      ReadLaterCore.buildEntryFromTab({ title: 'Docs B', url: 'https://docs.example/b' }, now)
    ].map(entry => ({ ...entry, domain: 'Docs' }));
    api.state.expandedDomains.add('Docs');
    api.render();

    await api.toggleViewMode();

    assert.ok(
      api.state.isTransitioningMode === false,
      'view-mode transition should release its transition guard'
    );
    assert.ok(
      api.els.entriesList.querySelector('.domain-group'),
      'flat-to-grouped switch should render grouped DOM'
    );
    assert.ok(
      api.els.entriesList.querySelector('.entry-card'),
      'grouped DOM should contain entry cards'
    );
    assert.ok(
      api.els.entriesList.querySelectorAll('.entry-card').every(card => !card.style.animation),
      'mode-switch render should not attach the ordinary fresh-entry inline animation'
    );
    assert.ok(
      api.__renderBodyClasses.some(className => /\bmode-enter-grouped\b/.test(className)),
      'mode-switch render should happen while the mode-enter class is already present'
    );
  }

  {
    const { api, document, setCalls, storage, timers } = createHarness({
      setError: 'Storage write failed',
      deferAnimationTimers: true
    });
    const now = Date.now();
    api.state.viewMode = 'flat';
    api.state.entries = [
      ReadLaterCore.buildEntryFromTab({ title: 'Docs A', url: 'https://docs.example/a' }, now),
      ReadLaterCore.buildEntryFromTab({ title: 'Docs B', url: 'https://docs.example/b' }, now)
    ].map(entry => ({ ...entry, domain: 'Docs' }));
    api.render();

    const transition = api.toggleViewMode();

    assert.strictEqual(api.state.isTransitioningMode, true, 'view-mode transition should start');
    assert.strictEqual(api.state.viewMode, 'flat', 'view mode should not change before the exit phase ends');
    assert.deepStrictEqual(
      JSON.parse(JSON.stringify(setCalls)),
      [{ readLaterViewMode: 'grouped' }],
      'view-mode persistence should start during the exit phase so storage latency is hidden behind motion'
    );
    assert.strictEqual(timers[0].delay, 600, 'mode switch should still use the original exit timing');

    timers.shift().callback();
    await flushPromises();

    assert.strictEqual(
      api.els.statusText.textContent,
      'Storage write failed',
      'failed view-mode persistence should surface the storage error'
    );
    assert.strictEqual(api.state.viewMode, 'flat', 'failed view-mode persistence should roll back to the previous mode');
    assert.strictEqual(document.body.classList.contains('flat-view'), true, 'failed view-mode persistence should restore the previous body class');
    assert.strictEqual(storage.readLaterViewMode, undefined, 'failed view-mode persistence should not write storage');

    assert.strictEqual(timers[0].delay, 700, 'mode switch should still use the original enter timing');
    timers.shift().callback();
    await transition;

    assert.strictEqual(api.state.isTransitioningMode, false, 'failed view-mode transition should release its guard');
    assert.strictEqual(api.els.viewModeBtn.disabled, false, 'failed view-mode transition should re-enable the toggle');
  }

  // In-group entry reorder writes the manual entry order.
  {
    const { api, storage } = createHarness();
    const entries = [
      { ...ReadLaterCore.buildEntryFromTab({ title: 'One', url: 'https://docs.example/1' }, 1000), domain: 'Docs', id: 'one' },
      { ...ReadLaterCore.buildEntryFromTab({ title: 'Two', url: 'https://docs.example/2' }, 2000), domain: 'Docs', id: 'two' },
      { ...ReadLaterCore.buildEntryFromTab({ title: 'Three', url: 'https://docs.example/3' }, 3000), domain: 'Docs', id: 'three' }
    ];
    api.state.entries = entries;
    api.state.viewMode = 'grouped';
    api.state.expandedDomains.add('Docs');
    api.state.selectionMode = true;
    api.state.selectedIds.add('three');
    api.render();

    const cards = api.els.entriesList.querySelectorAll('.entry-card');
    const dragged = Array.from(cards).find(card => card.dataset.id === 'three');
    const target = Array.from(cards).find(card => card.dataset.id === 'one');
    const dataTransfer = { effectAllowed: '', dropEffect: '', setData() {} };
    dragged.dispatchEvent({ type: 'dragstart', target: dragged, dataTransfer });
    await dispatchAndWait(target, { type: 'drop', target, dataTransfer });

    // Display order is updatedAt desc (three, two, one); dropping three after one -> two, one, three.
    assert.deepStrictEqual(Array.from(storage.readLaterEntryOrder), ['two', 'one', 'three'], 'in-group reorder should persist the new entry order');
    assert.deepStrictEqual(Array.from(api.state.entryOrder), ['two', 'one', 'three']);
  }

  // Group-header drag reorders the groups.
  {
    const { api, storage } = createHarness();
    const docs = [
      { ...ReadLaterCore.buildEntryFromTab({ title: 'D1', url: 'https://docs.example/1' }, 1000), domain: 'Docs' },
      { ...ReadLaterCore.buildEntryFromTab({ title: 'D2', url: 'https://docs.example/2' }, 2000), domain: 'Docs' }
    ];
    const news = [
      { ...ReadLaterCore.buildEntryFromTab({ title: 'N1', url: 'https://news.example/1' }, 3000), domain: 'News' },
      { ...ReadLaterCore.buildEntryFromTab({ title: 'N2', url: 'https://news.example/2' }, 4000), domain: 'News' }
    ];
    api.state.entries = [...news, ...docs];
    api.state.viewMode = 'grouped';
    api.state.selectionMode = true;
    api.state.selectedIds.add(docs[0].id);
    api.render();

    const groups = Array.from(api.els.entriesList.querySelectorAll('.domain-group'));
    const docsHeader = groups.find(g => g.dataset.domain === 'Docs').querySelector('.domain-group-header');
    const newsHeader = groups.find(g => g.dataset.domain === 'News').querySelector('.domain-group-header');
    const dataTransfer = { effectAllowed: '', dropEffect: '', setData() {} };
    newsHeader.dispatchEvent({ type: 'dragstart', target: newsHeader, dataTransfer });
    await dispatchAndWait(docsHeader, { type: 'drop', target: docsHeader, dataTransfer });

    // Display order is News, Docs; dropping News after Docs -> Docs, News.
    assert.deepStrictEqual(Array.from(storage.readLaterGroupOrder), ['Docs', 'News'], 'header drag should persist the new group order');
    assert.deepStrictEqual(Array.from(api.state.groupOrder), ['Docs', 'News']);
  }

  // A failed reorder write keeps the manual order unchanged and surfaces the error.
  {
    const { api, storage } = createHarness({ setError: 'Storage write failed' });
    const entries = [
      { ...ReadLaterCore.buildEntryFromTab({ title: 'One', url: 'https://docs.example/1' }, 1000), domain: 'Docs', id: 'one' },
      { ...ReadLaterCore.buildEntryFromTab({ title: 'Two', url: 'https://docs.example/2' }, 2000), domain: 'Docs', id: 'two' }
    ];
    api.state.entries = entries;
    api.state.viewMode = 'grouped';
    api.state.expandedDomains.add('Docs');
    api.state.selectionMode = true;
    api.state.selectedIds.add('two');
    api.render();

    const cards = api.els.entriesList.querySelectorAll('.entry-card');
    const dragged = Array.from(cards).find(card => card.dataset.id === 'two');
    const target = Array.from(cards).find(card => card.dataset.id === 'one');
    const dataTransfer = { effectAllowed: '', dropEffect: '', setData() {} };
    dragged.dispatchEvent({ type: 'dragstart', target: dragged, dataTransfer });
    await dispatchAndWait(target, { type: 'drop', target, dataTransfer });

    assert.strictEqual(storage.readLaterEntryOrder, undefined, 'failed reorder must not persist the order');
    assert.deepStrictEqual(Array.from(api.state.entryOrder), [], 'failed reorder must not mutate the in-memory order');
    assert.strictEqual(api.els.statusText.textContent, 'Storage write failed');
  }

  // Long-pressing a group header enters organize mode that persists without a selected entry.
  {
    const { api } = createHarness();
    const entries = [
      { ...ReadLaterCore.buildEntryFromTab({ title: 'A', url: 'https://docs.example/a' }, 1000), domain: 'Docs' },
      { ...ReadLaterCore.buildEntryFromTab({ title: 'B', url: 'https://docs.example/b' }, 2000), domain: 'Docs' }
    ];
    api.state.entries = entries;
    api.state.viewMode = 'grouped';
    api.render();
    const header = api.els.entriesList.querySelector('.domain-group-header');
    header.dispatchEvent({ type: 'mousedown', target: header, bubbles: true });
    assert.strictEqual(api.state.selectionMode, true, 'long-pressing a group header enters organize mode');
    assert.strictEqual(api.state.groupOrganize, true, 'header long-press keeps organize mode open with no selected entry');
    assert.strictEqual(api.els.searchInput.value, 'Reorder groups', 'group-organize mode shows a reorder label');
    assert.strictEqual(api.els.clearSearchBtn.classList.contains('hidden'), false, 'group-organize mode keeps a visible exit button');
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
