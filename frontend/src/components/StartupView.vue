<template>
  <main class="start">
    <section class="start-shell">
      <header class="start-hero">
        <div>
          <h1>{{ t('选择家谱') }}</h1>
        </div>
        <div class="start-actions">
          <LanguageSwitcher />
          <el-tag v-if="readOnly">{{ t('只读演示') }}</el-tag>
          <el-button v-if="!readOnly" type="primary" round @click="createVisible = true">{{ t('新增家谱') }}</el-button>
          <input
            ref="importInput"
            class="visually-hidden"
            type="file"
            accept="application/json,.json"
            @change="handleImportFile"
          />
          <el-button v-if="!readOnly" round @click="chooseImport">
            {{ t('导入家谱') }}
          </el-button>
          <el-button round @click="loadFamilies(true)">
            {{ t('刷新') }}
          </el-button>
        </div>
      </header>

      <section class="start-board">
        <div class="start-panel family-panel">
          <div class="panel-head ui-card-header">
            <strong>{{ t('已有家谱') }}</strong>
            <span>{{ t('共 {count} 部家谱', { count: families.length }) }}</span>
          </div>
          <LoadState
            :loading="loading"
            :error="error"
            @retry="loadFamilies(true)"
          >
            <el-empty v-if="!families.length" :description="t('暂无家谱')" />
            <div v-else class="family-list">
              <button
                v-for="family in families"
                :key="family.id"
                class="family-choice"
                type="button"
                :class="{ 'is-selected': selectedFamily?.id === family.id }"
                :aria-pressed="selectedFamily?.id === family.id"
                :disabled="deleting"
                @click="selectedId = family.id"
              >
                <span class="family-icon">
                  {{ family.surname || family.name.slice(0, 1) }}
                </span>
                <span class="family-copy">
                  <span class="family-name">{{ family.name }}</span>
                  <span class="family-meta">
                    {{ t('{count} 人', { count: family.people_count || 0 }) }}
                  </span>
                </span>
              </button>
            </div>
          </LoadState>
        </div>

        <div class="start-panel create-panel">
          <div class="panel-head ui-card-header">
            <strong>{{ t('家谱详情') }}</strong>
            <div v-if="selectedFamily" class="ui-actions">
              <el-button v-if="!readOnly" :disabled="deleting" @click="editFamily(selectedFamily)">{{ t('编辑资料') }}</el-button>
              <el-button :loading="exportingFamilyId === selectedFamily.id" :disabled="exportingFamilyId !== null || deleting" @click="exportFamily(selectedFamily)">{{ t('导出') }}</el-button>
              <el-button v-if="!readOnly" plain type="danger" :loading="deleting" :disabled="exportingFamilyId !== null" @click="deleteFamily(selectedFamily)">{{ t('删除') }}</el-button>
              <el-button type="primary" :disabled="deleting" @click="selectFamily(selectedFamily)">{{ t('进入') }}</el-button>
            </div>
          </div>
          <template v-if="selectedFamily">
            <h2 class="selected-family-name">{{ selectedFamily.name }}</h2>
            <dl class="profile-fields">
              <div><dt>{{ t('姓氏') }}</dt><dd>{{ selectedFamily.surname || t('未填写') }}</dd></div>
              <div><dt>{{ t('人数') }}</dt><dd>{{ selectedFamily.people_count || 0 }}</dd></div>
              <div><dt>{{ t('最后更新时间') }}</dt><dd>{{ formatUpdatedAt(selectedFamily.updated_at) }}</dd></div>
              <div><dt>{{ t('备注') }}</dt><dd class="family-detail-notes">{{ selectedFamily.remark || t('暂无备注') }}</dd></div>
            </dl>
          </template>
          <el-empty v-else :description="t('暂无家谱')" />
        </div>
      </section>
      <el-dialog v-model="createVisible" :title="t('新增家谱')" width="min(480px, 92vw)" :close-on-click-modal="false" :before-close="closeCreate">
        <el-form label-position="top" @submit.prevent>
          <el-form-item :label="t('姓氏')" required>
            <el-input v-model="form.surname" :placeholder="t('例如：王')" />
          </el-form-item>
          <el-form-item :label="t('家谱名称')" required>
            <el-input
              v-model="form.name"
              :placeholder="t('例如：王氏家谱')"
            />
          </el-form-item>
          <el-form-item :label="t('备注')">
            <el-input v-model="form.remark" type="textarea" :rows="3" />
          </el-form-item>
        </el-form>
        <template #footer>
          <el-button :disabled="creating" @click="createVisible = false">{{ t('取消') }}</el-button>
          <el-button
            type="primary"
            round
            :loading="creating"
            :disabled="!form.name.trim() || !form.surname.trim()"
            @click="createFamily"
          >
            {{ t('创建并进入') }}
          </el-button>
        </template>
      </el-dialog>

      <el-dialog v-model="editVisible" :title="t('编辑家谱')" width="min(480px, 92vw)" :close-on-click-modal="false" :before-close="closeEdit">
        <el-form label-position="top" @submit.prevent="saveFamily">
          <el-form-item :label="t('姓氏')" required>
            <el-input v-model="editForm.surname" :disabled="editing" />
          </el-form-item>
          <el-form-item :label="t('家谱名称')" required>
            <el-input v-model="editForm.name" :disabled="editing" />
          </el-form-item>
          <el-form-item :label="t('备注')">
            <el-input v-model="editForm.remark" type="textarea" :rows="5" :disabled="editing" />
          </el-form-item>
        </el-form>
        <template #footer>
          <el-button :disabled="editing" @click="editVisible = false">{{ t('取消') }}</el-button>
          <el-button type="primary" :loading="editing" :disabled="!editForm.name.trim() || !editForm.surname.trim()" @click="saveFamily">{{ t('保存') }}</el-button>
        </template>
      </el-dialog>
      <el-dialog
        v-model="importDialogVisible"
        :title="t('导入家谱')"
        width="min(480px, 92vw)"
      >
        <el-descriptions v-if="importCandidate" :column="1" border>
          <el-descriptions-item :label="t('家谱名称')">
            {{ importCandidate.family.name }}
          </el-descriptions-item>
          <el-descriptions-item :label="t('人物数量')">
            {{ importCandidate.people.length }}
          </el-descriptions-item>
          <el-descriptions-item :label="t('数据版本')">
            v{{ importCandidate.version }}
          </el-descriptions-item>
        </el-descriptions>
        <el-alert
          class="import-alert"
          type="info"
          :closable="false"
          :title="t('数据将作为一个新家谱导入，不会覆盖已有家谱。')"
        />
        <template #footer>
          <el-button @click="importDialogVisible = false">
            {{ t('取消') }}
          </el-button>
          <el-button type="primary" :loading="importing" @click="confirmImport">
            {{ t('确认导入') }}
          </el-button>
        </template>
      </el-dialog>
    </section>
  </main>
</template>

<script setup lang="ts">
import { useDemoMode } from '../composables/useDemoMode';
const { readOnly } = useDemoMode();
import { locale, t } from '../i18n';

import { useRouter } from 'vue-router';
import { useFamilies } from '../composables/useFamilies';
import { exportFamilyFile } from '../export/exportFamilyFile';
import LanguageSwitcher from './LanguageSwitcher.vue';
import LoadState from './LoadState.vue';
import { computed, onMounted, reactive, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { api, type Family, type FamilyExportV1 } from '../api';

const router = useRouter();
const { families, loading, error, load: loadFamilies, upsert } = useFamilies();
const creating = ref(false);
const deleting = ref(false);
async function deleteFamily(family: Family) {
  if (deleting.value) return;
  try {
    await ElMessageBox.confirm(t('删除「{name}」及其中的全部资料（{people} 人）？此操作不可撤销。', { name: family.name, people: family.people_count || 0 }), t('删除家谱'), { type: 'warning', confirmButtonText: t('删除'), cancelButtonText: t('取消'), confirmButtonClass: 'destructive-confirm' });
    deleting.value = true;
    await api.deleteFamily(family.id);
    families.value = families.value.filter(item => item.id !== family.id);
    localStorage.removeItem(`familyGraph.recent.${family.id}`);
    if (localStorage.getItem('familyGraph.currentFamilyId') === String(family.id)) localStorage.removeItem('familyGraph.currentFamilyId');
    selectedId.value = undefined;
    ElMessage.success(t('已删除家谱'));
  } catch (e) {
    if (e !== 'cancel' && e !== 'close') ElMessage.error(e instanceof Error ? e.message : t('删除失败'));
  } finally { deleting.value = false; }
}
function formatUpdatedAt(value?: string) {
  if (!value || Number.isNaN(new Date(value).getTime())) return t('未填写');
  return new Intl.DateTimeFormat(locale.value, { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(value));
}
const createVisible = ref(false);
const selectedId = ref<number>();
const selectedFamily = computed(() => families.value.find(f => f.id === selectedId.value) || families.value[0]);
function closeCreate(done: () => void) { if (!creating.value) done(); }
const editVisible = ref(false);
const editing = ref(false);
const editId = ref<number>();
const editForm = reactive({ name: '', surname: '', remark: '' });
function editFamily(family: Family) {
  editId.value = family.id;
  Object.assign(editForm, { name: family.name, surname: family.surname || '', remark: family.remark || '' });
  editVisible.value = true;
}
function closeEdit(done: () => void) { if (!editing.value) done(); }
async function saveFamily() {
  if (!editId.value || !editForm.name.trim() || !editForm.surname.trim() || editing.value) return;
  editing.value = true;
  try {
    const { family } = await api.updateFamily(editId.value, { ...editForm, name: editForm.name.trim(), surname: editForm.surname.trim() });
    upsert(family);
    editVisible.value = false;
    ElMessage.success(t('已保存'));
  } catch (e) {
    ElMessage.error(e instanceof Error ? e.message : t('保存失败'));
  } finally { editing.value = false; }
}
function selectFamily(family: Family) {
  upsert(family);
  localStorage.setItem('familyGraph.currentFamilyId', String(family.id));
  router.push(`/families/${family.id}`);
}
const form = reactive({ name: '', surname: '', remark: '' });
const exportingFamilyId = ref<number | null>(null);
const importInput = ref<HTMLInputElement | null>(null);
const importDialogVisible = ref(false);
const importing = ref(false);
const importCandidate = ref<FamilyExportV1 | null>(null);

async function createFamily() {
  if (!form.name.trim() || !form.surname.trim() || creating.value) return;
  creating.value = true;
  try {
    const payload = await api.createFamily({
      name: form.name,
      surname: form.surname.trim(),
      remark: form.remark,
    });
    selectFamily(payload.family);
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : t('创建失败'));
  } finally {
    creating.value = false;
  }
}

async function exportFamily(family: Family) {
  exportingFamilyId.value = family.id;
  try {
    await exportFamilyFile(family.id);
    ElMessage.success(t('已导出 {p0}', { p0: family.name }));
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : t('导出失败'));
  } finally {
    exportingFamilyId.value = null;
  }
}

function chooseImport() {
  importInput.value?.click();
}

async function handleImportFile(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  if (file.size > 20 * 1024 * 1024) {
    ElMessage.error(t('导入文件不能超过 20 MB'));
    return;
  }

  try {
    const payload = JSON.parse(await file.text()) as FamilyExportV1;
    if (
      payload?.format !== 'family_graph_export' ||
      payload?.version !== 1 ||
      !payload.family?.name ||
      !Array.isArray(payload.people) ||
      !Array.isArray(payload.relations)
    ) {
      throw new Error(t('不是有效的 Family Graph v1 导出文件'));
    }
    importCandidate.value = payload;
    importDialogVisible.value = true;
  } catch (error) {
    ElMessage.error(
      error instanceof Error ? error.message : t('无法读取导入文件'),
    );
  }
}

async function confirmImport() {
  if (!importCandidate.value) return;
  importing.value = true;
  try {
    const result = await api.importFamily(importCandidate.value);
    importDialogVisible.value = false;
    importCandidate.value = null;
    ElMessage.success(
      result.prefixChanged
        ? t('导入完成')
        : t('家谱导入完成'),
    );
    selectFamily(result.family);
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : t('导入失败'));
  } finally {
    importing.value = false;
  }
}

onMounted(() => loadFamilies(true));
</script>
<style scoped>
.start-board { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: var(--layout-gap); align-items: start; }
.start-panel { padding: var(--card-padding); }
.family-list { max-height: 560px; overflow-y: auto; padding: 3px; }
.start-hero { gap: 24px; flex-wrap: wrap; }
.start-actions { flex-wrap: wrap; gap: 8px; }
.start-actions :deep(.el-button) { margin-left: 0; }
.panel-head { gap: 12px; flex-wrap: wrap; }
.panel-head > span { white-space: nowrap; }
.profile-fields > div { --field-label-width: 112px; align-items: baseline; }
.profile-fields dt { min-width: 0; line-height: 1.7; }
.profile-fields dd { min-width: 0; }
@media (max-width: 800px) { .start-board { grid-template-columns: minmax(0, 1fr); } .start-panel { padding: 18px; } }
.family-choice { grid-template-columns: 44px minmax(0, 1fr); column-gap: 12px; font: inherit; }
.family-copy { display: flex; flex-direction: row; align-items: center; justify-content: space-between; gap: 16px; min-width: 0; }
.family-name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.family-meta { flex-shrink: 0; white-space: nowrap; }
.family-choice.is-selected { border-color: var(--el-color-primary); background: #edf7f4; }
.family-choice:focus-visible { outline: 2px solid var(--el-color-primary); outline-offset: 3px; }
.selected-family-name { margin: 8px 0 16px; overflow-wrap: anywhere; }
.family-detail-notes { white-space: pre-wrap; overflow-wrap: anywhere; }
@media (max-width: 420px) {
  .profile-fields > div { grid-template-columns: 88px minmax(0, 1fr); column-gap: 12px; }
  .family-copy { gap: 8px; }
}
</style>
