/**
 * SQL 传输层：把「应用要执行哪些 SQL」与「谁来执行」解耦。
 *
 * - Tauri 运行时：交给 `@tauri-apps/plugin-sql`，落到 %APPDATA% 下的 data.db。
 * - 浏览器预览（仅 `pnpm dev`）：把同样的 SQL POST 到 Vite 开发服务器的
 *   `/__dsh/sql`，由 tools/vite-sql-preview.mjs 用 node:sqlite 打到工作区内一个真实的
 *   data.db 文件上。
 *
 * 两种后端之上是同一份 `src/db/index.ts`，所以 SQL 语句、参数绑定、PRAGMA 全部一致；
 * 预览模式只是换了个执行者，便于在没有桌面窗口的环境里验证界面与查询。
 * 生产构建里 PreviewTransport 不会被实例化。
 */
import Database from '@tauri-apps/plugin-sql';

export interface QueryResult {
  rowsAffected: number;
  lastInsertId?: number;
}

export interface SqlTransport {
  select<T>(query: string, values?: unknown[]): Promise<T>;
  execute(query: string, values?: unknown[]): Promise<QueryResult>;
}

export function isTauriRuntime(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ === 'object'
  );
}

/** Tauri 运行时后端。 */
export class TauriTransport implements SqlTransport {
  constructor(private readonly database: Database) {}

  select<T>(query: string, values: unknown[] = []): Promise<T> {
    return this.database.select<T>(query, values);
  }

  execute(query: string, values: unknown[] = []): Promise<QueryResult> {
    return this.database.execute(query, values);
  }
}

/** 浏览器内预览后端（开发服务器提供）。 */
export class PreviewTransport implements SqlTransport {
  private async post<T>(body: Record<string, unknown>): Promise<T> {
    const res = await fetch('/__dsh/sql', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      throw new Error(`预览数据层返回 ${res.status}：${await res.text()}`);
    }
    return (await res.json()) as T;
  }

  select<T>(query: string, values: unknown[] = []): Promise<T> {
    return this.post<T>({ op: 'select', query, values });
  }

  execute(query: string, values: unknown[] = []): Promise<QueryResult> {
    return this.post<QueryResult>({ op: 'execute', query, values });
  }
}
