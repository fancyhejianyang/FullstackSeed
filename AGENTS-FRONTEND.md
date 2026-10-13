# AGENTS-FRONTEND.md

> 前端（`web/`）专属规则与约定。**核心原则：新页面以 `views/demo/` 为 demo 复制生成，本文档只写"生成规则"和"页面功能清单模板"**；组件用法（Table/Form/Dialog 等）在 [`AGENTS-COMPONENTS.md`](AGENTS-COMPONENTS.md) 集中说明；跨端契约见 `AGENTS.md`；设计规范见 `.design-spec.md`。

## 参考 Demo：`views/demo/`

**新增前端页面 = 复制 `web/src/views/demo/` 的目录结构 + `api/demo.ts` 的写法 → 按业务字段/权限码替换**。

demo 覆盖的能力：

| 文件 | 承担的功能 |
| --- | --- |
| `views/demo/Index.vue` | 列表页：搜索栏 / 表格 / 分页 / 权限操作列 / 批量删除 / 新增按钮 |
| `views/demo/Edit.vue` | 新增 & 编辑弹窗（同一个组件，用 `row` 判断态） |
| `views/demo/View.vue` | 详情弹窗（只读） |
| `api/demo.ts` | 类型定义 + CRUD 函数（列表/详情/创建/更新/删除/批量删除） |

**页面里不要重复实现"表格搜索/分页/权限控制/删除确认/批量删除"** —— 这些都在 [`Table`](AGENTS-COMPONENTS.md#table) 里；**不要重复实现"表单渲染/校验/弹窗滚动"** —— 这些在 [`Form`](AGENTS-COMPONENTS.md#form) / [`Dialog`](AGENTS-COMPONENTS.md#dialog) 里。

## 目录导航

- `src/main.ts` / `src/App.vue` — 入口与根组件
- `src/router/index.ts` — 路由 + 全局守卫
- `src/stores/` — Pinia 状态（`user.ts` 承载登录态、权限、动态菜单）
- `src/components/` — 二次封装通用组件（详见 [`AGENTS-COMPONENTS.md`](AGENTS-COMPONENTS.md)）
- `src/utils/` — 纯函数（`request.ts` / `format.ts` / `permission.ts`）
- `src/api/<module>.ts` — 按模块建接口文件，参考 `api/demo.ts`
- `src/layouts/MainLayout.vue` — 主布局，侧边菜单**动态渲染**（后端 `/menus/mine` 下发）
- `src/views/<module>/` — 业务模块目录，参考 `views/demo/`
- `src/styles/` — 全局 SCSS（token / 工具类 / 入口）

## 技术栈

| 层 | 选型 |
| --- | --- |
| 框架 | Vue 3（`<script setup>` + Composition API + TS） |
| 构建 | Vite |
| UI | Element Plus |
| 路由 | Vue Router |
| 状态 | Pinia |
| 请求 | Axios（`utils/request.ts` 统一封装） |
| 样式 | SCSS + 设计 token / 工具类 |

## 开发与构建命令

- 安装：`npm install`
- 开发：`npm run dev`（`http://localhost:5173`，`/api` 代理至后端 4000）
- 构建：`npm run build`
- 预览：`npm run preview`
- 类型检查：`npm run type-check`
- 组件复用检查：`npm run check:components -- [文件或目录]`（只读）

### 组件复用检查脚本

单文件脚本 `web/scripts/checkComponentUsage.mjs` 只采集线索，交给 AI 阅读实际场景后决定是否及如何复用封装组件，不判断违规、不替换代码。在项目根目录运行：

```powershell
# 指定单文件或目录，也可传多个路径
node web/scripts/checkComponentUsage.mjs web/src/views/LoginView.vue
node web/scripts/checkComponentUsage.mjs web/src/views web/src/layouts

# JSON 报告适合交给 AI 或自行重定向保存
node web/scripts/checkComponentUsage.mjs web/src --json
```

在 `web/` 内可用 `npm run check:components -- src/views/LoginView.vue`。无路径默认扫描 `web/src` 下的 `.vue` 文件；显式路径及 `--mapping 声明文件` 相对**执行命令时的工作目录**，不支持 glob，含空格的路径需加引号。需要纯 JSON 时直接用 `node` 命令，或使用 `npm run --silent check:components -- ... --json`。

- 报告附上 `GlobalComponents` 的本地 `.vue` 映射作为参考，第三方 El*/Router* 映射不列为项目封装。映射不是必用清单，不维护“原组件 → 必须替换为某组件”的规则。
- 默认采集自定义组件标签、原生表单标签和导入文本，输出文件路径、行列、命中文本及前后两行上下文。组件实现文件也正常扫描，是否属于合理的内部使用由 AI 判断。
- 这是逐行文本匹配，不分析 Vue/TS 语义：注释、字符串、类型导入也可能命中，别名、动态及跨行语法可能遗漏。命中不等于需替换，未命中不等于已正确复用；AI 必须再阅读原文件及组件契约。
- 目录遍历时跳过依赖、构建产物和符号链接，重叠路径去重；显式指定依赖/产物目录内的文件仍会扫描。只读取文件，不执行扫描内容或修改自动生成声明。不自动接入 build、提交钩子或修复流程。
- 退出码：采集完成返回 `0`，参数、路径或映射读取失败返回 `1`；没有严格模式或“违规数”。JSON 保留零命中文件、实际扫描数及跳过路径，便于确认扫描范围。

通用采集函数 `collectMatches({ targets, pattern, extensions, context })` 可单独导入，复用于其他文本检查；无需组件映射，不触发 CLI。`pattern` 为逐行匹配的正则，`extensions` 默认 `['.vue']`，`context` 默认 `2`，例如：

```js
import { collectMatches } from './web/scripts/checkComponentUsage.mjs';
const result = await collectMatches({
  targets: ['web/src'], pattern: /TODO|FIXME/g,
  extensions: ['.vue', '.ts'], context: 1,
});
console.log(result);
```

## 黑名单目录与文件（禁止改动）

- `node_modules/` / `dist/` / `dist-ssr/`
- `.env.local` / `.env.*.local` — 本地私有环境变量
- `components.d.ts` / `auto-imports.d.ts` — 插件自动生成，禁手改
- `*.tsbuildinfo` / `*.log`

## 白名单目录（AI 可读写）

- `src/**` — 全部源码
- `index.html`
- `.env.example`
- 工程配置：`package.json` / `vite.config.ts` / `tsconfig*.json` / `env.d.ts`

## 新增业务模块（前端 5 步）

> 前置：后端 `Foo` 模块已按 [`AGENTS-BACKEND.md`](AGENTS-BACKEND.md) 完成。**动作命名严格 `read/create/update/delete/batchDelete`**。

1. **复制 demo**：把 `views/demo/` 整个目录复制为 `views/foo/`；把 `api/demo.ts` 复制为 `api/foo.ts`。
2. **改类型 & API**：把 `api/foo.ts` 里的 `Demo`/`DemoForm`/`QueryDemoParams` 与 5 个函数改为 `Foo` 语义；接口路径 `/demo` → `/foos`。
3. **改列表页 `Index.vue`**：改 `columns` 和 `searchFields` 字段；`perm-module="foo"`；`request`/`deleteRequest`/`batchDeleteRequest` 换成 `foo.ts` 里的函数。
4. **改弹窗 `Edit.vue` / `View.vue`**：改 `Form` 的 `fields` 与 `rules`；改初值/提交时的字段名。
5. **加路由**：`router/index.ts` 增 `{ path:'foos', name:'foos', component:()=>import('@/views/foo/Index.vue'), meta:{title:'Foo 管理', permission:'Foo.read'} }`。

**侧边栏**：不用改。后端 `SEED_MENUS` 加了新菜单、重启后 `MainLayout` 通过 `/menus/mine` 自动渲染。

## 页面功能清单（用于向 AI 描述新页面时的最小规格）

新页面只需描述以下几点，其余按 demo 复用：

- **模块信息**：模块名（如 `Foo`）、路由路径（如 `/foos`）、权限码前缀（如 `Foo`）
- **列表页功能勾选**：搜索字段列表 / 表格列列表 / 是否启用 批量删除 / 是否启用 勾选列 / 特殊列（用 `#column-<prop>` 插槽）
- **编辑弹窗字段**：字段名 + 类型（`input/textarea/select`）+ 是否必填 + 特殊控件（列日期选择器等 → `#field-<prop>` 插槽）
- **详情弹窗字段**：需展示哪些只读字段
- **权限规则例外**：默认按 `perm-module` 自动拼；如需自定义按钮权限或隐藏某内置按钮，另说

只要给出上述规格，AI 就能对照 `views/demo/` demo 生成整套页面。

## 前端 CRUD 通用约定（不重复写组件细节）

- **菜单模块目录规范**：`views/<module>/` 小写目录 + 标准文件名 `Index.vue` / `Edit.vue` / `View.vue`
- **组件选型**：列表 → Table；表单 → Form；弹窗 → Dialog；外壳 → PageContainer。**用法见 [`AGENTS-COMPONENTS.md`](AGENTS-COMPONENTS.md)**
- **请求**：从 `@/utils/request` 引入，按模块封装 `api/<module>.ts`
- **权限**：Table 传 `perm-module="<module>"` 自动接管；页面外的按钮判断用 `useUserStore().hasPermission('Module.action')`
- **颜色**：操作按钮 / tag 走 `.design-spec.md` 第 6 节；用 `getPermissionActionColor(code)` 与 `getPermissionActionLabel(code)`；禁止硬编码 `type`
- **表单校验**：提交前 `await formRef.value?.validate()`
- **状态管理**：跨页共享用 Pinia store（`stores/`），组件局部用 `ref/reactive`

## 字段对齐 checklist（每次新模块必核）

- 前端 `Foo` 类型字段名 = 后端 DTO 字段名 = 实体字段名（camelCase）
- 权限码：`Module.action` 五种动作
- 分页返回：`{list, total}`
- 布尔：`boolean`；日期：ISO string → `formatDateTime` 显示

## 前端易踩坑

- **权限动作命名**：Table 内部会把 `view→read`、`edit→update` 映射；页面只传模块名小写
- **删除交互**：优先用 `deleteRequest` 让 Table 内部执行 + 自动刷新，避免自写 `ElMessageBox.confirm + refresh`
- **弹窗关闭**：`Dialog` 已 `destroy-on-close`；`Edit.vue` 里 `watch(visible)` 只需在 `visible=true` 时填充初值
- **图标**：Element Plus Icons 通过 unplugin 自动导入，组件名 PascalCase，无需手动 `import`
- **组件写法请勿在业务页里重造**：如需扩展 `Table` 能力，改公共组件本身而不是页面内 hack；改动请同步 [`AGENTS-COMPONENTS.md`](AGENTS-COMPONENTS.md)
