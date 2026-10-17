const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');

function load(name, overrides = {}) {
  const window = overrides.window || {};
  const context = vm.createContext({ window, URL, AbortController, TextDecoder, Uint8Array, setTimeout, clearTimeout, console, ...overrides });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../js', name), 'utf8'), context);
  return context;
}
const response = (value, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => value });
const tick = () => new Promise(resolve => setImmediate(resolve));

test('正式初始化接口透传失败，不自造 sessionId 或模拟回答', async () => {
  const context = load('receptionApi.js', { fetch: async () => response({ message: '应用不可用' }, 403) });
  await assert.rejects(context.window.ReceptionAPI.createSession(), /应用不可用/);
});

test('消息和恢复接口携带会话凭证，消息重试保留同一标识', async () => {
  const requests = [];
  const context = load('receptionApi.js', { fetch: async (url, options) => {
    requests.push({ url, options });
    return response({ data: { sessionId: 7, messages: [] } });
  } });
  const api = context.window.ReceptionAPI;
  const session = { sessionId: 7, sessionToken: 'private-token' };
  const message = { clientMessageId: 'same-retry-id', content: '靠枕' };
  await api.send(session, message);
  await api.send(session, message);
  await api.snapshot(session, 21);
  assert.equal(requests[0].options.headers['x-session-token'], 'private-token');
  assert.equal(requests[0].options.headers.appid, '1');
  assert.equal(requests[0].options.body, requests[1].options.body);
  assert.match(requests[2].url, /\/sessions\/7\?beforeMessageId=21$/);
  assert.throws(() => api.snapshot({ sessionId: 7 }), /缺少访问凭证/);
});

test('SSE 支持跨块 CRLF，排队连接 EOF 只触发重连而非回答成功', async () => {
  const frames = [
    'event: snapshot\r\ndata: {"serviceStatus":"ai",',
    '"activeTask":{"id":1,"status":"queued"}}\r\n\r\nevent: ai-event\ndata: {"event":"task-settled"}\n\n',
  ];
  const encoder = new TextEncoder();
  const events = [];
  let disconnected;
  const ended = new Promise(resolve => { disconnected = resolve; });
  const context = load('receptionApi.js', { fetch: async () => ({
    ok: true,
    body: { getReader: () => ({
      read: async () => frames.length ? { value: encoder.encode(frames.shift()), done: false } : { done: true },
      releaseLock() {},
    }) },
  }) });
  const stop = context.window.ReceptionAPI.subscribe({ sessionId: 1, sessionToken: 'token' }, {
    onEvent: (event, payload) => events.push({ event, payload }),
    onDisconnect: disconnected,
  });
  const error = await ended;
  stop();
  assert.equal(events.length, 2);
  assert.equal(events[0].payload.activeTask.status, 'queued');
  assert.equal(events[1].event, 'ai-event');
  assert.match(error.message, /连接已断开/);
});

test('知识库图片保留允许目录规则并拒绝脚本和回退路径', () => {
  const context = load('receptionApi.js');
  const resolve = context.window.ReceptionAPI.resolveKnowledgeImageUrl;
  assert.equal(resolve('/uploads/example.png'), 'http://localhost:4000/uploads/example.png');
  assert.equal(resolve('javascript:alert(1)'), '');
  assert.equal(resolve('/uploads/../private.png'), '');
  assert.equal(resolve('/images/private.png'), '');
});

function storage() {
  const data = new Map();
  return { getItem: key => data.get(key) || null, setItem: (key, value) => data.set(key, value), removeItem: key => data.delete(key) };
}

test('旧历史仅本地只读，新会话凭证按应用隔离且当前会话按 tab 保存', () => {
  const localStorage = storage();
  const sessionStorage = storage();
  localStorage.setItem('aiChatSessions_v1', JSON.stringify({ sessions: [{ sessionId: 8, messages: [] }] }));
  function makeStore(appid) {
    return load('receptionStore.js', { localStorage, sessionStorage, window: {
      ReceptionAPI: { getConfig: () => ({ baseUrl: 'https://example.test', appid }) },
    } }).window.ReceptionStore;
  }
  const first = makeStore('a');
  first.upsert({ sessionId: 1, sessionToken: 'token', messages: [] });
  first.setCurrent({ sessionId: 1, sessionToken: 'token', pendingMessage: { clientMessageId: 'retry' } });
  assert.equal(first.getCurrent().pendingMessage.clientMessageId, 'retry');
  assert.equal(first.loadAll().find(session => session.sessionId === 8).legacy, true);
  assert.equal(first.loadAll().find(session => session.sessionId === 8).sessionToken, null);
  assert.equal(makeStore('b').getCurrent(), null);
  assert.equal(makeStore('b').loadAll().some(session => session.sessionId === 1), false);
});

// 轻量 DOM 替身仅覆盖本页面使用的标准能力，无需引入前端框架/第三方测试库。
class Node {
  constructor(tag) {
    this.tagName = tag;
    this.children = [];
    this.listeners = {};
    this.attributes = {};
    this.style = {};
    this.hidden = false;
    this.disabled = false;
    this.value = '';
    this.scrollHeight = 400;
    this.scrollTop = 0;
    this.clientHeight = 400;
    this._text = '';
    this.classList = { add() {}, remove() {}, toggle() {} };
  }
  set textContent(value) { this._text = String(value); this.children.forEach(child => { child.parentElement = null; }); this.children = []; }
  get textContent() { return this._text + this.children.map(child => child.textContent).join(''); }
  set innerHTML(value) { this.textContent = value; }
  appendChild(node) { node.remove(); this.children.push(node); node.parentElement = this; return node; }
  prepend(node) { node.remove(); this.children.unshift(node); node.parentElement = this; }
  remove() { if (this.parentElement) this.parentElement.children = this.parentElement.children.filter(child => child !== this); this.parentElement = null; }
  setAttribute(name, value) { this.attributes[name] = value; }
  addEventListener(event, handler) { this.listeners[event] = handler; }
  click() { if (!this.disabled && this.listeners.click) return this.listeners.click({}); }
}

async function createPage(saved = { sessionId: 1, sessionToken: 'token' }) {
  const elements = new Map();
  const root = new Node('root');
  const names = ['message-list', 'chat-input', 'btn-send', 'service-status', 'connection-status', 'service-error', 'btn-handoff', 'btn-cancel-wait', 'btn-resume-ai', 'btn-retry', 'history-panel', 'history-mask', 'history-list', 'btn-new-chat', 'btn-history', 'btn-close-history'];
  names.forEach(id => { const node = new Node(id === 'chat-input' ? 'textarea' : 'div'); node.id = id; elements.set(id, node); root.appendChild(node); });
  function find(node, id) { return node.id === id ? node : node.children.map(child => find(child, id)).find(Boolean); }
  const state = {
    snapshot: { sessionId: 1, serviceStatus: 'ai', messages: [], activeTask: null, updatedAt: '2026-10-09T00:00:00.000Z' },
    handlers: null,
    initCalls: 0,
    sends: [],
    sendError: null,
    saved: null,
  };
  const api = {
    createSession: async () => { state.initCalls += 1; return { sessionId: 2, sessionToken: 'new-token' }; },
    snapshot: async () => state.snapshot,
    subscribe: (session, handlers) => { state.handlers = handlers; return () => {}; },
    send: async (session, message) => { state.sends.push({ ...message }); if (state.sendError) throw state.sendError; return state.snapshot; },
    action: async () => state.snapshot,
    resolveKnowledgeImageUrl: value => value,
  };
  const window = { ReceptionAPI: api, crypto: webcrypto, addEventListener() {}, ReceptionStore: {
    getCurrent: () => saved,
    setCurrent: value => { state.saved = value; },
    upsert() {}, loadAll: () => [], remove() {},
  } };
  load('reception.js', { window, document: { getElementById: id => elements.get(id) || find(root, id), createElement: tag => new Node(tag), createTextNode: value => { const node = new Node('#text'); node.textContent = value; return node; } }, confirm: () => true });
  await tick();
  return { state, elements, api, emit: snapshot => state.handlers.onEvent('snapshot', snapshot) };
}

test('刷新恢复已有会话；排队消息重复快照不重复显示且前方人数为位置减一', async () => {
  const page = await createPage();
  assert.equal(page.state.initCalls, 0);
  const snapshot = { ...page.state.snapshot, queuePosition: 3, activeTask: { id: 9, status: 'queued', answer: '' }, messages: [{ id: 1, role: 'user', content: '靠枕', createdAt: '2026-10-09T00:00:01Z' }] };
  page.emit(snapshot);
  page.emit(snapshot);
  assert.match(page.elements.get('service-status').textContent, /前方还有 2 个/);
  assert.equal(page.elements.get('message-list').textContent.match(/靠枕/g).length, 1);
  assert.equal(page.elements.get('chat-input').disabled, true);
  assert.equal(page.elements.get('btn-handoff').disabled, false);
});

test('人工接手后停止旧 AI 输出，允许继续发消息并显示客服姓名', async () => {
  const page = await createPage();
  page.emit({ ...page.state.snapshot, activeTask: { id: 9, status: 'running', answer: '旧输出' } });
  page.emit({ ...page.state.snapshot, serviceStatus: 'human', assignedAgentName: '小林', messages: [{ id: 2, role: 'agent', content: '你好', agentName: '小林' }] });
  page.state.handlers.onEvent('ai-event', { taskId: 9, event: 'delta', data: { content: '不应显示' } });
  assert.match(page.elements.get('service-status').textContent, /小林/);
  assert.equal(page.elements.get('chat-input').disabled, false);
  assert.equal(page.elements.get('message-list').textContent.includes('不应显示'), false);
  assert.equal(page.elements.get('message-list').textContent.includes('旧输出'), false);
});

test('网络未知结果保留 clientMessageId 重试，服务端快照确认后仅显示一次', async () => {
  const page = await createPage();
  page.state.sendError = new Error('network');
  const input = page.elements.get('chat-input');
  input.value = '请推荐卷尺';
  input.listeners.input();
  page.elements.get('btn-send').click();
  await tick();
  const firstId = page.state.sends[0].clientMessageId;
  assert.equal(page.state.saved.pendingMessage.clientMessageId, firstId);
  page.state.sendError = null;
  page.state.snapshot = { ...page.state.snapshot, messages: [{ id: 1, role: 'user', content: '请推荐卷尺', clientMessageId: firstId }], activeTask: { id: 7, status: 'queued', answer: '' }, queuePosition: 1 };
  page.elements.get('btn-retry').click();
  await tick();
  assert.equal(page.state.sends[1].clientMessageId, firstId);
  assert.equal(page.elements.get('message-list').textContent.match(/请推荐卷尺/g).length, 1);
  assert.equal(page.state.saved.pendingMessage, null);
});

test('较旧状态不能覆盖已接入的人工会话', async () => {
  const page = await createPage();
  page.emit({ ...page.state.snapshot, serviceStatus: 'human', assignedAgentName: '小林', updatedAt: '2026-10-09T00:00:02Z' });
  page.emit({ ...page.state.snapshot, serviceStatus: 'ai', updatedAt: '2026-10-09T00:00:01Z' });
  assert.match(page.elements.get('service-status').textContent, /人工客服/);
});

test('同秒人工接手优先服务版本，迟到的发送响应不能恢复 AI 状态', async () => {
  const page = await createPage();
  let completeSend;
  page.api.send = () => new Promise(resolve => { completeSend = resolve; });
  const input = page.elements.get('chat-input');
  input.value = '请人工确认';
  input.listeners.input();
  page.elements.get('btn-send').click();
  page.emit({ ...page.state.snapshot, serviceStatus: 'human', serviceVersion: 1, assignedAgentName: '小林' });
  completeSend({ ...page.state.snapshot, serviceVersion: 0, activeTask: { id: 1, status: 'queued', answer: '' }, messages: [{ id: 1, role: 'user', content: '请人工确认' }] });
  await tick();
  assert.match(page.elements.get('service-status').textContent, /人工客服/);
  assert.equal(page.elements.get('chat-input').disabled, false);
  assert.match(page.elements.get('message-list').textContent, /请人工确认/);
});

test('相同接待版本下，晚到 HTTP 排队状态不能回滚已完成的任务', async () => {
  const page = await createPage();
  let completeSend;
  page.api.send = () => new Promise(resolve => { completeSend = resolve; });
  const input = page.elements.get('chat-input');
  input.value = '简单问题';
  input.listeners.input();
  page.elements.get('btn-send').click();
  page.emit({ ...page.state.snapshot, serviceVersion: 0, activeTask: null, messages: [{ id: 2, role: 'ai', content: '已答复' }] });
  completeSend({ ...page.state.snapshot, serviceVersion: 0, activeTask: { id: 1, status: 'queued', answer: '' }, messages: [{ id: 1, role: 'user', content: '简单问题' }] });
  await tick();
  assert.equal(page.elements.get('chat-input').disabled, false);
  assert.match(page.elements.get('message-list').textContent, /已答复/);
  assert.match(page.elements.get('message-list').textContent, /简单问题/);
});

test('加载更早消息后，最新快照不会丢失已加载的历史', async () => {
  const page = await createPage();
  page.emit({ ...page.state.snapshot, hasMoreMessages: true, nextBeforeMessageId: 201,
    messages: [{ id: 201, role: 'user', content: '最新消息' }] });
  page.api.snapshot = async () => ({ ...page.state.snapshot, hasMoreMessages: false, nextBeforeMessageId: null,
    messages: [{ id: 1, role: 'user', content: '更早消息' }] });
  page.elements.get('message-list').children.find(node => node.id === 'load-earlier').click();
  await tick();
  page.emit({ ...page.state.snapshot, hasMoreMessages: true, nextBeforeMessageId: 201,
    messages: [{ id: 201, role: 'user', content: '最新消息' }, { id: 202, role: 'ai', content: '新回复' }] });
  const content = page.elements.get('message-list').textContent;
  assert.match(content, /更早消息/);
  assert.match(content, /最新消息/);
  assert.match(content, /新回复/);
  assert.equal(page.elements.get('message-list').children.some(node => node.id === 'load-earlier'), false);
});

test('确定被拒绝的消息回填编辑框，不无限锁死重试状态', async () => {
  const page = await createPage();
  page.state.sendError = Object.assign(new Error('排队人数过多'), { status: 429 });
  const input = page.elements.get('chat-input');
  input.value = '请推荐卷尺';
  input.listeners.input();
  page.elements.get('btn-send').click();
  await tick();
  assert.equal(input.value, '请推荐卷尺');
  assert.equal(input.disabled, false);
  assert.equal(page.state.saved.pendingMessage, null);
  assert.match(page.elements.get('service-error').textContent, /排队人数过多/);
});
