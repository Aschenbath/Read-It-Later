const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const backgroundSource = fs.readFileSync(path.join(root, 'background.js'), 'utf8');
const ReadLaterCore = require('../read-later-core');

function createHarness({ tab, storage = {} }) {
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
            return env.storage;
          },
          async set(values) {
            env.setCalls.push(values);
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
      tab: { title: 'Extensions', url: 'chrome://extensions' },
      storage: { [storageKey]: [oldEntry] }
    });

    await harness.quickSave();

    assert.deepStrictEqual(harness.env.setCalls, []);
    assert.strictEqual(harness.env.notifications[0].options.title, 'Cannot save this page');
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
