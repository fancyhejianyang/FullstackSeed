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
- 检查器测试：`npm run test:components`

### 组件复用检查脚本

脚本为 `web/scripts/checkComponentUsage.mjs`。在项目根目录运行：

```powershell
# 指定单文件或目录，也可传多个路径
node web/scripts/checkComponentUsage.mjs web/src/views/LoginView.vue
node web/scripts/checkComponentUsage.mjs web/src/views web/src/layouts

# 只检查 Form / Button 的复用，严格模式发现候选时返回非零退出码
node web/scripts/checkComponentUsage.mjs web/src/views --only Form,Button --strict

# JSON 报告适合程序消费或自行重定向保存
node web/scripts/checkComponentUsage.mjs web/src --json

# 原生 HTML 提醒需要显式开启，可排除已确认的特殊页面
node web/scripts/checkComponentUsage.mjs web/src --include-native --exclude web/src/views/demo
```

在 `web/` 内可用 `npm run check:components -- src/views/LoginView.vue`。无路径默认扫描 `web/src`；显式路径、`--mapping`、`--config`、`--exclude` 均相对**执行命令时的工作目录**，不支持 glob，含空格的路径需加引号。

规则来源：

- `components.d.ts` 中 `GlobalComponents` 的本地 `.vue` 映射提供项目组件名单。El*、Router* 等第三方映射不算项目封装，也不意味着每页必须用完名单中的组件。
- `scripts/componentUsageRules.json` 声明“原始组件 → 封装候选”，如 `ElForm → Form`、`ElButton → Button`。映射表中实际存在的目标才启用规则；也可通过 `--mapping` / `--config` 指定其他声明或规则文件。自定义规则中不存在的目标会明确报错。
- `replacements` 检查底层组件，`native` 定义可选的原生控件提醒，值均为非空组件名数组。检查器只建议候选，不承诺接口可直接互换。例如 Input 的 `mode`、多选的数据格式、上传时机等仍需人工判断。
- 默认仅豁免规则目标组件的实现文件，`implementationComponents` 可补充基础封装。不会整片豁免 `src/components`，例如组合组件 `AiWorkflowEditor` 仍会检查。`--include-wrappers` 可检查基础实现，但通常会产生预期内提醒。
- 默认跳过依赖、构建产物和符号链接。扫描文件本身、自动生成声明以及规则文件都不会被修改；不要为消除报告直接编辑 `components.d.ts`。

检测范围与报告：

- 解析 Vue HTML 模板及显式运行时组件导入，识别 PascalCase / kebab-case、导入别名、Element Plus 子路径和命名空间、静态 `<component is>` / `:is`。注释、脚本文字、样式内容和 type-only 导入不作为组件使用。
- 每文件列出“已引用封装”和带行列的复用候选。已引用包含运行时导入，不证明组件最终参与渲染。没有引用任何封装也不自动判定为违规。
- 不强制把 `ElCard` 替换为 `PageContainer`，不对 `ElFormItem`、`ElOption` 等无独立封装的子组件重复报警。原生 `<form>` 不等同于 `<Form>`，原生控件默认关闭提醒。
- 无法静态确定的动态 `:is` 单独列入待检查项。render/JSX、异步组件、运行时注册、跨文件间接导出和 Form 字段配置的运行时结果不在完整分析范围内。外部 template/script src 或 Pug 模板会明确报错，不假装已检查。
- 退出码：`0` 表示检查完成（默认即使有提醒也不阻断），`--strict` 下有复用候选返回 `1`，参数、路径、映射或解析错误返回 `2`。待人工检查项不会单独触发严格模式失败；零提醒不代表完整合规。

此工具是框架整理辅助，不自动接入 build、提交钩子或批量修复流程。测试只在随机临时目录生成 fixture，结束后清理，不更改业务页面。

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
