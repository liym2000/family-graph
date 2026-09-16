<template>
  <PersonPicker v-model="selected" :family-id="familyId" :teleported="false" :placeholder="t('搜索人物')" />
  <el-button type="primary" :disabled="busy || !selected" @click="emit('start', selected!)">{{ t('查看分支') }}</el-button>
  <el-button :disabled="busy || !selected || !hasRoot" :loading="finding" @click="emit('find')">{{ t('查找定位') }}</el-button>
</template>
<script setup lang="ts">
import PersonPicker from '../../components/PersonPicker.vue';
import { t } from '../../i18n';
const selected = defineModel<number>();
defineProps<{ familyId: number; busy: boolean; finding: boolean; hasRoot: boolean }>();
const emit = defineEmits<{ start: [id: number]; find: [] }>();
</script>
