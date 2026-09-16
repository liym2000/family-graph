import { setDemoReadOnly } from './useDemoMode';
import { t } from '../i18n';
import { ref } from 'vue';
import { api, type Family } from '../api';
const families = ref<Family[]>([]);
const loading = ref(false);
const error = ref('');
const loaded = ref(false);
let pending: Promise<void> | undefined;
async function load(force = false) {
  if (pending) return pending;
  if (loaded.value && !force) return;
  loading.value = true;
  error.value = '';
  pending = (async () => {
    try {
      const response = await api.families();
      setDemoReadOnly(response.demoReadOnly === true);
      families.value = response.families;
      loaded.value = true;
    } catch (e) {
      error.value = e instanceof Error ? e.message : t('无法加载家谱');
    } finally {
      loading.value = false;
      pending = undefined;
    }
  })();
  return pending;
}
function upsert(family: Family) {
  const existing = families.value.findIndex((item) => item.id === family.id);
  if (existing < 0) families.value.push(family);
  else families.value[existing] = { ...families.value[existing], ...family };
}
export function useFamilies() {
  return { families, loading, error, loaded, load, upsert };
}
