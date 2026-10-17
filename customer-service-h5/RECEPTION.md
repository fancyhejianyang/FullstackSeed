# 正式客服接待（2026-10-09）

## 本次范围

正式入口使用 `receptionApi.js`、`receptionStore.js`、`reception.js` 与 `reception.css`，保留旧演示代码及原样式，避免覆盖既有未提交改动。此文档中的接口约定覆盖旧 `REQUIREMENTS.md`、`OVERVIEW.md` 中有关直接问答、刷新创建新会话以及 mock 降级的描述。

- 应用并发满额时显示 AI 排队与前方人数，释放名额后自动处理。
- 访客可主动转人工，排队会话也可被后台客服接手；等待人工期间不再自动调用 AI。
- 人工接入显示客服姓名，允许连续发送消息；等待人工可返回 AI，但不会重放之前被取消的问题。
- 接待结束后为只读，点击新聊天另建会话。
- 接口错误明确显示并允许重试，不生成假会话、不输出模拟回复。

## 接口与配置

在 `js/receptionApi.js` 配置 `baseUrl` 与 `appid`。模型、系统提示词由应用绑定的服务端配置决定。

所有接口携带 `appid`；除了初始化，其余接口还需 `x-session-token`。凭证仅在创建时返回，不放进 URL 或日志。正式部署需要 HTTPS，并在服务端允许 H5 来源及相应请求头。

| 方法 | 路径（前缀 `/api/customer-service`） | 用途 |
| --- | --- | --- |
| POST | `/sessions/init` | 返回 `sessionId` 和 `sessionToken` |
| GET | `/sessions/:id` | 最新 200 条消息及接待快照 |
| GET | `/sessions/:id?beforeMessageId=…` | 获取更早 200 条，合并去重 |
| POST | `/sessions/:id/messages` | `{ clientMessageId, content }` |
| POST | `/sessions/:id/handoff` | 请求人工；撤销 AI 等待/执行 |
| POST | `/sessions/:id/resume-ai` | 等待人工时返回 AI |
| POST | `/sessions/:id/cancel` | 取消当前 AI 任务 |
| GET | `/sessions/:id/events` | 会话级 SSE，含 `snapshot` / `ai-event` |

消息提交后的响应仅表示服务端已接收，最终答案以快照为准；订阅 EOF 不代表问答完成。网络失败后相同内容通过同一个 `clientMessageId` 重试，不重复入队。

## 本地存储与会话隔离

- 应用地址与 appid 组成独立 `localStorage` 键，最多缓存 50 个会话、每个最近 200 条消息。
- 当前会话保存在 `sessionStorage`；刷新恢复当前接待，显式新聊天创建新会话。通过历史列表可恢复持有凭证的记录。
- 旧版 `aiChatSessions_v1` 记录只能本地只读，不能凭旧 `sessionId` 向服务端认领。
- 浏览器复制标签页可能复制 `sessionStorage`，这是继续当前会话；独立打开页面无当前会话时创建新会话。应用级历史在同源同浏览器下共享，不属于跨用户登录隔离。
- 凭证是匿名会话访问能力，请不要共享本地存储或在公共设备保留敏感聊天；删除历史只移除本地缓存，不会删除后台审计记录。
- SSE 自动退避重连；先获取服务端快照补齐消息，再继续订阅。接待状态优先比较 `serviceVersion`，HTTP 期间收到更晚的 SSE 时仅合并旧响应的不可变消息，避免同秒接手后旧响应回退到 AI。切换会话后丢弃旧异步回调，不会把旧答案写入新会话。

## 验证

静态验证使用 `node --check js/receptionApi.js`、`node --check js/receptionStore.js`、`node --check js/reception.js`。协议层无第三方依赖，可通过 Node 内置测试运行 `node --test --test-isolation=none tests/reception.test.cjs`（在禁止子进程的 Windows 沙箱中也可执行）。联调需启动对应后端，覆盖满额排队、人工接手、断线恢复与刷新；本次前端编码不自动启动服务。
