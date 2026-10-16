# Md-Mis · 本地 Markdown 文档管理系统

Tauri v2 外壳 + Vue 3 界面 + SQLite 单文件存储的桌面应用（原 `local-dms` / `Desktop-markdown-MIS`）。
全部数据落在本机，不依赖任何服务端。

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

## 数据存放：便携绿色版

**所有应用目录都放在程序同级的 `data/` 下**，不写 `%APPDATA%` / `%LOCALAPPDATA%`：

```
<安装目录>/
├─ Md-Mis.exe
├─ WebView2Loader.dll
├─ uninstall.exe
└─ data/                     ← 首次运行自动生成
   ├─ data.db                用户笔记（SQLite）
   ├─ data.db-wal / -shm     WAL 日志
   ├─ startup.log            启动日志（出问题先看这里）
   └─ EBWebView/             WebView2 运行时缓存（可删，会重建）
```

实现方式是 `tauri.conf.json` 的 `app > appDirectoriesOverride: "data"`：Tauri 会把
`app_config_dir` / `app_data_dir` / `app_local_data_dir` / `app_cache_dir` / `app_log_dir`
全部解析到**可执行文件所在目录**下的 `data/`。这同时解决了两件事：

1. 数据库落在用户自己的程序目录里，整个文件夹拷走即可迁移；
2. WebView2 的缓存目录也不再依赖 `%LOCALAPPDATA%` 的可写性——这正是旧版
   「只能以管理员身份启动」的根因（见下文缺陷 1）。

> ⚠️ 因为路径是相对可执行文件的，程序必须装在**当前用户可写**的位置。安装包已配置
> `installMode: "currentUser"`（装到 `%LOCALAPPDATA%\Programs\Md-Mis`，免 UAC），
> 因此这条前提总是成立。若强行装到 `C:\Program Files` 这类只读位置，应用目录会创建失败
> ——此时会弹窗提示并把原因写进 `data/startup.log`，不会再静默退出。

## 升级与数据保护

- **只替换程序文件，绝不动 `data/`。** 便携版升级方式：覆盖 `Md-Mis.exe` 与
  `WebView2Loader.dll` 等同级运行时文件即可；`data/` 目录必须原样保留。
- **发布包不含任何数据库文件**：安装包只包含 `Md-Mis.exe`、`uninstall.exe`、
  `WebView2Loader.dll`，`data/` 由程序首次运行时生成（已实测核对）。
- **表结构只增不改**：所有变更通过新增 Migration（`src-tauri/migrations/002_*.sql`）实现，
  严禁 `DROP TABLE`。SQLite 迁移记录在 `_sqlx_migrations` 表中，版本号递增即可。
- **旧版本数据自动收养**：旧版把库放在 `%APPDATA%\com.localdms.desktop\data.db`。
  新版首次启动时，如果 `data/data.db` 尚不存在或为空，会**复制**（不是移动、不删除旧文件）
  旧库过来，并把这件事写进 `startup.log`。已实测：用户的 2 篇笔记与全部设置完整迁移。

## 技术栈

| 层 | 选型 | 说明 |
| --- | --- | --- |
| 应用底座 | Tauri v2 | 原生文件系统、系统对话框、无边框窗口 |
| 界面 | Vue 3 + TypeScript + Pinia | 组合式 API，Pinia 管理文档与配置状态 |
| 文档引擎 | md-editor-v3 7 | 源码编辑、分屏对照、纯阅览、语法高亮、导出 |
| 存储 | SQLite（`@tauri-apps/plugin-sql`） | 单文件 `data/data.db`，WAL 模式 |

产物：`src-tauri/target/release/Md-Mis.exe`（约 5.5 MB），安装包
`src-tauri/target/release/bundle/nsis/Md-Mis_0.1.0_x64-setup.exe`（约 2.6 MB）。

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
│  ├─ src/lib.rs              数据目录解析、旧库收养、失败弹窗、插件装配、migration 注册
│  ├─ migrations/001_init.sql 表结构与索引
│  ├─ capabilities/default.json  最小权限集合
│  └─ tauri.conf.json         无边框窗口、appDirectoriesOverride、CSP、打包配置
├─ tools/                     构建与校验脚本（见文末）
└─ shots/                     界面截图
```

## 快速开始

前置：Node.js ≥ 20、pnpm、Rust 稳定版工具链（本机为 `x86_64-pc-windows-gnu` + MinGW64）。

```bash
pnpm install
pnpm tauri dev        # 开发
pnpm tauri build      # 出 exe + NSIS 安装包
pnpm build            # 仅构建前端（含 vue-tsc 类型检查）
```

## 数据模型

`data/data.db`，由 Rust 侧 migration 在首次建立连接时自动创建：

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
`font_size` 存入 `user_settings`。「分类目录」的层级来自 `category` 里的 `/` 路径，
因此多级归类不需要额外的表。

## 主题体系

- 深色为主色，容器背景对齐 md-editor-v3 的 `--md-bk-color`，深色下边框统一
  `rgba(255,255,255,0.06)` 的 1px 微发光描边。
- `src/styles/theme.css` 在 `.app-shell` 上镜像了 md-editor-v3 在
  `.md-editor` / `.md-editor[data-theme=dark]` 中声明的整套 `--md-*` 变量。md-editor-v3 只在
  编辑器根节点上声明这些变量，而导航轨、卡片、顶栏位于编辑器之外，镜像取值让外壳与
  编辑器共用同一份调色板。
- 强调色绑定：`--md-theme-color` 由 Pinia 依据当前排版主题写到 `.app-shell`，导航轨激活项、
  选中项、按钮高亮、拖拽高光全部引用它。
- 排版主题复用 md-editor-v3 内置的 default / github / vuepress / mk-cute / smart-blue /
  cyanosis；代码高亮复用 atom / github / stackoverflow / a11y / monokai / vs / xcode / dracula。
- 三态切换：纯阅览用 `MdPreview`，双模式 / 纯源码用 `MdEditor`。md-editor-v3 的 `preview`
  属性只在挂载时生效，运行期切换走组件暴露的 `togglePreview()`，避免整块重挂载丢掉撤销历史。

## 安全与权限

`src-tauri/capabilities/default.json` 只授予实际用到的能力：无边框窗口控制、系统对话框、
本地 SQLite，以及文本文件的读写。

- 读取使用 `**` 通配：拖拽导入时文件路径在拖拽发生前无法预知。
- 写入同样放开：导出目标由用户在系统对话框中选定。
- 安装包为**当前用户安装（免提权）**，`RequestExecutionLevel user`。

## 缺陷修复记录（对照《迭代升级与待修复问题清单》）

### 1. 启动权限异常：只能以管理员模式启动 ✅

**实际根因**与清单里的推测略有不同，实测结论：

- `%APPDATA%` / `%LOCALAPPDATA%\com.localdms.desktop` 确实是问题所在——Tauri 在创建
  WebView2 之前会对 `app_local_data_dir()` 调用 `create_dir_all`
  （`tauri/src/manager/webview.rs:574`），目录不可写就抛
  `拒绝访问 (os error 5)` 并在 `setup()` 里 panic。
- **但这不是「历史目录权限」造成的**：即使在全新的目录、以普通用户身份，`%LOCALAPPDATA%`
  下建目录失败同样会崩。清单里说的「取消勾选以管理员身份运行」也核对过——
  `HKCU\...\AppCompatFlags\Layers` 中**没有**该程序的 `RUNASADMIN` 标记。

**修复方式（治本）**：不再往 `%APPDATA%` / `%LOCALAPPDATA%` 写任何东西。
`appDirectoriesOverride: "data"` 让所有应用目录都落到程序同级的 `data/`，
WebView2 缓存也在其中，于是这条失败路径从根本上消失。

**修复方式（可诊断）**：初始化失败不再静默。Rust 侧 `fatal()` / panic hook 会
① 把原因写入 `data/startup.log`，② 弹出 `MessageBoxW` 错误对话框。

实测（把程序放在工作区内、以标准权限启动）：`data/` 正常生成，错误从
`拒绝访问 (os error 5)` 变成 WebView2 自身的错误。

### 2. 文件拖拽导入被系统禁止拦截 ✅

现象里的「圆圈斜杠」是 Windows **UIPI**：程序以管理员身份运行时，标准权限的
`explorer.exe` 发出的拖放消息会被内核拦下。**根因就是缺陷 1**——一旦不再以管理员启动，
拖放即可用。

核对清单里的三条：

- 前端 `@dragover`：本应用走的是 Tauri **原生**拖放（`dragDropEnabled: true`），
  拿到的是文件绝对路径，HTML5 拖放事件根本不会到达页面，因此不存在「漏写
  `preventDefault`」的问题。另外在 `src/main.ts` 里补了一层全局兜底：
  对 `dragover` / `drop` 调用 `preventDefault()`，防止极端情况下 WebView 直接导航到
  被拖入的文件而丢掉整个应用状态。
- 窗口配置：`dragDropEnabled: true`（已确认）。

### 3. 项目全局更名 ✅

| 位置 | 值 |
| --- | --- |
| `tauri.conf.json` → `productName` | `Md-Mis` |
| `tauri.conf.json` → `app.windows[0].title` | `Md-Mis` |
| `tauri.conf.json` → `identifier` | `com.mdmis.desktop` |
| `Cargo.toml` → `[package].name` | `md-mis` |
| `Cargo.toml` → `default-run` / `[[bin]].name` | `Md-Mis` |
| `package.json` → `name` | `md-mis` |

产物实测为 **`Md-Mis.exe`**（通过 `[[bin]] name` 直接指定，不是事后改名）。
界面标题栏的品牌名与 `index.html` 标题同步更新。

### 4. 数据存储迁移到本地 `data/` ✅

- Rust 侧 `get_app_data_path()` 返回 `<exe>/data/data.db` 绝对路径，
  `db_connection_url()` 返回供 plugin-sql 使用的连接串。
- 前端 `src/db/index.ts` 先 `invoke('db_connection_url')`，再
  `Database.load(url, { autoCreate: false })`。
  连接串必须与 `add_migrations` 注册时的键完全一致，否则 migration 不会执行——
  所以两端共用同一个 Rust 函数生成。
- `autoCreate: false` 还有一个作用：让 plugin-sql 跳过它对
  `%APPDATA%` 应用目录的 `create_dir_all`（缺陷 1 的另一条路径）。
- 开发预览模式（`tools/vite-sql-preview.mjs`）继续用 `.scratch/preview/data.db`，互不影响。

### 5. 版本迭代升级数据防丢失 ✅

见上文「升级与数据保护」：发布包不含 `data.db`（已核对安装结果）、只用新增 Migration、
升级只替换程序文件。**额外做了旧库自动收养**，避免这次迁移本身造成数据丢失——
实测把用户的 2 篇笔记与设置完整复制到了 `data/data.db`。

### 6. 打包规范重构与依赖 DLL 补全 ✅（结论与清单推测不同）

用 `objdump -p` 读导入表实测：

```
导入表共 27 个 DLL，其中非系统依赖 1 个：WebView2Loader.dll
libgcc_s_seh-1.dll  被引用: False
libwinpthread-1.dll 被引用: False
```

也就是说 `x86_64-pc-windows-gnu` 产物**已经把 libgcc / libwinpthread 静态链接进去了**，
新机器上报 `0xC0000135` 缺的不是 MinGW 运行库，而是 **`WebView2Loader.dll`**——
它默认只躺在 `target/release/` 里，手动只拷 `.exe` 就会缺。

处理方式：

- **不**引入 `extra_bins/`。实测给 `bundle.resources` 加这份 DLL 会让生成的
  `installer.nsi` 出现两行同名的 `File /oname=WebView2Loader.dll`（Tauri 本来就会自动包含），
  属于重复打包，已移除。
- 安装包实测包含：`Md-Mis.exe`、`uninstall.exe`、`WebView2Loader.dll`。
- 新增 `tools/check-deps.ps1`：任何一次构建后都能用它核对非系统 DLL 依赖是否齐备，
  便携版分发前跑一遍即可。
- 统一用 `pnpm tauri build` 产出 NSIS 安装包，不再手动拷 release 目录。

### 7. 全新机器 WebView2 引导 ✅

`bundle.windows.webviewInstallMode: { "type": "downloadBootstrapper" }`。

生成的 `installer.nsi` 中已确认对应分支：

```
Section WebView2
  ReadRegStr $4 ... "SOFTWARE\...\EdgeUpdate\Clients\{...}" "pv"
  ${If} $4 == ""
    !if "${INSTALLWEBVIEW2MODE}" == "downloadBootstrapper"
      NSISdl::download "https://go.microsoft.com/fwlink/p/?LinkId=2124703" ...
```

即：先查注册表，没装才下载引导程序；纯离线内网环境改成
`offlineInstaller` 并补齐离线包即可。

### 8. 安装包支持自定义安装路径 ✅

`bundle.windows.nsis.installMode: "currentUser"` + `displayLanguageSelector: false`。
生成的 `installer.nsi` 中已确认：

```
!define INSTALLMODE "currentUser"
RequestExecutionLevel user          ← 免提权
!insertmacro MUI_PAGE_DIRECTORY     ← 安装向导含目录选择页
```

实测：用 `/S /D=<自定义目录>` 静默安装成功，文件落在指定目录，无 UAC 提权。

## 校验

### 真实桌面程序端到端校验（13/13 通过）

```powershell
# 1) 以标准权限启动已编译的 Md-Mis.exe，并用 WebView2 调试端口暴露页面
#    $env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = '--remote-debugging-port=9223'
# 2) 用 CDP 驱动真实界面做写操作，再直接读 SQLite 文件断言
$env:CDP_ENDPOINT = 'http://127.0.0.1:9223'
node tools/verify-e2e.mjs "http://tauri.localhost/" "<安装目录>/data/data.db"
```

这一轮跑在**真正的 Tauri 窗口 + 真正的 tauri-plugin-sql + 真正的 data/data.db** 上：

| 断言 | 观测值 |
| --- | --- |
| 数据库以 WAL 模式打开，`-wal` 文件存在 | `wal` |
| 修改分类 / 标签 / 标题写回 SQLite | 三项均落库 |
| 保存（Ctrl+S 路径）刷新 `updated_at` | `22:08:33` → `22:08:34` |
| 保存不改动 `created_at` | 保持不变 |
| 归档写入 `is_archived = 1`（软删除，行数不变） | 通过 |
| 废纸篓还原写入 `is_archived = 0` | 通过 |
| 主题切换 → `user_settings` UPSERT | 通过 |

### 数据层

```bash
python tools/verify-db.py --scratch          # 结构与 CRUD 套件（23 项）
python tools/verify-db.py --db <data.db>     # 校验真实落盘的库（只读）
node   tools/inspect-db.mjs <data.db>        # 库内容概览
```

23/23 通过，含：表/字段/默认值与规范一致、`journal_mode = wal`、INSERT/UPDATE/软删除/
还原/DELETE 往返、`user_settings` 主键 UPSERT、以及索引确实被使用
（`SCAN documents USING INDEX idx_docs_created`、`SEARCH documents USING INDEX idx_docs_category`）。

### 打包与依赖

```powershell
pwsh -File tools/check-deps.ps1              # 核对非系统 DLL 依赖
```

### 界面

`shots/desktop/` 下的 10 张截图由上述真实桌面程序（CDP 驱动）生成；
`shots/app-01-dashboard.png` 是直接抓屏得到的真实窗口。

## 沙箱适配（仅本机受限环境需要）

本机使用**系统安装的 Rust**（`E:\DevTools\Rust_JDK`，rustup，`x86_64-pc-windows-gnu`），
但受限进程只能写工作区，因此：

- `tools/rust-env.ps1`：把 `RUSTUP_HOME` 指回系统目录（只读定位 toolchain），
  `CARGO_HOME` 指到工作区内的 `.cargo-home/`（registry 缓存与 `config.toml`）。
- `tools/crates-proxy.mjs`：受限进程拿不到 Schannel 凭据（`SEC_E_NO_CREDENTIALS`），
  Cargo 的 HTTPS 会失败。该代理在 `127.0.0.1:8791` 用 Node 的 TLS 终结 HTTPS，
  把 crates.io 的 sparse 索引与 `.crate` 下载转成明文 HTTP。
- `tools/dsh-build-shim.mjs`：沙箱禁止管道式子进程（`stdio: 'pipe'` → EPERM），
  而 Vite 会执行一次 `exec('net use')`。垫片让那次针对 cwd 的探测抛 `EISDIR`，
  Vite 便走它自己的回退分支并跳过 shell 探测。

打包 NSIS 额外需要：

- GitHub 直连容易超时，可先用镜像：`$env:TAURI_BUNDLER_TOOLS_GITHUB_MIRROR = 'https://ghfast.top/https://github.com'`
- Tauri 会把 NSIS 工具链解压到 `%LOCALAPPDATA%\tauri`，工作区之外，首次打包需要放宽文件访问；
  缓存建立后再打包就不需要了。
- 工具链装好后 `.rust/` 与 `tools/fetch-rust.ps1`、`tools/download-rust.mjs` 均已删除。
  `tools/download-files.mjs` 保留，作为通用的 Node 下载器（带镜像回退）。

### 本机命令

```powershell
node tools/crates-proxy.mjs                        # crates 代理（构建前保持运行）
pwsh -File tools/tauri.ps1 build --no-bundle       # 只出 exe
pwsh -File tools/tauri.ps1 build                   # 出 exe + NSIS 安装包
pwsh -File tools/cargo.ps1 check                   # 直接跑 cargo
```

## tools/ 一览

| 脚本 | 用途 |
| --- | --- |
| `tauri.ps1` / `cargo.ps1` / `rust-env.ps1` | 用系统 Rust + 沙箱适配环境构建 |
| `crates-proxy.mjs` | loopback crates.io 代理（绕过 Schannel 限制） |
| `dsh-build-shim.mjs` | 让 Vite 跳过 `net use` 探测 |
| `vite-sql-preview.mjs` | `pnpm dev` 时用 node:sqlite 提供真实 SQLite 后端 |
| `verify-db.py` | 结构 / CRUD / WAL / 索引校验（23 项） |
| `verify-e2e.mjs` | CDP 驱动界面做写操作，再读 SQLite 断言（13 项） |
| `inspect-db.mjs` | 打印某个 data.db 的内容概览 |
| `check-deps.ps1` | 核对 exe 的非系统 DLL 依赖 |
| `seed-demo.py` | 造演示数据 |
| `cdp-shot.mjs` | 驱动界面逐屏截图 |
| `ui-probe.ps1` | 截取窗口 / 在窗口内点击 |
| `verify-app.ps1` | 启动 → 建库 → 造数 → 截图 的全流程（需在沙箱外）|
| `make-icon.py` | 生成应用图标源图 |
| `download-files.mjs` | 通用 Node 下载器（带镜像回退） |
