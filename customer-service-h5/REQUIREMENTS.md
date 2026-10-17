# REQUIREMENTS.md

AI 客服服务（H5）功能需求。

> 仓库说明：本项目作为 FullstackSeed 的 `customer-service-h5/` 子目录维护，不保留独立 `.git`。当前正式接待入口、服务端接口、会话凭证、排队和人工接手规则以 [`RECEPTION.md`](RECEPTION.md) 为准；下方旧版需求仅保留为最初页面范围记录。

## 项目形态

- 单个 H5 页面：客服聊天页面
- 交互参考 QQ / 微信的常规聊天界面

## 功能需求

### 聊天

- 消息展示区：区分用户消息与客服消息（气泡样式）
- 输入框 + 发送按钮，支持回车发送
- 新聊天：清空当前会话并开始新会话

### 历史会话（本地持久化）

- 所有会话记录（含 `sessionId`、消息列表、标题、时间）实时保存到浏览器 `localStorage`
- 顶部栏历史按钮打开右侧抽屉，列出历史会话（标题、时间、消息数）
- 点击历史会话可恢复完整消息并**继续对话**（沿用原 `sessionId`）
- 支持单条删除；刷新页面不丢失

### 后端对接（已对接）

- 服务地址：`http://localhost:4000`
- 会话创建：`POST /api/knowledge-ai-chat/sessions/init`
- 流式问答：`POST /api/knowledge-ai-chat/ask/stream`（SSE，`text/event-stream`）
- 接口调用集中在 `js/api.js`，对接细节见文件头注释
- 接口不可用时自动降级为本地 mock 流式输出（回复带"（本地演示）"前缀）
- **鉴权方式**：无需用户登录；后端基于 `appid` + 请求来源域名（domain）校验，不匹配则拒绝。domain 由 API 自动从请求来源获取，前端无需传递，上线只需使用分配给该项目的真实 appid
