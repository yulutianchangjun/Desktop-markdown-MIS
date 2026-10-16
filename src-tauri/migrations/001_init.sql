-- 1. 文档核心表
CREATE TABLE IF NOT EXISTS documents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,                     -- 文件标题（默认抓取文件名）
    raw_content TEXT NOT NULL,               -- 完整 Markdown 源码长文本
    category TEXT DEFAULT '未分类',           -- 所属分类
    tags TEXT,                               -- 标签，英文逗号分隔
    is_archived INTEGER DEFAULT 0,           -- 归档/废纸篓状态 (0: 正常, 1: 归档)
    created_at DATETIME DEFAULT (datetime('now', 'localtime')), -- 创建/拖入时间
    updated_at DATETIME DEFAULT (datetime('now', 'localtime'))  -- 修改时间
);

-- 索引：加速时间轴与分类检索
CREATE INDEX IF NOT EXISTS idx_docs_created ON documents(created_at);
CREATE INDEX IF NOT EXISTS idx_docs_category ON documents(category);

-- 2. 个性化配置表
CREATE TABLE IF NOT EXISTS user_settings (
    key TEXT PRIMARY KEY,                    -- 配置项名（如 active_theme, view_mode 等）
    value TEXT NOT NULL                      -- 配置值
);
