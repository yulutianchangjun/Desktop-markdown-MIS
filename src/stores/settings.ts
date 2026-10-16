import { computed, ref } from 'vue';
import { defineStore } from 'pinia';

import { fetchSettings, saveSetting } from '@/db';
import { accentFor, type ThemeMode } from '@/lib/themes';

/** 编辑器三态：纯阅览 / 双模式（分屏对照）/ 纯源码 */
export type ViewMode = 'preview' | 'split' | 'source';

/** user_settings 表中的配置项名（规范：active_theme、view_mode 等） */
const KEYS = {
  theme: 'active_theme',
  viewMode: 'view_mode',
  previewTheme: 'preview_theme',
  codeTheme: 'code_theme',
  fontSize: 'font_size',
} as const;

export const useSettingsStore = defineStore('settings', () => {
  // 规范主推深色模式：默认即深色。
  const theme = ref<ThemeMode>('dark');
  const viewMode = ref<ViewMode>('split');
  const previewTheme = ref('vuepress');
  const codeTheme = ref('atom');
  const fontSize = ref(15);

  const ready = ref(false);

  /** 强调色：取当前排版主题的 --md-theme-color，驱动全部激活态。 */
  const accent = computed(() => accentFor(previewTheme.value, theme.value));

  const editorTheme = computed<'light' | 'dark'>(() => theme.value);

  async function load(): Promise<void> {
    const stored = await fetchSettings();

    const storedTheme = stored[KEYS.theme];
    if (storedTheme === 'light' || storedTheme === 'dark') {
      theme.value = storedTheme;
    }
    const vm = stored[KEYS.viewMode];
    if (vm === 'preview' || vm === 'split' || vm === 'source') viewMode.value = vm;
    if (stored[KEYS.previewTheme]) previewTheme.value = stored[KEYS.previewTheme];
    if (stored[KEYS.codeTheme]) codeTheme.value = stored[KEYS.codeTheme];
    const size = Number(stored[KEYS.fontSize]);
    if (Number.isFinite(size) && size >= 12 && size <= 22) fontSize.value = size;

    ready.value = true;
    applyDocumentTheme();
  }

  function applyDocumentTheme(): void {
    const dark = theme.value === 'dark';
    document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
    document.body.style.background = dark ? '#000' : '#fff';
  }

  async function setTheme(next: ThemeMode): Promise<void> {
    theme.value = next;
    applyDocumentTheme();
    await saveSetting(KEYS.theme, next);
  }

  async function toggleTheme(): Promise<void> {
    await setTheme(theme.value === 'dark' ? 'light' : 'dark');
  }

  async function setViewMode(next: ViewMode): Promise<void> {
    viewMode.value = next;
    await saveSetting(KEYS.viewMode, next);
  }

  async function setPreviewTheme(next: string): Promise<void> {
    previewTheme.value = next;
    await saveSetting(KEYS.previewTheme, next);
  }

  async function setCodeTheme(next: string): Promise<void> {
    codeTheme.value = next;
    await saveSetting(KEYS.codeTheme, next);
  }

  async function setFontSize(next: number): Promise<void> {
    const clamped = Math.min(22, Math.max(12, Math.round(next)));
    fontSize.value = clamped;
    await saveSetting(KEYS.fontSize, String(clamped));
  }

  return {
    theme,
    viewMode,
    previewTheme,
    codeTheme,
    fontSize,
    ready,
    accent,
    editorTheme,
    load,
    setTheme,
    toggleTheme,
    setViewMode,
    setPreviewTheme,
    setCodeTheme,
    setFontSize,
  };
});
