import { spawn } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, '..');
const outputDir = path.join(projectRoot, 'docs', 'screenshots');
const popupUrl = pathToFileURL(path.join(projectRoot, 'popup.html')).href;
const iconData = `data:image/svg+xml;base64,${readFileSync(path.join(projectRoot, 'icons', 'icon.svg')).toString('base64')}`;

const demoEntries = [
  {
    id: 'linux-techspar',
    title: '【开源】TechSpar：把专项训练、简历面...',
    url: 'https://linux.do/t/topic/123',
    domain: 'linux.do',
    favIconUrl: '',
    createdAt: 1780732800000,
    updatedAt: 1780732800000
  },
  {
    id: 'bilibili-stats',
    title: '【期末冲刺上大分】《统计学》2小时快速...',
    url: 'https://www.bilibili.com/video/BV1stats',
    domain: 'www.bilibili.com',
    favIconUrl: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI2NCIgaGVpZ2h0PSI2NCIgdmlld0JveD0iMCAwIDY0IDY0Ij48cmVjdCB4PSI4IiB5PSIxMCIgd2lkdGg9IjQ4IiBoZWlnaHQ9IjQ0IiByeD0iOCIgZmlsbD0iI2Y4ZmRmZiIgc3Ryb2tlPSIjMDBhZWRmIiBzdHJva2Utd2lkdGg9IjQiLz48cmVjdCB4PSIyMiIgeT0iMjgiIHdpZHRoPSI4IiBoZWlnaHQ9IjEyIiByeD0iMiIgZmlsbD0iIzAwYWVkZiIvPjxyZWN0IHg9IjM0IiB5PSIyOCIgd2lkdGg9IjgiIGhlaWdodD0iMTIiIHJ4PSIyIiBmaWxsPSIjMDBhZWRmIi8+PHBhdGggZD0iTTIyIDEwIDE2IDIgTTEyIDggMjIgMTgiIHN0cm9rZT0iIzAwYWVkZiIgc3Ryb2tlLXdpZHRoPSI0IiBzdHJva2UtbGluZWNhcD0icm91bmQiLz48cGF0aCBkPSJNNDIgMTAgNDggMiBNNTIgOCA0MiAxOCIgc3Ryb2tlPSIjMDBhZWRmIiBzdHJva2Utd2lkdGg9IjQiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIvPjwvc3ZnPg==',
    createdAt: 1780731800000,
    updatedAt: 1780731800000
  },
  {
    id: 'linux-love',
    title: '和喜欢的男孩子在一起了！ - 搞七捻三 / ...',
    url: 'https://linux.do/t/topic/456',
    domain: 'linux.do',
    favIconUrl: '',
    createdAt: 1780730800000,
    updatedAt: 1780730800000
  },
  {
    id: 'linux-douyin',
    title: '开源！抖音自动续火花 - 开发调优 / 开发...',
    url: 'https://linux.do/t/topic/789',
    domain: 'linux.do',
    favIconUrl: '',
    createdAt: 1780729800000,
    updatedAt: 1780729800000
  },
  {
    id: 'youtube-oracle',
    title: '💯 Oracle Cloud Always Free 永久免费V...',
    url: 'https://www.youtube.com/watch?v=oracle',
    domain: 'www.youtube.com',
    favIconUrl: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI2NCIgaGVpZ2h0PSI2NCIgdmlld0JveD0iMCAwIDY0IDY0Ij48cmVjdCB4PSI4IiB5PSIxNCIgd2lkdGg9IjQ4IiBoZWlnaHQ9IjM2IiByeD0iOSIgZmlsbD0iI2ZmMDAzMyIvPjxwYXRoIGQ9Ik0yOCAyM3YxOGwxNi05eiIgZmlsbD0iI2ZmZiIvPjwvc3ZnPg==',
    createdAt: 1780728800000,
    updatedAt: 1780728800000
  },
  {
    id: 'linux-gpt',
    title: 'gpt plus 薅多了用不完，来薅，可以用 g...',
    url: 'https://linux.do/t/topic/101',
    domain: 'linux.do',
    favIconUrl: '',
    createdAt: 1780727800000,
    updatedAt: 1780727800000
  }
];

function findChrome() {
  const candidates = [
    process.env.CHROME_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
  ].filter(Boolean);
  const found = candidates.find(candidate => existsSync(candidate));
  if (!found) {
    throw new Error('Chrome/Edge executable not found. Set CHROME_PATH if it is installed elsewhere.');
  }
  return found;
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitForChrome(port) {
  const endpoint = `http://127.0.0.1:${port}/json/version`;
  const started = Date.now();
  while (Date.now() - started < 10000) {
    try {
      const res = await fetch(endpoint);
      if (res.ok) return await res.json();
    } catch {
      // Chrome is still starting.
    }
    await delay(100);
  }
  throw new Error('Timed out waiting for Chrome remote debugging endpoint.');
}

class CdpClient {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.id = 0;
    this.pending = new Map();
    this.events = new Map();
    this.ready = new Promise((resolve, reject) => {
      this.ws.addEventListener('open', resolve, { once: true });
      this.ws.addEventListener('error', reject, { once: true });
    });
    this.ws.addEventListener('message', event => {
      const msg = JSON.parse(event.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(msg.error.message || JSON.stringify(msg.error)));
        else resolve(msg.result || {});
        return;
      }
      if (msg.method && this.events.has(msg.method)) {
        for (const resolve of this.events.get(msg.method)) resolve(msg.params || {});
        this.events.delete(msg.method);
      }
    });
  }

  static async connect(wsUrl) {
    const client = new CdpClient(wsUrl);
    await client.ready;
    return client;
  }

  send(method, params = {}) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
    });
  }

  waitFor(method) {
    return new Promise(resolve => {
      const list = this.events.get(method) || [];
      list.push(resolve);
      this.events.set(method, list);
    });
  }

  close() {
    this.ws.close();
  }
}

async function openPage(port) {
  const res = await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' });
  if (!res.ok) throw new Error(`Could not open a new Chrome target: ${res.status}`);
  const target = await res.json();
  return CdpClient.connect(target.webSocketDebuggerUrl);
}

async function navigate(client, url) {
  await client.send('Page.enable');
  const loaded = client.waitFor('Page.loadEventFired');
  await client.send('Page.navigate', { url });
  await loaded;
}

async function evaluate(client, expression) {
  return client.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true
  });
}

function chromeMockScript() {
  return `
    (() => {
      const storage = { readLaterItems: ${JSON.stringify(demoEntries)} };
      const listeners = [];
      function pick(keys) {
        if (typeof keys === 'object' && !Array.isArray(keys)) return { ...keys, ...storage };
        if (typeof keys === 'string') return { [keys]: storage[keys] };
        return { ...storage };
      }
      globalThis.chrome = {
        storage: {
          local: {
            get(keys, cb) { setTimeout(() => cb(pick(keys)), 0); },
            set(values, cb) {
              Object.assign(storage, values || {});
              setTimeout(() => {
                listeners.forEach(fn => fn(values, 'local'));
                if (cb) cb();
              }, 0);
            }
          },
          onChanged: { addListener(fn) { listeners.push(fn); } }
        },
        runtime: { lastError: null },
        tabs: {
          query(_query, cb) {
            cb([{ title: 'A current page worth saving', url: 'https://example.com/current', favIconUrl: '' }]);
          },
          create() {}
        }
      };
    })();
  `;
}

async function capturePopup(port, outPath) {
  const client = await openPage(port);
  await client.send('Emulation.setDeviceMetricsOverride', {
    width: 430,
    height: 640,
    deviceScaleFactor: 2,
    mobile: false
  });
  await client.send('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-color-scheme', value: 'light' }]
  });
  await client.send('Page.addScriptToEvaluateOnNewDocument', { source: chromeMockScript() });
  await navigate(client, popupUrl);
  await evaluate(client, `new Promise(resolve => setTimeout(resolve, 260))`);
  const shot = await client.send('Page.captureScreenshot', { format: 'png', fromSurface: true });
  writeFileSync(outPath, Buffer.from(shot.data, 'base64'));
  client.close();
}

function browserFrameHtml() {
  const popupImage = `data:image/png;base64,${readFileSync(path.join(outputDir, 'popup-with-entries.png')).toString('base64')}`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<style>
* { box-sizing: border-box; }
body {
  margin: 0;
  width: 1120px;
  height: 760px;
  overflow: hidden;
  background: #eef0f2;
  color: #25282c;
  font-family: "Segoe UI", "Microsoft YaHei", Arial, sans-serif;
}
.stage { width: 1120px; height: 760px; padding: 34px; }
.browser {
  height: 692px;
  border: 1px solid #d4d7da;
  border-radius: 8px;
  background: #fbfbfc;
  overflow: hidden;
  box-shadow: 0 24px 70px rgba(28, 34, 40, 0.18);
}
.topbar {
  height: 72px;
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 0 22px;
  border-bottom: 1px solid #dfe2e5;
  background: #f5f6f7;
}
.traffic { display: flex; gap: 8px; }
.traffic i { width: 12px; height: 12px; border-radius: 50%; display: block; }
.traffic i:nth-child(1) { background: #e86d5b; }
.traffic i:nth-child(2) { background: #e4b953; }
.traffic i:nth-child(3) { background: #65b37a; }
.tab {
  height: 40px;
  min-width: 230px;
  padding: 0 16px;
  border: 1px solid #d9dde1;
  border-radius: 8px 8px 4px 4px;
  background: #ffffff;
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 14px;
  font-weight: 700;
}
.tab img, .ext-icon { width: 22px; height: 22px; }
.address {
  flex: 1 1 auto;
  height: 40px;
  padding: 0 18px;
  border: 1px solid #d9dde1;
  border-radius: 8px;
  background: #ffffff;
  display: flex;
  align-items: center;
  color: #777c82;
  font-size: 14px;
}
.extensions { display: flex; align-items: center; gap: 12px; color: #71767d; }
.ext-icon {
  width: 34px;
  height: 34px;
  padding: 5px;
  border: 1px solid #222;
  background: #62b5ee;
  box-shadow: 0 5px 16px rgba(28, 34, 40, 0.16);
}
.content {
  position: relative;
  height: 620px;
  padding: 58px 56px;
  background: #fbfbfc;
}
.copy {
  width: 430px;
}
.eyebrow {
  display: inline-flex;
  height: 26px;
  align-items: center;
  padding: 0 10px;
  border: 1px solid #d7dadd;
  border-radius: 999px;
  background: #ffffff;
  color: #5d646b;
  font-size: 12px;
  font-weight: 800;
  text-transform: uppercase;
}
h1 {
  margin: 22px 0 16px;
  color: #33373d;
  font-size: 52px;
  line-height: 1;
  letter-spacing: 0;
}
p {
  margin: 0;
  color: #5d646b;
  font-size: 18px;
  line-height: 1.62;
}
.chips { display: flex; gap: 10px; margin-top: 26px; }
.chips span {
  padding: 8px 12px;
  border-radius: 999px;
  background: #2b3036;
  color: #fff;
  font-size: 13px;
  font-weight: 800;
}
.chips span:nth-child(2) { background: #426f58; }
.chips span:nth-child(3) { background: #9d6035; }
.popup {
  position: absolute;
  top: 20px;
  right: 72px;
  width: 430px;
  height: 640px;
  overflow: hidden;
  background: #ffffff;
  box-shadow: 0 26px 80px rgba(28, 34, 40, 0.28);
}
.popup img { width: 430px; height: 640px; display: block; }
</style>
</head>
<body>
  <div class="stage">
    <div class="browser">
      <div class="topbar">
        <div class="traffic"><i></i><i></i><i></i></div>
        <div class="tab"><img src="${iconData}" alt="">Read It Later</div>
        <div class="address">chrome-extension://read-it-later/popup.html</div>
        <div class="extensions"><span>⋮</span><img class="ext-icon" src="${iconData}" alt=""></div>
      </div>
      <div class="content">
        <div class="copy">
          <div class="eyebrow">Chrome Popup</div>
          <h1>Save the page. Keep reading later.</h1>
          <p>A compact local list for pages you do not want to lose in the middle of browsing.</p>
          <div class="chips"><span>Local storage</span><span>Current tab</span><span>Search + delete</span></div>
        </div>
        <div class="popup"><img src="${popupImage}" alt="Read It Later popup"></div>
      </div>
    </div>
  </div>
</body>
</html>`;
}

async function captureHtml(port, html, outPath) {
  const client = await openPage(port);
  await client.send('Emulation.setDeviceMetricsOverride', {
    width: 1120,
    height: 760,
    deviceScaleFactor: 1,
    mobile: false
  });
  const dataUrl = `data:text/html;base64,${Buffer.from(html, 'utf8').toString('base64')}`;
  await navigate(client, dataUrl);
  await evaluate(client, `document.fonts ? document.fonts.ready : Promise.resolve()`);
  await delay(120);
  const shot = await client.send('Page.captureScreenshot', { format: 'png', fromSurface: true });
  writeFileSync(outPath, Buffer.from(shot.data, 'base64'));
  client.close();
}

async function main() {
  mkdirSync(outputDir, { recursive: true });
  const chromePath = findChrome();
  const port = 9800 + Math.floor(Math.random() * 500);
  const userDataDir = path.join(tmpdir(), `read-it-later-shots-${process.pid}`);
  rmSync(userDataDir, { recursive: true, force: true });
  mkdirSync(userDataDir, { recursive: true });

  const chrome = spawn(chromePath, [
    '--headless=new',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${userDataDir}`,
    '--disable-gpu',
    '--disable-background-networking',
    '--disable-default-apps',
    '--disable-extensions',
    '--disable-sync',
    '--hide-scrollbars',
    '--no-first-run',
    '--no-default-browser-check',
    'about:blank'
  ], {
    stdio: ['ignore', 'ignore', 'pipe'],
    windowsHide: true
  });

  chrome.stderr.on('data', () => {});

  try {
    await waitForChrome(port);
    await capturePopup(port, path.join(outputDir, 'popup-with-entries.png'));
  } finally {
    chrome.kill();
    await delay(200);
    rmSync(userDataDir, { recursive: true, force: true });
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
