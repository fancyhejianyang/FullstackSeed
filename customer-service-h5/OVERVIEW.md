# AI 客服 H5 — 设计与接口规范（转线上交付稿）

> 本文档 + 项目代码可直接交给 AI，生成线上可用的真实客服页面。
> 项目为**纯 H5（原生 HTML+CSS+JS），零框架零第三方库**，HTML/CSS/JS 严格分离。

---

## 1. 文件结构

```
ai-customer-service/
├── index.html        # 唯一页面：客服聊天页（三段式：header / 消息流 / 输入栏）
├── css/style.css     # 样式（设计令牌 + 组件样式）
├── js/api.js         # API 层：接口调用 + SSE 流式解析 + 本地降级
├── js/store.js       # 本地会话存储（localStorage，含 sessionId）
├── js/app.js         # 页面逻辑：渲染 / 发送 / 历史
├── AGENTS.md         # 工程规范约束
├── REQUIREMENTS.md   # 功能需求
└── .design-spec.md   # 设计令牌（颜色 / 字体 / 图标 / 组件 / 动效）
```

加载顺序：`index.html` 末尾按 `api.js → store.js → app.js` 顺序引入（不可调换）。

---

## 2. 设计与界面

- **风格**：Ultra-Minimalism 超极简 + Tech 科技感，深色背景
- **配色**（CSS 变量，见 `.design-spec.md`）：
  - 背景 `#0B0F14`、卡片 `#141A22`
  - 主色青蓝 `#38BDF8`（用户气泡/发送按钮/光标），点缀 `#22D3EE`
  - 主文字 `#F1F5F9`、次要 `#94A3B8`、分隔线 `rgba(255,255,255,0.08)`
- **布局**：顶栏（毛玻璃 + Logo/标题/在线状态/历史/新聊天按钮） + 消息流（滚动） + 底栏（输入框 + 发送）
- **移动端**：`viewport-fit=cover`、`env(safe-area-inset-*)` 安全区适配
- **交互**：
  - 用户气泡右（青蓝渐变）、客服气泡左（深色+机器人头像+昵称行显示 SID）
  - 流式"打字机"逐字输出 + 闪烁光标；发送前三点"正在输入"动画
  - 回车发送、Shift+回车换行；发送按钮空输入时禁用
  - 右上角时钟图标打开**历史抽屉**：恢复对话（沿用 sessionId）/ 单条删除
- **图标**：全部内联 SVG，细线 `stroke-width:1.5`（气泡Logo、机器人头像、加号、时钟、纸飞机、垃圾桶）
- **动效**：消息入场上移淡入、光标闪烁 0.8s、三点跳动 1.2s、抽屉滑入 0.28s

### 关键 DOM 锚点（重构时注意保留）
- `#message-list` 消息流容器
- `#chat-input` 输入框、`#btn-send` 发送、`#btn-new-chat` 新聊天、`#btn-history` 历史
- `#history-mask` / `#history-panel` / `#history-list` 历史抽屉
- 流式消息结构：`.msg.msg-ai > .msg-avatar + .msg-body(.msg-name + .bubble.ai-bubble + .msg-time)`，光标为 `.typing-cursor`

---

## 3. 接口规范

### 3.1 创建会话
每次"新聊天"调用，获取 `sessionId`。

```
POST {baseUrl}/api/knowledge-ai-chat/sessions/init
Content-Type: application/json
appid: <appid>          ← 应用 ID（请求头，与 body 一致）
Body: { "appid": "<appid>" }
```
响应提取 `sessionId`（兼容 `sessionId / session_id / sid / id / data` 包裹结构）。
> 当前 `js/api.js` 中 `CONFIG.appid`，上线前替换真实值。

### 3.2 流式问答
发送消息时调用，SSE 流式返回。

```
POST {baseUrl}/api/knowledge-ai-chat/ask/stream
Content-Type: application/json
Accept: text/event-stream
appid: <appid>                        ← 请求头
```
Body：
```json
{
  "question": "用户问题",
  "sessionId": 123,
  "model": "qwen-plus",
  "systemPrompt": "你是一个简洁、准确的中文助手",
  "title": "AI 客服会话"
}
```
- **无需登录**：接口不校验用户登录态
- **身份与来源校验**：后端基于 `appid` + 请求来源域名（domain）校验，不匹配则拒绝。domain 由 API 自动从请求来源获取，**前端无需也不应手动传递**；上线时只需使用分配给该项目的真实 `appid` 即可
- 前端用 `fetch + ReadableStream` 逐行解析 `data:` 事件
- 文本提取兼容：`content / delta / text / message / answer`，及 OpenAI `choices[].delta.content`
- 结束标记：`[DONE]`
- 接口失败自动降级本地 mock 流式（回复带"（本地演示）"前缀）

### 3.3 配置项（js/api.js → CONFIG，转线上需改）
| 字段 | 当前值 | 说明 |
|---|---|---|
| `baseUrl` | `http://localhost:4000` | 改生产环境地址（由后端做 domain 校验，前端无需传 domain） |
| `appid` | `"1"` | ask/stream 头 | **必替换为分配给该项目的真实值**
| `model` | `"qwen-plus"` | 模型 |
| `systemPrompt` | 固定串 | 业务可改 |

---

## 4. 本地存储（历史会话）

- `localStorage` key：`aiChatSessions_v1`
- 结构：`{ sessions: [{ sessionId, title, createdAt, updatedAt, messages:[{role,content,time}] }] }`
- 每次消息收发实时 `upsert`，最近更新置顶；最多 50 条
- `js/store.js` 暴露：`loadAll / get / upsert / remove`

---

## 5. 运行方式

浏览器直接打开 `index.html`（服务需启动在 `localhost:4000`）。无需登录，身份校验由后端的 `appid` + 来源域名（API 自动获取）完成。

---

## 6. 转线上 Checklist

- [ ] 替换 `CONFIG.baseUrl` 为生产环境地址（注意跨域 CORS 配置）
- [ ] 替换 `appid` 为分配给该项目的真实值
- [ ] 注：domain 由 API 自动从请求来源获取，前端无需传递
- [ ] 确认 SSE 响应字段与 `extractText` 兼容（不一致则扩展）
- [ ] 视业务调整 `model` / `systemPrompt`
- [ ] 生产环境关闭本地 mock 降级（或保留作兜底）
