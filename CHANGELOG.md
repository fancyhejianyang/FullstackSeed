# CHANGELOG

### 2026-08-26 优化 MinerU 配置复用
- 新增：无
- 修改：
  - `server/src/knowledge-bases/knowledge-bases.service.ts`（Base 级 MinerU 解析移除重复启用配置读取，轮询时复用创建任务返回的 `configId`）
- 删除：无
- 说明：`createParseTask` 统一负责选择和校验 MinerU 配置，`waitForSuccess` 使用同一配置查询任务，避免同一次解析中重复读取启用配置或中途切换配置。

### 2026-08-25 收口知识库检索辅助字段表达
- 新增：无
- 修改：
  - `web/src/views/knowledge-base/Edit.vue`、`web/src/views/knowledge-base/View.vue`（将“口语化描述”改为“口语化说法”，并在输入占位中明确仅用于检索匹配）
  - `server/src/knowledge-bases/knowledge-bases.service.ts`（向量索引文本中将命中关键字、口语化说法标记为检索辅助信息，不作为 AI 回答指令）
- 删除：无
- 说明：AI 功能配置继续承担系统提示词、规则和返回格式；知识库文档只保留检索召回所需的关键字、常见问法和匹配优先级，避免两处都像是在配置提示词。

### 2026-08-25 补充知识库索引说明文档
- 新增：
  - `知识库索引实现过程.md`
  - `知识库索引核心代码.md`
- 修改：无
- 删除：无
- 说明：整理当前项目知识库索引从分片筛选、索引文本拼装、增量判断、向量化调用到 Chroma 写入和状态回写的实现过程，并摘取核心代码片段。

### 2026-08-25 向量账号隐藏无关 Chat 路径
- 新增：无
- 修改：
  - `server/src/knowledge-ai-providers/knowledge-ai-providers.service.ts`（向量模型接口地址独立拼接 `/v1/embeddings`，不再通过 Chat API 路径转换）
  - `web/src/views/knowledge-ai-provider/View.vue`（仅配置向量模型的账号详情隐藏 Chat API 路径、通用模型、文本模型和视觉模型等无关项）
- 删除：无
- 说明：阿里云向量模型只需要 OpenAI 兼容 Base URL、业务空间、密钥、向量模型编码和向量维度；Chat API 路径只服务聊天/视觉调用，不参与向量化。

### 2026-08-25 问答记录显示命中知识库
- 新增：
  - `knowledge_ai_chat_sessions.hitKnowledgeBaseNames`、`knowledge_ai_chat_messages.hitKnowledgeBaseNames`（保存每次问答检索命中的知识库名称）
- 修改：
  - `server/src/knowledge-ai-chat/`（知识库检索结果改为结构化返回参考正文和命中知识库名；普通问答与流式问答均写入命中知识库）
  - `server/src/knowledge-bases/knowledge-bases.service.ts`（向量索引元数据补充知识库名称，便于向量命中时回填来源）
  - `web/src/api/knowledgeAiChat.ts`、`web/src/views/knowledge-ai-record/Index.vue`（问答记录列表新增“命中知识库”列）
- 删除：无
- 说明：列表展示的是最近一轮问答实际检索命中的知识库名；未命中时显示 `-`，避免从 AI 回答文本中猜测来源。

### 2026-08-24 优化手动分片原文区域高度
- 新增：无
- 修改：
  - `web/src/views/knowledge-base/View.vue`（手动分片原文区域改为更高的自适应视口高度，并支持垂直拖拽调整）
- 删除：无
- 说明：长文档手动分片时减少纵向滚动压迫感，方便选择更大范围的原文内容。

### 2026-08-24 知识库详情增加索引内容查看
- 新增：
  - `GET /api/knowledge-bases/indexes`（分页返回知识库分片对应的索引文本、Vector ID、Hash、索引状态和元数据摘要）
  - 知识库详情抽屉“索引内容”Tab（支持搜索、分页、查看实际写入向量库的索引文本）
- 修改：无
- 删除：无
- 说明：索引内容展示的是后端向量化前拼装的文本，便于确认命中关键字、口语化描述、来源与正文是否真正进入知识库检索链路。

### 2026-08-24 禁用 Chroma 默认向量函数
- 新增：无
- 修改：
  - `server/src/knowledge-vectors/knowledge-vector.service.ts`（获取或创建 Chroma Collection 时显式设置 `embeddingFunction: null`）
- 删除：无
- 说明：本项目由后端先调用大模型账号生成 embedding，再把向量数组写入 Chroma；不需要 Chroma JS 客户端加载 `@chroma-core/default-embed`，避免索引时报 “Cannot instantiate a collection with the DefaultEmbeddingFunction”。

### 2026-08-24 向量化配置支持维度设置
- 新增：
  - `vector_configs.embeddingDimension`（向量维度，默认 768，可在向量化配置页调整）
- 修改：
  - `server/src/vector-configs/`（向量化配置保存、读取和环境兜底均返回维度配置）
  - `server/src/knowledge-vectors/knowledge-embedding.service.ts`、`server/src/knowledge-ai-providers/knowledge-ai-providers.service.ts`（向量化调用时传入配置维度；阿里云 Qwen 文本向量按配置写入 `dimensions`，不再写死 1024）
  - `web/src/api/vectorConfig.ts`、`web/src/views/vector-config/Index.vue`（向量化配置表单增加“向量维度”数字输入，默认 768，并提示 Chroma Collection 维度固定）
- 删除：无
- 说明：向量模型、向量维度和 Chroma Collection 必须一致；切换模型或维度时建议更换 Collection 名或清空旧集合后重新索引。

### 2026-08-24 大模型账号密钥支持掩码回显
- 新增：无
- 修改：
  - `server/src/knowledge-ai-providers/knowledge-ai-providers.service.ts`（账号详情返回 `secretKeyMasked` 掩码，不返回完整密钥）
  - `web/src/api/knowledgeAiProvider.ts`、`web/src/views/knowledge-ai-provider/Edit.vue`（编辑账号时密钥显示星号掩码；保持掩码不变不提交密钥，输入新值才覆盖保存；密钥框使用普通文本输入并关闭浏览器自动完成）
  - `web/src/components/Form.vue`（普通输入和多行输入支持透传 `componentProps`）
- 删除：无
- 说明：避免密钥编辑框空白造成“是否已保存”不明确，同时避开浏览器密码记忆对配置表单的干扰。

### 2026-08-24 规范化大模型密钥输入
- 新增：无
- 修改：
  - `server/src/knowledge-ai-providers/knowledge-ai-providers.service.ts`（保存和调用大模型密钥时自动移除误粘贴的 `Authorization:`、`Bearer ` 前缀，避免请求头变成重复 Bearer）
- 删除：无
- 说明：后端仍按 OpenAI 兼容 HTTP 调用方式发送 `Authorization: Bearer {key}`；本次主要增强密钥输入容错，便于排查 401。

### 2026-08-24 增强大模型调用错误配置摘要
- 新增：无
- 修改：
  - `server/src/knowledge-ai-providers/knowledge-ai-providers.service.ts`（模型调用失败时返回账号、业务空间、模型、最终请求地址和密钥摘要；密钥仅显示长度与尾号，不返回完整密钥）
- 删除：无
- 说明：方便定位阿里云百炼等供应商的 401/模型不可用问题，同时避免在接口错误、日志或截图中泄露完整 API Key。

### 2026-08-24 修正业务空间字段数据库类型
- 新增：无
- 修改：
  - `server/src/knowledge-ai-providers/entities/knowledge-ai-provider.entity.ts`（`workspaceId` 显式声明为 `varchar`，避免 TypeORM 将可空字符串推断为 MySQL 不支持的 `Object` 类型）
- 删除：无
- 说明：`string | null` 字段在 TypeORM 元数据反射中可能无法自动推断列类型，MySQL 场景需要显式指定 `type`。

### 2026-08-24 大模型账号增加业务空间配置
- 新增：
  - `knowledge_ai_providers.workspaceId`（业务空间 / WorkspaceId，用于阿里云百炼 maas 专属域名）
- 修改：
  - `server/src/knowledge-ai-providers/`（DTO、实体、服务返回与搜索支持业务空间；构建阿里云 maas 请求地址时按 `workspaceId` 修正子域）
  - `web/src/api/knowledgeAiProvider.ts`、`web/src/views/knowledge-ai-provider/`（大模型账号编辑、详情和搜索提示增加业务空间字段）
- 删除：无
- 说明：阿里云百炼专属地址中的 `{WorkspaceId}` 容易被误填为套餐名或应用名；单独配置业务空间后，后端会在请求前统一修正最终调用地址。

### 2026-08-24 适配阿里云 Qwen 文本向量参数
- 新增：无
- 修改：
  - `server/src/knowledge-ai-providers/knowledge-ai-providers.service.ts`（阿里云 `qwen3.7-text-embedding`、`text-embedding-v3`、`text-embedding-v4` 调用 embedding 时自动补充 `dimensions: 1024` 和 `encoding_format: "float"`，腾讯混元等其它供应商保持通用请求体）
- 删除：无
- 说明：Qwen 文本向量示例要求传入向量维度和 float 编码格式；本次在后端调用层按模型自动补齐，避免影响已调通的腾讯混元向量模型。

### 2026-08-24 修正大模型接口路径重复拼接
- 新增：无
- 修改：
  - `server/src/knowledge-ai-providers/knowledge-ai-providers.service.ts`（统一拼接大模型 API 地址和接口路径，避免 API 地址已包含 `/v1` 时再追加 `v1/...` 造成 `/v1/v1`；向量模型错误提示补充最终请求地址）
- 删除：无
- 说明：阿里云百炼新工作空间地址常以 `/compatible-mode/v1` 结尾，后端需要兼容该格式，避免因目标地址不一致导致模型查找失败。

### 2026-08-24 收紧向量模型选择和调用批次
- 新增：无
- 修改：
  - `server/src/knowledge-ai-providers/knowledge-ai-providers.service.ts`（向量化只读取大模型账号的向量模型列表；embedding 请求按供应商限制拆分小批次；错误提示补充当前模型）
  - `server/src/vector-configs/vector-configs.service.ts`（启用向量化配置时拦截明显的视觉/多模态向量模型）
  - `web/src/views/vector-config/Index.vue`（向量模型下拉只读取账号的向量模型字段，并过滤不适用于文本分片的视觉/多模态模型）
- 删除：无
- 说明：知识库当前是“文本分片 → 文本向量化”链路，`qwen3-vl-embedding` 等多模态模型不能直接用于本流程；阿里云等供应商的 embedding 批量限制也在调用层统一处理。

### 2026-08-24 将向量模型选择并入向量化配置
- 新增：
  - `vector_configs.providerId/providerName/model`（向量化配置直接绑定大模型账号和向量模型）
- 修改：
  - `server/src/vector-configs/`（保存当前向量化配置时校验并保存大模型账号、向量模型；可用配置返回模型绑定信息）
  - `server/src/knowledge-vectors/knowledge-embedding.service.ts`（向量生成改为读取向量化配置中的账号和模型，不再依赖 AI 功能配置的 embedding 记录）
  - `server/src/knowledge-vectors/knowledge-vectors.module.ts`（移除不再需要的 AI 功能配置模块依赖）
  - `web/src/api/vectorConfig.ts`、`web/src/views/vector-config/Index.vue`（向量化配置表单增加大模型账号和向量模型下拉；模型列表读取所选账号的向量模型列表）
- 删除：无
- 说明：分片配置只负责切分规则；向量化配置负责“选择向量模型 + 配置 Chroma 存储”，形成完整索引配置。

### 2026-08-24 明确向量模型配置与 Chroma 配置职责
- 新增：无
- 修改：
  - `server/src/knowledge-vectors/knowledge-embedding.service.ts`（向量生成阶段将变量与错误提示明确为“AI 功能配置 - 向量化”，避免和 Chroma 向量库配置混淆）
  - `web/src/views/vector-config/Index.vue`（向量化配置页展示当前启用的向量模型功能配置状态）
  - `CHANGELOG.md`（追加本次变更快照）
- 删除：无
- 说明：知识库索引需要同时具备“向量模型配置”和“Chroma 存储配置”；前者在 AI 功能配置中启用，后者在向量化配置中维护。

### 2026-08-24 收敛向量化配置单例读写逻辑
- 新增：
  - `GET /api/vector-configs/current`、`POST /api/vector-configs/current`（当前向量化配置读取与保存接口）
- 修改：
  - `server/src/vector-configs/vector-configs.service.ts`（向量化配置按单例表单处理，保存当前配置时清理其它旧配置；可用配置读取时保留最新启用项）
  - `server/src/vector-configs/vector-configs.controller.ts`（新增当前配置接口）
  - `server/src/ai-feature-configs/ai-feature-configs.service.ts`（同一 AI 功能类型只保留一个启用配置，`findEnabledByFeature` 自动收敛历史多启用数据）
  - `web/src/api/vectorConfig.ts`、`web/src/views/vector-config/Index.vue`（向量化配置页改为直接读写当前配置接口）
- 删除：无
- 说明：后端同步适配“向量化配置为单份表单”的产品形态，避免仍按列表多配置逻辑读取导致历史多启用或取最新记录的不确定性。

### 2026-08-24 微调二级菜单缩进到 50px
- 新增：无
- 修改：
  - `web/src/layouts/MainLayout.vue`（嵌套菜单项左侧缩进固定为 50px，基于当前 Element Plus 计算结果增加 10px）
  - `CHANGELOG.md`（追加本次变更快照）
- 删除：无
- 说明：按实际页面观感微调二级菜单文字起始位置，使其与一级菜单文字垂直对齐。

### 2026-08-24 修正二级菜单文字缩进
- 新增：无
- 修改：
  - `web/src/components/MenuTree.vue`（移除二级及更深层级菜单的额外图标占位，避免和 Element Plus 层级缩进叠加导致文字过度右移）
  - `CHANGELOG.md`（追加本次变更快照）
- 删除：无
- 说明：二级菜单继续不显示图标，文字起始位置改为与一级菜单文字保持视觉对齐。

### 2026-08-24 调整向量化配置为单表单并优化二级菜单占位
- 新增：无
- 修改：
  - `web/src/views/vector-config/Index.vue`（向量化配置页由列表改为单份配置表单，打开页面自动加载已启用/最新配置，无配置时保存即创建）
  - `web/src/components/MenuTree.vue`（二级及更深层级菜单不显示图标，但保留同宽占位，保证菜单文字缩进稳定）
  - `CHANGELOG.md`（追加本次变更快照）
- 删除：
  - `web/src/views/vector-config/Edit.vue`（单表单页面不再需要独立编辑弹窗）
- 说明：向量化配置按当前产品定位收敛为系统级唯一配置；侧边栏二级菜单继续保持无图标规范，同时避免文字因图标缺失而贴边。

### 2026-08-24 优化 Chroma 启动脚本未安装提示
- 新增：无
- 修改：
  - `chroma-server/start.ps1`（未安装项目内 Python 虚拟环境时，不再回退全局 Python，改为明确提示先执行 `npm.cmd run chroma:install`）
- 删除：无
- 说明：避免首次启动时因全局 Python 未安装 `chromadb` 而出现难以理解的 `ModuleNotFoundError`。

### 2026-08-24 补齐 Chroma 本地 Python 服务启动方案
- 新增：
  - `.gitignore`（忽略 `chroma-data/` 和 Chroma Python 虚拟环境）
  - `chroma-server/`（Chroma 本地服务说明、Python 依赖、安装脚本、启动脚本）
- 修改：
  - `server/package.json`（新增 `chroma:install`、`chroma:start` 脚本）
  - `知识库处理流程.md`（补充本项目 Chroma 服务职责、启动命令、持久化目录和后端连接关系）
- 删除：无
- 说明：`chromadb` npm 包仅作为后端访问 Chroma 的客户端；真正的 Chroma 向量数据库服务改为通过项目内 Python 脚本独立启动，默认将向量数据持久化到项目根目录 `chroma-data/`。

### 2026-08-24 新增向量化配置后台页面
- 新增：
  - `server/src/vector-configs/`（向量化配置实体、DTO、Controller、Service、Module；支持 Chroma 地址、Collection、Tenant、Database、Token 和启用开关）
  - `web/src/api/vectorConfig.ts`（向量化配置接口封装）
  - `web/src/views/vector-config/Index.vue`、`web/src/views/vector-config/Edit.vue`（向量化配置列表与编辑弹窗）
- 修改：
  - `server/src/knowledge-vectors/knowledge-vector.service.ts`（向量服务优先读取已启用的后台向量化配置；无配置时回退到 `CHROMA_*` 环境变量）
  - `server/src/knowledge-vectors/knowledge-vectors.module.ts`（引入向量化配置模块）
  - `server/src/app.module.ts`（挂载向量化配置模块并补充 Chroma 环境变量校验）
  - `server/src/menus/menus.service.ts`（系统配置下新增“向量化配置”菜单）
  - `web/src/router/index.ts`（新增 `/system-config/vector` 路由）
- 删除：无
- 说明：后台可维护多条向量化配置，但同一时间仅允许启用一条；索引与检索会使用启用配置连接 Chroma，未启用配置时保持环境变量兜底。

### 2026-08-24 接入知识库分片真实向量索引链路
- 新增：
  - `server/src/knowledge-vectors/knowledge-embedding.service.ts`（读取已启用的 embedding AI 功能配置，调用大模型账号向量接口）
  - `server/src/knowledge-vectors/knowledge-vector.service.ts`（封装 Chroma upsert/delete/search）
  - `server/src/knowledge-vectors/knowledge-vectors.module.ts`（向量服务模块）
- 修改：
  - `server/src/knowledge-bases/entities/knowledge-base-chunk.entity.ts`（新增 `vectorId/contentHash/vectorStatus/vectorError/vectorizedAt` 分片向量字段）
  - `server/src/knowledge-bases/knowledge-bases.service.ts`（分片新增/删除/更新顺序与待索引状态规范化；索引任务改为真实 embedding + Chroma 写入；删除知识库/文档/分片时清理旧向量）
  - `server/src/knowledge-bases/knowledge-bases.module.ts`（引入向量服务模块）
  - `server/src/knowledge-ai-providers/knowledge-ai-providers.service.ts`（新增 embedding 目标解析、OpenAI 兼容 `/embeddings` 调用与响应解析）
  - `server/src/knowledge-ai-chat/knowledge-ai-chat-retrieval.service.ts`（按检索配置接入 `fullText/vector/hybrid`，混合模式融合关键词召回和向量召回）
  - `server/src/knowledge-ai-chat/knowledge-ai-chat.module.ts`（引入向量服务模块）
  - `server/.env.example`（补充 Chroma 连接配置）
  - `web/src/api/knowledgeBase.ts`（补充分片向量字段类型）
  - `web/src/views/knowledge-base/View.vue`（分片内容列表展示向量状态、错误原因和向量化时间）
  - `知识库处理流程.md`（追加已落地实现记录和运行前置）
- 删除：无
- 说明：点击知识库列表「索引」后会进入真实异步向量化；未配置启用的 embedding 功能配置或 Chroma 服务不可用时，失败原因会回写到知识库处理结果和分片向量错误字段。

### 2026-08-23 补充 Chroma 服务端依赖计划
- 新增：无
- 修改：
  - `知识库处理流程.md`（向量库写入策略明确第一版优先接入 Chroma，并补充服务端 `chromadb` 依赖确认/安装、Chroma 服务独立部署和环境变量配置说明；明日执行顺序增加 Chroma 依赖检查步骤）
  - `CHANGELOG.md`（追加本次 Chroma 依赖计划快照）
- 删除：无
- 说明：当前检查到 `server/package.json` 已包含 `chromadb` 依赖；明日执行真实向量库接入时仍需确认依赖、lock 文件和 Chroma 服务地址配置完整。

### 2026-08-23 补充知识库向量索引下一阶段计划
- 新增：无
- 修改：
  - `知识库处理流程.md`（新增“下一阶段执行计划：手动分片到真实向量索引”，明确分片排序、来源信息、向量字段、hash、索引任务、embedding 配置、向量库写入、检索接入、前端配合和验收标准）
  - `CHANGELOG.md`（追加本次流程文档计划快照）
- 删除：无
- 说明：本次仅沉淀明日执行计划，不改接口和代码；后续执行时再补齐 `vectorId/contentHash/vectorStatus/vectorError/vectorizedAt` 等字段并接入真实向量库。

### 2026-08-22 手动分片画布渲染优化（拖拽挂起重绘 + 按片段绘制 + 文本测量 O(n)）
- 新增：无
- 修改：
  - `web/src/views/knowledge-base/View.vue`
    - 拖拽与重绘解耦：`handleManualCanvasMouseMove` 期间只更新选区 ref，不再触发重绘；`watch([manualSourceContent, manualSelectionStart, manualSelectionEnd, manualEditorVisible])` 内 `if (manualSelectionDragging.value) return` 挂起渲染；`handleManualCanvasMouseUp` 在松开那一刻调用一次 `scheduleManualGridDraw()`，把选区渲染卡在结束帧，拖拽过程 0 帧重绘。
    - state 层按片段绘制：`drawManualGrid` 主循环改用 `drawManualPixiStateRangesForRow`，仅对「与锁定区间相交的行 + 当前选区覆盖的行」绘制矩形，跳过无关行；底层锁定段取区间交集、选区段取坐标区间交集，不再逐行全量重算。
    - 文本测量去 O(n²)：新增 `buildManualLinePrefixWidths()` 预计算每行从行首到各列的累计宽度数组；`buildManualPixiTextSegments` / `drawManualPixiStateRangesForRow` 直接按索引取前缀宽度定位 x，避免逐字符 `measureText` 与 `text.slice(0, column)` 造成的 O(n²) 开销（文本仍走整行单 `Text` 节点，不回退逐字符节点）。
    - 连带修复：补 import `createKnowledgeBaseChunk`/`updateKnowledgeBaseChunk`/`deleteKnowledgeBaseChunk`（上一轮单条接口改造遗留的未导入编译错误）。
- 删除：无
- 说明：渲染瓶颈来自「拖拽每帧经 watch 全量重绘（销毁+重建所有 Text 节点 + 全量重算锁定/选区矩形）」与「逐字符 measureText 的 O(n²) 文本测量」，均非 PixiJS 本身必需。本轮拖拽中只记录起点终点、松手一次性渲染；测算改为按本次片段遍历 + 行前缀宽度缓存，JS 侧计算开销远低于 DOM/UI 重建。逻辑层与单条接口契约未变。

### 2026-08-22 修复知识库分片配置编辑页校验与类型问题
- 新增：无
- 修改：
  - `web/src/views/knowledge-chunk-config/Edit.vue`（`handleSubmit` 捕获 `el-form.validate()` 校验失败 reject，避免未处理异常并补表单未挂载兜底；`name` trim 后二次校验防止提交空名称；`watch(visible)` 加载详情补 catch 兜底；`fields` computed 三个条件展开数组加 `as FormField[]` 断言修复 `component` 类型拓宽导致的类型错误）
- 删除：无
- 说明：`validate()` 校验失败在 Element Plus 中会 reject，原代码 `await formRef.value?.validate()` 会抛未处理异常；`required` 校验不拦截纯空格，trim 后可能提交空名称；条件展开数组字面量无法获得 `FormField` 上下文类型，导致 `computed<FormField[]>` 失配（同为动态字段的 retrieval 页用显式 `FormField[]` 变量规避，本页改为断言）。

### 2026-08-22 手动分片三项优化（单片段同步 / 锁定二分 / 上限配置化）
- 新增：无
- 修改：
  - `server/src/knowledge-bases/dto/knowledge-base.dto.ts`（`CreateKnowledgeBaseChunkDto` 增加手动分片字段 `coreContent/manualStartOffset/manualEndOffset/contextBeforeLength/contextAfterLength`，`UpdateKnowledgeBaseChunkDto` 自动继承）
  - `server/src/knowledge-bases/knowledge-bases.service.ts`（`createChunk`/`updateChunk` 落手动字段；`createChunk`/`removeChunk` 删除后通过私有 `syncDocumentChunkState` 同步文档状态；删空时回退 parsed/pending）
  - `server/src/knowledge-chunk-configs/entities/knowledge-chunk-config.entity.ts`（新增 `manualMaxChunks`，默认 500）
  - `server/src/knowledge-chunk-configs/dto/knowledge-chunk-config.dto.ts`、`knowledge-chunk-configs.service.ts`（新增字段校验、保存与种子默认值）
  - `web/src/api/knowledgeChunkConfig.ts`（`KnowledgeChunkConfig` 接口与 `KnowledgeChunkConfigForm` 增加 `manualMaxChunks`）
  - `web/src/views/knowledge-chunk-config/Edit.vue`（手动模式表单新增「手动分片上限」输入项，含校验/默认/回填/提交）
  - `web/src/api/knowledgeBase.ts`（`KnowledgeBaseChunkForm` 增加手动字段，支持单条传输）
  - `web/src/views/knowledge-base/View.vue`（`ManualChunkDraft` 增 `id`；新增/删除/改标题改为调用单条接口 `create/update/deleteKnowledgeBaseChunk`，不再整表替换；锁定检测改为有序区间 + 二分查找 `manualLockedRanges`；`prepareManualChunks` 加载分页与创建上限改用 `manualMaxChunks`；分片计数显示上限）
- 删除：无
- 说明：手动分片由整表 softDelete+重建改为单条增量同步，每次增/删/改标题仅传单个片段，显著降低接口数据压力；锁定检测从 O(chunks) 逐字符扫描降为 O(log n) 二分；500 条上限保留并下沉到「知识库分片配置」的 `manualMaxChunks`（可配置 1~10000），达到上限时提示用户删除分片或调整配置。

### 2026-08-22 强化 AI 自动提交为强制规则
- 新增：无
- 修改：
  - `AGENTS.md`（Agent 工作规则第 7 条由“默认自动提交”改为“强制自动提交（必做项）”：每次改动完成后必须自动 git commit 并填写描述改动的 commit message，仅用户明确要求“不提交”时才可跳过）
  - `CHANGELOG.md`（追加本次自动提交规则强化快照）
- 删除：无
- 说明：规则文本中的 commit message 示例（如 `docs: 强化自动提交规则`）仅示意，实际提交需按改动内容填写。

### 2026-08-22 本地 OCR Worker 支持复用与启动预热
- 新增：无
- 修改：
  - `server/src/document-ocr/document-ocr.service.ts`（Tesseract Worker 改为单例复用，支持 `TESSERACT_WARMUP_ON_START=true` 在服务启动时异步预热；同一 Worker 的识别任务串行排队；PDF OCR 页面渲染依赖提示改为明确要求 `PDFParse.getScreenshot` 能力）
  - `server/.env.example`（补充本地 OCR 语言、语言包路径、超时、远程下载和启动预热开关示例）
  - `CHANGELOG.md`（追加本次本地 OCR Worker 生命周期优化快照）
- 删除：无
- 说明：`loadPdfParseClass` 不是普通文本提取逻辑，而是 OCR 兜底时用于把 PDF 页面渲染成图片；普通文本 PDF 仍由 PDF 文本解析器先处理。启动预热失败只写日志，不阻断服务启动，后续请求仍可重试初始化。

### 2026-08-21 PDF 手动 OCR 页数写入手动分片配置
- 新增：无
- 修改：
  - `server/src/knowledge-chunk-configs/entities/knowledge-chunk-config.entity.ts`（分片配置新增 `pdfOcrMaxPages`，默认 8 页）
  - `server/src/knowledge-chunk-configs/dto/knowledge-chunk-config.dto.ts`、`server/src/knowledge-chunk-configs/knowledge-chunk-configs.service.ts`（新增字段校验与保存逻辑）
  - `server/src/document-ocr/document-ocr.module.ts`、`server/src/document-ocr/document-ocr.service.ts`（PDF 手动 OCR 渲染页数读取默认手动配置，不再固定 8 页）
  - `web/src/api/knowledgeChunkConfig.ts`、`web/src/views/knowledge-chunk-config/Edit.vue`、`web/src/views/knowledge-chunk-config/Index.vue`（手动配置表单与列表支持 PDF OCR 页数）
  - `CHANGELOG.md`（追加本次 PDF OCR 页数配置化快照）
- 删除：无
- 说明：该字段仅作用于手动解析 PDF 进入本地 OCR 的场景；普通 PDF 文本提取成功时不会触发 OCR 页数限制。

### 2026-08-21 手动分片画布初始化增加遮罩
- 新增：无
- 修改：
  - `web/src/views/knowledge-base/View.vue`（手动分片打开后等待 Pixi 原文画布首帧绘制完成再允许拖拽；初始化期间显示遮罩提示，并禁用生成分片入口）
  - `CHANGELOG.md`（追加本次手动分片画布初始化交互修复快照）
- 删除：无
- 说明：大内容进入手动分片时，画布和坐标层需要一次初始化；现在首帧完成前会明确提示“原文画布准备中”，避免用户过早拖拽导致无效操作。

### 2026-08-21 本地 OCR 语言包改为显式本地加载
- 新增：无
- 修改：
  - `server/src/document-ocr/document-ocr.service.ts`（本地 OCR 初始化前检查 `TESSERACT_LANG_PATH` 或服务运行目录下的语言包；存在 `.traineddata` 时自动关闭 gzip，缺包时直接返回明确错误，不再默认隐式外网下载）
  - `CHANGELOG.md`（追加本次本地 OCR 语言包加载修正快照）
- 删除：无
- 说明：当前服务目录已存在 `chi_sim.traineddata`，本地 OCR 默认改为中文简体 `chi_sim`；如果配置 `chi_sim+eng`，则同目录还必须存在 `eng.traineddata`。

### 2026-08-21 本地 OCR 增加初始化超时与语言包配置
- 新增：无
- 修改：
  - `server/src/document-ocr/document-ocr.service.ts`（Tesseract Worker 初始化与逐图识别增加超时保护、进度日志、本地语言包目录与缓存目录配置）
  - `CHANGELOG.md`（追加本次 OCR 初始化卡住问题的处理快照）
- 删除：无
- 说明：`createWorker('chi_sim+eng')` 卡住通常是 Tesseract 初始化或下载中文/英文语言包时阻塞；现在默认初始化 30 秒超时、单图识别 60 秒超时，可通过 `TESSERACT_LANG_PATH` 指向本地语言包目录避免依赖外网下载。

### 2026-08-21 增加手动 OCR 调试日志
- 新增：无
- 修改：
  - `server/src/document-parsers/parsers/pdf-document.parser.ts`（手动 PDF 解析增加普通文本命中与进入 OCR 的调试日志）
  - `server/src/document-ocr/document-ocr.service.ts`（本地 PDF/图片 OCR 增加渲染、进入 OCR、Tesseract 初始化和逐图识别日志）
  - `CHANGELOG.md`（追加本次 OCR 调试日志快照）
- 删除：无
- 说明：用于定位手动 PDF/图片解析时断点进不到 `recognizeImagesWithLocalOcr` 的原因，常见情况是 PDF 普通文本已命中直接返回，或 PDF 页面渲染阶段先失败。

### 2026-08-21 手动 PDF/图片 OCR 改为本地识别
- 新增：
  - `server` 依赖 `tesseract.js`（用于后端本地图片 OCR）
- 修改：
  - `server/src/document-ocr/document-ocr.service.ts`（手动 PDF OCR 和图片 OCR 改为本地 Tesseract 识别；PDF 无文本时渲染页面后逐页识别；不再读取 OCR 功能配置，不再分流到 MinerU 或视觉模型）
  - `server/src/document-ocr/document-ocr.module.ts`（移除 OCR 服务对 AI 功能配置、大模型账号和 MinerU 配置模块的依赖）
  - `server/package.json` / `server/package-lock.json`（新增本地 OCR 依赖）
  - `CHANGELOG.md`（追加本次手动 OCR 本地化快照）
- 删除：无
- 说明：MinerU 只在用户明确选择 MinerU 解析模式时使用；手动解析 PDF/图片统一走后端本地 OCR 链路。

### 2026-08-21 去掉分片配置描述字段
- 新增：无
- 修改：
  - `server/src/knowledge-chunk-configs/dto/knowledge-chunk-config.dto.ts`（分片配置接口不再接收描述字段）
  - `server/src/knowledge-chunk-configs/knowledge-chunk-configs.service.ts`（分片配置不再写入描述，列表关键词只搜索配置名称）
  - `web/src/api/knowledgeChunkConfig.ts`（前端分片配置类型移除描述字段）
  - `web/src/views/knowledge-chunk-config/Edit.vue`（分片配置弹窗去掉描述输入）
  - `web/src/views/knowledge-chunk-config/Index.vue`（搜索提示改为仅配置名称）
  - `CHANGELOG.md`（追加本次描述字段移除快照）
- 删除：无
- 说明：数据库实体中的 `description` 列暂时保留用于兼容已有表结构，但前后端接口与页面不再使用。默认配置已按分片模式隔离：手动默认只作用于手动分片，MinerU/自动默认只作用于自动分片。

### 2026-08-21 手动分片记录首尾上下文长度
- 新增：无
- 修改：
  - `server/src/knowledge-bases/entities/knowledge-base-chunk.entity.ts`（分片增加 `contextBeforeLength` / `contextAfterLength`，记录手动分片实际补充的首尾上下文字符数）
  - `server/src/knowledge-bases/dto/knowledge-base.dto.ts`（手动覆盖分片 DTO 支持首尾上下文长度）
  - `server/src/knowledge-bases/knowledge-bases.service.ts`（保存手动分片时写入首尾上下文长度）
  - `web/src/api/knowledgeBase.ts`（补充分片首尾上下文长度类型）
  - `web/src/views/knowledge-base/View.vue`（生成手动分片时按配置重叠值计算首尾字符数；恢复时可根据该长度从入库内容反推出核心段）
  - `CHANGELOG.md`（追加本次手动分片首尾上下文长度快照）
- 删除：无
- 说明：手动分片入库内容保留前置上下文 + 核心内容 + 后置上下文，同时记录首尾实际长度；后续删除、恢复、重新打开编辑时能明确知道哪一段是核心选区。

### 2026-08-21 分片配置区分自动与手动模式
- 新增：无
- 修改：
  - `server/src/knowledge-chunk-configs/entities/knowledge-chunk-config.entity.ts`（新增 `chunkMode` 字段，区分自动分片与手动分片配置）
  - `server/src/knowledge-chunk-configs/dto/knowledge-chunk-config.dto.ts`（新增分片模式入参与查询筛选）
  - `server/src/knowledge-chunk-configs/knowledge-chunk-configs.service.ts`（支持按模式查询配置，手动模式只校验重叠值，自动模式继续校验分片大小与重叠关系；默认配置按模式隔离）
  - `web/src/api/knowledgeChunkConfig.ts`（补充分片模式类型与查询参数）
  - `web/src/views/knowledge-chunk-config/Edit.vue`（配置表单新增分片模式；手动模式仅展示上下文重叠与基础开关，隐藏分片大小、超时、切分方式、保留标题）
  - `web/src/views/knowledge-chunk-config/Index.vue`（列表展示分片模式，手动模式下自动分片字段显示为 `-`）
  - `web/src/views/knowledge-base/View.vue`（手动分片读取手动模式配置的重叠字符数，不再使用固定值）
  - `CHANGELOG.md`（追加本次分片配置模式调整快照）
- 删除：无
- 说明：页面显示“手动 / MinerU/自动”，内部字段使用 `manual / auto`；手动分片的重叠值用于保存入库时补充核心选区前后文，不影响左侧核心选区锁定。

### 2026-08-21 手动分片补充上下文重叠
- 新增：无
- 修改：
  - `server/src/knowledge-bases/entities/knowledge-base-chunk.entity.ts`（分片增加核心内容与手动坐标元数据，用于区分“核心选区”和“入库上下文”）
  - `server/src/knowledge-bases/dto/knowledge-base.dto.ts`（手动覆盖分片 DTO 支持核心内容与手动起止偏移）
  - `server/src/knowledge-bases/knowledge-bases.service.ts`（保存手动分片时写入核心内容、手动起止偏移和带上下文的分片内容）
  - `web/src/api/knowledgeBase.ts`（补充分片元数据类型）
  - `web/src/views/knowledge-base/View.vue`（手动分片生成时自动为入库内容补充前后文，左侧仍只锁定用户划选的核心区域）
  - `CHANGELOG.md`（追加本次手动分片上下文补偿快照）
- 删除：无
- 说明：手动分片不再是纯硬切；默认保存核心选区前后各约 120 字符作为上下文，避免检索命中后 AI 缺少前后语义。已有旧分片无元数据时仍按内容定位兼容。

### 2026-08-21 修复自动分片转手动编辑坐标恢复
- 新增：无
- 修改：
  - `web/src/views/knowledge-base/View.vue`（已有分片回填到手动分片原文坐标时，兼容自动/MinerU 分片的重叠文本；删除已有分片后左侧原文区域能正确解除锁定）
  - `CHANGELOG.md`（追加本次手动分片坐标恢复修复快照）
- 删除：无
- 说明：自动分片常带有重叠内容，原逻辑从上一个分片结束后继续定位下一个分片，导致部分分片坐标丢失；现在改为从上一个分片起点之后继续定位，并统一换行符。

### 2026-08-21 手动分片改为自动保存
- 新增：无
- 修改：
  - `web/src/views/knowledge-base/View.vue`（去掉手动分片区域的“保存分片”按钮，生成分片、删除分片和修改分片标题后自动调用保存接口；同步失败时回滚前端分片列表）
  - `server/src/knowledge-bases/knowledge-bases.service.ts`（手动覆盖分片接口允许 `chunks: []`，全删时软删已有分片并将知识库状态回到已解析、待分片）
  - `CHANGELOG.md`（追加本次手动分片自动保存快照）
- 删除：无
- 说明：全删除分片时前端会提交空数组，后端用空数组表示当前没有分片，不再要求至少保留一个有效分片。

### 2026-08-21 知识库列表支持横向滚动
- 新增：无
- 修改：
  - `web/src/components/Table.vue`（新增 `fit` 可选参数，默认保持自动撑满；设为 `false` 时按列宽触发表格横向滚动）
  - `web/src/views/knowledge-base/Index.vue`（知识库列表关闭自动撑满，文件名列固定 250px，并对长文件名做省略和悬浮完整提示）
  - `AGENTS-COMPONENTS.md`（补充 Table `fit` 参数说明）
  - `CHANGELOG.md`（追加本次列表展示修正快照）
- 删除：无
- 说明：本次只调整前端列表展示，不涉及接口字段和后端逻辑。

### 2026-08-21 新增知识库处理流程文档
- 新增：
  - `知识库处理流程.md`（梳理知识库分类、主记录、文档、分片、解析、索引、检索和问答使用的完整顺序）
- 修改：
  - `CHANGELOG.md`（追加本次流程文档快照）
- 删除：无
- 说明：文档按当前代码实现拆分知识库文档处理链路，并标记向量索引、混合检索、Rerank、OCR、队列持久化等后续扩展边界。仅文档变更，未执行构建。

### 2026-08-20 修复数字输入组件输入草稿态
- 新增：无
- 修改：
  - `web/src/components/InputNumber.vue`（增加内部草稿值，输入时先保留用户输入内容，失焦/确认时再最终解析和范围限制，避免表单字段输入时被立即改写导致无法正常编辑）
  - `CHANGELOG.md`（追加本次数字输入组件修复快照）
- 删除：无
- 说明：知识库新增/编辑中的“匹配优先级”字段使用 `InputNumber`，修复后可正常输入数字。已执行 `web` 的 `npm.cmd run type-check`，通过。

### 2026-08-20 手动分片链接整体折行
- 新增：无
- 修改：
  - `web/src/views/knowledge-base/View.vue`（手动分片原文折行从固定字符数切分改为按真实文字宽度折行，并将 `（链接：...）` 与裸 URL 当作整体 token，避免链接在 `.` 等位置被截断）
  - `CHANGELOG.md`（追加本次手动分片链接整体折行快照）
- 删除：无
- 说明：链接断开不是因为 `.` 符号本身，而是此前固定字符数折行刚好切到该位置；现在链接能放下时会整体跟随关键文字块，放不下时整体换行，只有链接自身超过一整行宽度才拆分。已执行 `web` 的 `npm.cmd run type-check`，通过。

### 2026-08-20 修复手动分片链接鼠标命中偏移
- 新增：无
- 修改：
  - `web/src/views/knowledge-base/View.vue`（鼠标拖拽命中改为按真实文本宽度反推字符位置，修复数字/字母链接宽度较小时选区进度与鼠标位置不一致；原文容器增加 6px padding，Pixi canvas 宽度改为撑满容器）
  - `CHANGELOG.md`（追加本次手动分片链接命中修复快照）
- 删除：无
- 说明：链接、数字、英文等窄字符现在会按实际渲染宽度参与命中和高亮计算，避免鼠标滑动到后方但高亮仍停在前方。已执行 `web` 的 `npm.cmd run type-check`，通过。

### 2026-08-20 修复手动分片链接选区错位
- 新增：无
- 修改：
  - `web/src/views/knowledge-base/View.vue`（Pixi 原文区选区底色和分段文字改为按真实文本宽度定位，修复链接被选中时高亮与文字错位；展示列数从 40 放宽到 48，减少关键字后链接被提前换行）
  - `CHANGELOG.md`（追加本次手动分片链接选区修复快照）
- 删除：无
- 说明：坐标命中仍按字符 offset 计算，但视觉绘制使用文本测量宽度，避免正常字体排版与固定格子宽度冲突。已执行 `web` 的 `npm.cmd run type-check`，通过。

### 2026-08-20 手动分片链接改为跟随正文自然折行
- 新增：无
- 修改：
  - `web/src/views/knowledge-base/View.vue`（手动分片原文展示取消 `（链接：...）` 强制独立换行，链接跟随关键文字块展示，超出固定宽度后自然折行）
  - `CHANGELOG.md`（追加本次手动分片链接折行策略调整快照）
- 删除：无
- 说明：后端解析出的 `申请价保（链接：...）` 结构保持不变，仅调整前端手动分片展示层的折行策略。已执行 `web` 的 `npm.cmd run type-check`，通过。

### 2026-08-20 优化手动分片两栏布局与选区颜色
- 新增：无
- 修改：
  - `web/src/views/knowledge-base/View.vue`（手动分片原文区与分片区改为 50/50 撑满整行；左侧选区背景加深，选中文字统一蓝色，锁定文字保持灰色）
  - `CHANGELOG.md`（追加本次手动分片两栏与选区视觉优化快照）
- 删除：无
- 说明：文字仍按连续同色片段渲染，避免退回逐字符绘制造成的间距问题；坐标选择逻辑不变。已执行 `web` 的 `npm.cmd run type-check`，通过。

### 2026-08-20 优化手动分片文本间距与片段面板宽度
- 新增：无
- 修改：
  - `web/src/views/knowledge-base/View.vue`（Pixi 原文区从逐字符绘制改为整行文本绘制，减少固定格子造成的字体间距；右侧分片面板加宽到 520px，分片预览字体调整为 14px）
  - `CHANGELOG.md`（追加本次手动分片文本排版优化快照）
- 删除：无
- 说明：坐标命中和选择底色仍按字符位置计算，但文字本身按正常文本行渲染，视觉上不再像保留网格像素。已执行 `web` 的 `npm.cmd run type-check`，通过。

### 2026-08-20 手动分片 Pixi 文本面板去网格化
- 新增：无
- 修改：
  - `web/src/views/knowledge-base/View.vue`（手动分片原文区去掉网格线、行列头和等比例布局；Pixi 舞台仅保留文本、选区高亮和已分片锁定底色，左侧按内容实际宽度展示，右侧分片栏改为固定工具面板宽度）
  - `CHANGELOG.md`（追加本次手动分片 Pixi 文本面板优化快照）
- 删除：无
- 说明：视觉上从“字符网格表”调整为“文本选择面板”，减少模糊和视觉负担，保留底层字符坐标与分片保存逻辑。已执行 `web` 的 `npm.cmd run type-check`，通过。

### 2026-08-20 手动分片网格接入 PixiJS
- 新增：
  - `web` 依赖 `pixi.js`（用于手动分片原文网格的分层渲染）
- 修改：
  - `web/src/views/knowledge-base/View.vue`（手动分片原文网格从原生 Canvas 2D 切换为 PixiJS 舞台；背景、网格、锁定/选中状态、文字分层绘制，并在弹窗关闭/组件卸载时销毁 Pixi 实例）
  - `web/package.json`、`web/package-lock.json`（新增 PixiJS 依赖）
  - `CHANGELOG.md`（追加本次 PixiJS 渲染层接入快照）
- 删除：无
- 说明：拖拽选择仍复用原有坐标和分片保存逻辑，渲染层改为更适合高频重绘的 PixiJS。已执行 `web` 的 `npm.cmd run type-check`，通过；执行 `npm.cmd run build` 时被仓库既有类型问题阻断，涉及 `knowledgeBase.ts`、`InputEmail.vue`、`ai-feature-config/Index.vue`、`knowledge-base/Index.vue`，非本次 PixiJS 改动引起。

### 2026-08-20 手动分片网格链接独立换行
- 新增：无
- 修改：
  - `web/src/views/knowledge-base/View.vue`（手动分片网格固定列数调整为 40；展示层识别 `（链接：...）` 并从新行开始渲染，避免链接和正文揉在同一行）
  - `CHANGELOG.md`（追加本次手动分片链接换行展示快照）
- 删除：无
- 说明：链接换行只影响网格展示，坐标仍映射到原文 offset，保存分片时不会插入额外换行。已执行 `web` 的 `npm.cmd run type-check`，通过。

### 2026-08-20 手动分片网格固定列数折行
- 新增：无
- 修改：
  - `web/src/views/knowledge-base/View.vue`（手动分片原文网格固定为 32 列展示，长链接会在网格中自动折行；坐标映射仍指向原文 offset，生成分片时按原始内容截取）
  - `CHANGELOG.md`（追加本次手动分片网格折行快照）
- 删除：无
- 说明：该调整只影响网格展示层，解决链接内联后单行过长导致横向滚动过宽的问题；分片保存内容不额外插入展示换行。已执行 `web` 的 `npm.cmd run type-check`，通过。

### 2026-08-20 调整手动分片左右比例与分片展示
- 新增：无
- 修改：
  - `web/src/views/knowledge-base/View.vue`（手动分片编辑区与分片结果区改为 5:5；Canvas 网格单元改为等宽等高；右侧分片内容取消高度限制，预览字体调整为 12px 并压缩行高）
  - `CHANGELOG.md`（追加本次手动分片布局微调快照）
- 删除：无
- 说明：右侧分片内容现在随内容自动撑开，不再出现单个分片预览内部滚动；网格单元宽高一致，便于按行列坐标观察。已执行 `web` 的 `npm.cmd run type-check`，通过。

### 2026-08-20 Word 解析链接改为原句内联
- 新增：无
- 修改：
  - `server/src/document-parsers/parsers/word-document.parser.ts`（手动解析 `.docx` 时直接从 HTML 转文本，将超链接以括号形式追加到对应词句后，不再额外生成“链接语句块”）
  - `CHANGELOG.md`（追加本次 Word 链接内联解析快照）
- 删除：无
- 说明：链接会输出为 `申请价保（链接：https://...）` 这类形式，方便手动分片时按原句选择并保存链接上下文；同时对 Word 超链接字段中的冗余 URL/标记做了清洗。已执行 `server` 的 `npm.cmd run build`，通过。

### 2026-08-20 手动分片左右对照与 Word 链接块提取
- 新增：无
- 修改：
  - `web/src/views/knowledge-base/View.vue`（手动分片编辑改为左侧原文网格、右侧已生成片段的对照布局，保存分片按钮归入片段栏）
  - `server/src/document-parsers/parsers/word-document.parser.ts`（手动解析 `.docx` 时同步提取超链接所在语句块，并在解析正文末尾追加“链接语句块”区域）
  - `CHANGELOG.md`（追加本次手动分片与 Word 链接解析快照）
- 删除：无
- 说明：Word 文档中的链接地址会以 `链接：URL` 的形式保留在解析文本中，方便手动分片时把链接上下文一起选入分片。已执行 `server` 的 `npm.cmd run build` 与 `web` 的 `npm.cmd run type-check`，均通过。

### 2026-08-20 分片列表 Token 列改为字符数
- 新增：无
- 修改：
  - `web/src/views/knowledge-base/View.vue`（分片内容列表中 `Token数` 列改名为 `字符数`，避免误解为大模型 token 消耗）
  - `CHANGELOG.md`（追加本次分片统计列文案调整快照）
- 删除：无
- 说明：当前 `tokenCount` 字段实际保存的是分片内容字符长度，不代表 AI 模型调用 token，也不会因手动分片产生模型费用。已执行 `web` 的 `npm.cmd run type-check`，通过。

### 2026-08-20 去掉知识库编码展示与录入
- 新增：无
- 修改：
  - `web/src/views/knowledge-base/Edit.vue`（知识库新增/编辑表单去掉编码字段，提交时不再传 `code`）
  - `web/src/views/knowledge-base/Index.vue`（知识库列表去掉编码列，关键词占位改为名称/关键字）
  - `web/src/views/knowledge-base/View.vue`（知识库详情去掉编码展示）
  - `CHANGELOG.md`（追加本次知识库编码移除快照）
- 删除：无
- 说明：仅移除知识库自身编码的前端录入与展示；知识库分类编码暂保留。已执行 `web` 的 `npm.cmd run type-check`，通过。

### 2026-08-20 完善手动分片拖拽与锁定交互
- 新增：无
- 修改：
  - `web/src/views/knowledge-base/View.vue`（进入手动分片后隐藏解析正文区域；Canvas 网格改为按原文行渲染；鼠标按下拖动并松开后固定选择范围；已生成分片的原文范围在网格中置灰锁定，删除分片后释放对应范围）
  - `CHANGELOG.md`（追加本次手动分片拖拽与锁定交互快照）
- 删除：无
- 说明：手动分片现在按行列坐标选择，不再按固定 80 字符硬切行；空格不额外渲染符号，但坐标仍按原文列位置计算。已执行 `web` 的 `npm.cmd run type-check`，通过。

### 2026-08-20 手动分片直接使用详情解析正文
- 新增：无
- 修改：
  - `web/src/views/knowledge-base/View.vue`（打开手动分片时直接使用当前详情中的 `parsedContent/contentText` 渲染 Canvas 网格，不再额外查询知识库文档；保存时缺少文档 ID 才补查文档）
  - `CHANGELOG.md`（追加本次手动分片数据来源优化快照）
- 删除：无
- 说明：详情页已经通过 `getKnowledgeBase` 回填了解析正文，手动分片编辑器无需再次请求文档正文，减少点击等待和因文档查询失败导致网格不展示的可能。已执行 `web` 的 `npm.cmd run type-check`，通过。

### 2026-08-20 手动分片网格改为 Canvas 坐标绘制
- 新增：无
- 修改：
  - `web/src/views/knowledge-base/View.vue`（手动分片网格从每字一个 DOM 按钮改为 Canvas 绘制；点击画布坐标映射到固定行列，每个文字仍占据一个网格；打开编辑器不再强依赖文档记录 ID，只要已有解析正文即可展示网格）
  - `CHANGELOG.md`（追加本次 Canvas 网格交互优化快照）
- 删除：无
- 说明：Canvas 方案减少长文档场景下的大量 DOM 节点，解决点击“手动分片”后界面可能无明显变化或渲染迟滞的问题；保存时仍复用已有手动覆盖分片接口。已执行 `web` 的 `npm.cmd run type-check` 与 `server` 的 `npm.cmd run build`，均通过。

### 2026-08-20 优化手动分片为网格坐标选择
- 新增：无
- 修改：
  - `web/src/views/knowledge-base/View.vue`（手动分片改为固定 80 列字符网格，支持点击字符格设置起止坐标、按坐标范围生成分片、查看坐标和分片预览）
  - `server/src/knowledge-bases/knowledge-bases.service.ts`（手动覆盖分片时保留坐标范围内的正文原文，仅用空白裁剪判断是否为空，避免保存时改变分片边界）
  - `CHANGELOG.md`（追加本次手动分片网格坐标交互快照）
- 删除：无
- 说明：手动分片不再通过自由 textarea 直接编辑正文，改为网格化内容选择，便于后续扩展“划到某行某列”的坐标表达。已执行 `server` 的 `npm.cmd run build` 与 `web` 的 `npm.cmd run type-check`，均通过。

### 2026-08-20 收敛分片配置为自动分片规则
- 新增：无
- 修改：
  - `server/src/knowledge-chunk-configs/*`（移除配置中的手动/自动模式字段，新增自动分片超时时间 `timeoutMinutes`，单位分钟）
  - `server/src/knowledge-bases/knowledge-bases.service.ts`（自动分片按配置的超时时间执行超时保护；手动分片仍由知识库详情页独立操作）
  - `web/src/api/knowledgeChunkConfig.ts`、`web/src/views/knowledge-chunk-config/*.vue`（分片配置列表和编辑表单去掉模式选择，增加超时时间）
  - `CHANGELOG.md`（追加本次分片配置口径调整快照）
- 删除：无
- 说明：分片配置页现在只管理系统自动分片规则；手动分片不走配置页，而是在知识库详情内容页载入解析正文后人工编辑并保存分片。已执行 `server` 的 `npm.cmd run build` 与 `web` 的 `npm.cmd run type-check`，均通过。

### 2026-08-20 新增知识库分片配置与手动分片
- 新增：
  - `server/src/knowledge-chunk-configs/`（知识库分片配置模块，支持分片大小、重叠字符、切分方式、默认配置和启停）
  - `web/src/api/knowledgeChunkConfig.ts`、`web/src/views/knowledge-chunk-config/Index.vue`、`web/src/views/knowledge-chunk-config/Edit.vue`（分片配置列表与编辑页）
- 修改：
  - `server/src/app.module.ts`、`server/src/knowledge-bases/knowledge-bases.module.ts`（挂载分片配置模块）
  - `server/src/knowledge-bases/*`（自动分片读取默认分片配置；新增手动覆盖文档分片接口）
  - `server/src/menus/menus.service.ts`、`web/src/router/index.ts`（知识库管理下新增“分片配置”菜单/路由）
  - `web/src/api/knowledgeBase.ts`、`web/src/views/knowledge-base/View.vue`（知识库详情内容页支持载入解析正文、编辑分片并保存覆盖）
- 删除：无
- 说明：分片规则从检索配置中独立出来，作为知识库构建阶段配置。系统自动分片读取该配置，手动分片由用户在详情页按正文划分。已执行 `server` 的 `npm.cmd run build` 与 `web` 的 `npm.cmd run type-check`，均通过。

### 2026-08-20 修正聊天应用检索配置回显误导
- 新增：无
- 修改：
  - `web/src/views/external-app/Edit.vue`（编辑已有聊天应用时，知识库检索配置按数据库真实值回显；不再因系统只有一条检索配置而自动显示为已绑定）
  - `CHANGELOG.md`（追加本次聊天应用检索配置回显修正快照）
- 删除：无
- 说明：此前编辑已有聊天应用时，如果数据库 `retrievalConfigId` 为 `NULL` 且系统只有一条检索配置，前端会自动回显这条配置，造成“看起来已绑定但接口返回 `retrievalConfigId:null`”的误判。已执行 `web` 的 `npm.cmd run type-check`，通过。

### 2026-08-20 收紧 AI 流式问答知识库约束
- 新增：无
- 修改：
  - `server/src/knowledge-ai-chat/knowledge-ai-chat.service.ts`（绑定知识库检索配置时，即使命中为空也不再裸问题调用模型；流式接口新增 `retrieval` 事件暴露本次检索是否命中参考资料）
  - `web/src/api/knowledgeAiChat.ts`（补充 `retrieval` SSE 事件类型）
  - `CHANGELOG.md`（追加本次知识库问答约束修正快照）
- 删除：无
- 说明：此前检索配置存在但未命中内容时，会退回原始问题，导致大模型按外部常识回答。现在只要启用知识库检索配置，模型就会被明确约束只能依据知识库；未命中时应回答“知识库中未找到相关内容，无法确认”。已执行 `server` 的 `npm.cmd run build` 与 `web` 的 `npm.cmd run type-check`，均通过。

### 2026-08-20 接入 AI 问答知识库检索上下文
- 新增：
  - `server/src/knowledge-ai-chat/knowledge-ai-chat-retrieval.service.ts`（按知识库检索配置读取分片/文档/知识库正文，生成问答参考资料上下文）
- 修改：
  - `server/src/knowledge-ai-chat/knowledge-ai-chat.module.ts`（注入知识库与检索配置相关实体/模块）
  - `server/src/knowledge-ai-chat/knowledge-ai-chat.service.ts`（后台问答和应用端流式问答在调用模型前拼入知识库参考资料）
  - `server/src/knowledge-ai-chat/dto/knowledge-ai-chat.dto.ts`、`web/src/api/knowledgeAiChat.ts`（后台问答请求支持传入 `retrievalConfigId`）
  - `CHANGELOG.md`（追加本次 AI 问答知识库检索接入快照）
- 删除：无
- 说明：当前先实现全文/分片兜底检索，不依赖向量库；优先读取 `knowledge_base_chunks`，没有分片时回退 `knowledge_base_documents.content` 与 `knowledge_bases.contentText`。应用端会使用聊天应用绑定的知识库检索配置。已执行 `server` 的 `npm.cmd run build` 与 `web` 的 `npm.cmd run type-check`，均通过。

### 2026-08-20 调整操作日志扫描源为启动落库与拦截匹配
- 新增：
  - `server/src/log-records/entities/log-api-source.entity.ts`（日志 API 扫描源表，存储模块、API、HTTP 方法、操作摘要、系统模块标记与 API 监控开关）
- 修改：
  - `server/src/log-records/log-api-scanner.ts`（扫描源补充系统/配置类模块标记，用于排除日志自身和系统配置级 API）
  - `server/src/log-records/log-records.module.ts`（注册 `LogApiSource` 实体）
  - `server/src/log-records/log-records.service.ts`（启动时扫描 controller 并同步入库；配置保存时同步模块与 API 开关；请求日志写入改为按数据库中的 API 源和模块配置判断）
  - `CHANGELOG.md`（追加本次操作日志扫描源落库快照）
- 删除：无
- 说明：日志配置源现在不再依赖打开配置时的临时扫描结果；服务启动/重启时会把 controller 扫描结果落入 `log_api_sources`，拦截器只记录已启用模块且命中已启用 API 源的请求。日志管理模块本身和系统配置类 API 会入源表但默认排除监控。已执行 `server` 的 `npm.cmd run build` 与 `web` 的 `npm.cmd run type-check`，均通过。

### 2026-08-20 优化操作日志模块配置与 API 扫描源
- 新增：
  - `server/src/log-records/log-api-scanner.ts`（启动/配置查询时扫描后端 controller，生成模块与 API 配置源）
- 修改：
  - `server/src/log-records/log-records.service.ts`（日志配置从固定模块映射改为扫描源；保存模块级开关；日志记录按真实 API 路径匹配操作摘要）
  - `server/src/log-records/dto/log-record.dto.ts`（日志模块配置 DTO 支持模块启用状态，兼容旧 actions 配置）
  - `web/src/api/logRecord.ts`、`web/src/views/log-record/Index.vue`（操作日志配置弹窗改为模块级两列勾选，不再展示 API 级配置）
  - `CHANGELOG.md`（追加本次操作日志配置优化快照）
- 删除：无
- 说明：后端会在模块初始化和管理端打开配置时扫描 `src/**/*.controller.ts`，提取 `@Controller`、HTTP 方法和 `@ApiOperation` 摘要；配置只控制模块是否纳入日志统计，具体 API 路径和操作名称仍会进入日志明细。已执行 `server` 的 `npm.cmd run build` 与 `web` 的 `npm.cmd run type-check`，均通过。

### 2026-08-20 移除检索配置中的分片参数
- 新增：无
- 修改：
  - `server/src/knowledge-retrieval-configs/entities/knowledge-retrieval-config.entity.ts`（移除 `chunkSize` / `chunkOverlap` 字段）
  - `server/src/knowledge-retrieval-configs/dto/knowledge-retrieval-config.dto.ts`（移除检索配置 DTO 中的分片参数）
  - `server/src/knowledge-retrieval-configs/knowledge-retrieval-configs.service.ts`（删除分片参数保存与校验，仅保留重排配置校验）
  - `web/src/api/knowledgeRetrievalConfig.ts`、`web/src/views/knowledge-retrieval-config/Edit.vue`（前端类型和表单移除分片大小/分片重叠）
  - `CHANGELOG.md`（追加本次检索配置分片参数移除快照）
- 删除：无
- 说明：分片大小/分片重叠属于知识库构建/文档处理阶段，不属于查询检索阶段；检索配置保留召回、权重、范围和重排相关参数。已执行 `server` 的 `npm.cmd run build` 与 `web` 的 `npm.cmd run type-check`，均通过。

### 2026-08-20 优化知识库检索范围与文档匹配元信息
- 新增：无
- 修改：
  - `server/src/knowledge-bases/entities/knowledge-base.entity.ts`、`server/src/knowledge-bases/entities/knowledge-base-document.entity.ts`（新增命中关键字、口语化描述、匹配优先级字段）
  - `server/src/knowledge-bases/dto/knowledge-base.dto.ts`、`server/src/knowledge-bases/knowledge-bases.service.ts`（主知识库与文档 DTO/保存/查询/解析同步这些匹配元信息）
  - `server/src/knowledge-retrieval-configs/*`（检索配置范围新增分类 ID/名称，保留具体知识库文档 ID/名称）
  - `web/src/api/knowledgeBase.ts`、`web/src/views/knowledge-base/*.vue`（知识库新增/编辑/列表/详情/文档列表展示匹配元信息）
  - `web/src/api/knowledgeRetrievalConfig.ts`、`web/src/views/knowledge-retrieval-config/*.vue`（知识库范围由扁平多选改为分类 + 文档树形勾选）
  - `CHANGELOG.md`（追加本次检索范围与文档匹配元信息快照）
- 删除：无
- 说明：检索配置可按分类和具体知识库文档勾选范围；知识库文档可维护命中关键字、口语化描述和匹配优先级，为后续全文/向量/Agent 检索提供更稳定的元数据。已执行 `server` 的 `npm.cmd run build` 与 `web` 的 `npm.cmd run type-check`，均通过。

### 2026-08-20 打通知识库文本/Word/PDF/图片解析分片基础链路
- 新增：
  - `server/src/document-parsers/parsers/image-document.parser.ts`（图片知识库手动解析器，走 OCR 功能配置识别正文）
- 修改：
  - `server/package.json` / `server/package-lock.json`（新增 `mammoth`，用于 `.docx` 手动解析）
  - `server/src/document-parsers/*`（解析内容类型新增 `image`；Word 手动解析接入 `.docx` 文本提取）
  - `server/src/document-ocr/document-ocr.service.ts`（新增图片 OCR 识别，按 OCR 功能配置走视觉模型或 MinerU）
  - `server/src/knowledge-ai-providers/knowledge-ai-providers.service.ts`（OCR 视觉提示从 PDF 页面泛化为图片文字识别）
  - `server/src/stored-files/stored-files.service.ts`（补充图片 MIME 识别）
  - `server/src/knowledge-bases/dto/knowledge-base.dto.ts`、`server/src/knowledge-bases/knowledge-bases.service.ts`（知识库内容类型支持 `image`，解析文件类型校验补充图片格式）
  - `web/src/api/knowledgeBase.ts`、`web/src/views/knowledge-base/*.vue`（前端知识库新增/列表/详情/文档页支持图片类型）
  - `CHANGELOG.md`（追加本次解析分片基础链路快照）
- 删除：无
- 说明：当前阶段仅打通普通文本、PDF、Word（手动支持 `.docx`，`.doc` 建议 MinerU）、图片的解析与分片链路，不包含向量化和向量数据库写入。已执行 `server` 的 `npm.cmd run build` 与 `web` 的 `npm.cmd run type-check`，均通过。

### 2026-08-20 调整阿里云新版 MaaS OpenAI 地址说明
- 新增：无
- 修改：
  - `server/src/knowledge-ai-providers/knowledge-ai-providers.service.ts`（后端模型校验改为合并通用模型列表和功能模型列表；URL 仍严格按 `apiUrl + chatApiPath` 拼接，不自动兼容重复 `/v1` 配置）
  - `CHANGELOG.md`（追加本次阿里云 MaaS 地址配置说明快照）
- 删除：无
- 说明：阿里云新版示例的 `baseURL` 形如 `https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/compatible-mode/v1`，OpenAI SDK 会追加 `/chat/completions`；项目后端则用 `apiUrl + chatApiPath` 拼接。因此后台应填写为 `apiUrl=https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/compatible-mode`、`chatApiPath=v1/chat/completions`，或填写为 `apiUrl=.../compatible-mode/v1`、`chatApiPath=chat/completions`。已执行 `server` 的 `npm.cmd run build`，通过。

### 2026-08-20 修正 AI 功能配置模型下拉来源
- 新增：无
- 修改：
  - `web/src/views/ai-feature-config/Edit.vue`（聊天类型模型下拉改为合并账号“模型列表”和“文本模型”；OCR/向量化/文档解析也按“功能专属模型 + 通用模型列表”合并去重）
  - `CHANGELOG.md`（追加本次模型下拉来源修正快照）
- 删除：无
- 说明：此前聊天类型只要账号维护了“文本模型”，就不会读取通用“模型列表”，导致阿里云账号可选模型只剩少量文本模型。现在通用模型池不会被专属模型字段覆盖。已执行 `web` 的 `npm.cmd run type-check`，通过。

### 2026-08-20 新增知识库检索配置模块
- 新增：
  - `server/src/knowledge-retrieval-configs/`（知识库检索配置 Entity/DTO/Service/Controller/Module）
  - `web/src/api/knowledgeRetrievalConfig.ts`（检索配置前端接口）
  - `web/src/views/knowledge-retrieval-config/Index.vue`（检索配置列表页）
  - `web/src/views/knowledge-retrieval-config/Edit.vue`（检索配置新增/编辑弹窗）
- 修改：
  - `server/src/app.module.ts`（注册知识库检索配置模块）
  - `server/src/menus/menus.service.ts`（聊天管理下新增“知识库检索配置”二级菜单）
  - `server/src/external-apps/*`（聊天应用支持绑定知识库检索配置，并在 appId 校验时确认绑定配置可用）
  - `server/src/knowledge-ai-chat/knowledge-ai-chat.service.ts`（流式聊天 meta / 初始化会话返回绑定的检索配置标识）
  - `web/src/api/externalApp.ts`、`web/src/views/external-app/Index.vue`、`web/src/views/external-app/Edit.vue`（聊天应用列表与表单展示/选择知识库检索配置）
  - `web/src/api/knowledgeAiChat.ts`、`web/src/router/index.ts`（补充检索配置元信息类型与路由）
  - `CHANGELOG.md`（追加本次知识库检索配置模块快照）
- 删除：无
- 说明：检索配置可维护多条，支持选择知识库范围、检索模式、召回参数、混合权重、分片参数和可选重排配置；聊天应用可绑定其中一条，留空则保持纯聊天。已执行 `server` 的 `npm.cmd run build` 与 `web` 的 `npm.cmd run type-check`，均通过。

### 2026-08-19 优化聊天应用绑定配置选择
- 新增：无
- 修改：
  - `web/src/views/external-app/Edit.vue`（聊天应用编辑表单将 AI 聊天配置改为必选下拉，展示配置名/账号/模型；只有一个启用聊天配置时自动选中）
  - `CHANGELOG.md`（追加本次聊天应用绑定配置选择优化快照）
- 删除：无
- 说明：聊天应用现在必须明确绑定一条聊天类型 AI 功能配置，避免应用端调用时仍落到不明确的全局默认配置。已执行 `web` 的 `npm.cmd run type-check`，通过。

### 2026-08-19 修复 MinerU 文档解析状态回写
- 新增：无
- 修改：
  - `server/src/knowledge-bases/knowledge-bases.service.ts`（文档解析队列执行时立即回写“正在解析”状态，创建 MinerU 任务后记录任务 ID；修复异步解析未 `await` 导致失败不能写回文档状态的问题）
  - `CHANGELOG.md`（追加本次 MinerU 文档解析状态修复快照）
- 删除：无
- 说明：修复知识库文档选择 MinerU 解析后，列表长期停留在“任务已提交，等待执行”的问题。已执行 `server` 的 `npm.cmd run build`，通过。

### 2026-08-19 支持私有 OSS 签名读取
- 新增：无
- 修改：
  - `server/src/storage-config/storage-config.service.ts`（根据 OSS 配置识别本系统 OSS 文件并生成临时签名 URL）
  - `server/src/stored-files/stored-files.service.ts`（手动解析远程文件前自动转签名 URL，解决私有 Bucket 读取 403）
  - `server/src/mineru-configs/mineru-configs.module.ts`（引入存储配置模块）
  - `server/src/mineru-configs/mineru-configs.service.ts`（调用 MinerU 前将私有 OSS 文件 URL 转为临时签名 URL）
  - `CHANGELOG.md`（追加本次私有 OSS 签名读取快照）
- 删除：无
- 说明：OSS Bucket 保持私有时，后端读取和 MinerU 第三方解析不能直接使用普通公网 URL；现在会在服务端用 AccessKey 生成有效期签名 URL，再用于 fetch 或提交给 MinerU。已执行 `server` 的 `npm.cmd run build`，通过。

### 2026-08-19 接入阿里云 OSS 上传
- 新增：无
- 修改：
  - `server/package.json` / `server/package-lock.json`（新增 `ali-oss` 与类型依赖）
  - `server/src/uploads/uploads.service.ts`（上传接口在启用阿里云 OSS 时真实调用 OSS 上传，返回公网文件 URL；配置缺失时返回明确错误，不再静默回退本地）
  - `CHANGELOG.md`（追加本次 OSS 上传接入快照）
- 删除：无
- 说明：此前 OSS/CDN 上传分支只是伪代码并回退本地，因此阿里云桶不会新增文件且返回 localhost 地址。现在 `provider=aliyun-oss` 时会上传至 `uploadDir/yyyy/mm/dd/uuid.ext`，并返回 `https://publicBaseUrl/objectKey`。已执行 `server` 的 `npm.cmd run build`，通过。

### 2026-08-19 接入 OCR 功能配置分流
- 新增：无
- 修改：
  - `server/src/ai-feature-configs/entities/ai-feature-config.entity.ts`（AI 功能配置支持 `useMineru`，OCR 使用 MinerU 时账号/模型可为空）
  - `server/src/ai-feature-configs/dto/ai-feature-config.dto.ts`（创建/更新配置支持 `useMineru` 字段）
  - `server/src/ai-feature-configs/ai-feature-configs.module.ts`（引入 MinerU 配置模块）
  - `server/src/ai-feature-configs/ai-feature-configs.service.ts`（OCR+MinerU 分流校验，保存绑定的 MinerU 配置，聊天配置继续强制账号/模型）
  - `server/src/document-ocr/document-ocr.module.ts`（引入 AI 功能配置、大模型账号、MinerU 配置服务）
  - `server/src/document-ocr/document-ocr.service.ts`（PDF OCR 优先读取 OCR 功能配置，按 `useMineru` 选择绑定的 MinerU 配置或视觉模型）
  - `server/src/document-parsers/parsers/pdf-document.parser.ts`（等待异步 OCR 结果后进入分片流程）
  - `server/src/knowledge-ai-providers/knowledge-ai-providers.service.ts`（新增视觉模型 OCR 调用能力）
  - `server/src/knowledge-ai-chat/knowledge-ai-chat.service.ts`（适配 AI 功能配置账号/模型可空后的聊天兜底）
  - `server/src/mineru-configs/mineru-configs.service.ts`（MinerU 解析支持指定配置 ID，不再只依赖全局启用配置；创建任务响应兼容嵌套/数组任务 ID，并在缺少任务 ID 时返回响应摘要）
  - `web/src/api/aiFeatureConfig.ts`（前端类型支持账号/模型可空和 `useMineru`）
  - `web/src/views/ai-feature-config/Edit.vue`（OCR 配置增加 MinerU/视觉模型切换，MinerU 模式下选择具体 MinerU 配置）
  - `web/src/views/ai-feature-config/Index.vue`（列表展示 OCR 执行方式和绑定的 MinerU 配置）
  - `CHANGELOG.md`（追加本次 OCR 配置分流快照）
- 删除：无
- 说明：手动 PDF 解析提取不到文本时，会读取启用的 OCR 功能配置；`useMineru=true` 走该 AI 功能配置绑定的 MinerU 配置，`useMineru=false` 走所选账号的视觉模型。视觉 OCR 请求已兼容只接受 `user` 多模态消息的供应商，响应读取兼容 `choices` / `output` / `output_text` 等常见格式。已执行 `server` 的 `npm.cmd run build` 与 `web` 的 `npm.cmd run type-check`，均通过。

### 2026-08-19 优化 AI 功能配置模型匹配
- 新增：无
- 修改：
  - `server/src/ai-feature-configs/ai-feature-config.constants.ts`（AI 功能类型新增 `embedding` 向量化配置）
  - `web/src/api/aiFeatureConfig.ts`（前端 AI 功能类型补充 `embedding`）
  - `web/src/views/ai-feature-config/Index.vue`（功能类型筛选增加“向量化”）
  - `web/src/views/ai-feature-config/Edit.vue`（模型下拉按功能类型读取账号内对应模型：聊天取文本、OCR 取视觉、文档解析合并视觉/文本、向量化取向量模型）
  - `CHANGELOG.md`（追加本次 AI 功能配置模型匹配快照）
- 删除：无
- 说明：分片本身不依赖向量模型，后续索引/向量入库阶段才需要 embedding 模型，因此独立为“向量化”功能配置。已执行 `server` 的 `npm.cmd run build` 与 `web` 的 `npm.cmd run type-check`，均通过。

### 2026-08-19 修复知识库解析正文展示
- 新增：无
- 修改：
  - `server/src/document-parsers/parsers/pdf-document.parser.ts`（关闭 `pdf-parse` 默认页码分隔符，并过滤 `-- 1 of 1 --` 这类占位内容）
  - `server/src/knowledge-bases/knowledge-bases.service.ts`（解析完成后同步解析正文到知识库主记录，详情兜底读取最新解析文档正文）
  - `web/src/api/knowledgeBase.ts`（新增知识库详情接口封装）
  - `web/src/views/knowledge-base/View.vue`（查看详情时拉取最新详情，内容 Tab 优先展示解析正文并保留原文件链接）
  - `CHANGELOG.md`（追加本次知识库解析正文展示修复快照）
- 删除：无
- 说明：修复手动解析后内容 Tab 仍只显示上传 PDF、无法查看解析结果的问题；PDF 手动解析不再把默认页码占位符当成正文。已执行 `server` 的 `npm.cmd run build` 与 `web` 的 `npm.cmd run type-check`，均通过。

### 2026-08-19 精简大模型账号列表字段
- 新增：
  - `web/src/views/knowledge-ai-provider/View.vue`（大模型账号查看详情弹窗）
- 修改：
  - `web/src/views/knowledge-ai-provider/Index.vue`（列表隐藏 API 路径和模型清单等详情字段，增加查看入口）
  - `CHANGELOG.md`（追加本次列表字段精简快照）
- 删除：无
- 说明：列表页只保留名称、密钥、状态、更新时间等摘要字段；API 地址、路径、模型清单、描述等完整信息改到详情中展示。已执行 `web` 的 `npm.cmd run type-check`，通过。

### 2026-08-19 修复侧边栏菜单滚动
- 新增：无
- 修改：
  - `web/src/layouts/MainLayout.vue`（侧边栏改为纵向弹性布局，菜单区域独立纵向滚动）
  - `CHANGELOG.md`（追加本次侧边栏滚动修复快照）
- 删除：无
- 说明：修复系统菜单过多时侧边栏无法滚动查看底部菜单的问题。已执行 `web` 的 `npm.cmd run type-check`，通过。

### 2026-08-19 修复聊天应用 AI 配置字段类型
- 新增：无
- 修改：
  - `server/src/external-apps/entities/external-app.entity.ts`（为 `aiFeatureConfigId` / `aiFeatureConfigName` 显式声明数据库列类型）
  - `CHANGELOG.md`（追加本次实体字段类型修复快照）
- 删除：无
- 说明：修复 TypeORM 将可空联合类型识别为 `Object`，导致 MySQL 启动时报 `Data type "Object" ... is not supported` 的问题。已执行 `server` 的 `npm.cmd run build`，通过。

### 2026-08-19 聊天应用绑定 AI 聊天配置
- 新增：无
- 修改：
  - `server/src/external-apps/entities/external-app.entity.ts`（聊天应用增加绑定 AI 聊天配置字段）
  - `server/src/external-apps/dto/external-app.dto.ts`（创建/更新聊天应用支持 `aiFeatureConfigId`）
  - `server/src/external-apps/external-apps.module.ts`（引入 AI 功能配置模块）
  - `server/src/external-apps/external-apps.service.ts`（校验并保存聊天应用绑定的 AI 聊天配置）
  - `server/src/ai-feature-configs/ai-feature-configs.service.ts`（支持查询可用聊天配置，移除同类型单启用限制）
  - `server/src/knowledge-ai-chat/dto/knowledge-ai-chat.dto.ts`（后台测试问答支持 `aiFeatureConfigId`）
  - `server/src/knowledge-ai-chat/knowledge-ai-chat.controller.ts`（应用端接口读取 appid 对应聊天应用上下文）
  - `server/src/knowledge-ai-chat/knowledge-ai-chat.service.ts`（应用端优先使用聊天应用绑定配置，后台测试支持选择聊天配置）
  - `web/src/api/externalApp.ts`（聊天应用接口类型增加 AI 配置字段）
  - `web/src/api/knowledgeAiChat.ts`（问答测试请求支持 `aiFeatureConfigId`，流式 meta 增加配置回显）
  - `web/src/views/external-app/`（聊天应用列表和编辑弹窗增加 AI 聊天配置）
  - `web/src/views/knowledge-ai-chat/Index.vue`（后台问答测试增加聊天配置选择）
  - `CHANGELOG.md`（追加本次聊天应用绑定配置快照）
- 删除：无
- 说明：H5 应用端只传 `appid`，后端按 `appid -> 聊天应用 -> AI 聊天配置 -> 大模型账号/模型/提示词` 匹配；未绑定时兜底全局启用的 chat 配置。已执行 `server` 的 `npm.cmd run build` 与 `web` 的 `npm.cmd run type-check`，均通过。

### 2026-08-19 新增 AI 功能配置模块
- 新增：
  - `server/src/ai-feature-configs/`（AI 功能配置模块，支持聊天、文档解析、OCR 的账号/模型/提示词/规则/返回格式配置）
  - `web/src/api/aiFeatureConfig.ts`（AI 功能配置接口封装）
  - `web/src/views/ai-feature-config/`（AI 功能配置列表页与编辑弹窗）
- 修改：
  - `server/src/app.module.ts`（挂载 AI 功能配置模块）
  - `server/src/knowledge-ai-chat/knowledge-ai-chat.module.ts`（引入 AI 功能配置模块）
  - `server/src/knowledge-ai-chat/knowledge-ai-chat.service.ts`（聊天初始化、普通问答和流式问答优先读取“聊天”功能配置）
  - `server/src/menus/menus.service.ts`（聊天管理下新增“AI 功能配置”菜单）
  - `web/src/router/index.ts`（新增“AI 功能配置”路由）
  - `CHANGELOG.md`（追加本次 AI 功能配置快照）
- 删除：无
- 说明：大模型账号继续只负责账号与模型清单；聊天/文档解析/OCR 的业务级模型选择、提示词、规则和返回格式进入独立配置。同一功能类型只保留一个启用配置，便于后端接口稳定匹配。已执行 `server` 的 `npm.cmd run build` 与 `web` 的 `npm.cmd run type-check`，均通过。

### 2026-08-19 新增应用端 AI 会话初始化接口
- 新增：无
- 修改：
  - `server/src/knowledge-ai-chat/dto/knowledge-ai-chat.dto.ts`（新增初始化会话请求 DTO）
  - `server/src/knowledge-ai-chat/knowledge-ai-chat.controller.ts`（新增 `POST /api/knowledge-ai-chat/sessions/init`）
  - `server/src/knowledge-ai-chat/knowledge-ai-chat.service.ts`（新增应用端会话创建逻辑）
  - `web/src/api/knowledgeAiChat.ts`（新增初始化 AI 会话 API 封装）
  - `CHANGELOG.md`（追加本次会话初始化接口快照）
- 删除：无
- 说明：H5 可先通过 `appid + domain` 校验初始化后端真实会话，后续流式聊天复用返回的 `sessionId`，避免客户端自造 SID 导致会话不存在。已执行 `server` 的 `npm.cmd run build` 与 `web` 的 `npm.cmd run type-check`，均通过。

### 2026-08-19 调整聊天流式接口应用端鉴权
- 新增：无
- 修改：
  - `server/src/external-apps/guards/app-id.guard.ts`（优先读取 Header `appid`，兼容 `x-app-id`，不读取 body/query）
  - `server/src/knowledge-ai-chat/knowledge-ai-chat.controller.ts`（流式接口移除 Swagger Bearer 标记，其它后台接口保留 Bearer）
  - `web/src/api/knowledgeAiChat.ts`（流式问答封装改为 Header `appid`）
  - `CHANGELOG.md`（追加本次应用端鉴权契约快照）
- 删除：无
- 说明：流式聊天接口不走 Authorization/JWT，统一使用 `appid + Origin/Referer domain` 验证。已执行 `server` 的 `npm.cmd run build` 与 `web` 的 `npm.cmd run type-check`，均通过。

### 2026-08-19 统一聊天流式接口 appId 请求头契约
- 新增：无
- 修改：
  - `server/src/external-apps/guards/app-id.guard.ts`（appId 仅从 `x-app-id` 请求头读取）
  - `server/src/knowledge-ai-chat/dto/knowledge-ai-chat.dto.ts`（移除 body appId 字段）
  - `web/src/api/knowledgeAiChat.ts`（流式问答封装通过 `x-app-id` Header 传递 appId）
  - `CHANGELOG.md`（追加本次请求头契约快照）
- 删除：无
- 说明：domain 仍由后端从 `Origin` / `Referer` 自动获取并校验，前端无需传 domain。已执行 `server` 的 `npm.cmd run build` 与 `web` 的 `npm.cmd run type-check`，均通过。

### 2026-08-19 新增聊天应用页面与聊天管理菜单
- 新增：
  - `web/src/api/externalApp.ts`（聊天应用接口封装）
  - `web/src/views/external-app/`（聊天应用列表页和编辑弹窗）
- 修改：
  - `server/src/menus/menus.service.ts`（新增“聊天管理”一级菜单，挂载 AI 问答测试、聊天应用、问答记录，并迁移旧聊天菜单）
  - `web/src/router/index.ts`（新增聊天管理路由和聊天应用页面路由）
  - `CHANGELOG.md`（追加本次聊天管理菜单快照）
- 删除：无
- 说明：聊天相关入口从系统配置中拆到“聊天管理”目录；旧 AI 问答测试/问题记录菜单会迁移到新目录，问题记录重命名为问答记录。已执行 `server` 的 `npm.cmd run build` 与 `web` 的 `npm.cmd run type-check`，均通过。

### 2026-08-19 优化二级菜单图标展示
- 新增：无
- 修改：
  - `web/src/components/MenuTree.vue`（侧边栏仅一级菜单展示图标）
  - `web/src/views/menu/Index.vue`（菜单管理列表仅一级菜单展示图标）
  - `web/src/views/menu/Edit.vue`（选择上级菜单后隐藏图标字段，子菜单提交时清空图标）
  - `CHANGELOG.md`（追加本次菜单图标展示快照）
- 删除：无
- 说明：二级菜单不再显示图标；新增/编辑二级菜单时无需填写图标。已执行 `web` 的 `npm.cmd run type-check`，通过。

### 2026-08-19 外部应用增加域名白名单校验
- 新增：无
- 修改：
  - `server/src/external-apps/entities/external-app.entity.ts`（外部应用增加 `domain` 字段）
  - `server/src/external-apps/dto/external-app.dto.ts`（创建/更新外部应用支持配置 `domain`）
  - `server/src/external-apps/external-apps.service.ts`（按 appId 和来源域名校验白名单，domain 为空时跳过校验）
  - `server/src/external-apps/guards/app-id.guard.ts`（读取 `Origin` / `Referer` 作为请求来源域名）
  - `CHANGELOG.md`（追加本次域名白名单校验快照）
- 删除：无
- 说明：H5 调用流式聊天接口时需匹配后台配置的 appId 和 domain；测试阶段 domain 留空表示不校验来源域名。已执行 `server` 的 `npm.cmd run build`，通过。

### 2026-08-19 新增外部应用 appId 接入
- 新增：
  - `server/src/external-apps/`（外部应用 appId 管理模块，支持创建、查询、更新、删除、批量删除）
- 修改：
  - `server/src/app.module.ts`（挂载外部应用模块）
  - `server/src/knowledge-ai-chat/knowledge-ai-chat.module.ts`（引入外部应用模块供 Guard 使用）
  - `server/src/knowledge-ai-chat/knowledge-ai-chat.controller.ts`（流式聊天接口改为 `appId` 校验，不再要求后台 JWT）
  - `server/src/knowledge-ai-chat/dto/knowledge-ai-chat.dto.ts`（请求 DTO 兼容 `appId`）
  - `CHANGELOG.md`（追加本次 appId 接入快照）
- 删除：无
- 说明：H5 可通过 `x-app-id` 请求头调用 `POST /api/knowledge-ai-chat/ask/stream`；后台管理接口 `POST /api/external-apps` 可分配 appId。已执行 `server` 的 `npm.cmd run build`，通过。

### 2026-08-19 新增 AI 聊天流式接口
- 新增：无
- 修改：
  - `server/src/knowledge-ai-providers/knowledge-ai-providers.service.ts`（新增 OpenAI 兼容流式调用与 SSE 增量解析）
  - `server/src/knowledge-ai-chat/knowledge-ai-chat.controller.ts`（新增 `POST /api/knowledge-ai-chat/ask/stream` 流式接口）
  - `server/src/knowledge-ai-chat/knowledge-ai-chat.service.ts`（流式问答接入会话历史、增量输出和问答记录落库）
  - `web/src/api/knowledgeAiChat.ts`（新增前端流式问答请求封装和 SSE 事件解析）
  - `CHANGELOG.md`（追加本次流式聊天接口快照）
- 删除：无
- 说明：接口会自动使用当前唯一启用的大模型账号，返回 `meta` / `delta` / `error` / `done` SSE 事件；已有非流式问答接口保持不变。已执行 `server` 的 `npm.cmd run build` 与 `web` 的 `npm.cmd run type-check`，均通过。

### 2026-08-18 补充大模型账号模型分组字段
- 新增：无
- 修改：
  - `server/src/knowledge-ai-providers/entities/knowledge-ai-provider.entity.ts`（新增文本模型、视觉模型、向量模型字段）
  - `server/src/knowledge-ai-providers/dto/knowledge-ai-provider.dto.ts`（同步新增模型分组入参字段）
  - `server/src/knowledge-ai-providers/knowledge-ai-providers.service.ts`（保存与返回模型分组字段）
  - `web/src/api/knowledgeAiProvider.ts`（同步前端类型）
  - `web/src/views/knowledge-ai-provider/Edit.vue`（编辑表单补充三组模型字段）
  - `web/src/views/knowledge-ai-provider/Index.vue`（列表展示三组模型字段）
  - `CHANGELOG.md`（追加本次模型字段补充快照）
- 删除：无
- 说明：当前聊天测试仍使用原 `models` 字段，新增字段只作为后续文本/视觉/向量模型专用选择能力的配置储备。已执行 `server` 的 `npm.cmd run build` 与 `web` 的 `npm.cmd run type-check`，均通过。

### 2026-08-18 接入手动 PDF 文本解析
- 新增：
  - `server/src/document-ocr/`（手动解析链路的 OCR 兜底服务入口）
- 修改：
  - `server/src/document-parsers/parsers/pdf-document.parser.ts`（接入 `pdf-parse` 文本提取，兼容 v1/v2 导出形态，文本为空时转入 OCR 兜底）
  - `server/src/document-parsers/document-parsers.module.ts`（引入 OCR 模块）
  - `CHANGELOG.md`（追加本次 PDF 解析快照）
- 删除：无
- 说明：普通文本 PDF 现在可走手动解析；扫描件/图片型 PDF 会返回明确处理结果，后续接入 Qwen 视觉模型时只需补充 OCR 服务内部实现。已执行 `server` 的 `npm.cmd run build`，通过。

### 2026-08-18 修复文档格式校验结果落库
- 新增：无
- 修改：
  - `server/src/knowledge-bases/knowledge-bases.service.ts`（MinerU 文档格式校验失败时写入文档状态和处理结果）
  - `CHANGELOG.md`（追加本次格式校验结果落库快照）
- 删除：无
- 说明：`assertSupportedDocumentFile` 仍只负责校验文件扩展名；调用方会在校验失败时把错误写入文档 `description`，前端“处理结果”列可见。已执行 `server` 的 `npm.cmd run build`，通过。

### 2026-08-18 整理知识库解析模式分流
- 新增：无
- 修改：
  - `server/src/knowledge-bases/knowledge-bases.service.ts`（新增统一解析模式常量和辅助方法，集中处理手动解析/MinerU 解析分流）
  - `CHANGELOG.md`（追加本次解析模式重构快照）
- 删除：无
- 说明：减少 Service 中分散的 `manual/mineru` 字符串判断，内部方法命名调整为按模式/第三方解析表达，避免手动解析流程里出现 MinerU 方法名造成误导。已执行 `server` 的 `npm.cmd run build`，通过。

### 2026-08-18 展示知识库处理结果
- 新增：无
- 修改：
  - `server/src/knowledge-bases/knowledge-bases.service.ts`（文档解析提交、成功、失败时写入处理结果，缺少 MinerU 文件 URL 也落入文档记录）
  - `web/src/views/knowledge-base/Index.vue`（知识库列表新增处理结果列）
  - `web/src/views/knowledge-base/Documents.vue`（知识库文档列表新增处理结果列，状态支持处理中/失败颜色）
  - `CHANGELOG.md`（追加本次处理结果展示快照）
- 删除：无
- 说明：解析任务失败原因会回写到业务数据中，列表刷新后可直接在“处理结果”列查看。已执行 `server` 的 `npm.cmd run build` 与 `web` 的 `npm.cmd run type-check`，均通过。

### 2026-08-18 新增知识库处理任务队列
- 新增：
  - `server/src/task-queue/`（轻量内存任务队列，支持任务入队、串行执行和状态记录）
- 修改：
  - `server/src/knowledge-bases/knowledge-bases.module.ts` / `knowledge-bases.service.ts`（知识库解析、分片、索引与文档解析改为提交后台任务）
  - `web/src/api/knowledgeBase.ts`（同步任务返回字段）
  - `web/src/views/knowledge-base/Index.vue` / `Documents.vue`（操作成功文案调整为任务已提交）
  - `CHANGELOG.md`（追加本次任务队列快照）
- 删除：无
- 说明：耗时处理不再让前端请求一直等待；接口提交任务后立即返回 `taskId/status`，具体解析、分片、索引在后端队列中执行并持续更新业务状态。已执行 `server` 的 `npm.cmd run build` 与 `web` 的 `npm.cmd run type-check`，均通过。

### 2026-08-18 新增后端存储文件读取服务
- 新增：
  - `server/src/stored-files/`（根据文件 URL 读取本地上传文件或远程 OSS/CDN 文件内容）
- 修改：
  - `server/src/document-parsers/`（解析器上下文支持文件 Buffer，解析前按需读取文件内容）
  - `server/src/knowledge-bases/knowledge-bases.service.ts`（文档手动解析向解析器传递文件 URL）
  - `CHANGELOG.md`（追加本次文件读取服务快照）
- 删除：无
- 说明：业务表仍保存文件 URL；解析层通过统一读取服务区分本地 `/uploads` 和远程 OSS/CDN URL，再把 Buffer 交给具体解析器。已执行 `server` 的 `npm.cmd run build`，通过。

### 2026-08-18 打通知识库文档列表解析
- 新增：
  - `web/src/views/knowledge-base/Documents.vue`（知识库文档列表页，支持行内选择手动解析或 MinerU 解析）
- 修改：
  - `server/src/knowledge-bases/dto/knowledge-base.dto.ts` / `knowledge-bases.controller.ts` / `knowledge-bases.service.ts`（新增文档级统一解析接口，手动解析接入后端文档解析器服务，MinerU 解析继续走第三方流程）
  - `web/src/api/knowledgeBase.ts`（新增文档统一解析请求）
  - `web/src/router/index.ts`（新增 `/knowledge-bases/documents` 路由）
  - `CHANGELOG.md`（追加本次文档解析打通快照）
- 删除：无
- 说明：菜单管理可挂载“知识库文档”页面；文档列表解析操作会将 `manual` / `mineru` 模式传给后端统一接口。已执行 `server` 的 `npm.cmd run build` 与 `web` 的 `npm.cmd run type-check`，均通过。

### 2026-08-18 新增后端文档解析器模块
- 新增：
  - `server/src/document-parsers/`（文档解析器模块、统一解析服务、文本/PDF/Word 解析器）
- 修改：
  - `server/src/knowledge-bases/knowledge-bases.module.ts`（接入文档解析器模块）
  - `server/src/knowledge-bases/knowledge-bases.service.ts`（手动解析分支改为调用统一解析器服务）
  - `CHANGELOG.md`（追加本次解析器模块快照）
- 删除：无
- 说明：知识库业务流程与具体文档解析实现解耦；文本解析器已可用，PDF/Word 解析器先返回明确提示，后续可分别接入本地解析库。已执行 `server` 的 `npm.cmd run build`，通过。

### 2026-08-18 增加知识库解析模式选择
- 新增：
  - `server/src/knowledge-bases/dto/knowledge-base.dto.ts`（新增 `ParseKnowledgeBaseDto.parseMode`，支持 `manual` / `mineru`）
- 修改：
  - `server/src/knowledge-bases/knowledge-bases.controller.ts` / `knowledge-bases.service.ts`（解析接口接收模式并按手动解析或 MinerU 解析分流）
  - `web/src/api/knowledgeBase.ts`（同步解析模式请求类型）
  - `web/src/views/knowledge-base/Index.vue`（点击解析时先选择手动解析或 MinerU 解析）
  - `CHANGELOG.md`（追加本次解析模式选择快照）
- 删除：无
- 说明：文本内容可走手动解析；PDF/Word 手动解析分支已预留并返回明确提示，当前可选择 MinerU 解析走第三方服务。已执行 `server` 的 `npm.cmd run build` 与 `web` 的 `npm.cmd run type-check`，均通过。

### 2026-08-18 修复知识库编辑文件回显
- 新增：无
- 修改：
  - `web/src/views/knowledge-base/Edit.vue`（编辑回填时跳过内容类型切换清理逻辑，保留已有文件地址和文件名）
  - `CHANGELOG.md`（追加本次知识库编辑文件回显修复快照）
- 删除：无
- 说明：修复 PDF/Word 知识库编辑时已上传文件不显示的问题；用户手动切换内容类型时仍会清空旧文件。已执行 `web` 的 `npm.cmd run type-check`，通过。

### 2026-08-18 调整知识库抽屉为全屏宽度
- 新增：无
- 修改：
  - `web/src/views/knowledge-base/Edit.vue`（新增/编辑抽屉宽度调整为 `100%`）
  - `web/src/views/knowledge-base/View.vue`（查看抽屉宽度调整为 `100%`）
  - `CHANGELOG.md`（追加本次抽屉全屏宽度调整快照）
- 删除：无
- 说明：知识库查看/编辑现在会完整覆盖页面，不再露出左侧菜单区域。已执行 `web` 的 `npm.cmd run type-check`，通过。

### 2026-08-18 优化知识库查看编辑交互
- 新增：无
- 修改：
  - `web/src/views/knowledge-base/Index.vue`（查看、编辑、删除基础操作移除图标）
  - `web/src/views/knowledge-base/Edit.vue`（新增/编辑由普通弹窗改为右侧大抽屉）
  - `web/src/views/knowledge-base/View.vue`（查看由普通弹窗改为右侧大抽屉，并增加基础信息、内容、分片内容 Tab）
  - `CHANGELOG.md`（追加本次知识库交互优化快照）
- 删除：无
- 说明：知识库查看页已接入已有分片查询接口，支持按标题/内容搜索与分页；常规操作按钮更轻量。已执行 `web` 的 `npm.cmd run type-check`，通过。

### 2026-08-18 调整知识库列表操作按钮顺序
- 新增：无
- 修改：
  - `web/src/views/knowledge-base/Index.vue`（操作列调整为 `查看 → 编辑 → 删除 → 解析 → 分片 → 索引`）
  - `CHANGELOG.md`（追加本次知识库列表操作顺序快照）
- 删除：无
- 说明：常规列表操作前置，知识库处理流程按钮后置，符合通用列表操作习惯。已执行 `web` 的 `npm.cmd run type-check`，通过。

### 2026-08-18 修复 Table 自定义操作列重复按钮
- 新增：无
- 修改：
  - `web/src/components/Table.vue`（`show-actions=false` 时彻底关闭内置查看/编辑/删除，仅保留业务自定义操作）
  - `CHANGELOG.md`（追加本次 Table 操作列修复快照）
- 删除：无
- 说明：知识库列表为了按 `解析 → 分片 → 索引 → 查看 → 编辑 → 删除` 排序使用自定义操作列；Table 现在不会再额外叠加内置查看/编辑/删除。已执行 `web` 的 `npm.cmd run type-check`，通过。

### 2026-08-18 修复通用上传返回相对路径
- 新增：无
- 修改：
  - `server/src/uploads/uploads.controller.ts`（上传时读取请求协议、Host 与反向代理头）
  - `server/src/uploads/uploads.service.ts`（本地存储无公开域名时拼接完整可访问 URL）
  - `server/src/main.ts`（更新上传静态访问注释，明确业务字段保存完整地址）
  - `CHANGELOG.md`（追加本次上传接口修复快照）
- 删除：无
- 说明：通用上传接口优先使用 OSS/CDN 配置的公开域名，否则基于当前请求来源返回 `http(s)://host/uploads/...`，知识库新增时 `fileUrl` 可继续按完整 URL 校验。已执行 `server` 的 `npm.cmd run build`，通过。

### 2026-08-18 修复封装下拉首次点击闪退
- 新增：无
- 修改：
  - `web/src/components/Select.vue`（修复输入框 focus 打开后同次 click 又触发关闭的问题）
  - `web/src/components/SelectMultiple.vue`（同步修复多选下拉的同类触发逻辑）
  - `CHANGELOG.md`（追加本次下拉组件修复快照）
- 删除：无
- 说明：下拉控制区改为基于 `mousedown` 处理打开/关闭，并在打开后手动聚焦输入框，避免首次点击弹出后立即关闭。已执行 `web` 的 `npm.cmd run type-check`，通过。

### 2026-08-18 增加知识库处理阶段与行内流程操作
- 新增：无
- 修改：
  - `server/src/knowledge-bases/entities/knowledge-base.entity.ts` / `knowledge-bases.service.ts` / `knowledge-bases.controller.ts`（知识库增加解析、分片、索引阶段字段与处理接口）
  - `web/src/api/knowledgeBase.ts`（同步处理阶段字段与解析、分片、索引请求）
  - `web/src/views/knowledge-base/Index.vue`（列表操作列按 `解析 → 分片 → 索引 → 查看 → 编辑 → 删除` 顺序展示，并增加处理阶段标记）
  - `CHANGELOG.md`（追加本次知识库处理流程快照）
- 删除：无
- 说明：PDF/Word 上传后可按行触发解析、分片、索引流程；文本内容可从解析开始进入同一流程。索引接口当前先完成阶段标记，后续可替换为向量库写入逻辑。已执行 `server` 的 `npm.cmd run build` 与 `web` 的 `npm.cmd run type-check`，均通过。

### 2026-08-17 调整知识库内容配置输入
- 新增：无
- 修改：
  - `server/src/knowledge-bases/entities/knowledge-base.entity.ts` / `dto/knowledge-base.dto.ts` / `knowledge-bases.service.ts`（知识库内容类型调整为文本、PDF、Word，并新增文本内容与文件名称/地址字段保存）
  - `web/src/api/knowledgeBase.ts`（同步知识库内容字段类型）
  - `web/src/views/knowledge-base/Edit.vue`（新增/编辑表单移除排序、描述；内容配置按文本/PDF/Word 动态展示文本域或文件上传）
  - `web/src/views/knowledge-base/Index.vue` / `View.vue`（列表与详情移除排序、描述、图片/文件开关旧展示，改为展示内容类型与文件/文本内容）
  - `CHANGELOG.md`（追加本次知识库内容配置调整快照）
- 删除：无
- 说明：文本类型可直接录入正文；PDF 类型只允许上传 PDF；Word 类型只允许上传 `.doc/.docx`。已执行 `server` 的 `npm.cmd run build` 与 `web` 的 `npm.cmd run type-check`，均通过。

### 2026-08-17 调整知识库分类页行内操作
- 新增：无
- 修改：
  - `web/src/views/knowledge-base/Categories.vue`（移除 `当前分类` 提示，顶部操作区只保留新增分类；编辑、删除与新增子分类改为列表行内操作）
  - `CHANGELOG.md`（追加本次分类页 UI 调整快照）
- 删除：无
- 说明：分类页交互更贴近 demo 列表结构，不再依赖选中行状态触发编辑/删除。已执行 `web` 的 `npm.cmd run type-check`，通过。

### 2026-08-17 新增 MinerU 文档解析配置与知识库解析接口
- 新增：
  - `server/src/mineru-configs/`（MinerU 配置实体、DTO、CRUD 接口与服务端调用封装）
  - `web/src/api/mineruConfig.ts`（MinerU 配置前端 API）
  - `web/src/views/mineru-config/`（MinerU 解析配置列表与编辑弹窗）
- 修改：
  - `server/src/app.module.ts`（挂载 MinerU 配置模块）
  - `server/src/menus/menus.service.ts`（系统配置下新增 `MinerU 解析配置` 菜单）
  - `server/src/knowledge-bases/dto/knowledge-base.dto.ts` / `knowledge-bases.controller.ts` / `knowledge-bases.module.ts` / `knowledge-bases.service.ts`（新增知识库文档 MinerU 创建任务、查询任务、等待解析并落 Markdown 与分片接口）
  - `web/src/api/knowledgeBase.ts`（补充知识库文档 MinerU 解析相关 API 类型与请求函数）
  - `web/src/router/index.ts`（新增 `/system-config/mineru` 路由）
  - `CHANGELOG.md`（追加本次 MinerU 解析能力快照）
- 删除：无
- 说明：系统同时仅允许一个 MinerU 配置启用；知识库文档解析成功后会保存 Markdown 正文，并按约 1200 字符、120 字符重叠重建分片。已执行 `server` 的 `npm.cmd run build` 与 `web` 的 `npm.cmd run type-check`，均通过。

### 2026-08-17 调整知识库分类归属关系
- 新增：无
- 修改：
  - `server/src/knowledge-bases/entities/knowledge-base.entity.ts` / `knowledge-base-category.entity.ts`（分类改为独立目录，知识库新增所属分类字段）
  - `server/src/knowledge-bases/dto/knowledge-base.dto.ts` / `knowledge-bases.service.ts`（分类 CRUD 去除知识库依赖，新增/编辑知识库强制校验分类，删除分类时保护已引用数据）
  - `web/src/api/knowledgeBase.ts`（同步知识库与分类字段契约）
  - `web/src/views/knowledge-base/Categories.vue`（分类页移除知识库选择，保留独立搜索、操作与树形表格）
  - `web/src/views/knowledge-base/Edit.vue` / `Index.vue` / `View.vue`（知识库表单、列表、详情补充所属分类）
  - `web/src/router/index.ts`（知识库管理默认进入分类页）
  - `CHANGELOG.md`（追加本次关系调整快照）
- 删除：无
- 说明：知识库分类现在是独立上层目录；新建或编辑知识库时先选择分类，点击一级知识库管理默认进入分类维护页。已执行 `server` 的 `npm.cmd run build` 与 `web` 的 `npm.cmd run type-check`，均通过。

### 2026-08-17 优化知识库内容配置表单
- 新增：无
- 修改：
  - `server/src/knowledge-bases/entities/knowledge-base.entity.ts` / `dto/knowledge-base.dto.ts` / `knowledge-bases.service.ts`（知识库新增内容类型、是否包含图片、是否允许文件上传配置）
  - `web/src/api/knowledgeBase.ts`（同步知识库内容配置字段类型）
  - `web/src/views/knowledge-base/Edit.vue`（知识库新增/编辑表单重设为“基础信息 + 内容配置”两段）
  - `web/src/views/knowledge-base/Index.vue` / `View.vue`（列表与详情展示内容类型、图片和文件配置）
  - `CHANGELOG.md`（追加本次表单设计快照）
- 删除：无
- 说明：知识库创建时可选择文本、文件或混合内容类型，并配置是否包含图片、是否允许文件上传；已执行 `server` 的 `npm.cmd run build` 与 `web` 的 `npm.cmd run type-check`，均通过。

### 2026-08-17 整理知识库分类页
- 新增：无
- 修改：
  - `web/src/views/knowledge-base/Categories.vue`（调整为搜索行、操作行、树形表格三段结构；无数据时保留 table 表头与骨架）
  - `CHANGELOG.md`（追加本次分类页整理快照）
- 删除：无
- 说明：分类页不再只展示树空状态，按列表页习惯保留查询、重置、操作按钮和表格骨架。已执行 `web` 的 `npm.cmd run type-check`，通过。

### 2026-08-17 整理知识库列表页
- 新增：
  - `web/src/views/knowledge-base/Edit.vue`（知识库新增/编辑弹窗）
  - `web/src/views/knowledge-base/View.vue`（知识库查看弹窗）
- 修改：
  - `web/src/views/knowledge-base/Index.vue`（按 demo 列表页格式重构，仅保留知识库列表 CRUD，移除分类、文档、分片混合 UI）
  - `CHANGELOG.md`（追加本次列表页整理快照）
- 删除：无
- 说明：知识库列表页现在只负责知识库本身；分类维护继续放在 `知识库分类` 菜单中。已执行 `web` 的 `npm.cmd run type-check`，通过。

### 2026-08-17 调整知识库菜单层级
- 新增：
  - `web/src/views/knowledge-base/Categories.vue`（知识库分类/目录维护页）
- 修改：
  - `server/src/menus/menus.service.ts`（`知识库管理` 调整为一级菜单分组，新增 `知识库分类` 与 `知识库列表` 二级菜单）
  - `web/src/router/index.ts`（`/knowledge-bases` 改为重定向，新增 `/knowledge-bases/categories` 与 `/knowledge-bases/list`）
  - `web/src/views/knowledge-base/Index.vue`（页面标题调整为 `知识库列表`）
  - `CHANGELOG.md`（追加本次菜单层级调整快照）
- 删除：无
- 说明：菜单管理中应使用一级 `/knowledge-bases`，二级 `/knowledge-bases/categories`、`/knowledge-bases/list`；已执行 `server` 的 `npm.cmd run build` 与 `web` 的 `npm.cmd run type-check`，均通过。

### 2026-08-17 搭建知识库四层管理骨架
- 新增：
  - `server/src/knowledge-bases/`（知识库、分类/目录、文档、分片四层实体与基础 CRUD 接口）
  - `web/src/api/knowledgeBase.ts`（知识库四层资源前端 API）
  - `web/src/views/knowledge-base/Index.vue`（知识库管理页面：左侧知识库/分类树，右侧文档与分片维护）
- 修改：
  - `server/src/app.module.ts`（挂载知识库模块）
  - `server/src/users/users.service.ts`（默认管理员权限模块补充 `KnowledgeBase`）
  - `server/src/menus/menus.service.ts`（新增知识库管理菜单种子 `/knowledge-bases`）
  - `web/src/router/index.ts`（新增 `/knowledge-bases` 路由）
  - `CHANGELOG.md`（追加本次知识库搭建快照）
- 删除：无
- 说明：本次只搭建知识库结构维护能力，不接向量数据库、不做召回与服务逻辑；已执行 `server` 的 `npm.cmd run build` 与 `web` 的 `npm.cmd run type-check`，均通过。

### 2026-08-17 去除 AI 测试默认业务提示
- 新增：无
- 修改：
  - `server/src/knowledge-ai-providers/knowledge-ai-providers.service.ts`（默认系统提示改为通用测试助手，不绑定业务场景）
  - `web/src/views/knowledge-ai-chat/Index.vue`（问答测试默认系统提示与问题改为通用连通性验证）
  - `web/src/views/knowledge-ai-provider/Index.vue`（大模型账号测试默认问题与占位提示改为通用连通性验证）
  - `CHANGELOG.md`（追加本次文案修正快照）
- 删除：无
- 说明：已移除“洗车/充值/知识库”等业务干扰提示，测试表单只用于验证模型是否正常响应；已执行 `server` 的 `npm.cmd run build` 与 `web` 的 `npm.cmd run type-check`，均通过。

### 2026-08-17 优化 AI 问答测试表单
- 新增：无
- 修改：
  - `server/src/knowledge-ai-chat/dto/knowledge-ai-chat.dto.ts` / `knowledge-ai-chat.service.ts`（问答接口的 `providerId`、`model` 改为可选，由服务端自动匹配启用的大模型账号与默认模型）
  - `server/src/knowledge-ai-providers/knowledge-ai-providers.service.ts`（`callChat` 支持未指定账号时自动查找唯一启用账号，多账号启用时返回配置错误）
  - `web/src/api/knowledgeAiChat.ts`（同步问答请求参数可选化）
  - `web/src/views/knowledge-ai-chat/Index.vue`（移除账号/模型下拉和右侧结果区，改为整页测试聊天表单）
  - `CHANGELOG.md`（追加本次优化快照）
- 删除：无
- 说明：AI 问答测试页现在只提交系统提示与问题，模型账号由后端配置自动匹配；已执行 `server` 的 `npm.cmd run build` 与 `web` 的 `npm.cmd run type-check`，均通过。

### 2026-08-17 新增 AI 问答与问题记录模块
- 新增：
  - `server/src/knowledge-ai-chat/`（问答会话、问答消息实体，发送问题、会话列表、会话详情、删除与批量删除接口）
  - `web/src/api/knowledgeAiChat.ts`（前端问答与记录 API）
  - `web/src/views/knowledge-ai-chat/Index.vue`（AI 问答测试页面）
  - `web/src/views/knowledge-ai-record/Index.vue`（问题记录列表与详情页面）
- 修改：
  - `server/src/knowledge-ai-providers/knowledge-ai-providers.service.ts`（抽出可复用 `callChat` 服务端调用入口）
  - `server/src/app.module.ts` / `server/src/menus/menus.service.ts`（挂载问答模块，新增系统配置子菜单）
  - `web/src/router/index.ts`（新增 `/system-config/ai-chat` 与 `/system-config/ai-record`）
  - `CHANGELOG.md`（追加本次问答与记录模块快照）
- 删除：无
- 说明：问答接口会记录 provider、model、question、answer、错误信息与耗时；问题记录按会话维度分页查询并可查看每轮消息。已执行 `server` 的 `npm.cmd run build` 与 `web` 的 `npm.cmd run type-check`，均通过。

### 2026-08-17 新增 AI 大模型账号模块
- 新增：
  - `server/src/knowledge-ai-providers/`（大模型供应商配置 CRUD、批量删除、测试调用接口）
  - `web/src/api/knowledgeAiProvider.ts`（前端大模型账号 API）
  - `web/src/views/knowledge-ai-provider/Index.vue` / `Edit.vue`（系统配置下的大模型账号列表与编辑弹窗）
- 修改：
  - `server/src/app.module.ts`（挂载大模型账号模块）
  - `web/src/router/index.ts`（`/system-config/ai` 改为大模型账号列表页）
  - `CHANGELOG.md`（追加本次模块快照）
- 删除：无
- 说明：配置字段按文档落地，密钥更新时留空不修改；测试接口按 OpenAI 兼容 Chat Completions 调用并读取 `choices[0].message.content`。已执行 `server` 的 `npm.cmd run build` 与 `web` 的 `npm.cmd run type-check`，均通过。

### 2026-08-12 新增 OSS/CDN 存储配置页面
- 新增：
  - `server/src/storage-config/`（OSS/CDN 存储配置读取与保存接口，当前用 `storage/storage-config.json` 持久化）
  - `web/src/api/storageConfig.ts`（前端存储配置 API）
  - `web/src/views/storage-config/Index.vue`（系统配置下的 OSS/CDN 配置页面）
- 修改：
  - `server/src/uploads/uploads.service.ts` / `uploads.module.ts`（上传接口读取存储配置，OSS 分支预留伪代码连接点，未接 SDK 时回退本地存储）
  - `server/src/app.module.ts` / `server/src/menus/menus.service.ts` / `server/.gitignore`（挂载配置模块，新增系统配置子菜单，忽略本地配置文件）
  - `web/src/router/index.ts`（新增 `/system-config/storage` 路由）
  - `AGENTS-COMPONENTS.md`（同步上传配置契约说明）
  - `CHANGELOG.md`（追加本次存储配置快照）
- 删除：无
- 说明：后台已具备 OSS/CDN 配置表单和 API，上传接口已与配置开关建立连接；真实云 SDK 接入位置已在服务内用伪代码标注。已执行 `server` 的 `npm.cmd run build` 与 `web` 的 `npm.cmd run type-check`，均通过。

### 2026-08-12 新增统一文件上传接口
- 新增：
  - `server/src/uploads/uploads.module.ts` / `uploads.controller.ts` / `uploads.service.ts`（统一文件上传模块，默认本地存储并返回可访问 URL）
  - `web/src/api/upload.ts`（前端通用上传 API）
- 修改：
  - `server/src/app.module.ts` / `server/src/main.ts`（挂载上传模块，暴露 `/uploads` 静态访问路径，支持 `UPLOAD_PUBLIC_BASE_URL`）
  - `server/.env.example` / `server/.gitignore`（补充上传公开域名配置与本地上传目录忽略）
  - `web/src/components/UploadImage.vue` / `UploadFile.vue`（默认调用统一上传接口，业务字段保存 URL；支持自定义 `uploadRequest`）
  - `web/src/components/Component.d.ts` / `web/vite.config.ts`（补充上传组件 props 类型与开发代理）
  - `AGENTS-COMPONENTS.md`（补充上传组件契约）
  - `CHANGELOG.md`（追加本次统一上传快照）
- 删除：无
- 说明：文件底层当前存服务器本地，未来切 OSS/CDN 只需调整上传服务或公开域名配置；业务模块继续只保存文件 URL。已执行 `server` 的 `npm.cmd run build` 与 `web` 的 `npm.cmd run type-check`，均通过。

### 2026-08-12 Form 默认接入封装 Select
- 新增：无
- 修改：
  - `web/src/components/Form.vue`（`type: 'select'` 默认使用封装 `Select`，新增 `type: 'selectMultiple'` 使用封装 `SelectMultiple`，兼容旧 `{ label, value }` options 并保留单选原始 value 类型）
  - `AGENTS-COMPONENTS.md`（同步 Form 下拉字段契约说明）
  - `CHANGELOG.md`（追加本次 Form 下拉接入快照）
- 删除：无
- 说明：Form 不再裸渲染 `el-select`，默认复用项目二次封装下拉能力；已执行 `web` 的 `npm.cmd run type-check`，通过。

### 2026-08-12 优化二次封装组件源码说明
- 新增：无
- 修改：
  - `web/src/components/Input.vue` / `InputNumber.vue` / `InputPhone.vue` / `InputEmail.vue` / `InputAmount.vue`（补充组件定位、props/功能契约与输入同步说明）
  - `web/src/components/Select.vue` / `SelectMultiple.vue`（补充单选/多选下拉契约、Map 回显、虚拟滚动、搜索防抖与缺失值兜底说明）
  - `web/src/components/DatePicker.vue` / `DateRange.vue` / `Checkbox.vue` / `CheckboxGroup.vue` / `Switch.vue`（补充基础表单组件说明）
  - `web/src/components/UploadImage.vue` / `UploadFile.vue`（补充上传回显、dataURL、下载与不内置 API 的说明）
  - `web/src/components/Form.vue` / `Table.vue` / `Dialog.vue` / `MenuTree.vue` / `PageContainer.vue`（补充通用容器、表单、列表和弹窗组件源码说明）
  - `web/src/components/Component.d.ts` / `componentRegistry.ts`（补充动态组件名称登记与注册表用途说明）
  - `CHANGELOG.md`（追加本次组件源码注释优化快照）
- 删除：无
- 说明：本次仅优化二次封装组件源码可读性和维护说明，不调整组件 props、事件、样式类名或交互逻辑。已执行 `web` 的 `npm.cmd run type-check`，通过。

### 2026-08-11 补充日期上传与布尔类封装组件
- 新增：
  - `web/src/components/DatePicker.vue`（日期/日期时间选择）
  - `web/src/components/DateRange.vue`（日期区间/日期时间区间选择）
  - `web/src/components/Checkbox.vue`（单 checkbox）
  - `web/src/components/CheckboxGroup.vue`（字符串数组 checkbox 组）
  - `web/src/components/Switch.vue`（布尔开关）
  - `web/src/components/UploadImage.vue`（图片上传与回显）
  - `web/src/components/UploadFile.vue`（文件上传、回显、下载与移除）
- 修改：
  - `web/src/components/Component.d.ts` / `web/src/components/componentRegistry.ts`（注册新增组件）
  - `server/src/demo/entities/demo.entity.ts` / `server/src/demo/dto/demo.dto.ts` / `server/src/module-models/module-models.map.ts`（新增 demo 日期、有效期、允许评论、发布渠道字段）
  - `web/src/api/demo.ts` / `web/src/views/demo/Edit.vue` / `web/src/views/demo/Index.vue` / `web/src/views/demo/View.vue`（demo 优先实践新增组件）
  - `AGENTS-COMPONENTS.md`（补充组件契约速览）
  - `CHANGELOG.md`（追加本次组件封装快照）
- 删除：无
- 说明：demo 现在覆盖日期、日期范围、switch、checkbox、checkbox 组、图片上传和文件上传等常见表单控件实践。已执行 `server` 的 `npm.cmd run build` 与 `web` 的 `npm.cmd run type-check`，均通过。

### 2026-08-11 优化邮箱输入后缀选择体验
- 新增：无
- 修改：
  - `web/src/components/InputEmail.vue`（邮箱输入改为账号 + 固定 `@` + 后缀下拉/可手输结构，支持粘贴完整邮箱自动拆分）
  - `web/src/components/Component.d.ts`（补充 `InputEmail` 的后缀列表与后缀占位 props）
  - `AGENTS-COMPONENTS.md`（更新 `InputEmail` 组件说明）
  - `CHANGELOG.md`（追加本次邮箱输入交互优化快照）
- 删除：无
- 说明：用户输入账号部分时 `@` 自动展示，邮箱后缀可从常见域名下拉选择，也可手动输入；最终 `v-model` 仍保存完整邮箱字符串。已执行 `web` 的 `npm.cmd run type-check`，通过。

### 2026-08-11 demo 新增邮箱字段与邮箱输入组件
- 新增：
  - `web/src/components/InputEmail.vue`（邮箱输入组件，内置邮箱格式校验，支持关闭或覆盖规则）
- 修改：
  - `web/src/components/inputRules.ts`（新增邮箱校验规则）
  - `web/src/components/Component.d.ts`（注册 `InputEmail` 组件名称和 props 类型）
  - `web/src/components/componentRegistry.ts`（注册 `InputEmail` 运行时映射）
  - `server/src/demo/entities/demo.entity.ts`（新增邮箱字段）
  - `server/src/demo/dto/demo.dto.ts`（新增邮箱字段校验）
  - `server/src/module-models/module-models.map.ts`（同步 demo 模块邮箱字段元数据）
  - `web/src/api/demo.ts`（同步 demo 类型与表单字段）
  - `web/src/views/demo/Edit.vue`（邮箱字段实践 `InputEmail`）
  - `web/src/views/demo/Index.vue` / `web/src/views/demo/View.vue`（列表与详情展示邮箱）
  - `AGENTS-COMPONENTS.md`（补充 `InputEmail` 组件契约）
  - `CHANGELOG.md`（追加本次 demo 字段与组件快照）
- 删除：无
- 说明：邮箱作为差异化输入类型独立封装，demo 页面继续优先实践封装组件；已执行 `server` 的 `npm.cmd run build` 与 `web` 的 `npm.cmd run type-check`，均通过。

### 2026-08-11 新增单选与多选 Select 封装组件
- 新增：
  - `web/src/components/Select.vue`（单选下拉，支持搜索防抖、虚拟滚动、键盘上下/Enter、缺失值 `#id` 回显）
  - `web/src/components/SelectMultiple.vue`（多选下拉，绑定值为 `string[]`，支持搜索防抖、虚拟滚动、键盘选择、tag 折叠与缺失值回显）
- 修改：
  - `web/src/components/Component.d.ts`（注册 `Select` / `SelectMultiple` 组件名称和 props 类型）
  - `web/src/components/componentRegistry.ts`（注册运行时组件映射）
  - `web/src/components/Form.vue`（动态组件 props 支持 `ref/computed` 自动解包）
  - `web/src/views/demo/Edit.vue`（分类/状态实践 `Select`，标签实践 `SelectMultiple`）
  - `AGENTS-COMPONENTS.md`（补充 Select 组件契约）
  - `CHANGELOG.md`（追加本次组件封装快照）
- 删除：无
- 说明：Select 组件不内置 API 查询，统一使用 `[{ value: string, text: string }]` 数据格式；多选严格按字符串数组绑定。已执行 `web` 的 `npm.cmd run type-check`，通过。

### 2026-08-11 封装组件去除 Pro 前缀
- 新增：
  - `web/src/components/Button.vue`（原 `ProButton.vue`）
  - `web/src/components/Dialog.vue`（原 `ProDialog.vue`）
  - `web/src/components/Form.vue`（原 `ProForm.vue`）
  - `web/src/components/Table.vue`（原 `ProTable.vue`）
- 修改：
  - `web/src/**/*.vue` / `web/src/**/*.ts`（同步组件导入、模板标签与 `FormField` / `TableColumn` 类型名）
  - `web/components.d.ts`（同步自动组件声明中的语义化组件名）
  - `AGENTS.md` / `AGENTS-FRONTEND.md` / `AGENTS-COMPONENTS.md` / `.design-spec.md` / `MIGRATION.md`（同步组件契约文档）
  - `CHANGELOG.md`（追加本次命名调整快照）
- 删除：
  - `web/src/components/ProButton.vue`
  - `web/src/components/ProDialog.vue`
  - `web/src/components/ProForm.vue`
  - `web/src/components/ProTable.vue`
- 说明：封装组件文件名与使用名称去除 `Pro` 前缀，保留 `Button` / `Dialog` / `Form` / `Table` 等纯语义名称；已执行 `web` 的 `npm.cmd run type-check`，通过。

### 2026-08-11 demo 页面实践封装按钮组件
- 新增：无
- 修改：
  - `web/src/views/demo/Index.vue`（工具栏新增/批量删除、附件下载按钮改用 `ProButton`）
  - `web/src/views/demo/View.vue`（附件下载与关闭按钮改用 `ProButton`）
  - `CHANGELOG.md`（追加本次 demo 组件实践快照）
- 删除：无
- 说明：demo 页面继续作为新增业务模块模板，优先实践项目封装组件；批量删除按钮关闭 `ProButton` 自带确认，继续交给 `ProTable` 原流程处理。已执行 `web` 的 `npm.cmd run type-check`，通过。

### 2026-08-11 修正金额组件切换布局与联动行为
- 新增：无
- 修改：
  - `web/src/components/InputAmount.vue`（金额/百分比切换改为左侧主输入、右侧固定 150px 换算区，切换后主输入类型真正切换）
  - `CHANGELOG.md`（追加本次金额组件修复快照）
- 删除：无
- 说明：金额模式下右侧自动展示占比，百分比模式下主输入自动带 `%`，右侧自动展示换算金额；`v-model` 仍保存金额值。已执行 `web` 的 `npm.cmd run type-check`，通过。

### 2026-08-11 优化封装输入组件宽度与金额占比输入
- 新增：无
- 修改：
  - `web/src/components/Input.vue`（默认输入组件宽度撑满父容器）
  - `web/src/components/InputNumber.vue`（数值输入组件宽度撑满父容器）
  - `web/src/components/InputPhone.vue`（手机号输入组件宽度撑满父容器）
  - `web/src/components/InputAmount.vue`（金额组件改为金额/占比左右联动输入，中间按钮切换输入侧）
  - `CHANGELOG.md`（追加本次组件交互优化快照）
- 删除：无
- 说明：demo 页面引用这些组件后会自动撑满 ProForm 分配的宽度；`InputAmount` 的 `v-model` 仍保存金额值，右侧占比按 `totalAmount` 联动换算。已执行 `web` 的 `npm.cmd run type-check`，通过。

### 2026-08-11 在 demo 页面实践专用输入组件
- 新增：无
- 修改：
  - `server/src/demo/entities/demo.entity.ts`（新增联系电话、数量、单价与预算金额字段）
  - `server/src/demo/dto/demo.dto.ts`（同步新增字段校验）
  - `server/src/module-models/module-models.map.ts`（补充 demo 模块字段元数据，标记对应输入组件实践）
  - `web/src/api/demo.ts`（同步 demo 类型与表单字段）
  - `web/src/views/demo/Edit.vue`（优先使用 `InputPhone`、`InputNumber`、`InputAmount` 实践专用输入组件）
  - `web/src/views/demo/Index.vue`（列表展示电话、数量、单价与预算金额）
  - `web/src/views/demo/View.vue`（详情展示电话、数量、单价与预算金额）
  - `CHANGELOG.md`（追加本次 demo 实践快照）
- 删除：无
- 说明：demo 模块现在覆盖文本、下拉、checkbox、上传图片、上传文件、电话、数字、金额以及金额/百分比切换等输入实践。已执行 `server` 的 `npm.cmd run build` 与 `web` 的 `npm.cmd run type-check`，均通过。

### 2026-08-11 新增金额与百分比切换输入组件
- 新增：
  - `web/src/components/InputAmount.vue`（金额输入组件，支持金额/百分比模式切换，并按总金额换算实际金额）
- 修改：
  - `web/src/components/Component.d.ts`（注册 `InputAmount` 组件名称和 props 类型）
  - `web/src/components/componentRegistry.ts`（注册 `InputAmount` 运行时组件映射）
  - `CHANGELOG.md`（追加本次公共组件快照）
- 删除：无
- 说明：`InputAmount` 的 `v-model` 始终保存金额值；百分比模式依赖 `totalAmount` 换算，支持内置校验关闭或通过 `rules` 覆盖。已执行 `web` 的 `npm.cmd run type-check`，通过。

### 2026-08-11 拆分专用输入组件并内置可配置校验
- 新增：
  - `web/src/components/InputNumber.vue`（数值输入组件，支持 number/integer/money 模式与范围校验）
  - `web/src/components/InputPhone.vue`（手机号输入组件，内置手机号格式校验）
  - `web/src/components/inputRules.ts`（输入组件通用校验规则工具）
- 修改：
  - `web/src/components/Input.vue`（回归文本/多行/密码/搜索等文本类输入职责）
  - `web/src/components/Component.d.ts`（补充 `InputNumber` / `InputPhone` 组件名称和 props 类型）
  - `web/src/components/componentRegistry.ts`（注册专用输入组件运行时映射）
  - `web/src/components/ProForm.vue`（限制默认 `inputMode` 为文本类模式，差异输入走组件名称）
  - `CHANGELOG.md`（追加本次公共组件快照）
- 删除：无
- 说明：差异较大的输入类型拆分为独立组件；专用组件提供内置校验，并支持 `rulesEnabled` 关闭或 `rules` 覆盖。已执行 `web` 的 `npm.cmd run type-check`，通过。

### 2026-08-11 新增项目 Input 组件与组件名称声明
- 新增：
  - `web/src/components/Input.vue`（基于 Element Plus 的项目输入组件，支持 text/textarea/password/integer/number/money/search 模式）
  - `web/src/components/Component.d.ts`（声明项目封装组件名称与组件 props 类型映射）
  - `web/src/components/componentRegistry.ts`（提供表单组件名称到运行时组件的映射）
- 修改：
  - `web/src/components/ProForm.vue`（默认输入和多行文本接入项目 `Input`，并预留按组件名称动态渲染能力）
  - `CHANGELOG.md`（追加本次公共组件快照）
- 删除：无
- 说明：为后续表单 schema 根据组件名称匹配封装组件做基础设施准备。已执行 `web` 的 `npm.cmd run type-check`，通过。

### 2026-08-11 扩展示例模块字段类型
- 新增：无
- 修改：
  - `server/src/demo/entities/demo.entity.ts`（新增推荐、标签、封面图片、附件名称与附件文件字段）
  - `server/src/demo/dto/demo.dto.ts`（同步新增字段校验）
  - `server/src/module-models/module-models.map.ts`（补充 demo 模块字段元数据，并修正分类/状态枚举）
  - `web/src/api/demo.ts`（同步 demo 类型与表单字段）
  - `web/src/dic/index.ts`（新增示例标签字典）
  - `web/src/views/demo/Edit.vue`（通过插槽展示 checkbox、图片上传、文件上传等字段控件）
  - `web/src/views/demo/Index.vue`（列表展示推荐、标签、附件下载）
  - `web/src/views/demo/View.vue`（详情展示新增字段、图片预览与附件下载）
  - `CHANGELOG.md`（追加本次功能快照）
- 删除：无
- 说明：demo 模块现在覆盖输入框、文本域、下拉、单 checkbox、checkbox 组、图片上传、文件上传等多种字段类型，便于新增业务模块时复制参考。已执行 `server` 的 `npm.cmd run build` 与 `web` 的 `npm.cmd run type-check`，均通过。

### 2026-08-03 数据导入列表支持模块编辑详情
- 新增：无
- 修改：
  - `server/src/data-import/data-import.controller.ts`（新增数据导入配置更新接口）
  - `server/src/data-import/data-import.service.ts`（支持编辑配置时保留或替换原模板文件）
  - `web/src/api/dataImport.ts`（新增数据导入配置更新 API）
  - `web/src/views/data-import/Index.vue`（模块列改为可点击打开编辑详情，弹窗内已有模板文件名支持下载）
  - `CHANGELOG.md`（追加本次交互优化快照）
- 删除：无
- 说明：数据导入列表点击模块名可打开该配置详情并编辑模块字段映射；文件名列继续支持下载，编辑详情里的已有模板名也可下载。已执行 `server` 的 `npm.cmd run build` 与 `web` 的 `npm.cmd run type-check`，均通过。

### 2026-08-03 支持数据导入模板中文名称与下载
- 新增：无
- 修改：
  - `server/src/data-import/entities/data-import-config.entity.ts`（新增模板文件二进制内容字段，列表默认不查询）
  - `server/src/data-import/data-import.service.ts`（保存模板内容，修正中文文件名编码，提供模板文件读取）
  - `server/src/data-import/data-import.controller.ts`（新增模板下载接口）
  - `web/src/api/dataImport.ts`（新增模板下载 API）
  - `web/src/views/data-import/Index.vue`（模板文件列改为可点击下载）
  - `CHANGELOG.md`（追加本次功能快照）
- 删除：无
- 说明：修复中文模板文件名显示乱码问题，并支持从数据导入列表下载已上传模板。已执行 `server` 的 `npm.cmd run build` 与 `web` 的 `npm.cmd run type-check`，均通过。

### 2026-08-03 优化数据导入模板上传与字段映射确认
- 新增：无
- 修改：
  - `server/src/data-import/entities/data-import-config.entity.ts`（新增 `fieldMappings` 保存模板字段与系统字段映射）
  - `server/src/data-import/dto/data-import.dto.ts`（配置保存入参支持字段映射 JSON）
  - `server/src/data-import/data-import.service.ts`（保存数据导入配置时解析并校验字段映射）
  - `web/src/api/dataImport.ts`（配置上传接口同步提交字段映射）
  - `web/src/views/data-import/Index.vue`（上传模板后隐藏拖拽区，展示文件移除入口和可编辑字段映射表）
  - `CHANGELOG.md`（追加本次交互优化快照）
- 删除：无
- 说明：模板文件选择后只展示已选文件，点击移除后恢复拖拽上传；上传后自动按已勾选导入字段生成“模板字段 → 系统字段”映射，支持保存前调整。已执行 `server` 的 `npm.cmd run build` 与 `web` 的 `npm.cmd run type-check`，均通过。

### 2026-08-03 数据导入支持列表与字段模板配置
- 新增：
  - `server/src/data-import/entities/data-import-config.entity.ts`（数据导入配置记录实体，保存模块、字段集合与模板文件元信息）
  - `server/src/data-import/dto/data-import.dto.ts`（数据导入配置列表查询与保存 DTO）
  - `server/src/data-import/data-import.service.ts`（数据导入配置分页查询、模块字段校验与模板元信息保存逻辑）
  - `server/src/data-import/data-import.controller.ts`（新增 `GET /api/data-import/configs` 与 `POST /api/data-import/configs`）
  - `server/src/data-import/data-import.module.ts`（数据导入模块）
  - `web/src/api/dataImport.ts`（数据导入配置列表与上传保存接口封装）
- 修改：
  - `server/src/app.module.ts`（挂载 `DataImportModule`）
  - `web/src/views/data-import/Index.vue`（改为列表页面，并新增大弹窗配置：选择模块、勾选导入字段、上传模板）
  - `CHANGELOG.md`（追加本次功能快照）
- 删除：无
- 说明：数据导入页面从单按钮入口升级为配置记录列表；配置保存时使用模块模型字段元数据过滤只读字段，并通过 `FormData` 上传模板文件。已执行 `server` 的 `npm.cmd run build` 与 `web` 的 `npm.cmd run type-check`，均通过。

### 2026-08-03 修复日志记录模块筛选宽度
- 新增：无
- 修改：
  - `web/src/views/log-record/Index.vue`（模块筛选改用搜索插槽渲染，并设置固定宽度）
  - `CHANGELOG.md`（追加本次样式修复快照）
- 删除：无
- 说明：修复日志记录页搜索栏模块下拉未设置宽度导致控件收缩的问题。已执行 `web` 的 `npm.cmd run type-check`，通过。

### 2026-08-03 去除日志配置 API 勾选项边框
- 新增：无
- 修改：
  - `web/src/views/log-record/Index.vue`（去除日志统计配置弹窗中 API 勾选项的整行边框，保留无框纵向列表展示）
  - `CHANGELOG.md`（追加本次样式调整快照）
- 删除：无
- 说明：按截图反馈去除模块展开后 API 勾选项的蓝色边框，使配置弹窗视觉更轻量。已执行 `web` 的 `npm.cmd run type-check`，通过。

### 2026-08-03 日志配置支持模块下 API 粒度
- 新增：无
- 修改：
  - `server/src/log-records/entities/log-module-config.entity.ts`（新增 `enabledActions` 保存启用 API 动作）
  - `server/src/log-records/dto/log-record.dto.ts`（日志配置保存入参改为模块与 actions 集合）
  - `server/src/log-records/log-records.controller.ts`（保存接口对齐新入参）
  - `server/src/log-records/log-records.service.ts`（配置返回模块下 API 列表，日志写入按动作判断）
  - `web/src/api/logRecord.ts`（同步动作级配置类型与保存接口）
  - `web/src/views/log-record/Index.vue`（配置弹窗改为竖向模块展开并勾选具体 API）
  - `CHANGELOG.md`（追加本次功能快照）
- 删除：无
- 说明：日志统计配置从“只勾选模块”升级为“勾选模块下具体 API”，支持按查看/新增/编辑/删除/批量删除粒度决定是否纳入日志记录；兼容旧的模块启用配置，旧配置会默认启用该模块全部日志动作。已执行 `server` 的 `npm.cmd run build` 与 `web` 的 `npm.cmd run type-check`，均通过。

### 2026-08-03 补齐日志配置后的接口调用记录
- 新增：
  - `server/src/log-records/log-records.interceptor.ts`（全局拦截成功响应后的业务接口调用并写入日志）
- 修改：
  - `server/src/log-records/log-records.module.ts`（注册日志记录拦截器）
  - `server/src/log-records/log-records.service.ts`（按模块配置判断是否写入日志，支持查看/新增/编辑/删除/批量删除动作识别）
  - `CHANGELOG.md`（追加本次修复快照）
- 删除：无
- 说明：修复配置模块后调用对应模块查看/编辑接口仍查不到日志的问题；现在仅当模块已在日志配置中启用，且请求为详情查看或变更类操作时写入 `log_records`。已执行 `server` 的 `npm.cmd run build`，通过。

### 2026-08-03 日志记录接入日志表与模块统计配置
- 新增：
  - `server/src/log-records/entities/log-record.entity.ts`（日志记录表实体）
  - `server/src/log-records/entities/log-module-config.entity.ts`（纳入日志统计的模块配置实体）
  - `server/src/log-records/dto/log-record.dto.ts`（日志查询与模块配置 DTO）
  - `server/src/log-records/log-records.controller.ts`（日志记录列表与模块配置接口）
  - `server/src/log-records/log-records.service.ts`（日志分页查询、配置读取与保存逻辑）
  - `server/src/log-records/log-records.module.ts`（日志记录模块）
  - `web/src/api/logRecord.ts`（日志记录列表与配置接口封装）
- 修改：
  - `server/src/app.module.ts`（挂载 `LogRecordsModule`）
  - `web/src/views/log-record/Index.vue`（恢复日志表列表，并将“配置”改为模块勾选弹窗）
  - `CHANGELOG.md`（追加本次功能快照）
- 删除：无
- 说明：日志记录页列表数据改为读取 `log_records` 表；配置弹窗保存被勾选模块到 `log_module_configs`，后续日志采集可按该配置判断是否纳入统计。已执行 `server` 的 `npm.cmd run build` 和 `web` 的 `npm.cmd run type-check`，均通过。

### 2026-08-03 收敛日志记录和数据导入入口
- 新增：无
- 修改：
  - `web/src/views/log-record/Index.vue`（移除模块字段下拉与字段列表，仅保留“配置”按钮）
  - `web/src/views/data-import/Index.vue`（移除模块字段下拉与字段列表，仅保留“配置”按钮）
  - `CHANGELOG.md`（追加本次修正快照）
- 删除：无
- 说明：按最新需求将日志记录和数据导入入口收敛为单一配置按钮，点击后的具体效果待后续确认后再实现。

### 2026-08-02 调整权限模型为基础动作与角色完整授权分离
- 新增：无
- 修改：
  - `server/src/users/users.service.ts`（内置权限 seed 改为基础动作集合；启动时迁移旧完整权限到 `roles.permissionCodes` 并清理旧权限表数据）
  - `server/src/auth/auth.service.ts`、`server/src/auth/auth.module.ts`（登录/个人信息权限来源改为角色表 `permissionCodes`）
  - `server/src/roles/*`、`server/src/permissions/*`（角色保存完整 `Module.action` 权限码；权限管理只接收基础动作码；描述字段退出 DTO）
  - `server/src/module-models/module-models.map.ts`（模块元数据移除角色/权限描述字段和权限菜单归属字段）
  - `web/src/views/role/*`、`web/src/views/permission/*`、`web/src/api/role.ts`、`web/src/api/permission.ts`（角色授权树按“菜单模块 × 基础权限动作”生成，权限管理移除描述字段）
  - `web/src/stores/user.ts`、`web/src/components/ProTable.vue`、`web/src/views/menu/Index.vue`（前端权限判断改为只认完整权限码；菜单分配权限保存时按菜单模块组合完整码）
- 删除：无
- 说明：按“权限管理维护基础权限类型集合，角色负责菜单关联并保存完整权限”的模型重整 RBAC 数据流；描述字段在角色/权限业务表单与元数据中不再使用。已执行 `web` 的 `npm.cmd run type-check`、`npm.cmd run build`，以及 `server` 的 `npm.cmd run build`，均通过；前端构建仅有第三方库 Rollup 注释警告。

### 2026-08-02 系统配置新增日志记录和数据导入入口
- 新增：
  - `web/src/api/moduleModel.ts`（封装模块模型列表、详情、字段列表接口）
  - `web/src/views/log-record/Index.vue`（日志记录系统配置入口，复用模块字段元数据做模块筛选与字段预览）
  - `web/src/views/data-import/Index.vue`（数据导入系统配置入口，复用模块字段元数据做导入字段预览）
- 修改：
  - `server/src/menus/menus.service.ts`（系统配置 seed 追加“日志记录”“数据导入”两个子菜单）
  - `web/src/router/index.ts`（新增 `/system-config/log-record` 与 `/system-config/data-import` 路由，页面文件不挂载在 `views/system/` 下）
  - `CHANGELOG.md`（追加本次快照）
- 删除：无
- 说明：为后续数据导入与日志功能预留入口，并将功能页面按业务域拆分到独立目录，避免 `views/system/` 继续膨胀。已执行 `web` 的 `npm.cmd run type-check` 与 `server` 的 `npm.cmd run build`，均通过。

### 2026-08-02 新增模块模型字段元数据接口
- 新增：
  - `server/src/module-models/module-models.map.ts`（模块 id 到 Model 字段集的静态映射，覆盖 user/role/permission/menu/demo）
  - `server/src/module-models/module-models.service.ts`（模块列表、模块详情、字段列表查询逻辑）
  - `server/src/module-models/module-models.controller.ts`（新增 `GET /api/module-models`、`GET /api/module-models/:moduleId`、`GET /api/module-models/:moduleId/fields`）
  - `server/src/module-models/module-models.module.ts`（模块模型元数据模块）
- 修改：
  - `server/src/app.module.ts`（挂载 `ModuleModelsModule`）
  - `CHANGELOG.md`（追加本次后端接口快照）
- 删除：无
- 说明：新增只读模型元数据能力，用显式映射文件维护模块列表与字段定义，便于后续按模块 id 获取字段集。已执行 `server` 的 `npm.cmd run build`，新增目录执行 `npx.cmd eslint src/module-models/*.ts` 通过；`app.module.ts` 参与 lint 时仍会暴露项目既有 `require` 风格导入等历史 lint 问题，本次未改动该历史债务。

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

### 2026-08-02 修复侧边栏父级菜单配色
- 新增：无
- 修改：
  - `web/src/layouts/MainLayout.vue`（补齐 `.el-sub-menu__title` 的常规、hover、active/open 样式，使“系统配置”等父级菜单符合 `.design-spec.md` 侧边栏配色规范）
  - `CHANGELOG.md`（追加本次样式修复快照）
- 删除：无
- 说明：修复系统配置父级菜单使用 Element Plus 默认标题样式导致背景色、字体色与侧边栏设计规范不一致的问题。本次仅前端样式调整，执行前端类型检查验证。

### 2026-08-02 系统配置 Tab 拆为子菜单
- 新增：
  - `web/src/views/system/AiModel.vue`（AI 大模型账号独立菜单页）
  - `web/src/views/system/Wechat.vue`（微信 / 小程序独立菜单页）
- 修改：
  - `server/src/menus/menus.service.ts`（系统配置 seed 改为父级菜单，并新增“配置菜单 / AI 大模型账号 / 微信 / 小程序”三个子菜单；seed 支持按 `parentPath` 挂载父子关系）
  - `web/src/router/index.ts`（`/system-config` 改为重定向，新增三个系统配置子路由）
  - `web/src/views/system/Index.vue`（移除 tabs，保留为“配置菜单”独立页面）
  - `CHANGELOG.md`（追加本次结构调整快照）
- 删除：无
- 说明：将系统配置页内 Tab 拆为侧边栏父子菜单结构，便于后续各配置域独立扩展。需重启后端触发菜单 seed 补齐子菜单。

### 2026-08-02 用户编辑支持选择角色
- 新增：无
- 修改：
  - `web/src/views/user/Edit.vue`（用户新增/编辑弹窗加载启用角色列表，新增角色多选字段；编辑时按用户详情 `roles` 回填，提交时带上 `roleIds`）
  - `CHANGELOG.md`（追加本次修复快照）
- 删除：无
- 说明：修复账号新增/编辑无法选择角色的问题。后端已有 `roleIds` 入参与覆盖角色逻辑，本次补齐前端表单入口并执行前端类型检查。

### 2026-08-02 开关字段校验改为有值即可
- 新增：
  - `server/src/common/utils/bool-like.ts`（统一兼容 `true/false`、`1/0`、`'true'/'false'`、`'1'/'0'` 的开关值转换）
- 修改：
  - `server/src/users/dto/user.dto.ts`、`server/src/roles/dto/role.dto.ts`、`server/src/menus/dto/menu.dto.ts`（`isActive`、`isAdmin`、`isSystem` 等开关字段校验调整为传入时非空即可，不再强制限定原始类型必须为 boolean）
  - `web/src/api/user.ts`、`web/src/api/role.ts`、`web/src/api/menu.ts`（前端接口类型放宽为常见开关值表达）
  - `web/src/views/user/Edit.vue`、`web/src/views/role/Edit.vue`（表单侧保持有值校验，并统一回显转换）
  - `CHANGELOG.md`（追加本次规则调整快照）
- 删除：无
- 说明：按开关/状态字段的实际业务语义统一前后端校验口径：只要求有值，不纠结布尔、数字或字符串表现形式；后端转换后仍按实体 tinyint 入库。

### 2026-08-02 用户布尔状态表单统一 0/1
- 新增：无
- 修改：
  - `web/src/views/user/Edit.vue`（用户新增/编辑表单的状态与超级管理员字段改为统一使用 `1/0`，确保下拉能正确回显“启用/禁用”“是/否”）
  - `web/src/api/user.ts`（用户布尔字段类型兼容 `boolean | 0 | 1`）
  - `server/src/users/dto/user.dto.ts`（`isActive` / `isAdmin` 入参兼容 `true/false`、`1/0`、`'1'/'0'` 并转为 boolean，落库仍由 tinyint 存储为 `1/0`）
  - `CHANGELOG.md`（追加本次修复快照）
- 删除：无
- 说明：修复新增用户弹窗中布尔字段因 `true/false` 与下拉选项 `1/0` 类型不一致导致无法正常回显的问题。本次执行前后端静态检查。

### 2026-08-02 角色授权树过滤系统固定菜单
- 新增：无
- 修改：
  - `web/src/views/role/Edit.vue`（角色新增/编辑授权树构建时过滤 `isSystem=true` 的系统固定菜单及其权限，避免系统配置中锁定的菜单继续出现在角色分配权限中）
  - `CHANGELOG.md`（追加本次修复快照）
- 删除：无
- 说明：修复系统配置将“角色管理”等菜单设为系统固定后，角色授权弹窗仍可分配该菜单权限的问题。本次仅前端授权入口修复，执行 `web` 类型检查验证。

### 2026-08-02 补齐通用全栈框架闭环
- 新增：
  - `server/src/data-source.ts`（TypeORM migration CLI 使用的数据源配置，读取 `.env` 并关闭 synchronize）
  - `server/src/migrations/.gitkeep`（保留迁移目录）
- 修改：
  - `AGENTS.md`、`AGENTS-BACKEND.md`、`AGENTS-FRONTEND.md`（参考 demo 从旧 `articles/article` 对齐为当前 `demo`；补充生产管理员密码与迁移命令说明）
  - `server/src/demo/dto/demo.dto.ts`、`server/src/demo/demo.service.ts`、`server/src/demo/demo.controller.ts`、`web/src/api/demo.ts`、`web/src/views/demo/Index.vue`（补齐标准批量删除接口与前端调用，替代前端循环单删）
  - `server/src/users/users.service.ts`、`server/src/permissions/permissions.service.ts`（补齐内置模块 `Module.action` 权限种子；权限列表支持 code/name 搜索）
  - `server/src/menus/menus.service.ts`（删除父菜单时同步软删除后代菜单，避免孤儿菜单提升为根节点）
  - `server/src/app.module.ts`、`server/src/main.ts`、`server/.env.example`（生产环境强制配置 `JWT_SECRET` 与 `ADMIN_PASSWORD`；CORS 与端口统一走配置）
  - `server/package.json`（新增 TypeORM migration 脚本）
  - `web/src/router/index.ts`、`web/src/stores/user.ts`（路由增加页面级权限校验；权限判断兼容纯动作码）
  - `web/src/components/ProButton.vue`（异步点击可通过 `done(promise)` 接入 loading 等待）
- 删除：无
- 说明：面向通用全栈开发框架补齐 demo 契约、RBAC、菜单树、生产配置与迁移基础。本次为框架能力补齐，按规则执行前后端静态检查，不自动启动服务。

### 2026-08-02 新增 AI 自动提交规则
- 新增：无
- 修改：
  - `AGENTS.md`（Agent 工作规则新增“自动提交”：AI 完成代码或文档改动并通过约定验证后，默认仅暂存本次 AI 修改文件并创建 git commit；用户明确要求不提交时跳过）
  - `CHANGELOG.md`（追加本次规则变更快照）
- 删除：无
- 说明：固化后续协作规则，避免自动提交混入工作区已有未提交改动。本次仅文档规则调整，未 build、未启动服务。

### 2026-07-29 移除角色授权未分组权限
- 新增：无
- 修改：
  - `web/src/views/role/Edit.vue`（角色授权树移除“未分组权限”兜底节点；不再读取权限管理列表作为展示数据源；权限中文名称改为组件内置动作映射，授权树只展示菜单 `permissionCode` 拆出的权限叶子）
- 删除：无
- 说明：角色菜单权限配置页只展示菜单下挂载的权限，权限管理列表不再混入角色授权树。已执行 `web` 的 `npm.cmd run type-check` 与 `server` 的 `npx.cmd tsc --noEmit -p tsconfig.json`，均通过；未 build、未启动服务。

### 2026-07-29 角色授权树改用菜单权限码
- 新增：无
- 修改：
  - `server/src/roles/dto/role.dto.ts`（角色保存入参新增 `permissionCodes`，支持提交 `Role.read` 等模块权限码）
  - `server/src/permissions/permissions.service.ts`（新增按权限编码查找或自动创建权限点能力）
  - `server/src/roles/roles.service.ts`（创建/更新角色时优先使用 `permissionCodes` 覆盖角色权限）
  - `server/src/users/users.service.ts`（启动清理规则允许 `Module.action` 权限码，避免自动创建的模块权限被清理）
  - `server/src/auth/auth.service.ts`（避免模块权限码二次拼接）
  - `web/src/api/role.ts`（`RoleForm` 新增 `permissionCodes`）
  - `web/src/views/role/Edit.vue`（角色授权树改为从菜单树 `permissionCode` 拆分权限叶子，纯动作码按菜单模块补成 `Module.action`，显示中文名称并保存模块权限码）
- 删除：无
- 说明：修正角色配置菜单权限的数据来源，授权树不再依赖 `permissions.menuId`，而是按菜单自身配置的权限字符串构建。已执行 `web` 的 `npm.cmd run type-check` 与 `server` 的 `npx.cmd tsc --noEmit -p tsconfig.json`，均通过；未 build、未启动服务。

### 2026-07-29 Auth 权限返回模块动作码
- 新增：无
- 修改：
  - `server/src/auth/auth.module.ts`（Auth 模块引入 `Menu` 仓库，用于根据权限归属菜单推导模块权限码）
  - `server/src/auth/auth.service.ts`（`login` 与 `profile` 返回的 `isAdmin` 归一为 boolean；权限列表保留纯动作码并额外扩展为 `Module.action`，如 `Role.read` / `Role.create` / `Role.update`）
  - `web/src/stores/user.ts`（超管判断改为 boolean 归一，兼容后端 tinyint 返回的 `1`）
  - `web/src/components/ProTable.vue`（内置操作列权限判断兼容 `Module.action` 与纯动作码 `action`）
- 删除：无
- 说明：修复 root 管理员因 `isAdmin=1` 未被前端放行、以及角色绑定菜单权限后操作按钮无法按模块权限显示的问题。已执行 `web` 的 `npm.cmd run type-check` 与 `server` 的 `npx.cmd tsc --noEmit -p tsconfig.json`，均通过；未 build、未启动服务。变更 JWT 权限载荷后需重新登录获取新 token。

### 2026-07-29 角色权限绑定改为菜单树
- 新增：无
- 修改：
  - `web/src/views/menu/Index.vue`（菜单名称列固定为 150px；权限码列按权限名称中文显示，多权限用顿号分隔，空值显示“登录可见”）
  - `web/src/views/role/Edit.vue`（角色新增/编辑弹窗的权限选择由平铺 checkbox 改为菜单权限树，按菜单分组展示权限叶子，支持勾选菜单批量选中其下权限）
- 删除：无
- 说明：菜单和权限关联后，角色授权入口改为更贴近菜单结构的树形勾选交互。已执行 `web` 的 `npm.cmd run type-check` 与 `server` 的 `npx.cmd tsc --noEmit -p tsconfig.json`，均通过；未 build、未启动服务。

### 2026-07-29 菜单分配权限支持多选
- 新增：无
- 修改：
  - `web/src/views/menu/Index.vue`（分配权限弹窗 checkbox 取消单选限制，支持勾选多个权限；单菜单打开时回显已分配权限；保存时用逗号分隔写入 `permissionCode`）
  - `server/src/menus/menus.service.ts`（当前用户菜单过滤支持逗号分隔的多个 `permissionCode`，用户拥有任一权限即可看到菜单）
- 删除：无
- 说明：菜单可见权限从单权限扩展为多权限兼容，不改表结构；已执行 `web` 的 `npm.cmd run type-check` 与 `server` 的 `npx.cmd tsc --noEmit -p tsconfig.json`，均通过；未 build、未启动服务。

### 2026-07-29 分配权限弹窗改为平铺勾选
- 新增：无
- 修改：
  - `web/src/views/menu/Index.vue`（分配权限弹窗由下拉框改为平铺 checkbox 列表，卡片间保留间距；当前菜单 `permissionCode` 为单值字段，因此 checkbox 组限制最多选择 1 项，不勾选保存则清空为登录可见）
- 删除：无
- 说明：优化菜单分配权限交互，权限项更直观可扫；已执行 `web` 的 `npm.cmd run type-check` 通过；未 build、未启动服务。

### 2026-07-29 修复菜单分配权限按钮与局部更新类型
- 新增：无
- 修改：
  - `web/src/api/menu.ts`（`updateMenu` 入参改为 `Partial<MenuForm>`，匹配 PATCH 局部更新语义，修复批量分配 `permissionCode` 类型报错）
  - `web/src/views/menu/Index.vue`（菜单操作按钮权限判断兼容 `Menu.action` 与纯动作码 `action`，确保“分配权限”等按钮在当前权限体系下正常展示）
- 删除：无
- 说明：修复菜单管理页分配权限代码 TS 报错与按钮缺失问题。已执行 `web` 的 `npm.cmd run type-check` 与 `server` 的 `npx.cmd tsc --noEmit -p tsconfig.json`，均通过；未 build、未启动服务。

### 2026-07-29 页面标题移至顶部横条
- 新增：无
- 修改：
  - `web/src/layouts/MainLayout.vue`（顶部横条读取当前路由 `meta.title` 并显示页面标题，位于折叠按钮右侧）
  - `web/src/components/PageContainer.vue`（移除内容卡片内标题区，页面内容顶部释放给新增、分配权限等工具按钮）
- 删除：无
- 说明：页面标题统一由主布局承载，业务页面卡片内不再占用标题行；菜单管理等页面的工具按钮自然上移到内容区顶部。已执行 `web` 的 `npm.cmd run type-check` 通过；未 build、未启动服务。

### 2026-07-29 菜单列表支持勾选分配权限
- 新增：无
- 修改：
  - `web/src/views/menu/Index.vue`（菜单表格新增勾选列；工具栏新增“分配权限”按钮；勾选菜单后可批量维护 `permissionCode`，支持选择现有权限码或清空为登录可见；保存后刷新菜单表格与侧边栏菜单缓存）
- 删除：无
- 说明：菜单管理页增加批量分配菜单可见权限入口，前端只负责选择与提交，后端仍由菜单更新接口统一校验。已执行 `web` 的 `npm.cmd run type-check` 与 `server` 的 `npx.cmd tsc --noEmit -p tsconfig.json`，均通过；未 build、未启动服务。

### 2026-07-29 锁定菜单改为后端管理员校验
- 新增：无
- 修改：
  - `server/src/menus/menus.controller.ts`（菜单创建、更新、删除接口注入当前用户，将 `isAdmin` 传入 service）
  - `server/src/menus/menus.service.ts`（锁定菜单相关创建/移动/更新/删除统一在后端校验管理员身份；非管理员操作锁定菜单返回 403；启动 seed 不再强制恢复核心菜单系统固定状态）
  - `web/src/views/menu/Index.vue`（移除核心菜单加子级/删除按钮隐藏，前端操作入口一律按普通权限展示）
  - `web/src/views/menu/Edit.vue`（移除核心菜单系统固定开关禁用与强制提交，编辑表单前端不再做锁定菜单限制）
  - `web/src/views/system/Index.vue`（配置菜单开关不再禁用核心菜单，移除“核心菜单锁定”提示，说明文案改为后端按管理员身份校验）
- 删除：无
- 说明：锁定菜单的操作限制从前端迁到后端 API，前端按钮和开关全部放开；已执行 `web` 的 `npm.cmd run type-check` 与 `server` 的 `npx.cmd tsc --noEmit -p tsconfig.json`，均通过；未 build、未启动服务。

### 2026-07-29 菜单管理支持编辑名称与路由
- 新增：无
- 修改：
  - `web/src/views/menu/Index.vue`（核心菜单开放编辑入口；核心菜单仍禁止加子级和删除；路由列文案改为“路由地址”；新增/编辑/删除成功后同步刷新侧边栏菜单缓存）
  - `web/src/views/menu/Edit.vue`（编辑弹窗补齐路由地址、权限码、系统固定、启用状态等字段提交；核心菜单锁定系统固定开关；提交前 trim 字符串并拦截空名称）
  - `server/src/menus/menus.service.ts`（启动 seed 只补齐缺失菜单，不再覆盖已存在菜单的可编辑字段，避免菜单名称/路由等后台修改被重启还原）
- 删除：无
- 说明：菜单管理现在可对已有菜单执行编辑，支持维护名称、路由地址、图标、排序、权限码、启用状态等；系统核心菜单保留安全边界。已执行 `web` 的 `npm.cmd run type-check` 与 `server` 的 `npx.cmd tsc --noEmit -p tsconfig.json`，均通过；未 build、未启动服务。

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
- 修改：`web/src/views/permission/Index.vue`（操作权限列 tag 文案由 `op.name`（含模块名，如「批量删除示例」）改为 `getPermissionActionLabel(op.code)`（如「批量删除」））
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
  - `server/src/menus/menus.service.ts`（seed 中示例管理菜单补 `permissionCode: 'Article.read'`）
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

### 2026-06-26 示例模块新增 View 查看页实现
- 新增：无
- 修改：
  - `web/src/views/article/View.vue`（实现示例查看页：只读展示标题/状态/内容/创建时间/更新时间，使用 `ProDialog` 封装）
  - `web/src/views/article/Index.vue`（`handleView` 改为打开 `View.vue`，不再复用编辑弹窗）
- 删除：无
- 说明：完成示例模块 `View.vue` 标准页落地，查看与编辑职责分离，保持现有接口字段不变。

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
- 设计要点：Menu 自关联（parentId）建树；`menus.service.findMine` 按 `permissionCode` 过滤（空码登录可见、超管全放行）；启动 seed 内置菜单（首页/示例/账号/角色/权限，后三者带 `User.read`/`Role.read`/`Permission.read`）。前端 `MenuTree.vue` 递归渲染 `el-sub-menu`/`el-menu-item` 支持多级。
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

### 2026-06-23 ProTable/ProForm 封装 + 示例模块目录化（Index/Edit）
- 新增：
  - `web/src/components/ProForm.vue`（配置 `fields` + `#field-[prop]` 插槽驱动的表单封装，暴露 validate/resetFields）
  - `web/src/components/ProTable.vue`（搜索 ProForm + el-table + 分页集成，内部托管 loading/分页/搜索请求，暴露 refresh/search；泛型组件）
  - `web/src/views/article/Index.vue`（示例列表页，用 ProTable + columns/searchFields 配置 + 具名插槽）
  - `web/src/views/article/Edit.vue`（新增/编辑弹窗，用 ProForm）
- 修改：`web/src/router/index.ts`（路由指向 `article/Index.vue`）、`AGENTS.md`（前端 CRUD 规则新增「菜单模块目录规范」、命名规则、目录导航、示例模块、快照）
- 删除：`web/src/views/ArticleView.vue`（拆分为 `article/Index.vue` + `Edit.vue`）
- 说明：新增前端规则——每个菜单模块独立目录 `views/<module>/`，标准文件名 `Index.vue`/`Edit.vue`/`View.vue`。示例模块作为首个落地范例。封装 ProForm（表单）与 ProTable（列表集成）二次组件。已 `npm.cmd run build` 自测通过（exit 0）；修复了泛型组件 `InstanceType<typeof ProTable>` 取不到类型的 TS2344，改用显式 expose 接口类型。

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

### 2026-06-22 示例管理示例模块（前后端 CRUD demo）
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
