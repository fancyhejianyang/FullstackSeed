# ComfyUI 本机工作流接入设计方案

> 状态：待确认方案，未实现业务代码。日期：2026-10-19。
>
> 目标：在 FullstackSeed 中选择经过验证的 ComfyUI 工作流，生成图片或视频，查看真实任务进度，并将结果归档到受管存储。

## 1. 建议结论

将 ComfyUI 作为独立的媒体执行服务接入，不伪装成 OpenAI 图片模型，也不调用 Agent。管理员在 ComfyUI 中维护图形工作流，在本系统导入 API 格式工作流并绑定可开放的参数；普通用户只填写提示词、选定参数和输入图片。

采用三个相互独立的管理对象：连接配置、工作流模板、运行任务。业务端以异步提交和查询为主；后端通过 HTTP 提交与取结果，通过 WebSocket 接收节点事件，再把统一进度提供给前端。

首期支持一个连接、一份已验证的文生图工作流；第二阶段增加一份明确的视频工作流及视频归档。不要一开始承诺执行任意网上下载的工作流、自动安装插件或在系统里重造 ComfyUI 画布。

文件归档复用 [AI 素材方案](./AI素材生成与存储清理设计方案.md)的文件登记与清理机制，但使用 `comfyui` 专用 scope。ComfyUI 运行任务保留各次结果，不自动覆盖其它任务；将来从“素材重新生成”调用它时，才遵循素材版本替换规则。

## 2. 首先确认后端在哪里运行

`127.0.0.1` 指发出请求的进程所在机器，不是打开网页的用户电脑。

| 部署方式                                         | 建议连接方式                                 | 关键边界                                                              |
| ------------------------------------------------ | -------------------------------------------- | --------------------------------------------------------------------- |
| NestJS 与 ComfyUI 在同一台电脑、同一网络命名空间 | NestJS 直接访问管理员配置的本机地址          | 最小落地方案，ComfyUI 默认端口常见为 8188，但应以实际安装为准         |
| NestJS 在 Docker/WSL，ComfyUI 在 Windows 主机    | 显式配置宿主机可达地址并做防火墙限制         | 容器的 localhost 不是 Windows 主机，不自动放行任意内网地址            |
| NestJS 在服务器，ComfyUI 在个人电脑              | 本机连接器主动连接服务器，或已有受控专用网络 | 服务器不能直接通过自身 localhost 找到用户电脑；不要把 8188 裸露到公网 |

官方自托管服务说明了本机 HTTP 服务及可配置端口，适合作为直连基线。[ComfyUI Server Overview](https://docs.comfy.org/development/comfyui-server/comms_overview)

当前仓库没有 ComfyUI 连接配置或执行适配器。本方案不假定用户已安装哪个版本、插件或视频模型；落地前须确认部署位置、ComfyUI 版本、GPU/显存、两份可正常执行的工作流及模型依赖。若后端在远端，本机连接器是前置需求，不应在后期才补。

### 2.1 同机直连结构

```text
管理后台
  → NestJS 鉴权、参数校验、任务入库
  → ComfyUI 适配器（HTTP + WebSocket）
  → 本机 ComfyUI 执行工作流
  → 输出校验和文件归档
  → 受管存储、本系统任务详情
```

浏览器不直接访问 ComfyUI。这样不需要把 ComfyUI 的端口、文件目录或全局任务队列暴露给普通用户，也避免浏览器跨域、本地网络访问限制和页面关闭后断掉业务处理。

### 2.2 远端后端与本机连接器

若采用远端部署，连接器仅负责执行已经授权的任务，不是任意命令执行工具：

- 首次配对使用短期配对码，换取可撤销、绑定用户和设备的凭据；持续使用 HTTPS/WSS 出站连接。
- 服务端持久化 `deviceId/jobId/attemptId`，分发任务时领取租约；连接器将接单记录和 `promptId` 写入本地持久日志，回执丢失后先对账，不直接重投。
- 连接器只允许访问配置过的本机 ComfyUI 地址，以及对应的专用输入、输出目录；禁止任意 URL、任意磁盘路径、Shell 命令与插件安装指令。
- 结果通过带任务范围与大小限制的上传票据或鉴权流式接口回传，不能给连接器完整 OSS AccessKey。
- 设备离线、系统睡眠和网络断线显示为连接异常；不会立刻宣称 ComfyUI 已停止，恢复后查询原任务。
- 普通用户只操作授权设备及自己提交的任务；不能看整个设备上的其他用户工作流。

连接器应独立部署、显式授权启动，避免在本次方案阶段安装、启动本地常驻进程。

## 3. 当前代码可复用与不可直接套用部分

| 当前实现                                                                           | 结论                                                                                                               |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `server/src/ai-workflows/` 与 `knowledge-retrieval-configs/workflow-definition.ts` | 现有工作流包含问答、检索、重排、回答等受控节点，不是 ComfyUI 节点图；保留不动，另建 `ComfyWorkflow`                |
| `knowledge-ai-providers` 的 `openai/dashscope` 图片协议                            | 面向云端同步生图，不支持 `/prompt`、节点事件和视频输出；ComfyUI 另建连接配置，不加入该协议枚举硬套                 |
| `content-generation.service.ts`                                                    | 可参考 MySQL 任务、幂等、版本快照和条件抢占；其 120 秒请求、150 秒租约以及文章串行逻辑不能直接用于长视频           |
| `common/ai/image-utils.ts`                                                         | 当前下载只接受公网 HTTPS，限制 10 MiB，并且只识别图片；不能为访问本机放宽它，另建仅允许已配置地址的 ComfyUI 传输层 |
| `uploads.service.ts`                                                               | 当前以完整 Buffer 上传，视频可能大得多；归档层需新增受限流式上传、磁盘临时文件与分片失败清理                       |
| `web/src/utils/request.ts`                                                         | 普通请求默认 15 秒，适合任务提交与状态查询，不适合等视频完成；不得通过全局拉长超时实现同步等待                     |
| `web/src/api/knowledgeAiChat.ts`                                                   | 有手动读取 SSE 的思路可参考，但使用 appid 的客服鉴权不能直接复制为管理员任务鉴权                                   |
| 菜单、第三方配置与公共组件                                                         | 复用第三方概览、Table/Form/Dialog/Button、JWT/权限守卫；新连接配置和运行记录分别授权                               |

当前后端依赖没有专业分布式队列或直接声明的 WebSocket 客户端。首期可以使用 MySQL 持久化调度；WebSocket 使用实际 Node 运行版本支持的客户端或显式增加受维护依赖，不能依赖偶然存在的传递依赖。

## 4. 功能入口和配置

### 4.1 第三方配置中的 ComfyUI 连接

新增“第三方配置 → ComfyUI”，权限前缀 `ComfyConnection`。常用字段仅名称、连接方式、地址或已配对设备、启用状态；高级项放在折叠区。

高级配置包括：允许的用户/角色、最大并发、排队时限、执行时限、归档时限、代理鉴权引用、工作流白名单和输出限制。普通使用者不需要输入任何端口或 Token。

直连地址受部署侧允许的主机/IP 与端口约束，默认只允许明确配置的本机目标；需要宿主机或专网地址时逐项加入允许列表，不把整个内网开放给请求。客户端固定基址和允许的路由，拒绝 URL 用户信息、任意跳转及请求中的端点覆盖；域名解析后验证并固定目标地址，避免 DNS 变化绕过限制。代理认证仅送给绑定端点，不能进入任务快照、前端返回或公开媒体。

“测试连接”只执行有限只读探测：服务信息、节点定义与能力，不提交生成任务。“测试工作流”则是真实执行，必须由用户明确触发，并提示 GPU 占用及可能存在的付费 API 节点。

记录实际服务版本和能力探测结果，不仅记录地址能否访问。新版本能力先进入适配配置，再启用，不能通过向真实任务发送取消请求来探测接口是否存在。

### 4.2 AI 功能配置中的 ComfyUI 工作流

新增独立“ComfyUI 工作流”入口，可作为现有 AI 配置分组的新页面，不与问答“AI 工作流”的数据库或画布合并。

管理员维护：名称、连接、输出类型（图片/视频）、API 工作流文件、参数映射、输出节点映射、依赖说明、启用状态。工作流修改生成新版本，运行任务绑定具体版本，后续编辑不影响已排队任务。

普通用户从已发布工作流选项中选择，只读接口返回名称、输出类型、参数 schema 和运行条件，不返回地址、凭据、未审查的节点图或其他用户文件路径。

### 4.3 内容创作中的工作流生成

新增“内容创作 → 工作流生成”，一个页面提供“发起生成”和任务列表，暂不建立通用全站任务中心。

发起生成只显示选中工作流开放的字段，通常是提示词、风格、尺寸档位和输入图片；种子、步数、视频帧数等放高级区。工作流未开放的参数不能由请求附加。

列表显示类型、工作流、状态、当前阶段、耗时和创建时间；大 JSON、完整节点信息和输出清单在详情。图片放大预览，视频用播放器，不自动播放；所有输出可下载。已关闭详情停止前端订阅，后台任务继续。

## 5. 工作流导入与受控参数

### 5.1 只接 API 格式

导入从 ComfyUI 导出的 API 执行 JSON，不是带画布布局、连线和 widgets 的普通 UI 保存 JSON。执行图以节点 ID 为键，包含 `class_type` 与 `inputs`；官方示例也是这种结构。[官方 WebSocket API 示例](https://github.com/Comfy-Org/ComfyUI/blob/master/script_examples/websockets_api_example.py)

首期不自动转换未知 UI 工作流。若格式错误，明确提示重新导出；子图、前端专用节点、自定义节点只有在导出图和当前服务实际兼容后才能启用。

### 5.2 映射而不是任意改 JSON

管理员将业务字段映射到具体节点输入。例如：

| 业务字段           | 映射示例                         | 服务端规则                                      |
| ------------------ | -------------------------------- | ----------------------------------------------- |
| `prompt`           | 节点 6 的 `inputs.text`          | 字符串和长度上限；这里只是示例节点 ID           |
| `negativePrompt`   | 节点 7 的 `inputs.text`          | 可选，只有工作流支持时开放                      |
| `seed`             | 节点 3 的 `inputs.seed`          | 固定或随机；随机值提交前生成并记录              |
| `sizePreset`       | 同时映射宽、高两个输入           | 受控档位，不允许输入任意巨大尺寸                |
| `inputImageFileId` | LoadImage 节点输入               | 校验本人受管文件，上传到 ComfyUI 后绑定回执名称 |
| `frames/fps`       | 已验证的视频节点输入             | 范围及组合校验，不能只检查各自为正数            |
| 输出前缀           | SaveImage/SaveVideo 的文件名前缀 | 强制服务端设置为本任务专用目录，用户不可改      |

映射可绑定多个输入，但限制节点、输入名、类型和范围；禁止 JavaScript 表达式、模板 eval、任意 JSON Patch 和修改节点类型。UI 用 Form schema 渲染，后端用同一份发布版本再次校验，前端隐藏不等于后端安全。

重新生成默认创建新任务并换随机种子；固定种子用于尽量复现，但模型、节点版本、硬件差异仍可能影响结果。不得要求每次重复请求必然不同，也不能把从缓存获得结果解释成没有执行。

### 5.3 发布前校验

校验节点数量/JSON 大小、映射位置、必需输入、输出节点、当前模型文件是否存在，并与 `/object_info` 返回定义比对。保存依赖清单和经过验证的服务版本；缺模型或节点时在提交前拒绝。

导入文件不自动安装自定义节点、下载 checkpoint、执行脚本或启用付费节点。节点本质上可以运行 Python，参数校验不是沙盒；只允许管理员发布可信工作流，运行机器采用专用低权限账号与受控目录。

工作流 JSON 不存 API 密钥。确需第三方 API 节点时，单独设计服务端凭据注入和费用提示；首期仅支持已审查的本地执行节点。

## 6. ComfyUI 接口和版本差异

### 6.1 基线接口

| 接口                                               | 本系统用途                                                     |
| -------------------------------------------------- | -------------------------------------------------------------- |
| `GET /system_stats`                                | 服务/GPU 信息及版本线索                                        |
| `GET /object_info` 或 `/object_info/{node_class}`  | 节点输入与模型选项校验，限制响应体并缓存                       |
| `WS /ws?clientId=...`                              | 接收执行与进度事件                                             |
| `POST /prompt`                                     | 提交执行图，取得 `prompt_id`；验证失败处理 `error/node_errors` |
| `GET /queue`                                       | 对账排队与运行状态，不把完整共享队列发给浏览器                 |
| `GET /history/{prompt_id}`                         | 核实终态和获取输出清单                                         |
| `GET /view?filename=...&subfolder=...&type=output` | 由后端读取该任务产生的输出                                     |
| `POST /upload/image`                               | 给图生图或图生视频上传受控输入图片                             |
| `POST /queue`                                      | 旧版按指定 ID 移除排队任务，禁止全量 clear                     |

这些接口是自托管服务契约，不使用 Comfy Cloud 的域名、鉴权或计费接口。[官方服务路由](https://docs.comfy.org/development/comfyui-server/comms_routes)

后端先建立 WebSocket，再提交；关联 `clientId` 与真实 `promptId`。不能把 `clientId` 当任务 ID 或授权凭据，也不能因为 `/prompt` 接受请求就将任务标记成功。

### 6.2 新能力不能假定本机已经具备

本次查阅的官方 `master` 已有客户端传入 `prompt_id`、`/api/jobs` 及按任务取消接口，旧版可能没有。`POST /prompt` 的入队序号也不是持续有效的排队名次。[官方 server.py](https://github.com/Comfy-Org/ComfyUI/blob/master/server.py)

实施时按实际安装版本建立能力表：`supportsClientPromptId`、`supportsJobsApi`、`supportsAtomicCancel`、`outputAdapters`。保存验证依据和版本，禁止因为最新源码有某字段就直接给旧版本发送控制请求。

即使版本接受客户端 `prompt_id`，也不代表重复提交自动幂等；系统仍需持久化提交记录，不能依赖相同 UUID 重发来避免重复生成。

### 6.3 取消任务的安全边界

- 尚未送到 ComfyUI：只取消本系统队列中的任务。
- 已排队：优先使用已验证的按 ID 取消能力；兼容旧版时只删除当前用户绑定的 `promptId`，随后重新对账。如果已开始执行，不能谎报取消成功。
- 正在执行：优先使用经验证的原子按 ID 取消接口。当前上游对应实现会检查实际运行任务，降低误停下一个任务的竞态风险。[官方任务取消逻辑](https://github.com/Comfy-Org/ComfyUI/blob/master/comfy_execution/jobs.py)、[队列原子中断逻辑](https://github.com/Comfy-Org/ComfyUI/blob/master/execution.py)
- 旧版只有全局 `/interrupt`，或只有无法确认原子性的“查询再中断”：共享实例中禁用普通用户的运行中取消。专用实例才可在明确授权和独占控制下启用；不静默降级为全局中断。
- 发出取消请求后显示“取消中”，以终态事件/历史核实结果；成功已先完成时按实际完成处理，不篡改为未生成。

不提供清空整个队列、清空整个历史或卸载全部模型给普通用户，也不使用取消请求进行自动健康检查。

## 7. 任务持久化与恢复

### 7.1 状态流程

```text
pending → submitting → queued → running → archiving → succeeded
                      ↘ failed / cancelled / interrupted
submitting 结果不确定 → unknown → 对账恢复，不能自动重新提交
任意执行阶段连接断开 → connectivity=disconnected，保留执行状态并重连
```

`archiving` 表示 ComfyUI 已生成结果，但系统尚未完成文件归档。归档失败记录独立 `archiveStatus=failed` 和错误，可只重试下载/上传，不重新运行工作流。界面不能把“本地生成成功，上传失败”说成“生图失败请重跑”。

租约失效表示某个本系统 worker 不再持有观察权，不表示 ComfyUI 已停止。新 worker 首先按 `promptId` 对账，不能领取到旧任务后再发一次 `/prompt`。

### 7.2 至少一次网络传输不等于只执行一次

提交前先保存 `requestId`、`attemptId`、工作流版本、参数快照、`clientId` 和提交意图；内部以 `userId+requestId` 唯一，同请求重放返回原任务。

拿到响应后立刻持久化 `promptId`。响应丢失时利用已保存的任务标记、专用输出目录以及被版本支持的客户端 ID 对账。如果不能确定是否已经入队，进入 `unknown`，不自动重投。只读查询可退避重试，可能生成资源的 POST 不盲目重试。

在传统队列实现中，历史保存在进程内并有容量限制，不能当永久任务数据库；输出文件保存在磁盘不意味着内存历史仍可查询。本系统必须持久化摘要、事件状态和输出描述。[官方 PromptQueue 实现](https://github.com/Comfy-Org/ComfyUI/blob/master/execution.py)

服务重启后优先恢复有 `promptId` 的任务；若 ComfyUI 同时重启且队列/历史均无记录，标记中断或结果待核实，不以“查不到”推断从未执行。需要读取本机目录恢复输出时，必须走受限连接器/归档器，并按本任务目录和清单验证。

### 7.3 并发和时限

每个连接首期最多派发一个运行任务，并限制提交到 ComfyUI 的在途任务数量；其他任务留在 MySQL 队列。多实例部署需数据库连接级调度租约和 fencing token，不能只靠进程变量实现“单并发”。

分别配置连接超时、查询超时、排队时限、执行时限、归档时限和 worker 心跳。图片与视频可用不同执行时限，由实际工作流测量确定；不得把视频运行时间限制为现有文章任务的 120 秒。

长节点没有进度事件不等于死机。定期查询队列与服务状态；超过策略时限先标记超时待核实或申请安全取消，尚未确认远端终止前不释放连接槽并派发下一任务。

## 8. 如何展示真实进度

| 收到的事件或状态              | 用户界面                                      | 不能做的推断                             |
| ----------------------------- | --------------------------------------------- | ---------------------------------------- |
| 本系统等待派发                | 等待设备/系统排队                             | 不能当作已进入 ComfyUI 队列              |
| `execution_start`             | 开始执行                                      | 不说明模型已加载完成                     |
| `executing`                   | 当前节点或映射后的阶段                        | 节点切换不是等权的全程百分比             |
| `progress(value,max)`         | 当前节点步骤，如采样 12/30                    | 不将 40% 标成整项任务 40%                |
| `execution_cached`            | 部分节点复用缓存                              | 不要求所有节点重新执行                   |
| `executed`                    | 某输出节点有 UI 数据                          | 不是每个节点都有此事件，不代表全流程完成 |
| 成功事件/节点结束信号         | 核对历史并进入归档                            | 不能省略输出校验就显示最终成功           |
| `execution_error/interrupted` | 安全错误摘要/中断                             | 不把堆栈、路径、输入和秘密原样返回       |
| 无进度钩子的编码或上传        | 编码中/归档中、已用时；可用时显示真实字节进度 | 不按时间模拟 99%                         |

事件含义以官方 WebSocket 文档为基线，尤其是 `executed` 只在节点返回 UI 更新时产生。[官方消息定义](https://docs.comfy.org/development/comfyui-server/comms_messages)

任务存 `currentNodeId`、显示阶段、`progressValue/progressMax`、`lastEventAt`、开始时间；缺少有效分母时不显示百分比。`status` 中的队列总数不是本任务前面的人数；只有取得可靠队列位置时才展示排位。

后端对事件按连接、`promptId`、worker 代次归属处理，忽略旧 worker 和不相关任务；旧版事件缺少任务标识时，仅可在已确认的专属活动连接上下文解释，不能广播猜测。二进制预览首期可忽略，避免大量临时帧落库。

前端第一版每 2～3 秒读取本系统任务摘要即可，后端仍实时接收 ComfyUI 事件。需要更及时更新时增加 SSE：使用带 Bearer 的 fetch 流，处理登录失效、取消订阅、心跳和代理缓冲；断线先读最新快照，再恢复流。不要把长期 Token 放进 EventSource URL，也不能直接复用客服 appid 鉴权。

## 9. 图片和视频输出

### 9.1 输出适配按节点和版本登记

图片首期只支持已验证的 SaveImage 输出；视频首期只支持已验证的 SaveVideo 工作流。VHS_VideoCombine 等自定义节点如确有需求，另加独立输出适配器和样例测试，不自动把任意 `gifs/videos/images` 字段全部当可信文件。

一个容易踩坑的地方是：当前上游 SaveVideo 使用 `PreviewVideo`，其 UI 数据可能仍放在 `images` 字段并标记动画，而不是一定叫 `videos`。因此不能仅按 JSON 键判断媒体类型，要结合发布模板的输出节点、文件类型与实际内容验证。[SaveVideo 源码](https://github.com/Comfy-Org/ComfyUI/blob/master/comfy_extras/nodes_video.py)、[PreviewVideo 数据定义](https://github.com/Comfy-Org/ComfyUI/blob/master/comfy_api/latest/_ui.py)

统一输出描述：`fileId, kind, mimeType, size, width, height, durationMs, thumbnailFileId`。任务绑定输出列表与主输出，不把一个工作流多输出误判成多个独立任务。

### 9.2 归档流程

1. 从本任务的成功历史中提取发布模板允许的输出节点。
2. 校验 filename/subfolder/type，必须位于本任务专用输出前缀；拒绝绝对路径、跨盘、目录穿越和任意 URL。
3. 由受控 ComfyUI 客户端从已绑定端点下载，限定重定向、请求路径、字节数、文件数和总大小，不转发服务密钥到陌生地址。
4. 校验文件类型，必要时用受限 ffprobe 检查视频容器、编码、时长和分辨率；临时文件名由系统生成，不把用户输入拼成 Shell 命令。
5. 流式存储到 `uploads/comfyui/{environment}/outputs/{userId}/{taskId}/{fileId}.ext`，登记文件引用后完成任务。
6. 仅记录必要的结果元信息；清理临时下载文件和中断分片，归档失败允许只重试这一阶段。

不能把现有 10 MiB 图片 Buffer 路径直接用于视频。图片仍保持限额；视频文件数、单文件/总字节数、时长与分辨率按工作流配置和机器能力确定，读流时强制执行，不能只相信 Content-Length。

网页预览优先选择已验证可播放的 MP4/H.264 配置，是否支持该编码由当前工作流和本机依赖决定。不兼容格式先提供下载及说明，不在首次预览时偷偷进行高成本转码；必须转码时作为独立归档阶段记录，并验证 Range 请求、Content-Type、缩略图与 CDN 视频访问。

ComfyUI 可能把工作流和提示词写进图片/视频元数据。归档到公开存储前应按策略移除业务敏感元数据或验证输出已禁用元数据；不向工作流输入秘密，也不能只在页面隐藏信息就当文件中没有信息。[SaveVideo 文档](https://docs.comfy.org/built-in-nodes/SaveVideo)

### 9.3 本机文件与云端文件分别清理

强制输出前缀为 `fullstackseed/{environment}/{connectionId}/{taskId}/...`，输入也使用本任务专用子目录，禁止污染 ComfyUI 默认公共输出目录。归档验收成功前保留本地输出；建议归档成功后保留一段可配置缓冲期再清理，失败时保留以便恢复。

删除 ComfyUI 历史条目不等于删除磁盘文件。基线 HTTP 调用不承担本方案的按业务目录安全清理；需由同机受限文件适配器或连接器执行精确文件清理。只能处理清单登记过、路径校验通过的任务文件，不能扫描删除模型、插件、用户工作流或其它手动生成图片。

如果服务器仅通过 HTTP 直连而没有受控磁盘访问，首期明确保留本地结果、提示手动清理，不虚构已释放本机空间。云端归档删除另走 ManagedFiles 引用与延迟清理；两边状态分别显示。

## 10. 拟议数据模型和接口

| 实体与表名                                         | 主要字段                                                                                                                                                                                                                                              | 说明                                                       |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `ComfyConnection` / `comfy_connections`            | `name, mode, baseUrl/deviceId, credentialRef, isEnabled, allowedRoles, capabilities, limits`                                                                                                                                                          | 地址仅管理员配置；记录版本及能力验证，不向业务选项返回凭据 |
| `ComfyWorkflow` / `comfy_workflows`                | `name, connectionId, outputKind, currentVersionId, isEnabled`                                                                                                                                                                                         | 工作流目录                                                 |
| `ComfyWorkflowVersion` / `comfy_workflow_versions` | `workflowId, revision, apiGraph, parameterSchema, inputBindings, outputBindings, dependencyManifest, digest`                                                                                                                                          | 已发布内容不可原地修改，任务可追溯                         |
| `ComfyTask` / `comfy_tasks`                        | `userId, connectionId, workflowVersionId, requestId, attemptId, clientId, promptId, status, connectivity, archiveStatus, parameterSnapshot, progressValue, progressMax, currentNodeId, workerId, leaseExpiresAt, fencingToken, timestamps, errorCode` | 幂等、对账和真实进度；列表不读取图 JSON 与参数快照         |
| `ComfyTaskOutput` / `comfy_task_outputs`           | `taskId, nodeId, ordinal, remoteDescriptor, fileId, thumbnailFileId, kind, archiveStatus`                                                                                                                                                             | 一个任务多个输出；记录每个文件归档结果，支持断点恢复       |

复用 `managed_files/managed_file_references`。连接器部署才增加设备、配对凭据和本地执行日志，不把远端设备管理强加给同机最小版。

统一 camelCase，API 层把上游 `prompt_id` 映射为 `promptId`，向上游请求时仍使用其准确字段名。建议唯一约束包括 `userId+requestId`、非空 `connectionId+promptId`、`taskId+nodeId+ordinal`；worker 领取和结果写回都带代次条件。

| 接口                                      | 作用与权限                                                                        |
| ----------------------------------------- | --------------------------------------------------------------------------------- |
| `/api/comfy-connections` CRUD             | 连接管理，`ComfyConnection.read/create/update/delete/batchDelete`                 |
| `POST /api/comfy-connections/:id/check`   | 有界只读连接测试；`ComfyConnection.read`，地址必须来自已授权配置                  |
| `/api/comfy-workflows` CRUD 与版本发布    | 模板管理，`ComfyWorkflow` 标准五动作权限；发布使用 update，不能绕过依赖校验       |
| `GET /api/comfy-tasks/workflow-options`   | 当前用户可运行模板及 schema，`ComfyTask.read`                                     |
| `POST /api/comfy-tasks`                   | `{workflowVersionId, parameters, requestId}`，快速返回任务 ID，`ComfyTask.create` |
| `GET /api/comfy-tasks`、`/:id`            | 本人列表和详情，`ComfyTask.read`                                                  |
| `GET /api/comfy-tasks/:id/events`         | 可选的鉴权 SSE 进度，`ComfyTask.read`                                             |
| `POST /api/comfy-tasks/:id/cancel`        | 本人任务、能力允许才取消，`ComfyTask.update`                                      |
| `POST /api/comfy-tasks/:id/retry-archive` | 只重试归档，不重跑 GPU，`ComfyTask.update`                                        |
| `DELETE /api/comfy-tasks/:id`             | 终态任务软删并按引用安排文件清理，`ComfyTask.delete`                              |

批量删除只处理终态且授权的任务，不带出批量生成或清空设备队列。运行任务不因前端关闭、刷新或删除按钮被隐式取消。

连接使用权、模板读取权与任务创建权都应在服务端校验。新模块权限补到 `users.service.ts`、菜单 seed 与路由；分组权限聚合、无权限首个页面重定向及第三方概览同步更新，不能只增加一条路由。

## 11. 实现目录和步骤

建议新增 `server/src/comfy-connections/`、`comfy-workflows/`、`comfy-tasks/`，CRUD 按 demo 复制；`server/src/common/comfyui/` 放客户端与版本/输出适配，不放业务权限判断。前端对应 `views/comfy-connection/`、`comfy-workflow/`、`comfy-task/` 与 API 文件，继续使用项目组件。

### 阶段一 接入准备

确认同机/远端、ComfyUI 版本及依赖，获取一份文生图和一份视频的 API 工作流，先在 ComfyUI 本身验证可运行。定义允许的节点与模型、路径前缀、资源上限，明确输出归档到本地还是 OSS。

只读探测不得自动执行工作流。实际验证会占 GPU 或可能调用付费 API，安排明确的测试任务。

### 阶段二 图片最小闭环

完成连接、工作流导入/参数映射、异步提交、WebSocket 事件归属、队列/历史对账、图片归档及任务列表。前端先轮询本系统状态；旧版运行中取消默认不开放。

重点验证连接丢失、提交回执丢失、进程重启和重复点击。此阶段不依赖视频，不改文章服务，也不要求 Redis。

### 阶段三 视频支持

增加一个明确的视频模板、对应输出适配、长任务租约续期、流式归档、真实编码阶段、播放/下载和本地空间清理。视频失败不自动改用图片模型，不自动缩减参数重新生成。

按实测配置帧数、分辨率、时长及文件上限；GPU 显存不足时保留安全错误，提示调整参数，不宣称所有工作流都能运行。

### 阶段四 体验和扩展

按需要增加 SSE、受控实时预览、更多模板/输出节点、素材生成引擎选择。若后端在远端，本机连接器应提前到阶段二之前完成；它不是同机最小版的必选复杂度。

后续可让素材模块通过统一接口选择云端生图或某份 ComfyUI 图片模板，但保持不同配置和执行适配器。文章自动封面仍按用户既定规则走同账号云端模型，不擅自切到本机 GPU。

## 12. 必须覆盖的验收场景

| 场景                                    | 预期                                                           |
| --------------------------------------- | -------------------------------------------------------------- |
| 错误格式、缺节点、模型不存在、过大参数  | 提交前或上游校验时清楚拒绝，不反复重跑                         |
| 连续点击和请求重放                      | 一份内部任务；回执不明先对账，不自动第二次执行                 |
| WebSocket 断开但 ComfyUI 继续运行       | 连接状态变化，轮询核实并重连，不误判失败                       |
| NestJS 重启、ComfyUI 重启或电脑休眠     | 根据持久任务和实际远端状态恢复或标记中断，不复制执行           |
| 执行结束消息先到、历史稍晚可见          | 有界重查历史，不提前失败或重复提交                             |
| 缓存节点、无 progress 的节点            | 展示实际阶段，不虚构全程百分比                                 |
| 多用户共享队列与取消竞态                | 不能查看、取消或下载别人的任务；老版本不回退全局中断           |
| 新 worker 接管，旧 worker 迟到          | fencing/version 条件阻止旧响应覆盖                             |
| 视频输出、多个输出、未知自定义输出      | 已验证适配器正常归档；未知结构明确报不支持                     |
| OSS 上传失败、视频过大、磁盘满          | 区分生成与归档状态，只重试归档且不再次运行 GPU                 |
| 下载路径穿越、恶意 URL/节点图、嵌入秘密 | 在配置/模板/传输/文件校验边界拒绝，不输出敏感日志              |
| 删除任务和清理                          | 只处理登记文件；历史删除不冒充磁盘释放；模型和手工输出不受影响 |

真实端到端测试需使用用户确认的本机版本、模板和测试目录；静态类型检查或模拟事件测试不能替代这一步。

## 13. 开工前最少确认项

1. ComfyUI 与 NestJS 是否同机，是否经过 Docker/WSL；远端时选择连接器还是既有专网。
2. 本机 ComfyUI 版本和可访问地址，是否为共享实例。
3. GPU/显存及可实际运行的图片、视频 API 工作流文件；尤其视频使用原生 SaveVideo 还是自定义输出节点。
4. 生成结果默认公开还是私有；沿用当前公开 OSS 时不放私密素材。
5. 本机与云端的保留期、磁盘/存储配额，以及是否允许管理员执行真实清理。

推荐顺序是先完成素材方案中的受管文件基础，再完成同机 ComfyUI 图片闭环，随后加视频。若确定后端远端部署，则先把设备连接与断线恢复设计落地，再接工作流执行。
