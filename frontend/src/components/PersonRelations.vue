<template>
  <section class="surface">
    <div class="card-header">
      <h2>{{ t('亲属关系') }}</h2>
      <el-button v-if="!readOnly" @click="visible = true">{{ t('添加关系') }}</el-button>
    </div>
    <el-empty v-if="!rows.length && !siblings?.length" :description="t('暂无亲属关系')" />
    <div v-for="row in displayRows" :key="row.id" class="kin-row">
      <span v-if="row.role" class="role-badge">{{ row.role }}</span>
      <span v-else class="kin-role-spacer" aria-hidden="true"></span>
      <RouterLink :to="base + '/person/' + row.personId">
        <span class="kin-name-line">{{ row.name }}
          <span v-if="row.automatic" class="auto-parent-label">{{ t('自动关联') }}</span>
        </span>
      </RouterLink>
      <el-button
        v-if="!readOnly && row.automatic && row.adjustable"
        link
        :disabled="busy"
        @click="adjusting = row; adjustedParent = row.fromId"
      >
        {{ t('调整关系') }}
      </el-button>
      <el-button v-if="!readOnly && !row.sibling" link type="danger" :disabled="busy" @click="remove(row.id)">
        {{ t('移除') }}
      </el-button>
    </div>
  </section>
  <el-dialog :model-value="!!adjusting" :title="t('调整关系')" width="min(540px, 94vw)" :close-on-click-modal="false" :before-close="closeAdjustment" @update:model-value="updateAdjustment">
    <el-form label-position="top">
      <el-form-item :label="t('选择家长')">
        <PersonPicker v-model="adjustedParent" :family-id="familyId" />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button :disabled="busy" @click="adjusting = undefined">{{ t('取消') }}</el-button>
      <el-button type="primary" :loading="busy" :disabled="!adjustedParent || adjustedParent === adjusting?.toId" @click="saveAdjustment">{{ t('保存') }}</el-button>
    </template>
  </el-dialog>
  <el-dialog
    v-model="visible"
    :title="t('添加亲属关系')"
    width="min(540px, 94vw)"
    :close-on-click-modal="false"
    destroy-on-close
    :before-close="closeAdjustment"
    @closed="candidate = undefined; newPerson = false"
  >
    <el-form label-position="top">
      <el-alert
        :title="
          t(
            '子女默认关联第一位录入的配偶；有多位配偶时也按此规则，之后可手动修改。',
          )
        "
        type="info"
        :closable="false"
      />
      <p v-if="mode === 'spouse'" class="muted">
        {{ t('新增配偶不会改变原来的默认家长，手动指定的亲子关系优先。') }}
      </p>
      <el-form-item :label="t('所选人物与当前人物的关系')">
        <el-select v-model="mode">
          <el-option :label="t('父母')" value="parent" />
          <el-option :label="t('配偶')" value="spouse" />
          <el-option :label="t('子女')" value="child" />
        </el-select>
      </el-form-item>
      <el-form-item>
        <el-radio-group v-model="newPerson" :disabled="busy">
          <el-radio-button :value="false">{{ t('选择已有人物') }}</el-radio-button>
          <el-radio-button :value="true">{{ t('新建人物') }}</el-radio-button>
        </el-radio-group>
      </el-form-item>
      <el-form-item v-if="!newPerson" :label="t('选择人物')">
        <PersonPicker v-model="candidate" :family-id="familyId" />
      </el-form-item>
    </el-form>
    <PersonForm v-if="newPerson" :key="mode" :person="defaults" :saving="busy" @save="createRelative" @cancel="visible = false" />
    <template v-if="!newPerson" #footer>
      <el-button :disabled="busy" @click="visible = false">
        {{ t('取消') }}
      </el-button>
      <el-button
        type="primary"
        :loading="busy"
        :disabled="!candidate || candidate === person.id"
        @click="bind"
      >
        {{ t('添加关系') }}
      </el-button>
    </template>
  </el-dialog>
</template>
<script setup lang="ts">
import { useDemoMode } from '../composables/useDemoMode';
const { readOnly } = useDemoMode();
import { t } from '../i18n';

import { computed, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { api, type Person, type PersonInput, type Relation } from '../api';
import { useFamily } from '../composables/useFamily';
import PersonPicker from './PersonPicker.vue';
import PersonForm from './PersonForm.vue';
const props = defineProps<{ person: Person; relations: Relation[]; siblings?: Person[] }>();
const emit = defineEmits<{ changed: [] }>();
const { familyId, base } = useFamily();
const visible = ref(false);
const busy = ref(false);
const adjusting = ref<{ id: number; fromId: number; toId: number }>();
const adjustedParent = ref<number>();
function updateAdjustment(value: boolean) { if (!value && !busy.value) adjusting.value = undefined; }
function closeAdjustment(done: () => void) { if (!busy.value) done(); }
async function saveAdjustment() {
  if (!adjusting.value || !adjustedParent.value || busy.value) return;
  busy.value = true;
  try {
    await api.adjustParent(adjusting.value.id, adjustedParent.value);
    adjusting.value = undefined;
    emit('changed');
    ElMessage.success(t('已保存'));
  } catch (e) {
    ElMessage.error(e instanceof Error ? e.message : t('保存失败'));
  } finally { busy.value = false; }
}
const candidate = ref<number>();
const mode = ref<'parent' | 'spouse' | 'child'>('parent');
const newPerson = ref(false);
const defaults = computed(() => {
  const generation = props.person.generation;
  const value = generation == null ? null : generation + (mode.value === 'parent' ? -1 : mode.value === 'child' ? 1 : 0);
  return { generation: value && value > 0 ? value : null };
});
async function createRelative(data: PersonInput) {
  if (busy.value) return;
  busy.value = true;
  try {
    await api.createPerson({ ...data, family_id: familyId.value, relative_id: props.person.id, relative_role: mode.value });
    visible.value = false;
    emit('changed');
    ElMessage.success(t('已保存'));
  } catch (e) {
    ElMessage.error(e instanceof Error ? e.message : t('添加失败'));
  } finally { busy.value = false; }
}
const rows = computed(() =>
  props.relations.map((r) => {
    const from = r.from_person_id === props.person.id;
    return {
      id: r.id,
      sibling: false,
      parent: r.relation_type === 'parent' && !from,
      spouse: r.relation_type === 'spouse',
      parentOrder: r.from_gender === 'male' ? 0 : r.from_gender === 'female' ? 1 : 2,
      automatic: r.origin === 'single_spouse',
      adjustable: r.adjustment_allowed === true,
      fromId: r.from_person_id,
      toId: r.to_person_id,
      personId: from ? r.to_person_id : r.from_person_id,
      name: from ? r.to_name : r.from_name,
      role:
        r.relation_type === 'spouse'
          ? t('配偶')
          : from
            ? r.to_gender === 'female'
              ? t('女儿')
              : r.to_gender === 'male'
                ? t('儿子')
                : t('子女')
            : r.from_gender === 'female'
              ? t('母亲')
              : r.from_gender === 'male'
                ? t('父亲')
                : t('父母'),
    };
  }),
);
const displayRows = computed(() => [
  ...rows.value.filter(row => row.parent).sort((a, b) => a.parentOrder - b.parentOrder),
  ...rows.value.filter(row => row.spouse),
  ...(props.siblings || []).map(person => ({
    id: -person.id,
    sibling: true,
    parent: false,
    automatic: false,
    adjustable: false,
    fromId: props.person.id,
    toId: person.id,
    personId: person.id,
    name: person.name,
    role: t('兄妹'),
  })),
  ...rows.value.filter(row => !row.parent && !row.spouse),
]);
async function bind() {
  if (!candidate.value || busy.value) return;
  busy.value = true;
  try {
    await api.createRelation({
      family_id: familyId.value,
      relation_type: mode.value === 'spouse' ? 'spouse' : 'parent',
      from_person_id:
        mode.value === 'parent' ? candidate.value : props.person.id,
      to_person_id: mode.value === 'parent' ? props.person.id : candidate.value,
    });
    visible.value = false;
    emit('changed');
    ElMessage.success(t('已添加关系'));
  } catch (e) {
    ElMessage.error(e instanceof Error ? e.message : t('添加失败'));
  } finally {
    busy.value = false;
  }
}
async function remove(id: number) {
  try {
    await ElMessageBox.confirm(
      rows.value.find((row) => row.id === id)?.automatic
        ? t(
            '移除自动关联后，不会再次自动补回；人物档案和另一位家长的关系会保留。',
          )
        : t('移除此亲属关系？人物档案会保留。'),
      t('移除关系'),
      {
        confirmButtonText: t('移除'),
        cancelButtonText: t('取消'),
        type: 'warning',
        confirmButtonClass: 'destructive-confirm',
      },
    );
    busy.value = true;
    await api.deleteRelation(id);
    emit('changed');
  } catch (e) {
    if (e !== 'cancel' && e !== 'close')
      ElMessage.error(e instanceof Error ? e.message : t('移除失败'));
  } finally {
    busy.value = false;
  }
}
</script>
<style scoped>
.kin-name-line { display: flex; align-items: center; gap: 8px; }
.kin-role-spacer { width: 42px; flex-shrink: 0; }
.auto-parent-label {
  font-size: 11px;
  white-space: nowrap;
  color: #854d0e;
  background: #fff3d6;
  padding: 3px 6px;
  border-radius: 4px;
  width: fit-content;
}
</style>
