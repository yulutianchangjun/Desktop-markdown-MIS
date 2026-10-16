import { createApp } from 'vue';
import { createPinia } from 'pinia';

// md-editor-v3 自带样式（含 @vavt/markdown-theme 的全部排版预设：github / vuepress /
// mk-cute / smart-blue / cyanosis 等），作为全局主题基准，不再重复引入第二套排版。
import 'md-editor-v3/lib/style.css';
import './styles/theme.css';

import App from './App.vue';

createApp(App).use(createPinia()).mount('#app');
