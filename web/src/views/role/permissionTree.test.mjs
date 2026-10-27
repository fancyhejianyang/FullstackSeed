import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import ts from 'typescript';

const source = await readFile(
  new URL('./permissionTree.ts', import.meta.url),
  'utf8',
);
const { outputText } = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
});
const { buildPermissionTree, permissionTreeCodes, mergePermissionSelection } =
  await import(
    `data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`
  );
const module = (code, actions) => ({
  code,
  name: code,
  actions: actions.map((code) => ({ code, name: code })),
});
const menu = (id, permissionCode, extra = {}) => ({
  id,
  name: `菜单${id}`,
  path: '/example',
  permissionCode,
  isActive: true,
  isSystem: false,
  children: [],
  ...extra,
});

test('同模块多入口只有一组唯一授权，不把 AI 动作套给普通模块', () => {
  const tree = buildPermissionTree(
    [
      menu(1, 'ContentArticle.read'),
      menu(2, 'ContentArticle.read'),
      menu(3, 'User.read'),
    ],
    [
      module('ContentArticle', ['read', 'update', 'aiGenerate']),
      module('User', ['read', 'update']),
    ],
  );
  assert.deepEqual(permissionTreeCodes(tree), [
    'ContentArticle.read',
    'ContentArticle.update',
    'ContentArticle.aiGenerate',
    'User.read',
    'User.update',
  ]);
  assert.equal(tree.length, 2);
});

test('目录只分组，布尔字符串可用，隐藏菜单不能通过未关联分组重新出现', () => {
  const tree = buildPermissionTree(
    [
      menu(1, 'ContentArticle.read,User.read', {
        children: [
          menu(2, 'ContentArticle.read', {
            isSystem: 'false',
            isActive: 'true',
          }),
        ],
      }),
      menu(3, 'User.read', { isSystem: '1' }),
      menu(4, 'HotTopic.read', { isActive: '0' }),
    ],
    [
      module('ContentArticle', ['read']),
      module('User', ['read']),
      module('HotTopic', ['read']),
      module('NewModule', ['read']),
    ],
  );
  assert.deepEqual(permissionTreeCodes(tree), [
    'ContentArticle.read',
    'NewModule.read',
  ]);
  assert.equal(tree[1].label, '未关联菜单的模块');
});

test('OSS 菜单同时承接媒体存储权限，不重复生成节点', () => {
  const tree = buildPermissionTree(
    [menu(1, 'StorageConfig.read', { path: '/third-party-config/storage' })],
    [
      module('StorageConfig', ['read']),
      module('MediaStorage', ['read', 'update']),
    ],
  );
  assert.deepEqual(permissionTreeCodes(tree), [
    'StorageConfig.read',
    'MediaStorage.read',
    'MediaStorage.update',
  ]);
});

test('取消可见勾选生效，但未展示的历史授权保持不变且不能注入额外选择', () => {
  assert.deepEqual(
    mergePermissionSelection(
      ['ContentArticle.read', 'OldModule.custom', 'User.update'],
      ['ContentArticle.read', 'ContentArticle.aiGenerate'],
      ['ContentArticle.aiGenerate', 'User.delete'],
    ),
    ['OldModule.custom', 'User.update', 'ContentArticle.aiGenerate'],
  );
});
