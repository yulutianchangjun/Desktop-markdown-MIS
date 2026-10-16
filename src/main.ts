import { createApp } from 'vue';
import { createPinia } from 'pinia';

// md-editor-v3 自带样式（含 @vavt/markdown-theme 的全部排版预设：github / vuepress /
// mk-cute / smart-blue / cyanosis 等），作为全局主题基准，不再重复引入第二套排版。
import 'md-editor-v3/lib/style.css';
import './styles/theme.css';

import App from './App.vue';

// 拖拽兜底：文件拖入由 Tauri 的原生事件处理（tauri.conf.json 的 dragDropEnabled: true），
// 拿到的是绝对路径。这里再兜一层——万一某个平台/配置下 HTML5 拖放事件真的到达页面，
// 不拦截的话 WebView 会直接导航到被拖入的文件，整个应用状态就丢了。
for (const type of ['dragover', 'drop'] as const) {
  window.addEventListener(
    type,
    (event) => {
      event.preventDefault();
    },
    { passive: false },
  );
}

createApp(App).use(createPinia()).mount('#app');
