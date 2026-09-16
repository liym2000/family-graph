import type { App } from 'vue';
import {
  ElAlert,
  ElButton,
  ElConfigProvider,
  ElDescriptions,
  ElDescriptionsItem,
  ElDialog,
  ElDrawer,
  ElDropdown,
  ElDropdownItem,
  ElDropdownMenu,
  ElEmpty,
  ElForm,
  ElFormItem,
  ElInput,
  ElInputNumber,
  ElOption,
  ElPagination,
  ElPopover,
  ElRadio,
  ElRadioButton,
  ElRadioGroup,
  ElSelect,
  ElSkeleton,
  ElSlider,
  ElTable,
  ElTableColumn,
  ElTag,
  ElTooltip,
} from 'element-plus';

const components = [
  ElAlert, ElButton, ElConfigProvider, ElDescriptions, ElDescriptionsItem,
  ElDialog, ElDrawer, ElDropdown, ElDropdownItem, ElDropdownMenu, ElEmpty,
  ElForm, ElFormItem, ElInput, ElInputNumber, ElOption, ElPagination, ElPopover,
  ElRadio, ElRadioButton, ElRadioGroup, ElSelect, ElSkeleton, ElSlider,
  ElTable, ElTableColumn, ElTag, ElTooltip,
];

// Keep production and component tests on the same set of registered controls.
export const elementPlus = {
  install(app: App) {
    for (const component of components) app.use(component);
  },
};
