const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const backgroundSource = fs.readFileSync(path.join(root, 'background.js'), 'utf8');
const ReadLaterCore = require('../read-later-core');

function createHarness({ tab, storage = {}, getError = '', setError = '' }) {
  const env = {
    clearedNotifications: [],
    errors: [],
    getKeys: [],
    notifications: [],
    setCalls: [],
    storage: { ...storage },
    timers: []
  };
  let commandListener = null;

  const context = {
    chrome: {
      commands: {
        onCommand: {
          addListener(listener) {
            commandListener = listener;
          }
        }
      },
      notifications: {
        create(id, options) {
          env.notifications.push({ id, options });
        },
        clear(id) {
          env.clearedNotifications.push(id);
        }
      },
      storage: {
        local: {
          async get(keys) {
            env.getKeys.push(keys);
            if (getError) {
              throw new Error(getError);
            }
            return env.storage;
          },
          async set(values) {
            env.setCalls.push(values);
            if (setError) {
              throw new Error(setError);
            }
            Object.assign(env.storage, values);
          }
        }
      },
      tabs: {
        async query() {
          return tab ? [tab] : [];
        }
      }
    },
    console: {
      error(...args) {
        env.errors.push(args);
      }
    },
    importScripts() {
      context.ReadLaterCore = ReadLaterCore;
    },
    Math,
    setTimeout(callback) {
      env.timers.push(callback);
    }
  };
  context.globalThis = context;

  vm.createContext(context);
  vm.runInContext(backgroundSource, context, { filename: 'background.js' });
  assert.strictEqual(typeof commandListener, 'function', 'background command listener should be registered');

  return {
    env,
    async quickSave() {
      await commandListener('quick-save');
    }
  };
}

const storageKey = ReadLaterCore.STORAGE_KEY;
const oldEntry = ReadLaterCore.buildEntryFromTab({
  title: 'Saved Article',
  url: 'https://example.com/read'
}, 1000);

async function main() {
  {
    const harness = createHarness({
      tab: { title: 'Saved Article Updated', url: 'https://example.com/read#section' },
      storage: { [storageKey]: [oldEntry] }
    });

    await harness.quickSave();

    assert.deepStrictEqual(harness.env.storage[storageKey], []);
    assert.strictEqual(harness.env.notifications[0].options.title, 'Removed from Read It Later');
    harness.env.timers[0]();
    assert.strictEqual(harness.env.clearedNotifications[0], harness.env.notifications[0].id);
  }

  {
    const harness = createHarness({
      tab: { title: 'Fresh Article', url: 'https://fresh.example/post#intro' },
      storage: { [storageKey]: { corrupted: true } }
    });

    await harness.quickSave();

    assert.strictEqual(harness.env.storage[storageKey].length, 1);
    assert.strictEqual(harness.env.storage[storageKey][0].url, 'https://fresh.example/post');
    assert.strictEqual(harness.env.notifications[0].options.title, 'Saved to Read It Later');
  }

  {
    const harness = createHarness({
      tab: { title: 'Fresh Article', url: 'https://fresh.example/post#intro' },
      storage: {
        [storageKey]: [
          null,
          { title: 'Blank URL', url: '' },
          { title: 'Malformed URL', url: 'not a url' },
          { title: 'Script URL', url: 'javascript:alert(1)' },
          oldEntry
        ]
      }
    });

    await harness.quickSave();

    assert.deepStrictEqual(
      harness.env.storage[storageKey].map(entry => entry.url),
      ['https://fresh.example/post', 'https://example.com/read']
    );
  }

  {
    const harness = createHarness({
      tab: { title: 'Extensions', url: 'chrome://extensions' },
      storage: { [storageKey]: [oldEntry] }
    });

    await harness.quickSave();

    assert.strictEqual(harness.env.storage[storageKey].length, 2);
    assert.strictEqual(harness.env.storage[storageKey][0].url, 'chrome://extensions');
    assert.strictEqual(harness.env.storage[storageKey][0].domain, 'chrome://extensions');
    assert.strictEqual(harness.env.notifications[0].options.title, 'Saved to Read It Later');
  }

  {
    const harness = createHarness({
      tab: { title: 'Extension popup', url: 'chrome-extension://abc/popup.html' },
      storage: { [storageKey]: [oldEntry] }
    });

    await harness.quickSave();

    assert.deepStrictEqual(harness.env.setCalls, []);
    assert.strictEqual(harness.env.notifications[0].options.title, 'Cannot save this page');
  }

  {
    const harness = createHarness({
      tab: { title: 'Fresh Article', url: 'https://fresh.example/post' },
      storage: { [storageKey]: [oldEntry] },
      getError: 'Storage read failed'
    });

    await harness.quickSave();

    assert.deepStrictEqual(harness.env.setCalls, []);
    assert.strictEqual(harness.env.notifications[0].options.title, 'Could not save page');
    assert.strictEqual(harness.env.notifications[0].options.message, 'Storage read failed');
    assert.strictEqual(harness.env.errors.length, 1);
  }

  {
    const harness = createHarness({
      tab: { title: 'Fresh Article', url: 'https://fresh.example/post' },
      storage: { [storageKey]: [oldEntry] },
      setError: 'Storage write failed'
    });

    await harness.quickSave();

    assert.strictEqual(harness.env.storage[storageKey].length, 1);
    assert.strictEqual(harness.env.notifications[0].options.title, 'Could not save page');
    assert.strictEqual(harness.env.notifications[0].options.message, 'Storage write failed');
    assert.strictEqual(harness.env.errors.length, 1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
