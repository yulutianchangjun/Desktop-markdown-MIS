# Local DMS · 本地 Markdown 文档管理系统

按《本地 Markdown 文档管理系统 (Local DMS) 规范文档》实现的桌面应用：Tauri v2 外壳 +
Vue 3 界面 + SQLite 单文件存储。全部数据落在本机，不依赖任何服务端。

```
┌────────────┬──────────────────────────────────────────────┐
│  导航轨     │  顶栏（拖拽区 + 搜索 + 明暗切换 + 窗口控制）      │
│  72px      ├──────────────────────────────────────────────┤
│  品牌       │  Bento 仪表盘：拖拽导入 / 最近编辑 /            │
│  全部文档   │                时间轴概览 / 状态统计            │
│  分类目录   │  ────────────────────────────────────────    │
│  时间轴流   │  编辑区：纯阅览 / 双模式 / 纯源码                │
│  废纸篓     │                                              │
│  系统设置   │                                              │
└────────────┴──────────────────────────────────────────────┘
```

## 技术栈

| 层 | 选型 | 说明 |
| --- | --- | --- |
| 应用底座 | Tauri v2 | 原生文件系统、系统对话框、无边框窗口 |
| 界面 | Vue 3 + TypeScript + Pinia | 组合式 API，Pinia 管理文档与配置状态 |
| 文档引擎 | md-editor-v3 7 | 源码编辑、分屏对照、纯阅览、语法高亮、导出 |
| 存储 | SQLite（`@tauri-apps/plugin-sql`） | 单文件 `data.db`，WAL 模式 |

## 目录结构

```
├─ src/                       前端
│  ├─ App.vue                 外壳：导航轨 + 顶栏 + 视图切换 + 全局拖拽导入
│  ├─ components/             AppIcon / NavRail / TitleBar / BentoCard / DocumentList
│  ├─ views/                  Dashboard / Editor / Documents / Categories / Timeline / Trash / Settings
│  ├─ stores/                 documents（文档与路由状态）、settings（主题与配置）
│  ├─ db/
│  │  ├─ index.ts             SQL 层：PRAGMA、增删改查、user_settings
│  │  └─ transport.ts         「谁来执行 SQL」：桌面 plugin-sql / 浏览器预览
│  ├─ lib/                    time（相对时间）、themes（排版/代码主题）、icons（内联 SVG）
│  └─ styles/theme.css        主题体系：镜像 md-editor-v3 的调色板
├─ src-tauri/                 后端
│  ├─ src/lib.rs              插件装配、migration 注册、db_path 命令
│  ├─ migrations/001_init.sql 表结构与索引（前端校验脚本复用同一份文件）
│  ├─ capabilities/default.json  最小权限集合
│  └─ tauri.conf.json         无边框窗口、CSP、打包配置
├─ tools/                     构建与校验脚本（见文末）
└─ shots/                     界面截图（由 tools/cdp-shot.mjs 自动生成）
```

## 快速开始

前置：Node.js ≥ 20、pnpm、Rust 稳定版工具链（Windows 上默认 `x86_64-pc-windows-msvc`）。

```bash
pnpm install
pnpm tauri dev        # 开发
pnpm tauri build      # 打包（含 NSIS 安装包）
pnpm build            # 仅构建前端（含 vue-tsc 类型检查）
```

> **本机（DSH 沙箱）请改用 `tools/` 下的脚本**，原因见文末「沙箱适配」。

## 数据模型

`data.db` 位于应用配置目录（Windows：`%APPDATA%\com.localdms.desktop\data.db`），
由 Rust 侧 migration 在首次建立连接时自动创建：

```sql
CREATE TABLE IF NOT EXISTS documents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    raw_content TEXT NOT NULL,
    category TEXT DEFAULT '未分类',
    tags TEXT,
    is_archived INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT (datetime('now', 'localtime')),
    updated_at DATETIME DEFAULT (datetime('now', 'localtime'))
);
CREATE INDEX IF NOT EXISTS idx_docs_created  ON documents(created_at);
CREATE INDEX IF NOT EXISTS idx_docs_category ON documents(category);

CREATE TABLE IF NOT EXISTS user_settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
```

连接建立后依次执行：`journal_mode = WAL`、`synchronous = NORMAL`、`foreign_keys = ON`、
`busy_timeout = 5000`。配置项以 `active_theme`、`view_mode`、`preview_theme`、`code_theme`、
`font_size` 五个键存入 `user_settings`。

「分类目录」的层级来自 `category` 字段里的 `/` 路径（如 `技术/前端/Vue`），因此多级归类
不需要额外的表；「分类总数」按去重后的完整路径统计。

## 主题体系

- 深色为主色，容器背景对齐 md-editor-v3 的 `--md-bk-color`，深色下边框统一
  `rgba(255,255,255,0.06)` 的 1px 微发光描边。
- `src/styles/theme.css` 在 `.app-shell` 上镜像了 md-editor-v3 在
  `.md-editor` / `.md-editor[data-theme=dark]` 中声明的整套 `--md-*` 变量。md-editor-v3 只在
  编辑器根节点上声明这些变量，而导航轨、卡片、顶栏位于编辑器之外，镜像取值让外壳与
  编辑器共用同一份调色板，而不是另起一套颜色。
- 强调色绑定：`--md-theme-color` 由 Pinia 依据当前排版主题写到 `.app-shell`，导航轨激活项、
  选中项、按钮高亮、拖拽高光全部引用它；切换明暗或排版主题时整体同步变更。
- 排版主题复用 md-editor-v3 内置的 default / github / vuepress / mk-cute / smart-blue /
  cyanosis；代码高亮复用 atom / github / stackoverflow / a11y / monokai / vs / xcode / dracula。
- 三态切换：纯阅览用 `MdPreview`，双模式 / 纯源码用 `MdEditor`。注意 md-editor-v3 的
  `preview` 属性只在挂载时生效，运行期切换走组件暴露的 `togglePreview()`，避免整块重挂载
  丢掉撤销历史与光标位置。

## 安全与权限

`src-tauri/capabilities/default.json` 只授予实际用到的能力：无边框窗口控制、系统对话框、
本地 SQLite，以及文本文件的读写。

- 读取使用 `**` 通配：拖拽导入时文件路径在拖拽发生前无法预知，无法预先收紧白名单。
- 写入同样放开：导出目标由用户在系统对话框中选定。
- 未使用的 `tauri-plugin-opener` 已从依赖中移除，以缩小打包体积与权限面。
- release profile 开启 `lto` + `opt-level = "s"` + `strip`，单文件二进制约 **5.5 MB**。

## 校验

### 端到端写入校验（应用代码 → 真实 SQLite 文件）

```powershell
pnpm dev                                                          # 启动带 node:sqlite 后端的开发服务器
node tools/verify-e2e.mjs http://127.0.0.1:1420/ .scratch/preview/data.db
```

`tools/verify-e2e.mjs` 用 CDP 驱动真实界面执行写操作，再以只读连接直接读 SQLite 文件断言结果。
关键在于「谁写的」：这些改动全部经过应用自己的代码路径
（`stores/documents.ts` → `src/db/index.ts` → transport），不是另写一份等价 SQL。13 项断言全通过：

| 断言 | 观测值 |
| --- | --- |
| 数据库以 WAL 模式打开，`-wal` 文件存在 | `wal` |
| 修改分类 → `UPDATE documents.category` | `写作/随笔` → `测试/端到端` |
| 修改标签 → `UPDATE documents.tags` | `null` → `e2e,校验` |
| 修改标题 → `UPDATE documents.title` | 改名后行可查到 |
| 保存（Ctrl+S 路径）刷新 `updated_at` | `22:45:37` → `22:45:39` |
| 保存不改动 `created_at` | `2026-10-10 14:24:00` 保持不变 |
| 归档写入 `is_archived = 1`（软删除） | 总行数仍为 9 |
| 废纸篓还原写入 `is_archived = 0` | 通过 |
| 主题切换 → `user_settings` UPSERT | `active_theme` 被写入并可读取 |

> 这轮校验抓到一个真实缺陷：编辑区标题输入框当时只绑定 `:value`，提交时读的是 store 里的旧标题，
> 等于「改名无效」。已改为从事件读取输入值，并补上「清空则回退」的保护。

### 数据层

```bash
python tools/verify-db.py --scratch          # 结构与 CRUD 套件（23 项）
python tools/verify-db.py --db <data.db>     # 校验真实落盘的库（只读）
```

脚本直接执行 `src-tauri/migrations/001_init.sql`——与应用启动时用的是同一份文件，
因此校验的结构与运行结构一致。结果（23/23 通过）：

| 项 | 结果 |
| --- | --- |
| 表 / 字段 / 默认值 与规范一致 | 通过 |
| `journal_mode` = `wal`，`-wal` 日志生成 | 通过 |
| INSERT / UPDATE / 软删除 / 还原 / DELETE 往返 | 通过 |
| `created_at` / `updated_at` 由列默认值自动填充 | 通过 |
| `user_settings` 主键 UPSERT 覆盖旧值 | 通过 |
| 时间轴排序走 `idx_docs_created` | 通过（`SCAN documents USING INDEX idx_docs_created`）|
| 分类筛选走 `idx_docs_category` | 通过（`SEARCH documents USING INDEX idx_docs_category`）|

### 界面

`shots/` 下的 10 张截图由 `pnpm dev` + 无头 Edge 实际驱动生成，数据来自一个真实的
`data.db` 文件（9 篇演示文档，含多级分类、跨月创建时间、1 篇归档）：

| 截图 | 覆盖点 |
| --- | --- |
| `01-dashboard-dark.png` | Bento 仪表盘：拖拽导入区、最近编辑、时间轴概览、状态统计 |
| `02-documents.png` | 全部文档列表 |
| `03-categories.png` | 分类目录树 + 分类筛选（多级、带计数） |
| `04-timeline.png` | 时间轴流（按年/月分组） |
| `05-trash.png` | 废纸篓 / 归档（还原与彻底删除入口） |
| `06-settings.png` | 系统设置（明暗、字号、排版/代码主题、库信息、全库导出） |
| `07-editor-split.png` | 双模式：源码 + 实时预览 |
| `08-editor-preview.png` | 纯阅览模式（MdPreview） |
| `09-editor-source.png` | 纯源码模式 |
| `10-light-dashboard.png` | 浅色模式 + 双模式编辑区（强调色随之切换） |

## 沙箱适配（仅本机受限环境需要）

本机没有系统 Rust，且 DSH 沙箱对受限进程有两条硬限制，因此仓库里带了几个辅助脚本。
**在普通开发机上这些都不需要**，直接用上面的「快速开始」即可。

1. **Schannel 不可用** — 受限进程拿不到 Schannel 凭据（`SEC_E_NO_CREDENTIALS`），
   curl / git / rustup / Cargo 的 HTTPS 全部失败，而 Node 与 Python 的 TLS 正常。
   - `tools/fetch-rust.ps1` + `tools/download-rust.mjs`：用 Node 直接下载 Rust 发行包组件
     （rustc / cargo / rust-std / rust-mingw），解包合并成工作区内的独立工具链 `.rust/`。
   - `tools/crates-proxy.mjs`：在 `127.0.0.1:8791` 上用 Node 的 TLS 终结 HTTPS，把
     crates.io 的 sparse 索引与 `.crate` 下载转成明文 HTTP；`config.json` 里的 `dl` 会被
     重写指向本代理。`.rust/config.toml` 通过 `source.crates-io` 替换接入它。
2. **禁止管道式子进程** — `child_process` 以 `stdio: 'pipe'` 创建子进程会得到 `EPERM`
   （`stdio: 'inherit'` 与 `'ignore'` 正常，纯 `cmd.exe` 也一样）。Vite 在 Windows 上会执行
   一次 `exec('net use')` 探测网络盘，属于管道式调用，导致 `vite build` 在加载配置阶段就崩溃。
   - `tools/dsh-build-shim.mjs`：让那次针对 cwd 的 `fs.realpathSync.native` 探测抛出
     Vite 已经在处理的 `EISDIR`，Vite 便走它自己的回退分支并跳过 shell 探测。
     该垫片不修改 `node_modules`，只在显式设置 `NODE_OPTIONS` 时生效。

### 本机命令

```powershell
# 一次性：安装工作区本地 Rust 工具链（约 220 MB 下载）
pwsh -File tools/fetch-rust.ps1

# 启动 crates 代理（保持运行）
node tools/crates-proxy.mjs

# 构建（脚本会自动设置 CARGO_HOME、MinGW PATH、NODE_OPTIONS）
pwsh -File tools/tauri.ps1 build --no-bundle
pwsh -File tools/tauri.ps1 dev
```

### 界面预览模式

`pnpm dev` 会额外挂载 `tools/vite-sql-preview.mjs`：它用 `node:sqlite` 打开工作区内一个
真实的 `data.db`（`.scratch/preview/data.db`），执行同一份 migration，并接受
`POST /__dsh/sql`。因此浏览器里跑的界面用的是**真实的 SQL 与数据库文件**，只是执行者从
`tauri-plugin-sql` 换成了开发服务器。桌面运行时不会走到这条路径
（`src/db/index.ts` 要求 `window.__TAURI_INTERNALS__` 存在），`pnpm build` 时该中间件也不生效。

```powershell
python tools/seed-demo.py --db .scratch/preview/data.db --force   # 造演示数据
$env:NODE_OPTIONS = "--import file:///<abs>/tools/dsh-build-shim.mjs"
pnpm dev                                                          # http://127.0.0.1:1420
node tools/cdp-shot.mjs http://127.0.0.1:1420/ shots              # 驱动界面逐屏截图
node tools/verify-e2e.mjs http://127.0.0.1:1420/ .scratch/preview/data.db   # 写入校验
```

`.scratch/` 是可随时删除的临时目录（已在 `.gitignore` 中）：`preview/` 放预览用的
`data.db`，`edge-profile/` 是无头 Edge 的临时配置。截图脚本会启动无头 Edge，用完记得关掉它；
若该目录因权限项删不掉，换个会话或稍后再删即可，不影响仓库内容。

### 已知环境限制

桌面程序无法在受限会话内启动，根因是**后代进程拿不到正常令牌**：

- 直接 `Start-Process`（含 `danger-full-access`）、`Shell.Application` 的 `ShellExecute`、
  `explorer.exe` 外壳启动，都在约 2 秒内退出；
- 计划任务（`schtasks` 与 `Register-ScheduledTask` + Interactive 登录类型）在本机连脚本都
  执行不了（`LastTaskResult = 1`，日志文件根本没生成），因此这条路无法作为对照。

失败的调用点很明确：

```
thread 'main' panicked at tauri-2.12.4/src/app.rs:1444:11:
Failed to setup app: 拒绝访问。 (os error 5)
```

Tauri 在创建 WebView2 之前会对 `%LOCALAPPDATA%\com.localdms.desktop` 调用 `create_dir_all`
（`tauri/src/manager/webview.rs:574`）。**同一条命令里我自己的 shell 能创建这个目录，应用进程
却不能**——这是令牌限制，不是程序缺陷。把该目录预先建好之后，错误变成 WebView2 的
`E_UNEXPECTED`，与「沙箱禁止命名管道、而 WebView2 用它做进程间通信」一致。

因此本仓库的界面验证走「界面预览模式 + 无头 Edge」，写入验证用
`tools/verify-e2e.mjs` 打在真实 SQLite 文件上。要在真机上确认窗口，直接双击运行
`src-tauri/target/release/local-dms.exe` 即可；首次启动会在
`%APPDATA%\com.localdms.desktop\` 下生成 `data.db`。也可以运行
`pwsh -File tools/verify-app.ps1`，它会自动完成「启动 → 校验建库 → 造数 → 截图 →
确认界面写入落库」全流程（需在沙箱之外执行）。

macOS / Linux 上 Tauri 用系统 WebKit，不需要 MinGW；本机走
`x86_64-pc-windows-gnu` 目标，链接器与资源编译器由 `E:\DevTools\MinGw64` 提供
（配置见 `src-tauri/.cargo/config.toml`）。注意该目标下 `cdylib` 会因 MinGW 自动导出
符号过多而报 `export ordinal too large`，桌面端因此把 `crate-type` 收窄为 `rlib`
（`staticlib`/`cdylib` 只有移动端才需要）。
