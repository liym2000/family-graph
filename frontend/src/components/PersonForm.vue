<template>
  <el-form
    label-position="top"
    :class="{ 'page-editor-form': pageEditor }"
    @submit.prevent="submit"
  >
    <div v-if="!pageEditor" class="form-actions ui-actions">
      <el-button :disabled="saving" @click="$emit('cancel')">
        {{ t('取消') }}
      </el-button>
      <el-button
        type="primary"
        native-type="submit"
        :loading="saving"
        :disabled="!form.name.trim() || initializing || resolving || !!generationError"
      >
        {{ t('保存') }}
      </el-button>
    </div>
    <div class="form-grid person-basics">
      <el-form-item :label="t('姓名')" required>
        <el-input v-model="form.name" maxlength="200" />
      </el-form-item>
      <el-form-item :label="t('性别')">
        <el-select v-model="form.gender">
          <el-option :label="t('未定')" value="unknown" />
          <el-option :label="t('男')" value="male" />
          <el-option :label="t('女')" value="female" />
        </el-select>
      </el-form-item>
      <el-form-item :label="t('世代')">
        <el-input v-if="person?.is_pre_genealogy" :model-value="t('谱前祖先')" disabled />
        <el-input-number
          v-else
          v-model="generation"
          :disabled="derived.length > 0 || resolving"
          :min="1"
          :controls="false"
        />
      </el-form-item>
    </div>
    <section v-if="familyId && !hideRelations" class="optional-links">
      <div class="ui-card-header">
        <strong>{{ t('亲属关系') }}</strong>
        <el-button
          :disabled="saving"
          @click="links.push({ key: nextKey++, role: 'parent', person_id: undefined })"
        >{{ t('添加关系') }}</el-button>
      </div>
      <div v-for="(link, index) in links" :key="link.key" class="optional-link-row">
        <el-select
          v-model="link.role"
          :aria-label="t('所选人物与当前人物的关系')"
          :disabled="saving"
        >
          <el-option :label="t('父母')" value="parent" />
          <el-option :label="t('配偶')" value="spouse" />
          <el-option :label="t('子女')" value="child" />
        </el-select>
        <PersonPicker v-model="link.person_id" :family-id="familyId" />
        <el-button link type="danger" :disabled="saving" @click="links.splice(index, 1)">{{
          t('移除')
        }}</el-button>
      </div>
    </section>

    <el-form-item class="person-remark" :label="t('备注')">
      <el-input
        v-model="form.remark"
        type="textarea"
        :rows="6"
        :placeholder="t('可填写来源、更新时间、年龄及其他补充信息')"
      />
    </el-form-item>

    <p v-if="generationError" class="error-text" role="alert">{{ generationError }}</p>
  </el-form>
</template>
<script setup lang="ts">
import { t } from '../i18n';

import { computed, onMounted, reactive, ref, watch } from 'vue';
import { api } from '../api';
import type { Person, PersonInput, PersonLink } from '../api';
import PersonPicker from './PersonPicker.vue';
const props = defineProps<{
  person?: Partial<Person>;
  saving: boolean;
  familyId?: number;
  pageEditor?: boolean;
  hideRelations?: boolean;
}>();
const emit = defineEmits<{ save: [data: PersonInput]; cancel: [] }>();
let nextKey = 0;
const links = reactive<Array<{ key: number; person_id?: number; role: PersonLink['role'] }>>([]);
const relatives = ref<Record<number, Person>>({});
const resolving = ref(false);
const lookupError = ref('');
const initializing = ref(!!props.person?.id && !!props.familyId);
const initialLinks = ref('');
const linkSignature = computed(() =>
  JSON.stringify(
    links
      .filter((link) => link.person_id)
      .map((link) => [link.person_id, link.role])
      .sort(),
  ),
);
const unchanged = computed(() => !!props.person?.id && linkSignature.value === initialLinks.value);
onMounted(async () => {
  if (!initializing.value) return;
  try {
    const data = await api.getPerson(props.person!.id!);
    links.push(
      ...data.relations.map((relation) => ({
        key: nextKey++,
        person_id:
          relation.from_person_id === props.person!.id
            ? relation.to_person_id
            : relation.from_person_id,
        role: (relation.relation_type === 'spouse'
          ? 'spouse'
          : relation.to_person_id === props.person!.id
            ? 'parent'
            : 'child') as PersonLink['role'],
      })),
    );
    initialLinks.value = linkSignature.value;
    initializing.value = false;
  } catch {
    lookupError.value = t('无法加载亲属世代，请重新选择人物');
  }
});
let lookupToken = 0;
watch(
  () => links.map((link) => link.person_id),
  async (ids) => {
    const token = ++lookupToken;
    resolving.value = true;
    lookupError.value = '';
    try {
      const people = await Promise.all(
        [...new Set(ids.filter((id): id is number => !!id))].map(
          async (id) => (await api.getPerson(id)).person,
        ),
      );
      if (token === lookupToken)
        relatives.value = Object.fromEntries(people.map((person) => [person.id, person]));
    } catch {
      if (token === lookupToken) lookupError.value = t('无法加载亲属世代，请重新选择人物');
    } finally {
      if (token === lookupToken) resolving.value = false;
    }
  },
);
const derived = computed(() =>
  links.flatMap((link) => {
    const value = link.person_id ? relatives.value[link.person_id]?.generation : null;
    return value == null
      ? []
      : [value + (link.role === 'parent' ? 1 : link.role === 'child' ? -1 : 0)];
  }),
);
const generationError = computed(
  () =>
    lookupError.value ||
    (!unchanged.value &&
    (derived.value.some((value) => value < 1) || new Set(derived.value).size > 1)
      ? t('亲属关系推算的世代不一致，请调整所选人物或关系')
      : ''),
);
const form = reactive({
  name: props.person?.name || '',
  generation: props.person?.generation ?? undefined,
  gender: props.person?.gender || 'unknown',
  remark: props.person?.remark || '',
});
const generation = computed({
  get: () =>
    unchanged.value ? form.generation : derived.value.length ? derived.value[0] : form.generation,
  set: (value) => {
    form.generation = value;
  },
});
const canSave = computed(
  () =>
    !!form.name.trim() &&
    !props.saving &&
    !initializing.value &&
    !resolving.value &&
    !generationError.value,
);
defineExpose({ submit, canSave });
function submit() {
  if (
    form.name.trim() &&
    !props.saving &&
    !initializing.value &&
    !resolving.value &&
    !generationError.value
  )
    emit('save', {
      ...form,
      name: form.name.trim(),
      generation: generation.value ?? null,
      ...(props.familyId && !unchanged.value
        ? {
            links: links
              .filter((link) => link.person_id)
              .map((link) => ({ person_id: link.person_id!, role: link.role })),
          }
        : {}),
    });
}
</script>
<style scoped>
.page-editor-form .person-remark {
  margin-top: 16px;
  margin-bottom: 0;
}
.page-editor-form .person-remark :deep(textarea) {
  min-height: clamp(300px, 42vh, 640px);
  resize: vertical;
}
.person-basics {
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}
.person-basics :deep(.el-select),
.person-basics :deep(.el-input-number) {
  width: 100%;
}
@media (max-width: 600px) {
  .person-basics {
    grid-template-columns: 1fr;
  }
}
.optional-links {
  margin-top: 16px;
}
.optional-link-row {
  display: grid;
  grid-template-columns: 90px minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
}
</style>
