# CHANGELOG

### 2026-10-26 微博增加侧栏 realtime 辅助热搜接口

- 按用户提供的 GET 地址和字段，将 `https://weibo.com/ajax/side/hotSearch` 加入微博平台直读备用链路：先读配置来源，失败或没有可用条目时依次尝试已有 `hot_band`、新增侧栏辅助接口；任一来源返回有效榜单即停止。单个回退链跳过已请求的相同地址，已取消任务不再尝试后续接口。直接将该地址配置为微博公开来源时同样可用，不修改已有来源 URL。
- 新接口仅读取 JSON 的 `data.realtime`，不混入 `hotgov/hotgovs`、顶层同名列表、其它推荐或广告列表；复用既有微博词条的标题、安全链接、排名、热度及可用事件时间映射，缺失保持未知，不将数组序号当名次。空体、非 JSON、明确 `ok/error/error_code` 失败、缺少或空榜单使用固定中文错误，原始响应和敏感错误不进入提示。
- 任务来源记录说明实际采用的“微博侧栏热搜辅助接口”及前序失败原因，所有通道失败时保留各自受控原因，不伪装采集成功。沿用 HTTPS GET、公网地址检查、大小及超时限制，仅保留已知微博接口的公开 Referer；无 Cookie、代理池、IP/浏览器身份伪装或 AI 代取。微博纯 AI/search 来源的模式语义、抖音与网易固定直读、百炼及腾讯联网解析不变。
- 前后端 API、DTO、实体及权限字段不变，无需新增表单项或数据库迁移。新增文件：无。删除文件：无。修改文件：`server/src/hot-topics/hot-topic-fetch.service.ts`、`server/src/hot-topics/hot-topic-fetch.service.spec.ts`、`server/src/hot-topics/hot-topic-parsers.ts`、`server/src/hot-topics/hot-topic-parsers.spec.ts`、`.design-spec.md`、本文件，合计 6 个。原有 `web/auto-imports.d.ts`、`web/components.d.ts`、`web/src/api/hotTopic.ts` 改动保留，不纳入提交。
- 验证：业务源码及本次两个 spec 的 TypeScript no-emit 编译检查、定向 ESLint/Prettier 与 diff 检查通过；补充字段隔离、错误结构、安全链接、去重上限、三级回退、直接配置、跳过重复、空结果和取消等回归断言。按既有采集整改约定仅做静态检查，未执行测试、build、启动/重启服务、数据库写入或付费模型调用。本轮公开读取未取得可用线上 JSON，不将代码接入表述为线上采集已经成功。

### 2026-10-26 抖音热搜改为唯一固定接口读取

- 按用户确认的接口与返回契约，将抖音热搜唯一地址固定为 `https://www.douyin.com/aweme/v1/web/hot/search/list/`。与网易共用固定来源判定，三种获取模式均直接读取，不加入模型联网搜索，不回退旧网页或其它接口；未选来源的 AI 模式继续使用默认抖音来源，但不再要求联网 AI 配置。抖音与微博同时选择时，仅微博进入原有 AI 搜索约束。
- 抖音仅解析 JSON 的 `data.word_list`；从真实字段读取 `word`、`position/rank`、`hot_value` 和可用 `event_time`，不混入顶层榜单、推荐词、作品或网页脚本。合法正数字字符串或安全整数 `sentence_id` 生成抖音词条链接，无有效编号时使用热榜页面而非 JSON 地址；缺失排名、热度和时间保持未知。空体、非 JSON/校验页、非零失败状态、无榜单或无有效条目均使用受控中文报错，不透出原始响应或虚构成功。
- 来源创建/编辑强制固定地址及 `accessMode=page`；旧记录在安全回显与执行时归一化，不批量写数据库、不改启停状态。前端新增、切类型、回显和提交保持同一契约，抖音与网易地址只读、隐藏获取方式，列表/详情/选项显示“固定接口”。偏好提示、手动执行及每日计划校验同步：仅固定来源无需模型联网协议，可另用普通 AI 做推荐。
- 微博保留现有网页、聚合页、官方回退和 AI 联网行为，本轮不加入尚未确认的 TopHub 契约；网易固定接口及国内分类解析、百炼与腾讯模型联网解析不变。复用原 DTO、权限和数据库字段，不新增迁移、草稿或配置开关，不在打开/保存页面时发起采集。
- 新增文件：`web/src/api/hotTopicSources.ts`。
- 修改文件（后端）：`server/src/hot-topics/hot-topic.types.ts`、`server/src/hot-topics/hot-topic-sources.service.ts`、`server/src/hot-topics/hot-topic-sources.service.spec.ts`、`server/src/hot-topics/hot-topic-fetch.service.ts`、`server/src/hot-topics/hot-topic-fetch.service.spec.ts`、`server/src/hot-topics/hot-topic-parsers.ts`、`server/src/hot-topics/hot-topic-parsers.spec.ts`、`server/src/hot-topics/hot-topics.service.ts`、`server/src/hot-topics/hot-topics.service.spec.ts`。
- 修改文件（前端与文档）：`web/src/views/hot-topic-source/Edit.vue`、`web/src/views/hot-topic-source/Index.vue`、`web/src/views/hot-topic-source/View.vue`、`web/src/views/hot-topic/Preferences.vue`、`web/src/views/hot-topic/preferenceValidation.ts`、`web/src/views/hot-topic/hotTopic.test.mjs`、`.design-spec.md`、本文件。合计新增 1 个、修改 17 个文件，删除文件无。原有 `web/auto-imports.d.ts`、`web/components.d.ts`、`web/src/api/hotTopic.ts` 未提交改动保留，不纳入本次提交。
- 验证：后端热点全套及两家联网相关 10 套件 138 项、前端热点与响应诊断 23 项模拟测试通过（合计 161 项）；后端业务源码类型、前端 Vue 类型、定向 ESLint/Prettier、实体列、组件复用与 diff 检查通过。全量含测试文件的 TypeScript 检查仍有其它模块 8 处既有类型错误，未扩展本次范围修复。前端测试因默认子进程受限，采用 `--test-isolation=none` 同进程执行通过。本轮为既有采集配置整改，未 build、未启动或重启服务、未修改运行中数据库、未调用付费模型。
- 通过现有安全采集器真实 GET 固定抖音地址一次，当前环境返回 HTTP 200 但响应体为 0 字节，未取得实时榜单；未追加 Cookie、签名、代理或验证绕过。接口固定及解析回归已完成，不将模拟通过或 HTTP 200 声称为当前环境真实采集成功。

### 2026-10-26 热点执行记录增加联网响应查看

- 热点获取与推荐记录为保存了诊断的 AI 联网来源增加“查看联网响应”。独立弹窗按需读取已保存的脱敏接口返回，展示平台、模型、账号编号、实际路径、HTTP 状态、耗时、来源解析状态、来源数及受控原因；响应仅以安全纯文本展示。一个请求同时检索多个来源时显示同一份响应，解析来源总数与任务中单来源实际收录数分别说明。关闭、切任务/来源及卸载后忽略迟到响应，不轮询诊断，不重新调用模型；历史任务缺少正文时明确无法补回。
- `KnowledgeWebSearchService.search` 增加可选旁路回调，保留原有一次请求及解析语义。成功、HTTP 错误、200 无来源、非 JSON、空体、超限和读取失败可记录实际获得的信息；未取得正文时保持空串，不伪造返回。回调异常不改变业务成功/失败，缺少真实来源仍无法核验联网。响应递归处理凭据字段、认证头、实际密钥、请求回显及 URL 敏感部分，二进制大字段省略，并按 UTF-8 长度、深度和集合大小截断；本轮未调整厂商联网默认规则。
- 复用任务 sources 的现有 simple-json/TEXT 列，不新增数据库列或迁移。相同请求的诊断只存一份，其余来源通过内部下标引用，诊断总预算按 JSON 实际存储字节限制为 24 KiB，保留来源状态及转义余量；截断明确标记。常规列表、详情及轮询通过字段白名单移除诊断正文与内部引用，仅返回可选的 `hasSearchResponse` 标记。
- 新增只读 `GET /hot-topics/runs/:id/search-response/:sourceIndex`，沿用 `HotTopic.read`，按任务编号及当前 userId 查询，不能读取其它用户记录。前端诊断类型和 API 放独立文件，避免覆盖用户已有 `hotTopic.ts` 修改；查看只读保存记录，不接受客户端地址或认证信息，不重投模型请求。运行中的任务按现有结果保存点提供入口，旧任务不自动重跑。
- 新增文件（后端）：`server/src/knowledge-ai-providers/knowledge-web-search-diagnostics.ts`、`server/src/knowledge-ai-providers/knowledge-web-search-diagnostics.spec.ts`、`server/src/hot-topics/hot-topic-search-response.ts`、`server/src/hot-topics/hot-topic-search-response.spec.ts`。
- 新增文件（前端）：`web/src/api/hotTopicDiagnostics.ts`、`web/src/views/hot-topic/SearchResponse.vue`、`web/src/views/hot-topic/searchResponse.test.mjs`。
- 修改文件（后端）：`server/src/knowledge-ai-providers/knowledge-web-search.service.ts`、`server/src/hot-topics/hot-topic.types.ts`、`server/src/hot-topics/hot-topic-fetch.service.ts`、`server/src/hot-topics/hot-topic-fetch.service.spec.ts`、`server/src/hot-topics/hot-topics.controller.ts`、`server/src/hot-topics/hot-topics.service.ts`、`server/src/hot-topics/hot-topics.service.spec.ts`、`server/src/hot-topics/hot-topic-controllers.spec.ts`。修改文件（前端及文档）：`web/src/views/hot-topic/Runs.vue`、`.design-spec.md`、本文件。合计新增 7 个、修改 11 个文件，删除文件无。
- 验证：后端相关 7 套件 82 项及前端新 6 项、原热点 15 项模拟测试通过（合计 103 项），覆盖成功/失败诊断、凭据隐藏、截断、共享响应存储字节界限、本人记录隔离、普通查询不传正文、旧记录缺失和关闭/切换后的迟到响应。双端类型、定向 ESLint、格式、组件复用、实体列和 diff 检查通过。后端 build 通过；前端常规 build 在自动写入 `components.d.ts` 时遇 Windows UNKNOWN 文件访问错误，随后使用相同生产插件和别名配置、仅临时关闭声明输出的 Vite 构建通过，未改项目构建配置，保留既有 PURE 注释及大分块提示。未启动或重启服务、未修改运行中数据库、未发起真实模型请求。
- 用户原有 `web/auto-imports.d.ts`、`web/src/api/hotTopic.ts` 改动保持，不纳入提交；构建生成的 `web/components.d.ts` 声明变化同样不手改、不纳入本次提交。

### 2026-10-25 记录联网搜索能力优化方案供次日整改

- 新增 `MD/联网搜索能力优化方案.md`，计划于 2026-10-26 整改。明确腾讯混元、阿里百炼千问中已确认支持搜索的型号由后端能力清单和适配器提供默认规则；平台托管的 DeepSeek、GLM、Kimi 等第三方型号通过专用联网卡片接入，未命中默认范围且缺卡时不发送付费请求。区分账号平台与模型归属，不把默认协议或 HTTP 200 当作联网支持证明。
- 方案记录当前基线 `6c43a11` 与目标差异，列出系统规则收紧、第三方预设恢复、专用配置优先、旧配置兼容、页面提示、共用解析及真实来源验收步骤；保留账号模型、联网关闭状态、人工停用/软删除及普通调用行为，不新增表单开关、草稿或备注字段。两轮既有腾讯真实请求仍记录为未确认联网成功。
- 本次仅完成文档，现有前后端实现和 `.design-spec.md` 的现状描述不改动；实施时再同步规范。新增文件：`MD/联网搜索能力优化方案.md`。修改文件：本文件。删除文件：无。用户已有 `web/auto-imports.d.ts`、`web/src/api/hotTopic.ts` 改动保持且不纳入提交。
- 验证：核对文档中的当前规则、代码路径、字段与官方资料，检查 Markdown 结构、项目内引用和 diff；未运行模型请求、未 build、未启动或重启服务、未修改数据库。

### 2026-10-25 将百炼与腾讯联网搜索格式内置为系统规则

- 按用户要求取消联网搜索必须逐模型新建专用卡片的前置条件。在原六张系统规则外增加三张只读联网卡片：百炼 Responses（`-7`）、腾讯默认 Responses（`-8`）、腾讯 DeepSeek Chat（`-9`）。腾讯四个精确编码 `deepseek-v4-flash`、`deepseek-v4-pro`、`deepseek-v4-flash-0731`、`deepseek-v4-pro-0813` 使用 Chat 搜索，其他账号文本目录中的完整型号按默认 Responses 格式尝试；不替换原厂别名、版本或请求 model，不将默认格式匹配当作厂商能力或账号开通的证明。
- 两家均按“模型专用覆盖优先 → 系统通用”解析联网目标，配置检查、保存、功能真实测试、卡片调试及热点业务共用规则。已停用的专用卡片直接阻止，软删除后恢复默认；已有人工编辑和历史卡片不改写、不删除。新补官方预设排除五张与系统格式相同的联网卡片，专用预设由 186 项变为 181 项，不生成可编辑影子配置。三张系统卡仅列出实际归属该规则的账号文本模型，腾讯两种协议不能从错误卡片跨越提交。
- 百炼独立解析 `webSearch`，不再从普通 Chat 卡片路径派生搜索地址，保留官方同源 HTTPS/标准端口及 `/compatible-mode/v1/responses` 校验，Coding Plan 地址不能用于此搜索入口，普通 Coding Chat 保持原行为。腾讯默认使用 `tools: web_search`，四个 DeepSeek 精确型号使用 `web_search_options`；轻量搜索和 `low` 推理强度固定于请求构造，避免实际接口拒绝 `no_think`。百炼参数保持独立。卡片模板与功能测试、正式搜索共用请求构造。
- 配置页腾讯选项改为“系统自动匹配”，去掉“无精确卡片不能搜”的提示；保留百炼选项和跨平台检查，不自动开启旧配置的联网方式。系统卡片页面明确默认格式不代表联网能力。真实搜索继续核验供应商工具调用和结构化来源，普通 HTTP 200、正文中的链接或用量计数不能冒充成功；无来源消息提示核对模型能力与账号联网服务，不自动更换协议、模型或重投付费请求。
- 使用用户明确授权的腾讯凭据进行了六次短请求（凭据不回显、不写文件、不入库）：第一轮 Hy3 Responses 和 GLM-5.3 Responses 返回 200，但无搜索调用/来源；DeepSeek V4 Flash Chat 的 `no_think` 返回 400 参数拒绝。第二轮均改为 `low`，三型号均返回 200，依然无可核验来源。因此本次只确认请求可返回和参数修复，不能声明该账号或这些型号已成功联网。未测试百炼真实账号，不将腾讯结果外推为百炼实测结果，未再追加付费探测。
- 新增文件：无。删除文件：无。修改文件（后端）：`server/src/model-endpoints/model-endpoint.builtins.ts`、`server/src/model-endpoints/model-endpoints.service.ts`、`server/src/model-endpoints/model-endpoint.builtins.spec.ts`、`server/src/knowledge-ai-providers/knowledge-ai-providers.service.ts`、`server/src/knowledge-ai-providers/knowledge-web-search-target.spec.ts`、`server/src/knowledge-ai-providers/knowledge-web-search.utils.ts`、`server/src/knowledge-ai-providers/knowledge-web-search.tokenhub.spec.ts`、`server/src/knowledge-ai-providers/model-endpoint-test.utils.ts`、`server/src/knowledge-ai-providers/model-endpoint-tests.service.spec.ts`。
- 修改文件（前端及文档）：`web/src/views/ai-feature-config/Edit.vue`、`web/src/views/ai-feature-config/topicProvider.test.mjs`、`web/src/views/model-endpoint/Index.vue`、`.design-spec.md`、本文件。共修改 14 个文件；用户已有 `web/auto-imports.d.ts`、`web/src/api/hotTopic.ts` 改动保留、不纳入提交。无新增字段、数据库迁移或表单开关。
- 验证：后端相关 9 套件 173 项、前端平台联动 9 项及热点偏好 15 项模拟测试通过（合计 197 项），覆盖默认路由、精确型号、未知型号原样传递、专用覆盖/停用/软删、两张腾讯卡候选隔离、百炼同址与 Coding 拒绝、双平台参数、真实/缺失来源及热点校验。前后端类型、定向 ESLint、沿用文件风格的格式检查、组件复用检查和 diff 检查通过。本次为现有接入规则简化及兼容修复，未 build、未启动或重启服务、未修改运行中数据库。
- 官方依据：[腾讯联网搜索矩阵与请求参数](https://cloud.tencent.com/document/product/1823/132358)、[腾讯 Responses 兼容模式可能丢弃内置搜索工具的说明](https://cloud.tencent.com/document/product/1823/135873)、[百炼 Responses 联网工具与来源字段](https://help.aliyun.com/zh/model-studio/web-search)。用户提供的只有 `input` 的普通 Responses 示例没有启用搜索工具，不能单凭回复成功验证联网。

### 2026-10-25 补通腾讯原生联网配置、测试与热点搜索

- AI 功能配置的 `webSearchMode` 前后端增加 `tokenhubSearch`，腾讯账号可明确选择“腾讯 TokenHub 原生搜索”，不再因平台不是百炼而只提供不联网。保留旧配置值和关闭状态，不自动开启联网或改写用户模式；主动切平台只清除不兼容协议，历史回显保留说明。热点偏好、日程校验及执行均识别对应平台的已接入搜索方式，保留平台直读、混合模式和网易固定接口例外。
- 新增共用 `resolveWebSearchTarget`，配置检查、保存启用配置、功能真实测试及热点获取按账号平台、完整模型编码和联网卡片解析；腾讯只使用同源官方 HTTPS/标准端口、有效密钥、普通文本目录中已登记模型及启用的精确联网卡片。协议必须为同步 Responses 或 ChatSearch，路径来自卡片；缺卡、停用、跨平台或不兼容时在请求前明确阻止，不使用普通 Chat 规则推断联网。关闭失效配置不因新增联网校验被拦。百炼维持原官方 Responses 地址规则，无新数据库列或迁移。
- 腾讯沿用已有五个官方联网预设：`hy3` 走 Responses；`deepseek-v4-flash-0731`、`deepseek-v4-pro-0813`、`deepseek-v4-pro`、`deepseek-v4-flash` 走 Chat 搜索。完整编码精确匹配；不将原厂直供 `deepseek-v4-flash-202605` / `deepseek-v4-pro-202606`、带前缀版本或 GLM 自动转换为联网别名，不替换请求 model。相关型号在普通模型列表中存在，不等于腾讯联网矩阵已声明其能力。
- 请求构造与来源解析抽到纯工具：腾讯 Chat 使用 `web_search_options`，只收录 `message.search_results` 的 URL/name/snippet；腾讯 Responses 使用 `tools`，须完成的搜索调用加 `output_text.annotations` 中真实引用，兼容官方示例缺少顶层 status。两者显式使用轻量搜索和相应思考参数，不串用百炼 `enable_thinking`。腾讯日期统一未知、Responses 缺原文摘要保持空，不把正文链接、用量、模型生成摘要日期或百炼字段冒充腾讯检索证据；缺失来源不能判成功。百炼来源解析保留原行为。
- 模型功能测试与热点业务共用相同目标、请求构造和来源核验；测试联网场景跳过旧的宽松协议判断，不发送用户业务提示词，不修改幂等、并发与来源隔离。搜索业务保留取消/有界响应/禁止重定向与自动重投，计费错误使用已有中文原因，无密钥或供应商原始错误透出。
- 新增文件：`server/src/knowledge-ai-providers/knowledge-web-search.utils.ts`、`server/src/knowledge-ai-providers/knowledge-web-search.tokenhub.spec.ts`、`server/src/knowledge-ai-providers/knowledge-web-search-target.spec.ts`。
- 修改文件（后端）：`server/src/ai-feature-configs/ai-feature-config.constants.ts`、`server/src/ai-feature-configs/ai-feature-configs.service.ts`、`server/src/ai-feature-configs/ai-feature-configs.service.spec.ts`、`server/src/hot-topics/hot-topics.service.ts`、`server/src/hot-topics/hot-topics.service.spec.ts`、`server/src/knowledge-ai-providers/knowledge-ai-providers.service.ts`、`server/src/knowledge-ai-providers/model-endpoint-tests.service.ts`、`server/src/knowledge-ai-providers/feature-model-tests.service.spec.ts`、`server/src/knowledge-ai-providers/knowledge-web-search.service.ts`、`server/src/knowledge-ai-providers/knowledge-web-search.service.spec.ts`。
- 修改文件（前端及文档）：`web/src/api/aiFeatureConfig.ts`、`web/src/views/ai-feature-config/Edit.vue`、`web/src/views/ai-feature-config/topicProvider.test.mjs`、`web/src/views/hot-topic/Preferences.vue`、`web/src/views/hot-topic/preferenceValidation.ts`、`web/src/views/hot-topic/hotTopic.test.mjs`、`.design-spec.md`、本文件。删除文件：无。用户已有 `web/auto-imports.d.ts`、`web/src/api/hotTopic.ts` 改动保留且不纳入提交。
- 验证：后端相关 7 套件 117 项模拟测试、前端平台联动 9 项和热点偏好 15 项模拟测试通过，覆盖两种腾讯协议、来源真实/缺失/未完成、跨平台/无卡/停用/未核实型号、保存/关闭、取消、用量、费用错误和混合模式。前后端类型、定向 ESLint/格式、组件复用、实体列检查、生产构建及 diff 检查通过；前端保留既有 PURE 注释及大分块提示。未启动/重启服务、未改运行中数据库、未发起真实搜索或付费调用。更新后需在原 AI 配置中明确选择腾讯原生搜索并保存，再由热点偏好选择该配置；原不联网配置保持不变。
- 官方依据：[腾讯联网搜索支持矩阵、请求与来源字段](https://cloud.tencent.com/document/product/1823/132358)、[腾讯模型列表及原厂直供编码](https://cloud.tencent.com/document/product/1823/130051)。不将普通模型列表中的编码映射当作原生联网能力的额外声明。

### 2026-10-25 修复热点混合模式被联网协议校验整体拦截

- 原获取前校验把所有非平台模式都要求为百炼 Responses，混合模式即使已选择可直接采集的平台来源，也会在任务入队或实际采集前失败。现在仅在纯 AI 搜索涉及非网易/默认来源、或混合模式完全没有可直读来源时要求受支持的搜索协议；含公开页面或网易国内新闻的混合模式可继续采集与普通 AI 推荐，后台原有搜索异常处理保留平台结果并说明搜索不可用原因。
- 保留搜索器对 Chat/关闭联网的提前拒绝及供应商真实来源核验，不将模型回答当作热点来源，不新增搜索适配器、自动付费请求或配置迁移。只读来源、任务幂等、权限、租约及结果落库流程沿用既有实现；网易在全部模式下维持固定接口读取，兼容历史来源获取方式标记。
- 偏好页显示模式与搜索协议是否匹配，明确两条操作路径：“平台来源”可直接采集并使用普通模型推荐；AI 联网搜索需选择已启用 Responses 的配置。计划开启校验与后端同口径，并拒绝将旧 Chat 联网标志视为可用搜索；用户仍可先保存不完整偏好或关闭计划，不自动改变已保存的模式和 AI 配置。旧 Chat 配置明确可用于分析已采集资料。
- 新增文件：无。修改文件：`server/src/hot-topics/hot-topics.service.ts`、`server/src/hot-topics/hot-topics.service.spec.ts`、`web/src/views/hot-topic/Preferences.vue`、`web/src/views/hot-topic/preferenceValidation.ts`、`web/src/views/hot-topic/hotTopic.test.mjs`、`.design-spec.md`、本文件。删除文件：无。前后端沿用原字段与接口；用户已有 `web/auto-imports.d.ts`、`web/src/api/hotTopic.ts` 修改保留且不纳入提交。
- 验证：前后端业务类型、后端定向 ESLint、代码格式、前端测试文件语法（仅 Node --check）、组件复用扫描和 diff 检查通过；静态核对平台/AI/混合模式、网易例外、搜索-only 来源、计划关闭与真实来源约束。相关回归断言已同步但按修复约定未执行测试、构建、启动/重启服务、网络采集或真实付费调用。

### 2026-10-25 修复专用接口卡片测试账号为空

- 修复模型专用卡片测试先按账号业务能力目录登记过滤账号的问题：同平台账号尚未登记该卡片模型时，原候选被隐藏，唯一账号也无法回填。专用卡片现在按平台、启用状态及归一化后的有效密钥返回账号，提交同样核验，不要求预先登记该模型；是否开通由明确发起的真实请求核实。系统通用卡片仍从对应能力目录选具体模型，Agent、功能配置、封面与素材等业务目录校验保持原有规则。
- 继续固定保存卡片的模型、协议、路径和实际匹配规则 ID，客户端不能切换专用测试模型、地址或凭据；不会因调试成功自动登记业务模型。现有 `accountCatalogRequired` 与前端含义对齐，仅系统通用卡片为真，无新增接口字段或配置项。
- 弹窗保留唯一有效账号自动回填及有效历史选择，多账号可手动选择；空候选时明确显示当前平台的账号启用、密钥或通用目录检查提示。下线历史优先保持账号为空，避免放宽候选后又自动回填已退役选择；实时清理及历史查询只调整选择，不重新删除目录或自动调用供应商。
- 新增文件：无。修改文件：`server/src/knowledge-ai-providers/knowledge-ai-providers.service.ts`、`server/src/knowledge-ai-providers/model-endpoint-tests.service.ts`、`server/src/model-endpoints/model-endpoint-routing.spec.ts`、`web/src/views/model-endpoint/Test.vue`、`.design-spec.md`、本文件。删除文件：无。用户已有 `web/auto-imports.d.ts`、`web/src/api/hotTopic.ts` 改动保留且不纳入提交。
- 验证：前后端业务类型检查、后端修改文件定向 ESLint、修改代码格式、组件复用扫描及 diff 检查通过。更新既有回归断言，静态核对未登记模型可调试、业务目录仍拒绝、跨平台/停用/空密钥排除、模型固定和退役历史回填。按修复类约定未执行测试、构建、启动/重启服务或真实付费调用。

### 2026-10-25 官方模型明确下线后自动移除账号候选

- AI 功能配置与厂商卡片的新提交真实测试，收到官方 HTTPS 平台明确已完成退役的模型错误时，从当前账号六类目录精确移除本次模型编码。仅检查错误字段中的中英文退役语义并绑定当前模型，不根据 HTTP 404/410、ModelNotFound、权限、不支持、欠费或额度推断；正常回答、请求回显、预下线、维护/临时停用、否定语义、其它模型及 TokenHub 410001 会话供应商下线均不触发清理。查询原任务不执行新删除，仍保留任务编号待核实。
- 清理使用事务行锁读取当前账号并核对实际请求域名与密钥，只更新包含精确编码的目录字段；按每行 `#` 前编码匹配，保留同系列其它版本、其它账号及全局接口卡片，不停用关联配置。测试返回前后端对齐的可选 `modelRemoved`，只有清理成功才为真；清理失败保留明确下线原因并提示账号目录未更新。账号普通编辑也改为只更新显式提交字段，交错更新名称不会把刚移除的模型写回；明确手工重新登记仍允许。
- 功能配置实时回包同步对应账号候选，只清空仍指向退役模型的选择并提示重选；厂商卡片测试同步当前账号/模型候选。两入口保留关闭/重开、请求序号及选择快照隔离，清理不自动改选账号、模型或发起其它测试。历史恢复及手动查询读取当前服务端目录，不按旧记录重新删除人工加回的模型；读取失败保留已确认结果，不重投供应商任务。
- 删除最后一个模型后保持空目录：修正后端解析、正式调用、账号更新及前端已有账号回显/测试中的默认模型回填；空目录明确阻止调用，账号测试只合并普通调用与文本目录，不借用媒体目录。新建账号的初始默认值保留。无新增实体列、数据库迁移、配置开关或生命周期状态，旧账号 `validateModel` 入口的既有行为不在本次扩展范围内。
- 新增文件：`server/src/common/ai/model-retirement.ts`、`server/src/common/ai/model-retirement.spec.ts`、`server/src/knowledge-ai-providers/retired-model-removal.spec.ts`、`web/src/utils/retiredModelOptions.ts`、`web/src/utils/retiredModelOptions.test.mjs`。
- 修改文件：`server/src/knowledge-ai-providers/knowledge-ai-providers.service.ts`、`server/src/knowledge-ai-providers/model-endpoint-tests.service.ts`、`web/src/api/modelEndpoint.ts`、`web/src/api/thirdPartyConfig.ts`、`web/src/views/ai-feature-config/Edit.vue`、`web/src/views/knowledge-ai-provider/Edit.vue`、`web/src/views/knowledge-ai-provider/Index.vue`、`web/src/views/model-endpoint/Test.vue`、`.design-spec.md`、本文件。删除文件：无。用户已有 `web/auto-imports.d.ts`、`web/src/api/hotTopic.ts` 改动保留且不纳入提交。
- 验证：相关后端 6 套件 125 项模拟测试与前端 4 项目录处理测试通过，覆盖明确/不确定退役、官方来源、精确编码、账号隔离、清理失败、幂等、任务查询、空目录与并发编辑不复活。前后端业务类型、定向 ESLint/格式、组件复用扫描、实体列检查、生产构建及 diff 检查通过；前端保留既有 PURE 注释与分块大小提示。未启动/重启服务、未修改运行中的数据库或调用真实付费模型。
- 官方边界依据：[TokenHub API 错误码](https://intl.cloud.tencent.com/zh/document/product/1300/82348)、[TokenHub 模型状态](https://cloud.tencent.com/document/api/1823/132279)、[百炼错误码](https://help.aliyun.com/zh/model-studio/error-code)。依据明确区分模型退役、会话失效、维护、停新购和模型不存在，不虚构统一退役错误码。

### 2026-10-25 修复热点功能切换非百炼账号沿用联网协议

- 修复热点发现与推荐切换到腾讯等非百炼账号后，仍携带旧的百炼 Responses 协议触发错误的配置联动。第三方安全选项新增后端根据账号地址派生的 `platformType`，前端按平台提供联网候选；仅百炼显示可用的 Responses 选项，切到其它平台时切换为不联网分析推荐，切回百炼不自动开启联网。
- 编辑回填保持历史值，不静默保存或发起真实测试；历史不兼容协议显示不可用说明，必须主动重选。切换时清除旧接口匹配结果，沿用原有测试队列、最终选择防抖和迟到结果隔离。普通文本推荐仍支持其它平台；本次不新增其它平台的原生联网适配器，也不放宽后端官方端点校验。
- 选项只返回原有安全字段及平台标识，不暴露账号地址、密钥或完整配置。复用 Form/Select 的动态候选及提示，不新增开关、数据库列或权限。
- 新增文件：`web/src/views/ai-feature-config/topicProvider.test.mjs`。修改文件：`server/src/third-party-config/third-party-config.service.ts`、`server/src/third-party-config/third-party-config.service.spec.ts`、`server/src/ai-feature-configs/ai-feature-configs.service.spec.ts`、`web/src/api/thirdPartyConfig.ts`、`web/src/views/ai-feature-config/Edit.vue`、`.design-spec.md`、本文件。删除文件：无。原有 `web/auto-imports.d.ts` 与 `web/src/api/hotTopic.ts` 未提交内容保留，不纳入本次提交。
- 验证：前后端业务类型检查、后端定向 ESLint、前端组件复用扫描及 diff 检查通过；补充平台选项/凭据隔离、腾讯关闭联网、切换/回填及不兼容协议的回归用例，测试文件做静态语法检查。按修复类约定未执行测试、构建、启动/重启服务或真实计费请求。

### 2026-10-25 免费额度不可用且未开通付费的错误提示

- 将用户确认的完整供应商报错 `No free trial quota is available for the service and postpaid billing is not enabled` 映射为“该服务暂无免费额度，且未开启按量付费，请开通后重试。”，功能配置与厂商卡片真实测试不再只提示通用 HTTP 402。公共解析返回对应中文原因，保持原欠费映射；识别已归一化中文，避免 Agent、媒体和内容创建的上层错误处理覆盖具体原因。
- 保留完整报错匹配、大小写/空白容错、深度/长度/循环保护及错误字段白名单，不根据通用 HTTP 402、quota 或 postpaid 片段推断。查询原任务的提示改为处理账号计费问题后继续查询，保留待核实状态和原任务编号，不重新生成。前端沿用既有 message 字段，无 API、DTO、数据库或配置字段变更。
- 新增文件：无。修改文件：`server/src/common/ai/model-provider-error.ts`、`server/src/knowledge-ai-providers/model-endpoint-tests.service.ts`、`.design-spec.md`、本文件。删除文件：无。用户已有 `web/auto-imports.d.ts`、`web/src/api/hotTopic.ts` 改动保留且不纳入提交。
- 验证：后端业务类型检查、定向 ESLint、修改代码格式检查与 diff 检查通过；静态核对测试结果到前端消息提示、二次错误归一化及查询原任务文案。按修复类约定未执行测试、构建、启动/重启服务或真实付费调用。

### 2026-10-25 切换模型直接测试，移除额外开关

- AI 功能配置移除“真实测试”配置行、自动测试开关及仅检查配置的切换分支。用户切换有效账号、模型、功能场景、OCR 引擎或联网协议时，直接按厂商接口规则匹配并发起真实测试，结果继续通过 ElMessage 与字段说明反馈；欠费提示保持原有中文信息。
- 最近测试记录读取失败时保留错误与重新读取入口，不再静默暂停后续切换测试；重新测试按钮移到最近测试记录区域，不增加配置项。保留费用提示、400ms 防抖、串行提交、最新选择及迟到结果隔离，已有未完成任务查询原结果，网络不确定不自动重投。打开、回显和保存不发起供应商请求，后端 API、DTO 及保存字段不变。
- 新增文件：无。修改文件：`web/src/views/ai-feature-config/Edit.vue`、`.design-spec.md`、本文件。删除文件：无。遵循 `AGENTS.md` 的前后端契约、静态验证、快照及自动提交规则，沿用 `AGENTS-FRONTEND.md` 与 `AGENTS-COMPONENTS.md` 的 Form/Dialog/Button 封装及 `.design-spec.md` 的测试反馈规范。用户已有 `web/auto-imports.d.ts`、`web/src/api/hotTopic.ts` 改动保留且不纳入提交。
- 验证：前端业务类型检查、修改代码格式检查、组件复用扫描及 diff 检查通过；静态核对无自动测试开关或停用分支，初始化/保存仅检查配置，切换统一进入真实测试队列。按修复类约定未执行测试、构建、启动/重启服务或真实付费调用。

### 2026-10-25 AI 功能配置切换模型支持真实测试

- 编辑页新增默认开启、仅当前窗口生效的真实测试开关和手动测试入口，明确可能计费，图片/视频会生成系统测试内容。初始化/回显完成并恢复最近记录后，用户切换有效账号、模型或功能场景，最终选择经 400ms 防抖和只读配置匹配后才提交真实测试；打开、初始化、回显、保存均不请求供应商。关闭自动测试时保留原配置检查，开启时配置匹配阶段静默，仅突出实际测试结果。失败/欠费/待核实通过 ElMessage 返回，不删除模型或停用关联配置，不阻止保存接口匹配合法的配置。
- 新增配置页 POST `/ai-feature-configs/test-model`、GET `/ai-feature-configs/model-tests`、GET `/ai-feature-configs/model-tests/:requestId`，沿用 `Menu.read` 并置于 `:id` 路由之前。输入复用功能检查字段并增加 UUID；不接收供应商地址、密钥、业务提示词或自定义测试体。目标继续按共用模型专用/系统通用规则解析；文本类测试连通性，MinerU 只测整理文本模型，OCR 使用随机色块 PNG 并核验真实结果，图片/视频按当前功能模板生成测试，联网使用支持的 Responses+web_search 并核验检索证据。测试不等于完整业务流程验收，不保存生成素材。
- 扩展并复用厂商卡片测试 runner，记录按用户和 `card/feature` 来源隔离，卡片查询/恢复与功能页查询/最近记录不能交叉读取，共享已有并发、频率和容量限制。功能测试幂等指纹绑定稳定 DTO，随机 OCR 图只在首次请求生成，重复编号不会再次请求。请求错误、欠费、未知状态、异步已受理和成功保持区分；后续仅查询原供应商任务，路径变化后不使用新配置查询旧任务，不自动重新生成。
- 前端抽出调度与历史合并工具：每次只保留最新待测选择，等待在途提交结束后再处理；已提交 A→B→A 复用原 A，尚未发出 POST 的失效预检会重新排队，旧结果只更新历史、不串当前模型提示。关闭/保存取消未发送任务，网络不确定不自动重投，同选择已有运行/受理记录时只查询；显式重新测试保留费用提示。初始化等待历史恢复，恢复失败先暂停自动测试；最近十条记录可展开核实与查询，服务端仍最多保留 30 分钟、重启清空。
- 结果沿用已有 `ModelEndpointTestResult`，增加可选 `providerId/functionLabel/ruleName/source/featureType/useMineru/webSearchMode`，两端字段对齐；服务器权威结果优先于本地网络未知占位，迟到响应不会把成功状态回退，提示、历史和轮询使用相同最终结果。无新增数据库表、实体字段、迁移或永久可用状态。
- 新增文件：`server/src/knowledge-ai-providers/feature-model-tests.service.spec.ts`、`web/src/utils/featureModelTest.ts`、`web/src/utils/featureModelTest.test.mjs`。
- 修改文件：`server/src/ai-feature-configs/dto/ai-feature-config.dto.ts`、`server/src/ai-feature-configs/ai-feature-configs.controller.ts`、`server/src/knowledge-ai-providers/knowledge-ai-providers.module.ts`、`server/src/knowledge-ai-providers/knowledge-ai-providers.service.ts`、`server/src/knowledge-ai-providers/model-endpoint-tests.service.ts`、`web/src/api/aiFeatureConfig.ts`、`web/src/views/ai-feature-config/Edit.vue`、`.design-spec.md`、本文件。删除文件：无。用户已有 `web/auto-imports.d.ts`、`web/src/api/hotTopic.ts` 改动保留且不纳入提交。
- 验证：相关后端 19 套件 317 项模拟测试与前端调度/历史 9 项测试通过，覆盖来源/用户隔离、真实模型参数与固定样例、OCR 幂等/结果核验、欠费、异步原任务查询、搜索证据、限频并发、快速切换、关闭/保存取消、网络未知不重投和历史恢复竞态。定向 ESLint/格式、前后端业务类型、实体列检查、组件复用扫描、生产构建和 diff 检查通过；前端保留既有 PURE 注释及大分块提示。未启动/重启服务、未改数据库或调用真实付费模型。更新前后端后，在功能配置编辑页切换模型即可按开关进行真实测试。

### 2026-10-25 将已确认的模型拒绝报错转换为欠费提示

- 按用户确认，将完整英文 `Access to model denied. Please make sure you are eligible for using the model` 转换为固定中文“大模型账号已欠费，请充值后重试。”。新增共享识别函数，只匹配该完整报错或已转换中文；JSON 仅访问错误封装字段，不扫描正常回答/提示词/凭据，不将普通 AccessDenied、403、鉴权或限流扩大认定为欠费。媒体错误体最多读取 64 KB，支持 JSON 与纯文本，读取失败沿用原提示。
- 模型接口卡片测试在协议解析和通用错误之前识别欠费，沿用现有 `message`、详情和 ElMessage 展示；提交失败明确为失败，查询阶段保留原任务编号并显示待核实、充值后继续查询，不自动重新生成。共用 Chat/流式 SSE/OCR/文本向量及模型校验返回固定中文，校验不移除模型或停用关联配置；SSE 结束或异常时清理读取器。
- Agent 图片测试归类为额度异常并保留候选；实际媒体请求、共享生图结果及异步查询保留欠费原因。模型调度归类为账号余额异常，停止同账号切换，并在冷却期继续显示已确认原因。内容正文、封面和素材任务不再用上层通用提示覆盖欠费，仍不透传其它供应商原始响应、密钥或地址；取消、超时、版本冲突等原有状态优先，不自动重试。
- 新增文件：`server/src/common/ai/model-provider-error.ts`。
- 修改文件：`server/src/knowledge-ai-providers/knowledge-ai-providers.service.ts`、`server/src/knowledge-ai-providers/model-endpoint-tests.service.ts`、`server/src/common/ai/image-generation.ts`、`server/src/agent-apps/agent-media-probe.ts`、`server/src/agent-apps/agent-media-probe.service.ts`、`server/src/agent-apps/agent-media.service.ts`、`server/src/agent-apps/agent-model-routing.ts`、`server/src/agent-apps/agent-model-router.service.ts`、`server/src/ai-materials/ai-materials.service.ts`、`server/src/ai-materials/material-generation-error.ts`、`server/src/content-articles/content-cover.service.ts`、`server/src/content-articles/content-generation.service.ts`、`.design-spec.md`、本文件。删除文件：无。用户已有 `web/auto-imports.d.ts`、`web/src/api/hotTopic.ts` 改动保留且不纳入提交。
- 前后端范围：复用已有 `message/errorMessage/reason` 契约和消息组件，未改 DTO、实体、权限或前端文件；只在真实响应返回该错误时提示，不因配置匹配检查推断欠费。
- 验证：修改代码定向 ESLint/格式、后端业务类型检查和 diff 检查通过；静态核对精确报错匹配、JSON/文本错误读取、目录/候选保留、账号调度分类、固定中文透传、原任务不重投与取消/超时优先。按修复类约定未执行测试、build、启动/重启服务、数据库变更或真实模型调用。

### 2026-10-25 模型接口采用系统通用规则与模型专用覆盖

- “模型厂商调用接口”新增“系统通用 / 模型专用”页签，均复用 Table 卡片、搜索、分页及 Dialog/Form/Button。百炼和 TokenHub 分别提供普通调用、识图、文本向量三类，共六张由代码维护的只读规则；允许查看和测试，不显示编辑、删除和勾选入口，服务端同时拒绝负数系统标识的编辑、删除及混合批量删除。系统规则不写数据库，无实体列/迁移、草稿、备注或可编辑副本。
- 共用解析器先匹配平台、具体模型、功能的专用卡片，再使用已确认的官方平台通用规则；专用卡片停用即阻止，不绕过到通用规则。删除专用卡片后可回到通用规则。生图、视频等不提供通用兜底；未知平台继续沿用既有标准兼容路径，来源明确为自定义平台，不冒充官方卡片。新模型版本直接采用账号目录中的实际编码，不添加 `qwen*` 等通配匹配。系统规则严格使用对应功能目录，识图不能借用普通调用目录，空目录不自动补默认模型；不自动开启 Think、工具或结构化输出能力。
- 官方目录完整快照仍保留 255 项；其中 69 项与标准通用规则相同，后续启动/手动补充不再逐版本入库，专用预设为 186 项。历史数据库记录及人工修改、停用、软删除继续保留，已有标准路径卡片仍作为精确覆盖生效。系统通用路径保留官方地域和百炼专用域名差异；业务空间替换仍使用已保存账号信息。
- 两端对齐卡片 `source/isReadOnly`、列表 `source`、功能检查 `ruleName`、测试 DTO 可选 `model`、测试账号可选 `models/apiPath` 及结果 `model/apiPath`。系统卡片测试选项按同平台、有效账号及能力目录返回具体版本，批量排除已有专用覆盖，提交时再次验证所属目录与实际命中规则；客户端请求 JSON 的模型不能替换所选版本。测试编号幂等绑定模型，查询与恢复保留原模型，结果和消息显示实际模型/路径，不将一次成功扩大为全系列可用；切换选择不请求供应商。
- AI 功能配置检查和消息改为显示“已匹配「阿里云百炼 · 普通调用（系统通用）」”等真实规则名称；专用和系统规则均为正常匹配，仍明确只是配置检查。Agent、内容创作、素材及模型校验继续通过共用服务解析，不新增页面私有匹配逻辑或模型授权假设。
- 新增文件：`server/src/model-endpoints/model-endpoint.builtins.ts`、`server/src/model-endpoints/model-endpoint.builtins.spec.ts`。
- 修改文件（后端）：`server/src/model-endpoints/model-endpoint.presets.ts`、`server/src/model-endpoints/model-endpoints.service.ts`、`server/src/model-endpoints/model-endpoints.service.spec.ts`、`server/src/model-endpoints/dto/model-endpoint.dto.ts`、`server/src/knowledge-ai-providers/knowledge-ai-providers.service.ts`、`server/src/knowledge-ai-providers/dto/model-endpoint-test.dto.ts`、`server/src/knowledge-ai-providers/model-endpoint-tests.service.ts`、`server/src/ai-feature-configs/ai-feature-configs.service.ts`、`server/src/ai-feature-configs/ai-feature-configs.service.spec.ts`。
- 修改文件（前端及文档）：`web/src/api/modelEndpoint.ts`、`web/src/api/aiFeatureConfig.ts`、`web/src/views/model-endpoint/Index.vue`、`web/src/views/model-endpoint/Test.vue`、`web/src/views/model-endpoint/View.vue`、`web/src/views/ai-feature-config/Edit.vue`、`.design-spec.md`、本文件。删除文件：无。用户已有 `web/auto-imports.d.ts`、`web/src/api/hotTopic.ts` 改动保留且不纳入提交。
- 验证：相关 15 套件 258 项模拟测试通过，涵盖版本不锁定、专用覆盖/停用、目录隔离、系统只读保护、实际模型提交/幂等恢复、地域/业务空间以及 Agent、内容生成、封面和素材链路。前后端业务类型检查、定向 ESLint/格式、TypeORM 实体列检查、组件复用扫描及生产构建通过；前端保留既有 PURE 注释及大分块提示。未启动/重启服务、未改数据库或调用真实付费模型。更新前后端后即可查看新页签；系统卡片无需补充入库。
- 官方路径依据：[百炼 Chat](https://help.aliyun.com/zh/model-studio/qwen-api-via-openai-chat-completions/)、[百炼 Embeddings](https://help.aliyun.com/zh/model-studio/embedding-interfaces-compatible-with-openai)、[百炼地域与专用端点](https://help.aliyun.com/en/model-studio/base-url)、[腾讯 Chat](https://cloud.tencent.com/document/product/1823/130079)、[腾讯识图](https://cloud.tencent.com/document/product/1823/136956)、[腾讯文本向量](https://cloud.tencent.com/document/product/1823/133515)。

### 2026-10-25 按腾讯官方调用指南补全模型接口目录

- 联网核对 TokenHub 总模型表及图像/视频/3D/语音音乐/多模态/向量/联网搜索详细调用指南，预设现覆盖 126 个腾讯模型编码、253 个模型功能场景；保留原有 2 条百炼卡片后共 255 条。腾讯分类数量：语言 40、图像 26、视频 75、3D 与世界模型 40、语音音乐 21、多模态理解 42、向量 4、联网搜索 5。继续使用“平台 + 模型 + 功能”唯一配置，不新增实体列、草稿或备注字段。
- 卡片列表增加八类筛选、官方调用文档和“补充官方接口”，沿用 Table/Form/Dialog/Button 和原权限；补充操作要求 `ModelEndpoint.create`。启动和手动补充共用幂等逻辑，只新增缺失记录，保留已有编辑、停用及软删除记录；不会自动恢复用户已删除预设。派生返回 `category/taskMethod/documentationUrl`、选项增加分类和查询方法，两端字段对齐，无数据库迁移。
- 新增 WAND/Kling 生图，WAND/PixVerse/Kling/MiniMax 视频、3D/世界模型、ASR/TTS/音色/配音/音乐、多模态向量及两种联网协议的测试模板和结果校验；Kling Omni/O1 的文生、图生、首尾帧使用全能入口，MiniMax V1/V2 提交与查询成对区分。语音路径采用详细指南的 `/asrproxy/sync_transcribe`、`/asrproxy/async_create` 和 `/minimax-tts/sync_tts`，3D/优图按 POST `{model,id}` 查询已有任务。新协议失败、未知、受理和完成分别展示，HTTP 200 或缺少实际结果不冒充成功，联网还须有可核验搜索调用/来源。
- WAND/Kling 图片与新增视频适配进入共用媒体调用层，供原有 Agent 生图、封面及素材链路按卡片解析；轮询只查询原任务，同域校验、取消信号、脱敏和防重复提交继续生效。原生分辨率按协议验证，不偷偷把 720P 转为 768P，卡片调试允许按官方文档填原生参数；现有素材表单的清晰度选项范围未扩展。3D/语音等新能力当前只开放卡片配置与调试，账号尚无对应专用模型目录时按同平台启用账号和密钥核实开通情况，不修改原有媒体目录约束或增加未实现的 Agent/内容创作能力。高级原生输入用显式占位符要求按文档补齐，不猜输入字段；Mureka 默认只生成一首。
- 账号平台识别补充官方新加坡域名 `tokenhub-intl.tencentmaas.com`，继续保留已有地域域名识别。总表中的 `indextts-2`、`wand-dubbing-sts-v1` 缺少明确调用指南，标记为待核实且不登记猜测端点；已下线 Qwen3.5 与旧 `kl-video-*` 别名未纳入。将来下线日期尚未到达的模型按当前可用目录保留。
- 新增文件：`server/src/model-endpoints/tokenhub-official.presets.ts`、`server/src/model-endpoints/tokenhub-official.presets.spec.ts`、`server/src/common/ai/tokenhub-adapters.ts`、`server/src/common/ai/tokenhub-adapters.spec.ts`。
- 修改文件（后端）：`server/src/model-endpoints/model-endpoint.constants.ts`、`server/src/model-endpoints/model-endpoint.presets.ts`、`server/src/model-endpoints/dto/model-endpoint.dto.ts`、`server/src/model-endpoints/model-endpoints.controller.ts`、`server/src/model-endpoints/model-endpoints.service.ts`、`server/src/model-endpoints/model-endpoints.service.spec.ts`、`server/src/common/ai/image-generation.ts`、`server/src/common/ai/video-generation.ts`、`server/src/knowledge-ai-providers/knowledge-ai-providers.service.ts`、`server/src/knowledge-ai-providers/knowledge-ai-media-target.spec.ts`、`server/src/knowledge-ai-providers/model-endpoint-test.utils.ts`、`server/src/knowledge-ai-providers/model-endpoint-tests.service.ts`、`server/src/knowledge-ai-providers/model-endpoint-tests.service.spec.ts`、`server/src/ai-materials/ai-materials.service.ts`。
- 修改文件（前端及文档）：`web/src/api/modelEndpoint.ts`、`web/src/utils/modelPlatform.ts`、`web/src/utils/modelPlatform.test.mjs`、`web/src/views/model-endpoint/Index.vue`、`web/src/views/model-endpoint/Edit.vue`、`web/src/views/model-endpoint/View.vue`、`web/src/views/model-endpoint/Test.vue`、`.design-spec.md`、本文件。删除文件：无。用户已有 `web/auto-imports.d.ts`、`web/src/api/hotTopic.ts` 改动保留且不纳入提交。
- 验证：相关后端 13 套件 165 项检查（首次一项失败提示断言发现错误分支，修复后定向复查通过），全部使用模拟供应商响应；前端域名识别 2 项测试通过。前后端业务类型检查、修改代码定向 ESLint/格式检查、实体列检查、组件复用扫描和生产构建通过；前端保留既有 PURE 注释与分块大小提示。未启动/重启服务、未执行数据库迁移、未调用真实付费模型。正常更新并启动后端会补齐卡片，也可在更新后的页面点“补充官方接口”。
- 主要官方依据：[总模型列表](https://cloud.tencent.com/document/product/1823/130051)、[图像模型概览](https://cloud.tencent.com/document/product/1823/135744)、[WAND 生图](https://cloud.tencent.com/document/product/1823/137203)、[Kling 生视频](https://cloud.tencent.com/document/product/1823/135742)、[3D 查询](https://cloud.tencent.com/document/product/1823/137181)、[WAND ASR](https://cloud.tencent.com/document/product/1823/135794)、[MiniMax TTS](https://cloud.tencent.com/document/product/1823/135796)、[联网搜索](https://cloud.tencent.com/document/product/1823/132358)。各模型对应具体文档链接在目录快照中维护。

### 2026-10-25 补齐模型检查与测试结果消息提示

- 修复 AI 功能配置切换模型后只更新字段 hint、没有 ElMessage 的问题：全部功能共用现有检查结果，厂商卡片匹配通过给成功消息，标准接口回退给信息消息，失败给错误消息；均包含当前模型并明确只是配置检查、没有实际调用模型。初始化回显与保存前检查保持静默，保存结果沿用原提示。
- Agent 图片识别/生图选择与手动测试补充有效、无效、无法确认和网络错误的消息，保留字段内详细说明；缓存结果注明未重复调用，无效候选提示包含具体原因。媒体测试请求改为页面接管错误提示，避免统一请求层重复或迟到弹窗；登录失效仍只使用统一登录提示，不改变真实调用、候选处理或计费行为。
- 模型接口卡片调试在明确开始和手动查询后提示本次结果，异步后台查询仅在成功/失败/待核实等结果变化时通知；处理中不重复提示，打开历史结果不主动弹窗。所有新增提示都经过原有请求序号/弹窗会话有效性检查，关闭、切换或清空后的旧响应不提示，不增加供应商请求。
- 新增文件：无。删除文件：无。修改文件：`web/src/api/agentApp.ts`、`web/src/views/ai-feature-config/Edit.vue`、`web/src/views/agent-app/Edit.vue`、`web/src/views/model-endpoint/Test.vue`、`.design-spec.md`、本文件。后端 DTO、接口与字段契约无需改动；用户已有 `web/auto-imports.d.ts`、`web/src/api/hotTopic.ts` 改动保留且不纳入提交。
- 验证：前端业务类型检查、修改代码格式检查、组件复用扫描与 diff 检查通过；静态核对消息等级、静默初始化/保存、轮询去重、过期响应隔离与 401 提示分工。按修复类约定未执行测试、构建、启动/重启服务或真实模型请求。

### 2026-10-25 模型厂商接口卡片增加真实调用测试

- 每张接口卡片通过 Table 的 actions 插槽追加“测试”，复用 Dialog/Form/Button 展示同平台账号、预填请求 JSON、实际 HTTP、耗时、时间、任务编号与脱敏响应；普通调用、识图、向量化、文生图/参考生图、文生视频/图生视频/参考生视频/首尾帧均可调试。文本/媒体模板复用现有协议构造，首尾帧提供 Vidu 双图片模板（参数依据：https://cloud.tencent.cn/document/product/1823/135756）。用户须替换参考素材占位符，明确点击费用提示按钮才发起真实调用，不自动测试或生成，不新增草稿/备注字段。
- 后端在已有模型账号模块内增加卡片调试 DTO/Controller/Service，复用 demo 分层和全局权限/校验；避免账号模块已引用接口模块时产生循环依赖，无新增业务表、菜单权限或数据库迁移。选项/执行/查询均要求 `ModelEndpoint.update`，只返回同平台、已启用、具备密钥且对应能力目录登记该模型的账号 ID/名称；服务端按指定已保存卡片构造地址/协议、固定模型并强制普通调用非流式，不接收客户端地址或密钥。
- HTTP 200 还须包含协议对应消息、数值向量或媒体结果；异步任务只判“已受理”，随后仅 GET 已有任务并区分成功、失败、未知。图片/视频查询异常保留编号供继续核实，路径或模型改变后不使用新配置查询旧任务。响应有界读取和脱敏，隐藏密钥、Authorization、大段 Base64 等，不执行供应商错误中的内容，不因测试结果修改账号目录或关联配置。
- 使用用户隔离的临时测试编号保护当前进程内重复提交，最多保留 500 条、30 分钟，限制每用户并发和每分钟测试次数；请求超时/查询失败不自动重投。重新打开卡片恢复本人最近一次结果，关闭/卸载停止界面轮询并忽略迟到响应；超过 15 分钟停止自动查询并允许手动查询原任务，服务重启/过期后明确提示先核实供应商任务。
- 新增文件：`server/src/knowledge-ai-providers/dto/model-endpoint-test.dto.ts`、`server/src/knowledge-ai-providers/model-endpoint-test.utils.ts`、`server/src/knowledge-ai-providers/model-endpoint-tests.controller.ts`、`server/src/knowledge-ai-providers/model-endpoint-tests.service.ts`、`server/src/knowledge-ai-providers/model-endpoint-tests.service.spec.ts`、`web/src/views/model-endpoint/Test.vue`。
- 修改文件：`server/src/knowledge-ai-providers/knowledge-ai-providers.module.ts`、`server/src/knowledge-ai-providers/knowledge-ai-providers.service.ts`、`server/src/model-endpoints/model-endpoint-routing.spec.ts`、`web/src/api/modelEndpoint.ts`、`web/src/views/model-endpoint/Index.vue`、`.design-spec.md`、本文件。删除文件：无。用户已有的 `web/auto-imports.d.ts`、`web/src/api/hotTopic.ts` 改动保留且不纳入提交。
- 验证：相关后端 4 套件 52 项测试通过（全用模拟供应商响应）；前后端业务类型检查、后端定向 ESLint、实体列校验、组件复用扫描、生产构建和 diff 检查通过。前端构建子进程最初被系统 EPERM 阻止，经授权后完成；保留既有 PURE 注释和大分块提示。未启动/重启应用、未执行数据库迁移或真实付费模型请求。

### 2026-10-25 AI 功能编辑统一检查模型厂商接口

- 修复 AI 功能配置切换模型时生图、生视频和热点类型直接跳过检查、普通类型依赖账号编辑权限的问题。全部功能统一通过只读 `POST /ai-feature-configs/check-model-endpoint` 检查账号启用、密钥是否配置、对应模型目录与实际接口；沿用功能配置的 `Menu.read` 权限，只返回功能/路径/匹配来源摘要，不暴露密钥或完整账号配置。
- 编辑检查与运行时共用平台/模型/功能解析：聊天、创作、热点、提示词整理、文档解析与 LLM 重排匹配普通调用，视觉 OCR 匹配识图，MinerU 后文本整理匹配普通调用；图片/视频生成检查文生图/文生视频卡片。非媒体场景缺少卡片时明确展示标准接口来源；媒体缺卡片、接口停用时明确阻止。参考图、参考视频等其它媒体模式继续在实际任务中按本次场景读取对应卡片。
- 热点启用联网时复用真实搜索链路的百炼 Responses 地址检查，提前提示不支持的账号/路径或旧 Chat 联网协议。自动检查不向供应商发送请求，不执行生成/联网搜索，不从账号目录移除模型或停用关联功能；配置匹配通过不代表远端模型授权、余额或实际调用成功。
- 打开已有配置、切换账号/模型/功能/OCR 引擎/联网协议及保存前均检查；表单展示匹配场景、调用路径与卡片/标准来源。补齐关闭、清空、快速切换、重新打开和卸载时的旧响应隔离，避免迟到结果覆盖当前选择；保存前失败或选择已变化时停止提交。修正 OCR 引擎切换后的模型目录检查，以及视频和参考生图的旧端点提示。
- 新增文件：无。删除文件：无。
- 修改文件（后端）：`server/src/ai-feature-configs/dto/ai-feature-config.dto.ts`、`server/src/ai-feature-configs/ai-feature-configs.controller.ts`、`server/src/ai-feature-configs/ai-feature-configs.service.ts`、`server/src/ai-feature-configs/ai-feature-configs.service.spec.ts`、`server/src/knowledge-ai-providers/knowledge-ai-providers.service.ts`、`server/src/model-endpoints/model-endpoint-routing.spec.ts`。
- 修改文件（前端及文档）：`web/src/api/aiFeatureConfig.ts`、`web/src/views/ai-feature-config/Edit.vue`、`.design-spec.md`、本文件。
- 验证：前后端业务类型检查、受影响回归规格及其依赖的 TypeScript 静态检查、修改后端文件定向 ESLint、组件复用扫描与 diff 检查通过。补充全功能映射、编辑/实际解析一致、标准回退/媒体拒绝、账号状态/目录、权限、MinerU 与 Responses 检查的回归规格。按修复类约定仅做静态检查，未执行测试、构建、启动/重启服务或真实模型请求。用户已有的 `web/auto-imports.d.ts`、`web/src/api/hotTopic.ts` 改动保留且不纳入提交。

### 2026-10-25 账号专用接口收敛到模型功能卡片

- 大模型账号编辑和查看移除 Chat 路径、生图协议、生图地址、视频地址；前后端提交/返回类型、DTO 和服务载荷同步去除四项字段。账号继续维护平台基础地址、密钥、业务空间、模型目录与启用状态。历史数据库列保留存量值，不删除数据、不再写入或作为业务调用回退地址。
- 生图、生视频按“账号平台 + 模型编码 + 本次功能场景”读取已启用接口卡片；缺卡片或已停用时明确阻止，提示前往第三方配置补充，不使用旧地址、不推测媒体接口、不发起供应商请求。Agent 候选与引用校验只认可有效文生图卡片；文章封面没有卡片时跳过可选生图步骤，不影响正文。
- 普通调用、识图、向量化和模型校验优先读取对应功能卡片；没有专用卡片时按基础地址与标准 Chat Completions/Embeddings 协议解析。百炼仅填共享/业务空间根地址或原生 `/api/v1` 时可自动解析兼容路径，避免重复 `/v1`；自定义基础路径和已填写的标准完整端点保持可用。非标准历史 Chat 路径需在对应模型功能卡片中维护。
- 同步调整 Agent 和 AI 功能配置的指引，接口协议/路径统一在“第三方配置 → 模型厂商调用接口”维护。模型校验仍禁止通过文本接口验证生图/视频；更新配置契约、旧值不回退、场景分离、标准地址解析和模型校验路由的回归规格。
- 新增文件：无。删除文件：无。
- 修改文件（后端）：`server/src/knowledge-ai-providers/dto/knowledge-ai-provider.dto.ts`、`server/src/knowledge-ai-providers/entities/knowledge-ai-provider.entity.ts`、`server/src/knowledge-ai-providers/knowledge-ai-providers.service.ts`、`server/src/knowledge-ai-providers/knowledge-ai-media-target.spec.ts`、`server/src/model-endpoints/model-endpoint-routing.spec.ts`、`server/src/agent-apps/agent-apps.service.ts`、`server/src/agent-apps/agent-apps.service.spec.ts`、`server/src/content-articles/content-cover.service.ts`。
- 修改文件（前端及文档）：`web/src/api/knowledgeAiProvider.ts`、`web/src/views/knowledge-ai-provider/Edit.vue`、`web/src/views/knowledge-ai-provider/View.vue`、`web/src/views/agent-app/Edit.vue`、`web/src/views/ai-feature-config/Edit.vue`、`.design-spec.md`、本文件。
- 验证：前后端业务类型检查、受影响测试及其业务依赖的 TypeScript 静态检查、修改文件定向 ESLint、TypeORM 实体列校验和 diff 检查通过；扫描确认旧四项配置仅保留在历史实体列/迁移与兼容性回归规格中，运行逻辑和前端无引用。按重构约定仅做静态检查，未执行测试、构建、启动/重启服务、数据库迁移或真实模型请求。用户已有的 `web/auto-imports.d.ts`、`web/src/api/hotTopic.ts` 改动保留且不纳入提交。

### 2026-10-25 大模型账号自动识别平台与模型功能接口卡片

- 大模型账号根据 API URL 的真实 hostname 自动识别腾讯 TokenHub（国内/国际）、阿里云百炼（共享域名/业务空间域名）或自定义平台；编辑时即时预览，列表与详情以后端判定为准，不依赖模型名或 URL 关键词，不暴露真实密钥。账号表单移除“描述”输入，保留历史数据。
- 第三方配置新增“模型厂商调用接口”：每张卡片唯一对应 `platformType + modelCode + functionType`，支持普通调用、识别图片、文本向量、文生图、参考生图、文生视频、图生视频、参考生视频、首尾帧生视频的路径登记；维护模型名称、协议、同步/异步、任务查询路径和 `isActive`，无草稿/发布、备注/说明字段。提供搜索、平台/场景/状态筛选、分页、查看、编辑、软删除与批量删除，权限统一为 `ModelEndpoint.read/create/update/delete/batchDelete`。
- 基于 demo 的 Entity/DTO/Service/Controller/Module 与 Index/Edit/View/API 结构扩展，公共 Table 新增 cards 模式，页面继续复用搜索、分页、勾选、权限按钮和删除确认；同步更新组件契约与设计规范。补齐根模块、第三方概览、菜单/权限及操作日志注册。
- 初始化补充 16 条可编辑预设，覆盖混元 3.0/3.5、Seedream 5.0 Pro、Vidu 图片、混元视频、Vidu Q2/Q2 Pro 的已知功能和百炼普通调用/识图示例。预设重启时只补缺，不覆盖编辑、停用或软删除。接口配置不代表账号已开通相应模型，调用仍校验账号启用、密钥和对应能力目录。
- 实际调用按平台/模型/功能精确解析卡片；停用卡片明确阻止调用，没有匹配卡片时兼容账号原有地址。路径基于账号同域名构建，不重复拼接 Chat 路径或 /v1；拒绝跨域路径、凭据、查询参数与路径穿越。聊天、识图、向量化、Agent、素材生成和文章封面接入解析；增加混元 messages、Seedream、Vidu 异步生图及腾讯视频协议适配，仅轮询已受理任务，不自动重新提交可能计费的请求。首尾帧接口可独立登记，本次不新增素材创作页的首尾帧输入模式。
- 新增文件（后端）：`server/src/model-endpoints/model-endpoint.constants.ts`、`server/src/model-endpoints/model-endpoint.presets.ts`、`server/src/model-endpoints/entities/model-endpoint.entity.ts`、`server/src/model-endpoints/dto/model-endpoint.dto.ts`、`server/src/model-endpoints/model-endpoints.service.ts`、`server/src/model-endpoints/model-endpoints.controller.ts`、`server/src/model-endpoints/model-endpoints.module.ts`、`server/src/model-endpoints/model-endpoints.service.spec.ts`、`server/src/model-endpoints/model-endpoint-routing.spec.ts`、`server/src/common/ai/tokenhub-generation.spec.ts`、`server/src/migrations/1793232000000-AddModelEndpoints.ts`。
- 新增文件（前端）：`web/src/api/modelEndpoint.ts`、`web/src/utils/modelPlatform.ts`、`web/src/utils/modelPlatform.test.mjs`、`web/src/views/model-endpoint/Index.vue`、`web/src/views/model-endpoint/Edit.vue`、`web/src/views/model-endpoint/View.vue`。
- 修改文件（后端）：`server/src/app.module.ts`、`server/src/knowledge-ai-providers/knowledge-ai-providers.module.ts`、`server/src/knowledge-ai-providers/knowledge-ai-providers.service.ts`、`server/src/agent-apps/agent-apps.service.ts`、`server/src/agent-apps/agent-media.service.ts`、`server/src/agent-apps/agent-media-probe.service.ts`、`server/src/ai-materials/ai-materials.service.ts`、`server/src/common/ai/image-generation.ts`、`server/src/common/ai/video-generation.ts`、`server/src/content-articles/content-cover.service.ts`、`server/src/menus/menu-structure.ts`、`server/src/users/users.service.ts`、`server/src/third-party-config/third-party-config.service.ts`、`server/src/log-records/log-api-scanner.ts`。
- 修改文件（前端及文档）：`web/src/api/knowledgeAiProvider.ts`、`web/src/components/Table.vue`、`web/src/router/index.ts`、`web/src/views/knowledge-ai-provider/Index.vue`、`web/src/views/knowledge-ai-provider/Edit.vue`、`web/src/views/knowledge-ai-provider/View.vue`、`AGENTS-COMPONENTS.md`、`.design-spec.md`、本文件。删除文件：无。用户已有的 `web/auto-imports.d.ts`、`web/src/api/hotTopic.ts` 改动保留且不纳入提交。
- 验证：后端相关 13 套件 131 项测试通过；前端域名识别 2 项测试通过；前后端业务类型检查、TypeORM 实体列校验、生产构建、组件复用扫描和 diff 检查通过。修改文件定向 ESLint 无新增问题；`app.module.ts` 原有数据库初始化代码仍有 10 条 require/any 规则错误，未扩大修复。前端构建保留既有 PURE 注释与大分块提示。Node 测试与 Vite 构建的子进程在沙箱内被 EPERM 阻止后，经批准在沙箱外验证通过。未启动/重启服务、未执行数据库迁移、未调用真实付费模型。
- 生效：开发环境重启后自动建表并补齐预设/菜单；生产环境需先运行新增迁移，再重启服务。官方接口依据：https://cloud.tencent.com/document/product/1823/135745 、https://cloud.tencent.com/document/product/1823/135746 、https://cloud.tencent.com/document/product/1823/136609 、https://cloud.tencent.com/document/product/1823/137202 、https://cloud.tencent.com/document/product/1823/135756 、https://help.aliyun.com/zh/model-studio/base-url 。

### 2026-10-23 热点选题默认隐藏已忽略内容
- 点击忽略仍保存 `decision=ignored`，不删除记录；列表默认在数据库分页前排除已忽略，关键词搜索、推荐程度筛选和总数沿用相同条件，保留当前用户隔离。现有操作成功后的 Table 刷新立即应用过滤；重新采集不会清除既有忽略标记。
- “我的状态”默认提示隐藏已忽略，支持“已忽略”查看与恢复、“全部（含已忽略）”显式查看全部；清空或重置筛选后继续默认隐藏。前后端查询契约增加 `all`，不改变实体状态或忽略/恢复接口。
- 新增文件：无。修改文件：`server/src/hot-topics/dto/hot-topic.dto.ts`、`server/src/hot-topics/hot-topics.service.ts`、`server/src/hot-topics/hot-topics.service.spec.ts`、`web/src/api/hotTopic.ts`、`web/src/views/hot-topic/Index.vue`、`.design-spec.md`、本文件。删除文件：无。
- 验证：前后端业务代码类型检查、后端定向 ESLint 和 diff 检查通过；补充默认过滤、分页、组合查询、显式状态和全部查询的回归用例。后端全量含测试的类型检查仍有既存错误（agent-apps/ai-materials/comfyui/menus 及 hot-topic-sources.service.spec.ts），未越界改动。按修复类约定仅做静态检查，未执行测试、构建或启动/重启服务。

### 2026-10-23 接入网易国内新闻并移除 RSS / JSON Feed
- 热点来源收敛为抖音热点、微博热点、网易国内新闻；移除 RSS/JSON Feed 配置、接口密钥字段、RSS/Atom 与通用 Feed 解析和 Bearer 请求逻辑。旧来源从列表和任务选项排除，保留历史记录与数据库兼容列，不执行删库或删列。
- 网易来源使用用户指定的固定接口，前后端统一地址并设为只读。支持真实接口的 `application/x-javascript` 响应，仅将 `var data = JSON;` 的内容解析为数据，按 category 与新闻 c 字段筛出“国内”，提取标题、链接及北京时间，不执行远程脚本。
- 网易在三种获取模式中均直接读取固定接口，不加入全站 AI 搜索；仅选择网易时不要求联网模型，选配 AI 可继续推荐。修复编辑来源回填时 watcher 误清空 URL 和重置获取方式。
- 新增文件：无。修改文件：后端 `hot-topic.types.ts`、DTO、实体兼容列注释、来源服务、采集服务、网络读取、解析器、任务校验及相关测试；前端 `api/hotTopic.ts`、来源 Index/Edit/View、热点 Preferences、preferenceValidation 与页面测试；`.design-spec.md`、本文件。删除文件：无（已删除旧解析函数及授权分支）。
- 验证：使用项目实际网络读取与解析器直连网易接口，成功得到 54 条国内新闻；后端热点测试 7 套件 58/58、实体列检查和生产构建通过；前端类型检查及热点测试 14/14 通过。未启动或重启服务。

### 2026-10-23 移除热点指定账号来源并调整记录布局
- 热点来源配置移除“抖音指定账号”可选类型、账号名称/稳定标识字段及列表/详情展示；继续支持抖音热点、微博热点、第三方热搜聚合页、RSS、授权 JSON Feed 与 AI 联网搜索。后端 DTO 不再接受账号类型或绑定字段，采集链路不再按账号主页/UID 归属搜索结果。
- 历史 `douyinAccount` 数据保留数据库兼容列但不进入任务来源选项；列表/详情以停用的普通抖音热点页面安全回显，编辑保存时转换为普通页面来源并清空旧账号字段，避免自动启用语义已经变化的历史配置。
- 抖音 `aweme_list` 结构化内容仍可提取标题、发布时间和作者元数据，但 `accountMatched` 保持 false，不再承诺指定账号最新 N 条同步。
- `web/src/views/hot-topic/Runs.vue`：当前选中任务详情移到弹窗上方，历史任务记录表格移到下方，并同步调整分隔线与间距。
- 新增文件：无。修改文件：热点来源/采集相关后端类型、DTO、服务、解析器及测试，热点来源与热点记录相关前端 API、页面及测试，`.design-spec.md`、本文件。删除文件：无。
- 验证：后端热点模块 7 个测试套件 58/58 通过，相关文件定向 ESLint、TypeORM 实体列检查与生产构建通过；前端类型检查、热点页面测试 12/12、组件复用扫描与生产构建通过，仅保留既有 Rollup 大分块提示。

### 2026-10-23 核验抖音指定账号作品 JSON 解析
- `server/src/hot-topics/hot-topic-parsers.spec.ts`：新增抖音 `aweme/post` 直出 JSON 的脱机回归用例，确认 `aweme_list[].desc` 可提取作品标题、秒级 `create_time` 可转换为 ISO 发布时间、`aweme_id` 可生成作品地址，并继续以 `author.sec_uid` 校验账号归属；原嵌入 JSON 用例同时补充发布时间断言。
- 现场验证：用户浏览器会话中的接口能返回作品列表；同一完整 URL 从服务端携带普通浏览器请求头和 Referer 访问仍返回 HTTP 403，说明接口依赖浏览器 Cookie、设备会话或平台风控状态。项目不会硬编码或复用个人浏览器 Cookie，生产采集仍需稳定的官方授权接口或受控授权数据源。
- 新增文件：无。修改文件：`server/src/hot-topics/hot-topic-parsers.spec.ts`、`.design-spec.md`、本文件。删除文件：无。
- 验证：热点解析器定向测试 10/10 通过，测试文件定向 ESLint 通过。

### 2026-10-23 修复微博热搜回退与抖音指定账号判定
- `server/src/hot-topics/hot-topic-fetch.service.ts`：第三方微博榜单页（如 TopHub）被服务端拒绝或无法解析时，自动回退到微博官方 `ajax/statuses/hot_band` 结构化热搜接口，记录中同时说明配置页失败与实际回退通道。
- 抖音指定账号的 AI 搜索约束增加完整主页 URL；命中配置的精确 `/user/{sec_uid}` 主页时，只记录“已找到主页、未取得可核验作品”，不把主页本身当作热点。只命中抖音域名的其它资料改为“未命中精确账号”，不再显示“已跳过”，也不产生无账号归属的候选。只有公开结构化数据携带与配置一致的 UID/sec_uid 时才收录具体作品。
- 混合模式下同一来源的平台读取与 AI 联网结果合并为一条；任一通道成功时整体保持成功，不再被另一通道失败误标为部分失败。
- `server/src/hot-topics/hot-topic-network.ts`：公开来源请求支持受控 Referer，仅用于微博官方公开接口；仍禁止凭据、换行与不安全地址。
- `web/src/views/hot-topic/Preferences.vue`：获取模式明确标注“仅 AI 联网搜索”不直读来源页；已选公开页 / Feed 时显示警示并引导选择混合模式，来源选项同时展示其获取方式。
- 现场验证：TopHub 页面在当前服务端网络返回 HTTP 403；微博官方热搜接口在受控 Referer 下返回 HTTP 200 及真实 `band_list`；抖音指定账号公开主页返回动态校验页，不能在无登录/无授权条件下诚信解析作品列表。
- 新增文件：无。修改文件：`server/src/hot-topics/hot-topic-fetch.service.ts`、`server/src/hot-topics/hot-topic-fetch.service.spec.ts`、`server/src/hot-topics/hot-topic-network.ts`、`web/src/views/hot-topic/Preferences.vue`、`.design-spec.md`、本文件。删除文件：无。
- 验证：后端热点模块 7 个测试套件 60/60 通过，定向 ESLint、TypeORM 实体列检查与生产构建通过；前端类型检查、生产构建、页面组件复用扫描通过（仅保留既有 Rollup 大分块提示）。后端全量 lint 仍被多个既有非热点模块规则错误阻断，本次文件定向检查无新增问题。

### 2026-10-23 热榜来源不再限制平台域名（支持第三方聚合页）
- `server/src/hot-topics/hot-topic.types.ts`：`PLATFORM_SOURCES` 的 `host` 改为可选——热榜来源（`douyinHot` / `weiboHot`）不再绑定域名，既可以是平台自有页面，也可以是合规的第三方聚合页（如 `https://tophub.today/n/KqndgxeLl9` 微博热搜榜）；仅账号来源（`douyinAccount`）保留 `douyin.com` 限制，因为账号归属必须可证明。新增 `HOT_LIST_KINDS` 标记热榜类来源。
- `server/src/hot-topics/hot-topic-sources.service.ts`：保存校验仅在来源声明了归属域名时校验域名（账号场景），报错文案改为「…账号来源必须使用 … 官方主页地址」；热榜来源仍限制为公开页面或 AI 搜索接入。
- `server/src/hot-topics/hot-topic-fetch.service.ts`：`sourceHost` 对无域名归属的热榜来源改由来源自身 URL 推导（去掉 `www.`），AI 搜索结果归属与来源匹配逻辑随之沿用；页面采集的域名校验只对账号来源生效。
- `server/src/hot-topics/hot-topic-parsers.ts`：移除采集入口「微博来源仅支持 weibo.com 域名」的限制；脚本 JSON 解析为空时，对热榜来源新增服务端渲染榜单表格兜底解析（`<tr>` 内「序号 + 标题链接 + 热度」，支持「253 万 / 1.2 亿」写法还原为数值，相对地址按来源页解析，`javascript:` 等非链接协议丢弃，其它来源不套用该兜底）。
- 测试：`hot-topic-sources.service.spec.ts` 更新为「热榜允许聚合页、账号限定官方域名」；`hot-topic-parsers.spec.ts` 新增聚合榜单表格解析用例。`npx jest hot-topics` 58 项通过，`tsc` 类型校验通过。
- 解析器已使用该 TopHub 页面结构的脱机 HTML 验证，可还原序号、标题、`https://s.weibo.com/weibo?q=…` 链接与热度；实时页能否直采仍取决于来源站访问策略，服务端 HTTP 403 时由后续微博官方回退机制处理。

### 2026-10-23 热点来源新增微博（weiboHot）后端接入
- `server/src/hot-topics/hot-topic.types.ts`：`HotSourceKind` 增加 `weiboHot`；新增共享常量 `PLATFORM_SOURCES`（来源类型 → 官方域名 + 展示名）与 `platformSource` / `platformLabelForHost` / `isHostOf`，避免各服务各自维护域名白名单。
- `server/src/hot-topics/dto/hot-topic.dto.ts`：保存来源 DTO 的 `kind` 校验放行 `weiboHot`（实体 `kind` 为 `varchar(30)`，无需改表）。
- `server/src/hot-topics/hot-topic-sources.service.ts`：`validateSource` 原「抖音专属分支」改为平台通用校验——微博来源必须使用 `weibo.com` 官方域名、且只能用公开页面或 AI 搜索；抖音校验文案与行为保持不变。
- `server/src/hot-topics/hot-topic-fetch.service.ts`：`sourceHost` 按平台白名单返回 `weibo.com`（`s.weibo.com` 等子域同样命中）；页面采集域名校验与 AI 搜索候选的 `platform` 展示名同步支持微博。
- `server/src/hot-topics/hot-topic-parsers.ts`：新增微博热搜结构化解析（`band_list` / `hotgov` / `Events`，字段 `word`、`realpos`、`raw_hot`、`word_scheme`、`note`）；词条无自带原文链接时只生成 `https://s.weibo.com/weibo?q=…` 搜索地址，不臆造原文；名次与热度缺失保持未知；采集入口兜底拒绝非 `weibo.com` 的微博来源。
- `server/src/hot-topics/hot-topic-utils.ts`：`topicUrlHash` 将微博热搜榜 / 汇总页 / 登录页等容器型落地页纳入「URL + 标题」去重。
- 测试：`hot-topic-sources.service.spec.ts` 新增微博来源域名与获取方式校验；`hot-topic-parsers.spec.ts` 新增微博热搜解析与 Domain 兜底用例。`npx jest hot-topics` 57 项全部通过，`tsc` 类型校验通过。
- 配置建议：微博来源建议填写 `https://weibo.com/ajax/statuses/hot_band`（返回未压缩 JSON）；需要登录的动态页面仍会明确失败并提示改用授权 Feed 或 AI 联网。

### 2026-10-22 首页板块隐藏滚动条
- `web/src/views/home/components/DashboardWidgetCard.vue`：卡片内容区滚动条隐藏（`scrollbar-width: none` + `::-webkit-scrollbar` 隐藏 + `-ms-overflow-style`），保留滚轮与触屏滚动能力，列表超出 8 条仍可在卡片内滚动。

### 2026-10-22 移除指标第三行提示并加高图表
- `web/src/views/home/components/DashboardWidgetCard.vue`：彻底移除指标第三行提示（`metric.hint`，如「失败 5 · 取消 0」「启用 50」「有回执 1 / 19 次」）的渲染与相关样式，配置页预览同步生效；每个指标固定为「标签 + 数值」两行。
- 卡片高度 380px → 420px，图表最小高度 160px → 200px，图表展示空间明显增加。
- 后端 `hint` 字段保留（接口契约不变），仅前端不再展示。

### 2026-10-22 首页卡片固定高度与指标提示单行
- `web/src/views/home/components/DashboardWidgetCard.vue`：
  - 卡片统一固定高度 380px（内容区 `.widget-body` 内部滚动、细滚动条），行内卡片完全对齐，不再随条目/图表内容撑高；「核心数据」通栏指标条与配置页预览卡片保持内容自适应。
  - 指标辅助说明（如「文章 10 · 云端素材 15 · ComfyUI 7」）固定单行超出省略，指标项不再出现三行文案。
  - 图表区在卡片剩余空间自适应（组件已有 ResizeObserver，最小 160px，不足时内容区滚动）。
- 「数据暂不可用」空态在固定高度卡片内垂直居中。

### 2026-10-22 首页展示优化（不等高 / 列表上限 8 条 / 业务动态单行 / 配色）
- `web/src/views/home/components/DashboardGrid.vue`：栅格增加 `align-items: start`，卡片按内容自然高度展示，不再同行等高拉伸出大片空白。
- `web/src/views/home/components/DashboardWidgetCard.vue`：移除卡片 `height: 100%`；「最近业务动态」每条改为单行展示（标题 · 详情 · 时间 · 进入，超长省略）；配色优化——卡片标题增加品牌蓝装饰条、可点击指标值改为品牌蓝 `#409EFF`、时间戳用更浅中性灰 `#94a3b8` 拉开层级。
- `server/src/dashboard/dashboard.registry.ts`：新增列表类板块专用 `listLimit` 参数（默认 8、上限 8），最近创作成果 / 待办与异常 / 最近业务动态改用它；图表类（产品与 SKU 分布）保留原 `limit`（上限 10）不受限。
- `server/src/dashboard/dashboard.service.ts`：列表类板块条目数在服务端钳制为最多 8 条，历史已保存的更大配置同样生效。

### 2026-10-22 首页板块支持 4/12 显示宽度
- 修改 `server/src/dashboard/dashboard.registry.ts`：为 8 个原仅支持 `[6, 8, 12]` 的板块（Agent 执行趋势、产品与 SKU 分布、客服 AI 任务趋势、内容与媒体生成趋势、生成任务健康度、最近创作成果、待办与异常、最近业务动态）的 `allowedSpans` 补上 `4`，升级为 `[4, 6, 8, 12]`。
- 「核心数据」为通栏指标条，保持仅 `[12]`；「业务健康概览 / 知识库健康度 / 快捷入口」原本已支持 4/12，不变。
- 前端 `dashboard-config/Edit.vue` 直接以 `definition.allowedSpans` 生成「显示宽度」选项，无需改动。

### 2026-10-22 AI 动作提示词与本地参考媒体链路

- 修复 ComfyUI 工作流已识别"动作描述 / 镜头运动"，但 AI 转换只回填正负提示词的问题；工作流存在 `videoMotion` 或 `cameraMotion` 绑定时，服务端现在会将所需输出写入异步任务快照并要求模型分别返回。
- 结构化提示词协议新增 `videoMotion`、`cameraMotion`，仅对当前工作流实际绑定的字段强制非空；普通生图工作流继续只生成主/正向及可选负向提示词，不增加无关要求。
- 创作表单把动作描述与镜头运动纳入 AI 回填范围；新建任务时清空工作流内置动作示例，再次创作则保留原任务已生成或手工修改的动作内容。
- 创建任务时上传的参考图片与参考视频强制写入服务端本地受管目录，即使全局已启用 OSS/CDN 也不上传远端；执行时从本地读取并上传到目标 ComfyUI `input` 目录，生成结果仍沿用全局存储配置。
- 本地任务输入返回同源 `/uploads/...` 地址供预览和受管文件读取，不暴露浏览器本机路径，也不要求本服务与 ComfyUI 共享磁盘；远程 ComfyUI 继续通过其上传接口接收文件。
- 新增文件（1）：`server/src/uploads/uploads.service.spec.ts`。修改文件（19）：`server/src/comfyui/comfy-files.service.ts`、`server/src/comfyui/comfy-materials.controller.ts`、`server/src/comfyui/comfy-materials.controller.spec.ts`、`server/src/comfyui/comfy-materials.service.ts`、`server/src/comfyui/comfy-materials.service.spec.ts`、`server/src/comfyui/comfy-workflows.service.ts`、`server/src/comfyui/comfy-workflows.service.spec.ts`、`server/src/uploads/uploads.service.ts`、`server/src/visual-prompt-templates/entities/visual-prompt-task.entity.ts`、`server/src/visual-prompt-templates/visual-prompt-templates.service.ts`、`server/src/visual-prompt-templates/visual-prompt-templates.service.spec.ts`、`server/src/visual-prompt-templates/visual-prompt.protocol.ts`、`server/src/visual-prompt-templates/visual-prompt.protocol.spec.ts`、`web/src/api/visualPromptTemplate.ts`、`web/src/views/comfy-create/Index.vue`、`web/src/views/comfy-create/recreateTask.ts`、`web/src/views/comfy-create/recreateTask.test.mjs`、`.design-spec.md`、本文件。删除文件：无。
- 验证：前端创作参数测试 6/6、`npm.cmd run type-check` 与组件复用扫描通过；后端提示词协议 / 工作流 / 素材 / 本地受管存储定向测试 37/37、定向 ESLint 与 TypeORM 实体列检查通过；前后端 `npm.cmd run build` 均通过（前端仅保留既有 Rollup 大分块提示，首次写自动声明文件遇瞬时占用后重试成功）。

### 2026-10-22 改为创建任务时本地上传参考媒体

- 创作任务中的图片、视频参数由素材库下拉选择改为本地上传控件：图片展示本地预览，视频支持点击或拖拽选择，并分别限制图片/视频文件类型与大小。
- 选择文件时仅在浏览器暂存并使用 Blob URL 回显；只有点击"开始生成"才上传为受管任务输入素材，再将素材 ID 写入任务参数，取消弹窗不会产生素材记录。
- 新增 `POST /comfyui/materials/task-input`，按 `ComfyTask.create` 权限接收任务参考文件；素材库上传入口仍保持移除，不要求任务创建者拥有素材库新增权限。
- 再次创作继续回显原任务可用的参考媒体，允许本地替换；原素材失效时提示重新上传。上传成功但任务提交失败时保留已返回的素材 ID，重试不会重复上传。
- 新增文件（1）：`server/src/comfyui/comfy-materials.controller.spec.ts`。修改文件（8）：`server/src/comfyui/comfy-materials.controller.ts`、`web/src/api/comfyUi.ts`、`web/src/views/comfy-create/Index.vue`、`web/src/views/comfy-create/recreateTask.test.mjs`、`web/src/views/comfy-workflow/workflowDetection.ts`、`web/src/views/comfy-workflow/workflowDetection.test.mjs`、`.design-spec.md`、本文件。删除文件：无。
- 验证：前端工作流识别 / 再次创作测试 10/10 通过，`npm.cmd run type-check`、组件复用扫描通过；后端 ComfyUI 定向测试 10/10、定向 ESLint 与 TypeORM 实体列检查通过；前后端 `npm.cmd run build` 均通过（前端仅保留既有 Rollup 大分块提示）。

### 2026-10-22 补齐 Wan Animate 图片、视频与动作参数识别

- ComfyUI API 工作流自动识别新增视频素材绑定；`LoadImage.image` 与 `LoadVideo.file/video/filename` 可同时形成参考图片和动作参考视频字段，不再把视频文件名留在工作流中直接执行。
- `positive_pose`、`motion` 与 `camera motion` 连线分别识别为动作描述或镜头运动；运行快照会清空这些示例文本并在执行时注入用户本次填写内容，避免动作提示词被清空后无法回填。
- 调度器节点现可识别采样步数和降噪，并补充参考图片强度、动作参考强度及动作起止比例；内部缓存、循环和连线参数仍不开放。
- 创作任务按图片/视频类型分别筛选当前用户已有素材，同时允许复用历史生成结果；后端在创建任务和执行注入阶段双重校验素材类型，再通过 ComfyUI 输入文件接口写入对应加载节点。
- 新增文件：无。修改文件（18）：`server/src/comfyui/comfy-client.service.ts`、`server/src/comfyui/comfy-materials.service.ts`、`server/src/comfyui/comfy-materials.service.spec.ts`、`server/src/comfyui/comfy-tasks.service.ts`、`server/src/comfyui/comfy-tasks.service.spec.ts`、`server/src/comfyui/comfy-workflow-sanitizer.ts`、`server/src/comfyui/comfy-workflow-sanitizer.spec.ts`、`server/src/comfyui/dto/comfyui.dto.ts`、`server/src/comfyui/entities/comfy-workflow.entity.ts`、`web/src/api/comfyUi.ts`、`web/src/views/comfy-create/Index.vue`、`web/src/views/comfy-create/recreateTask.ts`、`web/src/views/comfy-create/recreateTask.test.mjs`、`web/src/views/comfy-workflow/Edit.vue`、`web/src/views/comfy-workflow/workflowDetection.ts`、`web/src/views/comfy-workflow/workflowDetection.test.mjs`、`.design-spec.md`、本文件。删除文件：无。
- 验证：使用用户提供的 `video_wan_animate2.json` 实际解析确认 14 个开放/系统参数及节点映射；前端 9 项相关测试、前端类型检查与生产构建、后端 3 个测试套件 12 项测试、TypeORM 实体列检查、后端生产构建、本次 ComfyUI 文件定向 ESLint、页面组件复用扫描及 `git diff --check` 通过。后端全量 lint 仍被非本次模块的既有规则错误阻断；未启动或重启服务，未向 ComfyUI 提交真实生成任务。

### 2026-10-22 优化视频素材预览并移除页面上传入口

- 视频产物不再显示纯文字块，列表通过静音、非自动播放的 metadata 请求尝试提取首帧，并叠加统一播放图标；无法读取首帧时仍保留视频专属视觉，点击后才打开视频。
- 普通文件改用文件图标；图片的任务组预览、遮罩大图和剩余数量保持不变。
- 素材库移除"上传输入素材"按钮、上传弹窗及相关前端状态和调用；后端上传接口暂时保留，避免破坏既有集成或其它受控业务调用。
- 新增文件：无。修改文件（4）：`web/src/views/comfy-material/Index.vue`、`web/src/views/comfy-material/materialGroup.test.mjs`、`.design-spec.md`、本文件。删除文件：无。
- 验证：3 项素材组界面契约测试、前端类型检查、生产构建、页面组件复用扫描及 `git diff --check` 通过；未启动或重启服务，未加载真实视频或调用外部服务。

### 2026-10-22 合并展示同一任务的多个产出素材

- 素材库列表分页单位由单个文件调整为素材组：上传素材仍独立成行，生成结果按 `sourceTaskId` 合并，同一任务只占一条数据；总数和翻页均按组计算，避免前端合并造成分页不准。
- 一行最多直接展示 4 个缩略图及剩余数量，点击任一图片可继续预览该任务的全部图片；素材名称、大小、媒体类型、收藏状态和创建时间按组汇总展示。
- 单删、批量删除和收藏均展开为组内全部素材，并在服务端校验用户归属；底层素材记录和受管文件仍各自独立，不执行数据库迁移或物理文件拼接。
- 新增文件（2）：`server/src/comfyui/comfy-materials.service.spec.ts`、`web/src/views/comfy-material/materialGroup.test.mjs`。修改文件（7）：`server/src/comfyui/comfy-materials.service.ts`、`server/src/comfyui/comfy-materials.controller.ts`、`server/src/comfyui/dto/comfyui.dto.ts`、`web/src/api/comfyUi.ts`、`web/src/views/comfy-material/Index.vue`、`.design-spec.md`、本文件。删除文件：无。
- 验证：后端 4 项分组/分页/归属测试、前端 2 项组展示与操作契约测试、后端定向 ESLint 与实体检查、前端类型检查、前后端生产构建、前端组件复用扫描及 `git diff --check` 通过；未启动或重启服务，未调用真实 ComfyUI。全量后端 `tsc --noEmit` 仍受既有无关测试类型错误影响，本次涉及文件未新增编译错误。

### 2026-10-22 支持已完成创作任务调整后再次创作

- "创作任务"列表为已完成任务增加"再次创作"入口；点击后按需读取任务详情，将原工作流的参数快照带入统一的新建创作弹窗，用户可编辑提示词和其它开放参数后再明确提交。
- 再次创作通过既有创建接口生成全新任务，不覆盖原任务、原参数或原生成结果；失败任务既有"重新执行"语义保持不变。
- 仅带入当前工作流仍开放的参数；原工作流已停用时阻止操作，原图片素材不存在时自动清空对应字段并提示重新选择。
- 新增文件（2）：`web/src/views/comfy-create/recreateTask.ts`、`web/src/views/comfy-create/recreateTask.test.mjs`。修改文件（4）：`web/src/views/comfy-create/Index.vue`、`web/src/views/comfy-task/TaskTable.vue`、`.design-spec.md`、本文件。删除文件：无。
- 验证：4 项参数回填与入口回归、Vue 类型检查、前端生产构建、前端变更文件 Prettier、页面组件复用扫描及 `git diff --check` 通过；未启动或重启服务，未调用真实 ComfyUI。

### 2026-10-22 修复提示词总结多任务状态互相覆盖

- 现象与原因："提示词总结"列表仅使用单个 `extractingId` 保存 loading 行；点击另一条会覆盖前一条显示状态，且任一任务结束都会把该单值清空，因此视觉上像前一任务被中断。后端实际按模板接收任务并串行排队，没有因第二次点击取消第一条。
- 修复：改为按总结 ID 保存独立任务状态，分别显示"提交中 / 排队中 / 提炼中"；每条任务独立轮询，完成或失败仅清理自身状态。加入运行标识校验，迟到的旧任务不能覆盖或清除同一行的新状态。
- 交互：AI 提炼确认复用公共 `Button` 的确认与异步并发保护；运行按钮仅显示短状态，完整服务端阶段通过原生提示保留。不同记录仍可继续点击提交，同一记录活动期间禁止重复提交。
- 后端与契约：不修改接口、数据库或任务状态字段，继续使用既有 `pending/running/succeeded/failed/interrupted`；单服务实例仍串行消费，后提交任务在 UI 中如实显示排队。
- 新增文件（2）：`web/src/views/visual-prompt-template/extractionState.ts`、`web/src/views/visual-prompt-template/extractionState.test.mjs`。修改文件（3）：`web/src/views/visual-prompt-template/Index.vue`、`.design-spec.md`、本文件。删除文件：无。
- 验证：4 项多任务与迟到状态回归、Vue 类型检查、变更文件 Prettier、页面组件复用扫描、测试文件语法检查及 `git diff --check` 通过。按修复类改动规则未 build、未启动或重启服务，也未调用真实 AI。

### 2026-10-22 修正 ComfyUI 素材图片预览

- 素材库管理中的图片缩略图不再通过文件链接打开新窗口或触发下载，改为当前页面遮罩式大图预览。
- 大图预览支持缩放、关闭按钮、点击遮罩和 `ESC` 关闭；列表仍保持 44×44px 缩略图，视频与普通文件继续使用独立打开方式。
- 验证：前端 `vue-tsc` 和素材列表组件复用检查通过。按缺陷修复范围未执行 build 或启动服务。

新增文件（0）。

修改文件（3）：

- `.design-spec.md`
- `CHANGELOG.md`
- `web/src/views/comfy-material/Index.vue`

删除文件（0）。

### 2026-10-22 明确 Comfy Cloud 订阅限制失败原因

- 官方 Comfy Cloud 返回 HTTP 403 时，失败原因明确说明 API 调用仅对付费订阅账户开放；免费账户只能在网页编辑器中运行，单独充值额度不能解锁 API，必须开通付费订阅。错误仍保留请求方法、接口路径和脱敏后的供应商摘要，便于进一步排查。
- ComfyUI 创作任务列表将"当前阶段"扩展为"阶段 / 失败原因"：失败行直接显示红色错误摘要，保持单行省略并可悬浮查看全文，不再只显示笼统的"执行失败"。历史 Comfy Cloud HTTP 403 记录会在前端补充同一订阅说明，无需修改旧数据。
- 验证：后端定向 ESLint、TypeORM 实体列检查及 ComfyUI 客户端 1 suite / 5 tests 通过；前端 `vue-tsc` 和任务列表组件复用检查通过。按缺陷修复范围未执行 build 或启动服务。

新增文件（0）。

修改文件（5）：

- `.design-spec.md`
- `CHANGELOG.md`
- `server/src/comfyui/comfy-client.service.spec.ts`
- `server/src/comfyui/comfy-client.service.ts`
- `web/src/views/comfy-task/TaskTable.vue`

删除文件（0）。

### 2026-10-22 原任务重试与提示词提炼状态修正

- ComfyUI 失败任务的"重新执行"改为原任务原地重置：任务 ID 和已保存运行快照保持不变，状态原子切回等待执行，清空旧 `promptId`、错误、进度、执行时间及旧输出关联，不再新增任务行。
- 重试继续只允许 `failed` 状态；服务停用或并发导致状态已变化时明确拒绝，成功、取消、运行中和待核实任务仍不允许重投。
- 提示词总结列表直接返回真实 `extractedAt` 判断是否完成过 AI 提炼，不再因历史结果缺少后来新增的提示词规则字段而错误显示"待 AI 提炼"；创作转换仍仅在提炼字段完整时使用总结结果，否则安全回退工作流原始提示词。
- 行内"AI 提炼"按钮加载时固定显示 loading 图标和"提炼中"，不再把后台阶段长文案放入操作列造成换行；列表查询同步移除不再参与状态判断的长文本字段。
- 验证：后端定向 ESLint、TypeORM 实体列检查及 ComfyUI/提示词总结 5 suites / 35 tests 通过；前端 `vue-tsc` 和两个列表页面的组件复用检查通过。按缺陷修复范围未执行 build 或启动服务。

新增文件（0）。

修改文件（11）：

- `.design-spec.md`
- `CHANGELOG.md`
- `server/src/comfyui/comfy-tasks.controller.ts`
- `server/src/comfyui/comfy-tasks.service.spec.ts`
- `server/src/comfyui/comfy-tasks.service.ts`
- `server/src/comfyui/dto/comfyui.dto.ts`
- `server/src/visual-prompt-templates/visual-prompt-templates.service.spec.ts`
- `server/src/visual-prompt-templates/visual-prompt-templates.service.ts`
- `web/src/api/comfyUi.ts`
- `web/src/views/comfy-task/TaskTable.vue`
- `web/src/views/visual-prompt-template/Index.vue`

删除文件（0）。

### 2026-10-22 支持失败的 ComfyUI 任务重新执行

- 创作任务列表为失败记录新增"重新执行"操作；操作前明确提示可能再次生成，提交期间锁定按钮，成功后显示新任务编号并刷新列表。
- 新增 `POST /api/comfyui/tasks/:id/retry`：仅允许任务所有者重试 `failed` 状态，复用 `ComfyTask.create` 权限，并使用原任务保存的工作流版本、参数、绑定及服务关联创建新的排队任务；原失败任务、错误原因和历史输出保持不变。
- 新任务清空旧 `promptId`、输出关联、进度和执行时间，并使用独立 `requestId` 保证前端重复点击或同一次网络请求重放时不会重复建任务；原服务停用时明确拒绝。
- 成功、取消、运行中和状态待核实任务均不开放重试，避免对可能已被供应商受理的未知任务重复生成或计费。
- 验证：后端定向 ESLint、TypeORM 实体列检查及 ComfyUI 客户端/连接/任务 3 suites / 13 tests 通过；前端 `vue-tsc` 和任务列表组件复用检查通过。按缺陷补全范围未执行 build 或启动服务。

新增文件（0）。

修改文件（8）：

- `.design-spec.md`
- `CHANGELOG.md`
- `server/src/comfyui/comfy-tasks.controller.ts`
- `server/src/comfyui/comfy-tasks.service.spec.ts`
- `server/src/comfyui/comfy-tasks.service.ts`
- `server/src/comfyui/dto/comfyui.dto.ts`
- `web/src/api/comfyUi.ts`
- `web/src/views/comfy-task/TaskTable.vue`

删除文件（0）。

### 2026-10-22 修正 Comfy Cloud 任务接口与 403 诊断

- 按官方常用接口重新对齐云端任务链路：提交仍使用 `POST /api/prompt` 且请求体只发送 `prompt`；状态继续查询 `GET /api/job/{prompt_id}/status`，终态输出改为官方兼容的 `GET /api/history/{prompt_id}`，移除未公开且会触发 403 的 `/api/jobs/{prompt_id}` 请求。
- 云端历史响应同时兼容以 `prompt_id` 为键和直接详情两种结构，并补充 `success/succeeded/failed/running` 状态别名，继续映射为系统现有排队、运行、成功和失败状态。
- 401/402/403/429 及普通请求错误现在包含请求方法、API 路径和脱敏截断后的供应商错误摘要，避免把错误接口路径统一误报为"API Key 无权限"；密钥不会进入错误信息。
- 验证：后端定向 ESLint、TypeORM 实体列检查及 ComfyUI 客户端/连接/任务 3 suites / 11 tests 通过；按缺陷修复范围未执行 build 或启动服务，也未使用用户密钥连接真实云端环境。

新增文件（0）。

修改文件（4）：

- `.design-spec.md`
- `CHANGELOG.md`
- `server/src/comfyui/comfy-client.service.spec.ts`
- `server/src/comfyui/comfy-client.service.ts`

删除文件（0）。

### 2026-10-22 支持 ComfyUI 普通主提示词工作流

- 提示词语义新增"主提示词"：工作流可使用主提示词或正向提示词之一，负向提示词改为可选；创作任务会把 AI 返回的主结果回填到实际绑定字段，不再要求所有模型都具备正向、负向两套提示词。
- 工作流识别支持沿通用 `prompt` 连线回溯当前生效的开关分支，空负向输入不再生成负向绑定；明确排除 `system_prompt` 和系统提示词节点，避免把模型改写指令误当作用户提示词。
- 后端对已保存的旧工作流动态补全或迁移主提示词绑定，无需数据库迁移；提示词总结、创作选项和版本运行快照均兼容旧数据。任务快照只清理实际映射的主/正向/负向输入，保留系统提示词和其它工作流指令。
- 提示词总结协议和界面统一采用"主提示词 + 可选负向提示词"表述，内部历史字段保持兼容；使用用户提供的 `千文生图.json` 实测识别为 `459:474.on_false` 主提示词、无负向提示词。
- 验证：前端工作流识别 4 tests、`vue-tsc` 和涉及页面组件复用检查通过；后端 TypeORM 实体列检查、定向 ESLint 及 ComfyUI/提示词总结 5 suites / 31 tests 通过。后端全量 `tsc --noEmit` 仍被仓库既有的 Agent、素材、菜单等无关测试类型错误阻断；按缺陷修复范围未执行 build 或启动服务。

新增文件（0）。

修改文件（18）：

- `.design-spec.md`
- `CHANGELOG.md`
- `server/src/comfyui/comfy-workflow-sanitizer.spec.ts`
- `server/src/comfyui/comfy-workflow-sanitizer.ts`
- `server/src/comfyui/comfy-workflows.service.spec.ts`
- `server/src/comfyui/comfy-workflows.service.ts`
- `server/src/comfyui/dto/comfyui.dto.ts`
- `server/src/comfyui/entities/comfy-workflow.entity.ts`
- `server/src/visual-prompt-templates/visual-prompt-templates.service.ts`
- `server/src/visual-prompt-templates/visual-prompt.protocol.ts`
- `web/src/api/comfyUi.ts`
- `web/src/views/comfy-create/Index.vue`
- `web/src/views/comfy-workflow/Edit.vue`
- `web/src/views/comfy-workflow/workflowDetection.test.mjs`
- `web/src/views/comfy-workflow/workflowDetection.ts`
- `web/src/views/visual-prompt-template/Edit.vue`
- `web/src/views/visual-prompt-template/Index.vue`
- `web/src/views/visual-prompt-template/View.vue`

删除文件（0）。

### 2026-10-22 接入官方 Comfy Cloud API 协议

- 修复 `https://cloud.comfy.org` 连接测试返回 HTML 后被误报为"无法解析的数据"：官方云端地址现自动映射 `/api`，使用 `X-API-Key` 校验当前用户；新增独立 `apiKey` 认证类型，已有官方云端 Bearer 配置在请求层继续兼容并按 API Key 发送。
- 打通云端创作完整链路：工作流提交仍使用兼容的 `/api/prompt`，任务轮询改用云端 Job 状态与详情接口并映射为系统现有队列状态；输入素材上传自动走云端 `/api/upload/image`。
- 兼容云端产物下载的 302 签名地址，并确保第二跳不携带 `X-API-Key`，避免凭据泄漏；401、402、403、429 分别返回密钥失效、额度不足、权限不足和套餐限制等明确原因，非 JSON 响应会提示检查 API 根地址及响应类型。
- 服务配置表单补充"Comfy Cloud API Key"认证选项和官方地址说明；官方地址统一规范化为 `https://cloud.comfy.org`，仍保留本机及其他远程自托管 ComfyUI 的原认证与接口行为。
- 验证：后端相关文件定向 ESLint、TypeORM 实体列检查及 ComfyUI 客户端/连接/任务 3 suites / 10 tests 通过；前端 `vue-tsc` 与服务配置页面组件复用检查通过。按缺陷修复范围未执行 build、启动服务或使用用户密钥连接真实云端环境。

新增文件（1）：

- `server/src/comfyui/comfy-client.service.spec.ts`

修改文件（11）：

- `.design-spec.md`
- `CHANGELOG.md`
- `server/src/comfyui/comfy-client.service.ts`
- `server/src/comfyui/comfy-connections.service.spec.ts`
- `server/src/comfyui/comfy-connections.service.ts`
- `server/src/comfyui/comfy-tasks.service.ts`
- `server/src/comfyui/dto/comfyui.dto.ts`
- `server/src/comfyui/entities/comfy-connection.entity.ts`
- `web/src/api/comfyUi.ts`
- `web/src/views/comfy-connection/Edit.vue`
- `web/src/views/comfy-connection/Index.vue`

删除文件（0）。

### 2026-10-22 允许配置云端 ComfyUI 服务

- 修复 ComfyUI 服务地址被无条件套用同机白名单的问题：本机、Docker 宿主机及私有网地址继续支持 HTTP/HTTPS，公网或云端服务现可使用 HTTPS 地址保存，`https://cloud.comfy.org` 不再被误拦截。
- 保留地址安全边界：继续拒绝非 HTTP/HTTPS 协议、畸形 URL 和 URL 内嵌账号密码；公网明文 HTTP 会返回"公网 ComfyUI 服务地址必须使用 HTTPS"，Basic/Bearer 凭据仍由独立密钥字段保存。
- 服务配置表单同步补充本机和云端地址示例及认证提示；未新增连接类型或数据库字段，现有接口字段与本机配置保持兼容。
- 验证：后端相关文件 ESLint、TypeORM 实体列检查及服务配置 1 suite / 4 tests 通过；前端 `vue-tsc` 与服务配置页面组件复用检查通过。按缺陷修复范围未执行 build、启动服务或连接真实云端环境。

新增文件（0）。

修改文件（5）：

- `.design-spec.md`
- `CHANGELOG.md`
- `server/src/comfyui/comfy-connections.service.spec.ts`
- `server/src/comfyui/comfy-connections.service.ts`
- `web/src/views/comfy-connection/Edit.vue`

删除文件（0）。

### 2026-10-22 兼容 ComfyUI 子图层级节点 ID

- 修复 API 工作流格式误判：后端节点校验从仅接受纯数字 ID 调整为同时接受 ComfyUI 子图生成的冒号分隔层级 ID（如 `459:451`、`459:457:2`），不改写节点 ID、连线引用、参数映射或输出节点。
- 继续拒绝界面工作流结构及任意文本、空层级、模型字符和路径分隔符节点 ID，保留节点数量、`class_type`、`inputs`、参数白名单和输出节点存在性校验。
- 实际核对 `千文生图.json`：15 个 API 节点中 13 个为层级节点 ID，所有节点结构与连线引用有效；修复后可按原 JSON 保存，无需手工转换。
- 验证：后端相关文件 ESLint、TypeORM 实体列检查及工作流解析/提示词清理/任务快照 3 suites / 18 tests 通过。按缺陷修复范围未执行 build 或启动服务。

新增文件（0）。

修改文件（4）：

- `.design-spec.md`
- `CHANGELOG.md`
- `server/src/comfyui/comfy-workflows.service.spec.ts`
- `server/src/comfyui/comfy-workflows.service.ts`

删除文件（0）。

### 2026-10-22 修复提示词规则为空仍判定提炼成功

- 收紧提示词总结协议：正向提示词格式、风格摘要和提示词规则均为 AI 提炼成功的必要结果，任一为空时任务明确失败并保留旧结果，不再出现"已提炼但规则为空"。
- 强化提炼指令：目标模型规则可以确认时保留专用语法；仅有自定义模型文件名时不得编造官方能力，必须根据工作流原提示词归纳语言、分隔方式、标签顺序和结构，并明确标记为示例推断。
- 历史不完整记录在列表中重新显示为"待 AI 提炼"；创作转换不会使用缺少提示词规则的半成品，而是安全回退到工作流原始正向、负向提示词。界面"模型规则"统一更名为"提示词规则"，内部 `modelRules` 字段保持兼容，无数据库迁移。
- 验证：后端相关文件 ESLint、TypeORM 实体列检查及提示词协议/服务 2 suites / 10 tests 通过；前端 `vue-tsc` 与提示词总结组件复用检查通过。按缺陷修复范围未执行 build 或启动服务。

新增文件（0）。

修改文件（8）：

- `.design-spec.md`
- `CHANGELOG.md`
- `server/src/visual-prompt-templates/visual-prompt-templates.service.spec.ts`
- `server/src/visual-prompt-templates/visual-prompt-templates.service.ts`
- `server/src/visual-prompt-templates/visual-prompt.protocol.spec.ts`
- `server/src/visual-prompt-templates/visual-prompt.protocol.ts`
- `web/src/views/visual-prompt-template/Index.vue`
- `web/src/views/visual-prompt-template/View.vue`

删除文件（0）。

### 2026-10-22 统一双列表单提示文案场景的顶部对齐

- 修复公共 `Form` 双列栅格的纵向拉伸问题：同排字段统一从顶部对齐，带提示文案的字段只向下扩展当前栅格行，不再把无提示字段的输入控件垂直居中或下移。
- 同步组件契约与设计规范，明确禁止业务页面通过空提示、空白字符或局部 margin 人工补位；单列表单、跨整行字段和窄屏单列布局保持原行为。
- 验证：前端 `vue-tsc` 类型检查通过；公共 Form 与提示词总结页面组件复用线索检查通过。按 UI 修复范围未执行 build 或启动服务。

新增文件（0）。

修改文件（4）：

- `.design-spec.md`
- `AGENTS-COMPONENTS.md`
- `CHANGELOG.md`
- `web/src/components/Form.vue`

删除文件（0）。

### 2026-10-22 保留 ComfyUI 原始提示词并按工作流 AI 提炼

- 调整工作流持久化边界：新导入或重新保存的 API 工作流及版本快照完整保留正向、负向提示词；创建创作任务时才复制到独立运行快照、清空工作流原始提示词并注入本次用户确认的提示词，避免污染模板和误用导入正文。
- "提示词总结"改为从已导入工作流中选择来源，后端按节点语义映射自动识别媒体类型、目标模型、正向提示词和负向提示词；界面不再要求人工填写 Demo 类字段，并统一移除相关 Demo 文案。
- 保存提示词总结时由后端重新读取工作流原始 JSON、创建或更新总结记录并绑定工作流，随后立即提交异步 AI 任务提炼提示词风格、格式、模型规则和变量；AI 失败时保留工作流原文及此前成功结果，可直接重新提炼。
- 提示词总结新增工作流候选项和自动识别草稿接口；创建、更新总结因会修改工作流绑定关系，额外要求 `ComfyWorkflow.update` 权限。既有已被旧逻辑清空的工作流无法自动还原原始提示词，需重新导入原始 API JSON。
- 验证：后端变更文件 ESLint 通过；工作流保留/任务快照清理/按工作流创建总结等 5 suites / 19 tests 通过；前端 `vue-tsc` 与组件复用检查通过；TypeORM 实体列检查、NestJS build 和 Vite 生产构建通过。

新增文件（1）：

- `server/src/comfyui/comfy-tasks.service.spec.ts`

修改文件（17）：

- `.design-spec.md`
- `CHANGELOG.md`
- `server/src/comfyui/comfy-workflows.controller.ts`
- `server/src/comfyui/comfy-workflows.service.spec.ts`
- `server/src/comfyui/comfy-workflows.service.ts`
- `server/src/visual-prompt-templates/dto/visual-prompt-template.dto.ts`
- `server/src/visual-prompt-templates/visual-prompt-templates.controller.ts`
- `server/src/visual-prompt-templates/visual-prompt-templates.service.spec.ts`
- `server/src/visual-prompt-templates/visual-prompt-templates.service.ts`
- `server/src/visual-prompt-templates/visual-prompt.protocol.ts`
- `web/src/api/comfyUi.ts`
- `web/src/api/visualPromptTemplate.ts`
- `web/src/views/ai-feature-config/Edit.vue`
- `web/src/views/comfy-create/Index.vue`
- `web/src/views/comfy-workflow/Edit.vue`
- `web/src/views/visual-prompt-template/Edit.vue`
- `web/src/views/visual-prompt-template/Index.vue`

删除文件（0）。

### 2026-10-22 明确 ComfyUI 提示词总结链路与模块命名

- 核对并明确完整链路：导入 API 工作流时先从正向/负向节点提取 Demo，再清空工作流及版本快照中的示例正文并绑定总结记录；用户明确执行"AI 提炼"后，系统异步生成提示词格式、风格摘要和模型规则；创作任务再将用户原始想法交给绑定的 `visualPrompt` 配置转换，回填正向/负向参数，用户确认后才提交 ComfyUI 队列并按白名单节点映射注入。
- 保持导入工作流不自动调用可能计费的 AI：未执行提炼时，创作转换以导入 Demo 作为参考格式；提示词总结列表新增"总结状态"，明确区分"Demo 待提炼"和"已 AI 提炼"，并修正工作流导入、创作弹窗中的误导文案。
- 将 ComfyUI 下的"模型提示词规范"统一更名为"提示词总结"，同步菜单种子、既有菜单启动校准、路由标题、AI 功能类型显示、列表、编辑/查看弹窗、后端错误提示及设计规范；内部路由、权限码、数据表和接口字段保持兼容，不做破坏性改名。
- 验证：后端变更文件 ESLint 通过；菜单、工作流 Demo 清理与绑定、提示词异步提炼/转换协议共 5 suites / 22 tests 通过；前端 `vue-tsc` 与组件复用线索检查通过。按修复与文案调整范围未执行 build 或启动服务。

新增文件（0）。

修改文件（16）：

- `.design-spec.md`
- `CHANGELOG.md`
- `server/src/ai-feature-configs/ai-feature-configs.service.ts`
- `server/src/comfyui/comfy-workflows.service.ts`
- `server/src/menus/menus.service.spec.ts`
- `server/src/menus/menus.service.ts`
- `server/src/visual-prompt-templates/visual-prompt-templates.service.ts`
- `web/src/router/index.ts`
- `web/src/views/ai-feature-config/Edit.vue`
- `web/src/views/ai-feature-config/Index.vue`
- `web/src/views/comfy-create/Index.vue`
- `web/src/views/comfy-workflow/Edit.vue`
- `web/src/views/comfy-workflow/Index.vue`
- `web/src/views/visual-prompt-template/Edit.vue`
- `web/src/views/visual-prompt-template/Index.vue`
- `web/src/views/visual-prompt-template/View.vue`

删除文件（0）。

### 2026-10-21 统一详情表格字段标签布局

- 新增可复用的描述表格标签样式，为字段标签列设置统一宽度并禁止换行；"查看素材"和"查看模板"统一使用，修复"生成模式、生成配置、模板名称、写作要求"等标签被拆分的问题。
- 提示词、写作要求和其它内容列继续保留正常换行，不增加弹窗横向滚动。
- 验证：前端 `vue-tsc` 与组件复用线索检查通过。

新增文件（0）。

修改文件（5）：

- `.design-spec.md`
- `CHANGELOG.md`
- `web/src/styles/utilities.scss`
- `web/src/views/ai-material/View.vue`
- `web/src/views/content-template/View.vue`

删除文件（0）。

### 2026-10-21 支持 AI 素材连续排队与工作流模型筛选

- 修正 AI 素材任务锁的生命周期：任务提交为 `pending` 时只占用素材锁，后台从队列原子领取为 `running` 时才占用用户执行锁；同一用户可以连续提交多个不同素材，并保持同一用户同一时刻只执行一个任务。
- 调度器按任务 ID 先进先出地选择当前用户没有运行任务的最早待执行记录；多服务实例并发领取时继续由数据库唯一锁裁决，竞争失败等待下一轮，不重复请求可能计费的供应商。原有租约、超时恢复、结果落盘和失败保留旧素材策略不变。
- 同一素材已有排队或生成任务时仍拒绝重复提交，错误文案明确到素材维度；相同请求号并发提交继续按幂等请求返回已有任务。前端提交成功提示调整为"已加入生成队列"。
- 工作流管理将"目标模型"移至操作列后的首个业务列，并新增独立目标模型搜索条件；后端按 `targetModel` 执行去空格后的模糊查询。
- 验证：后端相关文件 ESLint、完整 77 suites / 663 tests、TypeORM 实体列检查及 NestJS build 通过；前端 `vue-tsc`、组件复用线索检查及 Vite 生产构建通过。

新增文件（1）：

- `server/src/ai-materials/ai-materials.service.spec.ts`

修改文件（8）：

- `.design-spec.md`
- `CHANGELOG.md`
- `server/src/ai-materials/ai-materials.service.ts`
- `server/src/comfyui/comfy-workflows.service.spec.ts`
- `server/src/comfyui/comfy-workflows.service.ts`
- `server/src/comfyui/dto/comfyui.dto.ts`
- `web/src/views/ai-material/Index.vue`
- `web/src/views/comfy-workflow/Index.vue`

删除文件（0）。

### 2026-10-21 修复视频生成接口路径与异步协议报错

- 定位到当前视频账号配置将官方路径 `/api/v1/services/aigc/video-generation/video-synthesis` 错写为 `/api/v1/services/aigcvideo-generation/video-synthesis`；媒体目标解析和配置回显现会兼容修正这一处确定性历史拼写，重启后原配置即可使用，重新保存时写回规范地址。
- 视频端点校验由宽泛的"包含 `/services/`"收紧为官方 `video-synthesis` 完整路径，避免把生图、多模态或其它服务地址误当作视频异步接口；任务查询地址继续从同地域 `/api/v1/tasks/{taskId}` 生成。
- `current user api does not support asynchronous calls` 不再归类为普通鉴权失败，而是明确提示检查视频路径以及模型、API Key、Workspace 地域一致性。Wan 3.0 官方 HTTP 接口只支持异步调用，因此系统不会错误移除异步请求头，也不会自动重复可能计费的任务。
- 验证：视频媒体目标与生成错误定向测试 2 suites / 17 tests 通过，TypeORM 实体列检查通过。

新增文件（0）。

修改文件（6）：

- `.design-spec.md`
- `CHANGELOG.md`
- `server/src/ai-materials/material-generation-error.spec.ts`
- `server/src/ai-materials/material-generation-error.ts`
- `server/src/knowledge-ai-providers/knowledge-ai-media-target.spec.ts`
- `server/src/knowledge-ai-providers/knowledge-ai-providers.service.ts`

删除文件（0）。

### 2026-10-21 接入 Wan 3.0 多参考素材生视频协议

- 保留原有文生视频与 `first_frame` 单首帧链路，并将界面名称明确为"首帧生视频"；新增独立"多参考生视频"模式，按用户排列顺序向 DashScope 提交 `reference_image` / `reference_video`，不混用两类协议。
- 素材编辑页可维护最多 10 张参考图、5 个参考视频的公开 HTTPS 地址，提示参考视频总时长不超过 15 秒；提示词可按"图1、视频1"等序号引用素材。列表与详情同步展示新模式，详情仅按需回显参考素材，列表只返回引用数量而不暴露完整 URL。
- 后端新增参考素材 DTO、实体 JSON 字段、生产迁移与任务快照；创建、编辑、提交和供应商请求均校验模式、配置能力、素材数量及 HTTPS 地址，异步轮询、15 分钟执行上限、结果下载和受管 MP4 保存策略保持不变。未接入 PPTX、文档、网页和音频参考。
- AI 视频配置中的能力名称调整为"参考素材生视频"，同时控制首帧与多参考两种模式；视频模型账号说明同步覆盖文生、首帧和多参考素材场景。
- 修复首帧视频参考图虽允许上传 20MB、任务读取却仍按 5MB 拒绝的问题；受管文件读取上限现按图生图 5MB、首帧生视频 20MB 分别执行。
- 验证：后端完整 76 suites / 657 tests、TypeORM 实体列检查和 NestJS build 通过；前端 `vue-tsc`、4 项素材协议/模板测试、组件复用线索检查及 Vite 生产构建通过。

新增文件（1）：

- `server/src/migrations/1793174400000-AddReferenceVideoMaterials.ts`

修改文件（20）：

- `.design-spec.md`
- `CHANGELOG.md`
- `server/src/ai-feature-configs/ai-feature-configs.service.ts`
- `server/src/ai-feature-configs/entities/ai-feature-config.entity.ts`
- `server/src/ai-materials/ai-material.constants.ts`
- `server/src/ai-materials/ai-materials.service.ts`
- `server/src/ai-materials/dto/ai-material.dto.spec.ts`
- `server/src/ai-materials/dto/ai-material.dto.ts`
- `server/src/ai-materials/entities/ai-material.entity.ts`
- `server/src/ai-materials/entities/material-generation-task.entity.ts`
- `server/src/common/ai/video-generation.spec.ts`
- `server/src/common/ai/video-generation.ts`
- `server/src/managed-files/managed-files.service.ts`
- `web/src/api/aiMaterial.ts`
- `web/src/views/ai-feature-config/Edit.vue`
- `web/src/views/ai-material/Edit.vue`
- `web/src/views/ai-material/Index.vue`
- `web/src/views/ai-material/View.vue`
- `web/src/views/ai-material/aiMaterial.test.mjs`
- `web/src/views/knowledge-ai-provider/Edit.vue`

删除文件（0）。

### 2026-10-21 对齐 Wan 3.0 视频生成参数与错误回执

- 保持现有 DashScope 异步 `video-synthesis`、`first_frame` 和任务轮询协议，未增加 PPTX、文档、网页、音频或多参考素材入口；视频比例新增 `21:9`，时长扩展为智能时长 `-1` 或 2～30 秒，新建素材默认使用 `adaptive` 画幅。
- 视频提示词允许录入至 20000 字符并在供应商请求边界截断；视频首帧参考图上限提升至 20MB，图生图继续保持 5MB，上传拦截与服务端内容校验保持双重限制。
- 供应商非成功响应最多读取 64KB JSON，只保存经过密钥、URL、换行脱敏和长度限制的错误码/错误说明；原有 HTTP 状态分类、15 分钟视频执行上限和不自动重试策略不变。
- 素材编辑页同步增加超宽画幅、智能时长及 2～30 秒选项，首帧模式提示使用自适应画幅；详情页将 `-1` 显示为"智能时长"，不再显示为负秒数。
- 验证：后端 5 suites / 31 tests、TypeORM 实体检查、生产 TypeScript 检查及 NestJS build 通过；前端 3 项素材协议/模板测试与 `vue-tsc` 通过，主要协议与表单改动完成后 Vite 生产构建通过；补充详情文案后的重复构建因运行中的自动声明插件占用 `components.d.ts` 中断，未修改该生成文件。

新增文件（2）：

- `server/src/ai-materials/dto/ai-material.dto.spec.ts`
- `web/src/views/ai-material/aiMaterial.test.mjs`

修改文件（15）：

- `.design-spec.md`
- `CHANGELOG.md`
- `server/src/ai-materials/ai-material.constants.spec.ts`
- `server/src/ai-materials/ai-material.constants.ts`
- `server/src/ai-materials/ai-materials.controller.ts`
- `server/src/ai-materials/ai-materials.service.ts`
- `server/src/ai-materials/dto/ai-material.dto.ts`
- `server/src/ai-materials/material-generation-error.spec.ts`
- `server/src/ai-materials/material-generation-error.ts`
- `server/src/common/ai/image-utils.ts`
- `server/src/common/ai/video-generation.spec.ts`
- `server/src/common/ai/video-generation.ts`
- `web/src/api/aiMaterial.ts`
- `web/src/views/ai-material/Edit.vue`
- `web/src/views/ai-material/View.vue`

删除文件：无。

### 2026-10-21 修正热点行内操作图标语义

- 热点列表"忽略/恢复"操作改为仅图标展示，分别使用隐藏与恢复图标；补充悬停标题和 `aria-label`，在保持单行紧凑排列的同时避免无文字按钮语义不清。
- 修正原按钮因复用 `HotTopic.update` 权限而自动显示编辑铅笔的误导表现，操作列宽度由 200px 收紧至 180px。
- 验证：热点页面 11 项模板与交互测试、前端 `vue-tsc` 静态检查通过。

新增文件：无。

修改文件（3）：

- `CHANGELOG.md`
- `web/src/views/hot-topic/Index.vue`
- `web/src/views/hot-topic/hotTopic.test.mjs`

删除文件：无。

### 2026-10-21 修复热点偏好布尔契约并精简选题操作

- 修复 `PUT /api/hot-topics/preferences` 报 `scheduleEnabled must be a boolean value`：MySQL `tinyint` 实际读取为 `0/1`，热点实体布尔列改用 TypeORM `boolean` 元数据，接口读取稳定返回原生布尔值；偏好与来源表单在载入和提交时再次规范为 boolean。
- 热点 DTO 对 `true/false`、`0/1` 及对应字符串做严格白名单转换，无法识别的值仍由 `@IsBoolean()` 拒绝；同一规则覆盖每日计划、来源启用、清除密钥和创建后生成，避免相同问题在关联表单复现。
- 移除热点选题收藏功能及 `saved` 状态，列表筛选、操作按钮、前后端类型、DTO 与推荐候选查询保持一致；新增迁移将历史收藏恢复为"未处理"，当前数据库没有历史收藏需要转换。
- 热点列表操作列由 260px 收紧至 200px，仅保留查看、选取创作和忽略/恢复；Table 操作列增加稳定类名，热点页明确禁止操作内容换行。
- 验证：后端相关 3 suites / 22 tests、TypeORM 实体列检查和生产 TypeScript 静态检查通过；前端热点 11 项交互/模板测试及 `vue-tsc` 通过；真实仓储读取 `scheduleEnabled` 已为 boolean。

新增文件（2）：

- `server/src/migrations/1793088000000-RemoveHotTopicSavedDecision.ts`
- `server/src/migrations/1793088000000-RemoveHotTopicSavedDecision.spec.ts`

修改文件（13）：

- `CHANGELOG.md`
- `server/src/hot-topics/dto/hot-topic.dto.ts`
- `server/src/hot-topics/entities/hot-topic.entity.ts`
- `server/src/hot-topics/hot-topic-controllers.spec.ts`
- `server/src/hot-topics/hot-topic.types.ts`
- `server/src/hot-topics/hot-topics.controller.ts`
- `server/src/hot-topics/hot-topics.service.ts`
- `web/src/api/hotTopic.ts`
- `web/src/components/Table.vue`
- `web/src/views/hot-topic-source/Edit.vue`
- `web/src/views/hot-topic/Index.vue`
- `web/src/views/hot-topic/Preferences.vue`
- `web/src/views/hot-topic/hotTopic.test.mjs`

删除文件：无。

### 2026-10-21 修复移除草稿生命周期后的旧库兼容

- 修复首页与首页配置同时加载失败：开发库经 TypeORM `synchronize` 新增的 `dashboard_configs.widgets` 可能为空字符串，原 `simple-json` 会在进入服务前抛出 JSON 解析异常；改为容错转换器，并将空值、损坏 JSON、空数组统一恢复为系统默认板块。
- 修复 TypeORM CLI 将 `migrations/*.spec.ts` 误当迁移加载而报 `describe is not defined`；迁移入口明确排除规格测试，`migration:show/run` 可正常发现实际迁移类。
- 强化 `1793001600000-RemoveDraftLifecycle` 的部分同步兼容：新旧 Agent 表同时存在时先合并数据再移除旧表；执行关联新旧列同时存在时先回填再删旧列；首页 JSON 无效时回填可用值。早期遗留 `articles` 表保留记录并将状态转换为 `isActive`。
- 已修复当前项目数据库：首页配置恢复 12 个有效板块；1 条旧 Agent 数据已迁入待确认操作，旧表、旧消息类型及执行快照字段已清理；早期文章表的 2 条记录保留并转换为启用状态。全库已无列名或默认值使用草稿语义，现行业务接口也未检出旧契约字段。
- 验证：后端全量 74 suites / 629 tests、TypeORM 实体列检查、生产 TypeScript 静态检查通过；使用真实实体仓储读取当前首页配置，返回 `revision=1`、12 个板块。全量包含规格测试的 TypeScript 检查仍有 4 处既有测试夹具类型断言问题，不影响生产源码检查与 Jest 执行。

新增文件：无。

修改文件（8）：

- `CHANGELOG.md`
- `server/src/data-source.ts`
- `server/src/dashboard/entities/dashboard-config.entity.ts`
- `server/src/dashboard/dashboard.registry.ts`
- `server/src/dashboard/dashboard.registry.spec.ts`
- `server/src/dashboard/dashboard-config.service.spec.ts`
- `server/src/migrations/1793001600000-RemoveDraftLifecycle.ts`
- `server/src/migrations/1793001600000-RemoveDraftLifecycle.spec.ts`

删除文件：无。

### 2026-10-21 统一业务资源启停并移除草稿生命周期

- 全项目业务资源统一为启用/关闭：示例数据与标准问答改用 `isActive`，ComfyUI 工作流只保留 `isEnabled`；首页配置取消草稿、发布、回退及双份配置，单次保存立即生效。知识库文档的空内容处理阶段由 `draft` 更名为 `empty`。
- 移除依赖标准问答草稿/发布状态的审批模块、菜单、路由和首页审批统计。历史 `approval_requests` 表不在迁移中硬删除，仅停用旧菜单，避免不可恢复地清除既有审批记录。
- Agent 写入前人工确认能力继续保留，但实体、表、执行关联、消息类型、接口和前端卡片统一更名为"待确认操作"/`PendingAction`；迁移同步改写历史消息和执行快照字段，不降低权限、版本校验、幂等提交与事务回执要求。
- 文章生成协议的成功结果由 `outcome=draft` 改为 `outcome=completed`；输入组件、客服未发送内容、ComfyUI 表单与手工分段等临时编辑变量不再借用草稿命名。
- 新增生产迁移 `1793001600000-RemoveDraftLifecycle`：转换首页配置、标准问答、示例数据、ComfyUI 工作流、知识文档阶段及 Agent 待确认操作；保留可回退路径。旧迁移中的历史字段名保持不动，确保全新数据库仍能按原顺序建表后执行清理迁移。
- 在 `AGENTS.md` 与 `AGENTS-BACKEND.md` 增加硬性规则：普通业务资源只用启用布尔字段，禁止新增草稿/发布双状态、影子副本和发布/回退接口；真实异步任务与人工确认必须按 `pending/running/PendingAction` 等过程语义命名。
- 验证：后端实体列检查、生产构建与全量 74 suites / 624 tests 通过；前端类型检查、组件复用扫描、33 项相关交互测试与生产构建通过。Vite 仅保留既有依赖 PURE 注释和大分包告警；未执行数据库迁移、未启动服务。

新增文件（4）：

- `server/src/agent-apps/entities/agent-pending-action.entity.ts`
- `server/src/migrations/1793001600000-RemoveDraftLifecycle.ts`
- `server/src/migrations/1793001600000-RemoveDraftLifecycle.spec.ts`
- `web/src/views/agent-workspace/components/AgentPendingActionCard.vue`

修改文件（按模块归类）：

- 规则与设计：`AGENTS.md`、`AGENTS-BACKEND.md`、`.design-spec.md`
- 后端：`server/src/agent-apps/**`、`server/src/ai-command-definitions/**`、`server/src/comfyui/**`、`server/src/content-articles/**`、`server/src/dashboard/**`、`server/src/demo/**`、`server/src/knowledge-bases/**`、`server/src/knowledge-standard-qas/**`、`server/src/app.module.ts`、`server/src/menus/menus.service.ts`、`server/src/module-models/module-models.map.ts`、`server/src/users/users.service.ts` 及受契约影响的测试
- 前端：`web/src/api/{agentWorkspace,comfyUi,dashboard,demo,knowledgeStandardQa}.ts`、`web/src/router/index.ts`、`web/src/dic/index.ts`、`web/src/components/InputNumber.vue`，以及 `agent-app`、`agent-workspace`、`comfy-create`、`content-article`、`customer-service`、`dashboard-config`、`demo`、`home`、`hot-topic`、`knowledge-base`、`knowledge-standard-qa` 相关页面与测试

删除文件（10）：

- `server/src/agent-apps/entities/agent-draft.entity.ts`
- `server/src/approval-requests/approval-requests.controller.ts`
- `server/src/approval-requests/approval-requests.module.ts`
- `server/src/approval-requests/approval-requests.service.spec.ts`
- `server/src/approval-requests/approval-requests.service.ts`
- `server/src/approval-requests/dto/approval-request.dto.ts`
- `server/src/approval-requests/entities/approval-request.entity.ts`
- `web/src/api/approvalRequest.ts`
- `web/src/views/agent-workspace/components/AgentDraftCard.vue`
- `web/src/views/approval-request/Index.vue`

### 2026-10-21 修复首页配置保存异常并增加板块拖拽排序

- 修复已有首页配置保存时 `Cannot update entity because entity id is not set in the entity.`：幂等初始化的 `INSERT IGNORE` 不再触发 TypeORM 实体回填；后续仍按唯一 key 加锁读取真实记录并执行版本校验，不修改既有草稿、发布版本或表结构。
- 首页配置从独立手柄拖拽板块，显示拖动状态与前后落点，保留上移/下移；共用原有 `layout.order` 排序契约，无新增接口或依赖。排序保存为草稿，只有发布后才改变首页展示。
- 只读、加载或保存期间禁止排序，取消拖拽与原位放下不产生额外修改；保留未保存离开提醒。
- 后端验证：真实 TypeORM/MySQL 查询构造器离线复现旧错误，并验证首次插入与重复忽略插入均能完成保存；看板 3 suites / 35 tests、定向 ESLint 与生产 TypeScript 检查通过。未连接数据库、未执行迁移、未重启服务。
- 前端验证：8 项排序/落点测试、6 项既有首页图表/契约测试、真实应用 `vue-tsc --noEmit --project tsconfig.app.json`、组件复用扫描及生产构建通过；构建仅有既有依赖 PURE 注释与大分包告警。未启动服务，未在实际浏览器中联调拖拽。

新增文件（2）：

- `web/src/views/dashboard-config/widgetOrder.ts`
- `web/src/views/dashboard-config/widgetOrder.test.mjs`

修改文件（5）：

- `.design-spec.md`
- `CHANGELOG.md`
- `server/src/dashboard/dashboard-config.service.ts`
- `server/src/dashboard/dashboard-config.service.spec.ts`
- `web/src/views/dashboard-config/Index.vue`

删除文件：无。

### 2026-10-21 新增抖音优先的热点选题、来源管理与异步推荐

- 内容创作增加"热点选题"列表，第三方配置增加"热点来源"；支持个人偏好、收藏/忽略、手动获取、按现有资料重新推荐和每日计划。计划默认关闭，Asia/Shanghai，每日按设定时间执行；停机期间最多补一次当前发现，不回放历史新闻。
- 来源支持抖音公开热榜/账号页中的结构化 JSON、RSS/Atom、授权 JSON Feed，以及 AI 联网搜索，可选平台、AI、混合三种模式。央视新闻、央视网、钧正平为名称快捷候选，未写入猜测的主页/账号标识。锁定账号仍需真实 /user/ 链接与 UID/sec_uid，公开页受限时明确提示，不绕过登录、验证码或反爬。
- AI 功能新增 topicDiscovery（热点发现与推荐），联网采用百炼官方 Responses web_search 来源回执；仅模型目录验证不会计费，不支持的 Chat 联网协议提交前拒绝。搜索资料不冒充账号本人作品，来源时间/排名缺失保留未知；平台数据与 AI 推荐分别保留。
- 热点任务持久化、按用户隔离，提交立即返回任务号；整体最多 5 分钟，单来源请求最多 20 秒，单次联网请求最多 120 秒。唯一活跃任务、请求号防重、数据库租约和超时/停机终态防止重复计费；默认不自动重试。来源密钥不回显、不进入快照，公网 HTTPS 请求固定 DNS 结果并禁止重定向、内网与大响应。
- 选题创建文章在事务中防重，并可显式选择创建后入队生成。独立 sourceMaterials 保留来源/时间/摘要与账号匹配情况，不替换作者想法；文章查看、编辑、生成记录可折叠查看资料。不调用 Agent、不自动发表、不自动采纳生成稿。
- 同一榜单 URL 下不同标题分别去重，普通文章 URL 保留更新语义；来源快照使用 MySQL JSON 避免多份中文摘要超过 TEXT 容量，列表只取摘要列。首期未实现跨站语义聚类、日费用预算或推荐缓存。
- 生产迁移：`server/src/migrations/1792915200000-AddHotTopics.ts`，增加四张热点表、AI 联网协议列、文章来源列；重复执行检查存在性，带业务数据的回退要求人工归档。未对当前数据库执行迁移、未重启运行中的服务。开发环境重启自动同步，生产先备份并运行 `cd server; npm.cmd run migration:run`，再重启后端刷新菜单。
- 来源控制器与选题控制器分文件，兼容项目日志扫描器，并补齐中文日志模块名称，避免来源路由被归入选题路由。
- 验证：后端相关 16 suites / 181 tests 通过；前端 11 项模板/交互测试通过；前后端生产构建通过，真实前端 `vue-tsc --noEmit --project tsconfig.app.json` 与后端生产类型检查通过，新增模块和本次业务代码定向 ESLint 通过。Vite 有现存大分包及依赖 PURE 注释告警。
- 检查边界：全量后端测试文件类型检查仍有既有 agent-workspace/dashboard/menus 测试类型问题；app.module.ts 既有 mysql require 段落有 ESLint 问题，本次未扩展修改。未启动服务、未调用真实收费模型、未进行已登录抖音账号或生产数据库联调。联网协议依据 [百炼官方联网搜索文档](https://help.aliyun.com/zh/model-studio/web-search)。

新增文件（37）：

- `server/src/content-articles/content-source.types.ts`
- `server/src/hot-topics/dto/hot-topic.dto.ts`
- `server/src/hot-topics/entities/hot-topic.entity.ts`
- `server/src/hot-topics/hot-topic-controllers.spec.ts`
- `server/src/hot-topics/hot-topic-fetch.service.spec.ts`
- `server/src/hot-topics/hot-topic-fetch.service.ts`
- `server/src/hot-topics/hot-topic-network.spec.ts`
- `server/src/hot-topics/hot-topic-network.ts`
- `server/src/hot-topics/hot-topic-parsers.spec.ts`
- `server/src/hot-topics/hot-topic-parsers.ts`
- `server/src/hot-topics/hot-topic-sources.service.spec.ts`
- `server/src/hot-topics/hot-topic-sources.service.ts`
- `server/src/hot-topics/hot-topic-sources.controller.ts`
- `server/src/hot-topics/hot-topic-utils.spec.ts`
- `server/src/hot-topics/hot-topic-utils.ts`
- `server/src/hot-topics/hot-topic.types.ts`
- `server/src/hot-topics/hot-topics.controller.ts`
- `server/src/hot-topics/hot-topics.module.ts`
- `server/src/hot-topics/hot-topics.service.spec.ts`
- `server/src/hot-topics/hot-topics.service.ts`
- `server/src/knowledge-ai-providers/knowledge-web-search.service.spec.ts`
- `server/src/knowledge-ai-providers/knowledge-web-search.service.ts`
- `server/src/migrations/1792915200000-AddHotTopics.spec.ts`
- `server/src/migrations/1792915200000-AddHotTopics.ts`
- `web/src/api/hotTopic.ts`
- `web/src/views/content-article/SourceMaterials.vue`
- `web/src/views/hot-topic-source/Edit.vue`
- `web/src/views/hot-topic-source/Index.vue`
- `web/src/views/hot-topic-source/View.vue`
- `web/src/views/hot-topic/CreateArticle.vue`
- `web/src/views/hot-topic/Index.vue`
- `web/src/views/hot-topic/Preferences.vue`
- `web/src/views/hot-topic/Runs.vue`
- `web/src/views/hot-topic/View.vue`
- `web/src/views/hot-topic/hotTopic.test.mjs`
- `web/src/views/hot-topic/preferenceValidation.ts`
- `web/src/views/hot-topic/submissionGuard.ts`

修改文件（29）：

- `CHANGELOG.md`
- `.design-spec.md`
- `server/src/ai-feature-configs/ai-feature-config.constants.ts`
- `server/src/ai-feature-configs/ai-feature-configs.service.spec.ts`
- `server/src/ai-feature-configs/ai-feature-configs.service.ts`
- `server/src/ai-feature-configs/dto/ai-feature-config.dto.ts`
- `server/src/ai-feature-configs/entities/ai-feature-config.entity.ts`
- `server/src/app.module.ts`
- `server/src/content-articles/content-articles.service.ts`
- `server/src/content-articles/content-generation.service.spec.ts`
- `server/src/content-articles/content-generation.service.ts`
- `server/src/content-articles/content-writing.spec.ts`
- `server/src/content-articles/content-writing.ts`
- `server/src/content-articles/entities/content-article.entity.ts`
- `server/src/content-articles/entities/content-generation-task.entity.ts`
- `server/src/knowledge-ai-providers/knowledge-ai-providers.module.ts`
- `server/src/log-records/log-api-scanner.ts`
- `server/src/menus/menu-structure.ts`
- `server/src/menus/menus.service.ts`
- `server/src/third-party-config/third-party-config.service.ts`
- `server/src/users/users.service.ts`
- `web/src/api/aiFeatureConfig.ts`
- `web/src/api/contentArticle.ts`
- `web/src/router/index.ts`
- `web/src/views/ai-feature-config/Edit.vue`
- `web/src/views/ai-feature-config/Index.vue`
- `web/src/views/content-article/Edit.vue`
- `web/src/views/content-article/Tasks.vue`
- `web/src/views/content-article/View.vue`

删除文件：无。

### 2026-10-21 迁移并重命名 ComfyUI 提示词规范模块

- 将原"视觉提示词"菜单从"内容创作"迁移到 ComfyUI 分组，并统一更名为"模型提示词规范"；ComfyUI 现在依次包含创作任务、素材库管理、工作流管理和模型提示词规范。
- 现有 `/visual-prompt-templates` 菜单记录按原 ID 迁移父级，继续沿用 `VisualPromptTemplate.*` 权限、接口地址、实体和历史数据，不新增数据库迁移。
- 页面字段改为规范名称、Demo 来源、正向/负向 Demo、正向/负向提示词格式和可变参数；人工触发操作统一命名为"AI 提炼"，确认说明仍明确以 Demo 和目标模型为提炼依据。
- AI 功能配置、ComfyUI 工作流导入、创作任务提示词转换以及服务端错误信息同步采用"模型提示词规范"术语，内部 `visualPrompt` 类型和值保持兼容。
- 验证：4 套 / 31 项后端菜单、AI 配置、提示词规范及 ComfyUI 工作流定向测试、10 项前端导航契约测试、TypeORM 实体检查、后端目标文件 ESLint、Vue 类型检查和目标页面组件复用扫描通过；当前运行服务的 `/menus/mine` 已确认菜单完成迁移。按非新功能改动约定未执行构建或另行启动服务。

新增文件：无。

修改文件（16）：

- `.design-spec.md`
- `CHANGELOG.md`
- `server/src/ai-feature-configs/ai-feature-configs.service.ts`
- `server/src/comfyui/comfy-workflows.service.ts`
- `server/src/menus/menus.service.spec.ts`
- `server/src/menus/menus.service.ts`
- `server/src/visual-prompt-templates/visual-prompt-templates.service.ts`
- `web/src/router/index.ts`
- `web/src/views/ai-feature-config/Edit.vue`
- `web/src/views/ai-feature-config/Index.vue`
- `web/src/views/comfy-create/Index.vue`
- `web/src/views/comfy-workflow/Edit.vue`
- `web/src/views/comfy-workflow/Index.vue`
- `web/src/views/visual-prompt-template/Edit.vue`
- `web/src/views/visual-prompt-template/Index.vue`
- `web/src/views/visual-prompt-template/View.vue`

删除文件：无。

### 2026-10-21 恢复 ComfyUI 工作流管理菜单

- 修复既有 `/comfyui/workflows` 菜单记录处于停用状态时，菜单同步因保留历史可见性而继续隐藏"工作流管理"的问题；该正式入口现在会恢复为启用、非系统菜单，并继续使用 `ComfyWorkflow.read` 权限控制。
- 原 `/comfyui/tasks` 重复生成记录入口仍保持停用，不影响已合并到"创作任务"的任务查询能力。
- 增加历史工作流菜单为停用、系统菜单时的升级回归测试，并同步设计规范。
- 验证：1 套 / 6 项菜单定向测试、TypeORM 实体检查和后端目标文件 ESLint 通过；当前运行服务的 `/menus/mine` 已确认返回"创作任务""素材库管理""工作流管理"三个入口。按修复类改动约定未执行构建或另行启动服务。

新增文件：无。

修改文件（4）：

- `.design-spec.md`
- `CHANGELOG.md`
- `server/src/menus/menus.service.spec.ts`
- `server/src/menus/menus.service.ts`

删除文件：无。

### 2026-10-21 精简 ComfyUI 菜单命名与任务入口

- ComfyUI 一级菜单下统一保留"创作任务""素材库管理""工作流管理"三个入口，子菜单不再重复 ComfyUI 前缀；页面标题、工作流说明与素材选择提示同步采用新名称。
- 将原独立"ComfyUI 生成记录"入口并入"创作任务"：既有任务表格继续承接查询、详情与状态操作，旧 `/comfyui/tasks` 地址保留为兼容跳转，菜单初始化会停用历史重复菜单记录。
- 首页快捷入口同步调整为 ComfyUI 创作任务、素材库管理和工作流管理；生成趋势及最近成果跳转统一进入创作任务页，不再指向重复记录页。
- 保持现有接口、数据库字段、任务数据和权限码不变；补充菜单初始化与首页快捷入口边界测试，并同步更新设计规范。
- 验证：3 套 / 31 项后端菜单与首页定向测试、6 项前端首页契约测试、后端目标文件 ESLint、Vue 类型检查及目标页面组件复用扫描通过。按非新功能变更约定未执行构建、启动服务或调用 ComfyUI。

新增文件：无。

修改文件（14）：

- `.design-spec.md`
- `CHANGELOG.md`
- `server/src/dashboard/dashboard.registry.spec.ts`
- `server/src/dashboard/dashboard.registry.ts`
- `server/src/dashboard/dashboard.service.ts`
- `server/src/menus/menus.service.spec.ts`
- `server/src/menus/menus.service.ts`
- `web/src/router/index.ts`
- `web/src/views/comfy-create/Index.vue`
- `web/src/views/comfy-material/Index.vue`
- `web/src/views/comfy-workflow/Edit.vue`
- `web/src/views/comfy-workflow/Index.vue`
- `web/src/views/comfy-workflow/workflowDetection.ts`
- `web/src/views/home/dashboardPreview.ts`

删除文件（1）：

- `web/src/views/comfy-task/Index.vue`

### 2026-10-20 Agent 接入文章异步生成任务

- 新增受控业务指令 `contentArticle.generate`，Agent 可把员工提供的想法整理为文章生成草稿；仍须在 Agent 应用中授权该工具、开启写入总开关，并由员工人工确认后才会执行，不允许模型直接写入或宣称成功。
- 草稿字段仅包含工作标题、想法、AI 配置和可选写作模板。未提供标题时根据想法首行生成工作标题；只有一个可用内容创作配置时自动选中，存在多个配置时要求员工明确选择，模板只向有模板读取权限的员工展示。
- 确认草稿后，在同一数据库事务内创建文章并登记持久化异步生成任务；配置、模板、文章归属和版本继续复用文章创作模块的既有校验。任一步失败都会整体回滚，避免留下没有任务的半成品文章。
- Agent 回执新增文章 ID、生成任务 ID 和后台排队状态，可从文章创作或生成记录页面查看后续结果；既有 HTTP 生成接口仍保留事务内二次版本复核与请求号幂等保护。
- 验证：TypeORM 实体检查、17 套 / 303 项 Agent、文章创作及指令集测试、后端目标文件 ESLint、Nest 生产构建通过。未启动服务、执行数据库迁移或调用真实 AI。

新增文件：无。

修改文件（13）：

- `CHANGELOG.md`
- `server/src/agent-apps/agent-apps.module.ts`
- `server/src/agent-apps/agent-business-workspace.spec.ts`
- `server/src/agent-apps/agent-business.registry.ts`
- `server/src/agent-apps/agent-business.service.spec.ts`
- `server/src/agent-apps/agent-business.service.ts`
- `server/src/agent-apps/agent-workspace.service.ts`
- `server/src/ai-command-definitions/ai-command-definitions.constants.spec.ts`
- `server/src/ai-command-definitions/ai-command-definitions.constants.ts`
- `server/src/content-articles/content-articles.module.ts`
- `server/src/content-articles/content-articles.service.spec.ts`
- `server/src/content-articles/content-articles.service.ts`
- `server/src/content-articles/content-generation.service.ts`

删除文件：无。

### 2026-10-20 视觉提示词 AI 调用改为持久异步任务

- 将视觉提示词模板 AI 提炼、模板直接转换及 ComfyUI 工作流提示词转换统一改为持久异步任务：提交接口只保存任务并立即返回，前端通过短轮询读取状态与结果，不再让单个 HTTP 请求等待 AI，从根本上规避全局 Axios 15 秒超时。
- 新增 `visual_prompt_tasks` 任务表、幂等请求号、同一模板 / 工作流活跃任务互斥、执行阶段、结果、明确错误、工作节点与 150 秒租约；后台 AI 单次执行仍限制为 120 秒，服务停止或租约过期时标记"中断"且不自动重试，避免供应商重复计费。
- 提炼任务提交时记录模板版本，AI 回写前再次执行乐观版本校验；模板在排队或执行期间被编辑时不会用旧结果覆盖新配置。ComfyUI 转换任务同样绑定提交时的模板版本和目标模型。
- 视觉提示词列表与 ComfyUI 创作弹窗展示后台阶段并轮询任务；成功后分别刷新模板或回填正向、负向提示词，失败 / 中断时直接展示任务保存的具体原因。工作流切换会停止旧页面结果回填，但不会取消已经提交的后台任务。
- 验证：TypeORM 实体检查、3 套 / 12 项后端定向测试、后端目标文件 ESLint、Vue 类型检查、目标页面组件复用扫描、Nest 生产构建和 Vite 生产构建通过；Vite 仅保留既有依赖 PURE 注释与大分块提示。未执行数据库迁移、启动服务或调用真实 AI / ComfyUI。

新增文件（4）：

- `server/src/migrations/1792828800000-AddVisualPromptTasks.spec.ts`
- `server/src/migrations/1792828800000-AddVisualPromptTasks.ts`
- `server/src/visual-prompt-templates/entities/visual-prompt-task.entity.ts`
- `server/src/visual-prompt-templates/visual-prompt-templates.service.spec.ts`

修改文件（13）：

- `CHANGELOG.md`
- `server/src/comfyui/comfy-workflows.controller.ts`
- `server/src/comfyui/comfy-workflows.service.spec.ts`
- `server/src/comfyui/comfy-workflows.service.ts`
- `server/src/comfyui/dto/comfyui.dto.ts`
- `server/src/visual-prompt-templates/dto/visual-prompt-template.dto.ts`
- `server/src/visual-prompt-templates/visual-prompt-templates.controller.ts`
- `server/src/visual-prompt-templates/visual-prompt-templates.module.ts`
- `server/src/visual-prompt-templates/visual-prompt-templates.service.ts`
- `web/src/api/comfyUi.ts`
- `web/src/api/visualPromptTemplate.ts`
- `web/src/views/comfy-create/Index.vue`
- `web/src/views/visual-prompt-template/Index.vue`

删除文件：无。

### 2026-10-20 串联 ComfyUI 工作流视觉提示词

- ComfyUI 工作流导入识别结果新增正向、负向示例；服务端在清理工作流提示词之前读取示例，并使用最新可用的"视觉提示词"AI 配置自动创建或更新绑定模板。保存阶段只复制格式示例，不调用 AI、Agent 或付费媒体接口，缺少示例或可用配置时仍允许保存并降级为手工提示词。
- 工作流主记录新增可空 `visualPromptTemplateId`，并提供幂等迁移；列表展示模板绑定状态，导入弹窗明确说明自动建立、已绑定和未识别三种状态。工作流及版本快照仍只保存清空示例后的执行 JSON，避免示例内容进入后续任务。
- 新增工作流级提示词转换接口，按绑定模板、目标模型及模板自身 AI 配置，将用户自然语言想法转换为正向与负向提示词；协议明确只借鉴示例的语言、结构、顺序和模型语法，不照抄示例主体或场景。
- "ComfyUI 创作"移除视觉模板重复选择，改为选择工作流后输入创作想法、点击"转换提示词"、预览并可编辑正负提示词，最后再提交任务；未绑定模板时保留手工填写兜底，转换失败不会提交空提示词任务。
- 验证：TypeORM 实体检查、4 套 / 15 项后端定向测试、3 项工作流识别测试、后端定向 ESLint、Vue 类型检查、目标页面组件复用扫描、Nest 生产构建和 Vite 生产构建通过；Vite 仅保留既有依赖 PURE 注释与大分块提示。未执行数据库迁移、启动服务、调用真实 AI / ComfyUI 或提交计费任务。

新增文件（2）：

- `server/src/migrations/1792742400000-LinkComfyWorkflowVisualPrompt.spec.ts`
- `server/src/migrations/1792742400000-LinkComfyWorkflowVisualPrompt.ts`

修改文件（18）：

- `.design-spec.md`
- `CHANGELOG.md`
- `server/src/comfyui/comfy-workflow-sanitizer.spec.ts`
- `server/src/comfyui/comfy-workflow-sanitizer.ts`
- `server/src/comfyui/comfy-workflows.controller.ts`
- `server/src/comfyui/comfy-workflows.service.spec.ts`
- `server/src/comfyui/comfy-workflows.service.ts`
- `server/src/comfyui/comfyui.module.ts`
- `server/src/comfyui/dto/comfyui.dto.ts`
- `server/src/comfyui/entities/comfy-workflow.entity.ts`
- `server/src/visual-prompt-templates/visual-prompt-templates.service.ts`
- `server/src/visual-prompt-templates/visual-prompt.protocol.ts`
- `web/src/api/comfyUi.ts`
- `web/src/views/comfy-create/Index.vue`
- `web/src/views/comfy-workflow/Edit.vue`
- `web/src/views/comfy-workflow/Index.vue`
- `web/src/views/comfy-workflow/workflowDetection.test.mjs`
- `web/src/views/comfy-workflow/workflowDetection.ts`

删除文件：无。

### 2026-10-20 取消 ComfyUI 工作流草稿状态

- ComfyUI 工作流保存后只要处于启用状态且执行服务可用，即可直接用于创作；不再区分草稿与已发布，也不因工作流来自本机或云端而增加发布步骤。
- 工作流编辑弹窗移除发布开关，列表将发布状态简化为"可使用 / 已停用"；创作页的空状态、选择提示和引导文案统一改为保存后使用。
- 后端创作选项与任务提交只校验启用状态；历史数据即使 `isPublished=false` 也能直接使用，新建和编辑时仍写入兼容值 `true`，避免立即删除旧字段造成数据库升级风险。
- 新增旧草稿可选与任务可执行回归测试；验证 2 套 / 8 项 ComfyUI 工作流定向测试、TypeORM 实体检查、后端定向 ESLint、Vue 类型检查、目标页面组件复用扫描和改动文件格式检查通过。本次为既有交互简化，按规则未执行生产构建或启动服务。

新增文件：无。

修改文件（11）：

- `.design-spec.md`
- `CHANGELOG.md`
- `server/src/comfyui/comfy-tasks.service.ts`
- `server/src/comfyui/comfy-workflows.service.spec.ts`
- `server/src/comfyui/comfy-workflows.service.ts`
- `server/src/comfyui/dto/comfyui.dto.ts`
- `server/src/comfyui/entities/comfy-workflow.entity.ts`
- `web/src/api/comfyUi.ts`
- `web/src/views/comfy-create/Index.vue`
- `web/src/views/comfy-workflow/Edit.vue`
- `web/src/views/comfy-workflow/Index.vue`

删除文件：无。

### 2026-10-20 修复 ComfyUI 工作流版本缺少 JSON

- 修复导入或编辑 ComfyUI 工作流时，主记录保存后因 `apiWorkflow` 为隐藏查询列、ORM 返回对象未携带该字段，导致版本快照插入报 `Field 'apiWorkflow' doesn't have a default value` 的问题。
- 创建和更新工作流时显式把已校验、已清理的 API JSON、参数映射及输出节点传给版本快照，不再依赖主记录保存后的隐式字段回传。
- 新增回归测试模拟 ORM 丢失 `select: false` 字段的场景，确认版本记录仍保存完整工作流 JSON。
- 验证：TypeORM 实体检查、2 套 / 6 项 ComfyUI 工作流定向测试及改动文件 ESLint 通过；本次为缺陷修复，按规则未执行生产构建或启动服务。

新增文件：无。

修改文件（3）：

- `CHANGELOG.md`
- `server/src/comfyui/comfy-workflows.service.spec.ts`
- `server/src/comfyui/comfy-workflows.service.ts`

删除文件：无。

### 2026-10-20 分离 ComfyUI 工作流模板与创作任务提示词

- 工作流导入自动识别仍保留正向/负向提示词的节点映射，但不再把 JSON 自带的示例文本作为参数默认值；后端在创建、更新和生成版本快照前统一清空提示词节点及映射默认值。
- 创建任务时只把用户本次填写的提示词保存在任务参数快照中；对历史工作流和历史任务快照在提交 ComfyUI 前再次执行清理，必填提示词不能再由旧模板默认值代替。
- "ComfyUI 创作"改为任务查询列表，顶部"新建创作任务"打开标准弹窗选择已发布工作流并填写参数；提交成功后关闭弹窗并立即刷新列表。
- 抽取 ComfyUI 任务共享列表，创作页与生成记录页复用状态展示、详情、取消、删除、批量删除和后台状态轮询，避免两套任务交互产生差异。
- 验证：新增 2 项后端提示词清理测试并连同 3 项既有绑定测试通过，前端 3 项工作流识别测试、Vue 类型检查、目标页面组件复用扫描、后端定向 ESLint、Nest 生产构建和 Vite 生产构建通过；Vite 仅保留既有依赖 PURE 注释与大分块提示。未启动服务、修改现有数据库记录或提交真实 ComfyUI 任务。

新增文件（3）：

- `server/src/comfyui/comfy-workflow-sanitizer.spec.ts`
- `server/src/comfyui/comfy-workflow-sanitizer.ts`
- `web/src/views/comfy-task/TaskTable.vue`

修改文件（8）：

- `.design-spec.md`
- `CHANGELOG.md`
- `server/src/comfyui/comfy-tasks.service.ts`
- `server/src/comfyui/comfy-workflows.service.ts`
- `web/src/views/comfy-create/Index.vue`
- `web/src/views/comfy-task/Index.vue`
- `web/src/views/comfy-workflow/workflowDetection.test.mjs`
- `web/src/views/comfy-workflow/workflowDetection.ts`

删除文件：无。

### 2026-10-20 精简 ComfyUI 工作流保存界面

- 工作流弹窗恢复为常规 1040px 宽度，页面定位回归"导入、确认、保存并供创作调用"，不再默认展示完整节点调试表单。
- 默认仅展示基础信息、JSON 节点/输出/模型摘要、创作参数名称与类型摘要以及发布状态；系统输出前缀不会出现在普通参数清单中。
- 原始 JSON、完整节点映射、默认值、上下限、输出节点和依赖说明统一收进"高级配置"；需要修正自动识别结果时仍可完整编辑，保存协议和创作调用方式不变。
- 高级映射固定使用四列可收缩布局，小屏降为两列，恢复常规弹窗宽度后仍不会横向裁切。
- 验证：Vue 类型检查、目标页面组件复用扫描、改动文件 Prettier 检查和 Git 差异检查通过；按界面信息层级调整范围未执行生产构建、启动服务或浏览器自动化。

新增文件：无。

修改文件（3）：

- `.design-spec.md`
- `CHANGELOG.md`
- `web/src/views/comfy-workflow/Edit.vue`

删除文件：无。

### 2026-10-20 扩大 ComfyUI 工作流编辑工作区

- 工作流导入/编辑 Dialog 改为接近视口全宽，内容区高度随视口计算，内部表单限制最大阅读宽度并居中，保留现有固定底部确认操作和滚动方式。
- 开放参数映射宽屏使用可收缩的九列布局，中等屏自动拆为四列、小屏拆为两列；解除子控件默认最小宽度，避免参数较多时右侧默认值、必填开关和移除操作被裁切。
- 验证：Vue 类型检查、目标页面组件复用扫描、改动文件 Prettier 检查和 Git 差异检查通过；按界面布局优化范围未执行生产构建、启动服务或浏览器自动化。

新增文件：无。

修改文件（3）：

- `.design-spec.md`
- `CHANGELOG.md`
- `web/src/views/comfy-workflow/Edit.vue`

删除文件：无。

### 2026-10-20 增加 ComfyUI API 工作流字段自动识别

- 导入 ComfyUI API JSON 后自动识别文件名、图片/视频输出类型、保存节点、主模型和加载器依赖；同时保留"自动识别"按钮，支持粘贴 JSON 后重新分析。
- 正向和负向提示词通过采样器条件连线回溯到实际文本节点，不依赖两个同名 CLIP 编码节点的排列顺序；自动生成种子、步数、CFG、降噪、宽高、批量数、输入图片和系统输出前缀等可确认映射。
- 自动识别只合并缺失配置，不覆盖已有目标模型、依赖说明、输出节点或同节点映射；数字默认值保存为数字，输入图片不沿用 ComfyUI 本地文件名，仍要求从当前用户素材库选择。
- 使用用户提供的 10 节点生图工作流建立定向测试，并补充视频输出和图生视频输入场景；JSON 仅作为数据解析，不执行其中内容。
- 验证：3 项自动识别规则测试、Vue 类型检查、目标页面组件复用扫描、改动文件 Prettier 检查和 Vite 生产构建通过；构建只有既有依赖 PURE 注释与大分块提示。未启动服务、提交真实 ComfyUI 任务或执行导入 JSON 中的任何内容。

新增文件（2）：

- `web/src/views/comfy-workflow/workflowDetection.test.mjs`
- `web/src/views/comfy-workflow/workflowDetection.ts`

修改文件（3）：

- `.design-spec.md`
- `CHANGELOG.md`
- `web/src/views/comfy-workflow/Edit.vue`

删除文件：无。

### 2026-10-20 新增模型感知的视觉提示词与 ComfyUI 正负提示词注入

- 内容创作新增"视觉提示词"模块，按当前用户维护图片/视频模板、目标模型、正向与负向示例、提炼结果、风格摘要、模型规则和变量；目标模型留空时作为通用模板，填写后仅匹配同模型工作流。
- AI 功能配置新增"视觉提示词"类型，使用账号下的文本模型，以固定 JSON 协议提炼官方示例或生成正向/负向提示词；不调用 Agent、不自动生成媒体，AI 提炼失败不会覆盖已有模板。
- ComfyUI 工作流新增目标模型字段，开放文本参数可声明普通、正向提示词、负向提示词、视频运动和镜头运动语义；后端限制正向与负向各最多一个绑定，且非文本参数不能承担提示词语义，版本快照同步保留模型和映射。
- ComfyUI 创作页检测到正负提示词绑定后展示 AI 提示词区，按媒体类型和目标模型筛选模板；用户明确点击后才生成，并分别回填到受控参数，仍可手工修改且不会自动提交任务或改动未开放节点。
- 新增迁移 `1792656000000-AddVisualPromptTemplates`，创建个人视觉提示词模板表，并为 ComfyUI 工作流及版本表补充目标模型列；同步菜单、路由、权限和设计规范。
- 验证：TypeORM 实体检查、7 套 / 40 项定向后端测试、Nest 生产构建、前端 13 项导航测试、Vue 类型检查、组件复用扫描和 Vite 生产构建通过；新增后端与相关服务定向 ESLint、改动文件 Prettier 及 Git 差异检查通过。未执行数据库迁移、启动服务或调用真实 AI / ComfyUI，模型提示词效果和供应商计费需使用测试账号验收。

新增文件（14）：

- `server/src/migrations/1792656000000-AddVisualPromptTemplates.spec.ts`
- `server/src/migrations/1792656000000-AddVisualPromptTemplates.ts`
- `server/src/comfyui/comfy-workflows.service.spec.ts`
- `server/src/visual-prompt-templates/dto/visual-prompt-template.dto.ts`
- `server/src/visual-prompt-templates/entities/visual-prompt-template.entity.ts`
- `server/src/visual-prompt-templates/visual-prompt-templates.controller.ts`
- `server/src/visual-prompt-templates/visual-prompt-templates.module.ts`
- `server/src/visual-prompt-templates/visual-prompt-templates.service.ts`
- `server/src/visual-prompt-templates/visual-prompt.protocol.spec.ts`
- `server/src/visual-prompt-templates/visual-prompt.protocol.ts`
- `web/src/api/visualPromptTemplate.ts`
- `web/src/views/visual-prompt-template/Edit.vue`
- `web/src/views/visual-prompt-template/Index.vue`
- `web/src/views/visual-prompt-template/View.vue`

修改文件（21）：

- `.design-spec.md`
- `CHANGELOG.md`
- `server/src/ai-feature-configs/ai-feature-config.constants.ts`
- `server/src/ai-feature-configs/ai-feature-configs.service.ts`
- `server/src/app.module.ts`
- `server/src/comfyui/comfy-workflows.service.ts`
- `server/src/comfyui/dto/comfyui.dto.ts`
- `server/src/comfyui/entities/comfy-workflow-version.entity.ts`
- `server/src/comfyui/entities/comfy-workflow.entity.ts`
- `server/src/menus/menus.service.ts`
- `server/src/users/users.service.ts`
- `web/src/api/aiFeatureConfig.ts`
- `web/src/api/comfyUi.ts`
- `web/src/api/knowledgeAiProvider.ts`
- `web/src/router/index.ts`
- `web/src/router/systemNavigation.test.mjs`
- `web/src/views/ai-feature-config/Edit.vue`
- `web/src/views/ai-feature-config/Index.vue`
- `web/src/views/comfy-create/Index.vue`
- `web/src/views/comfy-workflow/Edit.vue`
- `web/src/views/comfy-workflow/Index.vue`

删除文件：无。

### 2026-10-20 重构 ComfyUI 创作工作台界面

- 创作页新增轻量引导头部，集中展示可用工作流、输入素材数量以及素材库和生成记录入口。
- 有可用模板时采用"工作流模板侧栏 + 参数工作区"布局，通过卡片显示图片/视频类型、参数数量和版本，并强化当前选择状态；参数按两列自适应排列，长文本独占整行。
- 无可用模板时使用紧凑的三步配置引导代替大面积通用空状态，并按服务、工作流权限提供直达入口；无配置权限时明确提示联系管理员。
- 任务提交提示和成功反馈统一到当前工作区，页面在 960px、720px 两档宽度下自适应。
- 验证：前端 `vue-tsc` 类型检查、目标页面组件复用扫描、Vue/设计规范 Prettier 检查及 Git 差异检查通过；按界面优化约定未执行生产构建或启动服务。

新增文件：无。

修改文件（3）：

- `.design-spec.md`
- `CHANGELOG.md`
- `web/src/views/comfy-create/Index.vue`

删除文件：无。

### 2026-10-20 优化 ComfyUI 工作流导入表单布局

- 工作流导入弹窗收窄最大宽度并提高内容区可用高度，基础信息维持两列布局，窄屏自动回落单列。
- API 工作流和开放参数调整为独立全宽卡片分区，消除长标签断行；文件选择、节点识别状态、参数数量和说明信息就近展示。
- 无开放参数时改用紧凑空状态，减少无效留白；统一使用现有设计变量控制间距、圆角、边框和文字层级。
- 验证：前端 `vue-tsc` 类型检查、目标页面组件复用扫描、Vue/设计规范 Prettier 检查及 Git 差异检查通过；按界面优化约定未执行生产构建或启动服务。

新增文件：无。

修改文件（3）：

- `.design-spec.md`
- `CHANGELOG.md`
- `web/src/views/comfy-workflow/Edit.vue`

删除文件：无。

### 2026-10-20 修复 ComfyUI 默认服务保存失败

- 修复新建首个 ComfyUI 服务或编辑服务并设为默认时，TypeORM 因空更新条件拒绝执行并返回 500 的问题；默认项切换现在只更新已有的默认服务记录。
- 补充新建与编辑默认服务的回归测试。该问题发生在服务配置入库阶段，与本地 ComfyUI 密钥校验和网络连接无关。
- 验证：TypeORM 实体检查、ComfyUI 服务定向 ESLint/Prettier 静态检查及 2 项 Jest 回归测试通过；按修复类改动约定未构建或启动服务，也未连接真实 ComfyUI。

新增文件（1）：

- `server/src/comfyui/comfy-connections.service.spec.ts`

修改文件（2）：

- `CHANGELOG.md`
- `server/src/comfyui/comfy-connections.service.ts`

删除文件：无。

### 2026-10-20 扩展首页内容与媒体运营板块

- 首页注册表扩展为十二种受控板块：升级"内容与媒体生成趋势"，支持 7/30 天、生成来源、文章/图片/视频筛选以及按来源/媒体类型展示；新增"生成任务健康度"和"最近创作成果"，两者默认关闭，仅进入首页配置目录供管理员预览、勾选和发布。
- 生成趋势和健康度纳入文章生成、云端 AI 图片/视频与 ComfyUI 图片/视频任务，继续按当前用户及 `ContentArticle.read`、`AiMaterial.read`、`ComfyTask.read` 权限裁剪；健康度展示等待、运行、存储/归档、待补充、成功、失败/中断和未识别状态，并仅依据真实起止时间计算平均耗时。
- 最近成果只返回已保存正文的文章、云端 AI 当前成功素材和 ComfyUI 输出素材的轻量字段；图片以 44×44px 缩略图展示，视频使用类型占位且不自动播放，不加载正文、完整提示词、工作流快照或第三方服务信息。
- 核心数据中的 AI 素材提示拆分图片/视频，生成记录总数纳入 ComfyUI；快捷入口增加 ComfyUI 创作、素材和生成记录，但已有配置不会自动选中新增入口。旧版生成趋势和历史回退配置会安全升级，新板块不会被自动开启。
- 验证：TypeORM 实体检查、3 套 / 29 项 Dashboard 后端测试、Nest 生产构建、6 项首页 ECharts/契约测试、前端组件复用扫描和 Vite 生产构建通过。未连接真实数据库、启动服务或修改首页已发布配置，新增板块需在"首页配置"手动发布。

新增文件：无。

修改文件（15）：

- `.design-spec.md`
- `CHANGELOG.md`
- `MD/首页改版设计方案.md`
- `server/src/dashboard/dashboard-config.service.spec.ts`
- `server/src/dashboard/dashboard-config.service.ts`
- `server/src/dashboard/dashboard.registry.spec.ts`
- `server/src/dashboard/dashboard.registry.ts`
- `server/src/dashboard/dashboard.service.spec.ts`
- `server/src/dashboard/dashboard.service.ts`
- `server/src/dashboard/dashboard.types.ts`
- `web/src/api/dashboard.ts`
- `web/src/views/home/components/DashboardWidgetCard.vue`
- `web/src/views/home/dashboard.test.mjs`
- `web/src/views/home/dashboardChart.ts`
- `web/src/views/home/dashboardPreview.ts`

删除文件：无。

### 2026-10-20 拆分 ComfyUI 菜单并扩展 AI 视频素材生成

- 将 ComfyUI 创作、素材、工作流和生成记录从"内容创作"移入独立一级"ComfyUI"菜单组；ComfyUI 服务连接继续保留在"第三方配置"，历史菜单按既有路径自动迁移父级，不改变权限码和业务路由。
- 大模型账号增加独立视频生成模型目录与 DashScope 异步视频端点；AI 功能配置增加"视频生成"类型和"图生视频能力"开关，并继续与文本、识图、生图模型目录严格隔离。
- AI 素材增加文生视频、图生视频两种模式，以及媒体类型、480P/720P/1080P、受控画面比例、5/10 秒时长等字段。列表可按图片/视频筛选并显示当前媒体，详情支持 MP4 播放与下载；图生视频复用受管参考图作为首帧。
- 视频生成采用真实异步链路：提交任务后保存供应商任务编号，后台轮询终态，再通过公网 HTTPS 安全下载 MP4 并写入现有 `ai-materials` 专用受管路径。重新生成仍执行"新文件保存成功后切换"，失败不会清除旧素材，也不会自动重试或重复计费。
- 图片执行上限保持 5 分钟，视频执行上限设为 15 分钟，租约分别额外保留 1 分钟用于下载、落盘和事务提交；失败信息区分提交、轮询、下载、保存和超时阶段。
- 新增迁移 `1792569600000-AddVideoGenerationMaterials`，补齐账号、功能配置、素材和任务字段，并对已有图片结果回填媒体类型；存在视频素材、视频配置或供应商任务记录时拒绝破坏性回退。
- 验证：后端变更文件 ESLint、TypeORM 实体检查、57 套 / 536 项 Jest、Nest 生产构建全部通过；前端 `vue-tsc`、组件复用扫描、10 项导航测试及 Vite 生产构建通过。未连接数据库、执行迁移、启动服务或调用真实视频供应商，供应商模型授权和计费仍需使用专用测试账号验收。

新增文件（4）：

- `server/src/common/ai/video-generation.ts`
- `server/src/common/ai/video-generation.spec.ts`
- `server/src/migrations/1792569600000-AddVideoGenerationMaterials.ts`
- `server/src/migrations/1792569600000-AddVideoGenerationMaterials.spec.ts`

修改文件（40）：

- `.design-spec.md`
- `CHANGELOG.md`
- `MD/AI素材生成与存储清理设计方案.md`
- `MD/ComfyUI本机工作流接入设计方案.md`
- `server/src/ai-feature-configs/ai-feature-config.constants.ts`
- `server/src/ai-feature-configs/ai-feature-configs.service.spec.ts`
- `server/src/ai-feature-configs/ai-feature-configs.service.ts`
- `server/src/ai-feature-configs/dto/ai-feature-config.dto.ts`
- `server/src/ai-feature-configs/entities/ai-feature-config.entity.ts`
- `server/src/ai-materials/ai-material.constants.ts`
- `server/src/ai-materials/ai-materials.controller.ts`
- `server/src/ai-materials/ai-materials.service.ts`
- `server/src/ai-materials/dto/ai-material.dto.ts`
- `server/src/ai-materials/entities/ai-material.entity.ts`
- `server/src/ai-materials/entities/material-generation-task.entity.ts`
- `server/src/ai-materials/material-generation-error.spec.ts`
- `server/src/ai-materials/material-generation-error.ts`
- `server/src/common/ai/image-utils.ts`
- `server/src/knowledge-ai-providers/dto/knowledge-ai-provider.dto.ts`
- `server/src/knowledge-ai-providers/entities/knowledge-ai-provider.entity.ts`
- `server/src/knowledge-ai-providers/knowledge-ai-media-target.spec.ts`
- `server/src/knowledge-ai-providers/knowledge-ai-providers.service.spec.ts`
- `server/src/knowledge-ai-providers/knowledge-ai-providers.service.ts`
- `server/src/managed-files/managed-files.service.ts`
- `server/src/menus/menus.service.ts`
- `server/src/third-party-config/third-party-config.service.spec.ts`
- `server/src/third-party-config/third-party-config.service.ts`
- `web/src/api/aiFeatureConfig.ts`
- `web/src/api/aiMaterial.ts`
- `web/src/api/knowledgeAiProvider.ts`
- `web/src/api/thirdPartyConfig.ts`
- `web/src/router/index.ts`
- `web/src/router/systemNavigation.test.mjs`
- `web/src/views/ai-feature-config/Edit.vue`
- `web/src/views/ai-feature-config/Index.vue`
- `web/src/views/ai-material/Edit.vue`
- `web/src/views/ai-material/Index.vue`
- `web/src/views/ai-material/View.vue`
- `web/src/views/knowledge-ai-provider/Edit.vue`
- `web/src/views/knowledge-ai-provider/View.vue`

删除文件：无。

### 2026-10-20 明确素材生图失败原因并固定五分钟上限

- 素材文生图/图生图的单次执行上限由 120 秒统一调整为固定 5 分钟；后台任务租约由 150 秒调整为 330 秒，为结果下载、受管文件落盘和事务提交保留 30 秒缓冲，避免多实例在五分钟调用结束前提前回收任务。
- 生成失败不再统一写成"请检查配置"：分别记录五分钟执行超时、服务停止、供应商鉴权、接口或模型不存在、限流/额度、供应商 5xx、参数拒绝、响应无效、图片下载、文件保存和结果写入等原因。五分钟超时标记为"已中断"，明确供应商可能仍在处理或计费且系统不会自动重试；不保存供应商响应体或账号密钥。
- 素材列表的状态提示增加"失败原因"标题和最大宽度换行，详情中的"最近结果"改为"失败原因"。历史任务无法可靠反推真实原因，保留原记录；新任务开始使用细分原因。
- 验证：后端变更文件 ESLint、TypeORM 实体检查、2 套 / 10 项素材生成测试通过；前端 `vue-tsc --noEmit` 与组件复用扫描通过。按现有功能修复规则未启动服务、未调用真实供应商、未执行生产构建。

新增文件（2）：

- `server/src/ai-materials/material-generation-error.ts`
- `server/src/ai-materials/material-generation-error.spec.ts`

修改文件（5）：

- `.design-spec.md`
- `CHANGELOG.md`
- `server/src/ai-materials/ai-materials.service.ts`
- `web/src/views/ai-material/Index.vue`
- `web/src/views/ai-material/View.vue`

删除文件：无。

### 2026-10-20 接入本机 ComfyUI 独立创作子系统

- 在现有"第三方配置"大菜单下新增"ComfyUI 服务"，支持同机回环、Docker 宿主机及私有网段地址，无认证 / Basic / Bearer 三种认证方式、默认服务、请求与任务时限、启停和只读连接检测；密钥不进入列表、业务选项或任务快照，普通创作端不暴露服务地址。
- 在"内容创作"下新增 ComfyUI 创作、ComfyUI 素材、ComfyUI 工作流、ComfyUI 生成记录四个独立入口。现有"素材管理"及 `AiMaterial` 数据和接口保持不变；ComfyUI 输入与输出使用独立 `ComfyMaterial`、权限和页面。
- 工作流只接收 ComfyUI API 格式 JSON，解析节点并通过白名单维护 `参数键 → nodeId → inputKey` 映射；支持文本、数字、开关、选项、种子、图片素材和系统输出前缀。每次保存生成不可变工作流版本，运行任务冻结工作流、映射和用户参数，不允许客户端任意修改节点图。
- 新增 MySQL 持久化任务调度：提交 `/prompt` 后通过 `/queue` 与 `/history/{promptId}` 对账，展示等待、提交、排队、执行、归档及终态；输入图片先上传 ComfyUI，图片/视频输出通过 `/view` 下载后写入受管存储和 ComfyUI 素材库。任务列表不返回图 JSON或绑定快照，详情按需读取参数与多文件输出；共享实例只允许取消尚未提交的本系统任务，不调用全局 interrupt。
- ComfyUI 文件统一写入 `comfyui/<环境>/objects/...`，使用独立文件引用并沿用至少 24 小时延迟清理。媒体存储清理接口增加 `comfyui` 范围，ComfyUI 素材页提供到期无引用文件的预览和精确清理；不会扫描或删除模型、插件、手工输出及现有 AI 素材目录。
- 新增迁移 `1792483200000-CreateComfyUiIntegration`，同步补齐四个权限模块、菜单种子、第三方服务概览、前端路由、设计规范和实施文档。基础版采用 HTTP 队列/历史轮询；WebSocket 节点级实时进度、多实例租约和归档独立重试保留为后续增强，不虚构百分比。
- 验证：后端 TypeORM 实体检查、变更文件 ESLint、Nest 生产构建、3 套 / 17 项菜单测试及 1 套 / 5 项第三方配置测试通过；前端 `vue-tsc --noEmit`、组件复用扫描和 Vite 生产构建通过。未连接数据库、执行迁移、启动服务或调用真实 ComfyUI；`web/components.d.ts` 用户既有未提交差异保持不纳入提交。

新增文件（28）：

- `server/src/comfyui/comfy-client.service.ts`
- `server/src/comfyui/comfy-connections.controller.ts`
- `server/src/comfyui/comfy-connections.service.ts`
- `server/src/comfyui/comfy-files.service.ts`
- `server/src/comfyui/comfy-materials.controller.ts`
- `server/src/comfyui/comfy-materials.service.ts`
- `server/src/comfyui/comfy-tasks.controller.ts`
- `server/src/comfyui/comfy-tasks.service.ts`
- `server/src/comfyui/comfy-workflows.controller.ts`
- `server/src/comfyui/comfy-workflows.service.ts`
- `server/src/comfyui/comfyui.module.ts`
- `server/src/comfyui/dto/comfyui.dto.ts`
- `server/src/comfyui/entities/comfy-connection.entity.ts`
- `server/src/comfyui/entities/comfy-material.entity.ts`
- `server/src/comfyui/entities/comfy-task-output.entity.ts`
- `server/src/comfyui/entities/comfy-task.entity.ts`
- `server/src/comfyui/entities/comfy-workflow-version.entity.ts`
- `server/src/comfyui/entities/comfy-workflow.entity.ts`
- `server/src/migrations/1792483200000-CreateComfyUiIntegration.ts`
- `web/src/api/comfyUi.ts`
- `web/src/views/comfy-connection/Edit.vue`
- `web/src/views/comfy-connection/Index.vue`
- `web/src/views/comfy-create/Index.vue`
- `web/src/views/comfy-material/Index.vue`
- `web/src/views/comfy-task/Index.vue`
- `web/src/views/comfy-task/View.vue`
- `web/src/views/comfy-workflow/Edit.vue`
- `web/src/views/comfy-workflow/Index.vue`

修改文件（13）：

- `.design-spec.md`
- `CHANGELOG.md`
- `MD/ComfyUI本机工作流接入设计方案.md`
- `server/src/app.module.ts`
- `server/src/managed-files/dto/managed-file.dto.ts`
- `server/src/managed-files/managed-files.controller.ts`
- `server/src/managed-files/managed-files.service.ts`
- `server/src/menus/menu-structure.ts`
- `server/src/menus/menus.service.ts`
- `server/src/third-party-config/third-party-config.service.ts`
- `server/src/users/users.service.ts`
- `web/src/api/storageConfig.ts`
- `web/src/router/index.ts`

删除文件：无。

### 2026-10-19 首页补充内容创作与素材生成统计

- 首页核心数据由六项扩展为九项，新增当前用户的内容创作数、AI 素材数和生成记录数；按 `ContentArticle.read` / `AiMaterial.read` 独立裁剪，生成记录在同时授权时汇总文章与素材任务，并提供文章创作、生成记录、素材管理三个快捷入口。
- 新增受控板块"内容与素材生成趋势"，支持近 7/30 天，按任务创建日展示文章生成与素材生成两条序列，并给出区间生成量、终态成功率和待处理任务数。排队、运行、存储及待补充不进入成功率分母，全部查询只统计当前登录用户。
- 核心指标和快捷入口注册版本升级，旧配置安全补齐新版参数；新趋势板块在旧配置中以关闭状态追加，由管理员预览后发布，不擅自改变既有首页布局。全新配置默认包含该板块，仍受最多 12 块、固定数据源和权限边界约束。
- 验证：后端变更文件 ESLint、TypeORM 实体检查、3 套 / 25 项 Dashboard Jest 与 Nest 生产构建通过；前端 6 项 ECharts/静态预览/契约测试、`vue-tsc --noEmit`、组件复用扫描及 Vite 生产打包通过。Vite 打包使用不写自动声明文件的临时配置完成并已删除，避免覆盖用户已有 `web/components.d.ts` 差异；未连接数据库、启动服务或修改线上首页配置。

新增文件：无。

修改文件（10）：

- `.design-spec.md`
- `CHANGELOG.md`
- `MD/首页改版设计方案.md`
- `server/src/dashboard/dashboard-config.service.spec.ts`
- `server/src/dashboard/dashboard.registry.spec.ts`
- `server/src/dashboard/dashboard.registry.ts`
- `server/src/dashboard/dashboard.service.spec.ts`
- `server/src/dashboard/dashboard.service.ts`
- `web/src/views/home/dashboard.test.mjs`
- `web/src/views/home/dashboardPreview.ts`

删除文件：无。

### 2026-10-19 素材管理接入可控图生图

- 图片生成类型的 AI 功能配置新增"图生图能力"开关，新建图片配置默认开启，非图片配置强制关闭；素材配置选项只额外返回能力标记。素材新增文生图 / 图生图单选模式，图生图要求一张 PNG、JPEG 或 WebP 参考图（不超过 5MB），只允许选择已开启能力的配置；列表显示生成模式，详情回显参考图。
- 素材新增 `generationMode/referenceFileId/referenceImageUrl` 字段，创建和编辑接口改为兼容参考图的 multipart 表单。参考图进入 `ai-materials/{environment}/objects/...` 受管路径并使用独立 `source` 引用，替换、切回文生图或删除素材时进入既有 24 小时延迟清理；生成图继续使用 `current` 引用，两类文件互不覆盖。
- 后台任务快照固定生成模式和参考文件 ID；执行图生图时重新校验文件归属、状态、大小与真实图片格式，再以内联 Data URL 调用 DashScope 多模态生图并开启 `prompt_extend`。配置能力关闭或实际协议不是 DashScope 时明确失败，不自动降级为文生图；编辑冲突、失败和中断仍保留旧生成图，未调用 Agent、识图模型或文本润色。
- 新增增量迁移 `1792400400000-AddImageToImageMaterials`，为历史图片生成配置安全回填图生图能力，历史素材默认为文生图；存在图生图素材、参考图或显式关闭能力的配置时拒绝破坏性回退。同步更新素材设计方案与界面规范。
- 验证：后端变更文件 ESLint、Prettier、TypeORM 实体检查、3 套 / 20 项 Jest 及 Nest 生产构建通过；前端 `vue-tsc`、组件复用扫描和 Vite 生产构建通过，diff 空白检查通过。未连接数据库、执行迁移、启动服务、调用真实生图服务或写入 OSS；`web/components.d.ts` 的用户既有未提交差异保持不纳入提交。

新增文件（3）：

- `server/src/common/ai/image-generation.spec.ts`
- `server/src/migrations/1792400400000-AddImageToImageMaterials.spec.ts`
- `server/src/migrations/1792400400000-AddImageToImageMaterials.ts`

修改文件（22）：

- `.design-spec.md`
- `CHANGELOG.md`
- `MD/AI素材生成与存储清理设计方案.md`
- `server/src/ai-feature-configs/ai-feature-configs.service.spec.ts`
- `server/src/ai-feature-configs/ai-feature-configs.service.ts`
- `server/src/ai-feature-configs/dto/ai-feature-config.dto.ts`
- `server/src/ai-feature-configs/entities/ai-feature-config.entity.ts`
- `server/src/ai-materials/ai-material.constants.ts`
- `server/src/ai-materials/ai-materials.controller.ts`
- `server/src/ai-materials/ai-materials.service.ts`
- `server/src/ai-materials/dto/ai-material.dto.ts`
- `server/src/ai-materials/entities/ai-material.entity.ts`
- `server/src/ai-materials/entities/material-generation-task.entity.ts`
- `server/src/common/ai/image-generation.ts`
- `server/src/managed-files/managed-files.module.ts`
- `server/src/managed-files/managed-files.service.ts`
- `web/src/api/aiFeatureConfig.ts`
- `web/src/api/aiMaterial.ts`
- `web/src/views/ai-feature-config/Edit.vue`
- `web/src/views/ai-material/Edit.vue`
- `web/src/views/ai-material/Index.vue`
- `web/src/views/ai-material/View.vue`

删除文件：无。

### 2026-10-19 收敛 AI 功能配置侧边导航

- "AI 功能配置"在侧边栏收敛为单一可点击入口，功能配置、AI 指令集和 AI 工作流继续在页面内按原权限展示页签；访问任一页签路由时统一保持该侧边入口激活。
- 已有环境保留三个历史子菜单的数据库 ID、路径与父级，但启动协调时统一停用；全新环境不再创建重复子菜单。旧书签和兼容地址继续重定向到对应页签，未扩大任何页面或接口权限。
- 验证：后端 TypeScript 生产配置无输出检查、变更文件 ESLint、TypeORM 实体检查及 3 套 / 17 项菜单 Jest 通过；前端 `vue-tsc --noEmit`、组件复用扫描及 10 项导航测试通过；变更代码格式与 diff 空白检查通过。按导航优化规则未 build 或启动服务，`web/components.d.ts` 用户既有改动保持不变且不纳入提交。

新增文件：无。

修改文件（7）：

- `.design-spec.md`
- `CHANGELOG.md`
- `server/src/menus/menu-structure.spec.ts`
- `server/src/menus/menus.service.spec.ts`
- `server/src/menus/menus.service.ts`
- `web/src/layouts/MainLayout.vue`
- `web/src/router/systemNavigation.test.mjs`

删除文件：无。

### 2026-10-19 修复接口日志来源重复登记

- 修复素材模块在同一源码文件声明两个 Controller，导致日志扫描器把任务接口误归到 `/ai-materials` 并重复生成 `GET /ai-materials` 唯一键的问题；素材生成任务 Controller 已拆分到独立文件，实际路由与日志元数据均为 `/material-generation-tasks`。
- 日志接口扫描先剔除独立注释和块注释中的装饰器示例，再按 `method + path` 稳定去重；来源同步由"先查再 save"改为数据库唯一键 `upsert`，同时覆盖单批重复声明及多实例并发初始化，已有部分来源数据可在重启时幂等补齐。
- 验证：TypeScript 生产配置无输出检查、变更文件 ESLint、TypeORM 实体检查及相关 4 套 / 9 项 Jest 通过；按缺陷修复规则未 build、启动服务或连接数据库。`web/components.d.ts` 用户既有改动保持不变且不纳入提交。

新增文件（3）：

- `server/src/ai-materials/material-generation-tasks.controller.ts`
- `server/src/log-records/log-api-scanner.spec.ts`
- `server/src/log-records/log-records.service.spec.ts`

修改文件（5）：

- `CHANGELOG.md`
- `server/src/ai-materials/ai-materials.controller.ts`
- `server/src/ai-materials/ai-materials.module.ts`
- `server/src/log-records/log-api-scanner.ts`
- `server/src/log-records/log-records.service.ts`

删除文件：无。

### 2026-10-19 新增 AI 素材生成与安全清理

- 在"内容创作"下新增素材管理：用户保存提示词、受控风格和图片生成配置后，可提交持久化异步任务；列表展示 40×40 缩略图与实时状态，支持查看、编辑、下载、重新生成、删除和批量删除。重新生成只在新图校验、保存并事务挂接成功后切换当前结果，失败、迟到响应或编辑版本冲突均保留旧图。
- AI 功能配置新增 `imageGeneration` 类型，只从账号的 `imageGenerationModels` 目录选型并调用完整生图端点；默认画面要求仅参与提示词拼接，不调用 Agent、文本润色或文本模型校验，也不回退识图/聊天模型。任务使用请求 UUID 幂等、素材版本、单用户/单素材活跃锁、条件抢占与租约；中断和不确定计费请求不自动重试。
- 新增受管文件与引用登记，图片写入固定 `ai-materials/{environment}/objects/{ownerId}/{materialId}/{revision}` 路径；本地及阿里云 OSS 保存实际对象键、存储位置指纹和文件状态。新引用建立后旧图进入 24 小时延迟清理，管理员在 OSS/CDN 页面先预览、再按登记 ID 精确删除；清理强制限定当前环境、当前存储位置、无有效引用和到期状态，不扫描文章封面或历史上传目录。
- 新增 `AiMaterial.*` 与 `MediaStorage.read/update` 权限、菜单和角色授权展示；存储配置说明同步为本地及阿里云 OSS 已实现，COS/Kodo 不再宣称静默回退。新增数据库迁移 `1792396800000-CreateAiMaterials` 创建素材、任务、受管文件及引用四张表，有业务数据时拒绝破坏性回退。
- 验证：后端 TypeORM 实体检查与 Nest 生产构建通过；前端 `vue-tsc --noEmit` 及 Vite 生产构建通过；相关 6 套 / 32 项 Jest 通过；Prettier 与 diff 空白检查通过。未连接真实数据库、执行迁移、启动服务、调用付费生图、写入真实 OSS/CDN 或执行物理清理，部署前仍需在专用测试数据与前缀上验收。`web/components.d.ts` 的用户既有未提交改动保持不纳入提交。

新增文件（19）：

- `server/src/ai-materials/ai-material.constants.spec.ts`
- `server/src/ai-materials/ai-material.constants.ts`
- `server/src/ai-materials/ai-materials.controller.ts`
- `server/src/ai-materials/ai-materials.module.ts`
- `server/src/ai-materials/ai-materials.service.ts`
- `server/src/ai-materials/dto/ai-material.dto.ts`
- `server/src/ai-materials/entities/ai-material.entity.ts`
- `server/src/ai-materials/entities/material-generation-task.entity.ts`
- `server/src/managed-files/dto/managed-file.dto.ts`
- `server/src/managed-files/entities/managed-file-reference.entity.ts`
- `server/src/managed-files/entities/managed-file.entity.ts`
- `server/src/managed-files/managed-files.controller.ts`
- `server/src/managed-files/managed-files.module.ts`
- `server/src/managed-files/managed-files.service.ts`
- `server/src/migrations/1792396800000-CreateAiMaterials.ts`
- `web/src/api/aiMaterial.ts`
- `web/src/views/ai-material/Edit.vue`
- `web/src/views/ai-material/Index.vue`
- `web/src/views/ai-material/View.vue`

修改文件（18）：

- `.design-spec.md`
- `CHANGELOG.md`
- `MD/AI素材生成与存储清理设计方案.md`
- `server/src/ai-feature-configs/ai-feature-config.constants.ts`
- `server/src/ai-feature-configs/ai-feature-configs.service.ts`
- `server/src/app.module.ts`
- `server/src/knowledge-ai-providers/knowledge-ai-providers.service.spec.ts`
- `server/src/knowledge-ai-providers/knowledge-ai-providers.service.ts`
- `server/src/menus/menus.service.ts`
- `server/src/uploads/uploads.service.ts`
- `server/src/users/users.service.ts`
- `web/src/api/aiFeatureConfig.ts`
- `web/src/api/knowledgeAiProvider.ts`
- `web/src/api/storageConfig.ts`
- `web/src/router/index.ts`
- `web/src/views/ai-feature-config/Edit.vue`
- `web/src/views/role/Edit.vue`
- `web/src/views/storage-config/Index.vue`

删除文件：无。

### 2026-10-19 明确 ComfyUI 同机直连接入范围

- 根据用户确认的部署关系，将 ComfyUI 方案收敛为 NestJS 后端与 ComfyUI 同机直连；保留 Docker/WSL 网络边界与实际地址核对，不默认同机一定共用 localhost。
- 首期连接表单仅提供名称、服务地址和启用状态，连接模式固定 direct；设备配对、deviceId 和本机连接器移至将来远端部署的扩展范围，不作为当前实施依赖。
- 更新分阶段步骤与待确认项：先验证图片工作流，再准备视频工作流；本次仅调整方案，未改业务代码、接口或运行配置。
- 验证：Markdown 格式、文档链接、编码、代码块闭合及 diff 空白检查；未 build、启动服务或执行生成任务。
- 新增文件：无。修改文件：`MD/ComfyUI本机工作流接入设计方案.md`、`CHANGELOG.md`。删除文件：无。`web/components.d.ts` 既有改动不纳入提交。

### 2026-10-19 AI 素材生成与 ComfyUI 接入方案

- 分别新增 AI 素材生成与存储清理、ComfyUI 本机工作流接入两份设计方案，均标记为待确认，未实现业务代码。
- 结合当前模型账号能力目录、同步图片协议、文章独立封面生成、MySQL 持久任务、上传实现及第三方配置，明确复用与新增边界。本地存储配置仅核对启用状态、provider、uploadDir 和配置是否填写，不输出凭据或实际域名/Bucket。
- 素材方案覆盖提示词/风格、独立生图配置、成功后替换当前结果、唯一对象键、文件登记和引用保护、延迟精确清理、存储配置变更及 CDN 缓存边界，避免删除旧业务文件。
- ComfyUI 方案结合官方自托管接口和源码，覆盖同机直连/远端连接器、API 工作流导入与版本化、参数映射、真实节点进度、断线恢复、提交不确定性、版本差异及安全取消、视频流式归档和本机文件清理；分阶段实施并列明实机验收条件。
- 文档按项目既有 MD 目录和文档编写技能组织，包含前后端字段、权限、接口、目录拆分和验收清单；没有将未批准方案写成现行 UI 规范。
- 验证：交叉链接、编码、代码块闭合、Markdown 格式及 diff 空白检查。仅文档改动，未运行应用测试/build、启动服务、连接数据库、执行生成任务或修改 OSS/CDN/ComfyUI 配置；本机部署方式和具体工作流待用户确认。
- web/components.d.ts 既有改动保持不变，不纳入提交。

新增文件（2）：

- `MD/AI素材生成与存储清理设计方案.md`
- `MD/ComfyUI本机工作流接入设计方案.md`

修改文件（1）：`CHANGELOG.md`。

删除文件：无。

### 2026-10-19 文章统一采纳标题、正文与封面

- 文章查看弹窗底部仅保留复制正文、采纳并保存和关闭，移除复制推荐标题及标题/封面的独立勾选；独立生成记录详情同步采用一个采纳入口，不再提供复制标题操作。
- 点击采纳并确认后，通过现有接口一次保存正文、非空生成标题和成功且地址非空的候选封面。没有生成标题时保留原标题，封面缺失、失败、中断或跳过时保留原封面；确认文案按实际将替换的字段展示。保留权限、文章版本、封面活跃状态、重复提交、关闭/路由离开与迟到响应保护，不自动调用 AI 或新增采纳请求。
- 仅调整前端按候选可用性传入既有 adoptTitle/adoptCover 字段，后端/API/数据库结构不变，原有服务端事务与缺省 false 的兼容行为不变。同步设计规范和离线回归用例。
- 验证：前端全量 150 项 Node 离线回归、vue-tsc 无输出类型检查、相关 Vue 模板/scoped CSS 编译、Prettier、组件复用核查及 diff 空白检查通过。覆盖统一采纳、缺失/空白标题、成功/无效封面、复制正文隔离及原有权限/版本/并发保护。
- 按界面调整范围未 build、启动/重启服务、连接数据库、调用真实 AI 或进行浏览器视觉验收。web/components.d.ts 既有改动及 SHA256 保持不变，不纳入提交。

新增文件：无。

修改文件（6）：

- `.design-spec.md`
- `CHANGELOG.md`
- `web/src/views/content-article/View.vue`
- `web/src/views/content-article/Tasks.vue`
- `web/src/views/content-article/preview.test.mjs`
- `web/src/views/content-article/tasks.test.mjs`

删除文件：无。

### 2026-10-19 文章列表回显 40×40 封面缩略图

- 文章列表封面由 56×36 改为固定 40×40px，保持 cover 缩放、小圆角和原有 Table 图片插槽。图片加载失败保持同尺寸占位，空封面显示"—"。
- 优先显示已保存 coverUrl；为空时，仅回显最新成功任务中已生成、且绑定文章版本仍匹配的候选封面，右下角 AI 标记和悬浮文案说明未采纳。不自动保存或采纳，不回退旧任务；失败、排队、中断、跳过、已采用后没有保存封面及版本冲突时不展示候选。既有封面不会被候选替换。
- 前后端对齐 latestTask.generatedCoverUrl 可空标量；服务端最新任务查询保留本人/文章范围与 MAX(id) 逻辑，仅通过 JSON_EXTRACT/JSON_UNQUOTE 提取成功候选地址，JSON 类型非字符串则返回 null。列表不加载整个 coverData、正文、构思或素材快照，不逐行查询详情，不调用 AI；不新增实体列、权限或数据库迁移。
- 验证：后端全量 49 套 / 503 项 Jest、前端全量 146 项 Node 离线回归通过；后端生产源码 tsc --noEmit（tsconfig.build.json）、前端 vue-tsc 无输出类型检查、变更后端 ESLint、Prettier、Vue 模板/scoped CSS 编译、组件复用核查及 diff 空白检查通过。覆盖保存封面优先、最新候选回显、版本/状态/空值边界及列表标量投影。
- 补充检查：包含全部测试文件的后端 tsconfig.json 类型检查仍报 4 处未修改测试错误：agent-workspace.service.spec.ts 的 ExecutionContext/AgentApp 断言、menus.service.spec.ts 的 null/Date 赋值、system-access.spec.ts 的 ExecutionContext 断言。未扩展修改这些既有文件；相关 Jest 仍通过。
- 按修复范围未 build、启动/重启服务、连接数据库、调用真实 AI 或进行浏览器视觉验收。web/components.d.ts 既有改动与 SHA256 保持不变，不纳入提交。

新增文件：无。

修改文件（7）：

- `.design-spec.md`
- `CHANGELOG.md`
- `server/src/content-articles/content-generation.service.ts`
- `server/src/content-articles/content-generation.service.spec.ts`
- `web/src/api/contentArticle.ts`
- `web/src/views/content-article/Index.vue`
- `web/src/views/content-article/generate.test.mjs`

删除文件：无。

### 2026-10-19 同账号独立生成情感表达封面

- 新文章任务在正文成功持久化后进入独立封面阶段。直接读取本次 AI 配置的模型账号，选取生图目录 imageGenerationModels 首个有效模型；不调用 Agent、不创建会话、不使用识图目录 visionModels，也不回退其它模型或账号。缺模型、有效目录或完整生图端点时跳过，且不追加构思或生图请求。
- 原文本模型根据本次生成标题和正文总结主题、核心情感、视觉意象与光影色调，再按账号 OpenAI / DashScope 同步生图协议生成一张概念插画。保留原协议尺寸策略（OpenAI 1024×1024，DashScope 模型默认），不猜测宽屏参数；无文字、水印，不伪造新闻现场照片或真实当事人证据。不发送原封面、已保存正文及其它文章，不修改配置或模板。
- 将图片请求/响应协议、格式检查及受限安全下载提取为 common/ai 公共能力；Agent 保留兼容导出与既有调用行为。封面路径仅依赖模型账号与 UploadsService，下载防内网地址、DNS 重绑定和重定向，限制响应/图片大小；校验后保存统一本地/OSS 公开上传存储，不将供应商临时地址作为持久候选。
- 任务新增可空 coverStatus / coverData，详情携带候选地址、构思、实际模型、构思 Token 用量及安全提示，列表仅加载封面状态。新快照 coverRequested 标记启用，历史任务不补计费。正文先保存、候选封面不自动写入文章；封面阶段延续活跃锁与幂等约束，整体 120 秒期限 / 150 秒租约，构思最多 45 秒。未开始的封面可在重启后消费；已运行超时/中断只转终态，不自动重复可能已计费的请求。生图或存储失败不清空已生成标题/正文。
- 查看弹窗和生成记录详情复用 CoverPreview 展示当前候选、真实状态及折叠构思，记录列表新增封面状态；封面生成中继续轮询、防重复生成，正文仍可复制，结束后才允许采用。默认不勾选"同时采纳生成封面"，明确选择并二次确认才替换；可选布尔 adoptCover 默认 false，后端仅采用本任务已成功存储的 URL，沿用权限/归属/版本校验，与正文、可选标题及采用状态事务更新。失败/跳过可正常仅采用正文，旧调用保留原封面。同步前端类型、费用说明及设计规范。
- 验证：后端全量 49 套 / 502 项 Jest、前端全量 145 项 Node 离线回归通过；前端无输出类型检查、相关 Vue 模板/scoped CSS 编译、变更后端 ESLint、Prettier、组件复用核查与 diff 空白检查通过。新功能执行后端 build，TypeORM 实体校验和 Nest 构建通过。覆盖同账号选型/缺配置跳过、两种生图协议、安全下载复用、异常/取消/存储失败、正文独立持久化、抢占/租约/停服、显式采用与版本冲突、前端轮询及默认不覆盖。
- 新增迁移 1792393200000-AddContentCover，仅增可空列和队列索引，不回填历史；有数据时拒绝破坏性回退。部署前在关闭自动同步的环境执行迁移，并统一更新前后端及全部任务消费者，避免新旧消费者混跑。本次未连接真实数据库、执行迁移、启动/重启服务、调用真实 AI、生图计费或进行浏览器视觉验收。
- web/components.d.ts 原有未提交内容及 SHA256 保持不变，不纳入本次提交。

新增文件（7）：

- `server/src/common/ai/image-generation.ts`
- `server/src/common/ai/image-utils.ts`
- `server/src/content-articles/content-cover.service.spec.ts`
- `server/src/content-articles/content-cover.service.ts`
- `server/src/migrations/1792393200000-AddContentCover.spec.ts`
- `server/src/migrations/1792393200000-AddContentCover.ts`
- `web/src/views/content-article/CoverPreview.vue`

修改文件（21）：

- `.design-spec.md`
- `CHANGELOG.md`
- `server/src/agent-apps/agent-image-utils.ts`
- `server/src/agent-apps/agent-media.service.ts`
- `server/src/content-articles/content-articles.controller.ts`
- `server/src/content-articles/content-articles.module.ts`
- `server/src/content-articles/content-generation.service.spec.ts`
- `server/src/content-articles/content-generation.service.ts`
- `server/src/content-articles/dto/content-article.dto.ts`
- `server/src/content-articles/entities/content-generation-task.entity.ts`
- `server/src/knowledge-ai-providers/knowledge-ai-media-target.spec.ts`
- `server/src/knowledge-ai-providers/knowledge-ai-providers.service.ts`
- `web/src/api/contentArticle.ts`
- `web/src/views/content-article/Generate.vue`
- `web/src/views/content-article/Index.vue`
- `web/src/views/content-article/Tasks.vue`
- `web/src/views/content-article/View.vue`
- `web/src/views/content-article/contentArticle.test.mjs`
- `web/src/views/content-article/preview.test.mjs`
- `web/src/views/content-article/taskState.ts`
- `web/src/views/content-article/tasks.test.mjs`

删除文件：无。


### 2026-10-19 修复编辑正文回填并恢复查看初始想法

- 修复编辑弹窗只读取已保存文章、未采纳生成稿导致正文留空的问题：改为复用现有 preview 接口同时读取 article/latestTask。已保存正文为空、最新任务成功且 articleVersion 与当前文章 version 一致时，自动将 result 填入正文编辑框；标题、想法和生成设置保持原值，不调用 AI 或自动写入数据库。
- 回填基线仍使用数据库已保存内容，生成稿作为未保存编辑草稿，点击保存才写回，未保存关闭仍需确认。已有正文、文章版本已变化或已采用后清空正文时不自动覆盖，提供"载入最新生成正文"二次确认后仅替换编辑框正文。只使用最新成功/已采用任务的非空结果，不从失败、待补充、运行任务或更早成功稿兜底；编辑期间不轮询覆盖手工输入，关闭/切换/卸载后的迟到响应不回填。
- 查看弹窗恢复默认展开、可收起的"初始想法"区，优先显示最新任务 snapshot.idea；没有任务或历史快照缺少该字段时使用文章 idea，明确空素材时不替换成后来修改的想法。素材安全转义，不混入标题或正文复制；继续保留精简布局、当前生成内容与采纳操作，不恢复 Tab、刷新按钮或生成记录跳转。
- 字段和 API 契约不变，仅前端复用 article.content、latestTask.result/articleVersion/snapshot.idea；无后端、数据库、权限或生成协议改动。同步设计规范。
- 验证：前端 141 项 Node 离线回归、Vue 无输出类型检查、页面模板/scoped CSS 编译、Prettier、组件复用核查及 diff 空白检查通过。覆盖自动回填、保存落库参数、手工稿保护、版本变化、异常任务、未保存退出、迟到响应与初始素材来源。按修复范围未 build、启动/重启服务、连接数据库、调用真实 AI 或进行浏览器视觉验收。
- `web/components.d.ts` 已有未提交改动及 SHA256 保持不变，不纳入提交。

新增文件：无。

修改文件（6）：

- `.design-spec.md`
- `CHANGELOG.md`
- `web/src/views/content-article/Edit.vue`
- `web/src/views/content-article/View.vue`
- `web/src/views/content-article/contentArticle.test.mjs`
- `web/src/views/content-article/preview.test.mjs`

删除文件：无。

### 2026-10-19 精简文章生成预览并提供直接采纳

- 文章创作列表移除顶部及行内"生成记录"跳转和手动刷新按钮，操作列由 340px 收窄至 260px；查看弹窗同步移除记录跳转、刷新按钮及最新生成/已保存正文 Tab。独立生成记录菜单、路由、历史详情与筛选保持不变；查询、写入成功及活跃任务的自动列表更新保留。
- 查看弹窗只展示最新一次生成的正文与 AI 推荐标题，移除想法、封面、原标题和已保存正文展示；标题/正文分别复制。无任务显示暂无生成内容，失败、待补充、排队或中断显示必要真实状态，不回退旧成功稿或已保存正文。历史无生成标题的记录明确说明采纳正文将保留原标题，不冒充 AI 已推荐标题。
- 弹窗直接提供"采纳并保存"，复用既有 `adoptContentTask(taskId, version, adoptTitle)` 与 ContentArticle.update 权限；默认勾选同时采纳推荐标题，可取消后仅采纳正文。二次确认后写入，成功原地显示已采用并通知列表更新；无权限、版本冲突、非成功、无正文及已采用任务不得提交。旧记录仅采纳正文，不新增后端字段、接口或数据库迁移。
- 读取仍在每次打开时重新请求，运行任务每 3 秒自动获取完成结果；读取失败清空旧内容，关闭后重新打开重试。采纳期间防重复、误关闭、路由离开和页面刷新；切换文章或卸载后的迟到响应不能回填。采纳失败保留候选供复制，不伪装已保存、不调用 AI。复用公共 Checkbox / Button / Dialog，底部操作支持窄屏换行。
- 首次生成和按已保存配置直接生成的成功提示统一指向文章"查看"，不再引导跳转生成记录；同步设计规范。
- 验证：前端全量 133 项 Node 离线回归、Vue 无输出类型检查、页面模板/scoped CSS 编译、组件复用核查和 diff 空白检查通过。覆盖重新打开读最新稿、无结果不回退、轮询停止、标题/正文采纳、权限/版本/重复提交拦截、失败与迟到响应。本次为前端交互调整，未 build、启动/重启服务、连接数据库、调用真实 AI 或进行浏览器视觉验收。
- `web/components.d.ts` 原有未提交内容及 SHA256 保持不变，不纳入提交。

新增文件：无。

修改文件（7）：

- `.design-spec.md`
- `CHANGELOG.md`
- `web/src/views/content-article/Index.vue`
- `web/src/views/content-article/View.vue`
- `web/src/views/content-article/Generate.vue`
- `web/src/views/content-article/preview.test.mjs`
- `web/src/views/content-article/generate.test.mjs`

删除文件：无。

### 2026-10-19 文章生成协议增加发布标题与可选采用

- 模型返回协议扩展为 `outcome/title/body/notes`：输入标题作为主题或工作标题，结合正文和模板中的平台、读者、口吻要求重新拟定适合自媒体发布的标题；未指定平台时使用通用自媒体表达。标题为单行纯文本、最多 160 字符，正文不重复总标题。保留此前直接成稿规则，不恢复新闻素材强制审核门槛，不修改用户模板与 AI 配置。
- 当前生成链路要求 draft 同时返回非空标题和正文，格式异常明确失败，不降级保存原始响应、不自动重试计费调用。解析器兼容旧无标题协议；历史任务及 needs_input 保留原有处理。任务新增可空 `generatedTitle`，详情返回、列表不加载，标题与正文分别保存，不自动覆盖文章。
- 生成记录详情展示和复制发布标题，采用时提供默认勾选的"同时采用生成标题"，取消后仅采用正文；同一任务后台刷新保留取消选择。采用接口新增可选布尔 `adoptTitle`，缺省 false 兼容旧调用，只采用任务中的标题，不接受任意客户端标题。标题、正文、版本和采用状态在同一事务内更新，继续校验权限、归属与版本冲突。旧任务无标题时仍可仅采用正文。
- 文章最新预览显示生成标题并标注原标题；已保存页签保持已保存标题。标题与正文独立复制，失败、待补充等状态不展示过期候选；历史无标题记录明确提示，不冒充已生成标题。复用 Checkbox / Button / Dialog，不增加文章内容字段或额外菜单。同步设计规范。
- 新增迁移 `1792386000000-AddContentGeneratedTitle`：仅添加可空 varchar(160)，可重复检查，不回填历史、不改写正文；已有标题数据时拒绝破坏性回退。关闭自动同步的环境应先执行迁移，再统一更新前后端与任务消费者；历史任务需要用户主动重新生成才会获得新标题。本次未连接真实数据库、执行迁移或启动/重启服务。
- 验证：后端 47 套 / 482 项 Jest、前端 128 项 Node 离线回归通过；前端无输出类型检查、变更后端 ESLint、两处 Vue 模板/scoped CSS 编译及 diff 空白检查通过。新增标题功能执行后端 build，TypeORM 实体校验与 Nest 构建通过；未执行前端产物构建、真实模型调用或浏览器视觉验收。
- `web/components.d.ts` 原有未提交改动及 SHA256 保持不变，不纳入提交。

新增文件（2）：

- `server/src/migrations/1792386000000-AddContentGeneratedTitle.ts`
- `server/src/migrations/1792386000000-AddContentGeneratedTitle.spec.ts`

修改文件（14）：

- `.design-spec.md`
- `CHANGELOG.md`
- `server/src/content-articles/content-writing.ts`
- `server/src/content-articles/content-writing.spec.ts`
- `server/src/content-articles/content-generation.service.ts`
- `server/src/content-articles/content-generation.service.spec.ts`
- `server/src/content-articles/entities/content-generation-task.entity.ts`
- `server/src/content-articles/dto/content-article.dto.ts`
- `server/src/content-articles/content-articles.controller.ts`
- `web/src/api/contentArticle.ts`
- `web/src/views/content-article/Tasks.vue`
- `web/src/views/content-article/View.vue`
- `web/src/views/content-article/tasks.test.mjs`
- `web/src/views/content-article/preview.test.mjs`

删除文件：无。

### 2026-10-19 生成记录独立模块与文章最新生成稿预览

- 新增"内容创作 → 生成记录"独立页面 `/content-generation`，复用 Demo 的 PageContainer / Table / Dialog 结构。支持分页、文章标题及状态筛选；文章列表顶部进入全部记录，行内及查看弹窗入口按 articleId 定位。菜单种子幂等补齐，沿用 ContentArticle.read，采用沿用 ContentArticle.update，不扩大授权。
- 新增 `GET /content-articles/tasks` 标量记录列表和 `GET /content-articles/:id/preview` 最新预览接口；查询参数 page/pageSize/keyword/articleId/status 前后端对齐。列表按任务 ID 倒序，只查询本人及未删除文章的任务，不加载 result/snapshot/editorNotes 等大字段。无新增数据库列或迁移，原有单篇记录及采用接口兼容保留。
- 文章编辑/查看弹窗移除嵌套历史记录表。查看每次打开重新读取接口，默认展示最新一次生成稿，已保存正文独立页签；无任务时展示已保存正文。最新任务失败、待补充、排队或中断时不回退旧成功稿；查看和刷新不自动采用、不重新生成、不覆盖文章。
- 任务详情每次打开重读当前任务及文章版本，相关读取接口禁止缓存；前端隔离关闭、切换、卸载后的迟到响应，读取失败清空旧详情并提供手动重试。活跃任务每 3 秒刷新，选中详情不在当前列表页时仍更新；完成停止轮询，后台刷新保留展开素材区。采用仍需确认和服务端版本校验，并防止写回期间误关闭/离开。
- 同步生成成功提示与设计规范，修正 Dialog Teleport 后的长文本换行作用域。正文、快照与编辑提示仍安全转义，复制只取当前所选正文，不混入提示。
- 验证：后端 46 套 / 464 项 Jest、前端 124 项 Node 离线回归通过；前端无输出类型检查、后端变更文件 ESLint、Vue 模板/scoped CSS 编译及 diff 空白检查通过；新增模块执行后端 build，TypeORM 实体检查和 Nest 构建通过。未启动/重启服务、连接真实数据库、调用真实模型或进行浏览器视觉验收；前端未执行产物构建。
- 部署后需更新前后端，后端启动时补齐新菜单，刷新登录菜单可见。无自动生成或历史数据改写。`web/components.d.ts` 原有未提交变更 SHA256 保持不变，不纳入提交。

新增文件（2）：

- `web/src/views/content-generation/Index.vue`
- `web/src/views/content-article/preview.test.mjs`

修改文件（19）：

- `.design-spec.md`
- `CHANGELOG.md`
- `server/src/content-articles/content-articles.controller.ts`
- `server/src/content-articles/content-generation.service.ts`
- `server/src/content-articles/content-generation.service.spec.ts`
- `server/src/content-articles/dto/content-article.dto.ts`
- `server/src/menus/menus.service.ts`
- `server/src/menus/menus.service.spec.ts`
- `web/src/api/contentArticle.ts`
- `web/src/router/index.ts`
- `web/src/router/systemNavigation.test.mjs`
- `web/src/views/content-article/Edit.vue`
- `web/src/views/content-article/Generate.vue`
- `web/src/views/content-article/Index.vue`
- `web/src/views/content-article/Tasks.vue`
- `web/src/views/content-article/View.vue`
- `web/src/views/content-article/contentArticle.test.mjs`
- `web/src/views/content-article/generate.test.mjs`
- `web/src/views/content-article/tasks.test.mjs`

删除文件：无。

### 2026-10-19 取消文章生成的新闻素材强制审核门槛

- 调整后台固定写作提示词：默认直接按作者素材、观点和模板成稿，不再因缺少新闻来源链接、准确日期、学校/课程、当事方回应或处理结果而要求补全后才能生成。材料较少时省略细节、缩短篇幅或围绕主题评论，不输出核查清单、写作方案，不逐项追问措辞。配置中的身份和风格继续生效，但"新闻工作者"等称谓不自动附加采访、核验或审核流程；未改用户保存的模板与 AI 配置。
- 仅保留不编造事实/来源/引语、不冒充已独立核实、不将未证实个人指控或歧义行为写成确定事实等基础要求。未接入新闻检索或外链读取，本次没有启用联网、真实调用模型或自动重新生成历史任务。
- 每次实际模型调用加入服务器当前时间、任务提交时间及 Asia/Shanghai 时区；任务时间仅用于理解相对日期，不当成事件日期。禁止拿知识截止日期代替当前日期或据此断言素材时间线错误；日期由运行时生成，不硬编码，不新增数据库列或接口字段。
- 默认返回 draft，编辑提示默认空且仅在必要时建议 1～2 条；只有完全无法理解写作主题时才请求补充。解析器继续兼容旧版六条提示与历史 needs_input，模型真实返回待补充时仍保留状态，不伪装成功、不自动追加计费调用。原有正文格式、权限、幂等、候选采用和版本校验保持不变。
- 同步生成弹窗与 AI 配置编辑页说明，移除"新闻类请先提供来源、日期"等强制前置文案；更新设计规范。既有历史任务及候选正文保持原样，新部署后的生成调用使用新规则，无需新增数据库迁移。
- 验证：后端 46 套 / 455 项 Jest、前端 115 项 Node 离线回归通过；前后端无输出类型检查、变更后端 ESLint、Vue 模板/scoped CSS 编译与 diff 空白检查通过。覆盖默认成稿、配置/模板不被篡改、上海时区跨日/跨年、任务提交时间传入及旧状态兼容。未 build、启动/重启服务、连接真实数据库或调用真实模型；实际文章效果需重新生成后验收。
- `web/components.d.ts` 已有未提交内容保持原样，SHA256 未变，不纳入本次提交。

新增文件：无。

修改文件（10）：

- `.design-spec.md`
- `CHANGELOG.md`
- `server/src/content-articles/content-writing.ts`
- `server/src/content-articles/content-writing.spec.ts`
- `server/src/content-articles/content-generation.service.ts`
- `server/src/content-articles/content-generation.service.spec.ts`
- `web/src/views/ai-feature-config/Edit.vue`
- `web/src/views/ai-feature-config/contentFormat.test.mjs`
- `web/src/views/content-article/Generate.vue`
- `web/src/views/content-article/generate.test.mjs`

删除文件：无。

### 2026-10-19 文章记住生成设置与一键重新生成

- 文章新增可空 `aiConfigId/templateId`，前后端字段一致。已有配置时，列表行内和顶部单选"AI 生成"读取最新已保存文章后直接提交后台任务，不再重复弹出选择窗口；未配置时仍先选择，点击"开始生成"才写入。可选的通用写作也记住 AI 配置，不引入批量生成或自动调用。
- 编辑页保留标题、封面、想法、正文四个内容字段，增加独立"生成设置"区，复用 Form/Select/Button 更换 AI 配置（含模型/正文格式）及本人写作模板。保存设置不调用模型，清空配置下次重新选择，清空模板使用通用写作；读取失败、搜索和分页不静默清空已保存项，设置变化纳入未保存离开保护。
- 首次生成将选择与任务在同一事务内持久化；偏好变化递增文章版本，候选稿绑定变化后的版本，快照保留原 `requestVersion` 以正确重放网络重试。复用相同设置不更新文章版本或正文。保留用户/文章活跃任务唯一约束、本人隔离、模板读取权限、配置有效性及版本冲突检查；不静默替换模型/模板，不自动重试计费请求。
- 直接生成期间禁重复点击与误离开；网络/服务端回执不确定时再次点击复用原请求及参数，明确拒绝后允许修正设置再提交。保存时只校验新选择的配置/模板，历史失效偏好不阻止单纯编辑正文；真正生成时始终重新校验，权限撤销不能回退到通用模板悄悄生成。未覆盖原有候选采用及后台任务生命周期。
- 新增迁移 `1792382400000-RememberContentGenerationSettings`：可空整数列，首次新增配置列时按同一用户最近未删除任务回填选择；重复执行不覆盖后来清空的设置。回退遇到已有设置先拒绝，避免丢失偏好。应先执行迁移，再统一部署前后端与任务消费者；本次未执行真实数据库迁移或启动/重启服务。
- 验证：后端 46 套 / 451 项 Jest、前端 113 项 Node 离线回归通过；前后端无输出类型检查、变更后端 ESLint、TypeORM 列检查、源码离线 MySQL 元数据检查、Vue 模板/scoped CSS 编译、组件复用检查、diff 空白检查通过。按既有生成交互优化范围未运行 build；未连接真实数据库、调用真实模型或开展浏览器视觉验收。
- 已有未提交的 `web/components.d.ts` 保持原样并校验哈希，不纳入本次提交。未改动新闻联网能力、用户模板正文或 AI 账号配置。

新增文件（5）：

- `server/src/migrations/1792382400000-RememberContentGenerationSettings.ts`
- `server/src/migrations/1792382400000-RememberContentGenerationSettings.spec.ts`
- `web/src/views/content-article/GenerationSettings.vue`
- `web/src/views/content-article/generationRequest.ts`
- `web/src/views/content-article/generationSettings.test.mjs`

修改文件（16）：

- `.design-spec.md`
- `CHANGELOG.md`
- `server/src/content-articles/content-articles.controller.ts`
- `server/src/content-articles/content-articles.service.ts`
- `server/src/content-articles/content-articles.service.spec.ts`
- `server/src/content-articles/content-generation.service.ts`
- `server/src/content-articles/content-generation.service.spec.ts`
- `server/src/content-articles/dto/content-article.dto.ts`
- `server/src/content-articles/entities/content-article.entity.ts`
- `server/src/content-articles/entities/content-generation-task.entity.ts`
- `web/src/api/contentArticle.ts`
- `web/src/views/content-article/Edit.vue`
- `web/src/views/content-article/Generate.vue`
- `web/src/views/content-article/Index.vue`
- `web/src/views/content-article/contentArticle.test.mjs`
- `web/src/views/content-article/generate.test.mjs`

删除文件：无。

### 2026-10-19 修正内容创作格式与成稿、编辑提示分离

- 内容创作的"正文格式"开放纯文本 / Markdown，新建或用户切换到内容创作类型时默认纯文本；移除前端禁用、提交强制值和后端 Markdown 覆盖。已有配置保留原格式，若需纯文本须在 AI 功能配置中明确修改并保存，不批量改动用户配置或历史文章。聊天、文档解析、OCR、重排的既有格式行为不变；创作配置拒绝 JSON 正文。
- 生成选项增加安全标量 `responseFormat`，下拉显示配置名称、模型与正文格式；新任务把格式写入配置快照，排队后修改配置不影响该任务，历史快照缺少此字段时继续按 Markdown。格式只控制文章正文，不开放配置管理权限。
- 独立写作协议负责提示词组装：默认替作者成稿、面向读者表达，不用"作者认为"等分析口吻，不强制堆砌报告章节或重复待核实说明。模板优先决定口吻、结构、篇幅；系统保留事实底线，所选正文格式和结果协议不可被模板覆盖。新闻或真实人物事件的核心信息不足/行为歧义时提示补充，普通随笔不机械索要来源。不执行新闻检索或读取外链，不声称已核验事实；不修改用户保存的模板。
- 单次模型调用返回内部结构 `{ outcome, body, notes }`；校验枚举、字段类型、数量、长度和正文/提示一致性后拆分，`result` 仅存正文，`editorNotes` 单独存编辑提示。允许完整 JSON 代码围栏，拒绝截断/无效结构与额外字段，不把原始响应、内部推理或辅助方案降级成文章，不额外调用模型修复响应。用量在协议校验失败时仍保留。
- 核心素材不足终止为 `needs_input`（待补充素材），无候选正文，释放用户/文章活跃锁、停止轮询，不自动重试；在生成记录中展示需补充的问题，用户编辑想法并保存后从列表重新发起。成功任务的编辑提示与候选正文分区安全转义展示，复制/采用只作用于正文，不夹带提示；旧成功任务仍可查看、复制与采用，原文不自动覆盖。
- 数据库新增幂等迁移 `1792378800000-AddContentEditorNotes`，仅增加可空 JSON 提示列；状态仍使用原 varchar 字段，不改历史状态或数据。已有提示/待补充任务时回退先拒绝，避免丢弃编辑提示。生产需先执行迁移并统一部署前后端与任务消费者；开发环境下次正常启动按已有 synchronize 策略应用。本次未执行迁移、未启动/重启服务。
- 验证：后端 45 套 / 443 项 Jest、前端 105 项 Node 回归通过；前后端无输出类型检查、变更后端 ESLint、TypeORM 列检查、源码离线 MySQL 元数据检查、Vue 模板/scoped CSS 编译、组件复用核对和 diff 空白检查通过。按修复范围未执行 build；未连接真实数据库、调用真实模型或进行浏览器视觉验收，实际文章文风与事实判断仍需部署后人工验收。
- 已有未提交的 `web/components.d.ts` 保持原样，不纳入本次提交。

新增文件（4）：

- `server/src/content-articles/content-writing.ts`
- `server/src/content-articles/content-writing.spec.ts`
- `server/src/migrations/1792378800000-AddContentEditorNotes.ts`
- `web/src/views/ai-feature-config/contentFormat.test.mjs`

修改文件（14）：

- `.design-spec.md`
- `CHANGELOG.md`
- `server/src/ai-feature-configs/ai-feature-configs.service.ts`
- `server/src/ai-feature-configs/ai-feature-configs.service.spec.ts`
- `server/src/content-articles/content-generation.service.ts`
- `server/src/content-articles/content-generation.service.spec.ts`
- `server/src/content-articles/entities/content-generation-task.entity.ts`
- `web/src/api/contentArticle.ts`
- `web/src/views/ai-feature-config/Edit.vue`
- `web/src/views/content-article/Generate.vue`
- `web/src/views/content-article/Tasks.vue`
- `web/src/views/content-article/taskState.ts`
- `web/src/views/content-article/generate.test.mjs`
- `web/src/views/content-article/tasks.test.mjs`

删除文件：无。

### 2026-10-19 文章列表生成入口与指定模板、AI 配置

- 文章列表每行新增"AI 生成"，顶部选中恰好一篇文章后也可打开同一个生成弹窗；保留多选删除，不自动批量调用。进行中的任务禁重复发起，成功提交后刷新列表并清空勾选。
- 独立生成弹窗使用已保存文章的最新版本，选择 AI 配置（必选）与写作模板（可选，默认通用写作）。唯一配置自动选中，多个配置须明确选择；下拉支持搜索，超过 100 项提示筛选，搜索不丢失已选项。打开弹窗只读素材与选项，不创建/修改文章，不调用模型。
- 编辑页移除底部"保存并生成"和模板控件，仍只有标题、封面、想法、正文四字段；保留未保存离开保护、版本校验与生成记录。文章"查看/编辑 → 生成记录"继续查看进度、候选稿并确认采用，不自动覆盖原文。
- 前后端生成请求对齐新增必填正整数 `aiConfigId`，保留 `version/requestId/templateId`。后端按指定配置校验内容创作类型、启用状态、账号和模型，保存对应参数快照，不回退其它配置；请求号同时绑定文章、版本、配置和模板，网络重试复用同一任务，不允许同请求号换参数。
- 新增 `GET /content-articles/generation-configs`，使用 `ContentArticle.update` 权限，只查询并返回已启用内容创作配置的 ID、名称、模型，支持分页搜索；不授予普通写作者 `Menu.read` 或配置管理能力，不返回提示词和账号参数。模板继续要求独立读取权限与本人归属。
- 允许同时启用多个内容创作配置。新增前向迁移 `1792375200000-AllowContentCreationConfigSelection`，仅移除旧单例生成列及唯一索引，不修改历史迁移、业务配置或任务快照；回退前若存在多个启用配置则先拒绝，不自动停用用户配置。生产须先按维护流程执行迁移，并同步部署前后端；开发环境下次正常启动由现有 synchronize 策略应用。本次未连接数据库、未执行迁移、未启动/重启服务或调用真实模型。
- 验证：后端 44 套 / 417 项 Jest、前端 99 项 Node 回归全部通过；前后端类型检查、变更后端文件 ESLint、实体列检查、离线 MySQL 元数据构建、Vue 模板/scoped CSS 编译和 diff 空白检查通过。组件复用核对使用现有 Table/Form/Dialog/Select/Button，无公共组件改动。后端生产构建及禁用声明文件写入的等效 Vite 构建通过；保留依赖 PURE 注释和大 chunk 警告。未进行真实数据库、供应商调用或浏览器视觉验收。
- 已有未提交的 `web/components.d.ts` 保持原样，不纳入本次提交。

新增文件（4）：

- `server/src/migrations/1792375200000-AllowContentCreationConfigSelection.ts`
- `server/src/migrations/1792375200000-AllowContentCreationConfigSelection.spec.ts`
- `web/src/views/content-article/Generate.vue`
- `web/src/views/content-article/generate.test.mjs`

修改文件（15）：

- `.design-spec.md`
- `CHANGELOG.md`
- `server/src/ai-feature-configs/ai-feature-configs.service.ts`
- `server/src/ai-feature-configs/ai-feature-configs.service.spec.ts`
- `server/src/ai-feature-configs/entities/ai-feature-config.entity.ts`
- `server/src/content-articles/content-articles.controller.ts`
- `server/src/content-articles/content-articles.service.spec.ts`
- `server/src/content-articles/content-generation.service.ts`
- `server/src/content-articles/content-generation.service.spec.ts`
- `server/src/content-articles/dto/content-article.dto.ts`
- `web/src/api/contentArticle.ts`
- `web/src/views/ai-feature-config/Edit.vue`
- `web/src/views/content-article/Index.vue`
- `web/src/views/content-article/Edit.vue`
- `web/src/views/content-article/contentArticle.test.mjs`

删除文件：无。

### 2026-10-19 内容创作配置、写作模板与持久化后台任务

- AI 指令集、AI 工作流迁入统一"AI 功能配置"分组与页签，按原有 Menu / AiCommandDefinition / AiWorkflow 权限分别展示和挂载；旧聊天/Agent 地址保持重定向，原菜单 ID 与人工启停/超管可见性保留。新分组按路径匹配，避免同名父级占用旧配置菜单 ID。
- 新增 AI 功能类型 `contentCreation`（内容创作），独立选择账号、文本模型、温度、Think 参数与写作提示词，固定 Markdown 输出，不回退聊天配置、不执行客服工作流。服务端校验和 MySQL 生成列唯一索引共同保证同时至多一个启用配置；文章生成必须恰好有一个可用配置。
- 内容创作分为"文章创作 / 写作模板"。模板按 demo 结构提供本人范围 CRUD，仅名称与写作要求两项，使用独立 `ContentTemplate.*` 权限；生成选模板另需 read 权限。文章仍只有标题、封面、想法、正文四个字段；模板选择位于生成操作区，不写入文章字段，未选择时使用通用写作。
- 原同步生成改为"保存并生成"：先保存文章，再 POST `/content-articles/:id/generate`，携带隐藏 version、UUID requestId 和可选 templateId，快速返回任务概要。移除旧的新稿同步 `POST /content-articles/generate`；前后端需一并部署。创建文章用 create 权限，提交任务与采用正文用 update 权限；只具备 create 的角色仍可保存想法，但不能发起付费生成。
- 新表 `content_generation_tasks` 持久化标题/想法、配置/模板快照、状态、候选正文、错误、时间和可用 Token 用量。配置快照不保存密钥、端点或内部推理，不回传供应商原始错误。列表仅查询任务标量概要，大字段按任务详情读取；文章与模板数据均按当前用户隔离（超管也不绕过归属）。
- 数据库唯一约束防止请求号重复及同用户/同文章并发任务，事务内锁定并重新核对文章版本。后台每 2 秒检查，单实例串行消费，多实例条件抢占；模型请求 120 秒期限、运行租约 150 秒。重启后 pending 可继续，过期 running 只标记 interrupted，不自动重试可能已计费调用；迟到响应不得写回已中断任务。通用内存任务队列及知识任务不改。
- 文章列表显示最新生成状态，编辑和详情页提供分页"生成记录"，可查看真实状态、耗时、模型/模板、素材与结果。活跃任务轮询，关闭页面停止前端查询但后台继续；读取失败提示手动刷新，不伪造百分比。任务完成只存候选稿，不自动覆盖文章。
- "采用并保存"需二次确认，服务端事务检查成功状态、任务提交版本与当前文章版本一致；文章已修改或编辑框有未保存内容时禁止覆盖，仍可复制候选稿手动合并。正文安全转义展示，不执行 HTML。提交请求失败保留草稿 ID 和请求号，重试不重复创建文章或任务；保存、上传、提交、采用期间防误关闭。
- 使用方式：部署后在"AI 功能配置 → 功能配置"新增并启用一个"内容创作"配置；如需模板，在"内容创作 → 写作模板"维护；文章点击"保存并生成"，在该文章编辑/查看页的"生成记录"查看进度与候选正文。普通角色需按职责授予 ContentArticle / ContentTemplate 对应权限。
- 数据库：新增幂等迁移 `1792371600000-AddContentGenerationTasks`，创建模板、任务表和启用创作配置唯一约束。开发环境下次正常启动按现有 synchronize 策略应用；生产环境须先在维护流程中执行迁移，再启动新版服务。未修改环境变量、连接真实数据库或执行迁移，未自动启动/重启服务、未调用真实模型。
- 验证：后端 43 套 / 410 项 Jest、前端 93 项 Node 回归全部通过；后端及 Vue 类型检查、全部本次变更后端文件 ESLint、TypeORM 实体列检查、离线 MySQL 元数据构建、Vue 模板/scoped CSS 编译、组件复用核对与 diff 空白检查通过。后端生产 build 与前端等效 Vite 生产构建通过（前端禁用 d.ts 写入）；依赖 PURE 注释和大 chunk 警告保留。未进行真实供应商、MySQL 集成及浏览器视觉验收。

新增文件（18）：

- `server/src/content-articles/content-generation.service.spec.ts`
- `server/src/content-articles/content-generation.service.ts`
- `server/src/content-articles/entities/content-generation-task.entity.ts`
- `server/src/content-templates/content-templates.controller.ts`
- `server/src/content-templates/content-templates.module.ts`
- `server/src/content-templates/content-templates.service.spec.ts`
- `server/src/content-templates/content-templates.service.ts`
- `server/src/content-templates/dto/content-template.dto.ts`
- `server/src/content-templates/entities/content-template.entity.ts`
- `server/src/migrations/1792371600000-AddContentGenerationTasks.ts`
- `web/src/api/contentTemplate.ts`
- `web/src/views/ai-config/Index.vue`
- `web/src/views/content-article/Tasks.vue`
- `web/src/views/content-article/taskState.ts`
- `web/src/views/content-article/tasks.test.mjs`
- `web/src/views/content-template/Edit.vue`
- `web/src/views/content-template/Index.vue`
- `web/src/views/content-template/View.vue`

修改文件（26）：

- `.design-spec.md`
- `CHANGELOG.md`
- `server/src/ai-feature-configs/ai-feature-config.constants.ts`
- `server/src/ai-feature-configs/ai-feature-configs.service.spec.ts`
- `server/src/ai-feature-configs/ai-feature-configs.service.ts`
- `server/src/ai-feature-configs/entities/ai-feature-config.entity.ts`
- `server/src/content-articles/content-articles.controller.ts`
- `server/src/content-articles/content-articles.module.ts`
- `server/src/content-articles/content-articles.service.spec.ts`
- `server/src/content-articles/content-articles.service.ts`
- `server/src/content-articles/dto/content-article.dto.ts`
- `server/src/menus/menu-structure.ts`
- `server/src/menus/menus.service.spec.ts`
- `server/src/menus/menus.service.ts`
- `server/src/users/users.service.ts`
- `web/src/api/aiFeatureConfig.ts`
- `web/src/api/contentArticle.ts`
- `web/src/api/knowledgeAiProvider.ts`
- `web/src/router/index.ts`
- `web/src/router/systemNavigation.test.mjs`
- `web/src/views/ai-feature-config/Edit.vue`
- `web/src/views/ai-feature-config/Index.vue`
- `web/src/views/content-article/Edit.vue`
- `web/src/views/content-article/Index.vue`
- `web/src/views/content-article/View.vue`
- `web/src/views/content-article/contentArticle.test.mjs`

删除文件：无。用户已有 `web/components.d.ts` 改动保留且不纳入提交；构建前后 SHA256 相同。

### 2026-10-19 新增四字段内容创作与 AI 正文生成

- 新增独立"内容创作"业务菜单，按前后端 demo 五件套与列表/编辑/详情结构扩展。表单仅标题 `title`、封面 `coverUrl`、想法 `idea`、正文 `content` 四项，标题必填，其余可空；支持先记录想法、之后继续编辑、封面上传、正文复制及软删除/批量软删除。不增加平台、模板、状态或模型选择表单。
- 生成正文复用已有模型供应商服务，从最新创建的已启用聊天 AI 功能配置读取账号、模型、温度和思考参数；采用独立写作提示词，不继承客服提示词、不执行工作流或业务工具。仅发送当前标题和想法，不发送封面、旧正文或其它记录；无可用配置时给出配置提示，仍可正常保存记录。默认不调用 AI，生成可能计费，单次最长 120 秒，不自动重试，同一用户在单服务进程内防重复生成。
- AI 返回候选正文，不直接修改数据库或覆盖编辑框。用户先预览、采用（覆盖非空正文需确认），再保存；失败、空结果或过长输出不清空原文。正文使用安全纯文本/Markdown 源文显示，不执行 HTML；详情复制正文由用户点击触发。
- 记录查询、详情、编辑、删除和已有记录生成都绑定当前用户，超管也不绕过归属隔离；菜单/路由/CRUD 权限统一 `ContentArticle.*`，新稿生成使用 create、已有稿生成使用 update 权限。列表在数据库查询阶段排除想法和正文长文本；隐藏 version 字段用于原子更新冲突检测，不增加表单字段；只改标题的 PATCH 不清空未提交字段。
- 编辑沿用 Form/Dialog/Input/UploadImage/Button，标签置顶、正文整行、窄屏弹窗限宽、候选长文内部滚动。未保存离开确认；关闭按钮与 Esc 通过 before-close 在组件内部关闭前校验；上传/生成/保存期间阻止误关闭；详情、上传、生成的迟到响应不回填其它记录。封面沿用统一公开上传存储，不适合敏感图片；记录正文仍按用户隔离。
- 新增幂等建表迁移 `1792368000000-CreateContentArticles`；开发环境下次正常启动按现有 synchronize 策略建表并初始化菜单，生产环境须先运行迁移再部署新代码，普通角色需分配 ContentArticle 权限。未自动启动/重启服务、运行真实数据库迁移或调用付费模型。
- 验证：前端 84 项 Node 测试、后端 41 套 / 390 项 Jest 测试全部通过；完整 Vue 类型检查、后端类型检查、实体列检查、新增模块及其它变更后端文件 ESLint、组件复用检查、Vue 模板/scoped CSS 编译和 diff 空白检查通过。后端 `npm run build` 与前端 Vite 生产构建通过；前端为保留用户自动声明改动，采用等效构建配置并关闭 d.ts 自动写入，文件哈希确认未变。Vite 有依赖 PURE 注释及大 chunk 提示；根模块 app.module.ts 的 10 项 ESLint require/any 问题经 HEAD 基线核对为既存，未扩大本次修复范围。未进行真实模型、数据库集成或浏览器视觉验收。

新增文件（12）：

- `server/src/content-articles/content-articles.controller.ts`
- `server/src/content-articles/content-articles.service.ts`
- `server/src/content-articles/content-articles.module.ts`
- `server/src/content-articles/content-articles.service.spec.ts`
- `server/src/content-articles/dto/content-article.dto.ts`
- `server/src/content-articles/entities/content-article.entity.ts`
- `server/src/migrations/1792368000000-CreateContentArticles.ts`
- `web/src/api/contentArticle.ts`
- `web/src/views/content-article/Index.vue`
- `web/src/views/content-article/Edit.vue`
- `web/src/views/content-article/View.vue`
- `web/src/views/content-article/contentArticle.test.mjs`

修改文件（8）：

- `server/src/app.module.ts`
- `server/src/users/users.service.ts`
- `server/src/menus/menus.service.ts`
- `server/src/menus/menus.service.spec.ts`
- `web/src/router/index.ts`
- `web/src/router/systemNavigation.test.mjs`
- `.design-spec.md`
- `CHANGELOG.md`

删除文件：无。用户原有 `web/components.d.ts` 改动保留且不纳入提交。

### 2026-10-19 Agent 调试适配当前应用配置与统一对话链路

- 原调试页移除"聊天配置 / 工作流"选择及旧知识问答请求，改为复用当前 Agent 工作台对话组件的调试态，沿用 Auto/指定文本模型、独立媒体模型、图片粘贴/上传、进度、停止、业务草稿和确认写入链路；不删除底层聊天配置、工作流服务或历史数据，不引入第二套模型执行接口。
- 调试侧栏新增只读配置检查区：展示模型账号、文本模型/调度策略、媒体模型、写入开关、工具、工作指令及执行限制，可刷新已保存配置，并从最近执行进入现有执行详情。配置读取具备失败反馈与过期响应隔离，刷新同步可用能力并将失效指定文本模型退回 Auto；当前配置与执行实际版本明确区分。
- 进入或切换 Agent 不读取/续接已有业务会话，不自动创建会话或调用模型；首次发送、首次上传图片或主动新建时才创建带"调试"标题的独立会话。上传不自动发送。调试使用真实运行链路，可能计费、正常留存记录，写入仍受业务权限与确认约束，不伪称无副作用沙盒。员工工作台历史恢复与原有布局保持不变。
- 调试态职责、长名称、说明和配置值允许完整换行，指令可滚动阅读；内容容器不足 1000px 时改为上下布局，输入工具栏允许换行。移除旧表单固定标签留白，复用现有消息正文与组件，不修改全局 Form、Select 或菜单样式。
- 调试路由及菜单读取权限改为 `AgentApp.read`，页面执行前还要求 `AgentWorkspace.read`；旧 `/chat-management/ai-chat` 与 `/system-config/ai-chat` 统一跳转。菜单 ID 保留，沿用既有超管默认分配规则，不自动给普通角色扩权；后台菜单同步在下次正常启动时生效。
- 验证：完整 Vue 类型检查、后端生产源码 `tsc --noEmit --incremental false -p tsconfig.build.json`、变更后端文件 ESLint、TypeORM 实体列校验、Vue 模板与 scoped CSS 编译、`git diff --check` 通过；前端 74 项 Node 测试、后端 40 个 Jest 套件 / 373 项测试全部通过。新增覆盖调试空上下文、指定/Auto 模型请求、首次图片上传、员工历史恢复、配置刷新与竞态、双权限门槛、旧地址和菜单同步。
- 执行边界：此次为调试入口适配重构，未 build、未启动或重启服务，未连接真实数据库、调用真实模型或进行浏览器视觉验收。已有 `web/components.d.ts` 改动保留且不纳入提交。

新增文件（2）：

- `web/src/views/agent-workspace/components/AgentDebugPanel.vue`
- `web/src/views/agent-workspace/agentDebug.test.mjs`

修改文件（9）：

- `web/src/views/knowledge-ai-chat/Index.vue`
- `web/src/views/agent-workspace/Index.vue`
- `web/src/views/agent-app/RecordView.vue`
- `web/src/router/index.ts`
- `web/src/router/systemNavigation.test.mjs`
- `server/src/menus/menus.service.ts`
- `server/src/menus/menus.service.spec.ts`
- `.design-spec.md`
- `CHANGELOG.md`

删除文件：无。

### 2026-10-19 精简 Agent 执行记录列表并按需展示完整详情

- 执行记录列表移除多行模型调度、参数 JSON、结果 JSON 和配置版本列，保留标识、能力、执行状态、耗时、Token、状态原因和时间，复用 Table 默认单行省略及溢出提示；通过内置"查看"操作打开执行详情，未修改通用 Table 或其他页面样式。
- `GET /agent-apps/execution-records` 在 TypeORM 查询层显式选择必要标量列，不读取/返回 `parameterSummary`、`result`、`configSnapshot` 和 `errorMessage` 等大字段；分页、排序、Agent/用户/状态过滤以及请求号/错误关键词检索保持不变。前端新增独立轻量列表类型，与返回字段对齐。
- 新增 `GET /agent-apps/execution-records/:id`，沿用列表的 `AgentApp.read` 权限，按需提供完整记录；原工作台本人执行查询及其归属校验保持不变，不修改数据库结构或执行数据。详情沿用 demo 的 Dialog 模式，展示模型调用轨迹、Token、耗时、状态原因、错误、版本及可折叠滚动的参数/结果/配置 JSON；处理失败、关闭和切换记录时的迟到响应，不串数据。
- 列表仅表达执行状态，成功统一显示"处理完成"；详情继续根据真实回执区分回答完成、录入成功、图片生成完成及结果待核实，不因列表去掉 result 而错误判断回执。同步设计规范。
- 验证：前端 65 项 Node 测试、后端 40 个 Jest 套件 / 372 项测试通过；完整 Vue 类型检查、后端生产源码 `tsc --noEmit --incremental false -p tsconfig.build.json`、变更后端文件 ESLint、TypeORM 实体列校验、Vue 模板编译和 `git diff --check` 通过。新增覆盖列表字段选择/序列化、分页过滤、空列表、耗时、详情缺失、读取权限、本人隔离、前端按需加载及请求竞态。
- 执行边界：此次为列表/详情数据展示重构，未 build、未启动或重启服务、未连接真实数据库或进行浏览器视觉验收。前后端需同步更新。保留已有 `web/components.d.ts` 改动，不纳入提交。

新增文件（3）：

- `web/src/views/agent-app/RecordView.vue`
- `web/src/views/agent-app/executionRecord.ts`
- `web/src/views/agent-app/executionRecord.test.mjs`

修改文件（7）：

- `server/src/agent-apps/agent-apps.controller.ts`
- `server/src/agent-apps/agent-workspace.service.ts`
- `server/src/agent-apps/agent-workspace.service.spec.ts`
- `web/src/api/agentWorkspace.ts`
- `web/src/views/agent-app/Records.vue`
- `.design-spec.md`
- `CHANGELOG.md`

删除文件：无。

### 2026-10-19 区分侧栏激活分组与当前菜单配色

- 当前菜单所属的激活分组恢复侧栏底色 `#304156`，保留白字加粗并取消左侧蓝条；当前激活菜单改为 `#1F5F99` 蓝色底，保留白字和左侧品牌蓝条，悬停时维持选中底色，避免父分组与当前页面连成同一块。
- 仅调整主布局 `.is-active` 选择器的 4 处样式值。非激活菜单、非激活分组（含展开状态）、原有悬停颜色、菜单缩进、宽度及搜索/折叠逻辑均保持不变；无后端、接口、权限或字段变更。同步设计规范。
- 验证：前端 59 项 Node 测试全部通过（新增激活态区分、非激活/悬停/展开样式回归检查），Vue scoped CSS 编译、完整 Vue 类型检查及 `git diff --check` 均通过。此次为样式调整，未 build、未启动或重启服务，未进行浏览器视觉验收。
- 保留已有 `web/components.d.ts` 改动，不纳入本次提交。

新增文件：无。

修改文件（4）：

- `web/src/layouts/MainLayout.vue`
- `web/src/layouts/mainLayoutMenu.test.mjs`
- `.design-spec.md`
- `CHANGELOG.md`

删除文件：无。

### 2026-10-19 拆分系统配置与权限审计，合并菜单分配范围

- 系统导航调整为"系统配置 / 权限与审计 / 第三方配置"。系统配置保留首页配置、菜单管理、导入配置；账号、角色、权限定义、操作日志归入权限与审计。现有叶子路由和菜单 ID 保留，通过幂等种子更新名称、父级与权限码，保留已有启停及超管范围设置，空分组不显示。
- 原"菜单可见性配置"并入菜单管理的"分配范围"页签，复用原配置逻辑，明确"仅超管使用 / 允许角色分配"的语义，仍由超管操作且后端继续拦截越权。旧 `/system-config/menu` 路由兼容跳转；旧菜单记录只停用、不物理删除，新环境不再创建重复入口。原 `system/Index.vue` 迁移到 `menu/Scope.vue`，并非删除其业务能力。
- 日志读写拆分为 `LogRecord.read/update`，导入配置拆分为 `DataImport.read/create/update`；路由、按钮、控制器和首页最近动态读取同步对齐。内置 admin 角色补齐新模块权限，普通角色不自动从 `Menu.read` 继承权限，也不改写原角色权限数组。只读导入用户保留模块名称与模板下载，隐藏编辑入口。
- 角色授权目录只分组，不重复生成聚合权限中首个模块的授权节点；停用/超管专用菜单不作为普通角色授权入口。分组默认跳转等待全局会话加载后再选有权限的子页面，兼容刷新及旧地址。菜单只读页不再无条件请求权限定义接口，避免跨模块读取权限不足影响菜单查看。
- 验证：后端生产源码范围 `tsc --noEmit --incremental false -p tsconfig.build.json`、完整 Vue 类型检查、变更后端文件 ESLint、TypeORM 实体列检查、`git diff --check` 均通过；后端 40 个 Jest 套件 / 368 项测试、前端 57 项 Node 测试全部通过。新增覆盖种子重复运行与 ID 保留、新旧环境入口退役、不同权限可见菜单、接口读写边界、普通角色不自动扩权、路由冷启动、页签权限和模板编译。
- 执行边界：此次为菜单/权限重构，未 build、未启动或重启服务，未连接真实数据库执行迁移，未进行浏览器视觉验收。部署后后端下次启动会执行菜单同步；刷新或重新登录后获取新菜单。需要使用日志/导入配置的普通角色，须由管理员先确认菜单允许角色分配，再单独授予相应新权限。已有 `web/components.d.ts` 改动保留且不纳入提交。

新增文件（3）：

- `server/src/menus/system-access.spec.ts`
- `web/src/router/systemNavigation.test.mjs`
- `web/src/views/menu/Scope.vue`（原菜单分配配置页迁入）

修改文件（18）：

- `.design-spec.md`
- `CHANGELOG.md`
- `server/src/dashboard/dashboard.registry.spec.ts`
- `server/src/dashboard/dashboard.registry.ts`
- `server/src/data-import/data-import.controller.ts`
- `server/src/log-records/log-records.controller.ts`
- `server/src/menus/entities/menu.entity.ts`
- `server/src/menus/menu-structure.spec.ts`
- `server/src/menus/menu-structure.ts`
- `server/src/menus/menus.service.ts`
- `server/src/users/users.service.ts`
- `web/src/api/menu.ts`
- `web/src/router/index.ts`
- `web/src/views/data-import/Index.vue`
- `web/src/views/log-record/Index.vue`
- `web/src/views/menu/Index.vue`
- `web/src/views/permission/Index.vue`
- `web/src/views/role/Edit.vue`

删除文件（1）：`web/src/views/system/Index.vue`（已迁入 `menu/Scope.vue`，业务保留）。

### 2026-10-19 修复 Dialog 内单选与多选菜单被裁切

- 公共 Select / SelectMultiple 菜单改为 Teleport 到 body，以 fixed 视口坐标定位；复用 Element Plus 层级序列并高于当前弹窗祖先层级。保留 Dialog 内容区滚动，不通过加高弹窗或取消 overflow 绕过问题，无后端、接口或数据字段变更。
- 抽取共用定位逻辑：跟随祖先滚动、窗口/可视视口和控件尺寸变化；宽度对齐控件、底部空间不足时向上展开、窄视口限宽限高，菜单内部继续支持横向/虚拟滚动。控件完全滚出可见区域时关闭，关闭/卸载/停用时清理监听、观察器与动画帧。
- 独立弹层纳入内部点击判断，保留输入焦点和多选连续勾选；Esc 只关闭菜单，Tab 正常导航，禁用和窗口失焦关闭。键盘滚动按实际可视高度计算，空数据保留一行提示；移除 Agent 输入区依赖祖先的旧菜单定位覆盖，统一由公共组件避让边界。
- 同步公共组件契约。验证：完整前端 Vue 类型检查（无输出构建）、53 项 Node 测试全部通过，其中新增 15 项覆盖定位、组件脚本交互、模板编译及生命周期清理；`git diff --check` 通过。测试使用 Vue 响应式与可控布局桩，不等同于浏览器视觉验收；遵循修复类改动规则，未 build、未启动服务。
- 本次仅提交下列文件；保留工作区已有的自动生成文件 `web/components.d.ts` 改动，不纳入提交。

新增文件（3）：

- `web/src/components/selectDropdownPosition.ts`
- `web/src/components/useSelectDropdown.ts`
- `web/src/components/selectDropdown.test.mjs`

修改文件（5）：

- `web/src/components/Select.vue`
- `web/src/components/SelectMultiple.vue`
- `web/src/views/agent-workspace/Index.vue`
- `AGENTS-COMPONENTS.md`
- `CHANGELOG.md`

删除文件：无。

### 2026-10-19 首页受控板块配置、运营看板与第三方配置拆分

- 首页改为真实聚合数据：核心指标、Agent 趋势、业务健康、产品/SKU 分布、客服任务趋势、知识健康、待办异常、最近动态和快捷入口，共九种注册板块。关闭或无权限的板块不查询，混合卡片按指标裁剪，单块错误隔离，缺失指标不伪造为 0。
- 新增"系统管理 → 首页配置"：卡片目录、静态示意预览、勾选、标题/跨度/顺序/白名单参数设置、保存草稿、发布与前一版回退；未保存离开提示。前后端契约使用 instanceId/widgetKey/schemaVersion/layout/params，禁止任意 SQL、URL、HTML、脚本与图表配置。数据库事务、行锁与 revision 校验避免旧版本覆盖，发布/回退记入安全审计。
- 新增独立第三方配置及只读服务概览，迁移 AI、微信、OSS/CDN、MinerU、向量化入口；文档解析规则归知识库，旧地址重定向。种子保留原菜单 ID 与可见性，重复启动不重复建菜单。第三方读写权限拆分到各模块，普通角色不自动继承旧 Menu.read 的写权限。
- 业务表单改用安全服务选项投影，避免权限拆分误伤已有账号/模型选择；自动模型测试遵守对应 update 权限。OSS 不再回传 AccessKey/Secret，空值保留，单独清除需二次确认；向量 Token 留空保留。
- 图表懒加载 ECharts 6.1.0，按实际容器响应、自动 resize/dispose、减少动态效果、richText Tooltip 与可读 ARIA；修正了自检发现的筛选框宽度、默认周期覆盖和旧图表布局参数问题。依赖检查发现 6.0 的已知 XSS 后仅升级本次新增依赖，详见设计文档的上游公告链接。
- 数据库新增建表迁移 `1792364400000-AddDashboardConfiguration.ts`。本次未连接真实数据库、执行迁移、修改线上配置或调用付费模型；部署前需审阅迁移与普通角色权限。上线步骤、统计口径和未实施边界已同步到 `MD/首页改版设计方案.md` 与 `.design-spec.md`。
- 验证：后端实体检查、39 个 Jest 套件 / 357 项测试、后端 build；前端 38 项 Node 测试（含契约一致性和 ECharts 6.1 实际 SVG 渲染）、完整 Vue 类型检查与生产构建；组件复用只读扫描、变更 diff 检查。新增后端代码及其余变更后端文件 ESLint 通过；`app.module.ts` 原有 10 项 require/any 规则问题已用 HEAD 原文复核一致，未混入额外重构。
- 浏览器按 computer-use 流程使用临时本机示意 API 检查：卡片参数、7/30 天选择、发布后板块移除、回退、整页预览及第三方状态；侧栏展开的窄内容区可用。实际代码不含测试账号或演示接口。临时脚本与服务已清理，截图位于工作区外的可视化产物目录。浏览器截图为示意数据，不是生产数据验证。
- 已知提醒：构建保留上游 Rollup 注释警告及约 560 kB（gzip 193 kB）的懒加载图表包体积提示；npm 对未变动的旧依赖树仍报告 12 项高危依赖告警，未执行跨项目 audit fix。额外执行包含所有 spec 的后端 `tsc --noEmit` 时，两个本次未修改的测试夹具仍有类型问题：`agent-workspace.service.spec.ts:300` 的 AgentApp 强转缺字段、`menus.service.spec.ts:177` 的 Date 赋 null；生产构建范围类型检查及 Jest 均通过，未混入旧测试重构。真实 MySQL 聚合、生产菜单迁移、性能与第三方连通性仍需部署环境验收。

新增文件（30）：

- `server/src/dashboard/dashboard-config.service.spec.ts`
- `server/src/dashboard/dashboard-config.service.ts`
- `server/src/dashboard/dashboard.controller.ts`
- `server/src/dashboard/dashboard.module.ts`
- `server/src/dashboard/dashboard.registry.spec.ts`
- `server/src/dashboard/dashboard.registry.ts`
- `server/src/dashboard/dashboard.service.spec.ts`
- `server/src/dashboard/dashboard.service.ts`
- `server/src/dashboard/dashboard.types.ts`
- `server/src/dashboard/dto/dashboard.dto.ts`
- `server/src/dashboard/entities/dashboard-config.entity.ts`
- `server/src/menus/menu-structure.spec.ts`
- `server/src/menus/menu-structure.ts`
- `server/src/migrations/1792364400000-AddDashboardConfiguration.ts`
- `server/src/third-party-config/third-party-config.controller.ts`
- `server/src/third-party-config/third-party-config.module.ts`
- `server/src/third-party-config/third-party-config.service.spec.ts`
- `server/src/third-party-config/third-party-config.service.ts`
- `web/src/api/dashboard.ts`
- `web/src/api/thirdPartyConfig.ts`
- `web/src/views/dashboard-config/Edit.vue`
- `web/src/views/dashboard-config/Index.vue`
- `web/src/views/dashboard-config/View.vue`
- `web/src/views/home/components/DashboardChart.vue`
- `web/src/views/home/components/DashboardGrid.vue`
- `web/src/views/home/components/DashboardWidgetCard.vue`
- `web/src/views/home/dashboard.test.mjs`
- `web/src/views/home/dashboardChart.ts`
- `web/src/views/home/dashboardPreview.ts`
- `web/src/views/third-party-config/Index.vue`

修改文件（26）：

- `.design-spec.md`
- `CHANGELOG.md`
- `MD/首页改版设计方案.md`
- `server/src/app.module.ts`
- `server/src/document-parse-rules/document-parse-rules.controller.ts`
- `server/src/knowledge-ai-providers/knowledge-ai-providers.controller.ts`
- `server/src/menus/menus.service.ts`
- `server/src/mineru-configs/mineru-configs.controller.ts`
- `server/src/storage-config/dto/storage-config.dto.ts`
- `server/src/storage-config/storage-config.controller.ts`
- `server/src/storage-config/storage-config.service.ts`
- `server/src/users/users.service.ts`
- `server/src/vector-configs/vector-configs.controller.ts`
- `server/src/vector-configs/vector-configs.service.ts`
- `web/components.d.ts`
- `web/package-lock.json`
- `web/package.json`
- `web/src/api/storageConfig.ts`
- `web/src/router/index.ts`
- `web/src/views/HomeView.vue`
- `web/src/views/ai-feature-config/Edit.vue`
- `web/src/views/document-parse-rule/Index.vue`
- `web/src/views/knowledge-ai-provider/Index.vue`
- `web/src/views/mineru-config/Index.vue`
- `web/src/views/storage-config/Index.vue`
- `web/src/views/vector-config/Index.vue`

删除文件：无（临时自检脚本不纳入版本库）。



### 2026-10-18 首页运营看板改版设计方案

- 新增 `MD/首页改版设计方案.md`，将首页从脚手架统计卡定位为权限自适应的运营工作台，规划六项核心指标、Agent 执行趋势、产品/SKU 分布、客服 AI 任务趋势、知识库健康、待办异常、最近动态和快捷入口。
- 明确 ECharts 按需引入、响应式布局、独立加载/空/失败状态、图表下钻与颜色语义；SKU 统计限定为产品/SKU 记录规模、启用状态、品类分布和单产品 SKU 数，不在缺少库存、价格、销量实体时展示相关指标。
- 定义建议的 Dashboard 只读聚合接口、camelCase 数据契约、按业务权限省略区块、部分失败降级、统计时间口径、性能边界、前后端组件结构、分阶段实施顺序和验收标准。本轮仅新增设计文档，未修改页面、接口、依赖、实体或数据库。
- 新增文件：`MD/首页改版设计方案.md`。修改文件：本文件。删除文件：无。验证：Markdown 结构与链接静态检查、`git diff --check` 通过；文档改动未执行 build、未启动服务或连接数据库。

### 2026-10-18 Agent 执行可靠性、追踪与消息分页

- 整轮停止与超时：新增统一执行运行时，为每次文本执行维护独立 `AbortController`，并将整轮信号与模型单次尝试信号组合后传递到真实 `fetch`；用户停止或总超时时会主动中断上游文本请求。所有消息终态改为从 `running` 条件更新，停止与晚到结果竞争时不会重新复活任务；媒体仍保留自身取消与"供应商可能已处理/计费"的真实边界。
- 原子并发占位：发送消息和创建执行记录合并到同一数据库事务，在锁定 Agent 配置行后检查本人/当前 Agent 的有效租约执行数，再原子写入用户消息、执行占位和会话计数。草稿确认链路也在同一锁内检查并发，重复 `clientMessageId` 在锁内再次核实，消除"先计数、后创建"的并发穿透和消息孤儿窗口。
- 租约与失联恢复：执行新增心跳和租约截止时间；启动时及每 30 秒批量回收过期 `queued/running/submitting/verifying` 记录，安全标记为失败、恢复提交中草稿，并为普通消息补一条可见的中断回执。并发统计忽略已过期租约及超过兼容窗口的旧执行，崩溃遗留记录不再长期占用额度。
- 配置版本与可观测性：执行时保存不含密钥和原始工作指令的配置快照（工作指令仅保存 SHA-256 版本摘要）及配置哈希；模型轨迹补齐输入/输出/总 Token，并聚合模型调用耗时。执行记录新增规范化状态原因、失败阶段、Token/模型耗时及配置版本展示；没有价格目录或流式首字事件的数据不做虚假费用、首字延迟估算。
- 消息分页：新增 `GET /agent-workspace/sessions/:id/messages?beforeId&pageSize`，返回 `{ list, total }`；会话详情默认只加载最新 50 条并返回 `messageTotal`，工作台可按游标加载更早消息，避免长会话一次读取全部正文。
- 数据库：新增迁移 `1792278000000-AddAgentExecutionReliability.ts`，为 `agent_executions` 增加配置版本/快照、状态原因、失败阶段、Token、模型耗时、心跳和租约字段及状态-租约索引，并为历史活动记录补兼容租约。生产部署需先审阅并执行迁移；本次未连接或修改真实数据库。
- 新增文件（3）：`server/src/agent-apps/agent-execution-runtime.service.ts`、`agent-execution-runtime.service.spec.ts`、`server/src/migrations/1792278000000-AddAgentExecutionReliability.ts`。修改文件（16）：Agent 模块、工作台服务/控制器/DTO/执行实体/模型路由及相关测试，模型供应商取消信号服务及测试；`web/src/api/agentWorkspace.ts`、执行记录页、工作台和消息列表；本文件。删除文件：无。
- 验证：TypeORM 实体列检查、后端变更文件 ESLint、后端全量测试、前后端生产构建、Vue 类型检查、工作台组件复用只读扫描及 `git diff --check` 通过。前端构建首次因沙箱禁止 `esbuild` 子进程失败，授权后通过，仅有既有第三方 Rollup 注释警告；未启动服务、执行数据库迁移、调用真实模型或进行浏览器人工验收。

### 2026-10-18 侧边栏菜单搜索恢复宽度修复

- 原因：完整菜单使用 `v-show` 在搜索期间隐藏，触发 Element Plus 菜单内部的折叠过渡；无结果后清空搜索时，过渡写入的 `64px` 内联宽度可能残留，导致 `210px` 侧栏中只显示菜单文字开头。
- 修复：主布局改为单一且始终挂载的 `el-menu`，搜索仅切换 `MenuTree` 数据；搜索命中后通过菜单实例展开祖先目录，无结果提示覆盖在菜单区域上。菜单根节点显式占满侧栏，清空搜索继续保留原菜单实例、展开状态和滚动容器。
- 新增文件：`web/src/layouts/mainLayoutMenu.test.mjs`。修改文件：`web/src/layouts/MainLayout.vue`、`AGENTS-COMPONENTS.md`、`.design-spec.md`、本文件。删除文件：无。
- 验证：侧边栏菜单结构回归测试、Vue 类型检查、新增用例 Prettier、主布局组件复用只读扫描、菜单根节点/`v-show` 静态检索及 `git diff --check` 通过；主布局沿用既有单引号格式，避免机械重排未改代码。按前端缺陷修复范围未 build、未启动服务，也未修改后端接口或菜单字段。

### 2026-10-18 Agent 输入区移除模型冗余文案

- 输入区模型选择仅保留下拉框本身，移除两侧的"文本模型""仅控制文本"及对应悬浮说明，避免操作栏出现重复解释性文案；`Auto`/固定模型选择、消息入队快照和服务端调度行为保持不变。
- 新增文件：无。修改文件：`web/src/views/agent-workspace/Index.vue`、`.design-spec.md`、本文件。删除文件：无。
- 验证：Vue 类型检查、目标文件 Prettier、组件复用只读扫描、文案检索及 `git diff --check` 通过；按 UI 微调范围未 build、未启动服务，也未修改后端接口或字段。

### 2026-10-18 Agent 切换、文本模型模式与输入区可读性优化

- Agent 切换体验：左侧当前智能体改为带边框、职责摘要和聚焦态的轻卡片；Agent 下拉使用非搜索模式，展开后继续显示当前名称。切换时显示加载态，成功后优先恢复目标 Agent 最近会话、无历史才新建；失败回滚原 Agent、历史列表、会话和文本模型选择，不再每次切换都额外创建空会话。
- 文本模型模式：输入区新增 `Auto · 智能调度` 与当前 Agent 已授权文本模型选择。队列按消息入队时保存选择；新增可选请求字段 `textModel`，省略表示 Auto，指定值经 DTO 和服务端授权列表双重校验。固定模式用于本轮媒体意图识别、业务规划和文本回答，失败不切换其它文本模型；Auto 继续结合内容、意图与 Agent 保存的调度策略执行。
- 媒体与审计边界：指定文本模型只控制文本阶段，识图和生图仍调用 Agent 独立配置的视觉/生图模型。执行摘要记录 `textModelMode/requestedTextModel`，模型轨迹新增 `fixed/selectedModel`，执行记录页可明确显示指定模型；未新增数据库字段、实体或迁移。
- 输入区视觉：加深输入正文、占位符、附件说明、快捷键提示和免责声明颜色，增强输入框边框、底色、阴影与聚焦态；模型选择器向上展开，窄屏隐藏次要说明。公共 Select 补齐非搜索模式展开仍显示当前值的行为，并增加纯函数回归测试。
- 新增文件（2）：`web/src/components/selectDisplay.ts`、`web/src/components/selectDisplay.test.mjs`。修改文件（16）：`server/src/agent-apps/` 下模型路由、工作台服务、DTO、应用能力输出及 3 个测试文件；`web/src/api/agentWorkspace.ts`、`web/src/components/Select.vue`、`web/src/views/agent-workspace/Index.vue`、`web/src/views/agent-app/Records.vue`；`AGENTS-COMPONENTS.md`、`.design-spec.md`、`MD/Agent业务模块接入说明.md`、本文件。删除文件：无。
- 验证：后端全量 33 套件 / 319 项测试、Select 2 项同进程测试、TypeORM 实体列检查、后端变更文件 ESLint、Vue 类型检查、主要变更代码 Prettier、组件复用只读扫描、前后端生产构建及 `git diff --check` 通过。前端构建首次因沙箱禁止 esbuild 子进程失败，授权后通过，仅有既有第三方 Rollup 注释警告。未启动服务、连接数据库、调用真实模型或进行浏览器人工验收。

### 2026-10-18 Agent 工作台移除重复智能体名称

- 现象：系统主菜单已占用一部分横向空间，而 Agent 工作台左侧会话栏和右侧对话头部同时展示当前智能体名称、头像等身份信息，造成重复并挤占能力标签区域。
- 调整：保留左侧"当前智能体"作为名称、头像与切换入口的唯一展示位置；移除右侧重复身份区，让能力标签使用完整的对话区宽度并从左侧开始排列。消息中的 Agent 发言标识、欢迎语和会话行为保持不变。
- 新增文件：无。修改文件：`web/src/views/agent-workspace/Index.vue`、`.design-spec.md`、本文件。删除文件：无。
- 验证：Vue 类型检查、Agent 工作台组件复用只读扫描及 `git diff --check` 通过；项目未安装本地 Prettier，离线环境无法执行其格式检查。按 UI 修复范围未 build、未启动服务，也未修改后端接口或字段。

### 2026-10-17 客服 H5 并入主仓库并重建项目 README

- 仓库整理：将原独立客服 H5 完整迁入 `customer-service-h5/`，保留源码、样式、测试和说明文档，删除其嵌套 `.git` 元数据；后续分支、提交和版本历史统一由 FullstackSeed 根仓库管理。
- 项目说明：重写根 `README.md`，将项目定位明确为面向中后台与 AI 业务的全栈项目开发框架 / 平台基座；补充三端架构、已有能力、技术栈、目录结构、快速启动、配置、检查命令、文档导航和生产部署提示。
- 导航约束：根 `AGENTS.md` 增加客服 H5 子项目及专属文档入口；`MIGRATION.md` 的旧绝对路径改为仓库内链接；H5 的 `AGENTS.md` 与 `REQUIREMENTS.md` 补充主仓库归属、禁止嵌套 Git 及正式协议优先级说明。不修改后端接口、前端字段或客服运行逻辑。
- 清理文件：删除仅属于其他项目的 `artifacts/wechat-mini-program-ppt/`，包括 `AI微信小程序极速开发流程_v2.pptx` 与 `assets/cover-hero.png`。
- 新增文件：`customer-service-h5/` 下迁入的 HTML、CSS、JavaScript、测试与 Markdown 文件。修改文件：`README.md`、`AGENTS.md`、`MIGRATION.md`、`customer-service-h5/AGENTS.md`、`customer-service-h5/REQUIREMENTS.md`、本文件。删除文件：`artifacts/wechat-mini-program-ppt/` 下 2 个已跟踪文件；嵌套 `.git` 不纳入主仓库。
- 验证：确认旧 H5 独立目录已移走、目标目录存在且不含 `.git`；客服正式 JavaScript 语法检查、README 相对链接检查及 `git diff --check` 通过。按文档与仓库整理范围未 build、未启动服务、未连接数据库或调用外部接口。

### 2026-10-16 公共数字输入组件取消实时范围强制修正

- 现象与原因：Agent 应用的超时秒数字段设置 `min: 10`，输入 `1` 立即变为 `10`，干扰继续输入 `180`。公共 InputNumber 在每次 input 中执行 min/max 截断，随后 model watcher 又将数值格式化回填；同一回填也可能打断负号、小数点和尾随小数零的编辑。
- 修复：InputNumber 的 min/max 仅参与校验，不在输入、失焦或提交时强制改值；model 同值同步保留数字草稿，父表单赋入不同值仍正常回显。change/blur/显式校验/Enter 时提示越界，失败不发出 enter；继续编辑清除旧提示，保留 number/null、整数/小数/金额精度、清空、required、自定义规则及关闭规则的既有契约。
- 提交保护：Form 原先只执行页面的 Element Plus 规则，未检查数字组件的内置范围规则。本次让当前动态 InputNumber 的 validate 参与 Form.validate，越界拒绝提交且保留页面已有校验错误；不扩展到其它控件或自定义插槽，不修改业务页的范围设置、后端字段/API、数据库或 Agent 超时配置。
- 新增文件（1）：`web/src/components/inputNumber.test.mjs`，包含连续输入、范围/Enter、负数小数草稿、外部赋值/规则选项、Form 提交拦截和动态字段/既有错误兼容六组回归用例。
- 修改文件（5）：`web/src/components/InputNumber.vue`、`web/src/components/Form.vue`、`AGENTS-COMPONENTS.md`、`.design-spec.md`、本文件。删除文件：无。
- 验证：Vue 类型检查、组件/用例 Prettier 检查、用例 node --check 语法检查、组件复用只读扫描与 git diff --check 通过。遵循修复类改动仅静态检查的规则，未执行回归用例、未进行浏览器交互测试，未 build、启动/重启服务或调用生图接口。

### 2026-10-16 Agent 执行状态渲染空值兜底

- 现象：执行记录页曾出现 `Cannot read properties of undefined (reading 'type')`，用户刷新后恢复，并要求仅做兜底判断。代码中状态组件直接返回 `map[status]`，缺失或未知状态会使模板读取 `statusMeta.type` 时抛错；未取得现场堆栈，不将具体历史记录或表格预扫描认定为已复现的现场原因。
- 修复：展示组件允许缺失/未知状态，只读取状态映射自有键，未命中显示中性的"未知状态"；悬浮可查看原始状态或缺失说明。已知状态、真实录入/生图回执判断及配色保持不变，不把异常值当成成功。按用户最新要求不改公共 Table、后端接口、业务状态或数据库。
- 新增文件（1）：`web/src/views/agent-workspace/components/agentExecutionStatus.test.mjs`，覆盖未知/空值/原型键、已知状态、真实回执及响应式状态切换四类回归用例。
- 修改文件（3）：`web/src/views/agent-workspace/components/AgentExecutionStatus.vue`、`.design-spec.md`、本文件。删除文件：无。
- 验证：Vue 类型检查、组件及用例 Prettier 检查、用例 `node --check` 语法检查、组件复用只读扫描及 `git diff --check` 通过。按修复类改动规则仅执行静态检查，未运行新增测试、未 build、未启动/重启服务，也未进行浏览器现场复现。

### 2026-10-16 Agent 图片模型切换自动测试与无效候选移除

- 需求与原因：能力目录是管理员登记信息，不能证明模型真的能识图/生图；普通文本测试的 OK 或 HTTP 200 也不能验证图片能力。本次在手动切换媒体模型时发起对应协议的真实能力测试，并说明生图候选的配置来源。
- 新增文件（4）：`server/src/agent-apps/agent-media-probe.ts`、`server/src/agent-apps/agent-media-probe.service.ts`、`server/src/agent-apps/agent-media-probe.service.spec.ts`；`web/src/views/agent-app/mediaModelProbe.test.mjs`。
- 修改后端（4）：`server/src/agent-apps/agent-apps.controller.ts`、`server/src/agent-apps/agent-apps.module.ts`、`server/src/agent-apps/agent-media.service.ts`、`server/src/agent-apps/dto/agent-app.dto.ts`。修改前端（2）：`web/src/api/agentApp.ts`、`web/src/views/agent-app/Edit.vue`。修改文档（3）：`.design-spec.md`、`MD/Agent业务模块接入说明.md`、本文件。删除文件：无；共新增 4、修改 9，无依赖/实体/数据库迁移变化。
- 契约与权限：新增 `POST /agent-apps/probe-media-model`，入参 `providerId/model/kind`；结果前后端统一 `valid/invalid/inconclusive`、安全原因码/说明、检查时间及缓存标识。要求登录、AgentApp.read，并有 create 或 update 权限；服务端只从保存的启用账号、密钥及专用模型目录解析目标，客户端不能传 URL/密钥。测试不修改账号、应用或聊天数据。
- 识图验证：本地生成随机四色块 PNG，通过真正的 `image_url` 输入让模型返回颜色顺序，最多 256 输出 Token；答案必须与像素一致，文字 OK 或自称支持不算成功。无法正确核验仅标记无法确认，不能断言是非图片模型。
- 生图验证：与工作台共用请求构造/结果解析，按 OpenAI Images 兼容或 DashScope 同步协议只生成单张；校验真实输出图片字节，复用图片格式/大小限制及 HTTPS 公网下载保护。不把文本、Markdown URL 或异步任务回执当成图片；测试图只在内存中处理，不持久化。
- 失败区分：只有供应商明确表示模型不存在/ID 无效或不支持图片能力才移除当前窗口该候选并清空对应选择，原因保留供修正目录。401、权限、余额/额度、429、超时、5xx、未知接口或参数错误等保留候选；不自动删账号目录，不按模型名推断。生图候选来自所选账号的生图专用目录与完整端点，不从文本/视觉目录混入；配置位置与百炼来源见接入说明。
- UI：复用 Form/Select/Button，模型字段就地显示真实测试状态，测试区位于媒体字段之后，提供刷新和重测。编辑回显/刷新不自动付费测试；选择后测试期间禁止重复操作及保存，保留关闭能力。切换账号/重新打开/选择变更后忽略迟到结果，旧配置加载响应也不能覆盖新表单；刷新失败不恢复已移除选项。
- 调用保护：每员工单并发、每分钟最多 6 次实际测试；识图 30 秒、生图 90 秒上限。已尝试的结果（包括未知/超时）按员工、能力和账号配置缓存 60 秒，配置变更使旧缓存失效；限流、缓存均为有界进程内状态，多实例不共享。无自动重试/批量扫描，关闭/超时不保证供应商停止计费。
- 验证：新增后端 26 项与前端真实 setup/watchers 8 项回归；后端全量 33 套件 / 314 项、前端共 19 项测试通过。后端生产构建、生产源码类型检查、Vue 类型检查、变更后端 ESLint、变更前端 Prettier、组件复用只读扫描（1 页面）、`git diff --check` 通过。完整后端测试类型检查仍仅有既有 `server/src/menus/menus.service.spec.ts:177` 的 `deletedAt: null` / `Date` 错误，未修改该文件。
- 验证边界：测试全部模拟供应商，不读取真实密钥、不连接数据库、不发真实付费请求；未启动常驻服务、未做浏览器人工验收。更新前后端即可使用，真实账号的开通权限/余额/地域仍需管理员选择模型后测试确认。

### 2026-10-16 Agent 图片意图自动分流、输入框粘贴与账号内模型过滤

- 需求与原因：手动选择对话/识图/生图模式不符合自然语言交互；媒体候选混入其他账号，容易配置错引用。本次去掉模式选择，以服务端意图识别决定实际能力，视觉与生图引用均限定当前所选账号。
- 新增文件（4）：`server/src/agent-apps/agent-request-intent.ts`、`server/src/agent-apps/agent-request-intent.spec.ts`；`web/src/views/agent-workspace/agentClipboard.ts`、`web/src/views/agent-workspace/agentClipboard.test.mjs`。
- 修改后端（9）：`server/src/agent-apps/agent-apps.service.ts`、`agent-apps.service.spec.ts`、`agent-business-workspace.spec.ts`、`agent-media.service.ts`、`agent-media.service.spec.ts`、`agent-model-router.service.ts`、`agent-model-router.service.spec.ts`、`agent-workspace.service.ts`、`dto/agent-app.dto.ts`。
- 修改前端（3）：`web/src/api/agentWorkspace.ts`、`web/src/views/agent-app/Edit.vue`、`web/src/views/agent-workspace/Index.vue`。修改文档（4）：`.design-spec.md`、`AGENTS-COMPONENTS.md`、`MD/Agent业务模块接入说明.md`、本文件。删除文件：无；共新增 4、修改 16。
- 输入体验：复用 Input 的粘贴事件、UploadImage 私有上传与预览、Button 添加附件入口。只处理本次剪贴板图片文件，不主动读取剪贴板或下载 HTML 图片；支持 PNG/JPEG/WebP 单图 ≤ 5 MB。粘贴不自动发送，不覆盖已有附件，多图提示逐张发送；普通文字/混合图文保留原生文字粘贴。只有附件直接发送时补默认识图问题，保留中文输入法、消息排队、幂等重试、会话归属和 Blob URL 释放。
- 前后端契约：发送仍为 `content/clientMessageId/imageId?`，前端删除 `mode` 入参；后端保留旧字段校验但忽略其执行指示，实际模式只由受约束的服务端分类结果决定。拥有媒体引用或带图片的请求先分类，文本-only 旧应用保持原业务链；不新增数据库字段或迁移。
- 意图与执行：分类结合本轮内容、图片存在性及限定长度的最近对话，区分普通对话/业务、图片理解、明确文生图、参考图编辑、待澄清；生图提示词只接受非空且限长文本。分类器不能选择账号、URL、业务工具或权限；询问方法、否定/取消及仅写提示词不应触发生图。分类失败不猜测执行；歧义、缺图、尚未接通的参考图编辑返回真实 `waiting_input` 及说明，不展示执行失败或伪成功。媒体仍不会自动业务写入。
- 调度与停止：无论 priority/balanced/intent 都支持媒体分流，复用现有授权文本模型、尝试预算、冷却和单次/总超时；正常增加一次分类阶段，意图策略后续复用复杂度结果。真正媒体调用只有一次，不自动重试；使用本轮剩余时间，不重置总超时。分类阶段不绑定/取消已有业务草稿，停止与终态采用条件更新，晚到结果不能继续执行或复活状态；同消息 ID 不重复分类或生图。
- 模型候选与防错：两个媒体候选仅显示所选账号对应能力目录；手动换账号清空旧媒体引用，编辑初始化不清空；失效/跨账号历史引用保留禁用说明，可清除或重选。保存/换账号/上传/运行阶段校验归属，当前应用能力摘要不开放跨账号历史引用；运行时继续核对账号启用、密钥和目录。未配置能力给出设置位置说明。
- 验证：后端 32 套件 / 288 项测试、前端剪贴板及进度 11 项测试、生产源码类型检查、Vue 类型检查、变更后端 ESLint、变更前端 Prettier、组件复用只读扫描（2 页面）、`git diff --check` 通过。完整后端测试类型检查仅剩既有 `server/src/menus/menus.service.spec.ts:177` 的 `deletedAt: null` / `Date` 错误，本次变更无新增类型错误。
- 范围与待验收：本次未构建、启动服务、修改真实数据库或调用付费模型。意图测试使用模拟输出验证分流边界，不能替代实际模型语义准确性评估；需部署后验收粘贴/预览、切换账号回显及真实识图/生图。仍不支持图片编辑、多图或异步生图，供应商已处理请求可能计费；配置和人工验收见接入说明。

### 2026-10-16 Agent 识图与生图端到端接入

- 需求与现象：优先顺序策略下轻量/复杂组禁用容易被误认为异常；现有视觉目录仅用于 OCR，缺少 Agent 视觉引用与真实生图链路。本次按用户确认同时接通工作台上传识图和文生图，不只保存配置。
- 新增文件（9）：`server/src/agent-apps/agent-media-models.ts`、`agent-media.service.ts`、`agent-media.service.spec.ts`、`agent-image-utils.ts`、`agent-image-utils.spec.ts`、`entities/agent-image.entity.ts`；`server/src/knowledge-ai-providers/knowledge-ai-media-target.spec.ts`；`server/src/migrations/1792170000000-AddAgentMediaModelReferences.ts`；`web/src/views/agent-workspace/components/AgentImageAttachment.vue`。
- 修改后端（14）：`server/src/agent-apps/agent-apps.constants.ts`、`agent-apps.module.ts`、`agent-apps.service.ts`、`agent-apps.service.spec.ts`、`agent-business-workspace.spec.ts`、`agent-progress.ts`、`agent-workspace.controller.ts`、`agent-workspace.service.ts`、`agent-workspace.service.spec.ts`、`dto/agent-app.dto.ts`、`entities/agent-app.entity.ts`；`server/src/knowledge-ai-providers/dto/knowledge-ai-provider.dto.ts`、`entities/knowledge-ai-provider.entity.ts`、`knowledge-ai-providers.service.ts`。
- 修改前端（12）：`web/src/api/agentApp.ts`、`agentWorkspace.ts`、`knowledgeAiProvider.ts`；`web/src/views/agent-app/Edit.vue`、`View.vue`；`web/src/views/agent-workspace/Index.vue`、`agentProgress.ts`、`agentProgress.test.mjs`、`components/AgentExecutionStatus.vue`、`components/AgentMessageList.vue`；`web/src/views/knowledge-ai-provider/Edit.vue`、`View.vue`。
- 修改文档（4）：`.design-spec.md`、`AGENTS-COMPONENTS.md`、`MD/Agent业务模块接入说明.md`、本文件。合计新增 9 / 修改 30 / 删除 0；未改公共 Select/Form/UploadImage 实现、未手改生成类型声明或工程依赖。
- 字段与接口：Agent 新增可空 `mediaModels`，分别保存 `vision` / `imageGeneration` 的 `{providerId,model}` 引用；账号新增生图目录、协议和完整接口地址。配置时与执行时均校验独立目录、启用状态和密钥，不套用通用模型默认回退。消息增加 `mode/imageId`，旧请求仍按 chat；增加本人会话图片上传和鉴权读取接口。
- UI：文本调度策略说明当前是否使用分组，仅 intent 展示轻量/复杂组；媒体引用单独选择，历史失效值保留提示。工作台复用 Select/UploadImage/Button 增加明确模式选择、单图上传、真实阶段提示、图片消息及放大预览，清空/切换/卸载释放 Blob URL。识图不自动入库，生图不伪装成业务写入回执。
- 执行：接通 Chat Completions 图片输入、OpenAI Images 兼容同步生成、DashScope 同步多模态生图。每次生成一张，不自动重试/切换以避免重复扣费；保留幂等消息、员工/应用并发及总超时。媒体成功与助手消息同事务提交，停止/失败条件更新，迟到结果不复活终态；停止不承诺供应商免计费。
- 安全与存储：`agent_images` 私有二进制表，默认查询不加载数据，不暴露公开上传 URL 或模型密钥。本人/同会话/应用范围校验；输入 5 MB、输出 10 MB、模型响应 16 MB；仅接受 PNG/JPEG/WebP 签名。生成图下载只用公网 IPv4 HTTPS 443，拒绝重定向/私网，固定解析后的 IP 防 DNS 重绑定，不向 CDN 转发鉴权。
- 验证：后端 31 套件 / 262 项测试、前端阶段轮询 8 项测试、后端生产源码与前端类型检查、全部变更后端文件 ESLint、前后端生产构建及 `git diff --check` 通过；组件复用脚本对相关页面采集只读线索，新增输入/选择/上传/操作继续使用项目封装。Vite 构建在沙箱阻止 esbuild 后授权重试通过，仅既有第三方 Rollup 注释警告。
- 验证边界：全仓后端严格类型检查仍有既有 `server/src/menus/menus.service.spec.ts:177` 的 `deletedAt: null` 与 `Date` 类型不符，未修改该无关文件；本次生产源码和修改测试无类型错误。不调用真实付费模型、不启动服务、不执行数据库迁移；真实账号联调、MySQL 集成及浏览器验收未执行。
- 部署：先备份/审阅并执行迁移，再更新服务，按接入说明分别登记模型、协议、完整端点和 Agent 引用。旧应用默认不开启媒体。当前仅同步文生图，暂不支持异步生成、编辑、多图或跨进程网络取消；历史/孤立图片未自动清理，需部署方制定保留策略并配置足够的数据库包大小。迁移回滚会删除私有图片表，必须先备份。

### 2026-10-16 补齐知识库分类工具与 Agent 主动模型调度

- 新增文件（5）：`server/src/agent-apps/agent-model-routing.ts`、`agent-model-router.service.ts`、`agent-model-router.service.spec.ts`；`server/src/knowledge-bases/knowledge-category-agent.spec.ts`；`server/src/migrations/1792166400000-AddAgentModelRouting.ts`。
- 修改后端（16）：`server/src/agent-apps/agent-apps.module.ts`、`agent-apps.service.ts`、`agent-apps.service.spec.ts`、`agent-business.registry.ts`、`agent-business.service.ts`、`agent-business.service.spec.ts`、`agent-business-workspace.spec.ts`、`agent-workspace.service.ts`、`agent-workspace.service.spec.ts`、`dto/agent-app.dto.ts`、`entities/agent-app.entity.ts`；`server/src/ai-command-definitions/ai-command-definitions.constants.ts`、`ai-command-definitions.constants.spec.ts`；`server/src/knowledge-bases/dto/knowledge-base.dto.ts`、`knowledge-bases.controller.ts`、`knowledge-bases.service.ts`。
- 修改前端（5）：`web/src/api/agentApp.ts`、`agentWorkspace.ts`；`web/src/views/agent-app/Edit.vue`、`Records.vue`、`View.vue`。修改文档（3）：`.design-spec.md`、`MD/Agent业务模块接入说明.md`、本文件。删除文件：无，共 29 个文件。
- 工具补齐：接通 `knowledgeCategory.list/detail/create` 的真实服务，支持关键词/上级筛选、分页、详情和确认后新增，七类普通业务/知识模块共 21 个通用工具，另保留 `product.query`。分类下拉继续沿用原全量接口，新加 `/knowledge-bases/categories/page` 和 `/categories/:id` 与目录契约对齐；不开放分类移动、更新、删除或账号权限模块。
- 权限与事务：分类创建要求应用授权、写入开关及员工 `KnowledgeBase.create/read`；上级必须真实存在，名称/编码按实体长度验证。分类草稿复用 Form/确认/幂等流程，父分类读取和保存使用确认事务的 EntityManager；不会先在默认仓库提交业务记录再写回执。
- 模型字段对齐：前后端统一 `modelRouting { strategy, simpleModels, complexModels, maxAttempts, attemptTimeoutSeconds, cooldownSeconds }`。新增可空 JSON 文本列，旧配置 null 保留 priority；新建 UI 默认 balanced，API 未传时仍兼容 priority。模型组必须属于当前已选模型，intent 模式必填两组。
- 主动调度：priority 按健康模型顺序；balanced 按进行中调用数及最近使用轮转；intent 用模型结合本轮问题/近期对话识别问答、查询、录入、分析及简单/复杂程度，选择轻量或复杂组，组内均衡，必要时回退其他已选模型。分类仅接受固定字符串枚举，失败保守走复杂组，不改变业务授权或执行确认。
- 失败保护：模型限流、超时、临时失败进入进程内共享冷却，额度不足至少 10 分钟；上下文/分类格式问题不全局熔断模型。明确账号鉴权或余额异常停止同账号重试。通过已有 AbortSignal 中止超时模型网络请求，为备用模型保留本轮时间；所有阶段尝试受独立上限和总超时约束。模型分类、规划、回答不再消耗业务工具次数，实际查询/准备草稿仍计数。
- UI 与审计：编辑页复用封装 Form/下拉/数字组件配置策略、模型组和限制；详情显示保存配置，执行记录新增真实模型轨迹列，显示策略、意图/复杂度、阶段、实际模型、结果、规范化失败原因和已返回的 Token 用量。仅新增结构化记录，不暴露思维链、密钥或供应商原始错误。
- 验证：后端全量 28 套件 / 241 项测试、前端进度 8 项测试、生产源码及全部变更测试类型检查、Agent/目录/新增文件 ESLint、前端变更文件 Prettier、前后端生产构建、组件复用只读扫描、`git diff --check` 通过。Vite 构建在沙箱阻止 esbuild 子进程后授权重试通过，仅既有第三方注释警告；知识库大型历史服务未做全量格式重写，不宣称全仓 lint 通过。
- 部署与边界：未启动常驻服务、未连接真实模型/数据库、未执行迁移或浏览器验收。生产先审阅并执行迁移再重启，启动补齐分类指令，既有应用不自动授权工具或改策略。健康/负载仅当前进程共享、重启清空，多实例需另接共享协调；不查询真实供应商余额、不跨账号，无法保证共享额度永不耗尽。模型上限按阶段计数，不是知识问答内部全部底层 API 次数；其他外部客服/工作流模型策略不受改动影响。配置、部署和人工验收步骤见接入说明。

### 2026-10-16 Agent 对话真实阶段动态提示

- 新增文件：`server/src/agent-apps/agent-progress.ts`；`web/src/views/agent-workspace/agentProgress.ts`、`agentProgress.test.mjs`、`components/AgentProcessingIndicator.vue`。
- 修改后端：`server/src/agent-apps/agent-workspace.controller.ts`、`agent-workspace.service.ts`、`agent-workspace.service.spec.ts`、`agent-business-workspace.spec.ts`；`server/src/knowledge-ai-chat/knowledge-ai-chat.service.ts`、`knowledge-ai-chat.service.spec.ts`。
- 修改前端与文档：`web/src/api/agentWorkspace.ts`、`web/src/utils/request.ts`、`web/src/views/agent-workspace/Index.vue`、`components/AgentMessageList.vue`；`.design-spec.md`、`AGENTS-COMPONENTS.md`、本文件。删除文件：无。
- 现象与原因：用户问题已乐观显示在主界面，但同步消息接口等待整轮执行结束后才返回助手消息，期间对话区域没有明确的处理反馈。
- 体验：在对应问题下增加临时助手行，显示动态跳点、等待秒数及真实阶段：理解需求、搜索业务数据、检索参考资料、整理录入草稿、思考并生成回答、整理回答依据。完成后由正式消息接替；停止后收起。快速阶段允许跳过展示，不人为延迟回答，也不按计时器轮播虚构搜索或暴露内部思维链。动效支持减少动态效果设置。
- 前后端契约：新增只读 `GET /agent-workspace/executions/progress/:requestId`，返回 `AgentExecutionProgress { executionId, requestId, sessionId, status, stage, startedAt } | null`；本人且拥有工作台权限才可读取，未建立/非本人记录统一 null，不触发写入结果核实。仅投影安全阶段码，不下发参数、结果、错误细节。阶段保存在已有 `parameterSummary.progressStage`，无新表/列或迁移；阶段条件更新只作用于 running 记录，不覆盖取消、失败和成功状态。
- 后端衔接：通用业务、原产品/SKU 路径在真实操作边界更新阶段；问答入口通过独立异步上下文传递可选阶段回调，外部客服原流程不受影响。完成/失败/取消/待补充/待确认状态不再返回运行阶段。
- 轮询生命周期：当前请求约每 1.2 秒读取一次，单请求不重叠；完成、停止或卸载后清理，代次校验丢弃旧请求迟到响应。网络失败静默降级并退避重试，连续三次失败停止轮询，不影响实际消息接口；共享请求封装增加默认关闭的 `silentError`，401 仍使用统一处理。
- 验证：后端全量 26 套件 / 211 项测试、前端纯函数与轮询 8 项测试、前后端生产源码及变更后端测试类型检查、Agent 变更文件 ESLint、前后端生产构建、组件复用只读检查与 `git diff --check`。前端构建授权后通过（沙箱阻止 esbuild 子进程），仅有既有第三方 Rollup 注释警告；前端测试采用 Node 同进程测试模式避开沙箱子进程限制。
- 验证边界：未启动常驻服务、未连接真实模型/数据库、未做浏览器人工验收；不修改业务授权、应用配置、写入确认或提交幂等流程。更新前后端即可生效，无数据库结构变更。

### 2026-10-16 统一接入普通业务与知识内容 Agent 工具

- 新增文件：`server/src/agent-apps/agent-business.registry.ts`、`agent-business.service.ts`、`agent-business-plan.ts`、`agent-business.service.spec.ts`、`agent-business-workspace.spec.ts`；`web/src/views/agent-workspace/components/AgentBusinessQueryCard.vue`；`MD/Agent业务模块接入说明.md`。
- 修改后端：`server/src/agent-apps/agent-apps.constants.ts`、`agent-apps.module.ts`、`agent-apps.service.spec.ts`、`agent-workspace.service.ts`、`agent-workspace.service.spec.ts`、`entities/agent-draft.entity.ts`；`server/src/ai-command-definitions/ai-command-definitions.constants.ts`、`ai-command-definitions.constants.spec.ts`；`server/src/demo/demo.module.ts`、`demo.service.ts`；`server/src/product-catalog/product-catalog.service.ts`；`server/src/knowledge-standard-qas/knowledge-standard-qas.service.ts`；`server/src/knowledge-colloquial-terms/knowledge-colloquial-terms.service.ts`；`server/src/knowledge-bases/knowledge-bases.module.ts`、`knowledge-bases.service.ts`。
- 修改前端与文档：`web/src/api/agentWorkspace.ts`、`web/src/views/agent-app/Edit.vue`、`web/src/views/agent-workspace/Index.vue`、`components/AgentDraftCard.vue`、`components/AgentExecutionStatus.vue`、`components/AgentMessageList.vue`；`.design-spec.md`、本文件。删除文件：无。
- 接入范围：示例数据、产品、SKU、标准问答、口语词库、文本知识库共六类模块，开放 18 个列表/详情/受控创建工具，保留 `product.query`。通用注册声明、服务绑定和 DTO 驱动执行，不通过 Controller 反射或模型指定 URL 执行。更新、删除、批量操作和敏感系统模块仍不开放。
- 真实规划：通用应用使用模型输出受约束 JSON 识别模块、操作和字段，从人话提炼查询关键词；模型不能决定授权或直接写入。只处理当前一步，条件新增先查询再由员工决定是否建草稿；模型失败按应用模型顺序回退，受单轮调用额度和超时约束。仅使用原两个工具的应用保留兼容流程。
- 前后端契约：`AgentDraft.toolKey` 扩为字符串，`data` 扩为字段对象；新增不落库的 `form` 元数据与 `businessResult` 查询结构。复用 Form/Dialog/Button 生成编辑表单；查询卡投影安全字段，显示总数/页码/未命中/内容截断。所有模块的真实创建回执均校验记录类型与正整数 ID；草稿修改后重置确认幂等键。
- 安全与事务：执行前及确认时校验应用授权、写入开关、指令可用状态和员工业务权限；内部 Service 调用显式复用 DTO 验证。通用写入锁定草稿，业务记录、执行回执、草稿和聊天回执同一事务保存；失败回滚后记录失败状态，不能伪报成功。草稿编辑/取消增加行锁和版本/状态复核，已提交或提交中的草稿不能取消；SKU 继续沿用原业务幂等键与核实流程。
- 知识内容：标准问答强制 draft 并保留原审批；口语词条、文本知识库默认停用，员工可确认前修改；知识库复用分类及文本拆分，不触发文件下载/上传、后台解析、分片或索引。保存成功不代表已发布或可检索。
- 验证：后端全量单元测试（26 套件 / 207 项）、生产源码及五个变更测试文件类型检查、Agent/指令目录变更文件 ESLint、前后端生产构建、前端组件复用只读扫描与 `git diff --check`。业务服务原文件已有未使用变量、无 await 的 async、通用字符串化及格式 lint 问题，核对 HEAD 后未扩范围清理，未宣称全仓 lint 通过。前端构建首次受沙箱子进程限制，授权重试成功，仅有既有第三方 Rollup 注释警告。
- 验证边界与部署：未启动常驻服务、未连接真实模型、未修改业务数据，未做浏览器人工验收或真实 MySQL 故障注入；事务编排测试使用内存事务桩。本次无数据库结构迁移，部署需重启后端补齐指令目录；既有应用不自动增加授权或开启写入。完整接入、配置和验收说明见新增 MD。

### 2026-10-16 修复 Agent 写入确认分流与真实能力反馈

- 新增文件 / 删除文件：无。
- 修改后端：`server/src/agent-apps/agent-action.ts`、`agent-action.spec.ts`、`agent-apps.constants.ts`、`agent-apps.service.ts`、`agent-apps.service.spec.ts`、`agent-workspace.service.ts`、`agent-workspace.service.spec.ts`。
- 修改前端：`web/src/api/agentApp.ts`、`web/src/api/agentWorkspace.ts`、`web/src/views/agent-app/Edit.vue`、`Records.vue`、`web/src/views/agent-workspace/Index.vue`、`components/AgentExecutionStatus.vue`、`components/AgentMessageList.vue`；同步修改 `.design-spec.md` 与本文件，共 16 个文件。
- 原因：确认语句"符合，可以入库"未被原关键词分流识别，落入普通模型回答；模型没有当前真实工具、权限和草稿状态，因此可能错误声称系统未开放写入 API。配置目录同时展示了尚未接通的工具，统一"已完成"又容易被误认为入库成功。
- 确认衔接：识别确认表达及有真实草稿时的简短确认，按当前用户和会话重新读取草稿；仅返回待补充/待确认卡片，不改草稿内容或版本、不直接提交。没有草稿、草稿失效或请求未接通业务时，平台返回明确的未执行原因与下一步，不调用模型猜测写入状态。否定、疑问和假设表达不触发准备录入；其他对象的新增请求不误改既有 SKU 草稿。
- 能力校验：新增执行器可用白名单和 `getExecutableToolKeys`，SKU 草稿编辑、准备及最终确认校验应用授权、写入开关、指令启用/聊天调用状态和员工权限；权限失败保存为明确失败消息，而非显示消息发送失败。模型系统上下文加入实际能力及真实草稿状态。`product.query` 保留原有独立内置聚合查询语义，仍受应用授权及员工读取权限控制，不改为目录 `product.sku.lookup` 的别名。
- 配置一致性：工具选项新增前后端同名 `runtimeAvailable/unavailableReason`，仅登记但未接通的工具展示原因并禁选，服务端也拒绝保存；旧不可用配置不自动清洗，编辑时提示手动移除。写入开关与工具选择不再双向自动修改，关闭写入保留已选配置但禁止执行，选择工具不自动授权写入。
- UI 回执：用户消息不再重复展示回答状态，草稿卡前展示确认说明；工作台和执行记录统一区分"回答完成""查询完成""录入成功"。只有 SKU 真实记录类型及正整数记录 ID 回执才能显示录入成功（含提交提示），缺失回执提示待核实并保留幂等键，避免重复提交。
- 范围：本次修复现有产品查询和受控 SKU 新增，不新增通用 CRUD 执行器、自然语言直接落库或数据库字段，不修改目标应用配置及业务数据；最终提交仍绑定真实草稿版本和幂等键。
- 验证：前后端生产源码类型检查、三个变更后端测试文件的类型检查、变更后端 ESLint、前端组件复用只读扫描及 `git diff --check` 通过；补充确认/否定/疑问、草稿归属与失效、工具撤销和配置保留等回归测试源码。按修复规则只做静态检查，未执行测试、build、启动服务、数据库迁移、真实模型调用或浏览器验收。后端全量含测试类型检查仍有既存 `server/src/menus/menus.service.spec.ts:177` 的 `null` 赋给 `Date` 错误，已核对 HEAD 存在，未纳入本次修改。

### 2026-10-16 修复 Agent 输入区重复显示正在处理的消息

- 新增文件 / 删除文件：无；修改文件：`web/src/views/agent-workspace/Index.vue`、`CHANGELOG.md`。
- 现象与原因：消息提交后已在主对话中乐观展示，但发送接口会等待 Agent 处理结束才返回，输入区直接渲染完整待处理列表，因此在整个模型回答期间重复显示"发送中 + 消息正文"。主对话中的乐观展示不等于服务端已确认接收或业务已成功。
- 修复：输入区单独筛选待发送和失败消息，当前消息开始请求后立即移除重复条目，并清理不再使用的发送中样式；保留原始待处理列表、串行执行、停止动作、会话切换保护，以及失败后的重试和取消。处理期间仍通过输入区底部的"Agent 正在处理"提示反馈状态，不提前将执行标记为完成。
- 写入问题诊断（未改执行链路）：当前 `agent-action.ts` 使用固定关键词分流，"符合，可以入库"不会命中写入或草稿补充分支，会进入普通模型回答。项目实际已有 `productSku.create` 草稿及独立确认接口，并非完全没有写入 API；业务工具的配置登记也不等于全部接入了执行器。自然语言确认衔接、其他已登记工具的受控执行及准确的能力反馈仍需后续完善，不能仅靠修改 Markdown 工作指令解决。
- 状态边界：普通模型回答的 `succeeded / 已完成` 仅表示回答生成完成，不代表业务入库；只有受控写入返回真实记录回执才可确认录入成功。本次未读取或更改目标 Agent 的数据库配置、未开放权限、未执行任何业务写入。
- 前后端范围：仅前端展示修复及诊断记录，接口、字段、后端权限与确认机制不变。
- 验证：前端 `vue-tsc --noEmit -p tsconfig.app.json --composite false --incremental false`、工作台组件复用只读扫描、`git diff --check` 通过；按缺陷修复规则未执行 build、未启动服务，未连接真实模型或进行浏览器交互验收。

### 2026-10-16 使用 Markdown 配置 Agent 工作逻辑并移除工作流绑定

- 新增文件：`server/src/migrations/1792137600000-AddAgentInstructionMarkdown.ts`；删除文件：无。
- 修改后端：`server/src/agent-apps/agent-apps.module.ts`、`agent-apps.service.ts`、`agent-apps.service.spec.ts`、`agent-workspace.service.ts`、`agent-workspace.service.spec.ts`、`dto/agent-app.dto.ts`、`entities/agent-app.entity.ts`；修改前端：`web/src/api/agentApp.ts`、`agentWorkspace.ts`、`web/src/views/agent-app/Edit.vue`、`Index.vue`、`View.vue`、`web/src/views/agent-workspace/Index.vue`；同步更新 `.design-spec.md`、`MD/内部Agent应用改造计划.md` 与本文件。
- 配置契约：Agent 新增必填 `instructionMarkdown`，用于以 Markdown 维护工作目标、处理流程和业务规则；简短职责继续用于列表与工作台摘要。配置表单保持单列，增加 20000 字的大文本编辑区，列表搜索和详情展示同步支持工作指令。
- 工作流解耦：Agent 配置选项、表单、工作台能力展示和模型调用链路均移除知识工作流；新建或编辑时清空历史 `workflowId/workflowName`，模型执行统一走 `model.chat`。旧列和历史 `knowledge.answer` 执行类型暂时保留兼容，不影响聊天管理下的其他知识工作流功能。
- 执行边界：运行时将职责、Markdown 工作指令与平台固定安全指令组合为系统提示词；固定禁止虚构工具/接口/结果，没有真实工具回执不得声称成功，写入仍必须经过已授权业务工具、员工权限和人工确认。Markdown 不会新增接口或扩大权限。
- 数据迁移：新增文本列并为既有 Agent 按职责回填基础 Markdown 模板，再收紧为非空；未自动执行目标数据库迁移。
- 验证：TypeORM 实体列检查、后端变更 ESLint、相关 2 个测试套件 / 10 项测试、后端全量 24 个测试套件 / 153 项测试、NestJS 生产构建、前端 `vue-tsc` 与 Vite 生产构建、Agent 页面组件复用扫描及 `git diff --check` 通过；Vite 仅有既有第三方 Rollup 注释警告。未启动常驻服务、未执行数据库迁移、未连接真实模型或进行浏览器人工验收。

### 2026-10-15 支持 Agent 消息排队与动态业务工具配置

- 新增文件 / 删除文件：无。
- 修改后端：`server/src/agent-apps/agent-apps.constants.ts`、`agent-apps.module.ts`、`agent-apps.service.ts`、`agent-apps.service.spec.ts`、`dto/agent-app.dto.ts`；修改前端：`web/src/api/agentApp.ts`、`agentWorkspace.ts`、`web/src/views/agent-app/Edit.vue`、`web/src/views/agent-workspace/Index.vue`；同步更新 `MD/内部Agent应用改造计划.md` 与本文件。
- 工作台交互：消息提交后立即以用户消息上屏，不再因 Agent 执行锁定输入框；同一会话保持服务端安全所需的串行顺序，后续消息在输入卡片内展示为待发送队列。待发送项可取消，失败项可重试或取消，当前执行仍可停止；响应完成后的会话刷新改为静默刷新，避免主窗口遮罩闪现。
- 工具配置：Agent 业务工具不再硬编码两个选项，配置接口动态返回指令集中已启用且允许聊天调用的示例数据、产品和 SKU 候选指令，并保留现有 `product.query` 兼容能力；DTO 允许项和数量上限与代码目录同步。写入总开关统一约束所有需确认的创建工具，停用或关闭聊天调用的指令不能被新配置保存。
- 能力展示：工作台的能力标签使用后端返回的真实指令名称与确认属性，不再把未知工具错误显示为"受控新增 SKU"。本次完成指令登记到 Agent 授权选择的接线；通用意图识别和 API 指令执行器仍按下一阶段独立验证。
- 验证：TypeORM 实体检查、后端变更 ESLint、NestJS 生产构建、后端全量 24 个测试套件 / 153 项测试、前端 `vue-tsc` 与 Vite 生产构建、Agent 页面组件复用扫描及格式检查通过；Vite 仅有既有第三方 Rollup 注释警告。未启动常驻服务、未连接真实模型或执行浏览器人工验收，后端需重启以同步新增指令并刷新动态选项。

### 2026-10-15 将 Agent 入口统一归入独立管理菜单

- 新增文件：`server/src/menus/menus.service.spec.ts`；删除文件：无。
- 修改文件：`server/src/menus/menus.service.ts`、`web/src/router/index.ts`、`MD/内部Agent应用改造计划.md`、`CHANGELOG.md`。
- 菜单结构：新增独立一级菜单"Agent 管理"，统一挂载 Agent 工作台、Agent 应用管理、Agent 执行记录、Agent 调试、AI 指令集和 AI 工作流；聊天应用、AI 功能配置、知识检索/路由、标准问答、口语词库和问答记录继续保留在"聊天管理"。
- 兼容迁移：后端菜单种子为六个 Agent 子菜单维护受控的旧路径迁移，启动后自动更新已有记录的路径、父级和排序；前端保留旧 URL 重定向，已有书签不会直接进入 404。聊天管理默认入口改为聊天应用。
- 权限边界："Agent 管理"父菜单保持业务菜单属性，普通员工拥有 `AgentWorkspace.read` 时仅看到工作台；其余管理子菜单维持系统固定菜单属性，不因重组扩大可见范围。新增路径加入后端锁定菜单范围。
- 验证：后端 ESLint、TypeORM 实体检查、NestJS 生产构建及全量 24 个测试套件、153 项测试通过；前端 `vue-tsc` 与 Vite 生产构建通过，仅有既有第三方 Rollup 注释警告。未启动常驻服务，需重启后端触发已有菜单记录迁移并重新加载前端菜单。

### 2026-10-15 注册首批非 AI 业务指令契约

- 新增文件：`server/src/ai-command-definitions/ai-command-definitions.constants.spec.ts`；删除文件：无。
- 修改文件：`server/src/ai-command-definitions/ai-command-definitions.constants.ts`、`MD/内部Agent应用改造计划.md`、`CHANGELOG.md`。
- 模块盘点：将现有示例数据、产品、SKU 三个非 AI 业务对象纳入代码指令白名单，共登记列表、详情、创建、更新、删除、批量删除 18 条真实 Controller/API 契约；请求 Schema 与现有 DTO 字段保持一致，并绑定 `Demo.* / Product.* / ProductSku.*` 权限。
- 安全边界：列表、详情和创建可作为后续 Agent 的聊天候选，所有创建均要求人工确认；修改、删除和批量删除只登记契约、不允许聊天调用。用户、角色、权限、菜单、日志、存储、上传、模型账号、系统配置和审批动作不进入业务指令白名单。
- 运行边界：指令登记不等于 Agent 自动授权，正式执行仍需具体 Agent 工具授权、当前员工权限、聊天调用开关和人工确认共同通过；本次不改意图识别和实际执行器，留待下一步独立验证。
- 验证：TypeORM 实体列检查、后端 ESLint、NestJS 生产构建及后端全量 23 个测试套件、151 项测试通过；未启动常驻服务、未连接目标数据库，新增目录记录需服务下次启动时由现有同步机制写入数据库。

### 2026-10-15 将 Agent 工作台重构为对话产品布局

- 新增文件 / 删除文件：无。
- 修改页面：`web/src/views/agent-workspace/Index.vue`、`components/AgentMessageList.vue`、`AgentQueryCard.vue`、`AgentDraftCard.vue`；同步修改 `.design-spec.md`、`MD/内部Agent应用改造计划.md`、`CHANGELOG.md`。
- 设计原因：旧页面沿用后台表格式分栏，顶部配置、厚重边框和空白消息区占据视觉中心，不符合以对话为核心的 Agent 工作台体验。
- 重构：采用豆包类 AI 对话产品的信息层级，左侧整合智能体切换、新对话、搜索和轻量历史卡片；主区增加 Agent 状态与弱化能力提示；空会话展示欢迎语和按实际开放能力生成的快捷问题；消息正文限制阅读宽度，用户与 Agent 使用差异化消息样式；输入区改为底部大圆角聚焦卡片并集中发送、停止和处理状态。
- 业务保留：接口和字段不变，继续支持 Agent 切换、会话历史、中文输入法、模型问答、知识增强、业务查询、SKU 草稿编辑/确认、停止执行和迟到响应隔离；快捷问题只基于当前 Agent 已开放能力生成。
- 响应式：桌面端保持双栏，窄屏将会话栏转为顶部横向历史列表，保证消息阅读区和输入区优先可用。
- 验证：前端 `vue-tsc` 类型检查、Vite 生产构建、Agent 工作台组件复用扫描及 `git diff --check` 通过；未启动常驻服务、未连接真实模型或进行浏览器人工验收。

### 2026-10-15 修复 Agent 模型下拉仅显示一个候选项

- 新增文件 / 删除文件：无。
- 修改文件：`server/src/agent-apps/agent-apps.service.ts`、`agent-apps.service.spec.ts`、`server/src/knowledge-ai-providers/knowledge-ai-providers.service.ts`、`knowledge-ai-providers.service.spec.ts`、`MD/内部Agent应用改造计划.md`、`CHANGELOG.md`。
- 原因：Agent 配置接口错误地把账号的"文本模型"作为"模型列表"的替代来源；只要 `textModels` 有值，就完全忽略 `models`。当文本模型仅维护一个条目时，多选下拉自然只收到一个候选项，与多选组件本身无关。
- 修复：重新合并 `models + textModels`，按模型编码去重并保留完整显示名称；聊天与视觉能力的模型校验同步恢复兼容合并，避免界面可选项和服务端校验范围不一致。
- 验证：后端变更 ESLint、相关单元测试、前端类型检查及 `git diff --check` 通过；本次为缺陷修复，按项目规则未执行 build、未启动服务。

### 2026-10-15 解耦 Agent 基础对话、知识增强与业务工具

- 新增文件：`server/src/migrations/1792054800000-MakeAgentKnowledgeOptional.ts`；删除文件：无。
- 修改后端：`server/src/agent-apps/agent-apps.constants.ts`、`agent-apps.service.ts`、`agent-apps.service.spec.ts`、`agent-workspace.service.ts`、`agent-workspace.service.spec.ts`、`dto/agent-app.dto.ts`、`entities/agent-app.entity.ts`、`entities/agent-execution.entity.ts`，以及知识问答、模型账号服务及其测试。
- 修改前端与文档：`web/src/api/agentApp.ts`、`agentWorkspace.ts`、`web/src/views/agent-app/Edit.vue`、`Index.vue`、`View.vue`、`Records.vue`、`web/src/views/agent-workspace/Index.vue`、`MD/内部Agent应用改造计划.md`、`CHANGELOG.md`。
- 能力设计：模型对话改为 Agent 基础能力，不再要求勾选 `knowledge.answer`；知识增强通过独立开关按需绑定工作流；产品/SKU 查询与受控新增 SKU 作为可选业务工具，允许全部不选。写入仍同时受工具白名单、写入总开关、员工权限、二次确认与幂等约束。
- 执行行为：无工作流时跳过标准问答、术语校准和知识检索，直接使用职责说明与原始问题调用模型；有工作流时恢复知识链路。执行记录使用 `model.chat` / `knowledge.answer` 区分两类回答；配置页优先展示文本模型，避免把视觉模型混入 Agent 聊天列表，旧账号未维护分类时保留兼容回退。
- 数据迁移：Agent 的 `workflowId/workflowName` 改为可空，并从既有业务工具白名单中移除 `knowledge.answer`。未自动执行目标数据库迁移。
- UI：表单保持单列和 168px 标签宽度，新增"知识增强"开关；工作流仅在开启时必选，业务工具改为可选且使用中文名称。列表、详情、工作台和执行记录同步展示"纯模型对话 / 知识增强 / 业务工具"的分层能力。
- 验证：TypeORM 实体列检查、后端变更 ESLint、前端 `vue-tsc`、后端与前端生产构建、Agent 页面组件复用扫描及 `git diff --check` 通过；后端全量 22 个测试套件、145 项测试通过。未连接真实模型账号、未执行目标数据库迁移、未启动常驻服务或进行浏览器人工验收。

### 2026-10-15 修复 Agent 模型列表可超选五项

- 新增文件 / 删除文件：无。
- 修改文件：`web/src/components/SelectMultiple.vue`、`web/src/views/agent-app/Edit.vue`、`AGENTS-COMPONENTS.md`、`CHANGELOG.md`。
- 原因：Agent 页面原先使用 `maxTagCount: 5`，该参数仅控制已选标签的折叠数量，不限制实际选择数量；选择超过五项后请求 `/api/agent-apps`，会被后端 `ArrayMaxSize(5)` 正常拒绝并返回 `models must contain no more than 5 elements`。
- 修复：公共多选组件新增 `maxSelections`，达到上限后保留已选项的取消能力并禁用其他候选项；Agent 模型列表设置实际选择上限 5，并增加数组长度表单校验作为提交前兜底。后端最多五项的契约保持不变。
- 验证：前端 `vue-tsc` 类型检查、Agent 编辑页及 SelectMultiple 组件复用扫描、`git diff --check` 通过；本次为前端缺陷修复，按项目规则未执行 build、未启动服务。

### 2026-10-15 调整 Agent 应用表单与直连模型配置

- 新增文件：`server/src/migrations/1792051200000-UseDirectAgentModels.ts`；删除文件：无。
- 修改后端：`server/src/agent-apps/agent-apps.module.ts`、`agent-apps.service.ts`、`agent-apps.service.spec.ts`、`agent-workspace.service.ts`、`agent-workspace.service.spec.ts`、`dto/agent-app.dto.ts`、`entities/agent-app.entity.ts`，以及 `server/src/knowledge-ai-chat/knowledge-ai-chat.service.ts`。
- 修改前端：`web/src/api/agentApp.ts`、`web/src/views/agent-app/Edit.vue`、`Index.vue`、`View.vue`、`web/src/components/Select.vue`、`SelectMultiple.vue`；同步更新 `AGENTS-COMPONENTS.md` 与 `MD/内部Agent应用改造计划.md`。
- 配置契约：Agent 应用由"聊天配置"改为直接保存模型账号 `providerId/providerName` 和有序 `models[]`；只提供已启用、已配置密钥且有聊天模型的账号。保存时服务端逐项核验模型，职责说明直接作为系统提示词；执行失败时按所选顺序切换备用模型，并受单轮工具调用上限约束。
- 数据迁移：新增模型账号与模型列表列，已有 Agent 从原聊天配置回填账号和模型；旧聊天配置列保留为可空兼容列，确保新实体可写入且迁移可回滚。目标环境仍需执行数据库迁移。
- UI：新增/编辑表单改为单列，标签宽度增至 168px 并禁止换行；模型账号后直接多选模型。公共单选/多选下拉为选中值、标签及候选项补充完整内容提示，候选超宽时支持横向滚动；管理列表和详情同步展示模型账号与模型列表。
- 验证：TypeORM 实体列检查、后端 TypeScript 与 Agent 变更 ESLint、后端 NestJS build、前端 `vue-tsc`、Vite 生产构建、Agent 页面组件复用扫描及 `git diff --check` 通过；后端全量 22 个测试套件、141 项测试通过。未连接真实模型账号、未执行目标数据库迁移、未启动常驻服务或进行浏览器人工验收。

### 2026-10-15 规范化数值表单空值并修复向量配置警告

- 新增文件 / 删除文件：无。
- 修改文件：`web/src/views/vector-config/Index.vue`、`web/src/api/vectorConfig.ts`、`AGENTS-COMPONENTS.md`、`CHANGELOG.md`。
- 原因：向量化配置的"供应商向量维度"由 `InputNumber` 渲染，但初始化、重置、接口空值回填和切换模型时使用空字符串，违反组件 `number | null` 契约，触发 Vue `modelValue` prop 类型警告。
- 修复：上述空值统一改为 `null`；收紧 `VectorConfigForm` 的两个维度字段类型为 `number | null`，使错误空字符串赋值在编译期暴露；组件契约文档补充数值空值规范。
- 排查：扫描全部 27 处封装 `InputNumber` 用法（10 个页面）及菜单排序的原生 `el-input-number`；其余字段的初始化、重置和回填均保持 number/null 语义，无需修改。
- 验证：前端 `vue-tsc` 类型检查、向量配置页面组件复用扫描、27 处 `InputNumber` 数值空值静态复扫、Vite 当前页面转换及 `git diff --check` 均通过；本次为前端修复，按项目规则不执行 build、不启动服务。

### 2026-10-15 落地内部 Agent 查询与受控 SKU 录入闭环

- 新增后端模块：`server/src/agent-apps/`，包含 Agent 应用配置、员工会话、结构化消息、版本化草稿、执行记录、动作协议、管理/工作台接口及单元测试；新增增量迁移 `server/src/migrations/1792047600000-CreateInternalAgentApps.ts`。
- 新增前端：`web/src/api/agentApp.ts`、`web/src/api/agentWorkspace.ts`；`web/src/views/agent-app/` 管理与执行记录页面；`web/src/views/agent-workspace/` 会话工作台及查询卡、草稿卡、执行状态组件。
- 修改后端：挂载 `AgentAppsModule`；新增 `AgentApp.*`、`AgentWorkspace.*` 管理权限模块与菜单；知识问答增加仅供内部 Agent 使用的服务端业务指令白名单；SKU 增加不向普通 DTO 暴露的 `agentOperationKey` 唯一幂等键及结果核实能力；产品查询复用现有部分匹配和候选逻辑。
- 修改前端：新增 Agent 工作台、应用管理和执行记录路由；原"AI 问答测试"改为管理员"Agent 调试"入口并保留历史记录；员工不再选择模型或工作流。
- 安全闭环：有效能力取 Agent 工具白名单、员工业务权限和服务端会话归属的交集；自然语言只生成 `answer/query/clarify/prepare_write` 动作，SKU 必须先形成持久化草稿，再以当前版本和幂等键确认。重复请求复用同一 SKU；超时可按请求号核实；已成功执行不会被停止动作改写为取消。
- 工作台：支持 Agent 切换、新建/搜索/恢复本人会话、完整消息流、产品/SKU 候选、自然语言补充和 Form 手工编辑同一草稿、确认/取消、回执、执行状态及窄屏布局；请求版本隔离切换会话后的迟到响应，中文输入法组合态不触发发送。
- 计划状态：更新 `MD/内部Agent应用改造计划.md`，T01～T11 标记完成，T12 标记为自动化完成、待目标环境验收；补充已落地字段、状态、权限、接口和自测记录。
- 删除文件：无。
- 验证：TypeORM 实体列检查、新增 Agent 后端文件 ESLint、后端 TypeScript/NestJS build、前端 `vue-tsc` 与 Vite 生产构建、前端组件复用扫描均通过；后端全量 22 个测试套件、139 项测试通过。未执行目标数据库迁移，未连接真实模型账号，未启动常驻服务或进行浏览器人工验收。

### 2026-10-14 归档内部 Agent 应用改造计划

- 新增文件：`MD/内部Agent应用改造计划.md`。
- 修改文件：`CHANGELOG.md`；删除文件：无。
- 内容：将已讨论的问答测试升级方案独立归档，包含一期业务边界、T01～T12 任务计划表、应用管理与会话工作台 UI、录入草稿确认交互、现有模块复用边界、三阶段交付及验收清单；明确全部开发任务待实施，产品/SKU 试点仍需在开发前确认。
- 范围：仅文档整理，未修改前后端代码、接口、数据库、权限配置或运行服务。
- 验证：核对任务编号、章节、Markdown 表格及变更差异；未构建或启动服务。

### 2026-10-13 按页面场景规范 views 的封装组件复用

- 新增文件 / 删除文件：无。
- 修改页面（17 个）：`web/src/views/ai-workflow/Edit.vue`、`web/src/views/data-import/Index.vue`、`web/src/views/error/NotFound.vue`、`web/src/views/knowledge-ai-provider/Index.vue`、`web/src/views/knowledge-base/Categories.vue`、`web/src/views/knowledge-base/View.vue`、`web/src/views/log-record/Index.vue`、`web/src/views/menu/Edit.vue`、`web/src/views/menu/Index.vue`、`web/src/views/permission/Edit.vue`、`web/src/views/permission/Index.vue`、`web/src/views/role/Edit.vue`、`web/src/views/role/Index.vue`、`web/src/views/storage-config/Index.vue`、`web/src/views/system/Index.vue`、`web/src/views/user/Edit.vue`、`web/src/views/user/Index.vue`。
- 修改公共组件与文档：`web/src/components/CheckboxGroup.vue`、`AGENTS-COMPONENTS.md`、`CHANGELOG.md`。
- 范围：依据 `check:components` 的线索逐页阅读后，将可适配的底层按钮、输入框、开关、下拉及勾选组交由 Button / Input / Switch / Select / CheckboxGroup 或 Form 字段配置承接；不重新设计页面，不改后端、API 字段、权限定义、生成声明或检查脚本。
- 行为与样式：保留输入的非自动裁空格、清空、只读、回车及多行行为；菜单删除沿用原提示文案，由 Button 统一确认及异步防重；系统开关使用受控更新，接口成功前不改写行数据；导入模块重选同值不清空已有映射。用户名和角色编码通过 Form 配置落实原编辑禁改意图，移除未开启 slot 的无效插槽；密码使用封装 password 模式且不裁空格。角色选择保留原数字 ID 数组，不改接口类型。
- 公共能力：CheckboxGroup 增加默认关闭的 border 和带 option 参数的选项插槽，内部采用明确的 value 绑定；权限说明和必填标签保留。页面特有的网格、下拉宽度和文件名样式仍限定在页面祖先下，跨封装内部的样式采用受限 deep 选择器。
- 明确保留：6 处树表 / 本地编辑表 / 详情内独立分页表；1 处暂存原始 File 的 el-upload；菜单排序的步进 el-input-number；用户角色多选及导入表格内的 2 处 el-select（现有 Select/SelectMultiple 不支持 teleport，直接替换会被滚动容器裁剪）；产品 Excel 导入的隐藏原生文件 input。无对应封装的树、卡片等结构不强行替换。
- 复扫：`npm run --silent check:components -- src/views --json` 扫描 60 个 Vue 文件、0 跳过；上一轮关注的 50 处底层控件标签降至 10 处（均为上述明确保留项），迁移 40 处标签用法；隐藏文件 input 另计。此计数仅用于对照，不将脚本命中直接视作违规。
- 验证：显式应用 tsconfig 的 Web 类型检查、变更 Vue 文件的 script/template/style 静态编译、`git diff --check` 通过；内存 SSR / renderer 检查 CheckboxGroup 默认与自定义选项、值/边框/禁用及 scoped 样式，确认 Input/Select 跨插槽样式继承和 Switch 的受控更新；导入模块同值重选、真实切换和清空回归检查通过。未构建、未启动服务、未做浏览器视觉或真实接口联调。

### 2026-10-13 修复登录按钮全宽样式失效

- 新增文件 / 删除文件：无。
- 修改文件：`web/src/views/LoginView.vue`、`CHANGELOG.md`。
- 现象与原因：复用 Button 后，登录按钮缩成靠左的小按钮；class 已透传，但 Tooltip 插槽内的按钮未携带登录页的 scopeId，原 scoped `.login__btn` 选择器无法匹配。
- 修复：改为 `.login :deep(.login__btn)` 并说明原因，使 `width: 100%` 作用于登录页内的实际按钮；布局仍由登录页负责，不改公共 Button 或其他页面，也不涉及后端/接口字段。
- 验证：内存静态样式检查确认生成 `.login[data-v-login-check] .login__btn`，无需按钮携带父级 scopeId；Web 类型检查与 `git diff --check` 通过。未构建或启动服务，未进行浏览器视觉实测。

### 2026-10-13 根据组件检查线索整理 Login 表单及重复样式

- 新增文件 / 删除文件：无。
- 修改文件：`web/src/views/LoginView.vue`、`web/src/utils/permission.ts`、`.design-spec.md`、`CHANGELOG.md`。
- 检测与整改：先执行 `npm run check:components -- src/views/LoginView.vue`，再结合源码确认裸 `el-form` / `el-input` / `el-button` 可复用；改为 `Form` 字段配置及 actions 插槽配合 `Button`，输入框由 Form 内部封装 Input 渲染。保留登录专属 `el-card`，不将后台 PageContainer 强行套入登录页。
- 交互适配：改用封装 Form 的 Promise 校验和 `enter` 事件；保留密码显隐、用户名图标及 large 尺寸，明确账号密码 `trim: false`，防止封装默认去空格改变凭据。校验前设置共享 loading，防止按钮与回车重复提交；校验/接口错误沿用 Form/请求拦截器提示并释放 loading。输入框沿用封装默认的清空能力，补充自动填充与可访问名称。
- 样式复用：居中布局、标题字重和提示文字颜色/字号改用既有全局工具类；标题字号使用 Element Plus token。只保留全屏高度、渐变背景、卡片宽度、按钮全宽等登录专属声明，不重复覆盖组件内部样式。
- 配色：统一动作颜色映射新增 `login: primary` 并同步设计规范；登录 Button 不传权限码，保证未登录状态可见。不修改后端、登录请求字段或公共 Form/Input/Button 实现。
- 验证：整改前后均执行组件线索检查，迁移后模板不再直接使用 el-form/el-form-item/el-input/el-button；`npm run type-check -- -p tsconfig.app.json` 与 `git diff --check` 通过。仅做静态检查及源码复核，未构建或启动服务，未进行浏览器登录联调。

### 2026-10-13 将组件检查器精简为通用只读线索采集脚本

- 新增文件：无。
- 修改文件：`web/scripts/checkComponentUsage.mjs`、`web/package.json`、`AGENTS-FRONTEND.md`、`CHANGELOG.md`。
- 删除文件：`web/scripts/componentUsageRules.json`、`web/scripts/checkComponentUsage.test.mjs`（均可从 Git 历史恢复）；移除旧 `test:components` 命令。
- 调整原因：脚本职责是定位线索，交给 AI 结合页面及组件契约判断，而非模拟场景理解、判定合规或维护自动替换规则。
- 实现：单文件、仅使用 Node 内置模块；导出与 Vue 无关的 `collectMatches({ targets, pattern, extensions, context })`，复用文件遍历、逐行正则匹配、行列定位及上下文采集。组件 CLI 附带 `GlobalComponents` 本地映射，支持多个文件/目录、`--mapping`、`--json` 和帮助；移除 AST 语义分析、替换规则、严格模式及复杂筛选配置。
- 边界：不执行或改写扫描内容；保留路径去重、依赖/产物/符号链接跳过。组件实现、注释、字符串及类型文本也可能命中，动态或跨行用法可能遗漏；报告明确不等于违规或替换清单，AI 需继续阅读原文件。未改业务页面、生成声明或前后端接口。
- 验证：Node 语法检查、Web 类型检查与 `git diff --check` 通过；只读扫描 Login（含多行 Form/Input/Button 标签）及全量 83 个 Vue 文件通过。通用函数验证覆盖零命中、重叠目标去重、重复调用、行列/上下文、扩展名、零长度匹配、目录跳过、参数错误；扫描前后 83 个 Vue 文件及组件声明的哈希一致。JSON/npm 入口、自定义映射路径和 CLI 错误行为验证通过。未构建或启动服务。

### 2026-10-13 新增 GlobalComponents 组件复用检查脚本

- 新增文件：`web/scripts/checkComponentUsage.mjs`、`web/scripts/componentUsageRules.json`、`web/scripts/checkComponentUsage.test.mjs`。
- 修改文件：`web/package.json`、`AGENTS-FRONTEND.md`、`CHANGELOG.md`。
- 删除文件：无。
- 功能：支持指定一个或多个 Vue 文件/目录，默认扫描 `web/src`；从 `GlobalComponents` 本地 `.vue` 映射读取项目封装组件，结合独立 JSON 替代规则输出已引用组件及带行列的复用候选。支持组件筛选、自定义映射/规则、路径排除、JSON 报告及严格模式退出码。
- 判断边界：第三方 El*/Router* 映射不是项目封装，不要求页面用完全部组件。解析模板与运行时导入，识别组件大小写/连字符、别名、子路径和命名空间，以及可静态确定的动态组件；跳过注释、样式、脚本文字、类型导入和 v-pre 示例。只把 `.vue` 默认导出当作映射组件，辅助函数和同名局部绑定不会误计。未知动态用法列为待人工检查，外部模板/脚本或 Pug 明确报错。
- 例外：默认豁免基础封装实现，但组合组件仍检查；跳过依赖、产物和符号链接。原生 HTML 控件提醒需 `--include-native` 开启，不混淆 `<form>` 和 `<Form>`。ElFormItem 等无独立封装的子组件不重复报警，ElSelect/日期/上传提供候选并提醒人工核对接口和行为，不自动替换。
- 安全与集成：脚本只读、不执行扫描文件或配置，不改 Login 及其他业务页面，不手改 `components.d.ts`；新增 `check:components` / `test:components` 命令，不接入 build、提交钩子或批量修复。无后端、数据库和接口变更。
- 验证：37 项自动化测试全部通过，涵盖识别、误报边界、目录去重/排除、实现豁免、只读保证和 CLI 0/1/2 退出码；Node 语法检查、Web 类型检查、`git diff --check` 通过。Login 精确报告 4 处候选（Form 1、Input 2、Button 1）；全量扫描 65 个 Vue 文件、18 个豁免项，输出 62 处复用候选、5 处待人工检查、0 个解析错误。报告是整理依据，不等同于 62 个已确认缺陷。未构建或启动服务。

### 2026-10-13 AI + 云开发微信小程序极速开发流程 PPT

- 新增文件：`artifacts/wechat-mini-program-ppt/AI微信小程序极速开发流程_v2.pptx`、`artifacts/wechat-mini-program-ppt/assets/cover-hero.png`。
- 修改文件：`CHANGELOG.md`。
- 删除文件：无；生成过程中的 v1 草稿与私有构建文件未作为成果保留。
- 内容：将账号主体/名称/类目/备案/认证、CloudBase 云环境、CodeBuddy 协作开发、总项目结构、本地管理端和交付检查整理为 8 页中文演示稿；明确"一天完成"仅指前置条件齐备后的 MVP 开发与联调，不包含备案、认证和平台审核时间。
- 资料核对：按腾讯云官方定价页更新为 1 个免费环境、每月 3,000 资源点、按规则每次续期 6 个月；个人版 `19.9 元/月` 标注为当前限时优惠，并提示以后续官方页面为准。演示稿备注中保留 CloudBase、CodeBuddy 与备案依据链接。
- 验证：PPTX 共 8 页，包结构、预期页面尺寸、标题适配、原生项目符号、`Noto Sans SC` 字体策略及演示工具回读全部通过；逐页渲染检查并修正总流程与项目结构连接线方向。未修改前后端代码，未构建或启动服务。

### 2026-10-09 应用 AI 并发、持久化排队与人工客服接待

- 新增后端文件：`server/src/customer-service/customer-service.controller.ts`、`customer-service.module.ts`、`customer-service.service.ts`、`customer-service.service.spec.ts`、`legacy-knowledge-ai-chat.controller.ts`、`dto/customer-service.dto.ts`、`entities/customer-chat-message.entity.ts`、`entities/customer-chat-task.entity.ts`（后七项均位于 `server/src/customer-service/`）；`server/src/knowledge-ai-chat/knowledge-ai-chat-execution.spec.ts`、`server/src/knowledge-ai-providers/knowledge-ai-cancellation.spec.ts`、`server/src/migrations/1788911200000-AddCustomerServiceReception.ts`、`server/scripts/verify-customer-service.cjs`。
- 新增前端文件：`web/src/api/customerService.ts`、`web/src/views/customer-service/Index.vue`、`web/src/views/customer-service/View.vue`。
- 修改后端文件：`server/src/app.module.ts`、`server/src/common/list-query-filters.spec.ts`、`server/src/external-apps/dto/external-app.dto.ts`、`server/src/external-apps/entities/external-app.entity.ts`、`server/src/external-apps/external-apps.service.ts`、`server/src/knowledge-ai-chat/dto/knowledge-ai-chat.dto.ts`、`server/src/knowledge-ai-chat/entities/knowledge-ai-chat-session.entity.ts`、`server/src/knowledge-ai-chat/knowledge-ai-chat.controller.ts`、`server/src/knowledge-ai-chat/knowledge-ai-chat.module.ts`、`server/src/knowledge-ai-chat/knowledge-ai-chat.service.ts`、`server/src/knowledge-ai-providers/knowledge-ai-providers.service.ts`、`server/src/menus/menus.service.ts`、`server/src/users/users.service.ts`。
- 修改前端及文档：`web/src/api/externalApp.ts`、`web/src/components/Button.vue`、`web/src/router/index.ts`、`web/src/views/external-app/Edit.vue`、`web/src/views/external-app/Index.vue`、`AGENTS-COMPONENTS.md`、`MIGRATION.md`、`CHANGELOG.md`。
- 关联 H5 仓库 `D:\AllProjects\H5\ai-customer-service`：新增 `RECEPTION.md`、`css/reception.css`、`js/receptionApi.js`、`js/receptionStore.js`、`js/reception.js`、`tests/reception.test.cjs`；修改 `AGENTS.md`、`index.html`，单独提交。既有 `.design-spec.md`、`REQUIREMENTS.md`、`css/style.css`、`js/api.js`、`js/app.js` 与未跟踪 `OVERVIEW.md` 保持原样、不纳入提交。
- 删除文件：无业务文件删除；只清理本次跨仓库编辑的临时工作副本。
- 应用设置：前后端统一新增 `maxConcurrentChats`，1～1000，留空为不限额。名额按应用计算，覆盖整轮 AI 提词、检索、生成和结果保存；正常结束、失败后释放。排队和人工接待不占名额，取消中的执行在真正结束前仍占名额。
- 调度：新增任务表及消息时间线，应用行锁串行化入队、领取与接手，FIFO 队列每应用最多 200 条、等待上限 15 分钟、AI 执行上限 180 秒。同会话限一轮活动 AI 任务；消息标识幂等，超时重试不重复入队。重启恢复待执行任务，不重跑已中断的模型调用；短暂收尾落库失败只重试保存、不重复生成。
- 人工：访客可主动申请人工、取消等待并返回 AI；后台"客服工作台"可主动接手排队或正在回答的会话，双方继续发消息，当前接待客服可结束会话。事务裁决多人同时接手，非接待客服不能代发或结束；结束后继续咨询须新建会话。独立根菜单和 `CustomerService.read/create/update` 权限避免普通客服被超管菜单隐藏。
- 竞态与安全：随机会话凭证仅存摘要，请求同时校验应用与凭证；旧公开流式 URL 也接入同一调度器，不能绕过限制。接待版本、执行取消信号和有条件数据库更新共同阻断接手后的迟到 AI 回复及会话覆盖。取消的 AI 结果不进入后续对话历史；删除接待记录前须结束且无活动任务，并关联软删除新旧消息和任务。
- 客户端：H5 接入正式 API、SSE 状态/消息同步、断线恢复、排队位置、取消、转人工和可分页历史，不再以随机会话 ID 或模拟回复兜底；新会话显式创建，当前会话按标签页保存。后台按应用/接待状态/AI 队列/本人筛选，保留草稿和幂等重试，切换会话或旧请求迟到时不覆盖当前状态。历史旧会话无凭证仅本地只读。
- 配套修复：公共 Button 的调用方 `disabled/loading` 原先会被内部 `pending=false` 覆盖，现与内部保护、权限降级合并，确保接待按钮真实禁用；补齐既有列表测试缺失的第六个构造参数，使全量后端测试恢复通过。
- 验证：后端 19 个测试套件、128 项测试全部通过；H5 13 项测试通过；真实 MySQL 随机隔离库 12 项集成验证全部通过，覆盖迁移幂等、并发/FIFO、重复请求、凭证与跨应用隔离、双客服接手、人工收发、取消释放、单实例锁、历史分页；测试库已精确删除。后端和 Web 生产构建、Web 类型检查、H5 JavaScript 语法检查、`git diff --check` 通过。未调用真实模型、未自动重启既有业务服务，未进行浏览器端人工联调。
- 部署边界：首版通过 MySQL 命名锁强制同库单服务进程，不支持 PM2 cluster/多副本；获授权客服可见本企业所有应用，不是分应用多租户授权。生产须备份并执行增量迁移，然后同步发布后端、Web、H5；旧客户端须升级 `sessionToken` 与 `clientMessageId`，详见 `MIGRATION.md` 第七节。

### 2026-10-08 聊天产品关键词提炼、部分匹配与业务查询状态修复
- 新增文件：`server/src/product-catalog/product-search.ts`。
- 修改文件：`server/src/product-catalog/product-catalog.service.ts`、`server/src/product-catalog/product-catalog.service.spec.ts`、`server/src/knowledge-ai-chat/knowledge-ai-chat.service.ts`、`server/src/knowledge-ai-chat/knowledge-ai-chat.service.spec.ts`、`server/src/knowledge-ai-chat/knowledge-ai-chat-command.service.ts`、`server/src/knowledge-ai-chat/knowledge-ai-chat-trace.ts`、`server/src/ai-command-definitions/ai-command-definitions.constants.ts`、`web/src/api/knowledgeAiChat.ts`、`web/src/views/knowledge-ai-record/Index.vue`、`CHANGELOG.md`。
- 删除文件：无。
- 现象与原因：卷尺能命中，靠枕无法命中已有的"云朵 记忆棉靠枕"；旧查询只检查问题是否包含完整产品名/别名。业务查询虽已授权并执行，但未命中时被写成 `executed=false`，且回答提示词只强调知识库未启用，导致模型错误表述成商品检索未启用。
- 查询：在已授权、工作流已开启且未命中标准问答的前提下，用当前聊天模型从本轮原始/校准问题提炼产品词；校验关键词来源和数量，异常或非法输出回退本地分词，不携带上一轮商品干扰当前品类。提炼调用的 Token 纳入本轮统计。
- 匹配：保留产品全名/别名识别，新增查询词对产品名称/别名/编码的包含匹配；多产品最多返回 5 组真实产品及 SKU 候选，不按排序猜定一个产品，同分 SKU 也保留候选。继续只查询已启用、未软删除的数据，不改变授权边界。
- 前后端契约：业务轨迹新增可选 `status/queryKeywords/keywordSource`，产品结果扩展 `matchType=products/candidateProducts/totalProducts`；字段在前后端同步，不改数据库表结构。同步 `product.sku.lookup` 的可选关键词参数契约。
- 状态与文案：分别记录未授权、未执行、执行中、已命中、已执行但未命中和执行失败；问答详情展示查询词及来源，旧记录依据已有执行阶段兼容显示，不改写历史数据。回答明确区分文档检索与商品查询，禁止把未命中说成未授权/未启用或断言商品不存在。
- 验证：3 组针对性测试共 24 项通过，TypeORM 实体列检查、后端源码 `tsc --noEmit --incremental false -p tsconfig.build.json`、前端 `vue-tsc --noEmit -p tsconfig.app.json`、`git diff --check` 通过；只读真实产品数据复现已能用原始靠枕问题命中 3 个 SKU，卷尺仍返回 4 个 SKU。未调用真实模型、未构建或启动服务。
- 已知基线：包含全部测试文件的后端类型检查仍报原有 `server/src/common/list-query-filters.spec.ts:68` 构造函数仅传 5 个参数、实际需要 6 个的错误；已核对 HEAD 中同样存在，本次未改动该无关文件。

### 2026-10-08 产品列表快捷启停
- 新增文件：无。
- 修改文件：`web/src/views/product/Index.vue`、`web/src/api/productCatalog.ts`、`CHANGELOG.md`。
- 删除文件：无。
- 功能：产品列表操作列按当前状态显示"启用"或"停用"；停用需二次确认，确认和请求期间自动 loading、防重复点击，成功后提示并按当前筛选条件刷新列表。
- 规范：通过 Table 的 actions 插槽复用 Button 封装，权限沿用 `Product.update`，启停配色使用公共动作映射。
- 接口：前端更新入参改为 `Partial<ProductForm>`，与后端 `UpdateProductDto` 对齐；复用 `PATCH /products/:id`，仅提交 `isEnabled`，不修改其他产品字段或 SKU 状态，无后端和数据库变更。
- 验证：前端 `vue-tsc --noEmit -p tsconfig.app.json`、生产构建、`git diff --check` 通过；构建仅有依赖中的 PURE 注释警告。未启动服务或执行浏览器交互自测。

### 2026-09-29 新建 SKU 同步参考参数值
- 新增文件：无。
- 修改文件：`web/src/views/product-sku/Edit.vue`、`CHANGELOG.md`。
- 删除文件：无。
- 功能：新建 SKU 识别到同产品已有参考 SKU 时，自定义参数由仅带出 Name、Label 调整为完整带出 Name、Label、Value；用户可以直接保留参考值或重新编辑 Value。
- 兼容：复制参数行时保留原始值元数据，未修改的历史数字、布尔或对象值继续按原类型保存；修改后的 Value 按输入文本保存。内置尺寸、质量、颜色仍保持空白，不从参考 SKU 复制。
- 接口：继续复用现有 `GET /product-skus` 查询，不新增后端接口、字段或数据库变更。
- 验证：前端 `vue-tsc --noEmit`、生产构建、`git diff --check` 通过；未启动服务。

### 2026-09-29 Dialog 内边距调整为 25px
- 新增文件：无。
- 修改文件：`web/src/components/Dialog.vue`、`AGENTS-COMPONENTS.md`、`CHANGELOG.md`。
- 删除文件：无。
- 调整：在通用 Dialog 根节点覆盖 Element Plus 的 `--el-dialog-padding-primary`，将内容、标题和底部操作区到弹窗边框的默认间距由 16px 统一调整为 25px。
- 范围：所有使用封装 Dialog 的页面统一生效；滚动区域、隐藏滚动条、宽度和最大高度行为保持不变，不涉及后端或接口。
- 验证：前端 `vue-tsc --noEmit`、`git diff --check` 通过；按样式调整范围不构建、不启动服务。

### 2026-09-29 Dialog 隐藏可见滚动条
- 新增文件：无。
- 修改文件：`web/src/components/Dialog.vue`、`AGENTS-COMPONENTS.md`、`CHANGELOG.md`。
- 删除文件：无。
- 调整：通用 Dialog 内容区隐藏右侧滚动条轨道与滑块，同时保留鼠标滚轮、触控板和键盘滚动能力；兼容 Chromium/Safari、Firefox 及旧版 Edge 的滚动条隐藏方式。
- 范围：所有使用封装 Dialog 的页面统一生效，不修改内容最大高度、字段、接口或后端逻辑。
- 验证：前端 `vue-tsc --noEmit`、`git diff --check` 通过；按样式修复范围不构建、不启动服务。

### 2026-09-28 修复 Select 窗口恢复焦点误选
- 新增文件：无。
- 修改文件：`web/src/components/Select.vue`、`AGENTS-COMPONENTS.md`、`CHANGELOG.md`。
- 删除文件：无。
- 现象：Dialog 中选择产品并收起下拉后，切换到其它窗口，再返回点击任意输入框时界面会短暂闪烁，所属产品可能固定切换为候选列表中的同一个选项。
- 原因：Select 完成选择后内部输入框仍保留焦点；窗口重新激活时原生焦点恢复触发 `@focus="open"`，重新打开下拉并初始化候选高亮，首次激活点击与选项 `mousedown` 选择发生竞争，可能将固定候选写回。产品切换后又会刷新 SKU 编码和参考参数，因此表现为 Dialog 闪烁。
- 修复：取消获得焦点即打开，下拉仅由明确点击控件或方向键/Enter 打开；输入框或窗口失焦时主动关闭并清理搜索、高亮状态。Tab 仍可聚焦，键盘打开和选择能力保持不变。
- 范围：修复通用单选 Select，所有使用该封装的页面同步生效；不修改 Dialog、业务字段、接口或后端逻辑。
- 验证：前端 `vue-tsc --noEmit`、`git diff --check` 通过；按缺陷修复范围不构建、不启动服务，未进行跨窗口浏览器自动化复现。

### 2026-09-28 新建 SKU 自动带出参考参数
- 新增文件：无。
- 修改文件：`web/src/views/product-sku/Edit.vue`、`CHANGELOG.md`。
- 删除文件：无。
- 功能：新建 SKU 选择产品后，自动查询该产品最新的一个 SKU，并带出其自定义参数 Name、Label；Value 保持为空，用户只需填写当前 SKU 的参数值。
- 交互：切换产品时重新匹配参考 SKU；参数区加载期间显示遮罩；关闭弹窗或快速切换产品时忽略过期请求；编辑已有 SKU 时不执行参考参数覆盖。无参考 SKU 或参考 SKU 无自定义参数时保持空白，可继续手动添加。
- 接口：复用现有 `GET /product-skus` 的 `productId` 筛选、倒序和规格返回能力，不新增后端接口、字段或数据库变更。
- 验证：前端 `vue-tsc --noEmit`、生产构建、`git diff --check` 通过；未启动服务或进行浏览器联调。
- 保留：用户已有 `web/components.d.ts` 及 `web/src/views/product-sku/Edit.vue` 中"SKU 规格"标签改动不纳入提交。

### 2026-09-28 Dialog 禁止点击遮罩关闭
- 新增文件：无。
- 修改文件：`web/src/components/Dialog.vue`、`AGENTS-COMPONENTS.md`、`CHANGELOG.md`。
- 删除文件：无。
- 调整：通用 Dialog 关闭 `close-on-click-modal`，点击遮罩层不再关闭弹窗，避免表单误触丢失；同步组件契约说明。
- 检查：业务代码共有 29 处使用封装 Dialog；原生 `el-dialog` 仅存在于封装组件内部。19 个编辑页中 18 个使用 Dialog，知识库编辑页按既有交互使用 Drawer；其余模态交互为 MessageBox 确认或输入提示。
- 范围：仅前端公共弹窗行为，不修改字段、接口或后端逻辑。
- 验证：前端 `vue-tsc --noEmit`、`git diff --check` 通过；按公共组件行为调整范围不构建、不启动服务。
- 保留：用户已有 `web/components.d.ts`、`web/src/views/product-sku/Edit.vue` 改动不纳入提交。

### 2026-09-28 SKU 规格名提示与通用参数精简
- 新增文件：无。
- 修改文件：`web/src/views/product-sku/Edit.vue`、`web/src/views/product-sku/specifications.ts`、`CHANGELOG.md`。
- 删除文件：无。
- 调整：SKU 规格名示例改为"2.5 × 75 毫米"等核心规格，并提示无需重复产品名称；内置通用参数移除品牌、型号，仅保留尺寸、质量、颜色。
- 兼容：历史 SKU 已保存的品牌、型号仍按自定义参数回显和保存，避免静默丢失数据。
- 范围：仅前端表单展示和参数预设，不修改接口、后端字段或数据库结构。
- 验证：前端 `vue-tsc --noEmit -p tsconfig.app.json`、`git diff --check`；按表单调整范围不构建、不启动服务。
- 保留：用户已有 `web/components.d.ts` 改动不纳入提交。

### 2026-09-28 SKU 自定义参数输入与删除按钮统一
- 新增文件：无。
- 修改文件：`web/src/views/product-sku/Edit.vue`、`CHANGELOG.md`。
- 删除文件：无。
- 调整：自定义参数的 Name、Label、Value 统一使用单行输入框；行尾操作改为标准危险色删除按钮并使用删除图标，删除未保存参数行时不增加额外权限限制或确认弹窗。
- 范围：仅前端展示与本地表单交互，不修改字段、接口或后端逻辑。
- 验证：前端 `vue-tsc --noEmit`、`git diff --check` 通过；按界面调整范围不构建、不启动服务。
- 保留：用户已有 `web/components.d.ts` 改动不纳入提交。

### 2026-09-17 口语化表达独立于工作流
- 新增文件：无。
- 修改文件：
  - `web/src/views/knowledge-colloquial-term/Edit.vue`、`web/src/views/knowledge-colloquial-term/Index.vue`、`web/src/api/knowledgeColloquialTerm.ts`：移除适用工作流、范围列和筛选、工作流列表请求及范围字段。
  - `server/src/knowledge-colloquial-terms/dto/knowledge-colloquial-term.dto.ts`、`server/src/knowledge-colloquial-terms/knowledge-colloquial-terms.service.ts`、`server/src/knowledge-colloquial-terms/knowledge-colloquial-terms.module.ts`：移除范围参数和配置仓库依赖，所有启用词条统一参与改写；新增/改名全局查重，历史同名词条仍可编辑或停用；匹配按长词优先、同词取最新 ID，不再按工作流优先。
  - `server/src/knowledge-colloquial-terms/entities/knowledge-colloquial-term.entity.ts`：历史范围列保留但不再用于业务，避免数据库结构变更。
  - `server/src/knowledge-ai-chat/knowledge-ai-chat-command.service.ts`、`server/src/knowledge-ai-chat/knowledge-ai-chat.service.ts`：口语改写调用不再传递工作流 ID。
  - `server/src/ai-command-definitions/ai-command-definitions.constants.ts`：同步移除口语改写内置命令的工作流参数及上下文绑定。
  - `server/src/knowledge-colloquial-terms/knowledge-colloquial-terms.service.spec.ts`：同步共享词库语义和服务构造参数，覆盖历史范围词条与同名优先级。
  - `CHANGELOG.md`：修改快照。
- 删除文件：无。
- 验证：前端 vue-tsc、后端生产源码及口语词库测试文件类型检查、git diff --check 通过；按修复范围仅做静态检查，未运行测试、未构建或启动服务。
- 保留：用户已有 `web/components.d.ts` 改动不纳入提交。

### 2026-09-17 侧边栏菜单搜索
- 新增文件：无。
- 修改文件：`web/src/layouts/MainLayout.vue`、`CHANGELOG.md`。
- 删除文件：无。
- 功能：Logo 下方增加可清空的菜单搜索框；基于当前用户已有权限菜单按名称进行不区分大小写、忽略首尾空格的本地模糊匹配；保留祖先路径并展开结果，匹配目录时保留其子菜单；无匹配时显示提示，支持 Esc 清空，侧栏折叠时清空搜索，清空后恢复原菜单实例。
- 范围：仅前端布局，复用 MenuTree 与现有 MenuNode 字段，不增加请求或修改后端接口；沿用深色侧边栏设计。
- 验证：前端 `vue-tsc --noEmit -p tsconfig.app.json`、`git diff --check` 通过；未构建、未启动服务，未进行浏览器交互验证。
- 保留：用户已有 `web/components.d.ts` 改动不纳入提交。

### 2026-09-15 MinerU 引擎字段与单选校验提示修复
- 新增文件：无。
- 修改文件：`web/src/views/ai-feature-config/Edit.vue`（字段简化为"MinerU引擎"，必填规则按 change、blur 触发）；`web/src/components/Select.vue`（接入表单项校验，选择/清空后等待父级值更新再校验，失焦触发 blur）；`AGENTS-COMPONENTS.md`（补充单选自动校验契约）；`CHANGELOG.md`（快照）。
- 删除文件：无。
- 验证：前端 vue-tsc、git diff --check 通过；未构建、未启动服务。
- 保留：用户已有 `web/components.d.ts` 改动不纳入提交。

### 2026-09-15 MinerU 识别后按提示词调用大模型整理
- 新增文件：`server/src/knowledge-bases/mineru-refine.spec.ts`（提示词及模型传递、整理后入库、分段失败不写入、缺失模型与空输出测试）。
- 修改文件：
  - `web/src/views/ai-feature-config/Edit.vue`：MinerU 模式展示整理模型账号、文本模型、温度、提示词和固定 Markdown 返回格式；切换引擎不再清空模型账号，保存保留整理配置。
  - `server/src/ai-feature-configs/ai-feature-configs.service.ts`、`server/src/ai-feature-configs/ai-feature-configs.service.spec.ts`：保留并校验 MinerU 关联整理模型，以 documentParse 文本能力校验，固定输出 Markdown。
  - `server/src/knowledge-bases/knowledge-bases.service.ts`：知识库解析、单文档解析、结果查询、任务恢复统一接入 MinerU 后的大模型整理；长内容按既有规则分段；记录整理开始、逐段执行、成功与失败；失败保留旧正文并标记失败，成功后才入库，完成接口返回整理后的 Markdown。
  - `CHANGELOG.md`：修改快照。
- 删除文件：无；复用 providerId、model、temperature、systemPrompt、responseFormat，无数据库结构变更。
- 使用说明：原 MinerU 配置此前清空过账号和模型，需要重新编辑补齐整理模型后保存；整理额外消耗大模型调用时间及额度。提示词传给整理模型，不传给 MinerU。
- 验证：前端 vue-tsc、后端生产源码类型检查、后端 build 与实体列检查、配置/整理流程及知识库回归共 14 项测试、git diff --check 通过。未启动服务或调用真实 MinerU/大模型。
- 保留：用户原有 `web/components.d.ts` 改动未纳入提交。

### 2026-09-15 SKU 自动编号与内置、自定义参数
- 新增文件：`server/src/product-catalog/product-sku-code.spec.ts`（编号预览、历史序号、编辑保号、切换产品、重复编码及聊天参数匹配测试）。
- 修改文件：
  - `server/src/product-catalog/dto/product-catalog.dto.ts`、`web/src/api/productCatalog.ts`：对齐可选 skuCode，新增编号预览接口类型。
  - `server/src/product-catalog/product-catalog.controller.ts`、`server/src/product-catalog/product-catalog.service.ts`：预览"产品编号-001"格式；保存时事务锁定所属产品后分配序号，计入已删除的历史编号；同产品编辑保号，切换产品自动重新编号；聊天匹配读取 Label/Value 参数中的真实值。
  - `web/src/views/product-sku/Edit.vue`：SKU 编码只读自动预览；内置品牌、型号、质量、尺寸、颜色，只填写值；其它参数由 Name、Label、Value 自定义维护。
  - `web/src/views/product-sku/specifications.ts`、`web/src/views/product-sku/Index.vue`：按 Name 保存 Label/Value 对象，列表显示名称和值；兼容旧中文键、重量及复杂参数值，检查 Name 重复和内置字段占用。
  - `CHANGELOG.md`：本次修改快照。
- 删除文件：无；无数据库结构变更。
- 验证：前后端生产源码类型检查、后端 build 与实体列检查、产品模块 15 项测试、SKU 参数往返与校验脚本、git diff --check 通过；未启动服务，未进行真实数据库并发或浏览器联调。
- 保留：用户已有 `web/components.d.ts` 改动不纳入提交。

### 2026-09-15 修复产品列表末尾按钮间距
- 新增文件：无。
- 修改文件：`web/src/views/product/Index.vue`、`CHANGELOG.md`。
- 删除文件：无。
- 修复：将隐藏的 Excel 文件选择框移出工具栏，恢复"Excel 导入"和"批量删除"按钮之间的相邻按钮间距（12px），保持文件选择与导入逻辑不变。
- 验证：前端 vue-tsc、git diff --check 通过；未构建、未启动服务。

### 2026-09-15 产品中文 Excel 模板与导入、SKU 参数录入优化
- 新增文件：
  - `server/src/product-catalog/product-excel.service.ts`：生成中文空白模板与填写说明；校验文件、表头、行数、字段长度、公式、重复产品；事务批量新增并生成内部产品编码。
  - `server/src/product-catalog/product-excel.service.spec.ts`：模板往返、错误行不写入、重复、公式、表头、禁用状态及文件边界测试。
  - `web/src/views/product-sku/specifications.ts`：通用、空气净化器及仪表参数预设，参数转换和重复名称校验，兼容未修改的历史对象、数组、数字和布尔值。
- 修改文件：
  - `server/package.json`、`server/package-lock.json`：增加 ExcelJS 运行时依赖。
  - `server/src/product-catalog/product-catalog.controller.ts`、`server/src/product-catalog/product-catalog.module.ts`：注册产品模板下载及文件导入，分别复用 Product.read、Product.create 权限。
  - `web/src/api/productCatalog.ts`、`web/src/views/product/Index.vue`：模板导出、Excel 文件选择、导入状态及逐行错误结果、成功刷新列表。
  - `web/src/views/product-sku/Edit.vue`、`web/src/views/product-sku/Index.vue`：中文参数名称和值录入，可添加预设或自定义参数，移除默认样例值，列表直接展示参数。
  - `CHANGELOG.md`：本次修改快照。
- 删除文件：无。无数据库字段或迁移变更。
- 导入约定：仅 .xlsx，最大 5 MB、1000 个产品；中文字段为产品名称、产品别名、产品分类、产品描述、是否启用；无编号列。只新增，同名同分类拒绝导入；留空状态默认启用；任一行错误时整份不写入。
- 验证：前端 vue-tsc、后端生产源码 tsc、实体列检查、后端 build、产品模块 9 项单元测试、SKU 参数兼容与校验脚本、git diff --check 通过。未启动服务或进行浏览器联调。
- 已有问题：后端包含所有测试文件的 tsc 检查被 `server/src/common/list-query-filters.spec.ts:68` 的 KnowledgeAiChatService 构造参数缺失阻断，与本次产品改动无关，未修改该文件。
- 保留：用户原有 `web/components.d.ts` 未提交改动未纳入本次提交。

### 2026-09-15 标准问答库独立于工作流
- 新增：无。
- 修改：
  - `web/src/views/knowledge-standard-qa/Edit.vue`、`web/src/api/knowledgeStandardQa.ts`、`server/src/knowledge-standard-qas/dto/knowledge-standard-qa.dto.ts`（移除适用工作流、范围参数及配置列表请求）。
  - `server/src/knowledge-standard-qas/knowledge-standard-qas.service.ts`、`server/src/knowledge-standard-qas/knowledge-standard-qas.module.ts`（移除检索配置依赖、范围过滤和范围优先级；统一匹配已发布且有效的标准问题及相似问法，重复命中按最新 ID 选择）。
  - `server/src/knowledge-standard-qas/entities/knowledge-standard-qa.entity.ts`（历史范围列保留但不再读写或参与匹配）。
  - `server/src/knowledge-standard-qas/knowledge-standard-qas.service.spec.ts`（将原范围优先级用例更新为共享库匹配回归用例）。
  - `server/src/approval-requests/approval-requests.service.ts`、`server/src/knowledge-ai-chat/knowledge-ai-chat.service.ts`、`server/src/knowledge-ai-chat/knowledge-ai-chat-trace.ts`、`web/src/api/knowledgeAiChat.ts`、`web/src/views/knowledge-ai-record/Index.vue`（审批快照、问答命中快照及展示不再携带标准问答的工作流范围）。
- 删除：无。
- 说明：工作流节点继续控制是否查询标准问答库；以前绑定其它配置的条目同样参与查询，无需迁移数据。审批、发布状态、有效期和精确匹配规则保留。
- 验证：仅做前端与后端生产源码类型检查、git diff --check；不构建、不启动服务，不运行单元测试。

### 2026-09-15 问答测试明确选择聊天配置与工作流
- 新增：无。
- 修改：
  - `web/src/views/knowledge-ai-chat/Index.vue`（聊天配置只列出启用的聊天类型配置且必选；工作流下拉读取真实 AI 工作流并提交 workflowId；问题初始为空，切换配置重置会话）。
  - `web/src/api/knowledgeAiChat.ts`、`server/src/knowledge-ai-chat/dto/knowledge-ai-chat.dto.ts`（对齐可选 workflowId，供后台测试入口使用，保留外部流式接口已有字段）。
  - `server/src/knowledge-ai-chat/knowledge-ai-chat.service.ts`（后台测试要求聊天配置与工作流，模型账号和模型均取所选聊天配置）。
  - `server/src/knowledge-retrieval-configs/knowledge-retrieval-configs.service.ts`（根据真实 workflowId 解析唯一启用的关联检索配置；工作流停用、关联缺失或多条关联时明确报错，不任意选择）。
  - `web/src/views/external-app/Index.vue`（缺少聊天配置时显示未配置）。
  - `web/src/views/knowledge-standard-qa/Edit.vue`、`web/src/views/knowledge-colloquial-term/Edit.vue`（删除全局虚拟下拉项，仅列数据库配置；保留留空时共享适用范围的既有业务语义）。
- 删除：无。
- 验证：前端 vue-tsc、后端生产源码 tsc --noEmit、git diff --check 通过；未构建、未启动服务、未调用模型。无数据库结构变更。

### 2026-09-15 修复问答超时缺少执行阶段记录
- 新增：无。
- 修改：
  - `server/src/knowledge-ai-chat/knowledge-ai-chat.service.ts`（普通与流式问答先创建记录；按请求隔离执行上下文，逐阶段持久化进度，异常保留失败阶段，完成时更新同一消息；未完成和失败消息不进入模型历史上下文）。
  - `server/src/knowledge-ai-chat/knowledge-ai-chat-retrieval.service.ts`（路由、文本与向量召回、重排以及检索回退上报执行阶段）。
  - `server/src/knowledge-ai-chat/knowledge-ai-chat-trace.ts`、`web/src/api/knowledgeAiChat.ts`（在既有 processingTrace 中增加可选 execution 字段，兼容历史 JSON；测试问答请求超时单独调整为 300 秒）。
  - `web/src/views/knowledge-ai-record/Index.vue`（列表展示处理中及当前阶段/错误，详情展示阶段状态、开始时间、耗时和错误，支持手动刷新；区分检索配置和关联工作流名称）。
- 删除：无。
- 说明：复用已有 JSON 列，无数据库迁移。浏览器超时后后端可能继续执行，可刷新问题记录查看最新阶段；进程意外终止时保留最后持久化的阶段，不将其伪报为已完成。历史缺失的轨迹无法回补。
- 验证：仅进行前后端类型检查与 git diff --check，不启动服务、不构建、不调用模型。

### 2026-09-15 修复 AI 问答测试未接入检索策略
- 新增：无。
- 修改：
  - `web/src/views/knowledge-ai-chat/Index.vue`（增加必选的已启用检索策略，将既有 retrievalConfigId 随问答请求发送并显示关联工作流；切换聊天配置或策略时重置会话，请求期间禁用配置切换）。
  - `server/src/knowledge-ai-chat/knowledge-ai-chat.service.ts`（后台问答测试缺少策略时直接报错，在创建会话和调用模型前加载策略；加载策略统一校验启用状态）。
- 删除：无。
- 说明：修复测试页仅选择聊天模型配置、导致知识范围和关联工作流未生效的问题。复用现有接口字段，不修改数据库；具体回答规则仍由选定的聊天配置、检索策略和工作流决定。本次仅做静态检查，不启动服务、不构建、不调用外部模型。
- 验证：前端 vue-tsc、后端生产源码 tsc --noEmit、git diff --check 通过；后端含测试文件的全量类型检查被既有 `src/common/list-query-filters.spec.ts:68` 构造参数数量错误阻断（预期 6 个，实际 5 个）。

### 2026-09-14 移除问答测试临时提示覆盖
- 新增：无。
- 修改：
  - `web/src/views/knowledge-ai-chat/Index.vue`（移除"临时提示"表单项及请求参数，测试统一使用所选聊天配置自身的系统提示词）。
- 删除：无。
- 说明：后端接口仍保留该可选字段以保持接口兼容，但管理后台测试页不再提供覆盖入口。

### 2026-09-14 更名文档上传拆分规则菜单
- 新增：
  - `server/src/migrations/1788907600000-RenameDocumentUploadSplitRuleMenu.ts`（将历史默认菜单"文档解析规则"升级为"文档上传拆分规则"，不重置数据，也不覆盖管理员已改名的菜单）。
- 修改：
  - `server/src/menus/menus.service.ts`（新部署写入"文档上传拆分规则"菜单名称）。
  - `web/src/router/index.ts`、`web/src/views/document-parse-rule/Index.vue`（同步浏览器路由与页面标题）。
- 删除：无。
- 说明：该模块负责 TXT/MD、PDF、Word 在送入解析模型前的文件上传预拆分；文档内容解析模型与提示词仍在"AI 功能配置"的"文档解析"类型中管理。

### 2026-09-14 允许多个 AI 功能配置同时启用
- 新增：无。
- 修改：
  - `server/src/ai-feature-configs/ai-feature-configs.service.ts`（取消同功能类型配置的自动互斥停用；创建、编辑和默认配置读取均不再关闭其他启用项）。
  - `server/src/ai-feature-configs/ai-feature-configs.service.spec.ts`（覆盖多个启用配置共存时读取默认配置不产生写操作）。
- 删除：无。
- 说明：聊天应用、工作流等显式绑定的配置保持优先；未显式绑定时，系统仍选择该类型最新启用的一条作为全局兜底。已被历史规则停用的配置不会自动恢复，可由管理员按需重新启用。

### 2026-09-14 开放纯文本知识库的结构化解析入口
- 新增：无。
- 修改：
  - `web/src/views/knowledge-base/Index.vue`（移除纯文本类型的操作隐藏条件；TXT 上传和手工输入的文本知识库均可主动执行"结构化解析"，调用已配置的文档解析模型生成 Markdown）。
- 删除：无。
- 说明：文本为空时按钮仍不可用；解析后仍需依次执行自动结构化分片和索引。

### 2026-09-14 统一 MinerU 引擎菜单名称
- 新增：
  - `server/src/migrations/1788904000000-RenameMineruEngineMenu.ts`（仅将历史默认的"MinerU 解析配置"菜单升级为"MinerU 引擎配置"，不重置数据库，也不覆盖管理员自行改名的菜单）。
- 修改：
  - `server/src/menus/menus.service.ts`（新部署时写入"MinerU 引擎配置"菜单种子）。
  - `server/src/log-records/log-api-scanner.ts`（操作日志模块名称同步为"MinerU 引擎配置"）。
- 删除：无。
- 说明：侧边栏、页面标题与操作日志现在使用同一名称；"AI 功能配置"继续承载文档解析、OCR、聊天与 LLM 重排等模型能力配置。

### 2026-09-14 拆分 MinerU 引擎与文档解析职责
- 新增：无。
- 修改：
  - `server/src/knowledge-bases/knowledge-bases.service.ts`（按文件类型定向路由：文本/TXT/Word 只使用文档解析模型，图片/PDF 只使用 OCR；仅 OCR 可调用 MinerU，移除跨功能配置查找 MinerU 的逻辑）。
  - `web/src/views/ai-feature-config/Edit.vue`（文档解析不再显示 MinerU 引擎选项，固定使用大模型及提示词；OCR 单独提供"视觉模型 / MinerU 引擎"选择）。
  - `web/src/views/mineru-config/Index.vue`、`web/src/views/mineru-config/Edit.vue`、`web/src/router/index.ts`（更名为"MinerU 引擎配置"，并明确这里仅维护服务账号与解析参数，不配置文档解析提示词）。
- 删除：无。
- 说明：历史"文档解析"配置若曾启用 MinerU，需在编辑页改为选择大模型账号和模型后保存；图片/PDF 的 MinerU 使用请在 OCR 功能配置中设置。

### 2026-09-14 统一知识库结构化 Markdown 解析与分片
- 新增：
  - `server/src/migrations/1788900400000-AddKnowledgeBaseChunkStructure.ts`（为知识库分片增加章节路径与内容块类型列，不修改或重置既有知识库数据）。
- 修改：
  - `server/src/knowledge-bases/knowledge-bases.service.ts`、`server/src/knowledge-bases/entities/knowledge-base-chunk.entity.ts`（所有解析路径统一保存 Markdown；自动分片识别标题、段落、列表、表格，写入章节路径、内容块类型及包含结构上下文的向量文本）。
  - `server/src/knowledge-bases/knowledge-bases.service.spec.ts`（增加 Markdown 约束、标题路径、表格分片和非 Markdown 输出归一化测试）。
  - `web/src/api/knowledgeBase.ts`、`web/src/views/knowledge-base/View.vue`（前后端对齐章节路径、内容块类型并在分片/索引详情中展示）。
  - `web/src/views/knowledge-base/Index.vue`、`web/src/views/knowledge-base/Documents.vue`（解析入口统一为结构化解析；自动分片文案明确为 Markdown 结构化分片）。
  - `web/src/views/ai-feature-config/Edit.vue`（文档解析和 OCR 配置固定使用 Markdown 返回格式，并说明系统追加的结构化解析约束）。
- 删除：无。
- 说明：已存在的文档不会被迁移自动改写；需要重新执行"结构化解析 → 自动结构化分片 → 索引"后才会补齐新的章节结构和向量上下文。

### 2026-09-14 移除知识库旧匹配辅助字段
- 新增：
  - `server/src/migrations/1788896800000-RemoveKnowledgeBaseMatchingFields.ts`（删除知识库及知识库文档的命中关键字、口语化说法、匹配优先级列，并将现有向量索引标记为待重新建立）。
- 修改：
  - `server/src/knowledge-bases/entities/knowledge-base.entity.ts`、`server/src/knowledge-bases/entities/knowledge-base-document.entity.ts`、`server/src/knowledge-bases/dto/knowledge-base.dto.ts`、`server/src/knowledge-bases/knowledge-bases.service.ts`（删除字段定义、入参、持久化、查询、分片和向量元数据逻辑）。
  - `server/src/knowledge-ai-chat/knowledge-ai-chat-retrieval.service.ts`、`server/src/knowledge-ai-chat/knowledge-ai-chat-retrieval.service.spec.ts`（检索不再按这些旧字段召回、加权或排序；待重新建立的旧向量不参与向量检索）。
  - `web/src/api/knowledgeBase.ts`、`web/src/views/knowledge-base/Edit.vue`、`web/src/views/knowledge-base/Index.vue`、`web/src/views/knowledge-base/Documents.vue`、`web/src/views/knowledge-base/View.vue`（删除知识库及文档相关字段的类型、表单、列表列和详情展示）。
- 删除：无。
- 说明：独立口语词库与知识库路由规则权重继续保留；迁移后需要重新建立各知识库索引，旧字段的历史值不会保留或兼容。

### 2026-09-14 优化 AI 工作流新增节点的可见性
- 新增：无。
- 修改：
  - `web/src/components/AiWorkflowEditor.vue`（无选中节点时优先以最近加入节点为参照；周边无位置时在当前可见画布内找空位；新增后自动选中且仅在节点不可见时平移画布聚焦）。
  - `CHANGELOG.md`（记录本次调整）。
- 删除：无。
- 说明：节点不会自动创建连线，管理员仍可自由拖动；原有默认坐标仅在附近和当前视区均无可用位置时才作为最终回退。

### 2026-09-14 支持从画布生成 AI 工作流说明
- 新增：无。
- 修改：
  - `web/src/utils/aiWorkflow.ts`（新增按启用且可达节点、实际分支生成 Markdown 执行说明的纯函数，包含输入、动作、输出与去向）。
  - `web/src/views/ai-workflow/Edit.vue`（"AI 执行说明"增加"根据画布生成 AI 执行说明"按钮，生成后仍可人工编辑）。
  - `CHANGELOG.md`（记录本次调整）。
- 删除：无。
- 说明：画布 JSON 仍是运行时流程的结构化来源；生成文本只用于帮助回答模型理解处理目标和分支规则，不改变既有工作流定义。

### 2026-09-11 精简 AI 工作流右侧节点面板
- 新增：无。
- 修改：
  - `web/src/components/AiWorkflowEditor.vue`（右侧仅保留节点标题、说明、跳过开关与移除节点操作；移除连线说明、当前连线编辑和执行摘要文案）。
  - `CHANGELOG.md`（记录本次调整）。
- 删除：无。
- 说明：画布中通过连接点拖拽建立连线的能力保持不变；右侧面板不再提供既有连线的查看、修改或移除入口。

### 2026-09-11 优化 AI 工作流新增节点位置
- 新增：无。
- 修改：
  - `web/src/components/AiWorkflowEditor.vue`（从节点库添加时，优先将新节点放在当前节点下方；空间不足或会重叠时放在右侧；无合适位置时才回退到既有推荐坐标）。
  - `CHANGELOG.md`（记录本次调整）。
- 删除：无。
- 说明：仅决定新节点初始位置，不自动创建连线或调整已保存节点。

### 2026-09-11 收紧 AI 工作流画布可视高度
- 新增：无。
- 修改：
  - `web/src/components/AiWorkflowEditor.vue`（画布可视区域高度由 620px 调整为 500px）。
  - `CHANGELOG.md`（记录本次调整）。
- 删除：无。
- 说明：逻辑画布高度和已保存的节点坐标保持不变，仍可通过平移和缩放查看完整流程。

### 2026-09-11 精简 AI 工作流节点文案与尺寸
- 新增：无。
- 修改：
  - `web/src/utils/aiWorkflow.ts`（将画布展示名称更新为"原始输入""匹配标准问答""校准后匹配问答"，并同步节点横向边界计算）。
  - `web/src/components/AiWorkflowEditor.vue`（移除节点内"拖拽"和启用状态文案；节点调整为 140×48px；右侧执行摘要同步使用简化名称）。
  - `CHANGELOG.md`（记录本次调整）。
- 删除：无。
- 说明：节点类型、开关、连线、拖动和运行时处理顺序均保持不变。

### 2026-09-11 调整顶部表单标签右侧间距
- 新增：无。
- 修改：
  - `web/src/components/Form.vue`（顶部布局的 `el-form-item__label` 增加 `padding-right: 12px`，使流程编排标签与常规标签间距一致）。
  - `CHANGELOG.md`（记录本次调整）。
- 删除：无。

### 2026-09-11 对齐 AI 工作流流程编排标签
- 新增：无。
- 修改：
  - `web/src/components/Form.vue`（顶部标签保留表单既有标签列宽度并右对齐，避免"流程编排"与同表单的"工作流名称"标签左边界不一致）。
  - `CHANGELOG.md`（记录本次调整）。
- 删除：无。
- 说明：顶部标签仍由 `el-form-item` 的 `label` 渲染，画布内容区域位置不受影响。

### 2026-09-11 调整 AI 工作流画布自适应布局
- 新增：无。
- 修改：
  - `web/src/components/AiWorkflowEditor.vue`（左侧画布区域自动占满除右侧面板外的可用宽度；右侧节点配置面板固定为 320px；画布逻辑宽度随视口同步变化，拖拽、连线、缩放和适应画布计算均使用实时宽度）。
  - `CHANGELOG.md`（记录本次调整）。
- 删除：无。
- 说明：窄屏时保持单列布局，节点配置面板改为全宽显示。

### 2026-09-11 精简 AI 工作流节点库与备注字段
- 新增：无。
- 修改：
  - `web/src/components/AiWorkflowEditor.vue`（节点库仅以浅蓝底色标识已加入的节点类型，不再显示"已添加"及次数；节点库和画布区域改为左对齐，避免节点库标签被压缩为竖排）。
  - `web/src/views/ai-workflow/Edit.vue`、`web/src/views/ai-workflow/Index.vue`、`web/src/api/aiWorkflow.ts`（移除工作流的备注表单字段、提交字段和相关检索提示）。
  - `server/src/ai-workflows/dto/ai-workflow.dto.ts`、`server/src/ai-workflows/ai-workflows.service.ts`（移除备注字段的接口校验、写入和关键词检索）。
  - `server/src/ai-workflows/entities/ai-workflow.entity.ts`（保留历史 `description` 数据列，但明确不再由工作流功能读写，避免更新部署时损失已有数据）。
  - `CHANGELOG.md`（记录本次调整）。
- 删除：无。
- 说明：节点类型仍可重复加入画布，用于表达不同分支；已加入状态只是一种视觉提示，不会限制继续添加。

### 2026-09-11 优化 AI 工作流表单与可重复节点
- 新增：无。
- 修改：
  - `web/src/views/ai-workflow/Index.vue`（工作流名称点击入口采用品牌蓝的超链接样式）。
  - `web/src/components/Form.vue`、`web/src/views/ai-workflow/Edit.vue`、`AGENTS-COMPONENTS.md`（`FormField` 支持单字段 `labelPosition: 'top'`，流程编排标签显示在画布上方，其余字段继续使用左右布局）。
  - `web/src/components/AiWorkflowEditor.vue`、`web/src/utils/aiWorkflow.ts`（节点库始终保留可选节点；已加入节点显示次数和蓝色状态，重复加入时生成独立 ID 并错位放置）。
  - `server/src/knowledge-retrieval-configs/workflow-definition.ts`、相关测试（前后端归一化保留唯一 ID 的同类型节点；步骤可用性按任一启用且可达实例判定）。
  - `CHANGELOG.md`（记录本次调整）。
- 删除：无。
- 说明：输入清洗前置节点仍保持唯一。重复节点用于表达多个分支或备用路径；当前运行时仍按步骤类型执行一次，不会因此重复调用同一个业务处理阶段。

### 2026-09-11 优化 AI 工作流列表入口与画布视图
- 新增：无。
- 修改：
  - `web/src/views/ai-workflow/Index.vue`（隐藏操作列中的"查看"；工作流名称改为受读取权限控制的点击入口，打开现有工作流编辑弹窗）。
  - `web/src/components/AiWorkflowEditor.vue`（固定 650px 画布视口，支持滚轮以鼠标位置为中心缩放、空白处按住平移，并提供缩放、适应画布与重置视图操作；节点拖拽和连线坐标同步适配缩放比例）。
  - `CHANGELOG.md`（记录本次调整）。
- 删除：无。
- 说明：画布平移、缩放仅是编辑视图状态，不写入工作流 JSON；节点位置、连线以及服务端执行逻辑保持不变。

### 2026-09-11 调整 AI 工作流编辑顺序
- 新增：无。
- 修改：
  - `web/src/views/ai-workflow/Edit.vue`（将"流程编排"调整至"AI 执行说明"之前，便于先完成面向人的流程设计，再补充面向模型的文字约束）。
  - `CHANGELOG.md`（记录本次调整）。
- 删除：无。
- 说明：仅调整管理端字段展示顺序，不修改工作流字段、接口或实际执行逻辑。

### 2026-09-11 拆分 AI 工作流与知识库检索配置
- 新增：
  - `server/src/ai-workflows/`、`web/src/views/ai-workflow/`、`web/src/api/aiWorkflow.ts`（独立 AI 工作流 CRUD、画布编辑与 AI 执行说明文本）。
  - `server/src/migrations/1788893200000-CreateAiWorkflows.ts`（新增 `ai_workflows` 表和检索配置工作流关联字段）。
- 修改：
  - `server/src/knowledge-retrieval-configs/`、`web/src/views/knowledge-retrieval-config/`（检索配置改为选择单个 AI 工作流，画布不再混入检索参数；列表与弹窗统一更名为"知识库检索配置"）。
  - `server/src/knowledge-ai-chat/`、`web/src/api/knowledgeAiChat.ts`（运行时优先读取关联工作流，冻结工作流名称与说明到检索轨迹，并将人工维护的 AI 执行说明提供给回答模型）。
  - `server/src/users/users.service.ts`、`server/src/menus/menus.service.ts`、`web/src/router/index.ts`（新增 AI 工作流权限、菜单和页面路由；仅升级未人工改名的旧默认菜单）。
  - 相关工作流与聊天服务测试、`CHANGELOG.md`。
- 删除：无。
- 说明：现有检索配置未关联工作流时继续解释其原有 `workflowDefinition`，不会自动重置或覆盖数据库中的菜单、知识库和既有流程。关联中的工作流不能删除或停用，防止运行时流程失效。

### 2026-09-11 修正 AI 工作流端点定位并支持向下连线
- 新增：无。
- 修改：
  - `web/src/components/AiWorkflowEditor.vue`（按节点实际渲染尺寸计算端点和拖拽边界；新增顶部输入、底部输出圆点，可建立下→上的纵向连线）
  - `web/src/api/knowledgeRetrievalConfig.ts`、`web/src/utils/aiWorkflow.ts`、`server/src/knowledge-retrieval-configs/workflow-definition.ts`（工作流连线 JSON 可选保存起止端点方向，旧连线按节点相对位置兼容推断）
  - `server/src/knowledge-retrieval-configs/knowledge-retrieval-configs.service.spec.ts`（验证画布端点方向在归一化后保留）
  - `web/src/views/knowledge-retrieval-config/Edit.vue`、`CHANGELOG.md`（更新交互说明和变更快照）
- 删除：无。
- 说明：端点方向仅控制画布连线展示，不会改变既有工作流的节点安全校验、执行顺序或业务处理结果。

### 2026-09-11 优化 AI 工作流节点库与连接端点
- 新增：无。
- 修改：
  - `web/src/components/AiWorkflowEditor.vue`（节点库保持常驻并在画布与右侧面板的总宽度内单行展示；节点增加左输入、右输出居中圆点，连线端点与圆心精确对齐）
  - `CHANGELOG.md`（记录本次调整）
- 删除：无。
- 说明：节点库仍只显示尚未加入画布的节点；在窄屏下工具栏可横向滚动，以保持单行而不压缩按钮文字。

### 2026-09-11 优化 AI 工作流配置表单布局
- 新增：无。
- 修改：
  - `web/src/components/Form.vue`（支持可选的两列表单栅格与字段跨整行配置，默认单列行为不变）
  - `web/src/views/knowledge-retrieval-config/Edit.vue`（恢复标签在左、控件在右；名称、流程编排、知识库范围、描述占整行，检索参数按两列排列）
  - `AGENTS-COMPONENTS.md`（补充 `Form.columns` 与 `FormField.span` 契约）
  - `CHANGELOG.md`（记录本次调整）
- 删除：无。
- 说明：仅调整管理端表单排版和响应式显示，不修改 AI 工作流字段、接口或执行逻辑。

### 2026-09-11 改为可拖拽连线的空白 AI 工作流编排
- 新增：无。
- 修改：
  - `web/src/views/knowledge-retrieval-config/Edit.vue`、`web/src/utils/aiWorkflow.ts`（新增工作流仅初始化"输入清洗与权限范围"入口；从节点库按需加入节点并使用其推荐位置，已有配置继续按原定义加载）
  - `web/src/components/AiWorkflowEditor.vue`（从节点右侧连接点拖拽到目标节点建立安全连线；可修改或移除既有连线，并允许删除回答节点以便重新编排）
  - `server/src/knowledge-retrieval-configs/workflow-definition.ts`、`knowledge-retrieval-configs.service.spec.ts`（V2 草稿不再自动补回回答节点；保存时仍校验输入清洗、回答节点和完整可达路径）
  - `CHANGELOG.md`（记录本次调整）
- 删除：无。
- 说明：保留输入清洗与权限范围作为不可删除的安全入口。节点和连线可按需组织，但仍禁止循环及不支持的执行顺序；未补全回答出口的草稿不能保存，不会重置已有工作流或知识库配置。

### 2026-09-11 缩小 AI 工作流节点框
- 新增：无。
- 修改：
  - `web/src/components/AiWorkflowEditor.vue`、`web/src/utils/aiWorkflow.ts`（节点框由 190×70 调整为 160×60；同步连线锚点、可拖拽边界及默认/既有默认节点的居中坐标）
  - `CHANGELOG.md`（记录本次调整）
- 删除：无。
- 说明：仅调整画布视觉尺寸和坐标兼容，不改变工作流执行逻辑。

### 2026-09-11 优化 AI 工作流节点选中交互
- 新增：无。
- 修改：
  - `web/src/components/AiWorkflowEditor.vue`（未选择节点时不展开右侧编辑配置；点击节点后才显示其说明、连线和可选节点的"从画布移除节点"操作；点击画布空白处可取消选择并打开缺失节点库）
  - `CHANGELOG.md`（记录本次调整）
- 删除：无。
- 说明：输入清洗与回答审计仍是不可删除的系统安全节点；节点库只显示当前画布中缺失的可选节点。

### 2026-09-11 调整 AI 工作流编辑布局
- 新增：无。
- 修改：
  - `web/src/components/Form.vue`（增加可选的表单标签位置配置，默认保持右侧标签以兼容既有页面）
  - `web/src/views/knowledge-retrieval-config/Edit.vue`（AI 工作流配置表单改为标签在上、控件在下）
  - `web/src/components/AiWorkflowEditor.vue`、`web/src/utils/aiWorkflow.ts`（工作流节点库和画布固定为 650px，整体居中；节点默认坐标及显示范围同步适配画布宽度，旧默认坐标会自动居中迁移）
  - `CHANGELOG.md`（记录本次调整）
- 删除：无。
- 说明：仅调整管理端布局与画布坐标边界，不改变工作流节点、条件连线或知识库绑定语义。

### 2026-09-11 升级为可编辑 AI 工作流图
- 新增：无。
- 修改：
  - `server/src/knowledge-retrieval-configs/workflow-definition.ts`、`knowledge-retrieval-configs.service.ts`（工作流定义升级为 V2 节点与条件连线；保存时校验安全节点、无环、入口到回答节点的可达路径，并自动兼容旧版步骤配置）
  - `server/src/knowledge-ai-chat/knowledge-ai-chat.service.ts`、工作流单元测试（根据已连通的未命中/始终继续路径派生标准问答、口语校准、业务指令、知识库检索和重排的实际执行范围）
  - `web/src/components/AiWorkflowEditor.vue`、`web/src/utils/aiWorkflow.ts`、`web/src/api/knowledgeRetrievalConfig.ts`、`web/src/views/knowledge-retrieval-config/Edit.vue`（支持拖拽节点、增删可选节点、启停、添加或删除带条件的安全连线，并在提交前提示流程不可达）
  - `CHANGELOG.md`（记录本次升级）
- 删除：无。
- 说明：本次没有改变知识库与工作流的绑定语义，也没有重置任何数据。工作流仍禁止脚本、SQL、任意 HTTP 和不安全连线；节点与连线保存在现有 `workflowDefinition` JSON 字段中，存量 V1 配置会自动转换为等价的 V2 默认图。

### 2026-09-11 放大 AI 工作流配置编辑弹窗
- 新增：无。
- 修改：
  - `web/src/views/knowledge-retrieval-config/Edit.vue`（弹窗最大宽度调整为 1180px，并在窄屏保留 16px 边距；内容区最大高度调整为 82vh，以便查看完整工作流画布）
  - `CHANGELOG.md`（记录本次调整）
- 删除：无。

### 2026-09-11 新增受约束的可视化 AI 工作流编排
- 新增：
  - `server/src/knowledge-retrieval-configs/workflow-definition.ts`、`web/src/utils/aiWorkflow.ts`（工作流节点契约、旧开关兼容归一化及派生执行标志）
  - `web/src/components/AiWorkflowEditor.vue`（输入清洗、两次标准问答、口语校准、业务数据指令、知识库检索、LLM 重排、回答审计的可视化流程与命中/未命中分支）
  - `server/src/migrations/1788889600000-AddAiWorkflowDefinition.ts`（为工作流配置新增持久化定义字段）
- 修改：
  - `server/src/knowledge-retrieval-configs/`（保存时校验并归一化工作流定义，同时同步既有开关字段；关闭知识库检索时自动关闭并清除重排配置）
  - `server/src/knowledge-ai-chat/`（按原问题标准问答、校准后标准问答、口语校准、业务指令、检索和重排等独立节点执行，并在问答轨迹快照中冻结工作流定义）
  - `web/src/views/knowledge-retrieval-config/Edit.vue`、相关 API 类型（以可视化工作流编辑器替代分散开关；检索和重排字段随节点启停动态显示）
  - `CHANGELOG.md`（记录本次调整）
- 删除：无。
- 说明：本期是受约束工作流，不开放任意节点连线、脚本、SQL 或 HTTP 调用；命中/未命中分支和权限校验由服务端固定控制。旧 API、`retrievalConfigId` 与既有开关继续可用，存量配置会按原开关自动生成等价的默认流程。

### 2026-09-11 将知识库检索配置升级为 AI 工作流配置
- 新增：
  - `server/src/migrations/1788886000000-AddAiWorkflowSteps.ts`（为既有配置增加标准问答、口语校准、知识库检索、业务数据指令四个开关；仅把未自定义的旧系统菜单重命名为"AI 工作流配置"）
- 修改：
  - `server/src/knowledge-retrieval-configs/`、`web/src/views/knowledge-retrieval-config/`（管理端统一显示为"AI 工作流配置"；根据知识库检索开关动态显示或隐藏范围、召回、重排等字段，并提供每个开关的即时语义说明）
  - `server/src/knowledge-ai-chat/`（工作流确定标准问答、口语校准、知识库路由/检索/重排和业务指令是否执行；业务数据调用额外要求聊天应用明确授权，关闭知识库时仍把校准问题、语义约束和获授权业务 JSON 传给回答模型）
  - `web/src/views/external-app/`、标准问答、口语词库、路由规则和问答记录（关联关系统一使用"AI 工作流"表述；问答轨迹冻结并展示四个工作流开关和实际跳过原因）
  - `CHANGELOG.md`（记录本次调整）
- 删除：无。
- 说明：保留原 API、数据表名和字段 `retrievalConfigId` 以兼容现有 H5 与存量数据。新工作流默认保留原有知识库链路；业务客服可关闭知识库检索、开启业务数据指令，并在聊天应用中单独授予只读指令。

### 2026-09-11 增强 AI 问答记录的分阶段检索轨迹
- 新增：
  - `README.md`（记录关联 H5 AI 客服项目路径 `D:\\AllProjects\\H5\\ai-customer-service`，明确前后端职责边界）
  - `server/src/knowledge-ai-chat/knowledge-ai-chat-trace.ts`（问答处理轨迹的后端类型契约）
  - `server/src/migrations/1788882400000-AddKnowledgeAiChatProcessingTrace.ts`（为问答消息新增实际检索配置 ID 与处理轨迹快照）
- 修改：
  - `server/src/knowledge-ai-chat/`、`server/src/knowledge-standard-qas/`（记录原问题与校准后两次标准问答的全部精确候选、口语校准结果、配置快照、路由范围、全文/向量/融合/阈值/重排数量和业务事实处理结果）
  - `web/src/api/knowledgeAiChat.ts`、`web/src/views/knowledge-ai-record/Index.vue`（问答详情按八个阶段展示本轮实际处理轨迹；历史记录明确提示缺少轨迹，不伪造未命中结果）
  - 对应单元测试（验证标准问答候选排序及校准后二次命中的轨迹字段）
  - `CHANGELOG.md`（记录本次调整）
- 删除：无。
- 说明：轨迹是消息生成当刻的只读快照，不受以后编辑检索配置影响；对终端用户输出的"回答依据摘要"仍不会暴露内部配置或策略。迁移只新增字段，不修改既有问答记录。

### 2026-09-11 新增产品 SKU 业务事实查询与聊天应用指令授权
- 新增：
  - `server/src/product-catalog/`（产品、SKU 的真实业务数据 CRUD；按产品简称、编码、SKU 编码和结构化规格受控匹配，并在 SKU 未唯一时只返回候选项）
  - `server/src/migrations/1788880000000-CreateProductCatalogAndBusinessCommands.ts`（创建产品与 SKU 表，并为聊天应用和问答记录增加业务指令、业务事实字段）
  - `web/src/api/productCatalog.ts`、`web/src/views/product/`、`web/src/views/product-sku/`（产品库、SKU 库管理页面）
  - `server/src/product-catalog/product-catalog.service.spec.ts`、`server/src/ai-command-definitions/ai-command-definitions.service.spec.ts`（验证 SKU 精确定位、候选澄清和启动时指令契约同步）
- 修改：
  - `server/src/ai-command-definitions/`（新增只读 `product.sku.lookup` 白名单指令；每次服务启动同步执行目标、参数 Schema 和上下文绑定，保留人工维护的名称、关键词、启停及授权）
  - `server/src/external-apps/`、`web/src/views/external-app/Edit.vue`（聊天应用可单独授权业务指令；标准问答、口语校准和知识库检索为基础链路自动保留）
  - `server/src/knowledge-ai-chat/`（标准问答未命中后，使用校准问题读取获授权的产品/SKU 最小 JSON，并将其与检索资料、语义约束一起传给回答模型；记录业务事实轨迹）
  - `server/src/app.module.ts`、`server/src/users/users.service.ts`、`server/src/menus/menus.service.ts`、`web/src/router/index.ts`（注册模块、权限及"业务数据 / 产品库 / SKU 库"菜单）
  - `CHANGELOG.md`（记录本次调整）
- 删除：
  - AI 指令编辑中可手工修改的请求参数 Schema、上下文绑定输入；改为展示服务启动时自动同步的只读契约。
- 说明：通用知识库客服不勾选产品指令，业务客服才勾选。业务数据不写入向量库，模型只得到最小、只读的后端查询结果，避免直接连接数据库或在多个 SKU 之间猜测。迁移只新增表/列，不会重置已有数据库或菜单。

### 2026-09-10 恢复原问题标准问答的前置命中
- 新增：无。
- 修改：
  - `server/src/knowledge-ai-chat/knowledge-ai-chat.service.ts`（保留检索配置确定后的原问题标准问答命中；仅在其未命中时执行口语校准，并用校准后的问题再次匹配标准问答后再进入路由、检索和重排）
  - `server/src/knowledge-ai-chat/knowledge-ai-chat.service.spec.ts`（验证原问题未命中后，会以校准后的问题第二次匹配标准问答）
  - `CHANGELOG.md`（记录流程修正）
- 删除：无。
- 说明：输入清洗、会话/权限和知识库范围确认、当前检索配置确定均保持在此流程之前；校准后的问题仍继续传入后续路由、检索、重排和回答。

### 2026-09-10 调整客服问答为先校准、后匹配标准问答
- 新增：无。
- 修改：
  - `server/src/knowledge-ai-chat/knowledge-ai-chat.service.ts`（移除原问题优先直查标准问答的快捷分支；所有问题均先经过口语词条校准，再用校准后的问题精确匹配标准问答，未命中才进入路由、检索和重排）
  - `server/src/knowledge-ai-chat/knowledge-ai-chat.service.spec.ts`（覆盖"先校准、后标准问答"的调用顺序与校准后问题传递）
  - `CHANGELOG.md`（记录本次调整）
- 删除：无。
- 说明：无口语词条命中时，校准结果保持为原问题，仍会执行一次标准问答匹配；校准后的问题会继续作为后续路由、检索、重排与回答阶段的检索问题。

### 2026-09-10 精简口语词条并支持 JSON 语义约束
- 新增：
  - `server/src/migrations/1788876000000-SimplifyKnowledgeColloquialTerms.ts`（将旧推荐单位并入语义定义后，移除 `answerUnit`、`matchMode` 两列）
- 修改：
  - `server/src/knowledge-colloquial-terms/`（固定采用不区分大小写的包含匹配；语义定义支持自然语言或合法 JSON，并将所有命中词条组织为 `matchedTerms` JSON 约束）
  - `server/src/knowledge-ai-chat/entities/knowledge-ai-chat-message.entity.ts`、`web/src/api/knowledgeAiChat.ts`（问答记录的口语词条匹配结构移除推荐单位）
  - `web/src/api/knowledgeColloquialTerm.ts`、`web/src/views/knowledge-colloquial-term/`（移除推荐单位和匹配方式；语义定义输入框按 JSON 是否有效动态说明传递方式）
  - `CHANGELOG.md`（记录本次调整）
- 删除：
  - 口语词条的推荐单位及匹配方式字段与界面。
- 说明：命中词条后，替换文本用于检索问题改写，语义定义作为结构化约束随检索结果一并传给最终回答模型；其内容用于理解意图，不能覆盖知识库事实，也不作为可执行指令。旧推荐单位不会丢失：迁移会把它合并进原语义定义后再删列。

### 2026-09-10 拆分 LLM 重排配置并移除 AI 功能向量化类型
- 新增：
  - `server/src/migrations/1788872400000-ReplaceEmbeddingFeatureConfigWithLlmRerank.ts`（将旧向量化功能配置保留为停用的重排候选；把检索配置引用的聊天模型复制为独立 LLM 重排配置并回写引用）
- 修改：
  - `server/src/ai-feature-configs/`（功能类型改为聊天、文档解析、OCR、LLM 重排；重排固定使用温度 0、内置安全评分提示词和 JSON 输出，不允许 Think、MinerU 或聊天提示词；允许多个启用的重排配置供不同检索策略选择）
  - `server/src/knowledge-retrieval-configs/`、`server/src/knowledge-ai-chat/`（检索配置和重排执行只接受 `rerank` 类型配置；聊天配置不再作为重排依赖或回退项）
  - `server/src/knowledge-ai-providers/`（拆分"功能配置类型"与"模型校验能力类型"，保留向量模型校验给向量配置使用）
  - `web/src/views/ai-feature-config/`、`web/src/views/knowledge-retrieval-config/`、相关 API 类型（移除向量化选项，新增 LLM 重排；按类型隐藏重排不适用的温度、提示词、返回格式、Think 和 MinerU 字段，并显示固定执行语义）
  - `CHANGELOG.md`（记录本次调整）
- 删除：无
- 说明：LLM 重排仍可使用套餐内的通用文本模型，但仅接收问题与候选片段并返回评分排序；向量模型及 Collection 仍只在"向量化配置"管理。迁移不重置数据库，也不删除旧记录。

### 2026-09-10 新增口语化表达词库与问题定性改写
- 新增：
  - `server/src/knowledge-colloquial-terms/`（口语表达词条 CRUD、适用检索配置、排除短语和确定性问题改写服务）
  - `server/src/migrations/1788868800000-CreateKnowledgeColloquialTerms.ts`（创建口语词条表，并为问答消息保存命中的词条）
  - `web/src/api/knowledgeColloquialTerm.ts`、`web/src/views/knowledge-colloquial-term/`（口语化表达词库管理接口及动态说明表单）
- 修改：
  - `server/src/knowledge-ai-chat/`、`server/src/ai-command-definitions/`（在原问题精确命中标准问答失败后，执行受控的词条改写；改写后再精确匹配标准问答，最后才走知识库检索）
  - `server/src/app.module.ts`、`server/src/users/users.service.ts`、`server/src/menus/menus.service.ts`、`web/src/router/index.ts`（挂载模块、管理员权限、"口语化表达词库"菜单和管理端路由）
  - `web/src/api/knowledgeAiChat.ts`、`web/src/views/knowledge-ai-record/Index.vue`（流式事件和问答记录展示命中的口语词条）
  - `CHANGELOG.md`（记录本次调整）
- 删除：无
- 说明：词条只做人工维护的确定性替换和术语定性，不直接提供业务答案。可组合产品简称与属性词，例如"小蓝" → "蓝虎机器人 Pro"、"多重" → "的重量是多少？"，最终将"小蓝多重"改写为"蓝虎机器人 Pro 的重量是多少？"。语义解释和推荐单位会传给检索及回答模型，但模型仍须以知识库资料为事实依据；"多重因素"等同形异义可用排除短语避免误改写。

### 2026-09-10 精简标准问答为固定答案直出
- 新增：
  - `server/src/migrations/1788865200000-SimplifyKnowledgeStandardQas.ts`（移除标准问答的关键词、优先级、最低匹配度、说明，以及问答记录中的匹配分数和问题拆解记录）
- 修改：
  - `server/src/knowledge-standard-qas/`、`web/src/api/knowledgeStandardQa.ts`、`web/src/views/knowledge-standard-qa/`（录入页只保留标准问题、相似问法、标准答案和适用检索配置；列表不再展示优先级或匹配度）
  - `server/src/knowledge-ai-chat/`、`web/src/api/knowledgeAiChat.ts`、`web/src/views/knowledge-ai-record/`（标准问答改为本地规范化精确匹配，不再调用模型问题拆解、不产生匹配分数；命中后直接返回固定答案）
  - `server/src/ai-command-definitions/`、`server/src/approval-requests/`（移除已废弃的问题拆解指令及其标准问答快照字段）
  - `CHANGELOG.md`（记录本次调整）
- 删除：无
- 说明：匹配会忽略大小写、空格和标点；只有标准问题或相似问法完全一致才会命中。若同一问法同时有全局和当前检索配置专属版本，优先使用专属版本；无命中则继续走正常知识库检索。

### 2026-09-10 调整 AI 功能配置温度与模型校验
- 新增：
  - `server/src/migrations/1788861600000-ReplaceAiFeatureConfigRulesWithTemperature.ts`（将已有规则文本合并到提示词，新增温度列并删除规则列）
  - `POST /api/knowledge-ai-providers/validate-model`（按功能类型验证模型；明确模型不存在或不可用时自动从账号模型列表移除，并停用引用该模型的 AI 功能配置）
- 修改：
  - `server/src/ai-feature-configs/`、`web/src/api/aiFeatureConfig.ts`（删除 `rules` 字段，新增范围为 `0–2` 的 `temperature` 字段及校验）
  - `web/src/views/ai-feature-config/`（移除规则输入，独立显示温度及动态语义说明；模型、账号或功能类型切换后自动校验模型；列表新增温度列）
  - `server/src/knowledge-ai-chat/`、`knowledge-ai-providers/`、`knowledge-bases/`（聊天、流式聊天、文本解析和视觉 OCR 均使用功能配置温度；规则内容不再作为独立提示词段传递）
  - `CHANGELOG.md`（记录本次调整）
- 删除：无
- 说明：温度为 `0–0.2` 时强调稳定与可复现，`0.2–0.8` 较均衡，超过 `0.8` 时输出更发散。模型校验不会因网络、密钥或权限异常而删除模型，只处理明确的模型不存在/未开通类错误。

### 2026-09-10 增加 AI 配置项动态语义说明
- 新增：无
- 修改：
  - `web/src/components/Form.vue`（字段配置新增 `hint`，支持 `ref/computed` 动态解包并统一显示在输入控件下方）
  - `web/src/views/ai-feature-config/`、`document-parse-rule/`、`knowledge-base/`、`knowledge-chunk-config/`、`knowledge-retrieval-config/`、`knowledge-routing-rule/`、`knowledge-standard-qa/`、`mineru-config/`、`vector-config/`（为关键模式、阈值、权重、时长、分片大小与向量维度补充随当前值变化的说明）
  - `AGENTS-COMPONENTS.md`（补充 Form 的 `hint` 字段契约）
  - `CHANGELOG.md`（记录本次调整）
- 删除：无
- 说明：路由权重说明按实际执行逻辑区分公共词/别名/专属路由；向量配置明确提示 Collection 内向量维度必须一致，切换维度需要使用新集合或重建索引。

### 2026-09-09 修复菜单种子覆盖已有菜单位置
- 新增：无
- 修改：
  - `server/src/menus/menus.service.ts`（启动菜单种子改为仅创建缺失记录；不再覆盖已有菜单的父子关系、排序、名称、路由或图标；移除每次启动执行的聊天菜单迁移）
  - `CHANGELOG.md`（记录本次修复）
- 删除：无
- 说明：新部署的空数据库仍会生成默认菜单；已有数据库中的菜单布局完全以管理员在"菜单管理"中的保存结果为准。

### 2026-09-09 新增协作中心与标准问答审批
- 新增：
  - `server/src/approval-requests/`（轻量审批记录、提交标准问答、管理员通过/驳回、内容快照与申请/审批人留痕）
  - `server/src/migrations/1788854400000-CreateApprovalRequests.ts`（创建审批记录表）
  - `web/src/api/approvalRequest.ts`、`web/src/views/approval-request/`（审批管理接口封装与管理页）
- 修改：
  - `server/src/knowledge-standard-qas/`（标准问答增加 `pending` 状态；草稿提交后锁定编辑，管理员通过后发布，驳回后回退草稿；禁止直接把 QA 设为待审批或发布）
  - `server/src/app.module.ts`、`server/src/users/users.service.ts`、`server/src/menus/menus.service.ts`、`web/src/router/index.ts`（挂载审批模块、管理员权限、"协作中心 / 审批管理"菜单和路由）
  - `web/src/views/knowledge-standard-qa/`、`web/src/api/knowledgeStandardQa.ts`（标准问答编辑默认保存草稿，列表增加"提交审批"入口与待审批状态）
  - `CHANGELOG.md`（记录本次功能）
- 删除：无
- 说明：审批权限使用 `ApprovalRequest.update`，但后端额外强制校验当前用户 `isAdmin`；普通用户即使拿到接口地址也不能通过或驳回。第一期审批对象为标准问答，后续业务可复用审批记录结构扩展。

### 2026-09-09 增加 TypeORM 实体列必检规则
- 新增：
  - `server/scripts/check-typeorm-entity-columns.js`（扫描全部实体，发现 `@Column` 未显式声明类型且属性可能在运行时反射为 `Object` 时直接失败并定位字段）
- 修改：
  - `server/package.json`（构建、测试和各启动命令前自动执行实体列校验）
  - `server/src/knowledge-ai-chat/entities/knowledge-ai-chat-message.entity.ts`（为 `qaMatchMethod` 显式声明 MySQL `varchar`，修复启动失败）
  - `server/src/ai-command-definitions/`、`ai-feature-configs/`、`knowledge-retrieval-configs/`、`knowledge-routing-rules/`、`knowledge-standard-qas/` 实体（为全部已检出的类型别名字段显式声明 `varchar`）
  - `AGENTS-BACKEND.md`、`CHANGELOG.md`（沉淀后端必检规范与本次变更）
- 删除：无
- 说明：该校验不访问数据库；会阻止联合类型、对象、数组、接口和类型别名被 TypeORM 反射成 MySQL 不支持的 `Object` 列类型。

### 2026-09-09 新增 AI 指令集管理与受控能力开关
- 新增：
  - `server/src/ai-command-definitions/`（AI 指令白名单目录、定义实体、查询/更新接口和启动时初始化；支持指令标识、语义关键词、参数 Schema、上下文绑定、聊天可调用、人工确认及启停配置）
  - `server/src/migrations/1788850800000-CreateAiCommandDefinitions.ts`（创建 AI 指令定义表）
  - `web/src/api/aiCommandDefinition.ts`、`web/src/views/ai-command-definition/`（AI 指令集列表、筛选和编辑页）
- 修改：
  - `server/src/knowledge-ai-chat/knowledge-ai-chat-command.service.ts`（问题拆解、标准问答查询、知识库检索在执行前统一校验对应指令是否启用且允许聊天调用）
  - `server/src/app.module.ts`、`server/src/knowledge-ai-chat/knowledge-ai-chat.module.ts`、`server/src/users/users.service.ts`、`server/src/menus/menus.service.ts`、`web/src/router/index.ts`（挂载模块、权限、菜单和管理端路由）
  - `web/src/views/knowledge-standard-qa/Edit.vue`（修复发布状态选项的只读数组类型，确保前端生产构建通过）
  - `CHANGELOG.md`（记录本次功能）
- 删除：无
- 说明：指令的执行目标、动作和调用映射由后端内置白名单固定，管理端仅可维护语义、输入约束、上下文绑定和开关，不能配置任意 URL。聊天模型不会获取 API 地址；新增能力需由开发在白名单目录登记后才会出现在管理端。

### 2026-09-09 新增标准问答库并前置 AI 问答匹配
- 新增：
  - `server/src/knowledge-standard-qas/`（标准问题、相似问法、关键词、审核状态、适用检索配置、答案版本和命中统计的 CRUD 与高置信匹配服务）
  - `server/src/knowledge-ai-chat/knowledge-ai-chat-command.service.ts`（以 `question.analyze`、`qa.search`、`knowledge.retrieve` 作为受控聊天能力标识，后端映射到实际服务）
  - `server/src/migrations/1788847200000-CreateKnowledgeStandardQas.ts`（创建标准问答表，并在问答消息中记录 QA 命中、分数、问题理解结果和能力调用标识）
  - `web/src/api/knowledgeStandardQa.ts`、`web/src/views/knowledge-standard-qa/`（标准问答库管理页及收录/编辑表单）
- 修改：
  - `server/src/knowledge-ai-chat/`（每轮先调用模型将问题整理为结构化 JSON，再在当前检索配置范围内匹配已发布 QA；命中后直接返回已审核答案，未命中才继续会话上下文、路由、知识库检索和重排）
  - `server/src/app.module.ts`、`server/src/users/users.service.ts`、`server/src/menus/menus.service.ts`、`web/src/router/index.ts`（挂载模块、权限和"标准问答库"菜单）
  - `web/src/api/knowledgeAiChat.ts`、`web/src/views/knowledge-ai-record/Index.vue`（流式协议增加标准问答命中事件；问答记录可一键带入问题、答案、来源分片，创建草稿后人工审核发布）
  - `CHANGELOG.md`（记录本次功能）
- 删除：无
- 说明：模型不会得到任何内部 API 地址、数据库结构或执行权限；它只参与 `question.analyze` 的问题理解。标准答案仅在匹配度达到该条目的阈值且候选结果明确时直接返回；未命中、低分或歧义情况一律回退到原有知识库链路。

### 2026-09-08 增加用户可见的 AI 推理摘要
- 新增：无
- 修改：
  - `server/src/knowledge-ai-chat/knowledge-ai-chat.service.ts`（主回答完成后，以最终回答和知识库名称单独生成用户可见摘要；不传入原提示词、规则、检索配置或分片正文）
  - `web/src/api/knowledgeAiChat.ts`（`thinking` SSE 事件补充 `kind: status | summary`）
  - `D:/AllProjects/H5/ai-customer-service/js/api.js`、`js/app.js`（区分处理状态和用户可见摘要，并在思考面板展示摘要）
  - `CHANGELOG.md`（记录本次调整）
- 删除：无
- 说明：模型仍可在服务端使用 Think 参数生成回答；原始 `reasoning_content` / `reasoning` 不会返回给终端用户。

### 2026-09-08 修复 MinerU 图片在 AI 客服端的展示
- 新增：
  - `server/src/mineru-configs/mineru-configs.service.spec.ts`（覆盖 MinerU 结果包相对图片路径替换为上传地址）
- 修改：
  - `server/src/mineru-configs/`（读取结果 ZIP 时将 PNG/JPG/JPEG/GIF/WEBP/BMP 图片转存到当前本地上传目录或 OSS，并在 Markdown 中替换 `images/...` 相对路径）
  - `server/src/uploads/uploads.module.ts`（导出上传服务，供 MinerU 结果资源转存复用）
  - `server/src/knowledge-ai-chat/knowledge-ai-chat-retrieval.service.ts`、测试（允许 `referenceImages` 返回受控的 `/uploads/...` 图片路径）
  - `D:/AllProjects/H5/ai-customer-service/js/api.js`、`js/app.js`（按 API 服务域名安全解析 `/uploads/...`，并渲染为图片）
  - `CHANGELOG.md`（记录本次调整）
- 删除：无
- 说明：历史文档若只保留了 `images/...` 文本且未保存 MinerU 结果 ZIP 中的原图，需重新执行 MinerU 解析及后续分片、索引；新解析任务会自动保存图片并替换为可展示地址。

### 2026-09-08 默认返回命中知识库图片
- 新增：无
- 修改：
  - `server/src/knowledge-ai-chat/knowledge-ai-chat-retrieval.service.ts`（从命中及相邻补充分片的 MinerU Markdown 中提取、去重并校验 `http/https` 图片 URL）
  - `server/src/knowledge-ai-chat/knowledge-ai-chat.service.ts`、`web/src/api/knowledgeAiChat.ts`（在 `retrieval` SSE 事件增加 `referenceImages`，包含 URL、替代文本、来源和分片 ID）
  - `server/src/knowledge-ai-chat/knowledge-ai-chat-retrieval.service.spec.ts`（覆盖安全 URL、去重和不安全协议过滤）
  - `CHANGELOG.md`（记录本次调整）
- 删除：无
- 说明：图片不依赖模型是否主动输出；模型遗漏时，应用端可根据 `referenceImages` 在最终答案后补充展示。仅返回 Markdown 中已存在且浏览器可访问的绝对 `http/https` 图片地址。

### 2026-09-08 支持流式展示 AI 思考过程
- 新增：无
- 修改：
  - `server/src/knowledge-ai-providers/knowledge-ai-providers.service.ts`（识别 OpenAI 兼容流中的 `reasoning_content` / `reasoning`，通过独立回调转发）
  - `server/src/knowledge-ai-chat/knowledge-ai-chat.service.ts`（向应用端输出 `thinking` SSE 事件，数据结构为 `{ content }`）
  - `web/src/api/knowledgeAiChat.ts`（补充 `thinking` 流式事件类型）
  - `server/src/knowledge-ai-providers/knowledge-ai-providers.service.spec.ts`（覆盖思考片段与最终回答分别回调）
  - `CHANGELOG.md`（记录本次调整）
- 删除：无
- 说明：只有上游模型实际返回思考字段时才推送该事件；思考过程不会持久化到问答记录，也不会混入最终回答正文。

### 2026-09-08 增加聊天 Think 模式配置与请求透传
- 新增：
  - `server/src/migrations/1788757200000-AddAiFeatureConfigThinking.ts`（为 AI 功能配置增加 Think 总开关和 JSON 参数对象）
  - `server/src/ai-feature-configs/ai-feature-configs.service.spec.ts`（覆盖聊天限定、参数保留与请求核心字段保护）
- 修改：
  - `server/src/ai-feature-configs/`（新增 `enableThinking`、`thinkingParameters` 字段；仅聊天类型允许启用，关闭或切换其他类型时自动清空）
  - `server/src/knowledge-ai-chat/knowledge-ai-chat.service.ts`、`server/src/knowledge-ai-providers/knowledge-ai-providers.service.ts`（普通问答和流式问答统一将已启用配置的 JSON 参数合并进上游模型请求）
  - `server/src/knowledge-ai-providers/knowledge-ai-providers.service.spec.ts`（验证 Think 参数不会覆盖模型、消息、流式和温度等核心请求字段）
  - `web/src/api/aiFeatureConfig.ts`、`web/src/views/ai-feature-config/`（聊天配置新增 Think 开关、JSON 编辑与列表状态展示）
  - `CHANGELOG.md`（记录本次调整）
- 删除：无
- 说明：Think 的实际参数由所选模型供应商决定，例如 `{"enable_thinking":true}` 或 `{"reasoning_effort":"medium"}`；项目开关关闭时不会向模型透传任何 Think 参数。

### 2026-09-08 补充问答记录的召回分片与 Token 用量
- 新增：
  - `server/src/migrations/1788753600000-AddKnowledgeAiChatTokenUsage.ts`（为聊天消息增加输入、输出和总 Token 字段）
- 修改：
  - `server/src/knowledge-ai-providers/knowledge-ai-providers.service.ts`（解析普通及流式聊天响应的 usage；流式请求要求上游回传最终 usage）
  - `server/src/knowledge-ai-chat/knowledge-ai-chat-retrieval.service.ts`、`knowledge-ai-chat.service.ts`、`entities/knowledge-ai-chat-message.entity.ts`（持久化召回分片序号，并合并重排和最终回答的实际 Token 用量）
  - `web/src/api/knowledgeAiChat.ts`、`web/src/views/knowledge-ai-record/Index.vue`（问答详情展示分片序号、分片 ID、召回分数和 Token 明细）
  - `CHANGELOG.md`（记录本次调整）
- 删除：无
- 说明：仅展示模型供应商实际返回的 usage；历史记录或不返回 usage 的供应商显示"上游未返回"，不会以字符数估算伪造 Token 数据。

### 2026-09-08 提升小说等相似语料的在线检索稳定性
- 新增：无
- 修改：
  - `server/src/knowledge-ai-chat/knowledge-ai-chat-retrieval.service.ts`（人物/实体属性问句保留实体锚点并升权；候选排序增加稳定键；候选池扩大至 `40～120`、重排池扩大至 48；重排改为围绕命中词读取最多 1,200 字；人物命中时优先同知识库上下文，并补充前后相邻分片）
  - `server/src/knowledge-ai-providers/knowledge-ai-providers.service.ts`（内部聊天调用可覆盖温度；检索重排固定使用 `temperature: 0`，普通聊天仍为 `0.2`）
  - `server/src/knowledge-ai-chat/knowledge-ai-chat-retrieval.service.spec.ts`（覆盖实体锚点、同分稳定排序及确定性重排调用）
  - `CHANGELOG.md`（记录本次调整）
- 删除：无
- 说明：本次不调整已有正文、分片或向量索引；人物事实问题通过运行时关键词与排序策略提升召回和结果一致性。相邻分片仅补充模型上下文，不作为新的直接检索命中写入 `retrievalHits`。

### 2026-09-07 调整知识库路由目标为分类加知识库
- 新增：
  - `server/src/knowledge-routing-rules/entities/knowledge-routing-rule-category.entity.ts`（路由规则与目标分类的映射实体）
  - `server/src/migrations/1788667200000-ReplaceKnowledgeRoutingDocumentsWithCategories.ts`（创建分类映射，并将历史文档映射转换为所属分类）
- 修改：
  - `server/src/knowledge-routing-rules/`（路由规则 DTO、模块和服务改为维护 `categoryIds + knowledgeBaseIds`，校验知识库从属于所选分类）
  - `server/src/knowledge-ai-chat/knowledge-ai-chat-retrieval.service.ts`、`entities/knowledge-ai-chat-message.entity.ts`（按分类展开路由范围，并记录分类命中快照）
  - `web/src/api/knowledgeRoutingRule.ts`、`web/src/views/knowledge-routing-rule/`（将目标文档替换为目标分类，目标知识库随分类收窄，列表/详情同步展示分类）
  - `CHANGELOG.md`（记录本次调整）
- 删除：无
- 说明：分类是路由粗粒度范围，知识库是可选精确范围；旧文档映射表保留但不再参与新规则或运行时路由，迁移会保留其所属分类信息。

### 2026-09-07 接入知识库路由规则到 AI 检索
- 新增：
  - `server/src/migrations/1788663600000-RecordKnowledgeRoutingRuleMatches.ts`（记录聊天消息命中的路由规则快照）
- 修改：
  - `server/src/knowledge-routing-rules/knowledge-routing-rules.service.ts`（提供检索运行时的启用规则匹配能力）
  - `server/src/knowledge-ai-chat/knowledge-ai-chat-retrieval.service.ts`（每次检索执行专属路由、别名升权、公共词降权及文档范围过滤）
  - `server/src/knowledge-ai-chat/knowledge-ai-chat.module.ts`、`server/src/knowledge-ai-chat/knowledge-ai-chat.service.ts`、`server/src/knowledge-ai-chat/entities/knowledge-ai-chat-message.entity.ts`（注入规则模块、向流式事件返回并持久化命中规则）
  - `server/src/knowledge-ai-chat/knowledge-ai-chat-retrieval.service.spec.ts`（覆盖专属路由优先与别名切换知识库）
  - `CHANGELOG.md`（记录本次功能）
- 删除：无
- 说明：每轮 AI 知识库检索都先按当前检索配置匹配已启用路由规则；`exclusive` 限定知识库/文档范围，`alias` 终止旧会话粘滞并提高目标知识库排序，`generic` 降低公共词干扰。规则变更即时生效，不依赖会话缓存。

### 2026-09-07 新增知识库路由规则配置模块
- 新增：
  - `server/src/knowledge-routing-rules/`（路由规则主表、知识库/文档映射表、CRUD 接口与映射范围校验）
  - `server/src/migrations/1788656400000-CreateKnowledgeRoutingRules.ts`（创建路由规则及两张映射表）
  - `web/src/api/knowledgeRoutingRule.ts`、`web/src/views/knowledge-routing-rule/`（规则管理接口、列表、筛选、详情与编辑页面）
- 修改：
  - `server/src/app.module.ts`、`server/src/users/users.service.ts`、`server/src/menus/menus.service.ts`（挂载模块、补齐管理员权限和聊天管理菜单）
  - `web/src/router/index.ts`（增加知识库路由规则页面路由）
  - `CHANGELOG.md`（记录本次功能）
- 删除：无
- 说明：规则支持公共词降权、别名升权和专属路由，按"检索配置 → 目标知识库 → 可选目标文档"建立映射；本次只提供管理能力，尚未接入 AI 检索运行时。

### 2026-09-07 补充 AI 会话管理字段说明
- 新增：
  - `MD/AI会话管理字段说明.md`（以会话主记录、检索上下文、消息明细和读写流程说明 AI 会话管理）
- 修改：
  - `CHANGELOG.md`（记录本次文档补充）
- 删除：无
- 说明：根据反馈将会话模块与 AI 问答记录收敛到一份精简字段说明中。

### 2026-09-07 合并知识库解析说明
- 新增：
  - `MD/知识库解析（手动+MinerU）.md`（在一份文档中说明两种解析方式、解析/分片/索引边界、选型和排障）
- 修改：
  - `CHANGELOG.md`（记录说明文档合并）
- 删除：
  - `MD/手动解析实现原理.md`
  - `MD/MinerU解析实现原理.md`
- 说明：根据反馈收敛为单份产品说明，避免将同一条知识库处理链路拆散阅读。

### 2026-09-07 更新知识库手动解析与 MinerU 解析说明
- 新增：
  - `MD/手动解析实现原理.md`（说明手动解析的支持范围、PDF 本地 OCR 兜底、解析结果和排障边界）
  - `MD/MinerU解析实现原理.md`（说明 MinerU 的配置依赖、异步任务流程、结果处理、选型与排障）
- 修改：
  - `CHANGELOG.md`（记录本次文档更新）
- 删除：无
- 说明：按当前流程明确区分解析、分片和索引；修正"MinerU 分片"不会再次提交原始文件解析的认知，避免把正文提取问题与检索召回问题混为一谈。

### 2026-09-07 补充知识库检索配置最新版说明
- 新增：
  - `MD/知识库检索配置.md`（新建配置默认值、范围规则、完整检索流程、会话有效期、重排与调参建议）
  - `MD/知识库检索配置字段说明.md`（当前字段契约、校验范围、联动规则、运行时会话字段和推荐请求示例）
- 修改：
  - `CHANGELOG.md`（记录本次文档补充）
- 删除：无
- 说明：文档按当前代码重新生成，补充 `sessionContextTimeoutMinutes`；明确新配置默认 `topK=6`、`minScore=0.35`、重排开启，并说明历史配置不会被自动改写。

### 2026-09-06 增加检索会话上下文有效期
- 新增：
  - `server/src/migrations/1788642000000-AddKnowledgeRetrievalSessionTimeout.ts`（增加检索配置会话上下文有效期及会话最后检索时间字段）
- 修改：
  - `server/src/knowledge-retrieval-configs/entities/knowledge-retrieval-config.entity.ts`、`server/src/knowledge-retrieval-configs/dto/knowledge-retrieval-config.dto.ts`、`server/src/knowledge-retrieval-configs/knowledge-retrieval-configs.service.ts`（新增 `sessionContextTimeoutMinutes`，新配置默认 15 分钟，允许 0–1440 分钟）
  - `server/src/knowledge-ai-chat/entities/knowledge-ai-chat-session.entity.ts`、`server/src/knowledge-ai-chat/knowledge-ai-chat.service.ts`、`server/src/knowledge-ai-chat/knowledge-ai-chat-retrieval.service.ts`（仅在有效期内复用知识库上下文；粘性检索无命中时以当前问题原文自动回退至全范围检索；新问题无命中时清除旧知识库缓存）
  - `web/src/api/knowledgeRetrievalConfig.ts`、`web/src/views/knowledge-retrieval-config/Edit.vue`、`web/src/views/knowledge-retrieval-config/Index.vue`（增加"上下文有效期（分钟）"配置、说明及列表展示）
  - `server/src/knowledge-ai-chat/knowledge-ai-chat-retrieval.service.spec.ts`、`server/src/knowledge-retrieval-configs/knowledge-retrieval-configs.service.spec.ts`（覆盖有效期、全范围回退与默认值）
- 删除：无
- 说明：该策略由后端检索路由执行，并非模型供应商参数；填 `0` 表示每次均作为独立问题检索。历史会话首次使用新逻辑时会按新问题处理并写入新的检索时间。

### 2026-09-06 增加 Table 单元格默认溢出提示
- 新增：无
- 修改：
  - `web/src/components/Table.vue`（所有数据列默认单行省略，并在内容实际溢出时显示完整 Tooltip；支持表格级和列级关闭）
  - `AGENTS-COMPONENTS.md`、`.design-spec.md`（同步 Table 溢出提示契约与表格数据展示规范）
- 删除：无
- 说明：操作列和勾选列保持原有交互，不套用文本 Tooltip；普通列及具名插槽列默认继承统一行为。

### 2026-09-06 补齐其它列表页业务下拉筛选
- 新增：
  - `server/src/common/list-query-filters.spec.ts`（验证布尔查询转换、启停状态、示例状态、模板格式和问答结果筛选）
- 修改：
  - `web/src/views/ai-feature-config/Index.vue`、`web/src/views/data-import/Index.vue`、`web/src/views/demo/Index.vue`、`web/src/views/external-app/Index.vue`、`web/src/views/knowledge-ai-provider/Index.vue`、`web/src/views/knowledge-ai-record/Index.vue`、`web/src/views/knowledge-chunk-config/Index.vue`、`web/src/views/knowledge-retrieval-config/Index.vue`、`web/src/views/log-record/Index.vue`、`web/src/views/mineru-config/Index.vue`、`web/src/views/permission/Index.vue`、`web/src/views/role/Index.vue`、`web/src/views/user/Index.vue`（为全部标准分页列表补充至少一个业务下拉筛选）
  - `web/src/api/aiFeatureConfig.ts`、`web/src/api/dataImport.ts`、`web/src/api/demo.ts`、`web/src/api/externalApp.ts`、`web/src/api/knowledgeAiProvider.ts`、`web/src/api/knowledgeAiChat.ts`、`web/src/api/knowledgeChunkConfig.ts`、`web/src/api/knowledgeRetrievalConfig.ts`、`web/src/api/mineruConfig.ts`、`web/src/api/permission.ts`、`web/src/api/role.ts`、`web/src/api/user.ts`（补齐列表查询参数类型）
  - `web/src/components/Table.vue`（请求前统一剔除空字符串、空值和未定义筛选项，同时保留 `false` 等有效条件）
  - `web/src/components/InputEmail.vue`（放宽内部标准化函数的可空类型，清除完整前端构建的存量类型阻塞）
  - `server/src/ai-feature-configs/ai-feature-configs.service.ts`、`server/src/ai-feature-configs/dto/ai-feature-config.dto.ts`、`server/src/data-import/data-import.service.ts`、`server/src/data-import/dto/data-import.dto.ts`、`server/src/demo/demo.service.ts`、`server/src/demo/dto/demo.dto.ts`、`server/src/external-apps/external-apps.service.ts`、`server/src/external-apps/dto/external-app.dto.ts`、`server/src/knowledge-ai-chat/knowledge-ai-chat.service.ts`、`server/src/knowledge-ai-chat/dto/knowledge-ai-chat.dto.ts`、`server/src/knowledge-ai-providers/knowledge-ai-providers.service.ts`、`server/src/knowledge-ai-providers/dto/knowledge-ai-provider.dto.ts`、`server/src/knowledge-retrieval-configs/knowledge-retrieval-configs.service.ts`、`server/src/knowledge-retrieval-configs/dto/knowledge-retrieval-config.dto.ts`、`server/src/mineru-configs/mineru-configs.service.ts`、`server/src/mineru-configs/dto/mineru-config.dto.ts`、`server/src/permissions/permissions.service.ts`、`server/src/permissions/dto/permission.dto.ts`、`server/src/roles/roles.service.ts`、`server/src/roles/dto/role.dto.ts`、`server/src/users/users.service.ts`、`server/src/users/dto/user.dto.ts`（校验并执行新增的服务端分页筛选条件）
- 删除：无
- 说明：日志操作类型和既有模块筛选均复用后端扫描结果；本次不涉及数据库结构变更，非分页仪表盘、树形菜单和单例配置页不增加无意义筛选。

### 2026-09-06 增加知识库列表组合下拉筛选
- 新增：
  - `server/src/knowledge-bases/knowledge-bases.service.spec.ts`（验证查询布尔值转换及分类、类型、阶段、启停组合筛选）
- 修改：
  - `web/src/views/knowledge-base/Index.vue`、`web/src/api/knowledgeBase.ts`（知识库列表增加所属分类、内容类型、处理阶段和启用状态下拉筛选，并补齐查询参数类型）
  - `server/src/knowledge-bases/dto/knowledge-base.dto.ts`、`server/src/knowledge-bases/knowledge-bases.service.ts`（校验并执行新增筛选条件，修正关键词与下拉条件组合查询的逻辑分组）
- 删除：无
- 说明：筛选项复用项目 Form/Select 组件，可清空、重置并与关键词组合参与服务端分页查询；不涉及数据库结构变更。

### 2026-09-06 修复知识库回答分片内容被二次截断
- 新增：无
- 修改：
  - `server/src/knowledge-ai-chat/knowledge-ai-chat-retrieval.service.ts`（取消入选分片 900 字硬截断，并按文档分片顺序组织回答上下文）
  - `server/src/knowledge-ai-chat/knowledge-ai-chat-retrieval.service.spec.ts`（覆盖长分片完整保留及上下文原文顺序）
- 删除：无
- 说明：默认 1200 字分片不再于第 900 字被截断；本次深圳大学"调转档案"详细办理方式可完整进入模型上下文，无需重新分片或重建索引。

### 2026-09-06 修复大学手册路由并默认启用检索重排
- 新增：
  - `server/src/knowledge-retrieval-configs/knowledge-retrieval-configs.service.spec.ts`（验证新建检索配置默认启用重排并自动绑定当前聊天配置）
  - `server/src/migrations/1788634800000-EnableKnowledgeRetrievalRerank.ts`（将重排数据库默认值改为开启，并为历史配置补充当前启用的聊天配置）
- 修改：
  - `server/src/knowledge-ai-chat/knowledge-ai-chat-retrieval.service.ts`（增加知识库简称识别、公共词降权、低置信全范围召回、配置清单查询和重排配置回退）
  - `server/src/knowledge-ai-chat/knowledge-ai-chat.service.ts`、`web/src/api/knowledgeAiChat.ts`（仅在高置信命中时锁定会话知识库，清单查询主动解除知识库粘性并输出路由状态）
  - `server/src/knowledge-ai-chat/knowledge-ai-chat-retrieval.service.spec.ts`（覆盖"深圳大学"简称路由、公共词不锁库、知识库清单查询和默认重排回退）
  - `server/src/knowledge-retrieval-configs/dto/knowledge-retrieval-config.dto.ts`、`server/src/knowledge-retrieval-configs/entities/knowledge-retrieval-config.entity.ts`、`server/src/knowledge-retrieval-configs/knowledge-retrieval-configs.service.ts`、`web/src/views/knowledge-retrieval-config/Edit.vue`（重排默认开启，未传重排配置时自动选择可用聊天配置）
- 删除：无
- 说明：知识库范围内的大学手册不再因"大学/入学/手册"等公共词并列而按数据库顺序误选；询问知识库列表时直接使用配置清单，不将分片召回结果误报为全部知识库。

### 2026-09-06 优化 AI 连续问答的知识库路由与检索排序
- 新增：
  - `server/src/knowledge-ai-chat/knowledge-ai-chat-retrieval.service.spec.ts`（覆盖会话知识库粘性、显式主题切换、融合评分、重排结果解析和弱知识库抑制）
  - `server/src/migrations/1788627600000-ImproveKnowledgeRetrievalContext.ts`（增加会话检索状态、消息命中明细字段并调整新检索配置默认值）
- 修改：
  - `server/src/knowledge-ai-chat/knowledge-ai-chat-retrieval.service.ts`（增加多轮检索问题改写、会话知识库优先路由、归一化加权 RRF、弱知识库抑制、真实 AI 重排和原始分片回填）
  - `server/src/knowledge-ai-chat/knowledge-ai-chat.service.ts`、`server/src/knowledge-ai-providers/knowledge-ai-providers.service.ts`（统一流式/非流式历史上下文，持久化检索轨迹并向前端输出命中明细）
  - `server/src/knowledge-ai-chat/entities/knowledge-ai-chat-session.entity.ts`、`server/src/knowledge-ai-chat/entities/knowledge-ai-chat-message.entity.ts`（保存当前知识库、独立检索问题、命中分片及分项得分）
  - `server/src/knowledge-retrieval-configs/entities/knowledge-retrieval-config.entity.ts`、`server/src/knowledge-retrieval-configs/knowledge-retrieval-configs.service.ts`（新配置默认 `topK=6`、`minScore=0.35`，重排配置限制为可用对话配置）
  - `web/src/api/knowledgeAiChat.ts`、`web/src/views/knowledge-ai-record/Index.vue`、`web/src/views/knowledge-retrieval-config/Edit.vue`（对齐检索轨迹字段、展示命中得分并优化配置默认值及重排配置选项）
- 删除：无
- 说明：连续追问会自动复用当前会话命中的知识库；明确提到新知识库时才切换。已有检索配置不会被迁移自动改值，需按业务数据手动校准范围、最低相关度及是否启用重排。

### 2026-09-04 支持已索引知识库二次确认后强制重建
- 新增：
  - `server/src/knowledge-bases/dto/knowledge-base.dto.ts`（增加索引请求 DTO，支持 `force` 参数）
  - `web/src/api/knowledgeBase.ts`（索引接口增加可选强制重建参数）
- 修改：
  - `server/src/knowledge-bases/knowledge-bases.controller.ts`、`server/src/knowledge-bases/knowledge-bases.service.ts`（透传强制索引参数，确认后重新处理全部分片）
  - `web/src/views/knowledge-base/Index.vue`（已索引数据再次点击索引时增加二次确认）
- 删除：无
- 说明：普通索引仍按内容哈希、向量状态和向量 ID执行增量跳过；只有确认后的 `force: true` 才会重建全部分片。

### 2026-09-04 新增向量模型维度自动检测
- 新增：
  - `server/src/vector-configs/dto/vector-config.dto.ts`（新增检测向量模型维度请求 DTO）
  - `web/src/api/vectorConfig.ts`（新增维度检测接口类型和调用方法）
- 修改：
  - `server/src/vector-configs/vector-configs.controller.ts`、`server/src/vector-configs/vector-configs.service.ts`（增加后端维度探测接口，使用供应商配置发送最小 embedding 请求并返回建议 Collection 名称）
  - `web/src/views/vector-config/Index.vue`（切换账号/模型后自动检测、回填供应商维度，并更新受管默认 Collection 名称）
- 删除：无
- 说明：检测使用模型实际返回向量长度；支持 `dimensions` 的模型按向量服务维度请求，腾讯等固定维度模型按实际返回值处理；用户自定义 Collection 不会被自动覆盖。

### 2026-09-04 增加供应商向量模型维度配置
- 新增：无
- 修改：
  - `server/src/vector-configs/entities/vector-config.entity.ts`、`server/src/vector-configs/dto/vector-config.dto.ts`、`server/src/vector-configs/vector-configs.service.ts`（增加可选供应商向量模型维度并支持单配置保存、回显和读取）
  - `server/src/knowledge-vectors/knowledge-embedding.service.ts`（模型调用和维度校验优先使用供应商维度，未填写时回退到向量服务维度）
  - `web/src/api/vectorConfig.ts`、`web/src/views/vector-config/Index.vue`（增加供应商向量维度输入项及回退规则说明）
- 删除：无
- 说明：向量服务维度默认 768；腾讯等不支持 `dimensions` 参数的模型可填写其固定输出维度，例如 1024，不再要求修改向量服务默认维度。

### 2026-09-04 增加向量维度切换校验
- 新增：无
- 修改：
  - `server/src/knowledge-vectors/knowledge-embedding.service.ts`（校验模型实际返回的向量维度与向量化配置，并提示模型、账号及修复方式）
  - `server/src/knowledge-vectors/knowledge-vector.service.ts`（将 Chroma 集合维度冲突转换为明确的配置和重建提示）
- 删除：无
- 说明：切换向量模型后不再只返回 Chroma 底层 400；模型实际维度与配置或既有集合不一致时，会提示调整维度并更换集合或清理旧集合后重新索引，不自动删除已有向量数据。

### 2026-09-04 修正 Table 搜索与刷新分页状态
- 新增：无
- 修改：
  - `web/src/components/Table.vue`（搜索不再强制跳回第 1 页；区分编辑中的搜索表单和已应用查询条件，刷新及弹窗操作后复用最近一次查询参数）
- 删除：无
- 说明：点击查询时保留当前页和分页大小；重置仍清空查询条件并回到第 1 页。

### 2026-09-04 修正向量模型下拉列表展示
- 新增：无
- 修改：
  - `web/src/views/vector-config/Index.vue`（完整展示账号已配置的向量模型，将视觉/多模态向量模型置灰并标注不可用于文本索引）
- 删除：无
- 说明：向量化配置仍只允许选择文本向量模型；已配置的其它向量模型不再被无提示隐藏。

### 2026-09-03 修复 TXT 预拆分后无法分片
- 新增：无
- 修改：
  - `server/src/knowledge-bases/knowledge-bases.service.ts`（TXT/MD 预拆分同步生成文档正文记录；历史 TXT 缺少文档记录时在分片入口自动补建）
- 删除：无
- 说明：小说等 TXT 上传后无需重复解析即可直接选择手动或 MinerU 分片，PDF、Word、图片仍按解析完成后进入分片流程。

### 2026-09-03 恢复知识库分片模式选择
- 新增：无
- 修改：
  - `server/src/knowledge-bases/dto/knowledge-base.dto.ts`（分片接口接收手动/MinerU 模式）
  - `server/src/knowledge-bases/knowledge-bases.controller.ts`（传递分片模式）
  - `server/src/knowledge-bases/knowledge-bases.service.ts`（MinerU 分片异步任务记录模式，手动模式引导至详情编辑器）
  - `web/src/api/knowledgeBase.ts`（补充分片模式请求类型）
  - `web/src/views/knowledge-base/Index.vue`（恢复手动/MinerU 分片选择）
  - `web/src/views/knowledge-base/View.vue`（支持从列表直接打开手动分片编辑器）
- 删除：无
- 说明：点击列表"分片"后，选择手动分片会进入内容页拖拽操作，选择 MinerU 分片才提交后台异步分片任务。

### 2026-09-03 TXT 上传后直接进入待分片状态
- 新增：无
- 修改：
  - `server/src/knowledge-bases/knowledge-bases.service.ts`（TXT/MD 上传预拆分后直接标记为已解析，等待分片）
  - `web/src/views/knowledge-base/Index.vue`（知识库列表隐藏 TXT/MD 的解析操作）
- 删除：无
- 说明：TXT/MD 不再重复执行解析流程；上传完成后即可直接点击分片，PDF、Word、图片仍保留解析操作。

### 2026-09-03 将大文本预拆分修正为知识库主记录
- 新增：无
- 修改：
  - `server/src/knowledge-bases/knowledge-bases.service.ts`（创建/更新知识库后按文档解析规则生成多条知识库主记录，恢复单记录解析与分片链路）
  - `server/src/knowledge-bases/entities/knowledge-base.entity.ts`、`web/src/api/knowledgeBase.ts`（增加上传拆分分组字段）
- 删除：无
- 说明：TXT/MD 在知识库提交时按当前解析规则直接生成多条知识库列表记录，标题带分段序号，后续手动解析、AI 解析和分片均以每条记录为边界；PDF、Word、图片暂保留为单条记录，避免重复提交同一二进制文件。

### 2026-09-03 修复文档解析规则启动查询异常
- 新增：无
- 修改：`server/src/document-parse-rules/document-parse-rules.service.ts`（为 TypeORM 无条件 `findOne` 补充 `where: {}`）
- 删除：无
- 说明：修复服务启动时报错 `You must provide selection conditions in order to find a single row`，保持规则初始化和当前配置读取逻辑不变。

### 2026-09-03 新增文档解析规则配置并接入大文本解析
- 新增：
  - `server/src/document-parse-rules/`（文档解析规则单例配置接口与文本预拆分服务）
  - `web/src/api/documentParseRule.ts`、`web/src/views/document-parse-rule/Index.vue`（系统配置下的文档解析规则页面）
- 修改：
  - `server/src/app.module.ts`、`server/src/menus/menus.service.ts`、`web/src/router/index.ts`（注册后端模块、系统配置菜单和路由）
  - `server/src/knowledge-bases/knowledge-bases.module.ts`、`server/src/knowledge-bases/knowledge-bases.service.ts`（AI 文本解析前读取规则，按 TXT/MD 或 Word 文本片段逐段调用模型）
- 删除：无
- 说明：TXT/MD 按目标大小、最大行数和句末/段落边界拆分；Word 提取为文本后按段落数量参与拆分。PDF 每份页数配置已保存，物理 PDF 分页将在接入 PDF 文件重建能力后使用。

### 2026-09-03 修复 TXT 上传后的文本必填校验
- 新增：无
- 修改：
  - `web/src/views/knowledge-base/Edit.vue`（文本内容校验允许使用已上传的 TXT / MD 文件地址作为正文来源）
- 删除：无
- 说明：文本上传模式不再因 `contentText` 尚未在前端回填而提示"请输入文本"，提交后仍由后端读取文件正文。

### 2026-09-03 修复中文 TXT 解析乱码
- 新增：无
- 修改：
  - `server/src/stored-files/stored-files.service.ts`（公共文本读取增加 UTF-8、UTF-8 BOM、UTF-16 和 GB18030 编码兼容）
  - `server/src/knowledge-bases/knowledge-bases.service.ts`（知识库文本上传统一使用公共编码解码）
- 删除：无
- 说明：手动解析和 AI 解析现在共用解码后的正文；中文 GBK/GB18030 TXT 不会在保存 `contentText` 前被错误按 UTF-8 解码。

### 2026-09-02 修复知识库内容正文字面量换行回显
- 新增：无
- 修改：
  - `web/src/views/knowledge-base/View.vue`（仅对"内容"Tab 的 `parsedContent` 展示值转换字面量 `\\n` / `\\r\\n` / `\\r`，并保留真实换行）
- 删除：无
- 说明：只影响知识库查看页面的解析正文回显，不修改数据库原文，也不影响分片、索引和问答内容。

### 2026-09-02 修复 AI 回复字面量换行未渲染
- 新增：无
- 修改：
  - `server/src/knowledge-ai-providers/knowledge-ai-providers.service.ts`（供应商响应适配层将字面量 `\\n` / `\\r\\n` / `\\r` 规范化为真实换行，覆盖普通回复、流式增量和保存记录）
- 删除：无
- 说明：前端原有 `white-space: pre-wrap` 可以正常显示真实换行；修复后 H5 和管理端收到的内容均可按换行展示。

### 2026-09-02 优化大 TXT / Markdown 文件上传处理
- 新增：无
- 修改：
  - `web/src/views/knowledge-base/Edit.vue`（文本文件上传不再读取全文并放入 JSON，创建/更新时仅提交统一上传接口返回的文件地址）
  - `server/src/knowledge-bases/knowledge-bases.service.ts`（通过本地/OSS 文件读取服务读取 `.txt` / `.md` 正文并保存到 `contentText`，保留文件来源信息）
- 删除：无
- 说明：大 TXT 仍保持"一份源文档"，点击分片后按照分片配置生成多个分片记录；后端读取上限沿用文件读取服务的安全限制，避免前端请求体重复携带大段正文。

### 2026-09-02 支持知识库文本上传 TXT / Markdown
- 新增：无
- 修改：
  - `web/src/components/UploadFile.vue`（增加可选文本读取能力，上传成功后通过 `v-model:content` 回传原始正文）
  - `web/src/views/knowledge-base/Edit.vue`（文本类型增加「直接录入 / 上传 TXT / MD」模式，上传后回填 `contentText` 并沿用现有文本解析链路）
- 删除：无
- 说明：上传仍统一调用 `/api/uploads`；`.txt` / `.md` 文件内容在浏览器读取后提交为 `contentText`，不新增知识库内容类型，也不改变 PDF、Word、图片的上传逻辑。

### 2026-09-02 将匹配优先级默认值调整为 1
- 新增：无
- 修改：
  - `server/src/knowledge-bases/entities/knowledge-base.entity.ts`、`server/src/knowledge-bases/entities/knowledge-base-document.entity.ts`（新记录默认匹配优先级改为 1）
  - `server/src/knowledge-bases/dto/knowledge-base.dto.ts`（知识库和文档匹配优先级最小值改为 1）
  - `server/src/knowledge-bases/knowledge-bases.service.ts`、`server/src/knowledge-ai-chat/knowledge-ai-chat-retrieval.service.ts`（创建、索引和检索兜底值改为 1）
  - `web/src/views/knowledge-base/Edit.vue`、`web/src/views/knowledge-base/View.vue`（表单初值、输入下限和详情兜底改为 1）
- 删除：无
- 说明：已有数据库中为 0 的历史记录不自动迁移，新建或更新数据统一从 1 开始。

### 2026-09-02 移除知识库新增编辑表单编码
- 新增：无
- 修改：
  - `web/src/views/knowledge-base/Edit.vue`（移除编码字段、自动生成逻辑及提交参数）
  - `web/src/api/knowledgeBase.ts`（移除知识库表单编码类型和自动编码接口）
  - `server/src/knowledge-bases/dto/knowledge-base.dto.ts`（移除知识库创建/更新编码字段及对应查询 DTO）
  - `server/src/knowledge-bases/knowledge-bases.controller.ts`（移除知识库自动编码接口）
  - `server/src/knowledge-bases/knowledge-bases.service.ts`（停止知识库编码查询和读写）
- 删除：无
- 说明：保留实体中的历史 `code` 列，避免破坏已有数据库数据；分类编码功能不受影响。

### 2026-09-02 优化知识库新增编辑表单宽度
- 新增：无
- 修改：
  - `web/src/views/knowledge-base/Edit.vue`（移除内部固定窄宽，改为内容区自适应撑满并在大屏下居中展示）
- 删除：无
- 说明：新增和编辑共用同一套布局，保留原有表单、上传控件和抽屉滚动行为。

### 2026-09-01 增加短篇小说纯文本演示素材
- 新增：无
- 修改：
  - `MD/知识库准备.md`（增加短篇小说资料库及录入顺序，用于演示纯文本长内容的解析、分片和检索）
- 删除：无
- 说明：在现有多格式演示素材之外补充一份短篇 TXT，不增加过多文件数量。

### 2026-09-01 增加非电商 PDF 客服演示场景
- 新增：无
- 修改：
  - `MD/知识库准备.md`（增加校园服务资料库，仅使用无水印 PDF，并补充独立聊天应用的演示顺序）
- 删除：无
- 说明：电商场景继续覆盖多种文件载体，校园服务场景用于展示不同客服应用绑定独立知识库的效果。

### 2026-09-01 精简知识库演示准备清单
- 新增：无
- 修改：
  - `MD/知识库准备.md`（将演示素材精简为三个分类和五种文件载体，突出 TXT、PDF、DOCX、DOC、图片的解析能力）
- 删除：无
- 说明：保留固定问答、售后政策和图文资料三个核心分类，覆盖解析、分片、索引和问答演示链路。

### 2026-09-01 移除知识库分类 / 知识库 / 文档的排序字段（改为按创建顺序展示）
- 新增：无
- 修改：
  - `server/src/knowledge-bases/dto/knowledge-base.dto.ts`（`CreateKnowledgeBaseDto` / `CreateKnowledgeBaseCategoryDto` / `CreateKnowledgeBaseDocumentDto` 移除 `sort`，`CreateKnowledgeBaseChunkDto` 的 `sort` 保留——分片顺序内部自动管理）
  - `server/src/knowledge-bases/knowledge-bases.service.ts`（`findBases` / `findCategories` / `findDocuments` 排序改为仅按 `id`（创建顺序），移除 `create/update` 中对 `sort` 的写入与赋值）
  - `web/src/views/knowledge-base/Categories.vue`（移除分类表单「排序」输入项、列表「排序」列及表单状态 / payload 中的 `sort`）
  - `web/src/api/knowledgeBase.ts`（`KnowledgeBaseForm` / `KnowledgeBaseCategoryForm` / `KnowledgeBaseDocumentForm` 移除 `sort`，`KnowledgeBaseChunkForm` 保留）
- 删除：无
- 说明：菜单排序（`menu`）保留——它决定侧边栏显示顺序，有实际意义；知识库分类 / 知识库 / 文档改为按创建顺序展示；实体 `sort` 列保留（避免破坏表结构），不再参与排序与表单。

### 2026-09-01 知识库分类 / 知识库编码自动生成（层级 + 序号，名称失焦触发）
- 新增：
  - `server/src/knowledge-bases/dto/knowledge-base.dto.ts`（新增 `QueryNextCategoryCodeDto` / `QueryNextBaseCodeDto`）
  - `server/src/knowledge-bases/knowledge-bases.service.ts`（新增 `nextCategoryCode` / `nextBaseCode` / `nextSequentialCode`：顶级分类 `CAT_001` 起、非顶级继承父编码，知识库取所属分类编码 + 3 位序号，未选分类兜底前缀 `KB`）
  - `server/src/knowledge-bases/knowledge-bases.controller.ts`（新增 `GET /knowledge-bases/categories/next-code`、`GET /knowledge-bases/next-code`，权限 `KnowledgeBase.create`，声明在 `@Get(':id')` 之前避免被捕获）
  - `web/src/api/knowledgeBase.ts`（新增 `getNextKnowledgeBaseCategoryCode` / `getNextKnowledgeBaseCode`）
  - `web/src/components/Form.vue`（默认单行输入新增 `blur` 事件透传，载荷 `(prop, event)`，向后兼容）
  - `web/src/views/knowledge-base/Categories.vue`（分类弹窗：名称失焦且编码为空时自动生成编码）
  - `web/src/views/knowledge-base/Edit.vue`（知识库弹窗：新增「编码」字段，名称失焦且编码为空时自动生成，创建/更新 payload 带上 code）
- 修改：无
- 删除：无
- 说明：编码为空时才自动填充，已手动填写的编码不会被覆盖；生成接口仅统计未软删数据下的同前缀最大序号 + 1，跨父级互不影响。

### 2026-08-31 新增知识库演示准备清单
- 新增：
  - `MD/知识库准备.md`（整理电商零售客服场景下的知识库分类、文档素材和录入顺序）
- 修改：无
- 删除：无
- 说明：覆盖固定问答、政策文档、图片与链接文档、多格式解析、分片、索引和问答演示素材。

### 2026-08-31 手动 Word 解析支持 .doc
- 新增：
  - `server/package.json`、`server/package-lock.json`（加入 `word-extractor`，用于读取旧版二进制 Word 文件）
- 修改：
  - `server/src/document-parsers/parsers/word-document.parser.ts`（业务层继续统一使用 `word` 类型，`.docx` 走 `mammoth`，`.doc` 走 `word-extractor`，并统一输出正文）
- 删除：无
- 说明：手动解析不再因 `.doc` 扩展名直接要求使用 MinerU；该依赖支持 Buffer 输入，不要求安装 Office 或系统级转换工具。

### 2026-08-28 统一解析正文格式以兼容自动和手动分片
- 新增：无
- 修改：
  - `server/src/knowledge-bases/knowledge-bases.service.ts`（统一规范手动解析、AI 解析和 MinerU 解析产生的正文换行、空格与段落格式）
  - `server/src/knowledge-bases/knowledge-bases.service.ts`（自动分片统一读取标准化正文，同时保留手动分片的原文坐标和链接内容）
- 删除：无
- 说明：纯文本、PDF、Word、图片 OCR 结果均可作为 Markdown 兼容的普通正文参与自动分片和手动分片。

### 2026-08-28 解析与分片流程解耦
- 新增：无
- 修改：
  - `server/src/knowledge-bases/knowledge-bases.service.ts`（手动解析、AI 模型解析、视觉 OCR、MinerU 解析完成后只保存正文并清理旧分片/向量，不再自动生成分片）
  - `server/src/knowledge-bases/knowledge-bases.service.ts`（解析成功后的知识库和文档状态统一为"解析完成，等待分片"，独立分片接口作为后续处理入口）
- 删除：无
- 说明：知识库处理流程统一为"解析 → 分片 → 索引"，解析结果不会隐式进入分片或索引阶段。

### 2026-08-26 文档解析升级为 AI 模型解析入口
- 新增：无
- 修改：
  - `web/src/views/knowledge-base/Index.vue`（解析模式弹窗将"OCR 解析"改为"AI 模型解析"，提交 `parseMode=ai`）
  - `web/src/api/knowledgeBase.ts`（解析模式类型补充 `ai`，保留 `ocr/mineru` 兼容旧调用）
  - `web/src/views/ai-feature-config/Edit.vue`、`web/src/views/ai-feature-config/Index.vue`（文档解析配置也支持选择 MinerU 引擎）
  - `server/src/ai-feature-configs/dto/ai-feature-config.dto.ts`、`server/src/ai-feature-configs/ai-feature-configs.service.ts`（允许文档解析功能配置绑定 MinerU）
  - `server/src/knowledge-bases/dto/knowledge-base.dto.ts`（解析 DTO 支持 `ai` 模式）
  - `server/src/knowledge-bases/knowledge-bases.service.ts`（AI 模型解析按配置和文件类型分流：MinerU 优先全格式解析；未启用 MinerU 时，PDF/图片走 OCR 配置，Word/文本走文档解析配置）
  - `server/src/knowledge-ai-providers/knowledge-ai-providers.service.ts`（视觉 OCR 调用补充规则和返回格式提示）
- 删除：无
- 说明：知识库点击解析后，高层入口统一为"手动解析 / AI 模型解析"；AI 模型解析内部根据 MinerU 开关和文件类型选择真实执行链路，Word 会先用本地解析保留链接，再交给文档解析模型整理。

### 2026-08-26 文档解析模式改为 OCR 配置驱动
- 新增：无
- 修改：
  - `web/src/views/knowledge-base/Index.vue`（解析模式弹窗将"MinerU 解析"改为"OCR 解析"，提交 `parseMode=ocr`）
  - `web/src/api/knowledgeBase.ts`（解析模式类型补充 `ocr`，保留 `mineru` 兼容旧调用）
  - `server/src/knowledge-bases/dto/knowledge-base.dto.ts`（解析 DTO 支持 `ocr` 模式）
  - `server/src/knowledge-bases/knowledge-bases.module.ts`（知识库模块引入视觉模型 OCR 所需服务）
  - `server/src/knowledge-bases/knowledge-bases.service.ts`（OCR 模式读取启用的 AI 功能配置，按配置分流到视觉模型 OCR 或 MinerU）
  - `server/src/document-ocr/document-ocr.service.ts`（提供视觉模型 OCR 所需的图片/PDF 图片输入构建能力）
- 删除：无
- 说明：知识库点击解析后，高层模式统一为"手动解析 / OCR 解析"；OCR 解析由 AI 功能配置决定实际引擎，启用 MinerU 时走 MinerU，未启用 MinerU 时走配置的大模型视觉模型。

### 2026-08-26 OCR 配置读取视觉模型列表
- 新增：无
- 修改：
  - `web/src/views/ai-feature-config/Edit.vue`（OCR 视觉模型模式下，模型下拉只读取所选大模型账号的视觉模型列表，并在账号切换后清理不匹配的旧模型值）
- 删除：无
- 说明：AI 功能配置选择 OCR 且不启用 MinerU 时，模型选择口径与大模型账号中的"视觉模型"字段保持一致，避免混入通用模型或文本模型。

### 2026-08-26 保留 MinerU Word 超链接
- 新增：无
- 修改：
  - `server/src/mineru-configs/mineru-configs.service.ts`（读取 MinerU 结果包时优先识别 HTML 文件，并将 `<a href>` 转成 `文字（链接：URL）`）
  - `server/src/knowledge-bases/knowledge-bases.service.ts`（MinerU 解析 Word/docx 后若正文缺少链接信息，使用原始 Word 本地解析兜底补回超链接文本）
- 删除：无
- 说明：Word 经 MinerU 解析后若输出为纯文本，系统会尽量从结果包 HTML 或原始 docx 中恢复超链接，避免知识库正文丢失链接地址。

### 2026-08-26 分片内容展示保持紧凑
- 新增：无
- 修改：
  - `web/src/views/knowledge-base/View.vue`（分片内容移除 4 行裁切后，不再保留原文换行格式，改为紧凑自然换行展示）
- 删除：无
- 说明：分片内容仍会完整显示，但列表展示更紧凑，避免原文换行造成行高过大。

### 2026-08-26 分片内容查看自动撑开
- 新增：无
- 修改：
  - `web/src/views/knowledge-base/View.vue`（移除分片内容单元格 4 行裁切限制，按内容自然换行撑开）
- 删除：无
- 说明：知识库详情的"分片内容"Tab 中，长分片正文会完整展示，不再被固定行数截断。

### 2026-08-26 支持读取 MinerU 结果压缩包正文
- 新增：
  - `server/package.json`、`server/package-lock.json`（后端显式引入 `jszip`，用于读取 MinerU 结果压缩包）
- 修改：
  - `server/src/mineru-configs/mineru-configs.service.ts`（MinerU 查询结果识别 `full_zip_url` 等结果包地址，正文为空时下载 zip 并提取 `.md/.markdown/.txt` 内容）
- 删除：无
- 说明：当 MinerU 查询接口只返回 `full_zip_url` 而不直接返回正文时，后端会自动读取结果包中的 Markdown/TXT 文件作为解析正文，避免"解析完成但内容为空"。

### 2026-08-26 MinerU 空正文异常返回原始 JSON
- 新增：无
- 修改：
  - `server/src/knowledge-bases/knowledge-bases.service.ts`（MinerU 返回成功但解析正文为空时，将第三方原始响应序列化后追加到异常消息和处理结果）
- 删除：无
- 说明：当列表出现"MinerU 解析结果缺少解析正文"时，处理结果会同步带出 MinerU 返回 JSON 摘要，方便判断是返回格式不匹配还是第三方未返回正文。

### 2026-08-26 调整知识库列表处理结果列
- 新增：无
- 修改：
  - `web/src/views/knowledge-base/Index.vue`（将"处理结果"列提前到名称后方，并固定宽度为 250px）
- 删除：无
- 说明：解析失败或第三方返回异常时，列表更容易第一时间看到处理结果；列宽固定后不会因长错误信息撑开表格。

### 2026-08-26 兼容 MinerU 纯文本解析结果
- 新增：无
- 修改：
  - `server/src/mineru-configs/mineru-configs.service.ts`（MinerU 查询结果正文识别补充纯文本、OCR 文本、嵌套文档/分页等字段）
  - `server/src/knowledge-bases/knowledge-bases.service.ts`（保存知识库解析正文前拦截空内容，并将错误写入处理结果）
- 删除：无
- 说明：当 OCR 功能配置选择纯文本返回时，后端会把 `text/plainText/ocrText/resultText/contentText` 等字段归一为解析正文；若第三方成功状态下仍未返回正文，将明确报"解析结果缺少解析正文"，避免页面显示空白内容。

### 2026-08-26 MinerU 解析改由 OCR 功能配置驱动
- 新增：无
- 修改：
  - `server/src/knowledge-bases/knowledge-bases.module.ts`（知识库模块引入 AI 功能配置模块）
  - `server/src/knowledge-bases/knowledge-bases.service.ts`（MinerU 解析、查询和重启恢复先读取已启用的 OCR 功能配置，再使用其绑定的 MinerU 配置创建/查询任务）
- 删除：无
- 说明：知识库第三方解析不再直接依赖全局启用的 MinerU 配置；后台需启用一条"功能类型 = OCR、OCR 引擎 = MinerU"的 AI 功能配置，并在其中选择 MinerU 配置，解析日志会记录 OCR 功能配置与实际 MinerU 配置，便于排查。

### 2026-08-26 兼容 MinerU 查询响应结构
- 新增：无
- 修改：
  - `server/src/mineru-configs/mineru-configs.service.ts`（MinerU 查询任务结果兼容 `data/result/task/payload` 等嵌套结构，并识别 `state/task_status/msg/md_content` 等字段）
  - `server/src/knowledge-bases/knowledge-bases.service.ts`（MinerU 查询进度日志追加 `rawSummary` 原始响应摘要，便于排查第三方返回结构）
- 删除：无
- 说明：当 MinerU 查询接口返回空 `status/progress/message` 时，后端日志会额外记录原始响应摘要，用于确认任务是否仍在处理、已成功或返回了非预期结构。

### 2026-08-26 增加知识库解析任务文件日志
- 新增：
  - `server/src/knowledge-bases/knowledge-task-file-logger.service.ts`（写入 `logs/knowledge-tasks.log`，用于排查解析任务提交、执行、MinerU 进度与结果）
- 修改：
  - `server/src/knowledge-bases/knowledge-bases.module.ts`（注册知识库任务文件日志服务）
  - `server/src/knowledge-bases/knowledge-bases.service.ts`（Base 解析、文档解析、MinerU 任务创建、轮询进度、成功/失败与恢复任务均写入本地日志）
- 删除：无
- 说明：日志采用一行一条 JSON 的格式，文件位于后端运行目录 `logs/knowledge-tasks.log`；仅记录任务 ID、知识库/文档 ID、文件名、状态、进度、内容长度和错误信息，不写入解析正文。

### 2026-08-26 后端回写 MinerU 解析进度与异步任务日志
- 新增：无
- 修改：
  - `server/src/mineru-configs/mineru-configs.service.ts`（MinerU 等待结果支持进度回调，保留原有 `configId` 调用兼容）
  - `server/src/knowledge-bases/knowledge-bases.service.ts`（MinerU 解析轮询期间持续回写知识库主表与文档处理结果；服务重启后自动恢复带任务 ID 的解析中文档）
  - `server/src/task-queue/task-queue.service.ts`（异步任务提交、执行中、成功、失败均按日志配置写入内部操作日志）
  - `server/src/log-records/log-api-scanner.ts`、`server/src/log-records/log-records.service.ts`（日志扫描源补充文档处理异步任务提交/执行中动作，并保留内部任务真实状态）
- 删除：无
- 说明：知识库列表不再只能看到"任务已创建"，后端轮询 MinerU 时会同步更新进度/消息；日志模块勾选"文档处理异步任务"后，可查看任务提交、执行中和最终结果记录；重启服务后，历史"解析中"的 MinerU 任务会根据已落库任务 ID 继续查询并落最终状态。

### 2026-08-26 操作日志支持内部动作记录
- 新增：无
- 修改：
  - `server/src/log-records/`（日志扫描源追加内部动作：异步任务、知识库处理、大模型调用；日志服务新增内部动作记录能力）
  - `server/src/task-queue/`（异步任务执行成功/失败按配置写入操作日志）
  - `server/src/knowledge-bases/`（手动解析、MinerU 解析、分片、索引成功/失败按配置写入操作日志）
  - `server/src/knowledge-ai-providers/`（非聊天的大模型调用：视觉 OCR、向量化，按配置写入操作日志）
  - `web/src/views/log-record/Index.vue`（日志列表新增"结果"列，用于查看内部动作成功/失败）
- 删除：无
- 说明：日志配置弹窗中会出现"异步任务""知识库处理""大模型调用"等非业务 Controller 模块，勾选后对应后台过程的成功/失败也会落入日志记录。

### 2026-08-26 后端接管知识库解析状态回写
- 新增：无
- 修改：
  - `server/src/knowledge-bases/knowledge-bases.service.ts`（Base 级 MinerU 解析创建第三方任务后，后端立即回写任务 ID 到知识库主表和对应文档；成功/失败由队列执行过程落最终状态）
  - `web/src/views/knowledge-base/Index.vue`（移除任务提交后的前端 3 秒轮询，页面只负责提交任务和读取列表状态）
- 删除：无
- 说明：知识库解析状态以服务端任务执行结果为准，前端不再承担轮询调度职责；刷新页面或重新进入列表时，展示的都是后端已经落库的处理阶段和结果。

### 2026-08-26 知识库处理任务自动刷新
- 新增：无
- 修改：
  - `web/src/views/knowledge-base/Index.vue`（解析、分片、索引任务提交后轮询知识库详情并刷新列表，直到处理阶段退出处理中）
- 删除：无
- 说明：后端处理任务进入内存队列后会异步更新知识库主表状态；前端原来只在提交后刷新一次，容易停留在"解析中"。本次改为任务提交后自动刷新状态，完成或失败时同步提示处理结果。

### 2026-08-26 优化 MinerU 配置复用
- 新增：无
- 修改：
  - `server/src/knowledge-bases/knowledge-bases.service.ts`（Base 级 MinerU 解析移除重复启用配置读取，轮询时复用创建任务返回的 `configId`）
- 删除：无
- 说明：`createParseTask` 统一负责选择和校验 MinerU 配置，`waitForSuccess` 使用同一配置查询任务，避免同一次解析中重复读取启用配置或中途切换配置。

### 2026-08-25 收口知识库检索辅助字段表达
- 新增：无
- 修改：
  - `web/src/views/knowledge-base/Edit.vue`、`web/src/views/knowledge-base/View.vue`（将"口语化描述"改为"口语化说法"，并在输入占位中明确仅用于检索匹配）
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
  - `web/src/api/knowledgeAiChat.ts`、`web/src/views/knowledge-ai-record/Index.vue`（问答记录列表新增"命中知识库"列）
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
  - 知识库详情抽屉"索引内容"Tab（支持搜索、分页、查看实际写入向量库的索引文本）
- 修改：无
- 删除：无
- 说明：索引内容展示的是后端向量化前拼装的文本，便于确认命中关键字、口语化描述、来源与正文是否真正进入知识库检索链路。

### 2026-08-24 禁用 Chroma 默认向量函数
- 新增：无
- 修改：
  - `server/src/knowledge-vectors/knowledge-vector.service.ts`（获取或创建 Chroma Collection 时显式设置 `embeddingFunction: null`）
- 删除：无
- 说明：本项目由后端先调用大模型账号生成 embedding，再把向量数组写入 Chroma；不需要 Chroma JS 客户端加载 `@chroma-core/default-embed`，避免索引时报 "Cannot instantiate a collection with the DefaultEmbeddingFunction"。

### 2026-08-24 向量化配置支持维度设置
- 新增：
  - `vector_configs.embeddingDimension`（向量维度，默认 768，可在向量化配置页调整）
- 修改：
  - `server/src/vector-configs/`（向量化配置保存、读取和环境兜底均返回维度配置）
  - `server/src/knowledge-vectors/knowledge-embedding.service.ts`、`server/src/knowledge-ai-providers/knowledge-ai-providers.service.ts`（向量化调用时传入配置维度；阿里云 Qwen 文本向量按配置写入 `dimensions`，不再写死 1024）
  - `web/src/api/vectorConfig.ts`、`web/src/views/vector-config/Index.vue`（向量化配置表单增加"向量维度"数字输入，默认 768，并提示 Chroma Collection 维度固定）
- 删除：无
- 说明：向量模型、向量维度和 Chroma Collection 必须一致；切换模型或维度时建议更换 Collection 名或清空旧集合后重新索引。

### 2026-08-24 大模型账号密钥支持掩码回显
- 新增：无
- 修改：
  - `server/src/knowledge-ai-providers/knowledge-ai-providers.service.ts`（账号详情返回 `secretKeyMasked` 掩码，不返回完整密钥）
  - `web/src/api/knowledgeAiProvider.ts`、`web/src/views/knowledge-ai-provider/Edit.vue`（编辑账号时密钥显示星号掩码；保持掩码不变不提交密钥，输入新值才覆盖保存；密钥框使用普通文本输入并关闭浏览器自动完成）
  - `web/src/components/Form.vue`（普通输入和多行输入支持透传 `componentProps`）
- 删除：无
- 说明：避免密钥编辑框空白造成"是否已保存"不明确，同时避开浏览器密码记忆对配置表单的干扰。

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
- 说明：知识库当前是"文本分片 → 文本向量化"链路，`qwen3-vl-embedding` 等多模态模型不能直接用于本流程；阿里云等供应商的 embedding 批量限制也在调用层统一处理。

### 2026-08-24 将向量模型选择并入向量化配置
- 新增：
  - `vector_configs.providerId/providerName/model`（向量化配置直接绑定大模型账号和向量模型）
- 修改：
  - `server/src/vector-configs/`（保存当前向量化配置时校验并保存大模型账号、向量模型；可用配置返回模型绑定信息）
  - `server/src/knowledge-vectors/knowledge-embedding.service.ts`（向量生成改为读取向量化配置中的账号和模型，不再依赖 AI 功能配置的 embedding 记录）
  - `server/src/knowledge-vectors/knowledge-vectors.module.ts`（移除不再需要的 AI 功能配置模块依赖）
  - `web/src/api/vectorConfig.ts`、`web/src/views/vector-config/Index.vue`（向量化配置表单增加大模型账号和向量模型下拉；模型列表读取所选账号的向量模型列表）
- 删除：无
- 说明：分片配置只负责切分规则；向量化配置负责"选择向量模型 + 配置 Chroma 存储"，形成完整索引配置。

### 2026-08-24 明确向量模型配置与 Chroma 配置职责
- 新增：无
- 修改：
  - `server/src/knowledge-vectors/knowledge-embedding.service.ts`（向量生成阶段将变量与错误提示明确为"AI 功能配置 - 向量化"，避免和 Chroma 向量库配置混淆）
  - `web/src/views/vector-config/Index.vue`（向量化配置页展示当前启用的向量模型功能配置状态）
  - `CHANGELOG.md`（追加本次变更快照）
- 删除：无
- 说明：知识库索引需要同时具备"向量模型配置"和"Chroma 存储配置"；前者在 AI 功能配置中启用，后者在向量化配置中维护。

### 2026-08-24 收敛向量化配置单例读写逻辑
- 新增：
  - `GET /api/vector-configs/current`、`POST /api/vector-configs/current`（当前向量化配置读取与保存接口）
- 修改：
  - `server/src/vector-configs/vector-configs.service.ts`（向量化配置按单例表单处理，保存当前配置时清理其它旧配置；可用配置读取时保留最新启用项）
  - `server/src/vector-configs/vector-configs.controller.ts`（新增当前配置接口）
  - `server/src/ai-feature-configs/ai-feature-configs.service.ts`（同一 AI 功能类型只保留一个启用配置，`findEnabledByFeature` 自动收敛历史多启用数据）
  - `web/src/api/vectorConfig.ts`、`web/src/views/vector-config/Index.vue`（向量化配置页改为直接读写当前配置接口）
- 删除：无
- 说明：后端同步适配"向量化配置为单份表单"的产品形态，避免仍按列表多配置逻辑读取导致历史多启用或取最新记录的不确定性。

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
  - `server/src/menus/menus.service.ts`（系统配置下新增"向量化配置"菜单）
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
  - `知识库处理流程.md`（新增"下一阶段执行计划：手动分片到真实向量索引"，明确分片排序、来源信息、向量字段、hash、索引任务、embedding 配置、向量库写入、检索接入、前端配合和验收标准）
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
  - `AGENTS.md`（Agent 工作规则第 7 条由"默认自动提交"改为"强制自动提交（必做项）"：每次改动完成后必须自动 git commit 并填写描述改动的 commit message，仅用户明确要求"不提交"时才可跳过）
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
- 说明：大内容进入手动分片时，画布和坐标层需要一次初始化；现在首帧完成前会明确提示"原文画布准备中"，避免用户过早拖拽导致无效操作。

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
- 说明：页面显示"手动 / MinerU/自动"，内部字段使用 `manual / auto`；手动分片的重叠值用于保存入库时补充核心选区前后文，不影响左侧核心选区锁定。

### 2026-08-21 手动分片补充上下文重叠
- 新增：无
- 修改：
  - `server/src/knowledge-bases/entities/knowledge-base-chunk.entity.ts`（分片增加核心内容与手动坐标元数据，用于区分"核心选区"和"入库上下文"）
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
  - `web/src/views/knowledge-base/View.vue`（去掉手动分片区域的"保存分片"按钮，生成分片、删除分片和修改分片标题后自动调用保存接口；同步失败时回滚前端分片列表）
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
- 说明：知识库新增/编辑中的"匹配优先级"字段使用 `InputNumber`，修复后可正常输入数字。已执行 `web` 的 `npm.cmd run type-check`，通过。

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
- 说明：视觉上从"字符网格表"调整为"文本选择面板"，减少模糊和视觉负担，保留底层字符坐标与分片保存逻辑。已执行 `web` 的 `npm.cmd run type-check`，通过。

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
  - `server/src/document-parsers/parsers/word-document.parser.ts`（手动解析 `.docx` 时直接从 HTML 转文本，将超链接以括号形式追加到对应词句后，不再额外生成"链接语句块"）
  - `CHANGELOG.md`（追加本次 Word 链接内联解析快照）
- 删除：无
- 说明：链接会输出为 `申请价保（链接：https://...）` 这类形式，方便手动分片时按原句选择并保存链接上下文；同时对 Word 超链接字段中的冗余 URL/标记做了清洗。已执行 `server` 的 `npm.cmd run build`，通过。

### 2026-08-20 手动分片左右对照与 Word 链接块提取
- 新增：无
- 修改：
  - `web/src/views/knowledge-base/View.vue`（手动分片编辑改为左侧原文网格、右侧已生成片段的对照布局，保存分片按钮归入片段栏）
  - `server/src/document-parsers/parsers/word-document.parser.ts`（手动解析 `.docx` 时同步提取超链接所在语句块，并在解析正文末尾追加"链接语句块"区域）
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
- 说明：Canvas 方案减少长文档场景下的大量 DOM 节点，解决点击"手动分片"后界面可能无明显变化或渲染迟滞的问题；保存时仍复用已有手动覆盖分片接口。已执行 `web` 的 `npm.cmd run type-check` 与 `server` 的 `npm.cmd run build`，均通过。

### 2026-08-20 优化手动分片为网格坐标选择
- 新增：无
- 修改：
  - `web/src/views/knowledge-base/View.vue`（手动分片改为固定 80 列字符网格，支持点击字符格设置起止坐标、按坐标范围生成分片、查看坐标和分片预览）
  - `server/src/knowledge-bases/knowledge-bases.service.ts`（手动覆盖分片时保留坐标范围内的正文原文，仅用空白裁剪判断是否为空，避免保存时改变分片边界）
  - `CHANGELOG.md`（追加本次手动分片网格坐标交互快照）
- 删除：无
- 说明：手动分片不再通过自由 textarea 直接编辑正文，改为网格化内容选择，便于后续扩展"划到某行某列"的坐标表达。已执行 `server` 的 `npm.cmd run build` 与 `web` 的 `npm.cmd run type-check`，均通过。

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
  - `server/src/menus/menus.service.ts`、`web/src/router/index.ts`（知识库管理下新增"分片配置"菜单/路由）
  - `web/src/api/knowledgeBase.ts`、`web/src/views/knowledge-base/View.vue`（知识库详情内容页支持载入解析正文、编辑分片并保存覆盖）
- 删除：无
- 说明：分片规则从检索配置中独立出来，作为知识库构建阶段配置。系统自动分片读取该配置，手动分片由用户在详情页按正文划分。已执行 `server` 的 `npm.cmd run build` 与 `web` 的 `npm.cmd run type-check`，均通过。

### 2026-08-20 修正聊天应用检索配置回显误导
- 新增：无
- 修改：
  - `web/src/views/external-app/Edit.vue`（编辑已有聊天应用时，知识库检索配置按数据库真实值回显；不再因系统只有一条检索配置而自动显示为已绑定）
  - `CHANGELOG.md`（追加本次聊天应用检索配置回显修正快照）
- 删除：无
- 说明：此前编辑已有聊天应用时，如果数据库 `retrievalConfigId` 为 `NULL` 且系统只有一条检索配置，前端会自动回显这条配置，造成"看起来已绑定但接口返回 `retrievalConfigId:null`"的误判。已执行 `web` 的 `npm.cmd run type-check`，通过。

### 2026-08-20 收紧 AI 流式问答知识库约束
- 新增：无
- 修改：
  - `server/src/knowledge-ai-chat/knowledge-ai-chat.service.ts`（绑定知识库检索配置时，即使命中为空也不再裸问题调用模型；流式接口新增 `retrieval` 事件暴露本次检索是否命中参考资料）
  - `web/src/api/knowledgeAiChat.ts`（补充 `retrieval` SSE 事件类型）
  - `CHANGELOG.md`（追加本次知识库问答约束修正快照）
- 删除：无
- 说明：此前检索配置存在但未命中内容时，会退回原始问题，导致大模型按外部常识回答。现在只要启用知识库检索配置，模型就会被明确约束只能依据知识库；未命中时应回答"知识库中未找到相关内容，无法确认"。已执行 `server` 的 `npm.cmd run build` 与 `web` 的 `npm.cmd run type-check`，均通过。

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
  - `web/src/views/ai-feature-config/Edit.vue`（聊天类型模型下拉改为合并账号"模型列表"和"文本模型"；OCR/向量化/文档解析也按"功能专属模型 + 通用模型列表"合并去重）
  - `CHANGELOG.md`（追加本次模型下拉来源修正快照）
- 删除：无
- 说明：此前聊天类型只要账号维护了"文本模型"，就不会读取通用"模型列表"，导致阿里云账号可选模型只剩少量文本模型。现在通用模型池不会被专属模型字段覆盖。已执行 `web` 的 `npm.cmd run type-check`，通过。

### 2026-08-20 新增知识库检索配置模块
- 新增：
  - `server/src/knowledge-retrieval-configs/`（知识库检索配置 Entity/DTO/Service/Controller/Module）
  - `web/src/api/knowledgeRetrievalConfig.ts`（检索配置前端接口）
  - `web/src/views/knowledge-retrieval-config/Index.vue`（检索配置列表页）
  - `web/src/views/knowledge-retrieval-config/Edit.vue`（检索配置新增/编辑弹窗）
- 修改：
  - `server/src/app.module.ts`（注册知识库检索配置模块）
  - `server/src/menus/menus.service.ts`（聊天管理下新增"知识库检索配置"二级菜单）
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
  - `server/src/knowledge-bases/knowledge-bases.service.ts`（文档解析队列执行时立即回写"正在解析"状态，创建 MinerU 任务后记录任务 ID；修复异步解析未 `await` 导致失败不能写回文档状态的问题）
  - `CHANGELOG.md`（追加本次 MinerU 文档解析状态修复快照）
- 删除：无
- 说明：修复知识库文档选择 MinerU 解析后，列表长期停留在"任务已提交，等待执行"的问题。已执行 `server` 的 `npm.cmd run build`，通过。

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
  - `web/src/views/ai-feature-config/Index.vue`（功能类型筛选增加"向量化"）
  - `web/src/views/ai-feature-config/Edit.vue`（模型下拉按功能类型读取账号内对应模型：聊天取文本、OCR 取视觉、文档解析合并视觉/文本、向量化取向量模型）
  - `CHANGELOG.md`（追加本次 AI 功能配置模型匹配快照）
- 删除：无
- 说明：分片本身不依赖向量模型，后续索引/向量入库阶段才需要 embedding 模型，因此独立为"向量化"功能配置。已执行 `server` 的 `npm.cmd run build` 与 `web` 的 `npm.cmd run type-check`，均通过。

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
  - `server/src/knowledge-ai-chat/knowledge-ai-chat.service.ts`（聊天初始化、普通问答和流式问答优先读取"聊天"功能配置）
  - `server/src/menus/menus.service.ts`（聊天管理下新增"AI 功能配置"菜单）
  - `web/src/router/index.ts`（新增"AI 功能配置"路由）
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
  - `server/src/menus/menus.service.ts`（新增"聊天管理"一级菜单，挂载 AI 问答测试、聊天应用、问答记录，并迁移旧聊天菜单）
  - `web/src/router/index.ts`（新增聊天管理路由和聊天应用页面路由）
  - `CHANGELOG.md`（追加本次聊天管理菜单快照）
- 删除：无
- 说明：聊天相关入口从系统配置中拆到"聊天管理"目录；旧 AI 问答测试/问题记录菜单会迁移到新目录，问题记录重命名为问答记录。已执行 `server` 的 `npm.cmd run build` 与 `web` 的 `npm.cmd run type-check`，均通过。

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
- 说明：`assertSupportedDocumentFile` 仍只负责校验文件扩展名；调用方会在校验失败时把错误写入文档 `description`，前端"处理结果"列可见。已执行 `server` 的 `npm.cmd run build`，通过。

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
- 说明：解析任务失败原因会回写到业务数据中，列表刷新后可直接在"处理结果"列查看。已执行 `server` 的 `npm.cmd run build` 与 `web` 的 `npm.cmd run type-check`，均通过。

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
- 说明：菜单管理可挂载"知识库文档"页面；文档列表解析操作会将 `manual` / `mineru` 模式传给后端统一接口。已执行 `server` 的 `npm.cmd run build` 与 `web` 的 `npm.cmd run type-check`，均通过。

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
  - `web/src/views/knowledge-base/Edit.vue`（知识库新增/编辑表单重设为"基础信息 + 内容配置"两段）
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
- 说明：已移除"洗车/充值/知识库"等业务干扰提示，测试表单只用于验证模型是否正常响应；已执行 `server` 的 `npm.cmd run build` 与 `web` 的 `npm.cmd run type-check`，均通过。

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
- 说明：模板文件选择后只展示已选文件，点击移除后恢复拖拽上传；上传后自动按已勾选导入字段生成"模板字段 → 系统字段"映射，支持保存前调整。已执行 `server` 的 `npm.cmd run build` 与 `web` 的 `npm.cmd run type-check`，均通过。

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
- 说明：日志统计配置从"只勾选模块"升级为"勾选模块下具体 API"，支持按查看/新增/编辑/删除/批量删除粒度决定是否纳入日志记录；兼容旧的模块启用配置，旧配置会默认启用该模块全部日志动作。已执行 `server` 的 `npm.cmd run build` 与 `web` 的 `npm.cmd run type-check`，均通过。

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
  - `web/src/views/log-record/Index.vue`（恢复日志表列表，并将"配置"改为模块勾选弹窗）
  - `CHANGELOG.md`（追加本次功能快照）
- 删除：无
- 说明：日志记录页列表数据改为读取 `log_records` 表；配置弹窗保存被勾选模块到 `log_module_configs`，后续日志采集可按该配置判断是否纳入统计。已执行 `server` 的 `npm.cmd run build` 和 `web` 的 `npm.cmd run type-check`，均通过。

### 2026-08-03 收敛日志记录和数据导入入口
- 新增：无
- 修改：
  - `web/src/views/log-record/Index.vue`（移除模块字段下拉与字段列表，仅保留"配置"按钮）
  - `web/src/views/data-import/Index.vue`（移除模块字段下拉与字段列表，仅保留"配置"按钮）
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
  - `web/src/views/role/*`、`web/src/views/permission/*`、`web/src/api/role.ts`、`web/src/api/permission.ts`（角色授权树按"菜单模块 × 基础权限动作"生成，权限管理移除描述字段）
  - `web/src/stores/user.ts`、`web/src/components/ProTable.vue`、`web/src/views/menu/Index.vue`（前端权限判断改为只认完整权限码；菜单分配权限保存时按菜单模块组合完整码）
- 删除：无
- 说明：按"权限管理维护基础权限类型集合，角色负责菜单关联并保存完整权限"的模型重整 RBAC 数据流；描述字段在角色/权限业务表单与元数据中不再使用。已执行 `web` 的 `npm.cmd run type-check`、`npm.cmd run build`，以及 `server` 的 `npm.cmd run build`，均通过；前端构建仅有第三方库 Rollup 注释警告。

### 2026-08-02 系统配置新增日志记录和数据导入入口
- 新增：
  - `web/src/api/moduleModel.ts`（封装模块模型列表、详情、字段列表接口）
  - `web/src/views/log-record/Index.vue`（日志记录系统配置入口，复用模块字段元数据做模块筛选与字段预览）
  - `web/src/views/data-import/Index.vue`（数据导入系统配置入口，复用模块字段元数据做导入字段预览）
- 修改：
  - `server/src/menus/menus.service.ts`（系统配置 seed 追加"日志记录""数据导入"两个子菜单）
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
  - `web/src/layouts/MainLayout.vue`（补齐 `.el-sub-menu__title` 的常规、hover、active/open 样式，使"系统配置"等父级菜单符合 `.design-spec.md` 侧边栏配色规范）
  - `CHANGELOG.md`（追加本次样式修复快照）
- 删除：无
- 说明：修复系统配置父级菜单使用 Element Plus 默认标题样式导致背景色、字体色与侧边栏设计规范不一致的问题。本次仅前端样式调整，执行前端类型检查验证。

### 2026-08-02 系统配置 Tab 拆为子菜单
- 新增：
  - `web/src/views/system/AiModel.vue`（AI 大模型账号独立菜单页）
  - `web/src/views/system/Wechat.vue`（微信 / 小程序独立菜单页）
- 修改：
  - `server/src/menus/menus.service.ts`（系统配置 seed 改为父级菜单，并新增"配置菜单 / AI 大模型账号 / 微信 / 小程序"三个子菜单；seed 支持按 `parentPath` 挂载父子关系）
  - `web/src/router/index.ts`（`/system-config` 改为重定向，新增三个系统配置子路由）
  - `web/src/views/system/Index.vue`（移除 tabs，保留为"配置菜单"独立页面）
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
  - `web/src/views/user/Edit.vue`（用户新增/编辑表单的状态与超级管理员字段改为统一使用 `1/0`，确保下拉能正确回显"启用/禁用""是/否"）
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
- 说明：修复系统配置将"角色管理"等菜单设为系统固定后，角色授权弹窗仍可分配该菜单权限的问题。本次仅前端授权入口修复，执行 `web` 类型检查验证。

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
  - `AGENTS.md`（Agent 工作规则新增"自动提交"：AI 完成代码或文档改动并通过约定验证后，默认仅暂存本次 AI 修改文件并创建 git commit；用户明确要求不提交时跳过）
  - `CHANGELOG.md`（追加本次规则变更快照）
- 删除：无
- 说明：固化后续协作规则，避免自动提交混入工作区已有未提交改动。本次仅文档规则调整，未 build、未启动服务。

### 2026-07-29 移除角色授权未分组权限
- 新增：无
- 修改：
  - `web/src/views/role/Edit.vue`（角色授权树移除"未分组权限"兜底节点；不再读取权限管理列表作为展示数据源；权限中文名称改为组件内置动作映射，授权树只展示菜单 `permissionCode` 拆出的权限叶子）
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
  - `web/src/views/menu/Index.vue`（菜单名称列固定为 150px；权限码列按权限名称中文显示，多权限用顿号分隔，空值显示"登录可见"）
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
  - `web/src/views/menu/Index.vue`（菜单操作按钮权限判断兼容 `Menu.action` 与纯动作码 `action`，确保"分配权限"等按钮在当前权限体系下正常展示）
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
  - `web/src/views/menu/Index.vue`（菜单表格新增勾选列；工具栏新增"分配权限"按钮；勾选菜单后可批量维护 `permissionCode`，支持选择现有权限码或清空为登录可见；保存后刷新菜单表格与侧边栏菜单缓存）
- 删除：无
- 说明：菜单管理页增加批量分配菜单可见权限入口，前端只负责选择与提交，后端仍由菜单更新接口统一校验。已执行 `web` 的 `npm.cmd run type-check` 与 `server` 的 `npx.cmd tsc --noEmit -p tsconfig.json`，均通过；未 build、未启动服务。

### 2026-07-29 锁定菜单改为后端管理员校验
- 新增：无
- 修改：
  - `server/src/menus/menus.controller.ts`（菜单创建、更新、删除接口注入当前用户，将 `isAdmin` 传入 service）
  - `server/src/menus/menus.service.ts`（锁定菜单相关创建/移动/更新/删除统一在后端校验管理员身份；非管理员操作锁定菜单返回 403；启动 seed 不再强制恢复核心菜单系统固定状态）
  - `web/src/views/menu/Index.vue`（移除核心菜单加子级/删除按钮隐藏，前端操作入口一律按普通权限展示）
  - `web/src/views/menu/Edit.vue`（移除核心菜单系统固定开关禁用与强制提交，编辑表单前端不再做锁定菜单限制）
  - `web/src/views/system/Index.vue`（配置菜单开关不再禁用核心菜单，移除"核心菜单锁定"提示，说明文案改为后端按管理员身份校验）
- 删除：无
- 说明：锁定菜单的操作限制从前端迁到后端 API，前端按钮和开关全部放开；已执行 `web` 的 `npm.cmd run type-check` 与 `server` 的 `npx.cmd tsc --noEmit -p tsconfig.json`，均通过；未 build、未启动服务。

### 2026-07-29 菜单管理支持编辑名称与路由
- 新增：无
- 修改：
  - `web/src/views/menu/Index.vue`（核心菜单开放编辑入口；核心菜单仍禁止加子级和删除；路由列文案改为"路由地址"；新增/编辑/删除成功后同步刷新侧边栏菜单缓存）
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
