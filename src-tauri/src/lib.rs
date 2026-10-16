// Prevents an extra console window on Windows in release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::Manager;
use tauri_plugin_sql::{Migration, MigrationKind};

/// 数据库物理文件位置。
///
/// `@tauri-apps/plugin-sql` 把 `sqlite:data.db` 解析到应用配置目录，这里把同样的规则
/// 复算一遍，供「系统设置」展示真实落盘路径，也方便外部工具直接打开该文件核对。
#[tauri::command]
fn db_path(app: tauri::AppHandle) -> Result<String, String> {
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|e| format!("无法解析应用配置目录：{e}"))?;
    Ok(dir.join("data.db").to_string_lossy().into_owned())
}

pub fn run() {
    // 表结构与索引随连接建立自动创建，与应用版本一起演进。
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
                .add_migrations("sqlite:data.db", migrations)
                .build(),
        )
        .invoke_handler(tauri::generate_handler![db_path])
        .run(tauri::generate_context!())
        .expect("Local DMS 启动失败");
}
