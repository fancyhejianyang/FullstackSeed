# FullstackSeed

FullstackSeed 是一个面向中后台与 AI 业务的全栈项目开发框架 / 平台基座。它不仅提供登录鉴权、权限、菜单、日志、文件与标准 CRUD 等通用能力，也已经集成知识库检索、商品与 SKU、AI 客服、人工接待和内部 Agent 工作台，可用于快速搭建企业管理系统、知识服务和智能业务应用。

项目采用前后端分离架构，同时包含管理后台、NestJS API 服务和面向访客的客服 H5。业务模块可以沿用项目内 Demo 与公共组件继续扩展，无需重复搭建基础设施。

## 项目组成

| 子项目 | 技术与职责 | 默认地址 |
| --- | --- | --- |
| [`server/`](server/) | NestJS 11 API；鉴权、RBAC、业务服务、AI 调用、任务与数据持久化 | `http://localhost:4000` |
| [`web/`](web/) | Vue 3 管理后台；配置、运营、客服接待和 Agent 工作台 | `http://localhost:5173` |
| [`customer-service-h5/`](customer-service-h5/) | 原生 HTML / CSS / JavaScript 客服访客端；AI 排队、流式消息、转人工和会话恢复 | 本地静态服务地址 |
| [`chroma-server/`](chroma-server/) | 本地 Chroma 向量服务的安装与启动脚本 | `http://localhost:8000` |

```text
管理后台 web ───────────────┐
                            ├── server ── MySQL
客服 H5 customer-service-h5 ┘      ├── Chroma
                                   └── AI / OCR / 文件服务
```

## 已有能力

### 全栈后台基座

- JWT 登录鉴权、用户、角色、权限、动态菜单和操作日志。
- 标准列表、表单、弹窗、详情、导入、上传和存储配置等公共能力。
- NestJS 标准业务模块与 Vue 标准页面 Demo，可按统一字段和权限码复制扩展。
- Swagger 接口文档、TypeORM 实体检查、数据库迁移和开发环境表结构同步。

### 知识库与 AI 检索

- 知识库、分类、文档、分段、标准问答和口语词库管理。
- 文档解析、OCR / MinerU 配置、分段策略、向量化与 Chroma 检索。
- 检索配置、路由规则、混合检索与回答记录，支持知识库问答链路追踪。
- AI 供应商账号、模型能力与业务功能配置。

### 商品、AI 客服与人工接待

- 产品、SKU 与自定义参数管理，支持面向客服问答的业务查询。
- 按应用隔离的公开客服会话、AI 并发限制、满额排队和会话级 SSE。
- 访客主动转人工、后台客服接手、人工连续交流、返回 AI 与会话恢复。
- 独立客服 H5 与后台接待页，共用服务端权威会话和消息记录。

### 内部 Agent

- Agent 应用、模型账号与多模型调度策略配置。
- 业务工具注册、员工使用范围、写入确认与审批记录。
- 工作台自然语言交互、工具执行记录、图片理解和图片生成能力接入。
- 以现有业务模块为工具来源，逐步把“查询 + 回答”和“录入 + 反馈”纳入统一执行链路。

## 技术栈

- 后端：NestJS 11、TypeScript、TypeORM、MySQL、JWT、Swagger、Jest。
- 管理后台：Vue 3、Vite、TypeScript、Element Plus、Pinia、Vue Router。
- 知识与 AI：LangChain、OpenAI 兼容接口、Chroma、Tesseract.js、MinerU 接入。
- 客服访客端：原生 HTML、CSS、JavaScript，无前端框架与第三方运行时依赖。

## 目录结构

```text
FullstackSeed/
├─ server/                 # NestJS 后端
├─ web/                    # Vue 管理后台
├─ customer-service-h5/    # 客服访客 H5
├─ chroma-server/          # Chroma 本地运行脚本
├─ MD/                     # 业务专题与字段说明
├─ AGENTS*.md              # AI 协作与前后端开发规范
├─ MIGRATION.md            # 标准模块迁移说明
└─ CHANGELOG.md            # 变更快照
```

## 快速开始

### 1. 环境准备

- Node.js 与 npm（建议使用当前长期支持版本）。
- MySQL。
- Python（仅在本地运行 Chroma 时需要）。

### 2. 配置后端

在仓库根目录执行：

```powershell
Copy-Item server/.env.example server/.env
```

然后按本机环境修改 `server/.env` 中的数据库、JWT、跨域、上传和 Chroma 配置，并在 MySQL 中创建对应数据库。开发环境默认数据库名为 `fullstack_seed`。

### 3. 启动后端

```powershell
Set-Location server
npm install
npm run start:dev
```

- API 前缀：`http://localhost:4000/api`
- Swagger：`http://localhost:4000/docs`

开发环境首次启动会创建超级管理员 `root`，示例密码为 `root123`。生产环境必须通过 `ADMIN_PASSWORD` 设置强密码，同时更换 `JWT_SECRET` 并限制 `CORS_ORIGIN`。

### 4. 启动管理后台

另开终端：

```powershell
Set-Location web
npm install
npm run dev
```

访问 `http://localhost:5173`。开发服务器会将 `/api` 和 `/uploads` 代理到 `http://localhost:4000`。

### 5. 启动本地向量服务（可选）

使用知识向量检索时，另开终端执行：

```powershell
Set-Location server
npm run chroma:install
npm run chroma:start
```

Chroma 默认地址为 `http://localhost:8000`，可通过 `server/.env` 调整。

### 6. 启动客服 H5（可选）

先在 [`customer-service-h5/js/receptionApi.js`](customer-service-h5/js/receptionApi.js) 中配置服务端 `baseUrl` 和已启用客服应用的 `appid`，再从仓库根目录启动静态服务：

```powershell
python -m http.server 8080 --directory customer-service-h5
```

访问 `http://localhost:8080`。正式部署应使用 HTTPS，并在后端应用与跨域配置中登记真实来源。客服协议、凭证和会话隔离规则见 [`customer-service-h5/RECEPTION.md`](customer-service-h5/RECEPTION.md)。

## 开发约定

- 后端新增业务模块参考 [`server/src/demo/`](server/src/demo/)；前端页面参考 [`web/src/views/demo/`](web/src/views/demo/)。
- 前后端字段使用 camelCase 并保持一字不差；权限码使用 `Module.action`。
- 业务页优先复用项目公共 Table、Form、Dialog、Input、Select 等组件，组件契约见 [`AGENTS-COMPONENTS.md`](AGENTS-COMPONENTS.md)。
- 客服 H5 保持原生 HTML / CSS / JavaScript，不引入前端框架；其正式入口和文件说明见 [`customer-service-h5/AGENTS.md`](customer-service-h5/AGENTS.md)。
- 开发规则以 [`AGENTS.md`](AGENTS.md)、[`AGENTS-BACKEND.md`](AGENTS-BACKEND.md)、[`AGENTS-FRONTEND.md`](AGENTS-FRONTEND.md) 和 [`.design-spec.md`](.design-spec.md) 为准。

## 常用检查命令

```powershell
# 后端实体检查与测试
Set-Location server
npm run check:entities
npm run test

# 前端类型与组件使用检查
Set-Location ../web
npm run type-check
npm run check:components -- src/views

# 客服 H5 静态语法检查
Set-Location ../customer-service-h5
node --check js/receptionApi.js
node --check js/receptionStore.js
node --check js/reception.js
```

## 文档导航

- [`MIGRATION.md`](MIGRATION.md)：后端标准模块迁移与复刻。
- [`MD/Agent业务模块接入说明.md`](MD/Agent业务模块接入说明.md)：Agent 业务工具接入规则。
- [`MD/内部Agent应用改造计划.md`](MD/内部Agent应用改造计划.md)：内部 Agent 的业务与 UI 演进计划。
- [`知识库处理流程.md`](知识库处理流程.md)：知识库处理主链路。
- [`MD/知识库检索配置.md`](MD/知识库检索配置.md)：知识检索配置说明。
- [`customer-service-h5/RECEPTION.md`](customer-service-h5/RECEPTION.md)：客服 H5 正式接待协议。
- [`CHANGELOG.md`](CHANGELOG.md)：项目变更快照。

## 生产部署提示

- 生产环境关闭自动表结构同步，使用数据库迁移并先完成备份与回滚验证。
- 显式配置管理员密码、JWT 密钥、跨域白名单、上传访问域名和 AI 供应商密钥。
- MySQL、Chroma、上传文件和供应商调用均应配置监控、备份、超时与容量策略。
- 客服 H5 与 API 使用 HTTPS；会话令牌只通过请求头传递，不写入 URL 或日志。

当前仓库为内部项目，未声明对外开源许可证。
