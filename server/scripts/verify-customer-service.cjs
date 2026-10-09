/**
 * 客服接待真实 MySQL 隔离集成验证。
 * 从 server 目录执行：
 * node -r ts-node/register/transpile-only scripts/verify-customer-service.cjs
 *
 * 只读取 .env 的连接参数，绝不使用 DB_NAME，也不启动 Nest 应用或调用真实模型。
 * 所有 DDL/DML 都限定在本次生成的 customer_service_verify_* 临时库。
 * 无论成功失败都按精确库名清理；禁止改成 DROP DATABASE 环境配置的业务库名。
 */
require('reflect-metadata');
const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const mysql = require('mysql2/promise');
const { DataSource, In } = require('typeorm');
const { Logger } = require('@nestjs/common');
const { ExternalApp } = require('../src/external-apps/entities/external-app.entity');
const { KnowledgeAiChatSession } = require('../src/knowledge-ai-chat/entities/knowledge-ai-chat-session.entity');
const { KnowledgeAiChatMessage } = require('../src/knowledge-ai-chat/entities/knowledge-ai-chat-message.entity');
const { CustomerChatTask } = require('../src/customer-service/entities/customer-chat-task.entity');
const { CustomerChatMessage } = require('../src/customer-service/entities/customer-chat-message.entity');
const { CustomerServiceService } = require('../src/customer-service/customer-service.service');
const { AddCustomerServiceReception1788911200000 } = require('../src/migrations/1788911200000-AddCustomerServiceReception');

// 测试仅输出用例名/计数；禁用框架日志，避免驱动错误打印 SQL 或连接配置。
Logger.overrideLogger(false);
const databaseName = `customer_service_verify_${Date.now()}_${randomBytes(6).toString('hex')}`;
const databasePattern = /^customer_service_verify_\d{13}_[a-f0-9]{12}$/;
let currentStep = '初始化';
let passed = 0;

function checkedDatabaseIdentifier(name) {
  assert.match(name, databasePattern, '临时库名称必须匹配固定前缀、时间戳和随机后缀');
  assert.equal(name, databaseName, '只允许操作本次运行生成的精确临时库名');
  assert.ok(name.length <= 64, '临时库名不能超过 MySQL 标识符长度');
  return `\`${name}\``;
}

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function waitFor(label, check) {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    const result = await check();
    if (result) return result;
    await sleep(30);
  }
  assert.fail(`等待超时：${label}`);
}

async function test(label, run) {
  currentStep = label;
  await run();
  passed += 1;
  console.log(`PASS ${passed}. ${label}`);
}

function agent(userId) {
  return { userId, username: `验证客服${userId}`, isAdmin: false, roles: [], permissions: [] };
}

function request(clientMessageId, content = '测试产品咨询') {
  return { clientMessageId, content };
}

function isStatus(status) {
  return (error) => typeof error?.getStatus === 'function' && error.getStatus() === status;
}

function createFakeAi(sessionRepository, aiMessageRepository) {
  const calls = [];
  const activePerApp = new Map();
  const peakPerApp = new Map();
  const fake = {
    calls,
    peakPerApp,
    async initSession(dto) {
      const saved = await sessionRepository.save(sessionRepository.create({
        title: dto.title || '隔离验证会话', providerId: 0, providerName: '隔离模拟模型', model: 'test',
        messageCount: 0, isSuccess: true, elapsedMilliseconds: 0,
      }));
      return { sessionId: saved.id, model: 'test', providerName: '隔离模拟模型' };
    },
    askStream(dto, writer, app, execution) {
      return new Promise((resolve, reject) => {
        let ended = false;
        let completing = false;
        let unblockAbort;
        const abortBarrier = new Promise((release) => { unblockAbort = release; });
        const call = {
          sessionId: dto.sessionId, appId: app.id, question: dto.question,
          startedAt: Date.now(), abortedAt: null, settledAt: null, holdAbort: false,
          releaseAbort: () => unblockAbort(),
          finish: async (answer = `模拟回答：${dto.question}`) => {
            if (ended || completing) return;
            completing = true;
            try {
              const saved = await aiMessageRepository.save(aiMessageRepository.create({
                sessionId: dto.sessionId, providerId: 0, providerName: '隔离模拟模型', model: 'test',
                question: dto.question, answer, isSuccess: true, elapsedMilliseconds: 1,
              }));
              if (execution.signal.aborted) return;
              writer.writeEvent('done', { sessionId: dto.sessionId, messageId: saved.id, answer, isSuccess: true });
              settle();
              resolve();
            } catch (error) {
              settle();
              reject(error);
            }
          },
        };
        const settle = () => {
          if (ended) return;
          ended = true;
          call.settledAt = Date.now();
          activePerApp.set(app.id, (activePerApp.get(app.id) || 1) - 1);
          execution.signal.removeEventListener('abort', onAbort);
        };
        const onAbort = () => {
          if (ended || call.abortedAt) return;
          call.abortedAt = Date.now();
          if (!call.holdAbort) unblockAbort();
          // 模拟上游收到取消后仍需 400ms 才真正结束；还会尝试发迟到内容。
          void Promise.all([sleep(400), abortBarrier]).then(() => {
            if (ended) return;
            writer.writeEvent('delta', { content: '取消后不应出现的片段' });
            writer.writeEvent('done', { answer: '取消后不应出现的答案', isSuccess: true, messageId: -1 });
            settle();
            reject(new Error('隔离模拟模型已取消'));
          }).catch((error) => { settle(); reject(error); });
        };
        calls.push(call);
        const active = (activePerApp.get(app.id) || 0) + 1;
        activePerApp.set(app.id, active);
        peakPerApp.set(app.id, Math.max(peakPerApp.get(app.id) || 0, active));
        execution.signal.addEventListener('abort', onAbort, { once: true });
        if (execution.signal.aborted) onAbort();
        else writer.writeEvent('delta', { content: '模拟回答生成中…' });
      });
    },
    findCall(sessionId) { return calls.find((call) => call.sessionId === sessionId); },
    releaseAllAborts() { for (const call of calls) call.releaseAbort(); },
  };
  return fake;
}

async function main() {
  const env = require('dotenv').parse(readFileSync(path.resolve(__dirname, '..', '.env')));
  const connectionOptions = {
    host: env.DB_HOST || '127.0.0.1', port: Number(env.DB_PORT || 3306),
    user: env.DB_USER || 'root', password: env.DB_PASS || '', connectTimeout: 5000,
  };
  let adminConnection;
  let dataSource;
  let service;
  let serviceStarted = false;
  let fakeAi;
  let created = false;
  let failure;
  try {
    // 管理连接不指定默认数据库，不读取、不写入业务数据库。
    adminConnection = await mysql.createConnection(connectionOptions);
    await adminConnection.query(`CREATE DATABASE ${checkedDatabaseIdentifier(databaseName)} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    created = true;
    console.log(`临时验证库：${databaseName}`);
    dataSource = new DataSource({
      type: 'mysql', host: connectionOptions.host, port: connectionOptions.port,
      username: connectionOptions.user, password: connectionOptions.password,
      database: databaseName, charset: 'utf8mb4_unicode_ci', synchronize: true, logging: false,
      entities: [ExternalApp, KnowledgeAiChatSession, CustomerChatTask, CustomerChatMessage, KnowledgeAiChatMessage],
      extra: { connectionLimit: 10, connectTimeout: 5000 },
    });
    await dataSource.initialize();
    const databaseRows = await dataSource.query('SELECT DATABASE() AS currentDatabase');
    assert.equal(databaseRows[0].currentDatabase, databaseName);

    await test('增量迁移 down → up → up 可执行且幂等', async () => {
      const runner = dataSource.createQueryRunner();
      await runner.connect();
      try {
        const migration = new AddCustomerServiceReception1788911200000();
        await migration.down(runner);
        assert.equal(await runner.hasTable('customer_chat_tasks'), false);
        assert.equal(await runner.hasColumn('external_apps', 'maxConcurrentChats'), false);
        assert.equal(await runner.hasTable('knowledge_ai_chat_messages'), true);
        await migration.up(runner);
        await migration.up(runner);
        assert.equal(await runner.hasTable('customer_chat_tasks'), true);
        assert.equal(await runner.hasTable('customer_chat_messages'), true);
        assert.equal(await runner.hasColumn('external_apps', 'maxConcurrentChats'), true);
        assert.equal(await runner.hasColumn('knowledge_ai_chat_sessions', 'sessionTokenHash'), true);
        const messagesTable = await runner.getTable('customer_chat_messages');
        assert.ok(messagesTable.indices.some((index) => index.name === 'UQ_customer_chat_messages_request' && index.isUnique));
      } finally { await runner.release(); }
    });

    const sessions = dataSource.getRepository(KnowledgeAiChatSession);
    const tasks = dataSource.getRepository(CustomerChatTask);
    const messages = dataSource.getRepository(CustomerChatMessage);
    const apps = dataSource.getRepository(ExternalApp);
    fakeAi = createFakeAi(sessions, dataSource.getRepository(KnowledgeAiChatMessage));
    const makeService = () => new CustomerServiceService(dataSource, sessions, tasks, messages, apps, fakeAi);
    service = makeService();
    await service.onModuleInit();
    serviceStarted = true;
    const [appA, appB] = await apps.save([
      apps.create({ name: '验证应用 A', appId: 'verify_app_a', maxConcurrentChats: 1, isEnabled: true }),
      apps.create({ name: '验证应用 B', appId: 'verify_app_b', maxConcurrentChats: 1, isEnabled: true }),
    ]);
    const makeSession = async (app, title) => service.initSession(app, { title });
    const a1 = await makeSession(appA, 'A1 处理中');
    const a2 = await makeSession(appA, 'A2 排队');
    const a3 = await makeSession(appA, 'A3 将人工接手');
    const b1 = await makeSession(appB, 'B1 独立应用');
    const a1Request = request('verify_a1_001', '应用 A 第一个问题');
    const a2Request = request('verify_a2_001', '应用 A 第二个问题');
    const b1Request = request('verify_b1_001', '应用 B 独立问题');
    const taskFor = async (sessionId, requestId) => service.findTaskForMessage(sessionId, requestId);
    const waitStarted = async (sessionId) => waitFor('模拟 AI 启动', () => fakeAi.findCall(sessionId));
    const waitStatus = async (sessionId, requestId, status) => waitFor(`任务进入 ${status}`, async () => {
      const task = await taskFor(sessionId, requestId);
      return task?.status === status ? task : null;
    });

    await test('应用 A 达到并发 1 时排队，应用 B 可独立执行', async () => {
      await service.submitVisitorMessage(a1.sessionId, appA, a1Request);
      await waitStarted(a1.sessionId);
      await service.submitVisitorMessage(a2.sessionId, appA, a2Request);
      await waitStatus(a2.sessionId, a2Request.clientMessageId, 'queued');
      await service.submitVisitorMessage(b1.sessionId, appB, b1Request);
      await waitStarted(b1.sessionId);
      assert.equal(await tasks.count({ where: { externalAppId: appA.id, status: 'running' } }), 1);
      assert.equal(await tasks.count({ where: { externalAppId: appB.id, status: 'running' } }), 1);
      assert.equal((await service.getSnapshot(a2.sessionId)).queuePosition, 1);
      assert.equal(fakeAi.findCall(a2.sessionId), undefined);
    });

    await test('同一请求标识并发重试只保存一条消息和一个任务', async () => {
      await Promise.all(Array.from({ length: 3 }, () => service.submitVisitorMessage(a2.sessionId, appA, a2Request)));
      assert.equal(await messages.count({ where: { sessionId: a2.sessionId, clientMessageId: a2Request.clientMessageId } }), 1);
      assert.equal(await tasks.count({ where: { sessionId: a2.sessionId } }), 1);
      await assert.rejects(service.submitVisitorMessage(a2.sessionId, appA, request(a2Request.clientMessageId, '不允许复用标识更换内容')), isStatus(409));
      await assert.rejects(service.submitVisitorMessage(a2.sessionId, appA, request('verify_a2_other', '同会话不能并行发第二个问题')), isStatus(409));
    });

    await test('会话凭证校验拒绝错误 Token 和跨应用访问', async () => {
      assert.equal((await service.assertVisitor(a1.sessionId, appA, a1.sessionToken)).id, a1.sessionId);
      const badToken = `${a1.sessionToken[0] === 'a' ? 'b' : 'a'}${a1.sessionToken.slice(1)}`;
      await assert.rejects(service.assertVisitor(a1.sessionId, appA, badToken), isStatus(403));
      await assert.rejects(service.assertVisitor(a1.sessionId, appB, a1.sessionToken), isStatus(403));
      await assert.rejects(service.assertVisitor(a1.sessionId, appA, undefined), isStatus(403));
    });

    let assignedAgent;
    let otherAgent;
    const a3Request = request('verify_a3_001', '队列内接手的问题');
    await test('两名客服同时接手仅一人成功，原 AI 排队任务撤销', async () => {
      await service.submitVisitorMessage(a3.sessionId, appA, a3Request);
      await waitStatus(a3.sessionId, a3Request.clientMessageId, 'queued');
      const candidates = [agent(101), agent(102)];
      const results = await Promise.allSettled(candidates.map((user) => service.claimSession(a3.sessionId, user)));
      assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
      assert.equal(results.filter((result) => result.status === 'rejected' && isStatus(409)(result.reason)).length, 1);
      const claimed = await service.getSnapshot(a3.sessionId);
      assignedAgent = candidates.find((user) => user.userId === claimed.assignedAgentId);
      otherAgent = candidates.find((user) => user.userId !== claimed.assignedAgentId);
      assert.ok(assignedAgent);
      assert.equal(claimed.serviceStatus, 'human');
      assert.equal(claimed.activeTask, null);
      await waitStatus(a3.sessionId, a3Request.clientMessageId, 'cancelled');
      assert.equal(fakeAi.findCall(a3.sessionId), undefined);
    });

    const agentReply = request('verify_agent_001', '您好，我是人工客服');
    await test('人工会话允许连续双方消息，其他客服不可发送', async () => {
      await service.submitVisitorMessage(a3.sessionId, appA, request('verify_human_001', '人工咨询第一条'));
      await service.submitVisitorMessage(a3.sessionId, appA, request('verify_human_002', '人工咨询第二条'));
      await service.sendAgentMessage(a3.sessionId, agentReply, assignedAgent);
      await service.sendAgentMessage(a3.sessionId, request('verify_agent_002', '正在为您处理'), assignedAgent);
      await assert.rejects(service.sendAgentMessage(a3.sessionId, request('verify_agent_bad', '其他客服不能插入'), otherAgent), isStatus(403));
      assert.equal(await messages.count({ where: { sessionId: a3.sessionId, role: 'user' } }), 3);
      assert.equal(await messages.count({ where: { sessionId: a3.sessionId, role: 'agent' } }), 2);
      assert.equal(await tasks.count({ where: { sessionId: a3.sessionId } }), 1);
    });

    await test('人工结束后原消息重试仍幂等，新消息被拒绝', async () => {
      const closed = await service.closeSession(a3.sessionId, assignedAgent);
      assert.equal(closed.serviceStatus, 'closed');
      await service.closeSession(a3.sessionId, assignedAgent);
      await service.sendAgentMessage(a3.sessionId, agentReply, assignedAgent);
      assert.equal(await messages.count({ where: { sessionId: a3.sessionId, clientMessageId: agentReply.clientMessageId } }), 1);
      await assert.rejects(service.sendAgentMessage(a3.sessionId, request('verify_after_close', '结束后不可发送'), assignedAgent), isStatus(403));
    });

    await test('正常完成按 FIFO 释放并发，取消的队列任务不会复活', async () => {
      const a4 = await makeSession(appA, 'A4 队列末尾');
      const a4Request = request('verify_a4_001', '应用 A 第四个问题');
      await service.submitVisitorMessage(a4.sessionId, appA, a4Request);
      assert.equal((await service.getSnapshot(a4.sessionId)).queuePosition, 2);
      await fakeAi.findCall(a1.sessionId).finish('A1 正常完成');
      await waitStatus(a1.sessionId, a1Request.clientMessageId, 'completed');
      await waitStarted(a2.sessionId);
      assert.equal(fakeAi.findCall(a4.sessionId), undefined);
      await fakeAi.findCall(a2.sessionId).finish('A2 正常完成');
      await waitStarted(a4.sessionId);
      assert.deepEqual(fakeAi.calls.filter((call) => call.appId === appA.id).map((call) => call.sessionId), [a1.sessionId, a2.sessionId, a4.sessionId]);
      await fakeAi.findCall(a4.sessionId).finish('A4 正常完成');
      await waitStatus(a4.sessionId, a4Request.clientMessageId, 'completed');
      assert.equal(fakeAi.findCall(a3.sessionId), undefined);
      assert.equal(fakeAi.peakPerApp.get(appA.id), 1);
      assert.equal((await service.getSnapshot(a1.sessionId)).messages.filter((message) => message.role === 'ai').length, 1);
      await fakeAi.findCall(b1.sessionId).finish('B1 正常完成');
      await waitStatus(b1.sessionId, b1Request.clientMessageId, 'completed');
    });

    await test('执行中转人工，取消真正结束前继续占名额且禁止迟到 AI 回复', async () => {
      const c1 = await makeSession(appA, 'C1 执行中转人工');
      const c2 = await makeSession(appA, 'C2 等待真实释放');
      const c1Request = request('verify_c1_001', '正在执行的提问');
      const c2Request = request('verify_c2_001', '后续排队的提问');
      await service.submitVisitorMessage(c1.sessionId, appA, c1Request);
      const running = await waitStarted(c1.sessionId);
      running.holdAbort = true;
      await service.submitVisitorMessage(c2.sessionId, appA, c2Request);
      const handoff = await service.requestHuman(c1.sessionId, appA);
      assert.equal(handoff.serviceStatus, 'waiting_human');
      await waitStatus(c1.sessionId, c1Request.clientMessageId, 'cancelling');
      assert.ok(running.abortedAt);
      await sleep(420);
      assert.equal(running.settledAt, null);
      assert.equal(fakeAi.findCall(c2.sessionId), undefined);
      assert.equal(await tasks.count({ where: { externalAppId: appA.id, status: In(['running', 'cancelling']) } }), 1);
      running.releaseAbort();
      await waitStatus(c1.sessionId, c1Request.clientMessageId, 'cancelled');
      const next = await waitStarted(c2.sessionId);
      assert.ok(next.startedAt >= running.settledAt);
      assert.equal(fakeAi.peakPerApp.get(appA.id), 1);
      assert.equal(await messages.count({ where: { sessionId: c1.sessionId, role: 'ai' } }), 0);
      assert.equal((await service.getSnapshot(c1.sessionId)).serviceStatus, 'waiting_human');
      await next.finish('取消释放后才开始的答案');
      await waitStatus(c2.sessionId, c2Request.clientMessageId, 'completed');
    });

    await test('第二个调度服务实例不能夺取同库单实例锁', async () => {
      const competitor = makeService();
      await assert.rejects(competitor.onModuleInit(), /单服务进程/);
      // 第二实例失败不能释放第一实例持有的锁或影响其接待接口。
      const session = await makeSession(appB, '锁验证后仍可新建');
      assert.ok(session.sessionId > 0);
    });

    await test('会话快照及普通实体查询均不泄露访客凭证摘要', async () => {
      const snapshot = await service.getSnapshot(a1.sessionId);
      const serialized = JSON.stringify(snapshot);
      assert.equal(serialized.includes('sessionToken'), false);
      assert.equal(serialized.includes(a1.sessionToken), false);
      assert.equal((await sessions.findOneByOrFail({ id: a1.sessionId })).sessionTokenHash, undefined);
      const rowWithHash = await sessions.createQueryBuilder('session').addSelect('session.sessionTokenHash')
        .where('session.id = :id', { id: a1.sessionId }).getOneOrFail();
      assert.equal(typeof rowWithHash.sessionTokenHash, 'string');
      assert.equal(rowWithHash.sessionTokenHash.length, 64);
      assert.equal(rowWithHash.sessionTokenHash === a1.sessionToken, false);
    });

    await test('200 条历史分页无重复无遗漏，列表筛选和应用选项契约正确', async () => {
      await messages.save(Array.from({ length: 205 }, (_, index) => messages.create({
        sessionId: a3.sessionId, role: 'system', content: `分页历史 ${index + 1}`,
        agentId: null, agentName: null, clientMessageId: null, taskId: null,
      })));
      const newest = await service.getSnapshot(a3.sessionId);
      assert.equal(newest.messages.length, 200);
      assert.equal(newest.hasMoreMessages, true);
      assert.equal(newest.nextBeforeMessageId, newest.messages[0].id);
      const older = await service.getSnapshot(a3.sessionId, newest.nextBeforeMessageId);
      assert.equal(older.hasMoreMessages, false);
      const ids = [...older.messages, ...newest.messages].map((message) => message.id);
      assert.equal(new Set(ids).size, ids.length);
      assert.equal(ids.length, await messages.count({ where: { sessionId: a3.sessionId } }));
      assert.deepEqual([...ids].sort((left, right) => left - right), ids);
      const list = await service.findSessions({ page: 1, pageSize: 10, externalAppId: appA.id, serviceStatus: 'closed', mine: true }, assignedAgent);
      assert.equal(list.total, 1);
      assert.equal(list.list[0].sessionId, a3.sessionId);
      assert.equal(list.list[0].messages.length, 0);
      assert.equal((await service.findApps()).length, 2);
    });
  } catch (error) {
    failure = error;
    // 不打印 error.message/stack，数据库异常可能带连接信息或完整 SQL。
    console.error(`验证失败：${currentStep}（${error?.name || 'Error'}${error?.code ? ` / ${error.code}` : ''}）`);
  } finally {
    fakeAi?.releaseAllAborts();
    if (serviceStarted) {
      try { await service.onModuleDestroy(); }
      catch (error) { failure ||= error; console.error('客服验证服务清理失败'); }
    }
    if (dataSource?.isInitialized) {
      try { await dataSource.destroy(); }
      catch (error) { failure ||= error; console.error('测试数据源连接关闭失败'); }
    }
    if (created && adminConnection) {
      try {
        await adminConnection.query(`DROP DATABASE ${checkedDatabaseIdentifier(databaseName)}`);
        const [remaining] = await adminConnection.execute('SELECT SCHEMA_NAME FROM information_schema.SCHEMATA WHERE SCHEMA_NAME = ?', [databaseName]);
        assert.equal(remaining.length, 0);
        console.log(`已删除临时验证库：${databaseName}`);
      } catch (error) {
        failure ||= error;
        console.error(`临时库清理失败，需按精确名称检查：${databaseName}`);
      }
    }
    if (adminConnection) {
      try { await adminConnection.end(); }
      catch (error) { failure ||= error; console.error('验证管理连接关闭失败'); }
    }
  }
  console.log(`验证结果：${passed} 项通过${failure ? '，存在失败' : '，全部通过'}。真实模型调用次数：0。`);
  if (failure) process.exitCode = 1;
}

void main().catch((error) => {
  console.error(`验证初始化失败（${error?.name || 'Error'}${error?.code ? ` / ${error.code}` : ''}）`);
  process.exitCode = 1;
});
