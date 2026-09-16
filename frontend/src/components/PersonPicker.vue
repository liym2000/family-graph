<template>
  <el-select
    :model-value="candidates.some(person => person.id === modelValue) ? modelValue : undefined"
    filterable
    remote
    :teleported="teleported"
    clearable
    :remote-method="search"
    :loading="loading"
    :placeholder="placeholder || t('输入姓名，选择人物')"
    :aria-label="placeholder || t('选择人物')"
    @update:model-value="$emit('update:modelValue', $event || undefined)"
  >
    <el-option
      v-for="person in candidates"
      :key="person.id"
      :value="person.id"
      :label="`${person.name} · ${person.is_pre_genealogy ? t('谱前祖先') : person.generation ? t('第 {p0} 世', { p0: person.generation }) : t('世代未定')}`"
    >
      <strong>{{ person.name }}</strong>
      <span class="muted">
        ·
        {{
          person.is_pre_genealogy ? t('谱前祖先') : person.generation
            ? t('第 {p0} 世', { p0: person.generation })
            : t('世代未定')
        }}
        · {{ person.gender === 'male' ? t('男') : person.gender === 'female' ? t('女') : t('未定') }}
      </span>
    </el-option>
  </el-select>
  <small v-if="error" role="alert" class="error-text">{{ error }}</small>
</template>
<script setup lang="ts">
import { t } from '../i18n';

import { ref, watch } from 'vue';
import { api, type Person } from '../api';
const props = withDefaults(defineProps<{
  familyId: number;
  modelValue?: number;
  placeholder?: string;
  teleported?: boolean;
}>(), { teleported: true, modelValue: undefined, placeholder: undefined });
defineEmits<{ 'update:modelValue': [id: number | undefined] }>();
const candidates = ref<Person[]>([]);
const loading = ref(false);
const error = ref('');
let token = 0;
async function search(q: string) {
  const id = ++token;
  error.value = '';
  if (!q.trim()) {
    candidates.value = [];
    loading.value = false;
    return;
  }
  loading.value = true;
  try {
    const data = await api.searchPersons(
      new URLSearchParams({ familyId: String(props.familyId), q, limit: '30' }),
    );
    if (id === token) candidates.value = data.results;
  } catch (e) {
    if (id === token)
      error.value = e instanceof Error ? e.message : t('搜索失败');
  } finally {
    if (id === token) loading.value = false;
  }
}
watch(
  () => props.modelValue,
  async (value) => {
    if (!value || candidates.value.some((person) => person.id === value))
      return;
    try {
      const { person } = await api.getPerson(value);
      if (
        Number(person.family_id) === props.familyId &&
        value === props.modelValue
      )
        candidates.value = [person, ...candidates.value];
    } catch {
      /* The owning page displays load errors. */
    }
  },
  { immediate: true },
);
</script>
