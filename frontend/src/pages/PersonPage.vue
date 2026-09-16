<template>
  <PageHeading>
    <div>
      <RouterLink class="action-link" :to="{ path: base + '/people', query: listQuery }">
        {{ t('← 人物档案') }}
      </RouterLink>
    </div>
    <div v-if="editing" class="ui-actions">
      <el-button :disabled="saving" @click="editing = false">{{ t('取消') }}</el-button>
      <el-button type="primary" :loading="saving" :disabled="!editor?.canSave" @click="editor?.submit()">{{ t('保存') }}</el-button>
    </div>
    <RouterLink
      v-else-if="person"
      class="action-link"
      :to="{ path: base + '/graph', query: { person: person.id } }"
    >
      {{ t('在图谱中查看 →') }}
    </RouterLink>
  </PageHeading>
  <LoadState :loading="loading" :error="error" @retry="load()">
    <div v-if="person" class="person-layout">
      <section class="surface">
        <div class="card-header ui-card-header">
          <h2>{{ t('基本资料') }}</h2>
          <div class="ui-actions">
            <el-button v-if="!readOnly && !editing" @click="editing = true">
              {{ t('编辑资料') }}
            </el-button>
            <el-button v-if="!readOnly && !editing" plain type="danger" :disabled="saving" @click="remove">
              {{ t('删除人物') }}
            </el-button>
          </div>
        </div>
        <PersonForm v-if="editing" ref="editor" :key="person.id" :person="person" :family-id="familyId" :saving="saving" page-editor hide-relations @save="save" @cancel="editing = false" />
        <dl v-else class="profile-fields">
          <div>
            <dt>{{ t('姓名') }}</dt>
            <dd>{{ person.name }}</dd>
          </div>
          <div>
            <dt>{{ t('世代') }}</dt>
            <dd>
              {{
                person.is_pre_genealogy ? t("谱前祖先") : person.generation
                  ? t('第 {p0} 世', { p0: person.generation })
                  : t('未填写')
              }}
            </dd>
          </div>
          <div>
            <dt>{{ t('性别') }}</dt>
            <dd>
              {{
                person.gender === 'male'
                  ? t('男')
                  : person.gender === 'female'
                    ? t('女')
                    : t('未定')
              }}
            </dd>
          </div>
          <div>
            <dt>{{ t('备注') }}</dt>
            <dd style="white-space: pre-wrap">{{ person.remark || t('暂无备注') }}</dd>
          </div>
        </dl>
      </section>
      <PersonRelations
        :person="person"
        :relations="relations"
        :siblings="siblings"
        @changed="refresh"
      />
    </div>
  </LoadState>
</template>
<script setup lang="ts">
import { useDemoMode } from '../composables/useDemoMode';
const { readOnly } = useDemoMode();
import PageHeading from '../components/PageHeading.vue';
import { t } from '../i18n';

import { computed, ref, watch } from 'vue';
import {
  onBeforeRouteLeave,
  onBeforeRouteUpdate,
  useRoute,
  useRouter,
} from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { api, type Person, type PersonInput, type Relation } from '../api';
import { useFamily } from '../composables/useFamily';
import { useFamilies } from '../composables/useFamilies';
import LoadState from '../components/LoadState.vue';
import PersonForm from '../components/PersonForm.vue';
import PersonRelations from '../components/PersonRelations.vue';
const { base, familyId } = useFamily();
const route = useRoute();
const router = useRouter();
const person = ref<Person>();
const relations = ref<Relation[]>([]);
const siblings = ref<Person[]>([]);
const loading = ref(false);
const error = ref('');
const editing = ref(false);
const saving = ref(false);
const editor = ref<InstanceType<typeof PersonForm>>();
const listQuery = computed(() => { const query = { ...route.query }; delete query.edit; delete query.review; delete query.peers; return query; });
let token = 0;
async function load(editOnLoad = false) {
  const id = ++token;
  loading.value = true;
  error.value = '';
  editing.value = false;
  try {
    const data = await api.getPerson(Number(route.params.personId));
    if (id !== token) return;
    if (Number(data.person.family_id) !== familyId.value)
      throw new Error(t('该人物不属于当前家谱'));
    person.value = data.person;
    editing.value = editOnLoad && !readOnly.value;
    relations.value = data.relations;
    siblings.value = data.siblings || [];
    localStorage.setItem(
      `familyGraph.recent.${familyId.value}`,
      String(data.person.id),
    );
  } catch (e) {
    if (id === token) {
      person.value = undefined;
      error.value = e instanceof Error ? e.message : t('无法加载人物');
    }
  } finally {
    if (id === token) loading.value = false;
  }
}
async function save(data: PersonInput) {
  if (!person.value) return;
  saving.value = true;
  try {
    person.value = (await api.updatePerson(person.value.id, data)).person;
    editing.value = false;
    await load();
    void useFamilies().load(true);
    ElMessage.success(t('已保存'));
  } catch (e) {
    ElMessage.error(e instanceof Error ? e.message : t('保存失败'));
  } finally {
    saving.value = false;
  }
}
function refresh() {
  void load();
  void useFamilies().load(true);
}
async function remove() {
  if (!person.value) return;
  try {
    await ElMessageBox.confirm(
      t('删除「{p0}」及其全部亲属关系？', { p0: person.value.name }),
      t('删除人物'),
      {
        type: 'warning',
        confirmButtonClass: 'destructive-confirm',
        confirmButtonText: t('删除'),
        cancelButtonText: t('取消'),
      },
    );
    await api.deletePerson(person.value.id);
    editing.value = false;
    localStorage.removeItem(`familyGraph.recent.${familyId.value}`);
    void useFamilies().load(true);
    await router.push(base.value + '/people');
  } catch (e) {
    if (e !== 'cancel' && e !== 'close')
      ElMessage.error(e instanceof Error ? e.message : t('删除失败'));
  }
}
async function allowLeave() {
  if (saving.value) return false;
  if (!editing.value) return true;
  try {
    await ElMessageBox.confirm(t('离开将放弃尚未保存的编辑。'), t('离开编辑'), {
      confirmButtonText: t('放弃编辑'),
      cancelButtonText: t('继续编辑'),
    });
    return true;
  } catch {
    return false;
  }
}
onBeforeRouteLeave(allowLeave);
onBeforeRouteUpdate(allowLeave);
watch(() => route.params.personId, () => load(), { immediate: true });
</script>
