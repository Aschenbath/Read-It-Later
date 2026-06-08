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
  }

  createElement(tagName) {
    return new TestElement(tagName, this);
  }

  getElementById() {
    return null;
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
      '  render',
      '};',
      "document.addEventListener('DOMContentLoaded', init);",
      '})();'
    ].join('\n')
  );
}

function createHarness() {
  const document = new TestDocument();
  const storage = {};
  const setCalls = [];
  const context = {
    ReadLaterCore,
    chrome: {
      runtime: {},
      storage: {
        local: {
          get(keys, callback) {
            const result = {};
            Object.entries(keys || {}).forEach(([key, fallback]) => {
              result[key] = Object.prototype.hasOwnProperty.call(storage, key) ? storage[key] : fallback;
            });
            callback(result);
          },
          set(values, callback) {
            setCalls.push(values);
            Object.assign(storage, values);
            callback();
          }
        },
        onChanged: {
          addListener() {}
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
  Object.assign(api.els, {
    addCurrentPageBtn: makeElement('button'),
    clearSearchBtn: makeElement('button'),
    deleteSelectedBtn: makeElement('button'),
    emptyActionBtn: makeElement('button'),
    emptyCopy: makeElement('span'),
    emptyState: makeElement('div'),
    emptyTitle: makeElement('strong'),
    entriesList: makeElement('div'),
    searchInput: makeElement('input'),
    statusText: makeElement('p'),
    viewModeBtn: makeElement('button')
  });

  return { api, document, setCalls, storage };
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
    api.state.selectionMode = true;

    header.click();

    assert.strictEqual(api.state.expandedDomains.has('Docs'), true);
    assert.strictEqual(header.getAttribute('aria-expanded'), 'true');

    header.click();

    assert.strictEqual(api.state.expandedDomains.has('Docs'), false);
    assert.strictEqual(header.getAttribute('aria-expanded'), 'false');
  }

  {
    const { api } = createHarness();
    const docsEntry = ReadLaterCore.buildEntryFromTab({
      title: 'Docs page',
      url: 'https://docs.example/read'
    }, 1000);
    const docsSecondEntry = ReadLaterCore.buildEntryFromTab({
      title: 'Docs second page',
      url: 'https://docs.example/second'
    }, 950);
    const blogEntry = ReadLaterCore.buildEntryFromTab({
      title: 'Blog page',
      url: 'https://blog.example/read'
    }, 900);
    const blogSecondEntry = ReadLaterCore.buildEntryFromTab({
      title: 'Blog second page',
      url: 'https://blog.example/second'
    }, 850);
    api.state.entries = [docsEntry, docsSecondEntry, blogEntry, blogSecondEntry];
    api.state.viewMode = 'grouped';
    api.render();

    const docsGroup = api.els.entriesList.children[0];
    const docsHeader = docsGroup.querySelector('.domain-group-header');
    const docsContent = docsGroup.querySelector('.domain-group-content');

    assert.strictEqual(docsHeader.getAttribute('aria-expanded'), 'false');
    assert.strictEqual(docsContent.style.display, 'none');

    docsHeader.click();

    assert.strictEqual(api.state.expandedDomains.has('docs.example'), true);
    assert.strictEqual(docsHeader.getAttribute('aria-expanded'), 'true');
    assert.strictEqual(docsContent.style.display, 'block');
    assert.strictEqual(api.els.entriesList.querySelectorAll('.domain-group').length, 2);
    assert.strictEqual(docsGroup.querySelectorAll('.entry-card').length, 2);

    docsHeader.click();

    assert.strictEqual(api.state.expandedDomains.has('docs.example'), false);
    assert.strictEqual(docsHeader.getAttribute('aria-expanded'), 'false');
  }

  {
    const { api } = createHarness();
    const entry = ReadLaterCore.buildEntryFromTab({
      title: 'Fresh grouped page',
      url: 'https://fresh.example/read'
    }, Date.now());
    const node = api.renderDomainGroup({
      type: 'group',
      domain: 'Fresh',
      entries: [entry],
      count: 1
    });
    const card = node.querySelector('.entry-card');

    assert.strictEqual(card.style.animation, 'none');
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
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
