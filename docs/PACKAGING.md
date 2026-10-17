# Md-Mis 打包与版本升级实操规范

面向开发与运维团队。目标是把 Windows 下的打包陷阱、WebView2 依赖、安装权限与
**升级不丢数据**这四件事一次讲清。

- 工程目录：仓库根目录
- 架构底座：Tauri v2 + Vue 3 + TypeScript + SQLite
- 本机实测环境：Windows 11 / `x86_64-pc-windows-gnu` / MinGW64 (`E:\DevTools\MinGw64`)

> 本文中标注「实测」的结论都有对应的命令输出；标注「预期」的是通用行为说明。

---

## 0. 一页速查

```powershell
pnpm install                         # 恢复依赖
pnpm tauri dev                       # 开发（热更新）

pnpm tauri build --no-bundle         # 只出便携版二进制
pnpm tauri build                     # 出便携版 + NSIS 安装包
```

| 产物 | 路径 |
| --- | --- |
| 便携版可执行文件 | `src-tauri/target/release/Md-Mis.exe` |
| 便携版必需的运行时 DLL | `src-tauri/target/release/WebView2Loader.dll` |
| NSIS 安装包 | `src-tauri/target/release/bundle/nsis/Md-Mis_<版本>_x64-setup.exe` |

**发布铁律：只带二进制，`data/` 一律不带。** 用户笔记存在程序同级的 `data/` 里，
升级时绝不能覆盖或删除。

---

## 1. 标准构建流程

### 1.1 前置检查

逐项确认，任何一项不满足都会在编译或打包阶段炸掉：

```powershell
node -v            # 需要 >= 20
pnpm -v            # 需要 >= 9
rustc -vV          # 确认 host 是 x86_64-pc-windows-gnu
gcc --version      # MinGW64 必须在 PATH（Rust 的 gnu 目标用它做链接器）
```

也可以在仓库里直接用封装脚本（它会替你设好环境变量）：

```powershell
pwsh -File tools/tauri.ps1 build --no-bundle
```

需要额外确认的三点：

1. **MinGW 架构必须是 x86_64，且与 Rust 的 gnu 目标一致。** 本机用的是
   `E:\DevTools\MinGw64`（x86_64-ucrt-posix-seh）。链接器配置在
   `src-tauri/.cargo/config.toml`：

   ```toml
   [target.x86_64-pc-windows-gnu]
   linker = "E:/DevTools/MinGw64/bin/gcc.exe"
   ar     = "E:/DevTools/MinGw64/bin/ar.exe"
   ```

2. **`windres` 要在 PATH 里。** `tauri-build` 用它把图标与清单编进 exe；找不到会报
   `failed to compile resources`。

3. **别把 `cdylib` 加回 `crate-type`。** 在 windows-gnu 下链接 cdylib 时，MinGW 的自动
   导出机制会因 Rust 静态库符号过多而直接失败：

   ```
   ld.exe: error: export ordinal too large: 66252
   ```

   `src-tauri/Cargo.toml` 里已收窄为 `crate-type = ["rlib"]`（`staticlib`/`cdylib`
   只有移动端才需要）。

### 1.2 构建命令

```powershell
# 完整发布（前端类型检查 → vite 构建 → cargo 编译 → NSIS 打包）
pnpm tauri build

# 只要二进制，不要安装包（做便携版 / 快速验证时用）
pnpm tauri build --no-bundle
```

`pnpm tauri build` 会自动执行 `tauri.conf.json` 里的 `beforeBuildCommand`（即
`pnpm build`，内部先跑 `vue-tsc --noEmit`）。**类型检查失败就不会产出安装包**，
这是有意的——别绕过它。

### 1.3 产物路径与两种分发形态

**A. NSIS 单文件安装包（推荐给普通用户）**

```
src-tauri/target/release/bundle/nsis/Md-Mis_0.1.0_x64-setup.exe
```

实测约 2.6 MB。装完后目录结构：

```
%LOCALAPPDATA%\Programs\Md-Mis\
├─ Md-Mis.exe
├─ uninstall.exe
├─ WebView2Loader.dll
└─ data\                 ← 首次运行生成，升级时不会动
```

**B. 绿色免安装便携版（Portable）**

`--no-bundle` 之后，从 `src-tauri/target/release/` 里取这几样，放进一个文件夹即可分发：

```
Md-Mis-portable\
├─ Md-Mis.exe            5.5 MB 左右
└─ WebView2Loader.dll    必需，缺了会报 0xC0000135
```

> `data/` 目录**不要**放进去。首次双击运行时，程序会在自己旁边创建 `data/`
> 并初始化数据库。

实测：便携版在同一台机器上双击即可运行；用户笔记与 WebView2 缓存都落在
`<便携目录>/data/`，整个文件夹拷走就能换机器。

### 1.4 构建后的自检

```powershell
pwsh -File tools/check-deps.ps1
```

输出示例（实测）：

```
可执行文件：src-tauri\target\release\Md-Mis.exe
导入表共 27 个 DLL，其中非系统依赖 1 个。

  [OK]   WebView2Loader.dll           -> src-tauri\target\release\WebView2Loader.dll

结论：所有非系统依赖都能随包找到，可以分发。
```

再核对一眼安装包里没有数据库：

```powershell
# 静默装到临时目录后看内容（可选）
$setup = 'src-tauri\target\release\bundle\nsis\Md-Mis_0.1.0_x64-setup.exe'
& $setup /S /D="$PWD\.scratch\installed"
Get-ChildItem .scratch\installed -Recurse
```

---

## 2. MinGW (GNU ABI) 依赖动态库完整性

### 2.1 先测再补：本项目实测结论

流传很广的说法是「gnu 目标编译出来的 exe 到新机器会缺 `libgcc_s_seh-1.dll` /
`libwinpthread-1.dll`」。**在这个工程里实测并不是这样。**

用 `objdump` 读 exe 的导入表（`tools/check-deps.ps1` 做的就是这件事）：

```
非系统依赖：WebView2Loader.dll
libgcc_s_seh-1.dll   被引用: False
libwinpthread-1.dll  被引用: False
libstdc++-6.dll      被引用: False
```

原因在链接命令行里就能看到——Rust 的 windows-gnu 目标默认静态链接了这些运行时：

```
-lgcc  -l:libpthread.a  -lmingwex  -lmsvcrt
```

所以本工程的 `0xC0000135`（STATUS_DLL_NOT_FOUND）**根因不是 MinGW 运行库，
而是 `WebView2Loader.dll`**：它由 wry 动态加载，默认只躺在 `target/release/` 里。
手动只拷 `Md-Mis.exe` 出去，就一定会缺。

> 结论：便携版分发必须带上 `WebView2Loader.dll`；NSIS 安装包由 Tauri 自动包含它
> （见 2.4 的实测证据），无需额外配置。

### 2.2 通用排查方法

换环境、换工具链之后，先跑一次：

```powershell
pwsh -File tools/check-deps.ps1
```

它会把导入表里所有非系统 DLL 列出来，并逐个在 `target/release`、`extra_bins`、
`System32` 中查找；有缺失就返回非 0 并给出文件名。

### 2.3 确实缺 DLL 时：用 `bundle.resources` 随包分发

如果（例如换了 MSYS2 UCRT 工具链、或某些依赖改用了动态运行时）`check-deps.ps1`
真的报出缺 `libgcc_s_seh-1.dll` / `libwinpthread-1.dll`，就按下面做：

**第一步**，把这些 DLL 归档到仓库里的固定目录：

```
extra_bins\
├─ libgcc_s_seh-1.dll
└─ libwinpthread-1.dll
```

来源就是 MinGW 的 `bin` 目录：

```powershell
New-Item -ItemType Directory -Force extra_bins | Out-Null
Copy-Item E:\DevTools\MinGw64\bin\libgcc_s_seh-1.dll  extra_bins\ -Force
Copy-Item E:\DevTools\MinGw64\bin\libwinpthread-1.dll extra_bins\ -Force
```

> `extra_bins/` 必须入库（`.gitignore` 里已明确不忽略它）。

**第二步**，在 `src-tauri/tauri.conf.json` 的 `bundle` 下登记资源映射：

```json
{
  "bundle": {
    "resources": {
      "../extra_bins/libgcc_s_seh-1.dll": "libgcc_s_seh-1.dll",
      "../extra_bins/libwinpthread-1.dll": "libwinpthread-1.dll"
    }
  }
}
```

键是相对 `src-tauri/` 的源路径，值（字符串）是安装目录里的目标文件名。
重新 `pnpm tauri build` 后，安装包会把它们放进安装目录。

**第三步**，再跑一次 `tools/check-deps.ps1` 确认全部 `[OK]`。

### 2.4 不要重复打包 Tauri 已经处理的东西

同一个文件名如果在 `bundle.resources` 里登记一次、Tauri 又自动包含一次，生成的
`installer.nsi` 会出现两条同名 `File` 指令。实测把 `WebView2Loader.dll` 加进
`bundle.resources` 后就是这样：

```nsi
File /a "/oname=WebView2Loader.dll" "...\extra_bins\WebView2Loader.dll"   ← 我加的
File /a "/oname=WebView2Loader.dll" "...\target\release\WebView2Loader.dll" ← Tauri 自动加的
```

安装包不会因此报错（同名覆盖），但属于重复打包、卸载脚本里也会多一条删除。
所以：**先看 Tauri 自动放了什么，只补它没放的。**

查看办法——直接读生成的脚本：

```powershell
Select-String -Path src-tauri\target\release\nsis\x64\installer.nsi `
              -Pattern 'File .*oname='
```

---

## 3. WebView2 自动引导策略

新机器没有 WebView2 RunTime 时，应用会直接起不来（白屏或静默退出）。Tauri 支持四种处理方式，
在 `src-tauri/tauri.conf.json` 里配置：

```json
{
  "bundle": {
    "windows": {
      "webviewInstallMode": { "type": "downloadBootstrapper" }
    }
  }
}
```

| `type` | 行为 | 适用场景 |
| --- | --- | --- |
| `downloadBootstrapper` | 安装时若检测不到，联网下载一个约 2 MB 的引导程序再装 | **默认推荐**，包体最小 |
| `embedBootstrapper` | 把引导程序打进安装包，安装时无需再下载 | 内网可控、但允许访问微软 CDN |
| `offlineInstaller` | 把完整离线安装包（约 130 MB）打进安装包 | 完全断网的离线环境 |
| `skip` | 不做任何检测 | 已确认系统自带 WebView2（如 Win11 且锁定环境）|

### 3.1 联网自动安装（本项目当前配置）

`downloadBootstrapper` 的判定与下载逻辑，在生成的 `installer.nsi` 里可以直接看到
（实测）：

```nsi
Section WebView2
  ; 先查注册表，已装则整段跳过
  ReadRegStr $4 HKLM "SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{...}" "pv"
  ${If} $4 == ""
    !if "${INSTALLWEBVIEW2MODE}" == "downloadBootstrapper"
      NSISdl::download "https://go.microsoft.com/fwlink/p/?LinkId=2124703" "$TEMP\MicrosoftEdgeWebview2Setup.exe"
```

安装向导会在「安装中」阶段自动完成，用户无感知。

### 3.2 离线安装模式

面向纯内网 / 无法访问微软 CDN 的环境：

```json
{
  "bundle": {
    "windows": {
      "webviewInstallMode": {
        "type": "offlineInstaller",
        "silent": true
      }
    }
  }
}
```

安装包会增大到约 130 MB（内嵌 `MicrosoftEdgeWebView2RuntimeInstaller.exe`）。
`silent: true` 表示运行离线安装时静默，不弹微软的安装向导。

### 3.3 验证

```powershell
Select-String -Path src-tauri\target\release\nsis\x64\installer.nsi `
              -Pattern 'INSTALLWEBVIEW2MODE|NSISdl::download|WEBVIEW2INSTALLERPATH'
```

能搜到对应分支即配置生效。

---

## 4. 自定义安装路径与权限设计

### 4.1 配置

```json
{
  "bundle": {
    "windows": {
      "nsis": {
        "installMode": "currentUser",
        "displayLanguageSelector": false,
        "languages": ["SimpChinese", "English"]
      }
    }
  }
}
```

生成的 `installer.nsi` 里可以核对（实测）：

```nsi
!define INSTALLMODE "currentUser"
RequestExecutionLevel user          ; ← 不申请管理员
!insertmacro MUI_PAGE_DIRECTORY     ; ← 向导包含「选择安装位置」页
```

- `currentUser` → 装到 `%LOCALAPPDATA%\Programs\Md-Mis`，**免 UAC**。
- `MUI_PAGE_DIRECTORY` → 用户可以点「浏览」自己选盘符（装到 D 盘也行）。
- `displayLanguageSelector: false` → 不弹语言选择页，按系统语言自动选。

### 4.2 为什么必须 per-user（很关键）

本应用的**所有**应用目录（含 `data/` 与 WebView2 缓存）都通过
`appDirectoriesOverride` 解析到**可执行文件同级**：

```json
{ "app": { "appDirectoriesOverride": "data" } }
```

相对路径的前提是**安装目录对当前用户可写**。如果装到 `C:\Program Files`，
普通用户没有写权限，程序启动时就建不了 `data/`，会弹窗并在
`data/startup.log` 里记下原因（不会再静默退出）。

所以 `installMode: "currentUser"` 不是「顺手配一下」，而是 `data/` 方案成立的前提。
反过来，也正因为目录在 exe 旁边，才彻底摆脱了 `%APPDATA%` / `%LOCALAPPDATA%` 的
可写性依赖——这也是早期「只能以管理员身份启动」那个缺陷的根治方式。

### 4.3 验证

```powershell
# 静默装到自定义目录，确认落在指定位置、且无 UAC 提权
$setup = 'src-tauri\target\release\bundle\nsis\Md-Mis_0.1.0_x64-setup.exe'
& $setup /S /D="$PWD\.scratch\installed"
Get-ChildItem .scratch\installed -Recurse | Select-Object FullName, Length

# 卸载
& .scratch\installed\uninstall.exe /S
```

> NSIS 的 `/D=` 必须放在最后、不加引号且值不加引号（这是 NSIS 自身的约定）。

---

## 5. 版本升级与「数据防覆盖」规范

### 5.1 发布准则：只带二进制

| 必须包含 | 绝对不能包含 |
| --- | --- |
| `Md-Mis.exe` | `data/` 目录 |
| `WebView2Loader.dll`（如有）| 任何 `data.db` / `data.db-wal` / `data.db-shm` |
| `uninstall.exe`（仅安装包）| `.scratch/`、`shots/`、`target/` 中间产物 |

数据库**必须由代码在首次运行时创建**，不能随包分发。实测安装包内容只有：

```
Md-Mis.exe
uninstall.exe
WebView2Loader.dll
```

### 5.2 `data/` 目录的处置

升级只替换程序文件，`data/` 原样保留：

```
升级前                          升级后
Md-Mis\                         Md-Mis\
├─ Md-Mis.exe      ──覆盖──►    ├─ Md-Mis.exe      （新版本）
├─ WebView2Loader.dll ─覆盖─►   ├─ WebView2Loader.dll
└─ data\                        └─ data\            （原封不动）
   └─ data.db                       └─ data.db
```

- **安装包升级**：NSIS 只覆盖程序文件，不会碰 `data/`（它由运行期创建，不归安装器管）。
- **便携版升级**：只覆盖 `Md-Mis.exe` 与同级 DLL，**严禁整目录替换**。

发布说明里应固定写上这句：

> 便携版升级方式：仅替换同级的 `Md-Mis.exe` 与运行时文件，**严禁替换或删除 `data/` 文件夹**。

### 5.3 Migration 热升级

表结构升级一律通过新增 migration 完成，**禁止 `DROP TABLE`**。

```
src-tauri/migrations/
├─ 001_init.sql          version = 1，已发布，不再修改
└─ 002_add_pinned.sql    version = 2，新增字段/索引
```

新增一个迁移的完整步骤：

1. 新建 `src-tauri/migrations/002_xxx.sql`，只写增量 DDL：

   ```sql
   -- 例：给文档加置顶标记（只增不改，历史数据自动取默认值）
   ALTER TABLE documents ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0;
   CREATE INDEX IF NOT EXISTS idx_docs_pinned ON documents(pinned);
   ```

2. 在 `src-tauri/src/lib.rs` 的 `migrations` 数组里追加一项，**version 递增**：

   ```rust
   let migrations = vec![
       Migration { version: 1, description: "create_documents_and_user_settings",
                   sql: include_str!("../migrations/001_init.sql"), kind: MigrationKind::Up },
       Migration { version: 2, description: "add_pinned",
                   sql: include_str!("../migrations/002_add_pinned.sql"), kind: MigrationKind::Up },
   ];
   ```

3. 执行状态记录在数据库的 `_sqlx_migrations` 表里（`version` + `success`）。
   升级后用户库里会多出一行 `v2 ... success=1`，而 `documents` 的既有数据不受影响。

**写迁移时的硬性约束**：

- 已发布的迁移文件**永远不要再改**——它的校验和已写进用户库，改了会导致启动失败。
- 只做增量：`CREATE TABLE IF NOT EXISTS` / `ALTER TABLE ... ADD COLUMN` /
  `CREATE INDEX IF NOT EXISTS`。
- 需要「删列 / 改类型」时，用「建新表 → 搬数据 → 删旧表 → 改名」的完整四步，
  且必须在同一份迁移里完成。
- 新增列尽量带 `DEFAULT`，否则老数据行会是 NULL。

查看用户库当前的迁移状态：

```powershell
node tools/inspect-db.mjs "<安装目录>\data\data.db"
```

### 5.4 升级操作流程（用户视角）

1. 关闭应用。
2. 安装包：直接运行新版 `Md-Mis_x.y.z_x64-setup.exe` 覆盖安装。
   便携版：把新的 `Md-Mis.exe` / `WebView2Loader.dll` 覆盖到原目录。
3. 重新打开。首屏数据应与升级前一致。

### 5.5 发布前检查清单

- [ ] `pnpm build` 通过（含 `vue-tsc` 类型检查）
- [ ] `pnpm tauri build` 成功产出安装包
- [ ] `pwsh -File tools/check-deps.ps1` 全部 `[OK]`
- [ ] 安装包内**不含** `data.db` / `data/`
- [ ] 在**从未装过本应用**的机器上跑一次「安装 → 首次启动 → 建库 → 导入一篇 md」
- [ ] 用**上一版**的 `data.db` 覆盖到新版 `data/` 下，确认能正常打开（Migration 向后兼容）
- [ ] 发布说明写明「只替换程序文件，勿动 data/」

---

## 6. 故障排查速查表

| 现象 | 根因 | 处理 |
| --- | --- | --- |
| 双击**没有任何反应**，进程一闪而过 | 早期版本在初始化失败时静默 panic | 现在会弹 MessageBox 并写 `<exe>/data/startup.log`，先看日志 |
| `Failed to setup app: 拒绝访问 (os error 5)` | 程序所在目录不可写，建不了 `data/` | 装到用户可写位置（`currentUser` 安装或便携目录），不要放 `C:\Program Files` |
| `WebView2 error: WindowsError(0x8000FFFF 灾难性错误)` | WebView2 运行时初始化失败 | `webviewInstallMode` 配 `downloadBootstrapper/offlineInstaller`；确认系统已装 WebView2 |
| 新机器启动报 **`0xC0000135`** | 缺 `WebView2Loader.dll`（不是 MinGW 运行库） | 便携版必须同时分发 `WebView2Loader.dll`；用 `tools/check-deps.ps1` 核实 |
| `error: export ordinal too large: 66252` | `crate-type` 里带了 `cdylib` | 收窄为 `["rlib"]` |
| 链接器报找不到 `gcc` / `windres` | MinGW 不在 PATH | 把 `MinGW64\bin` 加入 PATH，或按 `src-tauri/.cargo/config.toml` 显式指定 |
| `beforeBuildCommand` 失败但只想先看 exe | 类型检查没过 | 修正类型错误；不要用 `--no-before-build-command` 绕过 |
| 打安装包时卡在 `Downloading nsis-3.13.zip` | 直连 GitHub 超时 | 设 `$env:TAURI_BUNDLER_TOOLS_GITHUB_MIRROR = 'https://ghfast.top/https://github.com'` |
| 打包报 `extracting NSIS … 拒绝访问` 或 `failed to bundle project` | Tauri 把工具链解压到 `%LOCALAPPDATA%\tauri`，该目录不可写 | 确认该目录可写（或被安全软件拦截）；缓存建好后再次打包即可 |
| 升级后打开是空库 | `data/` 被覆盖或删掉了 | 从备份恢复 `data.db`；发布流程改为「只替换程序文件」 |
| 应用装到 `C:\Program Files` 后起不来 | 该目录对普通用户只读，`data/` 建不出来 | 改装到用户目录，或改用绿色便携版 |

---

## 附：本机（受限开发沙箱）的额外说明

正常开发机不需要本节内容。

这台机器的受限进程只能写工作区，且 Schannel 不可用（`SEC_E_NO_CREDENTIALS`），所以：

- `tools/rust-env.ps1` 把 `RUSTUP_HOME` 指回系统 Rust 目录、`CARGO_HOME` 指到工作区
  内的 `.cargo-home/`；
- 构建前需要跑 `node tools/crates-proxy.mjs`，让 Cargo 走
  `127.0.0.1:8791` 的明文 HTTP 代理；
- Vite 会执行一次 `exec('net use')`，沙箱禁止管道式子进程，因此
  `tools/dsh-build-shim.mjs` 会让那次探测抛 `EISDIR`，使 Vite 走它的回退分支。

这三项都只在受限环境需要，通过 `tools/tauri.ps1` 自动启用。
