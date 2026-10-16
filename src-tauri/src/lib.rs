// Prevents an extra console window on Windows in release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::fs;
use std::path::{Path, PathBuf};

use tauri_plugin_sql::{Migration, MigrationKind};

/// 数据库放在程序同级的 `data/` 下，做成便携绿色版：换机器只需整体拷贝目录。
const DATA_DIR_NAME: &str = "data";
const DB_FILE_NAME: &str = "data.db";
const LOG_FILE_NAME: &str = "startup.log";

/// 上一版把库放在 `%APPDATA%\<bundle identifier>` 下。升级到 data/ 方案时把旧库收养过来，
/// 避免老用户的笔记凭空消失（只复制，不删除、不覆盖旧文件）。
const LEGACY_IDENTIFIER: &str = "com.localdms.desktop";

// ---------------------------------------------------------------------------
// 路径解析
// ---------------------------------------------------------------------------

fn exe_dir() -> Result<PathBuf, String> {
    let exe = std::env::current_exe().map_err(|e| format!("无法定位程序文件：{e}"))?;
    exe.parent()
        .map(Path::to_path_buf)
        .ok_or_else(|| "无法确定程序所在目录".to_string())
}

fn data_dir() -> Result<PathBuf, String> {
    Ok(exe_dir()?.join(DATA_DIR_NAME))
}

/// 确保 `data/` 与 `data/data.db` 存在，返回数据库文件的绝对路径。
fn ensure_data_file() -> Result<PathBuf, String> {
    let dir = data_dir()?;
    fs::create_dir_all(&dir).map_err(|e| format!("无法创建数据目录 {}：{e}", dir.display()))?;

    let db = dir.join(DB_FILE_NAME);
    let missing_or_empty =
        !db.exists() || fs::metadata(&db).map(|meta| meta.len() == 0).unwrap_or(true);

    if missing_or_empty && !adopt_legacy_database(&db) {
        // 空文件就是合法的空 SQLite 库；先建出来，连接时就不必依赖 create_if_missing。
        fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(&db)
            .map_err(|e| format!("无法创建数据库文件 {}：{e}", db.display()))?;
    }

    Ok(db)
}

/// 尝试把 `%APPDATA%\<旧标识>\data.db` 复制到新位置，成功返回 true。
fn adopt_legacy_database(target: &Path) -> bool {
    let Ok(appdata) = std::env::var("APPDATA") else {
        return false;
    };
    let legacy = Path::new(&appdata)
        .join(LEGACY_IDENTIFIER)
        .join(DB_FILE_NAME);

    let Ok(meta) = fs::metadata(&legacy) else {
        return false;
    };
    if meta.len() == 0 {
        return false;
    }

    match fs::copy(&legacy, target) {
        Ok(bytes) => {
            log_line(&format!(
                "已从旧位置收养数据库：{} -> {}（{bytes} 字节）",
                legacy.display(),
                target.display()
            ));
            true
        }
        Err(e) => {
            log_line(&format!("收养旧数据库失败：{e}"));
            false
        }
    }
}

/// plugin-sql 用「连接串」作为 migration 的注册键，因此前端必须拿到同一个字符串。
/// 统一用正斜杠，避免反斜杠在 `sqlite:` URL 里被当成转义。
fn connection_url(db_file: &Path) -> String {
    format!("sqlite:{}", db_file.to_string_lossy().replace('\\', "/"))
}

// ---------------------------------------------------------------------------
// 失败可诊断：日志 + 弹窗，而不是静默 Panic
// ---------------------------------------------------------------------------

fn log_line(message: &str) {
    let Ok(dir) = data_dir() else { return };
    let _ = fs::create_dir_all(&dir);
    let path = dir.join(LOG_FILE_NAME);
    let stamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    if let Ok(mut file) = fs::OpenOptions::new().create(true).append(true).open(path) {
        use std::io::Write;
        let _ = writeln!(file, "[{stamp}] {message}");
    }
}

#[cfg(windows)]
fn show_message_box(title: &str, message: &str) {
    use std::ffi::OsStr;
    use std::os::windows::ffi::OsStrExt;

    #[link(name = "user32")]
    extern "system" {
        fn MessageBoxW(
            hwnd: *mut core::ffi::c_void,
            text: *const u16,
            caption: *const u16,
            u_type: u32,
        ) -> i32;
    }

    fn wide(text: &str) -> Vec<u16> {
        OsStr::new(text).encode_wide().chain(Some(0)).collect()
    }

    const MB_ICONERROR: u32 = 0x0000_0010;
    const MB_TOPMOST: u32 = 0x0004_0000;

    let text = wide(message);
    let caption = wide(title);
    // SAFETY: 两个字符串都以 NUL 结尾，且在调用期间保持存活。
    unsafe {
        MessageBoxW(
            std::ptr::null_mut(),
            text.as_ptr(),
            caption.as_ptr(),
            MB_ICONERROR | MB_TOPMOST,
        );
    }
}

#[cfg(not(windows))]
fn show_message_box(title: &str, message: &str) {
    eprintln!("{title}: {message}");
}

/// 初始化阶段失败时给出可见反馈，并落盘一份日志，避免「双击没反应」。
fn fatal(message: &str) -> ! {
    log_line(&format!("启动失败：{message}"));
    show_message_box(
        "Md-Mis 启动失败",
        &format!("{message}\n\n详细信息已写入程序目录下 data/startup.log。"),
    );
    std::process::exit(1);
}

// ---------------------------------------------------------------------------
// 命令
// ---------------------------------------------------------------------------

/// 数据库文件的绝对路径（供「系统设置」展示真实落盘位置）。
#[tauri::command]
fn get_app_data_path() -> Result<String, String> {
    ensure_data_file().map(|path| path.to_string_lossy().into_owned())
}

/// 交给 `@tauri-apps/plugin-sql` 的连接串。必须与 `add_migrations` 注册时用的完全一致。
#[tauri::command]
fn db_connection_url() -> Result<String, String> {
    ensure_data_file().map(|path| connection_url(&path))
}

pub fn run() {
    // 未捕获的 panic 也要让用户看得见，而不是窗口一闪而过。
    std::panic::set_hook(Box::new(|info| {
        let message = format!("程序遇到未处理的错误：{info}");
        log_line(&message);
        show_message_box("Md-Mis 异常", &message);
    }));

    let db_file = match ensure_data_file() {
        Ok(path) => path,
        Err(e) => fatal(&e),
    };
    let db_url = connection_url(&db_file);

    // 表结构与索引随连接建立自动创建；升级只允许新增 Migration，绝不 DROP TABLE。
    let migrations = vec![Migration {
        version: 1,
        description: "create_documents_and_user_settings",
        sql: include_str!("../migrations/001_init.sql"),
        kind: MigrationKind::Up,
    }];

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations(&db_url, migrations)
                .build(),
        )
        .invoke_handler(tauri::generate_handler![get_app_data_path, db_connection_url])
        .run(tauri::generate_context!())
        .unwrap_or_else(|e| fatal(&format!("无法启动应用窗口：{e}")));
}
