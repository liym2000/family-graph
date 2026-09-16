import { computed, ref, watch } from 'vue';
import zhCN from 'element-plus/es/locale/lang/zh-cn';
import english from 'element-plus/es/locale/lang/en';
import { en } from './locales/en';

export type Locale = 'zh-CN' | 'en';
export type MessageKey = keyof typeof en;
const storageKey = 'familyGraph.locale';
function initialLocale(): Locale {
  try {
    const saved = localStorage.getItem(storageKey);
    if (saved === 'en' || saved === 'zh-CN') return saved;
  } catch {
    /* Storage may be unavailable. */
  }
  return 'zh-CN';
}
export const locale = ref<Locale>(initialLocale());
export const elementLocale = computed(() =>
  locale.value === 'en' ? english : zhCN,
);
export function setLocale(value: Locale) {
  locale.value = value;
}
export function t(
  key: MessageKey,
  params: Record<string, unknown> = {},
): string {
  const message = locale.value === 'en' ? en[key] : key;
  return message.replace(/\{(\w+)\}/g, (token, name: string) =>
    params[name] === undefined ? token : String(params[name]),
  );
}
watch(
  locale,
  (value) => {
    document.documentElement.lang = value;
    document.title = value === 'en' ? 'Family Graph' : '谱记';
    try {
      localStorage.setItem(storageKey, value);
    } catch {
      /* Switching still works without persistence. */
    }
  },
  { immediate: true },
);
