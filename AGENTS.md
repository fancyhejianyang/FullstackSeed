# AGENTS.md

> 本文件用于 AI Agent 在本项目中的导航与规则约定。每次改动前应先扫描本文件，确认是否命中内置规则。
> **前后端专属细节已拆分**：后端见 `AGENTS-BACKEND.md`，前端见 `AGENTS-FRONTEND.md`，设计规范见 `.design-spec.md`。

## 项目概览

FullstackSeed 是一个全栈项目种子（模板），采用前后端分离结构：

| 目录        | 职责           | 状态                       | 专属文档 |
| ----------- | -------------- | -------------------------- | -------- |
| `server/`   | 后端服务       | NestJS + 登录鉴权模块已就绪 | [`AGENTS-BACKEND.md`](AGENTS-BACKEND.md) |
| `web/`      | 前端 Web 应用  | Vue 3 + 登录/主布局已就绪   | [`AGENTS-FRONTEND.md`](AGENTS-FRONTEND.md) |

> 已打通登录鉴权（JWT + bcrypt）与中后台主布局。开发默认超级管理员 `root/root123`（首启自动创建，生产环境必须通过 `ADMIN_PASSWORD` 显式配置，`isAdmin=true` 放行一切）。新业务模块/页面由开发者按示例模块扩展。项目迁移见 `MIGRATION.md`。

## 参考 Demo（跨端约定）

**新增业务模块/页面，一律按 demo 复制 → 按字段/权限码替换**，不允许从零重写：

- **后端** → 参考 `server/src/demo/`（Entity/DTO/Service/Controller/Module 五件套）
- **前端** → 参考 `web/src/views/demo/`（`Index.vue` / `Edit.vue` / `View.vue`）+ `web/src/api/demo.ts`
- **组件用法** → 见 [`AGENTS-COMPONENTS.md`](AGENTS-COMPONENTS.md)，页面文档不重复描述 Table/Form/Dialog 等的 props/emits

具体复制步骤：后端 6 步见 [`AGENTS-BACKEND.md`](AGENTS-BACKEND.md#新增业务模块后端-6-步)；前端 5 步见 [`AGENTS-FRONTEND.md`](AGENTS-FRONTEND.md#新增业务模块前端-5-步)。

## 目录导航（根目录）

- `AGENTS.md` — 本文件，项目导航与跨端规则（保持精简，不存放历史快照明细）
- `AGENTS-BACKEND.md` — 后端专属规则（以 `demo/` 为 demo；新模块 6 步/易踩坑）
- `AGENTS-FRONTEND.md` — 前端专属规则（以 `views/demo/` 为 demo；新页面 5 步/功能清单）
- `AGENTS-COMPONENTS.md` — 通用组件与工具契约（Table/Form/Dialog/PageContainer/MenuTree/utils）
- `.design-spec.md` — 设计规范（配色/字体/图标/操作按钮 & Tag 配色标准）
- `MIGRATION.md` — 后端标准模块迁移文档（项目复刻参考）
- `CHANGELOG.md` — 项目变更快照归档（最新在上）

## Agent 工作规则

以下规则在每次改动时必须遵循：

1. **先分析，再拆解**：改动前先分析需求，再拆解实现方案步骤；然后扫描本 `AGENTS.md` + 相关端专属文档（`AGENTS-BACKEND.md` / `AGENTS-FRONTEND.md`），确认是否命中内置规则。
2. **前后端对齐**：每次改动确认是否前后端均涉及更改。遵循「字段先对齐、接口稍后检查」原则——先统一前后端字段定义，再核对接口契约。
3. **改动清单**：改完代码后，列出本次涉及的「新增文件 / 修改文件 / 删除文件」列表。
4. **后端自测**：仅当改动为**新功能**时，才需重启服务或执行 build 验证；其他改动（修复、重构、配置微调等）只做静态检查（lint / 类型检查），**不要自动构建或启动服务**。
5. **改动验证范围**：默认任何代码改动只做静态检查；除非是新功能，否则不自动 build、不自动启动服务，避免占用端口与产生残留进程。
6. **修改快照**：每次改动完成后生成修改快照，统一追加到 `CHANGELOG.md`（`AGENTS.md` 不再沉淀历史快照明细）。
7. **自动提交**：每次 AI 完成代码或文档改动并通过约定验证后，默认自动创建 git commit；提交前仅暂存本次 AI 实际修改的文件，若工作区存在用户已有未提交改动，必须保持不纳入提交。用户明确要求“不提交”时跳过自动提交。

## 字段与文件命名规则（跨端契约）

> 统一前后端命名约定，避免字段歧义。

- 后端字段命名：实体/DTO 属性用 **camelCase**（如 `isActive`、`createdAt`）；数据库表名用复数小写（`@Entity('users')`）
- 前端字段命名：变量/属性 **camelCase**；接口返回字段与后端保持一致
- 接口字段对齐规则：登录令牌等接口契约字段（如 `access_token`、`statusCode`、`success`）前后端必须一字不差对齐，**改字段先改两端类型定义**
- 文件 / 目录命名：后端用 **kebab-case**（`jwt-auth.guard.ts`、`auth.module.ts`）；前端组件/页面用 **PascalCase**（`LoginView.vue`、`MainLayout.vue`），其他 ts 文件 camelCase。前端菜单模块在 `views/<module>/`（小写目录）下用标准文件名 `Index.vue`/`Edit.vue`/`View.vue`
- 组件 / 类 / 函数命名：类用 PascalCase（`AuthService`）；函数/方法 camelCase（`getProfile`）；Vue 组件名 PascalCase
- **权限码格式（前后端共契约）**：`Module.action`，模块首字母大写 + 点号，动作统一 `read/create/update/delete/batchDelete`，如 `Role.read` / `Demo.batchDelete`

## 变更前 AI 输出格式

> 改动前 AI 必须输出以下内容：

- 需求分析
- 实现方案拆解步骤
- 命中的 AGENTS 规则（含 `AGENTS-BACKEND.md` / `AGENTS-FRONTEND.md` / `.design-spec.md` 命中的条目）
- 涉及前后端范围与字段对齐方案

## 变更后 AI 输出格式

> 改动后 AI 必须输出以下内容：

- 新增文件 / 修改文件 / 删除文件 清单
- 自测 / build 验证情况
- 修改快照（写入 `CHANGELOG.md`）

## 执行流程

> 标准改动执行流程（端到端）：

1. 分析需求
2. 扫描 AGENTS.md → 命中前端则读 `AGENTS-FRONTEND.md`，命中后端则读 `AGENTS-BACKEND.md`
3. 拆解方案
4. 字段对齐 → 接口检查
5. 实现
6. 静态检查；新功能才 build / 启动自测
7. 输出改动清单与快照（同步追加到 `CHANGELOG.md`）

## 新增业务模块 CRUD（跨端总览）

> 新增一个业务模块（假设名 `Foo`，路由 `/foos`，权限码前缀 `Foo`）的标准作业总览。**核心动作是"复制 demo → 改字段/权限码"**，具体步骤见各端文档：

- **后端 6 步** → 见 [`AGENTS-BACKEND.md`](AGENTS-BACKEND.md#新增业务模块后端-6-步)：复制 `demo/` → 改字段 → 改权限码 → 挂根模块 → SEED 权限点 → SEED 菜单
- **前端 5 步** → 见 [`AGENTS-FRONTEND.md`](AGENTS-FRONTEND.md#新增业务模块前端-5-步)：复制 `views/demo/` → 改类型 & API → 改列表页 → 改弹窗 → 加路由（侧边栏动态自动接管）
- **组件用法** → 见 [`AGENTS-COMPONENTS.md`](AGENTS-COMPONENTS.md)：不要在业务页里重造 Table/Form/Dialog 的能力
- **跨端字段对齐** → 前端 `Foo` 类型 = 后端 DTO = 实体字段名（camelCase 一字不差）；权限码 `Module.action`；分页 `{list,total}`

## 专题文档列表

> 项目专题文档索引。

- [AGENTS-BACKEND.md](AGENTS-BACKEND.md) — 后端专属规则（以 `demo/` 为 demo；新模块 6 步/易踩坑）
- [AGENTS-FRONTEND.md](AGENTS-FRONTEND.md) — 前端专属规则（以 `views/demo/` 为 demo；新页面 5 步/功能清单）
- [AGENTS-COMPONENTS.md](AGENTS-COMPONENTS.md) — 通用组件与工具契约（props/emits/插槽/用法）
- [.design-spec.md](.design-spec.md) — 设计规范（配色/字体/图标/操作按钮 & Tag 配色标准）
- [MIGRATION.md](MIGRATION.md) — 后端标准模块迁移文档（必迁/可选模块、步骤、依赖、env、前端对应）
- [CHANGELOG.md](CHANGELOG.md) — 历史变更快照归档（最新在上）
