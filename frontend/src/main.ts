import { createApp } from 'vue';
import { elementPlus } from './ui/element-plus';
import './ui/element-plus-styles';
import App from './App.vue';
import { router } from './router';
import './styles.css';

createApp(App).use(router).use(elementPlus).mount('#app');
