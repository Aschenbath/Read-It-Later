<div align="center">

# 🔖 Read It Later

**Minimal browser extension for saving pages to read later**

Local-first • Privacy-focused • Zero dependencies

[English](#english) | [中文](#中文)

</div>

<p align="center">
  <img alt="Manifest V3" src="https://img.shields.io/badge/Manifest-V3-1f6feb?style=for-the-badge">
  <img alt="Local First" src="https://img.shields.io/badge/Local--First-yes-2ea043?style=for-the-badge">
  <img alt="No Dependencies" src="https://img.shields.io/badge/Dependencies-None-f97316?style=for-the-badge">
  <img alt="No Build" src="https://img.shields.io/badge/Build-none-6f42c1?style=for-the-badge">
</p>

---

## English

### What It Is

Read It Later is a **privacy-first reading list manager** that lives in your browser toolbar. Save pages with one click or a keyboard shortcut, search through your list, and never lose track of what you wanted to read.

- **No cloud sync** — All data stays on your device
- **No accounts** — No sign-up, no tracking, no analytics
- **No bloat** — Pure vanilla JavaScript, zero dependencies
- **Instant response** — Local storage means no loading delays

### ✨ Core Features

🚀 **Lightning-Fast Saving**
- Press `Alt+1` to save instantly without opening the popup (fastest!)
- Or click the extension icon → Click the `+` button
- **Toggle behavior**: Already saved? Click again to remove it

⌨️ **Keyboard-First Workflow**
- `Alt+1` — Quick save/remove current page (no popup needed)
- `Alt+Shift+R` — Open Read It Later popup
- Customize shortcuts in `chrome://extensions/shortcuts`

🔍 **Smart Search & Organization**
- Real-time filtering by title or URL
- **Intelligent deduplication**: URLs are normalized (removes hash fragments, trailing slashes)
- Domain extraction with fallback icons
- Newest-first ordering with timestamps

🔐 **100% Private**
- All data stored locally using `chrome.storage.local`
- Zero network requests, no tracking, no analytics
- Your reading list never leaves your machine

🎨 **Golden Ratio Design**
- 1:1.618 proportions (380×615 popup) for visual harmony
- Playfair Display serif typography for elegant readability
- Hidden scrollbars with smooth scrolling preserved
- Minimalist interface with clean lines

🔔 **Desktop Notifications**
- Instant visual confirmation when you save or remove a page
- Auto-dismiss after 2 seconds
- Non-intrusive silent notifications

---

### 📸 Screenshots

#### Popup with saved entries

<p align="center">
  <img src="docs/screenshots/popup-with-entries.png" width="400" alt="Read It Later popup showing saved pages">
</p>

Clean list view with search bar, domain icons, and one-click access to saved pages.


---

### 📦 Installation

1. **Clone or download** this repository:
   ```bash
   git clone https://github.com/Aschenbath/Read-It-Later.git
   ```

2. **Open Chrome** and navigate to `chrome://extensions/`

3. **Enable Developer Mode** (toggle in top-right corner)

4. **Click "Load unpacked"** and select the extension folder

5. **Done!** The bookmark icon appears in your toolbar

---

### 🚀 Usage Guide

#### Save a Page

**Method 1: Keyboard shortcut (fastest)**
1. Navigate to any webpage
2. Press `Alt+1`
3. Done! Desktop notification confirms the save

**Method 2: Click the icon**
1. Click the extension icon in your toolbar
2. Click the `+` button in the popup
3. Done!

#### Remove a Page

**Method 1: Keyboard shortcut**
1. Navigate to a saved page
2. Press `Alt+1` again — it toggles off
3. Desktop notification confirms removal

**Method 2: From the list**
1. Open the extension popup
2. Click the trash icon on the right of any entry

#### Open a Saved Page

1. Click the extension icon to see your list
2. Click any entry to open it in the current tab

#### Search Your List

1. Open the extension popup
2. Type in the search box — results filter instantly
3. Search works on both title and URL (e.g., type "github" to find all GitHub pages)

---

### 🛠️ Technical Details

#### Architecture

```
read-it-later-extension/
├── manifest.json          # Extension configuration (Manifest V3)
├── popup.html            # Main popup UI structure
├── popup.js              # Popup logic (rendering, search, UI events)
├── background.js         # Service worker (keyboard shortcuts, notifications)
├── read-later-core.js    # Core data logic (URL normalization, deduplication)
├── styles.css            # Golden ratio design, hidden scrollbars
├── icons/                # Extension icons (16/32/48/128px + SVG source)
├── tests/                # Unit tests (core logic + UI contracts)
└── scripts/              # Build utilities (icon generation, verification)
```

#### Core Logic

**URL Normalization**
- Removes hash fragments (`#section`)
- Removes trailing slashes
- Ensures consistent URLs to prevent duplicates

**Storage**
- Uses `chrome.storage.local` API (no quotas for extensions with `unlimitedStorage`)
- Entries stored as JSON array with title, URL, domain, timestamp, and favicon URL
- No external database, no cloud sync

**Keyboard Shortcuts**
- Handled by `background.js` service worker
- Uses `chrome.commands.onCommand` API
- Desktop notifications via `chrome.notifications` API

#### Tech Stack

- **Manifest V3** — Latest Chrome extension standard
- **Pure vanilla JavaScript** — No frameworks, no transpilation
- **No build step** — Direct source code, no bundling
- **Zero dependencies** — No npm packages

---

### 🧪 Development

#### Run Tests

```bash
node --test tests/*.test.js
```

Tests cover:
- Core logic (URL normalization, deduplication, entry building)
- Extension contracts (popup structure, required elements)

#### Verify Syntax

```bash
node --check popup.js read-later-core.js background.js
```

---

### 📝 License

MIT License — Feel free to use, modify, and distribute as you wish.

---

## 中文

### 这是什么

Read It Later 是一个**隐私优先的阅读列表管理器**，放在浏览器工具栏里。一键或快捷键保存页面，搜索列表，再也不会忘记想读的内容。

- **无云同步** — 所有数据都在本地
- **无需账号** — 无需注册、无追踪、无统计
- **无臃肿** — 纯原生 JavaScript，零依赖
- **即时响应** — 本地存储意味着无加载延迟

### ✨ 核心功能

🚀 **闪电般的保存速度**
- 按 `Alt+1` 即可保存，无需打开弹窗（最快！）
- 或点击扩展图标 → 点击 `+` 按钮
- **Toggle 行为**：已保存？再次点击即可删除

⌨️ **键盘优先工作流**
- `Alt+1` — 快速保存/删除当前页面（无需弹窗）
- `Alt+Shift+R` — 打开 Read It Later 弹窗
- 在 `chrome://extensions/shortcuts` 自定义快捷键

🔍 **智能搜索与组织**
- 按标题或 URL 实时过滤
- **智能去重**：URL 自动标准化（删除 hash 片段、尾部斜杠）
- 域名提取与字母图标
- 按时间戳最新优先排序

🔐 **100% 私密**
- 所有数据使用 `chrome.storage.local` 本地存储
- 零网络请求、无追踪、无统计
- 你的阅读列表永不离开你的机器

🎨 **黄金分割设计**
- 1:1.618 比例（380×615 弹窗）视觉和谐
- Playfair Display 衬线字体优雅易读
- 隐藏滚动条但保留平滑滚动
- 极简界面与清晰线条

🔔 **桌面通知**
- 保存或删除页面时即时视觉确认
- 2秒后自动消失
- 静音通知不打断你的工作流

---

### 📸 截图

#### 弹窗与已保存条目

<p align="center">
  <img src="docs/screenshots/popup-with-entries.png" width="400" alt="Read It Later 弹窗显示已保存页面">
</p>

清晰的列表视图，带搜索栏、域名图标，一键访问已保存页面。


---

### 📦 安装方法

1. **克隆或下载**本仓库：
   ```bash
   git clone https://github.com/Aschenbath/Read-It-Later.git
   ```

2. **打开 Chrome** 并进入 `chrome://extensions/`

3. **开启开发者模式**（右上角开关）

4. **点击"加载已解压的扩展程序"**并选择扩展文件夹

5. **完成！**书签图标出现在工具栏

---

### 🚀 使用指南

#### 保存页面

**方法 1：键盘快捷键（最快）**
1. 导航到任意网页
2. 按 `Alt+1`
3. 完成！桌面通知确认保存

**方法 2：点击图标**
1. 点击工具栏中的扩展图标
2. 点击弹窗中的 `+` 按钮
3. 完成！

#### 删除页面

**方法 1：键盘快捷键**
1. 导航到已保存的页面
2. 再次按 `Alt+1` — 切换删除
3. 桌面通知确认删除

**方法 2：从列表中删除**
1. 打开扩展弹窗
2. 点击任意条目右侧的垃圾桶图标

#### 打开已保存页面

1. 点击扩展图标查看列表
2. 点击任意条目在当前标签页打开

#### 搜索列表

1. 打开扩展弹窗
2. 在搜索框中输入 — 结果即时过滤
3. 搜索同时匹配标题和 URL（例如输入 "github" 找到所有 GitHub 页面）

---

### 🛠️ 技术细节

#### 架构

```
read-it-later-extension/
├── manifest.json          # 扩展配置 (Manifest V3)
├── popup.html            # 主弹窗 UI 结构
├── popup.js              # 弹窗逻辑（渲染、搜索、UI 事件）
├── background.js         # Service worker（键盘快捷键、通知）
├── read-later-core.js    # 核心数据逻辑（URL 标准化、去重）
├── styles.css            # 黄金分割设计、隐藏滚动条
├── icons/                # 扩展图标（16/32/48/128px + SVG 源文件）
├── tests/                # 单元测试（核心逻辑 + UI 契约）
└── scripts/              # 构建工具（图标生成、验证）
```

#### 核心逻辑

**URL 标准化**
- 删除 hash 片段（`#section`）
- 删除尾部斜杠
- 确保一致的 URL 以防止重复

**存储**
- 使用 `chrome.storage.local` API（带 `unlimitedStorage` 权限的扩展无配额限制）
- 条目存储为 JSON 数组，包含标题、URL、域名、时间戳和 favicon URL
- 无外部数据库、无云同步

**键盘快捷键**
- 由 `background.js` service worker 处理
- 使用 `chrome.commands.onCommand` API
- 桌面通知通过 `chrome.notifications` API

#### 技术栈

- **Manifest V3** — 最新 Chrome 扩展标准
- **纯原生 JavaScript** — 无框架、无转译
- **无构建步骤** — 直接源码、无打包
- **零依赖** — 无 npm 包

---

### 🧪 开发

#### 运行测试

```bash
node --test tests/*.test.js
```

测试覆盖：
- 核心逻辑（URL 标准化、去重、条目构建）
- 扩展契约（弹窗结构、必需元素）

#### 验证语法

```bash
node --check popup.js read-later-core.js background.js
```

---

### 📝 开源协议

MIT License — 欢迎自由使用、修改和分发。






