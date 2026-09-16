import { ref, type ComputedRef, type Ref } from 'vue';
import { type TreePerson } from '../../api';
import { buildTreeSvg, downloadTreeSvg, printTree } from '../../export/treeExport';
import { t } from '../../i18n';
import type { TreeLayout, TreeMode } from './types';
import type { useTreeBranches } from './useTreeBranches';
export function useTreeExport(
  tree: ReturnType<typeof useTreeBranches>,
  layout: ComputedRef<TreeLayout>,
  spousesFor: (person: TreePerson) => TreePerson[],
  layoutMode: Ref<TreeMode>,
) {
  const { root, busy, error, expandAll } = tree;
  const exportDialog = ref(false),
    exporting = ref(false),
    exportScope = ref('current'),
    exportFormat = ref('svg'),
    exportLayout = ref<TreeMode>('tree');
  async function exportTree() {
    if (!root.value || busy.value || exporting.value) return;
    const token = tree.getVersion();
    const printWindow = exportFormat.value === 'svg' ? undefined : window.open('', '_blank');
    if (exportFormat.value !== 'svg' && !printWindow) {
      error.value = t('请允许打开打印窗口');
      exportDialog.value = false;
      return;
    }
    exporting.value = true;
    exportDialog.value = false;
    try {
      if (exportScope.value === 'all') {
        await expandAll();
        if (token !== tree.getVersion() || tree.isStopped() || error.value) {
          printWindow?.close();
          return;
        }
      }
      const title = root.value.name + ' · ' + t('家族树');
      const document = buildTreeSvg(
        layout.value.nodes.map((n) => ({ ...n, spouses: spousesFor(n.person) })),
        title,
        exportLayout.value,
      );
      if (printWindow) printTree(printWindow, document, exportFormat.value === 'tiles', title);
      else downloadTreeSvg(document.svg, title);
    } catch (e) {
      printWindow?.close();
      error.value = e instanceof Error ? e.message : t('导出失败');
    } finally {
      exporting.value = false;
    }
  }

  function openExport() {
    exportLayout.value = layoutMode.value;
    exportDialog.value = true;
  }
  return {
    exportDialog,
    exporting,
    exportScope,
    exportFormat,
    exportLayout,
    exportTree,
    openExport,
  };
}
