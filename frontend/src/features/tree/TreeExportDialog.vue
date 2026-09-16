<template>
  <el-dialog
    v-model="exportDialog"
    :title="t('导出家族树')"
    :close-on-click-modal="false"
    append-to-body
    :append-to="appendTo"
  >
    <div class="ui-actions">
      <el-button type="primary" :disabled="disabled" @click="emit('export')">{{
        t('导出')
      }}</el-button>
    </div>
    <el-form label-position="top">
      <el-form-item :label="t('导出布局')"><el-radio-group v-model="exportLayout"><el-radio value="tree">{{ t('树形') }}</el-radio><el-radio value="dots">{{ t('树形点图') }}</el-radio><el-radio value="radial">{{ t('径向全景') }}</el-radio></el-radio-group></el-form-item>
      <el-form-item :label="t('导出范围')"><el-radio-group v-model="exportScope"><el-radio value="current">{{ t('当前展开内容') }}</el-radio><el-radio value="all">{{ t('当前起点全部后代') }}</el-radio></el-radio-group></el-form-item>
      <el-form-item :label="t('导出格式')"><el-radio-group v-model="exportFormat"><el-radio value="svg">SVG</el-radio><el-radio value="pdf">{{ t('PDF（整图）') }}</el-radio><el-radio value="tiles">{{ t('PDF（A3 分幅）') }}</el-radio></el-radio-group></el-form-item>
      <p v-if="exportFormat !== 'svg'">{{ t('在打印窗口选择另存为 PDF。') }}</p>
    </el-form>
  </el-dialog>
</template>
<script setup lang="ts">
import { t } from '../../i18n';
import type { TreeMode } from './types';
defineProps<{ appendTo: HTMLElement | string; disabled: boolean }>();
const emit = defineEmits<{ export: [] }>();
const exportDialog = defineModel<boolean>({ required: true });
const exportLayout = defineModel<TreeMode>('layout', { required: true });
const exportScope = defineModel<string>('scope', { required: true });
const exportFormat = defineModel<string>('format', { required: true });
</script>
