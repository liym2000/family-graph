import type { TreePerson } from '../../api';
export type TreeNode = {
  key: string;
  person: TreePerson;
  x: number;
  y: number;
  height: number;
  parent?: TreeNode;
  repeat: boolean;
  group: string;
};
export type TreeMode = 'tree' | 'dots' | 'radial';
export type TreeLayout = {
  nodes: TreeNode[];
  width: number;
  height: number;
  paths: Map<string, string>;
};
