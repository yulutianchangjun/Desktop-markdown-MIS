<div align="center">

# 📝 Md-Mis

### 轻量级本地离线 Markdown 文档管理系统

**Tauri v2 + Vue 3 + TypeScript + SQLite（WAL）** · 单文件存储 · 零服务端 · 绿色便携

[![Tauri](https://img.shields.io/badge/Tauri-v2-24C8DB?logo=tauri)](https://v2.tauri.app/)
[![Vue](https://img.shields.io/badge/Vue-3.5-4FC08D?logo=vuedotjs)](https://vuejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript)](https://www.typescriptlang.org/)
[![SQLite](https://img.shields.io/badge/SQLite-WAL-003B57?logo=sqlite)](https://www.sqlite.org/wal.html)
[![Platform](https://img.shields.io/badge/Platform-Windows%20(x64)-lightgrey)]()
[![Size](https://img.shields.io/badge/Binary-~5.5%20MB-blue)]()

</div>

---

> **一句话定位**：把散落在磁盘各处的 Markdown 笔记，收进一个**离线、单文件、便携**的本地应用里
> ——导入、分类、检索、编辑、导出，全程不联网、不上云、不依赖任何服务端进程。

---

## 📑 目录

- [1. 项目简介](#1-项目简介)
- [2. 核心特性](#2-核心特性)
- [3. 技术栈](#3-技术栈)
- [4. 环境前置要求](#4-环境前置要求)
- [5. 快速启动](#5-快速启动)
- [6. 项目架构树](#6-项目架构树)
- [7. 打包构建](#7-打包构建)
- [8. 数据模型与存储](#8-数据模型与存储)
- [9. 常用命令与分支约定](#9-常用命令与分支约定)
- [10. 常见问题（FAQ）](#10-常见问题faq)

---

## 1. 项目简介

Md-Mis 是一款基于 **Tauri v2 + Vue 3** 的轻量级本地离线 Markdown 管理系统，面向
「本地笔记多、想统一管起来、又不想把内容交给任何云服务」的使用场景。

它复用系统自带的 WebView2 而不是打包整个浏览器内核，因此单个可执行文件只有
**约 5.5 MB**、空闲内存占用很低；所有数据都放在程序**同级的 `data/` 目录**里，
整个文件夹拷到另一台机器就能继续用。

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

---

## 2. 核心特性

### 🍱 Bento 卡片式仪表盘

未选中文档时的极简控制台，四张卡片各自独立成块：

- **拖拽导入区**：把 `.md` 文件拖进窗口任意位置即可，文件名自动成为文档标题，源码即时落库；
- **最近编辑**：按更新时间列出最近 5 篇，附「10 分钟前」这类相对时间；
- **时间轴概览**：当月创作/导入足迹，点击时间节点直接跳进文档；
- **快捷状态统计**：总文档数、分类总数、本周更新量、归档数。

### 🖥️ 三态编辑预览

同一个文档在三种作业形态间无缝切换：

| 模式 | 实现 | 适合 |
| --- | --- | --- |
| **纯阅览** | `MdPreview` | 沉浸阅读、检查排版 |
| **双模式** | `MdEditor` 分屏 | 边写边看、调表格与代码块 |
| **纯源码** | `MdEditor` 单栏 | 大量粘贴、结构重排 |

配套 `Ctrl + S` 即时保存、一键导出 `.md`、以及正文排版主题 / 代码高亮配色的下拉切换。
三态切换走组件暴露的 `togglePreview()`，**不会重挂载编辑器**，撤销历史与光标位置都保得住。

### 🗂️ 虚拟多级分类

层级由 `category` 字段里的 `/` 路径表达（如 `技术/前端/Vue`），**不需要额外的分类表**：

- 侧栏自动聚合成可折叠的多级树，每个节点带文档计数；
- 点击任意节点筛选（含其所有子级）；
- 编辑区改一下分类路径，树状结构立刻跟着变。

### 🕓 时间轴流

按年 / 月倒序分组的时间节点流，每篇文档显示创建时间、更新时间与所属分类，
适合回看「这个月都写了什么」。

### 💾 全离线单文件 SQLite WAL 存储

- 单个 `data.db` 承载全部文档与配置，**没有外部数据库进程**；
- 启用 **WAL** 模式：读写不互相阻塞，崩溃后可由 `-wal` 日志恢复；
- 表上建了 `idx_docs_created` / `idx_docs_category`，时间轴排序与分类检索走索引；
- 表结构升级只走增量 Migration，**不 `DROP TABLE`**，升级不丢笔记（详见 [打包与升级规范](docs/PACKAGING.md)）。

### 🎨 深度继承的主题体系

以 `md-editor-v3` 自带的主题变量为全局主色调基准，而不是另起一套配色：

- 深色为主推，容器背景对齐 `--md-bk-color`，深色下边框统一 `rgba(255,255,255,0.06)` 微发光描边；
- 明暗切换时外层容器 CSS 变量与编辑器 `:theme` 同步变更；
- 强调色 `--md-theme-color` 由当前排版主题驱动，导航轨激活项、选中项、拖拽高光全部引用它；
- 排版预设复用 `github` / `vuepress` / `mk-cute` / `smart-blue` / `cyanosis`，
  代码配色复用 `atom` / `github` / `stackoverflow` 等。

### 📦 绿色便携 + 免提权安装

- 所有应用目录（含 WebView2 缓存）都落在程序同级 `data/`，**不写 `%APPDATA%`**；
- NSIS 安装包为 `currentUser` 模式，**免 UAC**，安装向导可自由选择盘符；
- 启动失败会弹出错误对话框并写入 `data/startup.log`，不会「双击没反应」。

---

## 3. 技术栈

| 层 | 选型 | 职责 |
| --- | --- | --- |
| 应用底座 | **Tauri v2** | 原生文件系统直读、系统拖拽、原生保存/打开对话框、无边框窗口控制 |
| 界面框架 | **Vue 3**（组合式 API） | 视图与交互 |
| 语言 | **TypeScript 5** | 全量类型约束，`vue-tsc --noEmit` 进构建流水线 |
| 状态管理 | **Pinia** | 文档集合、路由状态、主题配置 |
| 文档引擎 | **md-editor-v3 7** | 源码编辑、分屏对照、纯阅览、语法高亮 |
| 存储 | **SQLite**（`@tauri-apps/plugin-sql`）| 单文件 `data.db`，WAL 模式 |
| 构建 | **Vite 8 / pnpm / Cargo** | 前端打包与 Rust 编译 |
| 打包 | **NSIS**（Tauri Bundler） | 免提权安装包 |

---

## 4. 环境前置要求

| 依赖 | 版本 | 说明 |
| --- | --- | --- |
| **Node.js** | ≥ 20 | 建议 20 LTS 或更高 |
| **pnpm** | ≥ 9 | 仓库使用 pnpm（`pnpm-lock.yaml`） |
| **Rust** | stable ≥ 1.77 | 本工程使用 **`x86_64-pc-windows-gnu`** 目标 |
| **MinGW-w64** | x86_64 | Rust 的 gnu 目标用它做链接器与资源编译器 |
| **WebView2** | Windows 10/11 | Win11 自带；Win10 由安装包自动引导安装 |

### 4.1 安装 Rust 与 MinGW（Windows）

```powershell
# 1) 安装 rustup + gnu 工具链
winget install Rustlang.Rustup
rustup default stable-x86_64-pc-windows-gnu
rustc -vV            # 确认 host: x86_64-pc-windows-gnu

# 2) 安装 MinGW-w64（任选其一）
winget install BrechtSanders.WinLibs.POSIX.UCRT
#   或使用 MSYS2 / Scoop 的 mingw-w64，装完把它的 bin 目录加入 PATH
```

### 4.2 配置 PATH 与链接器

把 MinGW 的 `bin` 目录加入 PATH（`gcc.exe`、`ar.exe`、`windres.exe` 都要能被找到），
然后在 `src-tauri/.cargo/config.toml` 里显式指定链接器（**路径按你的实际安装位置改**）：

```toml
[target.x86_64-pc-windows-gnu]
linker = "E:/DevTools/MinGw64/bin/gcc.exe"
ar     = "E:/DevTools/MinGw64/bin/ar.exe"
```

验证：

```powershell
gcc --version        # 能打印版本即可
windres --version
```

> **为什么用 gnu 而不是 msvc？** gnu 目标只依赖 MinGW，不必安装数 GB 的
> Visual Studio Build Tools。代价是要自己保证 MinGW 在 PATH 里。
> 若你更习惯 msvc，把 `rustup default` 换成 `stable-x86_64-pc-windows-msvc`
> 并装上 VS Build Tools 也能编译，但 `.cargo/config.toml` 里的 gnu 段要删掉。

### 4.3 WebView2

Windows 11 已内置。Windows 10 或精简系统请确认已安装
[WebView2 Runtime](https://developer.microsoft.com/microsoft-edge/webview2/)；
本工程的安装包已配置 `downloadBootstrapper`，会在安装时自动补齐。

---

## 5. 快速启动

### 5.1 安装依赖

```bash
git clone <your-repo-url> md-mis
cd md-mis
pnpm install
```

### 5.2 桌面端开发（推荐）

```bash
pnpm tauri dev
```

首次会编译整个 Rust 依赖树（数分钟），之后热更新只重编前端。

### 5.3 只调试前端（不启动桌面窗口）

前端可以在普通浏览器里跑，界面与查询都走真实 SQLite——开发服务器用
`node:sqlite` 打开 `.scratch/preview/data.db`，执行的是与桌面端**完全同一份**
`src-tauri/migrations/001_init.sql`：

```bash
# 可选：造一批演示数据
python tools/seed-demo.py --db .scratch/preview/data.db --force

pnpm dev             # http://127.0.0.1:1420
```

这条路径只适合调样式与交互；**导入/导出等系统对话框能力只在桌面端可用**，
界面会给出提示而不是报错。

### 5.4 类型检查与前端构建

```bash
pnpm typecheck       # vue-tsc --noEmit
pnpm build           # 类型检查 + vite 构建到 dist/
```

---

## 6. 项目架构树

```
md-mis/
├─ index.html                      # Vite 入口 HTML
├─ package.json / pnpm-lock.yaml   # 前端依赖与锁文件
├─ tsconfig.json                   # TS 严格模式配置
├─ vite.config.ts                  # 别名 @/、Tauri 端口 1420、SQL 预览插件接入
├─ .gitignore                      # 产物与本地缓存忽略规则
│
├─ src/                            # ── 前端（Vue 3 + TS）────────────────────
│  ├─ main.ts                      # 应用入口：Pinia 挂载、拖放兜底
│  ├─ App.vue                      # 外壳：导航轨 + 顶栏 + 视图切换 + 全局拖拽导入
│  ├─ components/
│  │  ├─ NavRail.vue               # 72px 图标导航轨（路由 / 计数徽标）
│  │  ├─ TitleBar.vue              # 无边框顶栏：拖拽区、搜索、明暗切换、窗口按钮
│  │  ├─ BentoCard.vue             # Bento 卡片容器
│  │  ├─ DocumentList.vue          # 文档列表（标题 / 分类 / 标签 / 相对时间）
│  │  └─ AppIcon.vue               # 内联 SVG 图标（不引图标字体，控体积）
│  ├─ views/
│  │  ├─ DashboardView.vue         # 仪表盘：拖拽导入 / 最近编辑 / 时间轴 / 统计
│  │  ├─ EditorView.vue            # 三态编辑区：保存 / 导出 / 主题下拉
│  │  ├─ DocumentsView.vue         # 全部文档
│  │  ├─ CategoriesView.vue        # 多级分类树 + 筛选
│  │  ├─ TimelineView.vue          # 年 / 月时间轴流
│  │  ├─ TrashView.vue             # 废纸篓：还原 / 彻底删除
│  │  └─ SettingsView.vue          # 明暗、字号、排版/代码主题、库信息、全库导出
│  ├─ stores/
│  │  ├─ documents.ts              # 文档集合、筛选、分类树、时间轴、CRUD 动作
│  │  └─ settings.ts               # 主题 / 视图模式 / 字号，持久化到 user_settings
│  ├─ db/
│  │  ├─ index.ts                  # SQL 层：PRAGMA 调优 + 全部增删改查
│  │  └─ transport.ts              # 「谁来执行 SQL」：桌面 plugin-sql / 浏览器预览
│  ├─ lib/
│  │  ├─ time.ts                   # SQLite 时间解析、相对时间、周起点
│  │  ├─ themes.ts                 # 排版主题与代码主题清单、强调色映射
│  │  └─ icons.ts                  # 图标路径表
│  └─ styles/theme.css             # 主题体系：镜像 md-editor-v3 的 --md-* 变量
│
├─ src-tauri/                      # ── 后端（Rust / Tauri v2）────────────────
│  ├─ Cargo.toml                   # crate 名 md-mis，bin 名 Md-Mis
│  ├─ build.rs                     # tauri-build
│  ├─ .cargo/config.toml           # gnu 目标的 gcc / ar 链接器
│  ├─ tauri.conf.json              # 窗口、appDirectoriesOverride、CSP、打包配置
│  ├─ capabilities/default.json    # 最小权限集（窗口控制 / 对话框 / fs / sql）
│  ├─ migrations/
│  │  └─ 001_init.sql              # documents / user_settings 表与索引
│  └─ src/
│     ├─ main.rs                   # 二进制入口，调用 lib::run()
│     └─ lib.rs                    # 数据目录解析、旧库收养、失败弹窗、插件装配
│
├─ docs/
│  └─ PACKAGING.md                 # ★ 打包与版本升级实操规范
│
└─ tools/                          # 开发 / 校验脚本（见下表）
```

### 6.1 前后端职责边界

| 关注点 | 归属 | 说明 |
| --- | --- | --- |
| 数据库文件位置 | Rust (`lib.rs`) | `get_app_data_path` / `db_connection_url`，前端只消费 |
| 表结构与迁移 | Rust (`migrations/*.sql`) | 连接建立时由 sqlx 执行 |
| SQL 语句本身 | 前端 (`src/db/index.ts`) | 全部使用 `$1` 占位符，不做字符串拼接 |
| 性能 PRAGMA | 前端 (`src/db/index.ts`) | `journal_mode=WAL`、`synchronous`、`busy_timeout` |
| 启动失败反馈 | Rust (`lib.rs`) | 弹 `MessageBoxW` + 写 `data/startup.log` |
| 文件导入/导出 | 前端 + Tauri 插件 | `plugin-fs` 读文本、`plugin-dialog` 选路径 |

### 6.2 tools/ 脚本

| 脚本 | 用途 |
| --- | --- |
| `clean-workspace.ps1` | 一键剥离非源码产物（体积瘦身） |
| `check-deps.ps1` | 核对 exe 的非系统 DLL 依赖是否齐备 |
| `verify-db.py` | 数据层校验：表结构 / CRUD / WAL / 索引（23 项） |
| `verify-e2e.mjs` | 端到端校验：驱动界面做写操作再读 SQLite 断言（13 项） |
| `inspect-db.mjs` | 打印某个 `data.db` 的内容概览 |
| `seed-demo.py` | 造演示数据 |
| `cdp-shot.mjs` | 通过 CDP 驱动界面逐屏截图 |
| `verify-app.ps1` | 「启动 → 建库 → 结构校验 → 截图」全流程冒烟 |
| `make-icon.py` | 生成应用图标源图 |
| `tauri.ps1` / `cargo.ps1` / `rust-env.ps1` | 封装构建命令（含受限环境适配） |

---

## 7. 打包构建

```bash
# 只出便携版二进制
pnpm tauri build --no-bundle

# 出便携版 + NSIS 安装包（推荐发布用）
pnpm tauri build
```

产物：

| 形态 | 路径 | 说明 |
| --- | --- | --- |
| 便携版 | `src-tauri/target/release/Md-Mis.exe` | 与 `WebView2Loader.dll` 一起分发 |
| 安装包 | `src-tauri/target/release/bundle/nsis/Md-Mis_<版本>_x64-setup.exe` | 免提权、可选安装路径 |

打包前的自检：

```powershell
pwsh -File tools/check-deps.ps1      # 非系统 DLL 依赖是否齐备
```

> **详细规范见 [docs/PACKAGING.md](docs/PACKAGING.md)**：MinGW 依赖 DLL 的实测结论与
> `bundle.resources` 配置法、WebView2 四种引导模式、`installMode` 与自定义安装路径、
> 以及「只带二进制、不打包 `data.db`」的升级防覆盖流程和 Migration 写法约束。

---

## 8. 数据模型与存储

数据库固定在 **可执行文件同级的 `data/data.db`**（由 `appDirectoriesOverride` 决定），
首次运行时自动创建：

```
<安装目录>/
├─ Md-Mis.exe
├─ WebView2Loader.dll
└─ data/
   ├─ data.db               用户笔记（SQLite）
   ├─ data.db-wal / -shm    WAL 日志
   ├─ startup.log           启动日志（出问题先看它）
   └─ EBWebView/            WebView2 运行时缓存（可删，会重建）
```

```sql
CREATE TABLE IF NOT EXISTS documents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    raw_content TEXT NOT NULL,
    category TEXT DEFAULT '未分类',      -- 用「父级/子级」表达层级
    tags TEXT,                          -- 英文逗号分隔
    is_archived INTEGER DEFAULT 0,      -- 0 正常 / 1 归档（软删除）
    created_at DATETIME DEFAULT (datetime('now', 'localtime')),
    updated_at DATETIME DEFAULT (datetime('now', 'localtime'))
);
CREATE INDEX IF NOT EXISTS idx_docs_created  ON documents(created_at);
CREATE INDEX IF NOT EXISTS idx_docs_category ON documents(category);

CREATE TABLE IF NOT EXISTS user_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
```

连接建立后依次执行：`journal_mode = WAL`、`synchronous = NORMAL`、
`foreign_keys = ON`、`busy_timeout = 5000`。

**备份方式**：直接复制整个 `data/` 目录；或在「系统设置 → 备份 / 全库导出」把每篇
文档导出成独立的 `.md` 文件。

---

## 9. 常用命令与分支约定

### 9.1 命令

| 命令 | 作用 |
| --- | --- |
| `pnpm install` | 安装依赖 |
| `pnpm tauri dev` | 桌面端开发（热更新） |
| `pnpm dev` | 仅前端（浏览器调试，走预览数据库） |
| `pnpm typecheck` | `vue-tsc --noEmit` |
| `pnpm build` | 类型检查 + 前端构建 |
| `pnpm tauri build` | 出便携版 + NSIS 安装包 |
| `pnpm tauri build --no-bundle` | 只出便携版二进制 |
| `pwsh -File tools/clean-workspace.ps1 -DryRun` | 预览瘦身会删什么 |
| `pwsh -File tools/check-deps.ps1` | 核对 DLL 依赖 |

### 9.2 分支与提交约定

```
main          稳定可发布分支，只接受经过构建验证的合并
feat/<name>   功能分支，如 feat/tag-filter
fix/<name>    缺陷修复，如 fix/editor-title-commit
docs/<name>   仅文档改动
```

提交信息采用 `type(scope): subject` 形式，例如：

```
feat(editor): 支持 Ctrl+S 时刷新相对时间
fix(db): 修正分类计数只统计一级分类的问题
docs(packaging): 补充 WebView2 离线安装模式
```

合入 `main` 前请确认：`pnpm build` 通过、`tools/check-deps.ps1` 全绿、
并且安装包内不含 `data.db`。

---

## 10. 常见问题（FAQ）

| 现象 | 根因 | 处理 |
| --- | --- | --- |
| `pnpm tauri dev` 报找不到 `gcc` / `windres` | MinGW 不在 PATH | 把 `MinGW64\bin` 加入 PATH，或检查 `src-tauri/.cargo/config.toml` |
| 编译报 `error: export ordinal too large` | `crate-type` 里带了 `cdylib` | 保持 `crate-type = ["rlib"]` |
| 双击 exe 没反应 | 启动期失败但旧版静默 panic | 看 `<安装目录>/data/startup.log`；现在会同时弹错误框 |
| 报 `拒绝访问 (os error 5)` | 程序所在目录不可写，建不了 `data/` | 放到用户可写目录，别塞进 `C:\Program Files` |
| 新机器报 `0xC0000135` | 便携版缺 `WebView2Loader.dll` | 与 exe 一起复制；用 `tools/check-deps.ps1` 核实 |
| 白屏 / WebView2 初始化失败 | 系统缺 WebView2 运行时 | 安装 [WebView2 Runtime](https://developer.microsoft.com/microsoft-edge/webview2/) |
| 从资源管理器拖入文件出现禁止图标 | 程序以管理员身份运行，UIPI 拦截了拖放 | 用普通权限启动（安装包已是免提权模式） |
| 升级后笔记不见了 | `data/` 被整体覆盖或删除 | 从备份恢复；升级只替换程序文件 |
| 打包卡在下载 NSIS | 直连 GitHub 超时 | 设 `TAURI_BUNDLER_TOOLS_GITHUB_MIRROR` 镜像后再打包 |

更多打包与升级细节（含 Migration 怎么写、发布前检查清单）见
**[docs/PACKAGING.md](docs/PACKAGING.md)**。

---

<div align="center">

**用着顺手，就记下来。**

</div>
