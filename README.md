<div align="center">

# 📑 Read It Later

**一键收藏网页，稍后阅读 — 本地存储，无需账号**

[English](#english) | [中文](#中文)

![Manifest V3](https://img.shields.io/badge/Manifest-V3-blue) ![Chrome](https://img.shields.io/badge/Chrome-Compatible-green) ![Edge](https://img.shields.io/badge/Edge-Compatible-green) ![Local Storage](https://img.shields.io/badge/Storage-Local-orange)

</div>

---

## 中文

### ✨ 核心三件事

- **📌 一键收藏** — 点扩展图标或按 `Alt+1`，当前网页立即存到本地
- **🔍 即时搜索** — 输入关键词，标题和网址即时过滤，找到想读的页面
- **🎯 一键直达** — 点击条目直接打开网页，再按 `Alt+1` 取消收藏

### 📸 界面预览

<p align="center">
  <img src="docs/screenshots/popup-with-entries.png" width="380" alt="Read It Later 收藏列表">
</p>

<details>
<summary>📋 展开完整功能表</summary>

| 功能分类 | 具体能力 | 说明 |
|---------|---------|------|
| **收藏管理** | 一键收藏 | 点击扩展图标的 `+` 按钮或按 `Alt+1` 保存当前页面 |
| | 快速移除 | 鼠标悬停条目时显示删除按钮 `×`，或在已收藏页面按 `Alt+1` 移除 |
| | 自动去重 | 重复收藏同一网页会自动移到列表顶部 |
| | 当前页高亮 | 已收藏的当前页面在列表中高亮显示 |
| **智能分组** | 域名自动分组 | 相同域名的网页自动归类（如所有 GitHub 页面一组） |
| | 手动分组 | 长按条目进入选择模式，拖拽到现有分组，或新建分组后自动移入选中条目 |
| | 批量操作 | 选择多个条目后可批量删除或移动到分组 |
| | 展开/收起 | 点击分组标题展开查看内容，再次点击收起 |
| | 分组批量打开 | 点击分组的"打开全部"按钮在后台标签页打开所有网页 |
| | 分组状态持久化 | 展开/收起状态自动保存，重新打开扩展时恢复 |
| **搜索过滤** | 即时搜索 | 输入关键词，标题和网址实时过滤 |
| | 域名过滤 | 输入 `@github` 只显示 GitHub 页面，`@域名` 精确过滤 |
| | 组合搜索 | `@github api` 在 GitHub 条目中搜索包含 "api" 的页面 |
| **视图切换** | 平铺/分组切换 | 点击搜索框左侧按钮在平铺列表和分组视图间切换 |
| | 默认平铺视图 | 打开扩展默认显示完整的平铺列表，方便快速浏览 |
| | 视图状态持久化 | 记住上次选择的视图模式（平铺/分组） |
| **界面交互** | 黄金比例 | 窗口尺寸 380×615（1:1.618 黄金比例） |
| | 悬停删除 | 删除按钮默认隐藏，鼠标悬停时平滑显示 |
| | 动画反馈 | 添加/删除/分组操作时的淡入淡出动画 |
| | 长标题提示 | 标题超过 35 字符时悬停显示完整文本 |
| | 拖拽反馈 | 拖拽时条目旋转、缩放，放置目标高亮提示 |
| **数据存储** | 本地存储 | 数据存在浏览器本地 `chrome.storage.local` |
| | 无需账号 | 不依赖任何外部服务或账号系统 |
| | 跨标签同步 | 多个标签页打开扩展时数据实时同步 |
| **快捷操作** | 键盘快捷键 | `Alt+1` 保存/移除当前页面（无需打开扩展窗口） |
| | 桌面通知 | 保存/移除操作通过系统通知确认 |
| | 方向键导航 | `↑`/`↓` 键在列表中导航，`Enter` 打开选中条目 |
| | 快捷键全选 | 选择模式下 `Ctrl+A` 全选当前可见条目 |
| | 删除快捷键 | `Delete` 键删除选中条目（选择模式）或聚焦条目（普通模式） |
| | ESC 退出 | `ESC` 退出选择模式或清空搜索框 |

</details>

<details>
<summary>🛠 展开完整操作手册</summary>

### 保存网页

| 方式 | 步骤 | 说明 |
|-----|------|------|
| **快捷键（推荐）** | 1. 浏览任意网页<br>2. 按 `Alt+1`<br>3. 桌面通知确认保存 | 最快方式，无需打开扩展窗口 |
| **点击按钮** | 1. 点击工具栏的扩展图标<br>2. 点击右上角的 `+` 按钮<br>3. 完成 | 适合习惯鼠标操作的用户 |

### 移除网页

| 方式 | 步骤 | 说明 |
|-----|------|------|
| **快捷键** | 1. 打开已收藏的网页<br>2. 按 `Alt+1` 再次切换<br>3. 桌面通知确认移除 | 快速移除当前页面 |
| **删除按钮** | 1. 打开扩展窗口<br>2. 鼠标悬停在条目上<br>3. 点击右侧的 `×` 按钮 | 从列表中选择性删除 |

### 打开保存的网页

| 步骤 | 说明 |
|------|------|
| 1. 点击扩展图标查看列表 | 显示所有已保存的页面 |
| 2. 点击任意条目 | 在新标签页打开该网页 |
| 3. 或使用键盘导航 | `↑`/`↓` 键选择，`Enter` 打开 |

### 搜索网页

| 步骤 | 说明 |
|------|------|
| 1. 打开扩展窗口 | 显示搜索框和完整列表 |
| 2. 在搜索框输入关键词 | 结果即时过滤 |
| 3. 搜索范围 | 同时匹配标题和网址 |
| 4. 域名过滤 | 输入 `@github` 只显示 GitHub 页面 |
| 5. 组合搜索 | `@github api` 在 GitHub 条目中搜索 "api" |

### 手动分组管理

| 步骤 | 说明 |
|------|------|
| 1. 长按条目（500ms） | 进入选择模式 |
| 2. 点击其他条目选择 | 多选要分组的网页 |
| 3. 拖拽到目标分组 | 将选中条目移动到现有分组 |
| 4. 或点击右上角 `+` 新建分组 | 输入分组名称后，选中的条目会直接移入新分组并退出选择模式 |
| 5. 批量删除 | 选择模式下点击 🗑️ 按钮或按 `Delete` 键 |
| 6. 退出选择模式 | 点击搜索框右侧的 `×` 或按 `ESC` 键 |

### 分组批量操作

| 操作 | 步骤 | 说明 |
|-----|------|------|
| **批量打开** | 点击分组标题右侧的"打开全部"按钮 | 在后台标签页打开该分组的所有网页 |
| **批量关闭** | 打开后再次点击该按钮 | 关闭之前批量打开的所有标签页 |
| **展开/收起** | 点击分组标题 | 查看或隐藏分组内的网页列表 |
| **空分组删除** | 点击空分组右侧箭头两次 | 只删除 0 pages 的空自定义分组，不会展开空内容 |

### 视图切换

| 步骤 | 说明 |
|------|------|
| 1. 点击搜索框左侧按钮 | 在平铺视图和分组视图间切换 |
| 2. 平铺视图 | 显示所有网页的完整列表 |
| 3. 分组视图 | 按域名分组显示，相同网站归为一组 |

</details>

---

### 📦 安装方法

**从源码安装**（推荐，适合开发者）

1. **克隆或下载**此仓库：
   ```bash
   git clone https://github.com/Aschenbath/Read-It-Later.git
   ```

2. **打开 Chrome** 并访问 `chrome://extensions/`

3. **启用开发者模式**（右上角开关）

4. **点击"加载已解压的扩展程序"**并选择扩展文件夹

5. **完成**！工具栏出现书签图标

**Chrome Web Store 安装**（即将上线）

扩展审核通过后会在此提供 Chrome Web Store 链接。

---

### 🛠️ 技术细节

#### 架构说明

```
read-it-later-extension/
├── manifest.json          # 扩展配置（Manifest V3）
├── popup.html            # 主界面结构
├── popup.js              # 界面逻辑（渲染、搜索、事件处理）
├── background.js         # Service Worker（快捷键、通知）
├── read-later-core.js    # 核心数据逻辑（URL 规范化、去重、分组）
├── styles.css            # 黄金比例设计、隐藏滚动条、动画
├── icons/                # 扩展图标（16/32/48/128px + SVG 源文件）
├── tests/                # 单元测试（核心逻辑 + UI 契约）
└── scripts/              # 构建工具（图标生成、截图）
```

#### 核心逻辑

**URL 规范化**
- 移除 hash 片段（`#section`）
- 移除尾部斜杠（`/`）
- 统一协议为小写（`HTTP` → `http`）

**去重策略**
- 基于规范化后的 URL 去重
- 重复保存会将条目移到列表顶部
- 更新 `updatedAt` 时间戳

**智能分组**
- 自动按域名分组：相同域名的网页自动归为一组
- 手动分组：用户创建自定义分组名称（如"工作"、"学习"）
- 分组识别：真实域名的单条目显示为独立条目，自定义分组名即使只有一条也显示为分组
- 批量操作：支持批量打开分组内所有网页，并可一键关闭

**拖拽分组**
- 长按条目 500ms 进入选择模式
- 选中的条目可拖拽到现有分组，或通过右上角 `+` 新建分组后自动归入
- 拖拽过程中提供视觉反馈（旋转、缩放、高亮）
- 支持键盘操作：`Ctrl+A` 全选，`Delete` 批量删除

**数据模型**

```javascript
{
  id: string,           // 唯一标识（基于 URL 编码）
  title: string,        // 页面标题
  url: string,          // 完整 URL（已规范化）
  domain: string,       // 域名或自定义分组名
  favIconUrl: string,   // Favicon 数据 URL 或空字符串
  createdAt: number,    // 创建时间戳（毫秒）
  updatedAt: number     // 更新时间戳（毫秒）
}
```

| 字段 | 类型 | 说明 | 示例 |
|-----|------|------|------|
| `id` | `string` | 唯一标识（基于 URL） | `"https%3A%2F%2Fgithub.com"` |
| `title` | `string` | 页面标题 | `"GitHub - Where the world builds software"` |
| `url` | `string` | 完整 URL（已规范化） | `"https://github.com"` |
| `domain` | `string` | 提取的域名或自定义分组名 | `"github.com"` 或 `"工作"` |
| `favIconUrl` | `string` | Favicon 数据 URL 或空字符串 | `"data:image/svg+xml;base64,..."` 或 `""` |
| `createdAt` | `number` | 创建时间戳（毫秒） | `1780732800000` |
| `updatedAt` | `number` | 最后更新时间戳（毫秒） | `1780732800000` |

**存储机制**
- 使用 `chrome.storage.local` 存储（容量限制 5MB）
- 数据结构：`{ readLaterItems: Entry[] }`
- 分组状态：`{ readLaterExpandedDomains: string[] }` 保存展开的分组
- 视图模式：`{ readLaterViewMode: 'flat' | 'grouped' }` 保存当前视图
- 批量打开状态：`{ openedDomainTabs: { [domain]: tabId[] } }` 跟踪打开的标签页
- 多标签页通过 `storage.onChanged` 监听自动同步

**桌面通知**
- 通过 `chrome.notifications` API 发送
- 通知类型：`basic`
- 自动超时：2 秒

**键盘快捷键**
- `Alt+1`：快速保存/移除当前页面（全局快捷键，无需打开扩展）
- `Alt+Shift+R`：打开扩展弹窗
- `Ctrl+K` / `Cmd+K`：聚焦搜索框
- `↑` / `↓`：在列表中导航
- `Enter`：打开选中的条目
- `Delete`：删除选中条目
- `Ctrl+A` / `Cmd+A`：选择模式下全选
- `ESC`：退出选择模式或清空搜索

#### 权限说明

| 权限 | 用途 | 说明 |
|-----|------|------|
| `storage` | 本地数据存储 | 保存收藏列表到 `chrome.storage.local` |
| `tabs` | 标签页管理 | 批量打开/关闭标签页、获取当前标签页信息 |
| `activeTab` | 获取当前标签页信息 | 读取当前页面的标题、URL、Favicon |
| `notifications` | 桌面通知 | 快捷键保存/移除时显示确认通知 |

---

### 🧪 测试

运行单元测试：

```bash
node --test tests/*.test.js
```

测试覆盖：
- URL 规范化和去重逻辑
- 数据模型验证
- 核心 CRUD 操作
- 分组逻辑和视图切换

---

### 📄 许可证

MIT License - 详见 [LICENSE](LICENSE) 文件

---

## English

### ✨ Core Features

- **📌 One-Click Save** — Click extension icon or press `Alt+1`, current page saved locally instantly
- **🔍 Instant Search** — Type keywords, filter by title and URL immediately, find pages you want to read
- **🎯 One-Click Access** — Click entry to open page directly, press `Alt+1` again to remove from list

### 📸 Screenshots

<p align="center">
  <img src="docs/screenshots/popup-with-entries.png" width="380" alt="Read It Later popup list">
</p>

<details>
<summary>📋 Expand Full Feature Map</summary>

| Category | Capability | Description |
|----------|-----------|-------------|
| **Save Management** | One-Click Save | Click `+` button in extension popup or press `Alt+1` to save current page |
| | Quick Remove | Hover over entry to show delete button `×`, or press `Alt+1` on saved page to remove |
| | Auto Deduplication | Re-saving same page moves it to top of list |
| | Current Page Highlight | Saved current page highlighted in list |
| **Smart Grouping** | Auto Domain Grouping | Pages from same domain automatically grouped (e.g., all GitHub pages in one group) |
| | Manual Grouping | Long press entry to enter selection mode, drag to an existing group, or create a group that immediately receives selected entries |
| | Batch Operations | Select multiple entries to batch delete or move to group |
| | Expand/Collapse | Click group header to expand/collapse content |
| | Batch Open Group | Click "Open All" button to open all pages in group in background tabs |
| | Group State Persistence | Expand/collapse state saved, restored when reopening extension |
| **Search & Filter** | Instant Search | Type keywords, filter by title and URL in real-time |
| | Domain Filter | Type `@github` to show only GitHub pages, `@domain` for precise filtering |
| | Combined Search | `@github api` searches "api" within GitHub entries |
| **View Toggle** | Flat/Grouped Toggle | Click button left of search box to toggle between flat list and grouped view |
| | Default Flat View | Extension opens to flat list by default for quick browsing |
| | View State Persistence | Remembers last selected view mode (flat/grouped) |
| **UI Interaction** | Golden Ratio | Window size 380×615 (1:1.618 golden ratio) |
| | Hover Delete | Delete button hidden by default, smoothly appears on hover |
| | Animation Feedback | Fade in/out animations for add/delete/group operations |
| | Long Title Tooltip | Hover shows full text for titles over 35 characters |
| | Drag Feedback | Dragging entry rotates, scales; drop targets highlight |
| **Data Storage** | Local Storage | Data stored in browser's `chrome.storage.local` |
| | No Account Required | No external service or account system dependency |
| | Cross-Tab Sync | Data syncs in real-time across multiple tabs |
| **Quick Actions** | Keyboard Shortcut | `Alt+1` to save/remove current page (no popup needed) |
| | Desktop Notification | Save/remove actions confirmed via system notification |
| | Arrow Key Navigation | `↑`/`↓` to navigate list, `Enter` to open selected entry |
| | Quick Select All | `Ctrl+A` to select all visible entries in selection mode |
| | Delete Shortcut | `Delete` key to delete selected (selection mode) or focused entry (normal mode) |
| | ESC Exit | `ESC` to exit selection mode or clear search |

</details>

<details>
<summary>🛠 Expand Full Operation Manual</summary>

### Save a Page

| Method | Steps | Notes |
|--------|-------|-------|
| **Keyboard Shortcut (Recommended)** | 1. Browse any webpage<br>2. Press `Alt+1`<br>3. Desktop notification confirms save | Fastest method, no popup needed |
| **Click Button** | 1. Click extension icon in toolbar<br>2. Click `+` button in top-right<br>3. Done | For mouse-oriented users |

### Remove a Page

| Method | Steps | Notes |
|--------|-------|-------|
| **Keyboard Shortcut** | 1. Open a saved page<br>2. Press `Alt+1` to toggle off<br>3. Desktop notification confirms removal | Quick removal of current page |
| **Delete Button** | 1. Open extension popup<br>2. Hover over entry<br>3. Click `×` button on right | Selective deletion from list |

### Open a Saved Page

| Step | Description |
|------|-------------|
| 1. Click extension icon to see list | Shows all saved pages |
| 2. Click any entry | Opens page in new tab |
| 3. Or use keyboard navigation | `↑`/`↓` to select, `Enter` to open |

### Search Pages

| Step | Description |
|------|-------------|
| 1. Open extension popup | Shows search box and full list |
| 2. Type keywords in search box | Results filter instantly |
| 3. Search scope | Matches both title and URL |
| 4. Domain filter | Type `@github` to show only GitHub pages |
| 5. Combined search | `@github api` searches "api" within GitHub entries |

### Manual Group Management

| Step | Description |
|------|-------------|
| 1. Long press entry (500ms) | Enter selection mode |
| 2. Click other entries to select | Multi-select pages to group |
| 3. Drag to target group | Move selected entries to existing group |
| 4. Or click top-right `+` to create a group | Enter a group name; selected entries move into it immediately and selection mode exits |
| 5. Batch delete | In selection mode, click 🗑️ button or press `Delete` key |
| 6. Exit selection mode | Click `×` on right of search box or press `ESC` |

### Group Batch Operations

| Operation | Steps | Description |
|-----------|-------|-------------|
| **Batch Open** | Click "Open All" button right of group header | Opens all pages in group in background tabs |
| **Batch Close** | Click button again after opening | Closes all previously batch-opened tabs |
| **Expand/Collapse** | Click group header | Show or hide list of pages in group |
| **Remove Empty Group** | Click the empty group's chevron twice | Removes only a 0-page custom group without expanding empty content |

### View Toggle

| Step | Description |
|------|-------------|
| 1. Click button left of search box | Toggle between flat view and grouped view |
| 2. Flat view | Shows complete flat list of all pages |
| 3. Grouped view | Groups pages by domain, same sites in one group |

</details>

---

### 📦 Installation

**From Source** (Recommended for developers)

1. **Clone or download** this repository:
   ```bash
   git clone https://github.com/Aschenbath/Read-It-Later.git
   ```

2. **Open Chrome** and navigate to `chrome://extensions/`

3. **Enable Developer Mode** (toggle in top-right corner)

4. **Click "Load unpacked"** and select the extension folder

5. **Done!** Bookmark icon appears in your toolbar

**Chrome Web Store** (Coming Soon)

Chrome Web Store link will be provided here after extension review approval.

---

### 🛠️ Technical Details

#### Architecture

```
read-it-later-extension/
├── manifest.json          # Extension configuration (Manifest V3)
├── popup.html            # Main popup UI structure
├── popup.js              # Popup logic (rendering, search, UI events)
├── background.js         # Service worker (keyboard shortcuts, notifications)
├── read-later-core.js    # Core data logic (URL normalization, deduplication, grouping)
├── styles.css            # Golden ratio design, hidden scrollbars, animations
├── icons/                # Extension icons (16/32/48/128px + SVG source)
├── tests/                # Unit tests (core logic + UI contracts)
└── scripts/              # Build utilities (icon generation, screenshots)
```

#### Core Logic

**URL Normalization**
- Removes hash fragments (`#section`)
- Removes trailing slashes (`/`)
- Normalizes protocol to lowercase (`HTTP` → `http`)

**Deduplication Strategy**
- Deduplicates based on normalized URL
- Re-saving moves entry to top of list
- Updates `updatedAt` timestamp

**Smart Grouping**
- Auto domain grouping: Pages from same domain automatically grouped
- Manual grouping: Users create custom group names (e.g., "Work", "Learning")
- Group identification: Real domain single entries shown as individual items, custom group names shown as groups even with one entry
- Batch operations: Batch open all pages in group, one-click close

**Drag-and-Drop Grouping**
- Long press entry 500ms to enter selection mode
- Selected entries can be dragged to existing groups, or moved into a newly created group from the top-right `+`
- Visual feedback during drag (rotate, scale, highlight)
- Keyboard support: `Ctrl+A` select all, `Delete` batch delete

**Data Model**

```javascript
{
  id: string,           // Unique identifier (URL-based encoding)
  title: string,        // Page title
  url: string,          // Full URL (normalized)
  domain: string,       // Domain name or custom group name
  favIconUrl: string,   // Favicon data URL or empty string
  createdAt: number,    // Creation timestamp (milliseconds)
  updatedAt: number     // Update timestamp (milliseconds)
}
```

| Field | Type | Description | Example |
|-------|------|-------------|---------|
| `id` | `string` | Unique identifier (URL-based) | `"https%3A%2F%2Fgithub.com"` |
| `title` | `string` | Page title | `"GitHub - Where the world builds software"` |
| `url` | `string` | Full URL (normalized) | `"https://github.com"` |
| `domain` | `string` | Extracted domain or custom group name | `"github.com"` or `"Work"` |
| `favIconUrl` | `string` | Favicon data URL or empty string | `"data:image/svg+xml;base64,..."` or `""` |
| `createdAt` | `number` | Creation timestamp (milliseconds) | `1780732800000` |
| `updatedAt` | `number` | Last update timestamp (milliseconds) | `1780732800000` |

**Storage Mechanism**
- Uses `chrome.storage.local` (5MB limit)
- Data structure: `{ readLaterItems: Entry[] }`
- Group state: `{ readLaterExpandedDomains: string[] }` saves expanded groups
- View mode: `{ readLaterViewMode: 'flat' | 'grouped' }` saves current view
- Batch open state: `{ openedDomainTabs: { [domain]: tabId[] } }` tracks opened tabs
- Multi-tab sync via `storage.onChanged` listener

**Desktop Notifications**
- Sent via `chrome.notifications` API
- Notification type: `basic`
- Auto timeout: 2 seconds

**Keyboard Shortcuts**
- `Alt+1`: Quick save/remove current page (global shortcut, no popup needed)
- `Alt+Shift+R`: Open extension popup
- `Ctrl+K` / `Cmd+K`: Focus search box
- `↑` / `↓`: Navigate list
- `Enter`: Open selected entry
- `Delete`: Delete selected entry
- `Ctrl+A` / `Cmd+A`: Select all in selection mode
- `ESC`: Exit selection mode or clear search

#### Permissions

| Permission | Purpose | Description |
|-----------|---------|-------------|
| `storage` | Local data storage | Save bookmark list to `chrome.storage.local` |
| `tabs` | Tab management | Batch open/close tabs, get current tab info |
| `activeTab` | Get current tab info | Read current page's title, URL, Favicon |
| `notifications` | Desktop notifications | Show confirmation when saving/removing via shortcut |

---

### 🧪 Testing

Run unit tests:

```bash
node --test tests/*.test.js
```

Test coverage:
- URL normalization and deduplication logic
- Data model validation
- Core CRUD operations
- Grouping logic and view toggle

---

### 📄 License

MIT License - See [LICENSE](LICENSE) file for details
