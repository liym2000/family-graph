<template>
  <PageHeading>
    <div>
      <h1>{{ t('设置与备份') }}</h1>
    </div>
    <div class="ui-actions">
      <el-button :loading="exporting" @click="download">{{ t('导出 JSON 备份') }}</el-button>
    </div>
  </PageHeading>
  <div class="settings-grid">
    <section class="surface">
      <div class="ui-card-header">
        <h2>{{ t('家谱资料') }}</h2>
        <div v-if="!readOnly" class="ui-actions">
          <el-button type="primary" :loading="saving" :disabled="!form.name.trim() || !form.surname.trim()" @click="save">{{ t('保存设置') }}</el-button>
        </div>
      </div>
      <el-form :disabled="readOnly" class="settings-form" label-position="top" @submit.prevent="save">
        <el-form-item :label="t('姓氏')" required>
          <el-input v-model="form.surname" />
        </el-form-item>
        <el-form-item :label="t('家谱名称')" required>
          <el-input v-model="form.name" />
        </el-form-item>
        <el-form-item class="settings-notes" :label="t('备注')">
          <el-input v-model="form.remark" type="textarea" :rows="10" />
        </el-form-item>
      </el-form>
    </section>
  </div>
</template>
<script setup lang="ts">
import { useDemoMode } from '../composables/useDemoMode';
const { readOnly } = useDemoMode();
import PageHeading from '../components/PageHeading.vue';
import { t } from '../i18n';

import { reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { api } from '../api';
import { useFamily } from '../composables/useFamily';
import { useFamilies } from '../composables/useFamilies';
import { exportFamilyFile } from '../export/exportFamilyFile';
const { family, familyId } = useFamily();
const form = reactive({
  name: family.value.name,
  surname: family.value.surname || '',
  remark: family.value.remark || '',
});
const saving = ref(false);
const exporting = ref(false);
async function save() {
  if (saving.value || !form.name.trim() || !form.surname.trim()) return;
  saving.value = true;
  try {
    useFamilies().upsert((await api.updateFamily(familyId.value, { ...form, name: form.name.trim(), surname: form.surname.trim() })).family);
    ElMessage.success(t('已保存设置'));
  } catch (e) {
    ElMessage.error(e instanceof Error ? e.message : t('保存失败'));
  } finally {
    saving.value = false;
  }
}
async function download() {
  exporting.value = true;
  try {
    await exportFamilyFile(familyId.value);
    ElMessage.success(t('已导出家谱'));
  } catch (e) {
    ElMessage.error(e instanceof Error ? e.message : t('导出失败'));
  } finally {
    exporting.value = false;
  }
}
</script>
<style scoped>
.settings-grid { width: 100%; max-width: 960px; }
.settings-form { display: grid; grid-template-columns: minmax(140px, 1fr) minmax(0, 3fr); gap: 16px; }
.settings-form :deep(.el-form-item) { min-width: 0; margin-bottom: 0; }
.settings-notes { grid-column: 1 / -1; }
@media (max-width: 600px) {
  .settings-form { grid-template-columns: minmax(0, 1fr); }
}
</style>
