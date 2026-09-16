<template>
  <PageHeading>
    <div>
      <h1>{{ t('关系图谱') }}</h1>
    </div>
    <div class="ui-actions">
      <el-radio-group v-model="mode" @change="changeMode">
        <el-radio-button value="person">{{ t('人物图谱') }}</el-radio-button>
        <el-radio-button value="path">{{ t('多人联系') }}</el-radio-button>
      </el-radio-group>
      <div class="ui-actions">
        <el-button type="primary" :disabled="!from || (mode === 'path' && (!others.every(entry => entry.id) || new Set([from, ...others.map(entry => entry.id)]).size !== others.length + 1))" @click="show">
          {{ mode === 'path' ? t('查看联系') : t('查看图谱') }}
        </el-button>
      </div>
    </div>
  </PageHeading>
  <section class="surface graph-selection">
    <form class="graph-search" @submit.prevent="show">
      <div class="person-picker-grid">
        <div class="multi-person-picker">
          <div class="picker-heading"><span>{{ t('起点') }}</span></div>
          <PersonPicker
            v-model="from"
            :family-id="familyId"
            :placeholder="t('搜索并选择起点人物')"
          />
        </div>
        <template v-if="mode === 'path'">
          <div v-for="(entry, index) in others" :key="entry.key" class="multi-person-picker">
            <div class="picker-heading">
              <span>{{ t('关联人物') }}</span>
              <el-button v-if="others.length > 1" link :aria-label="t('移除此人物')" @click="others.splice(index, 1)">{{ t('移除') }}</el-button>
            </div>
            <PersonPicker v-model="entry.id" :family-id="familyId" :placeholder="t('搜索并选择人物')" />
          </div>
          <el-button v-if="others.length < 4" class="add-person-icon" :title="t('添加人物')" :aria-label="t('添加人物')" @click="others.push({ key: ++pickerKey, id: undefined })">＋</el-button>
        </template>
      </div>
    </form>
  </section>
  <LoadState :loading="loading" :error="error" @retry="load">
    <el-alert v-if="disconnectedNames.length" :closable="false" type="info" :title="t('以下人物暂未找到与起点的联系：{names}', { names: disconnectedNames.join('、') })" />
    <section v-if="center" class="graph-stage">
      <GraphView
        :family-id="familyId"
        :person-id="center"
        :relationship-graph="path"
        @select="select"
      />
    </section>
    <el-empty
      v-else
      :description="t('搜索并选择人物，开始浏览图谱')"
    />
  </LoadState>
</template>
<script setup lang="ts">
import PageHeading from '../components/PageHeading.vue';
import { t } from '../i18n';

import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { type GraphPayload } from '../api';
import { multiPersonGraph } from '../multiPersonGraph';
import { useFamily } from '../composables/useFamily';
import GraphView from '../components/GraphView.vue';
import PersonPicker from '../components/PersonPicker.vue';
import LoadState from '../components/LoadState.vue';
const { familyId } = useFamily();
const route = useRoute();
const router = useRouter();
const mode = ref('person');
const from = ref<number>();
let pickerKey = 0;
const others = ref<Array<{ key: number; id: number | undefined }>>([{ key: ++pickerKey, id: undefined }]);
const path = ref<GraphPayload | null>(null);
const disconnectedNames = ref<string[]>([]);
const loading = ref(false);
const error = ref('');
let token = 0;
const center = computed(() =>
  Number(route.query.person) > 0 ? Number(route.query.person) : undefined,
);
function show() {
  router.push({
    query: {
      person: from.value,
      members: mode.value === 'path' ? others.value.map(entry => entry.id).join(',') : undefined,
      mode: mode.value,
    },
  });
}
function changeMode() {
  path.value = null;
  router.push({ query: { person: center.value, mode: mode.value } });
}
function select(id: number) {
  router.push({ query: { person: id } });
}
async function load() {
  const id = ++token;
  path.value = null;
  error.value = '';
  disconnectedNames.value = [];
  loading.value = false;
  from.value = center.value;
  const members = String(route.query.members || route.query.to || '').split(',').map(Number).filter(id => Number.isSafeInteger(id) && id > 0).slice(0, 4);
  mode.value = members.length || route.query.mode === 'path' ? 'path' : 'person';
  others.value = (members.length ? members : [undefined]).map(id => ({ key: ++pickerKey, id }));
  if (!center.value) return;
  localStorage.setItem(
    `familyGraph.recent.${familyId.value}`,
    String(center.value),
  );
  if (!members.length) return;
  loading.value = true;
  try {
    const result = await multiPersonGraph(familyId.value, [center.value, ...members]);
    if (id === token) {
      path.value = result;
      disconnectedNames.value = result.disconnectedNames;
    }
  } catch (e) {
    if (id === token)
      error.value = e instanceof Error ? e.message : t('关系查询失败');
  } finally {
    if (id === token) loading.value = false;
  }
}
watch(() => [route.query.person, route.query.to, route.query.members, route.query.mode, familyId.value], load, { immediate: true });
</script>
<style scoped>
.graph-search { display: block; }
.person-picker-grid { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 12px; }
.multi-person-picker { min-width: 0; }
.add-person-icon { align-self:end; justify-self:start; width:38px; height:38px; padding:0; margin:0; font-size:22px; }
.picker-heading { display: flex; align-items: center; justify-content: space-between; min-height: 28px; margin-bottom: 6px; color: var(--el-text-color-secondary); font-size: 13px; }
.picker-heading :deep(.el-button) { padding: 0; font-size: 13px; }
.multi-person-picker :deep(.el-select) { width: 100%; }
.multi-person-picker :deep(.el-select__wrapper) { min-height: 38px; }
@media (max-width: 600px) {
  .person-picker-grid { grid-template-columns: minmax(0, 1fr); gap: 12px; }
}
</style>
