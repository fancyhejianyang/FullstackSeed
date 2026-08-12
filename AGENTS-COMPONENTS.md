# AGENTS-COMPONENTS.md

> 通用组件与工具的**契约速查**。前端新页面对照 `views/article/` demo 复制后，具体渲染/交互/校验/权限全部由这里的组件封装承担；页面本身**只写"包含哪些功能"与业务字段/权限码**。
>
> 想理解页面级"用哪个组件、传什么"，看这里；想改组件本身，读源码 `web/src/components/`。

## 组件速览

| 组件 | 定位 | 页面里用来做什么 |
| --- | --- | --- |
| `PageContainer` | 页面外壳（标题 + 内容卡片） | 每个 `Index.vue` 都用它包一层 |
| `Table` | 搜索 + 表格 + 分页 + 权限操作列 + 批量操作 | 列表页主体 |
| `Form` | 配置驱动表单 + 插槽兜底 | 编辑弹窗 / 搜索栏内部使用 |
| `Dialog` | 弹窗外壳（预设宽度/滚动/确定取消） | `Edit.vue` / `View.vue` 都用它包一层 |
| `Button` | 按钮二次封装（权限码驱动 + 自动配色 + 无权限隐藏） | 业务页自定义操作按钮统一用它，禁止裸写 `el-button` + 硬编码 `type` |
| `DatePicker` / `DateRange` | 日期和日期区间选择 | 日期字段、有效期字段 |
| `Checkbox` / `CheckboxGroup` | 单选勾选和多选勾选组 | 布尔字段、少量多选枚举 |
| `InputEmail` | 邮箱输入（自动补 `@` + 后缀下拉/手输 + 内置校验） | 邮箱字段 |
| `Select` | 单选下拉（搜索防抖 + 虚拟滚动 + 键盘选择） | 表单单选字段，数据格式 `[{ value, text }]` |
| `SelectMultiple` | 多选下拉（字符串数组 + tag 折叠 + 搜索防抖 + 虚拟滚动） | 表单多选字段，`v-model` 固定为 `string[]` |
| `Switch` | 开关切换 | 启用/禁用、推荐/普通等布尔状态 |
| `UploadImage` / `UploadFile` | 图片/文件上传回显 | 调统一上传接口，业务字段保存图片/附件 URL |
| `MenuTree` | 递归渲染菜单树 | `MainLayout` 侧边栏用 |

## 工具速览（`web/src/utils/`）

| 模块 | 主要函数/常量 | 用途 |
| --- | --- | --- |
| `request.ts` | 默认导出 Axios 实例 | 全局请求封装（自动拆包 `data`、注入 Bearer） |
| `format.ts` | `formatDateTime` 等 | 日期/数字格式化 |
| `permission.ts` | `getPermissionActionColor` / `getPermissionActionLabel` / `getPermissionActionIcon` / `isDestructiveAction` / `getPermissionActionConfirmText` | 按权限码 `Module.action` 返回语义 `type`、中文短标签、内置图标名、是否需要二次确认、确认默认文案；映射表统一在此维护 |

## Store 速览（`web/src/stores/`）

| Store | 关键 state / getter | 用途 |
| --- | --- | --- |
| `user.ts` | `userInfo`、`isAdmin`、`permissions`、`hasPermission(code)`、`menus`、`fetchProfile()`、`fetchMenus()` | 登录态、鉴权判断、动态菜单 |

---

## PageContainer

**契约**：只有一个 `title` prop 和默认 slot，用来统一标题样式与内容卡片留白。

```vue
<PageContainer title="账号管理">
  <!-- 页面主体（一般是 Table） -->
</PageContainer>
```

- Props：`title: string`
- Slot：默认

---

## Table

**契约**：一站式列表页组件。**页面只需要提供**「列配置 / 搜索字段 / 请求函数 / 权限模块名 / 删除请求」——**其它都由组件托管**。

### Props

| Prop | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `columns` | `TableColumn[]` | 必填 | 列配置（`prop/label/width/minWidth/fixed/slot`），特殊列用 `slot:true` 后写 `#column-<prop>` 插槽 |
| `request` | `(params) => Promise<{list,total}>` | 必填 | 数据请求函数，接收分页与搜索参数 |
| `searchFields` | `FormField[]` | `[]` | 搜索栏字段配置（不传则不显示搜索栏） |
| `pageSizes` | `number[]` | `[10,20,50]` | 分页大小选项 |
| `permModule` | `string` | `''` | 权限模块名小写（如 `'article'`）；组件内部自动拼 `Article.read/update/delete` 校验 |
| `showActions` | `boolean` | `true` | 是否显示内置操作列（**排在首位、固定左侧**） |
| `showView` / `showEdit` / `showDelete` | `boolean` | `true` | 内置三个动作独立开关 |
| `actionWidth` | `string \| number` | `180` | 操作列宽度 |
| `checkAble` | `boolean` | `false` | 是否开启勾选列（用于批量操作） |
| `checkMode` | `'single' \| 'multiple'` | `'multiple'` | 勾选模式 |
| `rowKey` | `string` | `'id'` | 行主键字段名（批量删除提取 ids 用） |
| `deleteRequest` | `(row) => Promise<unknown>` | — | 删除 API；传入后由组件负责二次确认 + 执行 + 自动刷新 |
| `batchDeleteRequest` | `({ids,rows}) => Promise<unknown>` | — | 批量删除 API；同上 |
| `autoRefreshOnDelete` / `autoRefreshOnBatchDelete` | `boolean` | `true` | 删除成功后是否自动刷新 |

### Emits

- `@view(row)` / `@edit(row)`：内置按钮触发（页面负责弹窗）
- `@delete(row)` / `@batch-delete(rows)`：未传 `deleteRequest`/`batchDeleteRequest` 时才回退到事件由页面自处理
- `@selection-change(rows)` / `@selection-action(payload)`：勾选联动

### 插槽

- `#toolbar` — 表格上方工具栏（常放"新增"按钮）
- `#column-<prop>` — 单元格自定义（列配置需 `slot: true`）
- `#actions` — 操作列末尾追加自定义按钮

### `defineExpose`（供页面 ref 调用）

- `refresh()`：刷新表格
- `search()`：走一遍搜索
- `runBatchDelete()`：程序化触发批量删除（等价于点批量删除按钮）
- `getSelectedRows()` / `clearSelection()` / `canBatchDelete`

### 权限动作映射

- Table 内部会把按钮语义映射为动作码：`view→read`、`edit→update`、`delete→delete`
- 页面**只传模块名小写** `perm-module="article"`，无需拼动作
- 超管 `isAdmin` 放行一切；非超管无对应权限则该按钮自动隐藏

### 颜色

- 内置按钮 `查看=info` / `编辑=primary` / `删除=danger`，符合 `.design-spec.md` 第 6 节配色标准，**页面无需手配**

---

## Form

**契约**：配置驱动的表单。字段用 `fields` 配置一次性描述，需要自定义控件时开 `slot: true` 并用 `#field-<prop>` 插槽兜底。

默认 `type: 'select'` / `type: 'selectMultiple'` 已接入项目封装的 `Select` / `SelectMultiple`，业务页不用再裸写 `el-select`。历史字段里的 `options: [{ label, value }]` 会在 Form 内部转换为封装下拉需要的 `{ text, value }`；单选写回表单时会恢复原始 `value` 类型，多选按封装契约固定写回 `string[]`。需要调整 `debounce`、`virtual`、`clearable` 等封装下拉 props 时，可继续写在 `componentProps`。

### Props

| Prop | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `fields` | `FormField[]` | 必填 | 字段配置：`prop/label/type/placeholder/options/rows/slot` |
| `rules` | `FormRules` | — | Element Plus 校验规则 |
| `labelWidth` | `string` | `'80px'` | 标签宽度 |
| `inline` | `boolean` | `false` | 是否行内布局（搜索栏用） |

- v-model：绑定表单数据对象（`Record<string,any>`）
- Emits：`@enter`（回车触发，用于搜索栏）
- 插槽：`#field-<prop>` 自定义某个字段渲染

### `defineExpose`

- `validate()` / `resetFields()`

### `FormField.type`

- `input` / `textarea` / `select` / `selectMultiple`
- `select` 默认使用项目封装 `Select`；`selectMultiple` 默认使用项目封装 `SelectMultiple`
- 更复杂的封装组件建议通过 `component: ComponentName` 使用，动态组件 props 支持 `ref/computed` 自动解包

---

## Select / SelectMultiple

**契约**：下拉组件不内置接口查询，只接收 `options: { value: string; text: string }[]`。业务字段建议使用稳定编码，不建议直接用数字 ID；组件会把传入值统一按字符串处理。

### 共同能力

- 搜索：内置防抖，默认 `250ms`
- 大数据：默认开启虚拟滚动，`itemHeight` / `visibleCount` 可调
- 键盘：支持上下选择，`Enter` 确认，`Esc` 关闭
- 回显：`options` 变化时只做一次全量 `Map` 映射；搜索和回显都基于该映射处理
- 缺失值：如果绑定值在 `options` 中找不到，回显为 `#<value>`

### Select

- v-model：`string | null`
- 常用 props：`options` / `placeholder` / `clearable` / `filterable` / `debounce` / `virtual`

```ts
{
  prop: 'category',
  label: '分类',
  component: 'Select',
  componentProps: { options: categoryOptions },
}
```

### SelectMultiple

- v-model：`string[]`
- 常用 props：`options` / `maxTagCount` / `placeholder` / `clearable` / `filterable` / `debounce` / `virtual`
- tag 超过 `maxTagCount` 后显示「显示更多 +N」，点击后换行展开，再点「收起」

```ts
{
  prop: 'tags',
  label: '标签',
  component: 'SelectMultiple',
  componentProps: { options: tagOptions, maxTagCount: 2 },
}
```

---

## UploadImage / UploadFile

**契约**：上传组件默认调用统一后端接口 `POST /api/uploads`，后端返回前端可直接预览/下载的 `url`。业务模块只保存这个地址；文件原名如需展示，用 `UploadFile` 的 `v-model:name` 额外保存。

- `UploadImage`：v-model 为图片 URL，默认 `accept='image/*'`
- `UploadFile`：v-model 为文件 URL，`v-model:name` 为文件名，已上传后隐藏拖拽区并显示可下载文件名
- `uploadRequest(file)`：可覆盖默认上传实现，未来直传 OSS 或特殊业务上传时仍保持组件契约不变
- 后端本地存储默认暴露 `/uploads/...`；未来 OSS/CDN 只调整上传服务或 `UPLOAD_PUBLIC_BASE_URL`
- 系统配置下的「OSS/CDN 配置」页面会保存上传存储开关和云厂商参数；上传接口读取该配置决定本地或 OSS 分支

---

## Dialog

**契约**：弹窗外壳，预设宽度 / 内容区滚动 / 确定取消按钮 / 挂到 body / 关闭销毁。

### Props

| Prop | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `title` | `string` | `''` | 标题 |
| `width` | `string \| number` | `'800px'` | 宽度 |
| `bodyMaxHeight` | `string` | `'70vh'` | 内容区最大高度（超出滚动，`''` 不限制） |
| `confirmLoading` | `boolean` | `false` | 确定按钮 loading |
| `confirmText` / `cancelText` | `string` | `'确定' / '取消'` | 按钮文案 |
| `showFooter` | `boolean` | `true` | 是否显示默认底部按钮；`false` 时用 `#footer` 插槽自定义 |

- v-model：控制显隐
- Emits：`@confirm` / `@cancel`
- 插槽：默认 slot（内容）、`#footer`（自定义底部）

---

## Button

**契约**：基于 `el-button` 二次封装。传 `perm` 权限码后，**自动校验权限 + 自动配色 + 无权限降级**（超管放行）。破坏性操作默认开启**二次确认**，确认期间**自动 loading + 防重复点击**。映射表统一维护在 `utils/permission.ts`，新增动作只改一处。其余 props/attrs/events 透传给 `el-button`，用法与原生一致。

### Props

| Prop | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `perm` | `string` | `''` | 权限码（`Module.action`，如 `'User.create'`）；不传则不做权限校验，按钮始终显示 |
| `autoType` | `boolean` | `true` | 是否按权限码动作后缀自动推导 `type` |
| `autoLabel` | `boolean` | `false` | 是否用权限码动作后缀推导默认文案；`true` 且未传插槽内容时生效 |
| `icon` | `string \| Component` | — | 图标覆盖：字符串（图标名）/ 组件 / 空串 `''` 强制无图标；不传则按 `perm` 自动匹配 |
| `autoIcon` | `boolean` | `true` | 是否在 `perm` 存在时自动推导内置图标 |
| `confirm` | `boolean \| 'auto'` | `'auto'` | 二次确认：`'auto'`→破坏性操作自动开启；`true`→强制；`false`→关闭 |
| `confirmTitle` | `string` | `'提示'` | 二次确认弹窗标题 |
| `confirmText` | `string` | — | 二次确认弹窗内容；不传则按动作后缀自动推导默认文案（`delete→'确认删除该记录？'` 等） |
| `confirmType` | `'success' \| 'warning' \| 'info' \| 'error'` | `'warning'` | 二次确认弹窗类型 |
| `fallback` | `'hide' \| 'disable'` | `'hide'` | 无权限降级策略：`'hide'`→不渲染；`'disable'`→渲染但 disabled + tooltip |
| `fallbackText` | `string` | — | `fallback='disable'` 时的 tooltip 文案；不传默认 `'暂无权限'` |

- 透传：其余 attrs 全部透传给 `el-button`（`inheritAttrs: false`，已显式 `v-bind="$attrs"`）
- 默认 slot：按钮内容；未传且 `autoLabel=true` 时用动作中文短标签兜底
- Emits：`@click(e)` — 点击事件（已内置二次确认 + 并发保护，确认通过且非 pending 才触发）；`@cancel()` — 用户取消二次确认时触发
- **权限异步态**：有 `perm` 且 `userInfo` 为 null（权限未就绪）时先隐藏；无 `perm` 不受影响（登录页等可直接渲染）
- **并发保护**：确认弹窗 / click 执行期间 `pending=true`，按钮自动 `loading + disabled`，防止叠弹窗
- **配色/图标/确认文案来源**：全部来自 `utils/permission.ts`，映射表统一维护

### 破坏性动作白名单（`confirm='auto'` 时自动开启二次确认）

`delete` / `batchDelete` / `disable` / `revoke` / `reset` / `publish` / `unpublish` / `approve` / `reject`

> 新增动作只需在 `utils/permission.ts` 的四张映射表（`ACTION_TYPE_MAP` / `ACTION_LABEL_MAP` / `ACTION_ICON_MAP` / `ACTION_CONFIRM_TEXT_MAP`）和 `DESTRUCTIVE_ACTIONS` 集合中补一行。

### 用法

```vue
<!-- 权限码驱动：自动 type + 自动图标 + 无权限隐藏 -->
<Button perm="User.create" @click="openCreate">新增用户</Button>

<!-- 删除：confirm='auto' 默认开启，自动文案"确认删除该记录？" -->
<Button perm="User.delete" auto-label link @click="handleDelete" />

<!-- 无权限降级为 disabled + tooltip（避免列宽抖动） -->
<Button perm="User.delete" auto-label link fallback="disable" @click="handleDelete" />

<!-- 覆盖图标 -->
<Button perm="User.read" icon="Search" @click="handleSearch">查询</Button>

<!-- 强制开启二次确认 + 自定义文案 -->
<Button perm="Order.audit" confirm confirm-title="审核确认" confirm-text="确认通过审核？">
  审核
</Button>

<!-- 批量删除：自动开启二次确认 + 并发保护（自动 loading） -->
<Button perm="User.batchDelete" auto-label :disabled="!canBatch" @click="handleBatchDelete" />

<!-- 强制关闭二次确认 -->
<Button perm="User.delete" :confirm="false" auto-label link @click="handleDelete" />
```

---

## MenuTree

**契约**：递归渲染菜单树的展示组件，`MainLayout` 侧边栏专用。

- Props：`items: MenuNode[]`（结构见 `web/src/api/menu.ts`）
- 无 emits；点击菜单由 `el-menu` 自身 router 属性驱动跳转
- 一般业务页面**不直接使用**

---

## 请求封装（`utils/request.ts`）

- 全局 `baseURL = /api`（Vite 代理到后端 3000）
- 响应拦截：`{ statusCode, data, success, message }` 中的 `data` 已被拆包，**页面拿到的直接是业务数据**
- 请求拦截：token 存在时自动 `Authorization: Bearer <token>`
- 401：清空登录态并跳登录页

## 权限工具（`utils/permission.ts`）

- **只按动作后缀判色**（`.` 之后）；模块无关
- 未识别动作 → `info` 灰兜底
- 全站 tag/按钮共用同一映射，禁止硬编码 `type`
- 配色标准详见 `.design-spec.md` 第 6 节
