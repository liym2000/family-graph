import { readonly, ref } from 'vue';

const readOnly = ref(true);
export function setDemoReadOnly(value: boolean) { readOnly.value = value; }
export function useDemoMode() { return { readOnly: readonly(readOnly) }; }
