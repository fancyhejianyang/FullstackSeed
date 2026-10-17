# AGENTS.md

本文件记录项目的规范和约束，供 AI 编码助手遵守。功能需求见 `REQUIREMENTS.md`。

## 仓库归属

- 本项目已迁入 FullstackSeed 主仓库的 `customer-service-h5/`，不再作为独立 Git 仓库维护。
- 目录内不得创建或恢复嵌套 `.git`；提交、分支和版本历史统一由 FullstackSeed 根仓库管理。
- 对接后端位于根仓库 `server/src/customer-service/`，后台接待页位于 `web/src/views/customer-service/`。

## 正式接待入口（2026-10-09）

- 当前 `index.html` 加载 `js/receptionApi.js` → `js/receptionStore.js` → `js/reception.js`，增量样式为 `css/reception.css`。
- 应用并发排队、人工接手、会话凭证及恢复规则见 `RECEPTION.md`；此文档覆盖旧版接口与演示降级描述。
- 旧 `api.js` / `store.js` / `app.js` 保留但不由正式入口加载，不得将旧本地 mock 或自造会话 ID 接回正式客服。
- 服务端消息为权威记录，访客会话凭证不可写入日志；断开 SSE 只取消订阅，不隐式取消服务端任务。

## 技术约束

- 纯 H5：HTML + CSS + 原生 JavaScript，**不使用任何前端框架**
- 不引入第三方库（除非用户明确要求）
- HTML / CSS / JS 分离，不写内联样式和脚本

## 编码规范

- 命名：有意义的英文 camelCase
- 注释、提交信息使用中文
- 移动端适配（viewport、安全区）

## 变更约束

- 只修改与当前任务相关的代码
- 删除/移动文件、运行破坏性命令前先与用户确认
- 项目结构或约束变化时，同步更新本文件与 REQUIREMENTS.md
