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
      '  init,',
      '  persistExpandedDomains,',
      '  persistViewMode,',
      '};',
      "document.addEventListener('DOMContentLoaded', init);",
      '})();'
    ].join('\n')
  );
}

function createHarness() {
  const document = new TestDocument();
  const storage = {};
  const getCalls = [];
  const setCalls = [];
  const changeListeners = [];
  const context = {
    ReadLaterCore,
    chrome: {
      runtime: {},
      storage: {
        local: {
          get(keys, callback) {
            getCalls.push(keys);
            const result = {};
            Object.entries(keys || {}).forEach(([key, fallback]) => {
              result[key] = Object.prototype.hasOwnProperty.call(storage, key) ? storage[key] : fallback;
            });
            callback(result);
          },
          set(values, callback) {
            setCalls.push(values);
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
          callback([]);
        },
        create() {},
        remove() {}
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
    clearTimeout() {},
    console,
    document,
    requestAnimationFrame(callback) {
      callback();
    },
    setTimeout(callback) {
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

  return { api, changeListeners, document, getCalls, setCalls, storage };
}

async function dispatchAndWait(element, event) {
  const results = element.dispatchEvent(event);
  await Promise.all(results.filter(result => result && typeof result.then === 'function'));
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
    api.state.customGroups = ['Temp'];
    api.state.emptyGroupDeleteArmed.add('Temp');

    await api.removeCustomGroup('Temp');

    assert.strictEqual(api.state.emptyGroupDeleteArmed.has('Temp'), false);

    api.state.emptyGroupDeleteArmed.add('Temp');
    await api.createCustomGroup('Temp');

    assert.strictEqual(api.state.emptyGroupDeleteArmed.has('Temp'), false);
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

    header.click();

    assert.strictEqual(api.state.expandedDomains.has('Docs'), true);
    assert.strictEqual(header.getAttribute('aria-expanded'), 'true');

    header.click();

    assert.strictEqual(api.state.expandedDomains.has('Docs'), false);
    assert.strictEqual(header.getAttribute('aria-expanded'), 'false');
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

    chevron.click();

    assert.strictEqual(api.state.expandedDomains.has('Empty'), false);
    assert.strictEqual(api.state.emptyGroupDeleteArmed.has('Empty'), true);
    assert.deepStrictEqual(Array.from(api.state.customGroups), ['Empty']);

    chevron.click();
    await Promise.resolve();
    await Promise.resolve();

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
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
