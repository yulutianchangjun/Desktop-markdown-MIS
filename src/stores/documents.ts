import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import { readTextFile, writeTextFile } from '@tauri-apps/plugin-fs';
import { save as saveDialog } from '@tauri-apps/plugin-dialog';

import {
  DEFAULT_CATEGORY,
  deleteDocument,
  fetchDocuments,
  insertDocument,
  saveDocumentContent,
  setDocumentArchived,
  updateDocumentMeta,
  type DocumentMetaPatch,
  type DocumentRow,
} from '@/db';
import { isTauriRuntime } from '@/db/transport';
import { monthKey, parseSqlTime, startOfWeek } from '@/lib/time';

export type RouteKey =
  | 'dashboard'
  | 'documents'
  | 'categories'
  | 'timeline'
  | 'trash'
  | 'settings';

export type SaveState = 'idle' | 'dirty' | 'saving' | 'saved';

export interface CategoryNode {
  name: string;
  path: string;
  count: number;
  children: CategoryNode[];
}

export interface TimelineGroup {
  key: string;
  items: DocumentRow[];
}

export interface ImportOutcome {
  imported: string[];
  failed: { path: string; reason: string }[];
  skipped: string[];
}

function basename(filePath: string): string {
  const parts = filePath.split(/[\\/]/);
  return parts[parts.length - 1] ?? filePath;
}

function stripMarkdownExt(name: string): string {
  return name.replace(/\.(md|markdown|mdx|txt)$/i, '');
}

export const useDocumentsStore = defineStore('documents', () => {
  const rows = ref<DocumentRow[]>([]);
  const loading = ref(false);
  const error = ref<string | null>(null);

  const route = ref<RouteKey>('dashboard');
  const editorOpen = ref(false);
  const selectedId = ref<number | null>(null);
  const draft = ref('');
  const saveState = ref<SaveState>('idle');

  const search = ref('');
  const categoryFilter = ref<string | null>(null);

  const open = computed(() => rows.value.filter((r) => r.is_archived === 0));
  const archived = computed(() => rows.value.filter((r) => r.is_archived === 1));

  const current = computed<DocumentRow | null>(
    () => rows.value.find((r) => r.id === selectedId.value) ?? null,
  );

  const filtered = computed<DocumentRow[]>(() => {
    const term = search.value.trim().toLowerCase();
    let list = open.value;

    if (route.value === 'trash') list = archived.value;
    if (route.value === 'categories' && categoryFilter.value) {
      const prefix = categoryFilter.value;
      list = list.filter(
        (r) => r.category === prefix || (r.category ?? '').startsWith(`${prefix}/`),
      );
    }
    if (term) {
      list = list.filter(
        (r) =>
          r.title.toLowerCase().includes(term) ||
          (r.category ?? '').toLowerCase().includes(term) ||
          (r.tags ?? '').toLowerCase().includes(term) ||
          r.raw_content.toLowerCase().includes(term),
      );
    }
    return list;
  });

  const recent = computed(() => open.value.slice(0, 5));

  const stats = computed(() => {
    // 「分类总数」按去重后的完整分类路径统计，与 SELECT COUNT(DISTINCT category) 一致。
    const categories = new Set(
      open.value.map((r) => (r.category?.trim() || DEFAULT_CATEGORY).replace(/^\/+|\/+$/g, '')),
    );
    const weekStart = startOfWeek().getTime();
    const weekUpdates = open.value.filter((r) => {
      const d = parseSqlTime(r.updated_at);
      return d !== null && d.getTime() >= weekStart;
    }).length;

    return {
      total: open.value.length,
      archived: archived.value.length,
      categories: categories.size,
      weekUpdates,
    };
  });

  const categoryTree = computed<CategoryNode[]>(() => {
    const root: CategoryNode = { name: '', path: '', count: 0, children: [] };

    for (const row of open.value) {
      const path = (row.category?.trim() || DEFAULT_CATEGORY).replace(/^\/+|\/+$/g, '');
      const segments = path.split('/').map((s) => s.trim()).filter(Boolean);
      if (!segments.length) continue;

      let node = root;
      let walked = '';
      for (const segment of segments) {
        walked = walked ? `${walked}/${segment}` : segment;
        let child = node.children.find((c) => c.name === segment);
        if (!child) {
          child = { name: segment, path: walked, count: 0, children: [] };
          node.children.push(child);
        }
        child.count += 1;
        node = child;
      }
    }

    const sortRec = (nodes: CategoryNode[]): CategoryNode[] => {
      nodes.sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN'));
      for (const n of nodes) sortRec(n.children);
      return nodes;
    };
    return sortRec(root.children);
  });

  /** 时间轴：按导入/创建月份倒序分组。 */
  const timeline = computed<TimelineGroup[]>(() => {
    const buckets = new Map<string, DocumentRow[]>();
    for (const row of open.value) {
      const key = monthKey(row.created_at);
      const bucket = buckets.get(key);
      if (bucket) bucket.push(row);
      else buckets.set(key, [row]);
    }
    return [...buckets.entries()]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([key, items]) => ({ key, items }));
  });

  /** 仪表盘时间轴概览：当月足迹。 */
  const currentMonth = computed<TimelineGroup | null>(() => {
    const key = monthKey(new Date().toISOString());
    return timeline.value.find((g) => g.key === key) ?? null;
  });

  async function load(): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      rows.value = await fetchDocuments(true);
      // 选中的文档被彻底删除时收起编辑区。
      if (selectedId.value !== null && !rows.value.some((r) => r.id === selectedId.value)) {
        editorOpen.value = false;
        selectedId.value = null;
        draft.value = '';
      }
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e);
    } finally {
      loading.value = false;
    }
  }

  async function init(): Promise<void> {
    try {
      await load();
    } catch {
      /* error 已记录，界面会展示提示 */
    }
  }

  function go(next: RouteKey): void {
    route.value = next;
    editorOpen.value = false;
    if (next !== 'categories') categoryFilter.value = null;
  }

  function selectCategory(path: string | null): void {
    categoryFilter.value = path;
    route.value = 'categories';
    editorOpen.value = false;
  }

  function openDocument(id: number): void {
    const row = rows.value.find((r) => r.id === id);
    if (!row) return;
    selectedId.value = id;
    draft.value = row.raw_content;
    saveState.value = 'idle';
    editorOpen.value = true;
  }

  function closeEditor(): void {
    editorOpen.value = false;
    selectedId.value = null;
    draft.value = '';
    saveState.value = 'idle';
  }

  function markDirty(): void {
    if (saveState.value !== 'saving') saveState.value = 'dirty';
  }

  /** 导入流：拖入的绝对路径 → readTextFile → 提取文件名作为 title → 写库。 */
  async function importPaths(paths: string[]): Promise<ImportOutcome> {
    const outcome: ImportOutcome = { imported: [], failed: [], skipped: [] };

    // 读取本地绝对路径依赖 Tauri 的文件系统插件；浏览器预览下没有该能力。
    if (!isTauriRuntime()) {
      for (const path of paths) outcome.failed.push({ path, reason: '当前环境不支持读取本地文件' });
      return outcome;
    }

    for (const path of paths) {
      const name = basename(path);
      if (!/\.(md|markdown|mdx)$/i.test(name)) {
        outcome.skipped.push(name);
        continue;
      }
      try {
        const raw = await readTextFile(path);
        await insertDocument({
          title: stripMarkdownExt(name),
          raw_content: raw,
          category: DEFAULT_CATEGORY,
        });
        outcome.imported.push(stripMarkdownExt(name));
      } catch (e) {
        outcome.failed.push({ path, reason: e instanceof Error ? e.message : String(e) });
      }
    }

    if (outcome.imported.length) await load();
    return outcome;
  }

  /** 阅览/编辑流：Ctrl+S 把源码异步回写 SQLite。 */
  async function saveCurrent(): Promise<boolean> {
    const row = current.value;
    if (!row) return false;
    saveState.value = 'saving';
    try {
      await saveDocumentContent(row.id, draft.value);
      await load();
      saveState.value = 'saved';
      window.setTimeout(() => {
        if (saveState.value === 'saved') saveState.value = 'idle';
      }, 1600);
      return true;
    } catch (e) {
      saveState.value = 'dirty';
      error.value = e instanceof Error ? e.message : String(e);
      return false;
    }
  }

  /** 导出流：系统对话框选择位置 → writeTextFile 生成标准 .md 文件。 */
  async function exportCurrent(): Promise<string | null> {
    const row = current.value;
    if (!row || !isTauriRuntime()) return null;
    const target = await saveDialog({
      title: '导出 Markdown',
      defaultPath: `${row.title}.md`,
      filters: [{ name: 'Markdown', extensions: ['md'] }],
    });
    if (!target) return null;
    await writeTextFile(target, draft.value);
    return target;
  }

  async function exportAll(): Promise<number> {
    if (!isTauriRuntime()) return 0;
    const directory = await saveDialog({
      title: '选择全库导出目录（将逐个写入 .md 文件）',
    });
    if (!directory) return 0;
    const sep = directory.includes('\\') ? '\\' : '/';
    let written = 0;
    for (const row of open.value) {
      const safe = row.title.replace(/[\\/:*?"<>|]/g, '_') || `document-${row.id}`;
      await writeTextFile(`${directory}${sep}${safe}.md`, row.raw_content);
      written += 1;
    }
    return written;
  }

  async function archive(id: number): Promise<void> {
    await setDocumentArchived(id, true);
    if (selectedId.value === id) closeEditor();
    await load();
  }

  async function restore(id: number): Promise<void> {
    await setDocumentArchived(id, false);
    await load();
  }

  async function remove(id: number): Promise<void> {
    await deleteDocument(id);
    if (selectedId.value === id) closeEditor();
    await load();
  }

  async function patchMeta(id: number, patch: DocumentMetaPatch): Promise<void> {
    await updateDocumentMeta(id, patch);
    await load();
  }

  return {
    rows,
    loading,
    error,
    route,
    editorOpen,
    selectedId,
    draft,
    saveState,
    search,
    categoryFilter,
    open,
    archived,
    current,
    filtered,
    recent,
    stats,
    categoryTree,
    timeline,
    currentMonth,
    load,
    init,
    go,
    selectCategory,
    openDocument,
    closeEditor,
    markDirty,
    importPaths,
    saveCurrent,
    exportCurrent,
    exportAll,
    archive,
    restore,
    remove,
    patchMeta,
  };
});
