/**
 * 排版与代码主题：直接复用 md-editor-v3 的内置预设。
 *
 * accent 是该排版主题对应的强调色。md-editor-v3 会在预览容器内部声明
 * `--md-theme-color`，但应用外壳在容器之外，因此这里取同一主题的强调色写到
 * app-shell 上，让导航轨 / 卡片 / 按钮的激活态与正文排版主题保持一致。
 */

export type ThemeMode = 'light' | 'dark';

export interface PreviewThemeOption {
  value: string;
  label: string;
  /** 强调色：浅色模式 / 深色模式 */
  accent: Record<ThemeMode, string>;
}

export const PREVIEW_THEMES: PreviewThemeOption[] = [
  { value: 'default', label: '默认', accent: { light: '#1e80ff', dark: '#4a9eff' } },
  { value: 'github', label: 'GitHub', accent: { light: '#0969da', dark: '#58a6ff' } },
  { value: 'vuepress', label: 'VuePress', accent: { light: '#3eaf7c', dark: '#4fc08d' } },
  { value: 'mk-cute', label: 'MK-Cute', accent: { light: '#36ace1', dark: '#4cc2f1' } },
  { value: 'smart-blue', label: '智汇蓝', accent: { light: '#3f6ad8', dark: '#6ea8ff' } },
  { value: 'cyanosis', label: 'Cyanosis', accent: { light: '#00b4d8', dark: '#22d3ee' } },
];

export const CODE_THEMES = [
  { value: 'atom', label: 'Atom' },
  { value: 'github', label: 'GitHub' },
  { value: 'stackoverflow', label: 'Stack Overflow' },
  { value: 'a11y', label: 'A11y' },
  { value: 'monokai', label: 'Monokai' },
  { value: 'vs', label: 'VS' },
  { value: 'xcode', label: 'Xcode' },
  { value: 'dracula', label: 'Dracula' },
];

export function accentFor(previewTheme: string, mode: ThemeMode): string {
  const found = PREVIEW_THEMES.find((t) => t.value === previewTheme) ?? PREVIEW_THEMES[0]!;
  return found.accent[mode];
}

export function labelFor(previewTheme: string): string {
  return PREVIEW_THEMES.find((t) => t.value === previewTheme)?.label ?? previewTheme;
}
