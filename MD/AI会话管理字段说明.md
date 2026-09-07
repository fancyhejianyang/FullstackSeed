# AI 会话管理字段说明

本文说明 AI 聊天会话如何保存连续对话、知识库命中结果，以及下一轮提问如何读取这些信息。

## 1. 会话模块

一次连续对话对应一个 `sessionId`。首次提问时创建会话，后续提问携带相同的 `sessionId`，系统才能读取上一轮问题、历史消息和知识库检索状态。

### 会话主记录

| 字段 | 说明 |
| --- | --- |
| `id` | 会话唯一 ID，即前端请求使用的 `sessionId` |
| `title` | 会话标题，默认取首个问题 |
| `providerId` / `providerName` / `model` | 本会话使用的 AI 服务商和模型 |
| `messageCount` | 当前会话的消息数量 |
| `lastQuestion` / `lastAnswer` | 最近一轮用户问题和 AI 回答 |
| `isSuccess` / `errorMessage` / `elapsedMilliseconds` | 最近一轮调用的结果、失败原因和耗时 |

## 2. 知识库上下文状态

会话除了保存普通聊天内容，还保存最近一次知识库检索状态。

| 字段 | 说明 |
| --- | --- |
| `activeKnowledgeBaseId` | 当前优先沿用的单一知识库；无法确定唯一知识库时为空 |
| `lastRetrievalQuery` | 最近一次实际用于检索的问题；追问时可补全语义 |
| `lastRetrievalAt` | 最近一次检索时间，用于判断知识库上下文是否过期 |
| `hitKnowledgeBaseNames` | 最近一轮实际命中的知识库名称 |

检索配置中的 `sessionContextTimeoutMinutes` 控制有效期，默认 15 分钟：

- 有效期内，未明确换知识库的追问优先沿用 `activeKnowledgeBaseId`。
- 配置为 `0` 或已经超时，本轮按独立问题重新检索。
- 明确点名新学校/知识库、询问知识库清单，或旧库无合格命中时，不继续锁定旧库。

## 3. 每轮消息记录

每次问答都会保存一条消息明细，用于回放、排障和查看本轮真实命中情况。

| 字段 | 说明 |
| --- | --- |
| `sessionId` | 所属会话 ID |
| `question` / `answer` | 本轮用户问题和 AI 回答 |
| `retrievalQuery` | 本轮实际用于检索的查询文本 |
| `hitKnowledgeBaseIds` / `hitKnowledgeBaseNames` | 本轮实际命中的知识库 |
| `hitChunkIds` | 本轮引用的知识库分片 |
| `retrievalHits` | 命中明细及检索、重排得分 |
| `rerankApplied` | 本轮是否实际采用重排结果 |
| `isSuccess` / `errorMessage` / `elapsedMilliseconds` | 本轮调用结果、失败原因和耗时 |

## 4. 一轮 AI 问答如何读写

```text
用户提问（携带 sessionId）
  ↓
读取会话主记录和最近历史消息
  ↓
读取活动知识库、最近检索问题和检索时间
  ↓
决定沿用旧库、切换新库或全范围检索
  ↓
检索分片并组织为本轮知识库参考资料
  ↓
调用 AI 模型生成回答
  ↓
保存消息命中明细，更新会话的最近问题、答案和检索状态
```

只有本轮实际选出合格分片时，知识库才会成为新的活动知识库。若沿用旧库没有命中，系统会用当前问题在全范围重新检索，避免一直停留在错误知识库。

## 5. 使用边界

- 相同 `sessionId`：可复用聊天历史和知识库上下文。
- 新建会话或未携带原 `sessionId`：按新问题处理，不带入旧知识库。
- 聊天历史与知识库路由是两套状态：历史用于理解对话，知识库状态用于决定本轮在哪个范围检索。
