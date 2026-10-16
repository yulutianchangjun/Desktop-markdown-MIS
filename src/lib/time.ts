/** 相对时间：把 SQLite 的 `datetime('now','localtime')` 文本渲染成「10 分钟前」这类相对描述。 */

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * SQLite 的 `datetime('now','localtime')` 产出 `YYYY-MM-DD HH:MM:SS`（无时区标记、本地时间）。
 * JS 的 `new Date(str)` 会把这种格式当作本地时间解析，正好与写入端一致。
 */
export function parseSqlTime(value: string | null | undefined): Date | null {
  if (!value) return null;
  const normalized = value.includes('T') ? value : value.replace(' ', 'T');
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function relativeTime(value: string | null | undefined, now: Date = new Date()): string {
  const date = parseSqlTime(value);
  if (!date) return '—';

  const diff = now.getTime() - date.getTime();
  if (diff < 0) return '刚刚';
  if (diff < MINUTE) return '刚刚';
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)} 分钟前`;
  if (diff < DAY) return `${Math.floor(diff / HOUR)} 小时前`;
  if (diff < 30 * DAY) return `${Math.floor(diff / DAY)} 天前`;

  const y = date.getFullYear();
  const m = `${date.getMonth() + 1}`.padStart(2, '0');
  const d = `${date.getDate()}`.padStart(2, '0');
  return y === now.getFullYear() ? `${m}-${d}` : `${y}-${m}-${d}`;
}

export function formatDateTime(value: string | null | undefined): string {
  const date = parseSqlTime(value);
  if (!date) return '—';
  const pad = (n: number) => `${n}`.padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** 时间轴分组键：`2026-09` -> 「2026 年 9 月」 */
export function monthKey(value: string | null | undefined): string {
  const date = parseSqlTime(value);
  if (!date) return '未知时间';
  return `${date.getFullYear()}-${`${date.getMonth() + 1}`.padStart(2, '0')}`;
}

export function monthLabel(key: string): string {
  const [y, m] = key.split('-');
  if (!y || !m) return key;
  return `${y} 年 ${Number(m)} 月`;
}

/** 本周更新量：以周一为一周起点。 */
export function startOfWeek(now: Date = new Date()): Date {
  const d = new Date(now);
  const weekday = (d.getDay() + 6) % 7; // 周一 = 0
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - weekday);
  return d;
}
