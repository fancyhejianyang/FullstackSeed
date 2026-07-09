# CHANGELOG

> 本文件用于存放项目变更快照（最新在上）。

## 修改快照记录

> 每次改动完成后在此追加快照记录（最新在上）。

<!-- 示例：
### YYYY-MM-DD 简述
- 新增：path/to/file
- 修改：path/to/file
- 删除：path/to/file
- 说明：本次改动目的与验证情况
-->

### 2026-06-26 AGENTS 文档以 articles demo 驱动 + 抽出组件契约文档
- 新增：
  - `AGENTS-COMPONENTS.md`（通用组件与工具契约：PageContainer/ProTable/ProForm/ProDialog/MenuTree/请求封装/权限工具/user store 的 props/emits/插槽/用法一览）
- 修改：
  - `AGENTS.md`（顶部新增「参考 Demo（跨端约定）」段：后端参考 `articles/`、前端参考 `views/article/`、组件用法引用 `AGENTS-COMPONENTS.md`；跨端总览 8+6 步 → 6+5 步；根目录导航 + 专题文档列表补 `AGENTS-COMPONENTS.md`）
  - `AGENTS-BACKEND.md`（重写为以 `articles/` demo 驱动：新增模块由 8 步精简为 6 步 = 复制 → 改字段 → 改权限码 → 挂根模块 → SEED 权限 → SEED 菜单；新增「模块规格清单」用于向 AI 描述新模块最小信息）
  - `AGENTS-FRONTEND.md`（重写为以 `views/article/` demo 驱动：新增页面由 6 步精简为 5 步 = 复制 → 改类型&API → 改列表 → 改弹窗 → 加路由；组件用法细节全部移除，引用 `AGENTS-COMPONENTS.md`；新增「页面功能清单」用于向 AI 描述新页面最小信息）
- 删除：无
- 说明：将文档改为 demo 驱动 + 组件契约集中化，页面文档只写"新增流程"和"功能清单"，避免与组件源码/示例重复。新页面/模块 AI 只需读 `AGENTS-*.md` 三份 + 对照 demo 即可一把成功。仅文档结构调整，未 build。

### 2026-06-26 AGENTS 拆分为前后端专属文档
- 新增：
  - `AGENTS-BACKEND.md`（后端目录导航/技术栈/命令/编码检查项/黑白名单/示例模块/后端 CRUD 规则/新增模块后端 8 步/后端易踩坑）
  - `AGENTS-FRONTEND.md`（前端目录导航/技术栈/命令/黑白名单/示例模块/前端 CRUD 规则/新增模块前端 6 步/字段对齐/前端验证/前端易踩坑）
- 修改：`AGENTS.md`（瘦身为项目概览 + 跨端规则：Agent 工作规则、字段与命名规则、变更前后输出格式、执行流程、新增模块跨端总览、专题文档导航链；前后端专属细节全部迁出）
- 删除：无
- 说明：将 AGENTS.md 中前后端专属内容按端拆分为独立文档，AGENTS.md 只保留跨端契约与导航，便于按需检索、后续独立演进。仅文档结构调整，未 build。

### 2026-06-26 AGENTS 新增「新增业务模块 CRUD 作业清单」
- 新增：无
- 修改：`AGENTS.md`（前后端 CRUD 规则章节之后新增作业清单：后端 8 步 / 前端 6 步 / 字段对齐 checklist / 验证要点 / 易踩坑）
- 删除：无
- 说明：将新增业务模块的标准动作固化为精简清单，便于 AI 与开发者按序执行、一把成功；覆盖实体→DTO→Service→Controller→Module→根挂载→SEED 权限→SEED 菜单→前端 API→模块目录（Index/Edit/View）→路由，动态侧边栏无需手改。仅文档变更，未 build。

### 2026-06-26 权限列 tag 文案去模块名（复用短标签映射）
- 新增：无
- 修改：`web/src/views/permission/Index.vue`（操作权限列 tag 文案由 `op.name`（含模块名，如「批量删除文章」）改为 `getPermissionActionLabel(op.code)`（如「批量删除」））
- 删除：无
- 说明：按 `.design-spec.md` 第 6.4 节短标签映射统一 tag 文案，去除冗余模块名（模块信息由所属行菜单已表达）。仅静态改动，未 build。

### 2026-06-26 操作按钮/权限 Tag 配色标准封存
- 新增：
  - `web/src/utils/permission.ts`（`getPermissionActionColor` / `getPermissionActionLabel` / `getPermissionAction`：按权限码动作后缀返回 Element Plus 语义 `type` 与中文短标签，未识别 → info 兜底）
- 修改：
  - `web/src/views/permission/Index.vue`（操作权限列 tag 改用 `getPermissionActionColor(op.code)`）
  - `web/src/components/ProTable.vue`（内置操作列「查看」按钮 `type=primary` → `type=info`，与规范对齐）
  - `.design-spec.md`（新增第 6 节「操作按钮 / 权限 Tag 配色标准」：动作 → type 映射表、通用规则、强制使用点、短标签映射）
  - `AGENTS.md`（前端 CRUD 规则补一条配色标准索引，指向 `.design-spec.md` 第 6 节）
- 删除：无
- 说明：将「操作按钮/权限 Tag 配色」封存为设计规范：`read/view=info`、`create=success`、`update/edit=primary`、`delete/batchDelete=danger`、`export/import/audit=warning`；全站按动作后缀语义映射，禁止硬编码 `type`。已 `npm.cmd run build` 通过（exit 0）。

### 2026-06-26 启动自动归属权限到菜单（menuId 回填）
- 新增：无
- 修改：
  - `server/src/users/users.module.ts`（imports 加 `Menu` 仓库）
  - `server/src/users/users.service.ts`（新增 `ensurePermissionMenuId`：遍历菜单表，按 `permissionCode` 的 Module 前缀 + `MENU_NAME_TO_MODULE` 兜底，回填权限点 `menuId`；在 `onModuleInit` 里于 `ensurePermissions` 后执行）
  - `server/src/menus/menus.service.ts`（seed 中文章管理菜单补 `permissionCode: 'Article.read'`）
- 删除：无
- 说明：修复"权限管理页对应菜单行看不到操作权限"——原因是 `SEED_PERMISSIONS` 从未设 `menuId`。新增启动自动归属：按菜单 permissionCode 或 name 反查 Module，将 `Module.*` 权限点回填 menuId。**只回填 menuId 为空的权限**，人工调整过的归属不会被覆盖。已 `npm.cmd run build` 通过（exit 0）。**需重启后端使归属生效**。

### 2026-06-26 清理旧权限编码 + Article 接口补齐 RBAC
- 新增：无
- 修改：
  - `server/src/users/users.service.ts`（`onModuleInit` 开头新增 `cleanLegacyPermissions`：启动时删除不符合 `Module.action` 规范的旧权限点，如 `user:read`/`article:view`，先解除 role_permissions 关联再物理删除）
  - `server/src/articles/articles.controller.ts`（5 个方法补齐 `@RequirePermissions('Article.read/create/update/delete')`）
  - `server/src/common/decorators/require-permissions.decorator.ts`（注释更新为规范格式示例 `User.create` 等）
- 删除：无
- 说明：修复"大小写权限共存"与"`/permissions` 返回与 `/auth/profile` 不一致"的根因——DB 里的历史小写冒号权限点会被启动时自动清理，与 `SEED_PERMISSIONS`（25 条完整 Module.action 权限）保持一致。Article 模块补齐 RBAC 装饰器后接口权限校验完整闭环。已 `npm.cmd run build` 通过（exit 0）。**需重启后端使清理生效**。

### 2026-06-26 操作权限维护弹窗改列表可编辑 + diff 提交
- 新增：无
- 修改：`web/src/views/permission/Maintain.vue`（改为列表可编辑：每行 名称/权限码/类型 均可改，「+ 新增一行」追加空行，行内「删除」本地移除；底部「保存/取消」，保存时按 diff 一次性提交 create/update/delete）
- 删除：无
- 说明：编辑体验改为「本地编辑 + 一次保存」——修改都缓存在本地，保存时按 diff 触发 create/update/delete；取消丢弃改动。校验必填 + 权限码本地去重。纯前端，零后端改动。已 `npm.cmd run build` 通过（exit 0）。

### 2026-06-26 新增 dic 字典服务初始化实例能力
- 新增：无
- 修改：
  - `web/src/dic/service.ts`（实现 `DicService.init(dicKey)` 与 `initDicService(dicKey)`，支持静态/API 字典初始化后通过实例 `items` 读取完整数据；补充 `refresh` 与数据归一化）
- 删除：无
- 说明：调用方可通过字典定义 key 初始化实例并直接读取 `items`，满足字典服务统一入口需求。

### 2026-06-26 文章模块新增 View 查看页实现
- 新增：无
- 修改：
  - `web/src/views/article/View.vue`（实现文章查看页：只读展示标题/状态/内容/创建时间/更新时间，使用 `ProDialog` 封装）
  - `web/src/views/article/Index.vue`（`handleView` 改为打开 `View.vue`，不再复用编辑弹窗）
- 删除：无
- 说明：完成文章模块 `View.vue` 标准页落地，查看与编辑职责分离，保持现有接口字段不变。

### 2026-06-26 ProTable 内置删除执行与自动刷新
- 新增：无
- 修改：
  - `web/src/components/ProTable.vue`（新增 `deleteRequest`/`batchDeleteRequest`/`rowKey`/自动刷新配置；删除与批量删除由组件内确认后执行 API 并刷新；toolbar 插槽透传 `runBatchDelete` 等能力）
  - `web/src/views/article/Index.vue`（删除/批量删除改为仅传 API 输入函数，批量按钮调用 `tableRef.runBatchDelete()`）
  - `web/src/views/user/Index.vue`（删除改为仅传 `deleteRequest`）
  - `web/src/views/role/Index.vue`（删除改为仅传 `deleteRequest`）
  - `AGENTS.md`（前端 CRUD 规则补充：删除职责前移到 ProTable）
- 删除：无
- 说明：页面不再负责删除执行与手动刷新，统一由 `ProTable` 内置流程处理，并通过事件通知页面。

### 2026-06-26 新增 batchDelete 权限与 ProTable 勾选扩展
- 新增：无
- 修改：
  - `server/src/users/users.service.ts`（`SEED_PERMISSIONS` 为 `Role/Permission/User/Menu/Article` 补齐 `*.batchDelete` 权限种子）
  - `web/src/components/ProTable.vue`（新增可选 `checkAble`、`checkMode(single/multiple)`；新增 `@selection-change`、`@selection-action` 事件；`defineExpose` 增 `getSelectedRows`/`clearSelection`/`canBatchDelete`；权限动作扩展支持 `batchDelete`）
  - `AGENTS.md`（权限动作规范扩展为 `read/create/update/delete/batchDelete`，补充 ProTable 勾选扩展规范）
- 删除：无
- 说明：本次为可扩展能力增强，未引入具体业务页的批量删除接口实现。

### 2026-06-26 AGENTS 规范化瘦身（快照迁移至 CHANGELOG）
- 新增：`CHANGELOG.md`（承接原 `AGENTS.md` 的历史快照记录）
- 修改：`AGENTS.md`（移除历史快照大段内容；根目录导航/Agent 规则/输出格式/执行流程/专题文档统一改为引用 `CHANGELOG.md`）
- 删除：无
- 说明：`AGENTS.md` 仅保留规范、限制与导航，历史变更快照统一沉淀到 `CHANGELOG.md`，降低文档噪音并提升可维护性。

### 2026-06-26 前端权限动作与 CRUD 编码统一
- 新增：无
- 修改：
  - `web/src/components/ProTable.vue`（权限校验动作由 `view/edit/delete` 对齐为 `read/update/delete`，保留事件名 `@view/@edit/@delete`）
  - `web/src/views/article/Index.vue`（新增按钮接入 `Article.create` 权限控制）
  - `web/src/views/user/Index.vue`（新增按钮接入 `User.create` 权限控制）
  - `web/src/views/role/Index.vue`（新增按钮接入 `Role.create` 权限控制）
  - `AGENTS.md`（补充 CRUD 编码统一为 `read/create/update/delete`，并明确 ProTable 的 `view→read`、`edit→update` 映射）
- 删除：无
- 说明：纯前端权限显示与规范文档对齐，不改后端接口与权限点数据结构。

### 2026-06-26 内置权限种子补齐示例模块 Article
- 新增：无
- 修改：
  - `server/src/users/users.service.ts`（`SEED_PERMISSIONS` 新增 `Article.read/create/update/delete` 四个示例模块权限点）
  - `AGENTS.md`（后端 CRUD 规则补充：内置权限种子需覆盖 `Article.*` 示例模块；追加本次快照）
- 删除：无
- 说明：纯后端规则与种子补齐，不涉及前端字段改动。按 seed 幂等策略仅补缺失权限，不影响已存在权限记录。

### 2026-06-22 用户删除/创建的内置账号保护
- 新增：无
- 修改：
  - `server/src/users/users.service.ts`（新增 `RESERVED_USERNAMES=['root','admin']` 常量；`create` 拒绝创建保留名同名账号；`remove(id, currentUserId)` 新增「禁止删除自身」「禁止删除系统内置账号」校验，引入 `ForbiddenException`）
  - `server/src/users/users.controller.ts`（`remove` 通过 `@CurrentUser()` 取当前登录用户 id 传入 service；`AuthUser` 用 `import type` 规避 TS1272）
- 删除：无
- 说明：纯后端逻辑，不涉及前端字段。保留名比对统一 `toLowerCase()` 忽略大小写。已 `npm.cmd run build` 自测通过（exit 0）。

### 2026-06-23 权限管理改菜单驱动列表 + 操作权限维护弹窗
- 新增：`web/src/views/permission/Maintain.vue`（某菜单下操作权限维护弹窗：已有列表+删除 / 内联新增表单，新增自动带 menuId）
- 修改：`web/src/views/permission/Index.vue`（改为菜单树形表格 `el-table`：菜单名称/路由/菜单权限码/**操作权限列**（tag 展示该菜单下 button/api 权限）/维护按钮；并行拉菜单树 + 全部权限按 menuId 聚合）、`AGENTS.md`（快照）
- 删除：`web/src/views/permission/Edit.vue`（权限维护统一走 Maintain 弹窗）
- 说明：权限管理改为以菜单为主体的列表，每行一个菜单，操作权限列展示其下按钮/接口权限，点「维护操作权限」弹窗增删。纯前端（后端 Permission.menuId 已就绪）。本页只管操作权限，菜单本身 CRUD 留给后续菜单管理页。已 `npm.cmd run build` 通过（exit 0）。

### 2026-06-23 权限按菜单真实归属（Permission.menuId 关联，前后端打通）
- 新增：无
- 修改：
  - 后端：`server/src/permissions/entities/permission.entity.ts`（加 `menuId: number|null`）、`permissions/dto/permission.dto.ts`（Create/Update 加可选 `menuId`）
  - 前端：`web/src/api/permission.ts`（Permission/PermissionForm 加 `menuId`）、`web/src/views/permission/Edit.vue`（加「归属菜单」下拉，拉 `/menus/mine` 拍平选择 + `defaultMenuId` 预填）、`web/src/views/permission/Index.vue`（分组依据由权限码前缀改为 **按 menuId 挂到菜单树**，含「未分组」节点；右键新增预填归属菜单）
  - `AGENTS.md`（快照）
- 删除：无
- 字段对齐：Permission 增 `menuId:number|null`；Create/Update DTO 可选 `menuId`；前端类型同步。
- 说明：权限点改为真实归属某条菜单（Menu 表），权限管理页按菜单树分组展示。开发期 synchronize 自动给 `permissions` 加 `menuId` 列，**需重启后端生效**。已前后端 `npm.cmd run build` 均通过（exit 0）。

### 2026-06-23 权限管理页改树形分组 + 右键 CRUD
- 新增：无
- 修改：
  - `web/src/views/permission/Index.vue`（由 ProTable 改为 `el-tree`：按权限码前缀 `Module` 分组成树，模块节点 + 权限叶子；自定义右键菜单——分组/叶子节点右键「新增权限」预填模块前缀，叶子右键「编辑/删除」）
  - `web/src/views/permission/Edit.vue`（新增 `codePrefix` prop，新增权限时预填权限码前缀）
  - `AGENTS.md`（快照）
- 删除：无
- 说明：权限管理页改为树形分组展示（纯前端，按 `code` 的 `.` 前缀分组，无点号归「其它」）+ 鼠标右键 CRUD。复用 `Edit.vue` 弹窗，右键新增自动带模块前缀。已 `npm.cmd run build` 通过（exit 0）。

### 2026-06-23 404 页面 + 路由兜底
- 新增：`web/src/views/error/NotFound.vue`（404 页面，回首页/返回上一页）
- 修改：`web/src/router/index.ts`（布局 children 加 catch-all 路由 `:pathMatch(.*)*` → NotFound，保留侧边栏）、`AGENTS.md`（导航、快照）
- 删除：无
- 说明：访问不存在的路由进入预制 404 页面。兜底路由放在 MainLayout children 内，保留侧边栏布局且受登录守卫保护。已 `npm.cmd run build` 通过（exit 0）。

### 2026-06-23 菜单模块 + 动态侧边栏（后端动态菜单，前后端打通）
- 新增：
  - 后端：`server/src/menus/entities/menu.entity.ts`、`menus/dto/menu.dto.ts`、`menus/menus.service.ts`、`menus/menus.controller.ts`、`menus/menus.module.ts`
  - 前端：`web/src/api/menu.ts`、`web/src/components/MenuTree.vue`（递归菜单组件）
- 修改：
  - 后端：`app.module.ts`（挂载 MenusModule）、`users/users.service.ts`（SEED 加 `Menu.*` 权限点）
  - 前端：`stores/user.ts`（加 `menus` 状态 + `fetchMenus`）、`layouts/MainLayout.vue`（侧边栏改为动态渲染 + 登录后拉 `/menus/mine`）
  - `AGENTS.md`（后端/前端导航、快照）
- 删除：无
- 字段对齐：Menu=`{id,parentId,name,path,icon,sort,type,permissionCode,isActive,children[]}`；`GET /api/menus/mine` 返回按权限过滤后的菜单树（超管全返回）；管理接口 `GET/POST/PATCH/DELETE /api/menus`（`Menu.read/create/update/delete`）。
- 设计要点：Menu 自关联（parentId）建树；`menus.service.findMine` 按 `permissionCode` 过滤（空码登录可见、超管全放行）；启动 seed 内置菜单（首页/文章/账号/角色/权限，后三者带 `User.read`/`Role.read`/`Permission.read`）。前端 `MenuTree.vue` 递归渲染 `el-sub-menu`/`el-menu-item` 支持多级。
- 说明：菜单管理页（`views/menu/`）下轮做；本轮侧边栏已动态化。已前后端 `npm.cmd run build` 均通过（exit 0）。**需重启后端使 menu seed 生效**。

### 2026-06-23 前端角色管理 + 权限管理页面（RBAC 配置 UI）
- 新增：
  - `web/src/api/role.ts`、`web/src/api/permission.ts`
  - `web/src/views/role/Index.vue`、`web/src/views/role/Edit.vue`（角色 CRUD + 权限复选框组绑定）
  - `web/src/views/permission/Index.vue`、`web/src/views/permission/Edit.vue`（权限点 CRUD + type 下拉）
- 修改：`web/src/router/index.ts`（加 `/roles`、`/permissions` 路由）、`web/src/layouts/MainLayout.vue`（菜单加角色/权限入口）、`AGENTS.md`（导航、快照）
- 删除：无
- 字段对齐：Role=`{id,code,name,description,isActive,permissions[],createdAt,updatedAt}`，写入用 `permissionIds:number[]`；Permission=`{id,code,name,type,description,...}`。复用后端既有 roles/permissions CRUD 接口。
- 说明：完成 RBAC 配置 UI——角色管理（绑权限）+ 权限点管理。复用 ProTable(`perm-module="role"`/`"permission"`)/ProForm/ProDialog，角色编辑用 `el-checkbox-group` 勾选权限。菜单为「后端动态菜单」方案，下轮实现（本轮侧边菜单仍静态）。已前端 `npm.cmd run build` 通过（exit 0）。
- 待办：ProTable 拼的 `Role.view` 与后端 SEED 的 `Role.read` 动作名不一致，非超管用户操作列权限校验会偏差；下轮统一动作命名（view/read）或补全权限点。

### 2026-06-23 修复 root 登录失败（默认超管 seed 改幂等兜底）
- 新增：无
- 修改：`server/src/users/users.service.ts`（`ensureDefaultAdmin` 由「用户表为空才建」改为「按用户名 `root` 幂等兜底：无 root 则创建」）
- 删除：无
- 说明：老库已 seed `admin`，原「表为空」判断导致 `root` 从未创建，登录报「用户名或密码错误」。改为按 `root` 用户名幂等补建（绑 admin 角色、`isAdmin=true`），老库重启即自动补 root。已 `npm.cmd run build` 通过（exit 0）。**需重启后端使 seed 生效**。

### 2026-06-23 默认超管改 root + 迁移文档 MIGRATION.md
- 新增：`MIGRATION.md`（后端标准模块迁移文档：必迁/可选模块清单、核心约定、迁移步骤、依赖清单、env 清单、前端对应）
- 修改：
  - 后端：`server/src/users/users.service.ts`（默认超管账户 `admin/admin123` → `root/root123`）
  - 前端：`web/src/views/LoginView.vue`（默认登录值与提示改 `root/root123`）
  - `AGENTS.md`（概览默认账号、根目录导航、后端 CRUD 规则补「默认超管/账号模块」标准、专题文档索引指向 MIGRATION.md、快照）
- 删除：无
- 字段对齐：默认超管契约统一为 `root/root123`，前后端一致。
- 说明：将「root 默认超管 + RBAC 账号模块」固化为 AGENTS 标准规则，并新建 `MIGRATION.md` 罗列后端必迁模块（common/auth/users/roles/permissions）与可选模块（articles demo），供项目迁移直接复刻。已后端 `npm.cmd run build` 通过（exit 0）；前端仅默认值文案改动。注意：旧库已存 `admin` 用户不会变，需清库让首启重新 seed `root`，或手动新增 root 用户。

### 2026-06-23 账号模块 + isAdmin 超级管理员（前后端打通）
- 新增：
  - 后端：`server/src/users/dto/user.dto.ts`、`server/src/users/users.controller.ts`
  - 前端：`web/src/api/user.ts`、`web/src/views/user/Index.vue`、`web/src/views/user/Edit.vue`
- 修改：
  - 后端：`users/entities/user.entity.ts`（加 `isAdmin` 字段）、`users/users.service.ts`（默认 admin `isAdmin=true`、新增 User CRUD、SEED 加 `User.*` 权限点）、`users/users.module.ts`（挂载 UsersController）、`auth/auth.service.ts`（SafeUser/JWT 带 isAdmin）、`auth/strategies/jwt.strategy.ts`（payload 带 isAdmin）、`common/decorators/current-user.decorator.ts`（AuthUser 加 isAdmin）、`common/guards/permissions.guard.ts`（`isAdmin` 放行一切）
  - 前端：`api/auth.ts`（UserInfo 加 isAdmin）、`stores/user.ts`（isAdmin 改读后端字段）、`router/index.ts`（加 `/users` 路由）、`layouts/MainLayout.vue`（菜单加账号管理）
  - `AGENTS.md`（导航、快照）
- 删除：无
- 字段对齐：`User` 增 `isAdmin:boolean`；登录/`profile` 返回 `user.isAdmin`；JWT payload 带 `isAdmin`。User 接口 `GET /api/users?page&pageSize&keyword`、`POST`、`PATCH/:id`、`DELETE/:id`，DTO 字段 `username/password/nickname/isActive/isAdmin/roleIds`，权限码 `User.read/create/update/delete`。
- 说明：超级管理员甄别——`PermissionsGuard` 与前端 `hasPermission` 在 `isAdmin===true` 时放行一切（取代原 admin 角色判断）。账号模块前后端完整 CRUD，前端按 `views/user/`（`Index.vue`+`Edit.vue`）模块规范，复用 ProTable（`perm-module="user"`）/ProForm/ProDialog。已前后端 `npm.cmd run build` 均通过（exit 0）。

### 2026-06-23 权限码格式统一为 Module.action（点号 + 首字母大写）
- 新增：无
- 修改：
  - `server/src/users/users.service.ts`（SEED_PERMISSIONS：`role:read` 等 → `Role.read`/`Permission.create` 等）
  - `server/src/roles/roles.controller.ts`、`server/src/permissions/permissions.controller.ts`（`@RequirePermissions` 全部改 `Role.*`/`Permission.*`）
  - `web/src/components/ProTable.vue`（`canDo` 拼接改为模块名首字母大写 + 点号，如 `article` → `Article.view`）
  - `AGENTS.md`（前后端 CRUD 规则权限码格式说明、快照）
- 删除：无
- 字段对齐：权限码契约由 `资源:动作`（小写冒号）统一改为 `Module.action`（首字母大写点号），前后端一致。
- 说明：契约级格式调整，守卫按字符串相等比较故逻辑无碍。已前后端 `npm.cmd run build` 均通过（exit 0）。注意：旧库已存的小写权限数据需重建（开发期 synchronize + 启动 seed 会按新码补齐，旧码记录可手动清理）。

### 2026-06-23 ProTable 权限化操作列 + 前端 RBAC 字段对齐
- 新增：无
- 修改：
  - `web/src/api/auth.ts`（`UserInfo` 增 `roles`/`permissions`，与后端登录返回对齐）
  - `web/src/stores/user.ts`（新增 `permissions`/`isAdmin`/`hasPermission`，admin 角色放行全部）
  - `web/src/components/ProTable.vue`（操作列移到首位、固定左侧；内置查看/编辑/删除按钮，新增 `perm-module`/`showView`/`showEdit`/`showDelete`/`actionWidth` props，按 `<module>:view/edit/delete` 校验权限隐藏；`@view`/`@edit`/`@delete` 事件，删除内置确认；保留 `#actions` 插槽追加自定义操作）
  - `web/src/views/article/Index.vue`（改用 `perm-module="article"` + 事件回传，移除手写操作列与删除确认）
  - `AGENTS.md`（前端 CRUD 规则补操作列/权限约定、快照）
- 删除：无
- 字段对齐：前端 `UserInfo.permissions/roles` 与后端 `POST /api/auth/login`、`GET /api/auth/profile` 返回的 RBAC 字段一致；权限码格式 `资源:动作`。
- 说明：ProTable 操作列权限化，组件传模块名自拼权限码校验，无权限隐藏、超管放行。已 `npm.cmd run build` 自测通过（exit 0）。

### 2026-06-23 ProDialog 弹窗二次封装
- 新增：`web/src/components/ProDialog.vue`（预设宽度 560、内容区 `max-height:60vh` 自动滚动+细滚动条、`align-center`/`append-to-body`/`destroy-on-close`；默认确定/取消按钮带 `confirm-loading`，`@confirm`/`@cancel` 事件，`#footer` 插槽兜底）
- 修改：`web/src/views/article/Edit.vue`（`el-dialog` 改用 `ProDialog`，移除手写 footer）、`AGENTS.md`（目录导航、前端 CRUD 规则、快照）
- 删除：无
- 说明：将 Dialog 二次封装为统一组件，预设宽高/滚动等属性，业务弹窗（如 Edit.vue）直接复用。已 `npm.cmd run build` 自测通过（exit 0）。

### 2026-06-23 ProTable/ProForm 封装 + 文章模块目录化（Index/Edit）
- 新增：
  - `web/src/components/ProForm.vue`（配置 `fields` + `#field-[prop]` 插槽驱动的表单封装，暴露 validate/resetFields）
  - `web/src/components/ProTable.vue`（搜索 ProForm + el-table + 分页集成，内部托管 loading/分页/搜索请求，暴露 refresh/search；泛型组件）
  - `web/src/views/article/Index.vue`（文章列表页，用 ProTable + columns/searchFields 配置 + 具名插槽）
  - `web/src/views/article/Edit.vue`（新增/编辑弹窗，用 ProForm）
- 修改：`web/src/router/index.ts`（路由指向 `article/Index.vue`）、`AGENTS.md`（前端 CRUD 规则新增「菜单模块目录规范」、命名规则、目录导航、示例模块、快照）
- 删除：`web/src/views/ArticleView.vue`（拆分为 `article/Index.vue` + `Edit.vue`）
- 说明：新增前端规则——每个菜单模块独立目录 `views/<module>/`，标准文件名 `Index.vue`/`Edit.vue`/`View.vue`。文章模块作为首个落地范例。封装 ProForm（表单）与 ProTable（列表集成）二次组件。已 `npm.cmd run build` 自测通过（exit 0）；修复了泛型组件 `InstanceType<typeof ProTable>` 取不到类型的 TS2344，改用显式 expose 接口类型。

### 2026-06-22 引入 SCSS + 语义化全局样式（设计 token / 工具类）
- 新增：
  - `web/src/styles/variables.scss`（设计 token：SCSS 变量 + CSS 变量双轨，与 Element Plus 主色对齐）
  - `web/src/styles/utilities.scss`（语义化原子工具类：布局/间距/文字/颜色/圆角/阴影/card，用 SCSS `@each` 生成）
  - `web/src/styles/main.scss`（样式入口：`@use` variables/utilities + 基础重置）
- 修改：`web/package.json`（新增 devDependency `sass`）、`web/src/main.ts`（引用 `./styles/main.scss`）、`AGENTS.md`（技术栈、目录导航、快照）
- 删除：`web/src/styles/main.css`、`web/src/styles/variables.css`（迁移至 SCSS）
- 说明：自建一套语义化全局样式（设计 token + Tailwind 风格原子类），改用 SCSS 编写。未启用 preflight 全局重置，避免与 Element Plus 冲突。新增依赖 `sass` 由开发者安装后即可 `npm run dev`；安装前无法 build 验证（属新功能，待装 sass 后跑 `npm run build`）。

### 2026-06-22 优化侧边栏菜单 hover 配色（深色科技蓝）
- 新增：`.design-spec.md`（全局设计规范，确立深色科技蓝配色/字体/图标/Logo）
- 修改：`web/src/layouts/MainLayout.vue`（菜单 hover 改为品牌蓝半透明底 + 白字，active 加 600 字重与左侧蓝色高亮条，过渡 0.2s）
- 删除：无
- 说明：原 hover 沿用 Element Plus 默认浅灰，叠加在深色侧边栏上突兀不协调。按 web-design skill 生成并持久化设计规范，将 hover/active 与品牌蓝对齐。纯前端样式改动，无后端涉及，按规则只做静态修改不 build。

### 2026-06-22 文章管理示例模块（前后端 CRUD demo）
- 新增：
  - 后端：`server/src/articles/entities/article.entity.ts`、`articles/dto/article.dto.ts`、`articles/articles.service.ts`、`articles/articles.controller.ts`、`articles/articles.module.ts`
  - 前端：`web/src/api/article.ts`、`web/src/views/ArticleView.vue`
- 修改：
  - 后端：`server/src/app.module.ts`（挂载 ArticlesModule）
  - 前端：`web/src/router/index.ts`（新增 `/articles` 路由）、`web/src/layouts/MainLayout.vue`（侧边菜单加入口）、`AGENTS.md`（示例模块、目录导航、快照）
- 删除：无
- 字段对齐：Article = `{id,title,content,status(draft|published),createdAt,updatedAt}`；接口 `GET /api/articles?page&pageSize&keyword`→`{list,total}`、`POST /api/articles`、`PATCH /api/articles/:id`、`DELETE /api/articles/:id`，前后端类型一致。
- 说明：完整 CRUD 示例模块，演示后端分层（entity/dto/service/controller/module，软删除 + Like 搜索 + 分页）与前端范式（PageContainer 封装、el-table + 分页 + 搜索、el-dialog 新增/编辑、formatDateTime 工具）。需鉴权（全局 JwtAuthGuard）。已自测：后端 `npm run build` 通过；前端 GetDiagnostics 无错误。

### 2026-06-22 后端 RBAC 权限体系（角色/权限 + 权限守卫）
- 新增：
  - `server/src/roles/entities/role.entity.ts`、`roles/dto/role.dto.ts`、`roles/roles.service.ts`、`roles/roles.controller.ts`、`roles/roles.module.ts`
  - `server/src/permissions/entities/permission.entity.ts`、`permissions/dto/permission.dto.ts`、`permissions/permissions.service.ts`、`permissions/permissions.controller.ts`、`permissions/permissions.module.ts`
  - `server/src/common/decorators/require-permissions.decorator.ts`（`@RequirePermissions()`）
  - `server/src/common/decorators/current-user.decorator.ts`（`@CurrentUser()` + `AuthUser` 类型）
  - `server/src/common/guards/permissions.guard.ts`（全局权限守卫）
- 修改：
  - `server/src/users/entities/user.entity.ts`（`@ManyToMany Role` + `user_roles` 中间表）
  - `server/src/users/users.service.ts`（启动初始化 RBAC 种子：补齐权限点、建 admin 角色绑全量权限、默认 admin 绑 admin 角色；查询带 roles/permissions 关联）
  - `server/src/users/users.module.ts`（注册 Role/Permission 实体）
  - `server/src/auth/strategies/jwt.strategy.ts`（payload 与 `request.user` 携带 roles/permissions）
  - `server/src/auth/auth.service.ts`（`SafeUser` 加 roles/permissions；登录签 token 带 RBAC；新增 flattenRbac）
  - `server/src/auth/auth.controller.ts`（profile 改用 `@CurrentUser()`，`AuthUser` 用 `import type` 规避 TS1272）
  - `server/src/app.module.ts`（挂载 Roles/Permissions 模块；注册第二个 `APP_GUARD`=PermissionsGuard）
- 删除：无
- 字段对齐（待前端任务窗口落地）：`POST /api/auth/login` 返回 `user` 扩展为 `{id,username,nickname,roles:string[],permissions:string[]}`；`GET /api/auth/profile` 同步返回 roles/permissions。统一响应壳不变。
- 设计要点：完整 RBAC（User↔Role↔Permission 多对多）；鉴权链路 `JwtAuthGuard(是否登录) → PermissionsGuard(是否有权限)`；权限编码 `资源:动作`；权限点扁平化写入 JWT，守卫零查库（改权限需重新登录生效）；`@Public()` 仍优先放行，未标 `@RequirePermissions` 的接口仅需登录。
- 说明：本次仅后端（前端权限 UI 由前端任务窗口负责）。已 `npm.cmd run build` 自测通过（exit 0，首次因 `AuthUser` 装饰器签名触发 TS1272，改 `import type` 后通过）。
- 新增：无
- 修改：
  - `server/src/auth/auth.module.ts`（`signOptions` 加断言 `as JwtModuleOptions['signOptions']`，消除 `TS2322`）
  - `AGENTS.md`（开发与构建命令新增「后端检查项」小节；本快照）
- 删除：无
- 说明：`@nestjs/jwt@11` 的 `expiresIn` 类型为 `number | StringValue`（来自 `jsonwebtoken`），`configService.get<string>(...)` 的宽泛 `string` 不可赋值，触发 `nest start` 报错 `TS2322`。加断言修复，运行期仍用 env 值。已 `npm.cmd run build` 自测通过（exit 0）。

### 2026-06-22 初始化后端 NestJS 骨架
- 新增：
  - `server/package.json`
  - `server/tsconfig.json`
  - `server/tsconfig.build.json`
  - `server/nest-cli.json`
  - `server/.prettierrc`
  - `server/eslint.config.mjs`
  - `server/.env`
  - `server/.env.example`
  - `server/.gitignore`
  - `server/src/main.ts`
  - `server/src/app.module.ts`
  - `server/src/app.controller.ts`
  - `server/src/app.service.ts`
- 修改：`AGENTS.md`（后端技术栈、命令、目录导航、项目概览）
- 删除：无
- 说明：参考 `paperProject/backend` 搭建 NestJS 最小骨架，仅含数据库配置与 app 根模块，无业务模块。未执行依赖安装（依赖与模块由开发者手动安装/添加），故未 build 验证。

### 2026-06-22 预留 JWT 与加密配置
- 新增：无
- 修改：
  - `server/.env`、`server/.env.example`（新增 `JWT_SECRET` / `JWT_EXPIRES_IN` / `BCRYPT_SALT_ROUNDS`）
  - `server/src/app.module.ts`（Joi schema 以默认值方式注册上述三项，未配置不报错）
  - `AGENTS.md`（后端技术栈表补充鉴权/加密行）
- 删除：无
- 说明：为后续用户/鉴权模块预留 JWT 与 bcrypt 配置；采用默认值而非 required，不影响当前启动。未装依赖，故未 build 验证。

### 2026-06-22 初始化前端 Vue 3 骨架
- 新增：
  - `web/package.json`
  - `web/vite.config.ts`
  - `web/tsconfig.json`、`web/tsconfig.app.json`、`web/tsconfig.node.json`
  - `web/env.d.ts`
  - `web/index.html`
  - `web/.env`、`web/.env.example`
  - `web/.gitignore`
  - `web/src/main.ts`
  - `web/src/App.vue`
  - `web/src/router/index.ts`
  - `web/src/stores/app.ts`
  - `web/src/api/request.ts`
  - `web/src/views/HomeView.vue`
  - `web/src/styles/main.css`
- 修改：`AGENTS.md`（项目概览、目录导航、前端命令、修改快照）
- 删除：无
- 说明：搭建 Vue 3 + Vite + TS + Element Plus（按需）+ Vue Router + Pinia + Axios 最小骨架。Axios 响应封装字段（`statusCode`/`data`/`success`/`message`/`timestamp`）与后端约定对齐；`/api` 通过 Vite 代理至后端 3000。依赖由开发者手动安装，故未 build 验证。

### 2026-06-22 后端首启自动建库
- 新增：无
- 修改：`server/src/app.module.ts`（TypeORM `useFactory` 改为 async，连接前用 mysql2 执行 `CREATE DATABASE IF NOT EXISTS`，utf8mb4）
- 删除：无
- 说明：解决首次启动报 `Unknown database 'fullstack_seed'`。TypeORM 仅自动建表（`synchronize`）不建库，故在连接前自动创建数据库实例，避免手动建库/建表。已 `npm run start:dev` 自测：成功启动，TypeOrm 初始化无报错，运行于 `http://localhost:3000`。

### 2026-06-22 修复前端启动报错
- 新增：无
- 修改：`web/tsconfig.node.json`（`extends` 由不存在的 `@vue/tsconfig/tsconfig.node.json` 改为 `@vue/tsconfig/tsconfig.json`，补 `module`/`moduleResolution`）
- 删除：无
- 说明：`@vue/tsconfig@0.7.0` 已移除 `tsconfig.node.json`，导致 Vite 扫描入口时 `ConfckParseError`。修复后 `npm run dev` 启动成功（Windows PowerShell 需用 `npm.cmd` 或放开执行策略）。

### 2026-06-22 synchronize 按环境动态甄别
- 新增：无
- 修改：
  - `server/src/app.module.ts`（Joi 新增 `NODE_ENV` 校验；`synchronize: !isProduction`，仅非生产开启）
  - `server/.env`、`server/.env.example`（新增 `NODE_ENV=development`）
  - `AGENTS.md`（技术栈 ORM 说明）
- 删除：无
- 说明：`synchronize` 不再硬编码，按 `NODE_ENV` 自动甄别——`production` 关闭以防误改表结构，开发/测试开启自动同步。已自测：`npm run build` 通过、`npm run start:prod` 启动成功，TypeOrm 初始化无报错。

### 2026-06-22 新增「改动验证范围」规则
- 新增：无
- 修改：`AGENTS.md`（Agent 工作规则：调整第 4 条后端自测，新增第 5 条改动验证范围）
- 删除：无
- 说明：约定任何代码改动默认只做静态检查（lint / 类型检查），除新功能外不自动 build、不自动启动服务，避免占用端口与残留进程。仅文档改动，无需验证。

### 2026-06-22 完善目录导航与黑白名单
- 新增：无
- 修改：`AGENTS.md`（目录导航按前后端分区重写并补全；黑名单填充前后端实际条目；新增「白名单目录与文件」章节）
- 删除：无
- 说明：依据实际目录结构（已扫描 `server/src`、`web/src`）更新导航；明确前后端核心黑名单（依赖/产物/敏感 env/自动生成声明）与白名单（`src/**`、`.env.example`、工程配置）。仅文档改动，无需验证。

### 2026-06-22 登录鉴权 + 中后台主布局（前后端打通）
- 新增：
  - 后端：`server/src/common/entities/base.entity.ts`、`common/decorators/public.decorator.ts`、`common/interceptors/transform.interceptor.ts`、`common/filters/http-exception.filter.ts`
  - 后端：`server/src/users/entities/user.entity.ts`、`users/users.service.ts`、`users/users.module.ts`
  - 后端：`server/src/auth/dto/login.dto.ts`、`auth/auth.service.ts`、`auth/auth.controller.ts`、`auth/auth.module.ts`、`auth/strategies/jwt.strategy.ts`、`auth/guards/jwt-auth.guard.ts`
  - 前端：`web/src/api/auth.ts`、`stores/user.ts`、`views/LoginView.vue`、`layouts/MainLayout.vue`
- 修改：
  - 后端：`server/src/app.module.ts`（挂载 Users/Auth + 全局 JwtAuthGuard）、`app.controller.ts`（`@Public()`）、`main.ts`（全局拦截器/过滤器）、`package.json`（新增 @nestjs/jwt、@nestjs/passport、passport、passport-jwt、bcrypt 及类型）
  - 前端：`web/src/main.ts`（全局注册图标）、`router/index.ts`（嵌套路由 + 守卫）、`views/HomeView.vue`（仪表盘）、`package.json`（新增 @element-plus/icons-vue）
  - `AGENTS.md`（概览、目录导航、示例模块、命名规则、CRUD 规则、变更格式、执行流程、快照）
- 删除：无
- 字段对齐：`POST /api/auth/login` 入参 `{username,password}`，返回 `{access_token,user:{id,username,nickname}}`；`GET /api/auth/profile` 返回用户信息；统一响应 `{statusCode,data,success,message,timestamp}` 前后端一致。
- 说明：登录鉴权前后端完整打通 + 中后台主布局（侧栏/顶栏/内容区）+ 首页仪表盘。默认管理员 `admin/admin123`（bcrypt，首启自动创建）。已自测：后端 `npm run build` 通过。前端新增依赖 `@element-plus/icons-vue` 由开发者安装后即可 `npm run dev`。

### 2026-06-22 前端目录分层：components / utils，request 迁移至 utils
- 新增：
  - `web/src/components/PageContainer.vue`（二次封装通用组件示例）
  - `web/src/utils/request.ts`（Axios 封装，从 `api/` 迁入）
  - `web/src/utils/format.ts`（纯函数/转换方法示例：formatDateTime、isEmpty）
- 修改：`web/src/api/auth.ts`（request 引用改为 `@/utils/request`）、`AGENTS.md`（目录导航、前端 CRUD 规则、快照）
- 删除：`web/src/api/request.ts`（迁移至 `utils/`）
- 说明：新增 `components/` 存放二次封装组件、`utils/` 存放纯函数/转换方法，并将 Axios 封装 `request.ts` 迁至 `utils/`。仅前端结构调整，已 GetDiagnostics 静态检查无错误（按规则非新功能不启动服务）。

