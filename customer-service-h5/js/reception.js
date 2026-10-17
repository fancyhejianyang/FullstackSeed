/** 正式客服页面：服务端快照驱动，AI 排队与人工接待共用消息流。 */
(function () {
  "use strict";
  var api = window.ReceptionAPI;
  var store = window.ReceptionStore;
  var messageList = document.getElementById("message-list");
  var input = document.getElementById("chat-input");
  var sendButton = document.getElementById("btn-send");
  var statusLabel = document.getElementById("service-status");
  var connectionLabel = document.getElementById("connection-status");
  var errorLabel = document.getElementById("service-error");
  var handoffButton = document.getElementById("btn-handoff");
  var cancelButton = document.getElementById("btn-cancel-wait");
  var resumeButton = document.getElementById("btn-resume-ai");
  var retryButton = document.getElementById("btn-retry");
  var historyPanel = document.getElementById("history-panel");
  var historyMask = document.getElementById("history-mask");
  var historyList = document.getElementById("history-list");
  var currentSession = null;
  var generation = 0;
  var snapshotRevision = 0;
  var connected = false;
  var loading = false;
  var sending = false;
  var actionBusy = false;
  var stopSubscription = null;
  var connectionAttempt = 0;
  var reconnectTimer = null;
  var retryDelay = 1000;
  var retryAction = null;
  var pendingMessage = null;
  var hasMoreMessages = false;
  var nextBeforeMessageId = null;
  var historyLoaded = false;
  var loadingEarlier = false;
  var nodeMap = new Map();
  var taskDetails = {};

  var aiAvatar = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="7" width="16" height="12" rx="3"></rect><path d="M9 12h.01M15 12h.01M9 16h6M12 7V4"></path><circle cx="12" cy="4" r="1"></circle></svg>';
  var agentAvatar = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><circle cx="12" cy="8" r="4"></circle><path d="M5 21v-2a7 7 0 0 1 14 0v2"></path></svg>';

  function element(tag, className, text) {
    var result = document.createElement(tag);
    if (className) result.className = className;
    if (text !== undefined) result.textContent = text;
    return result;
  }
  function formatTime(value, full) {
    var date = new Date(value || Date.now());
    if (isNaN(date.getTime())) return value || "";
    return date.toLocaleString("zh-CN", full
      ? { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }
      : { hour: "2-digit", minute: "2-digit", hour12: false });
  }
  function appendText(container, text) {
    String(text || "").split("\n").forEach(function (line, index) {
      if (index) container.appendChild(document.createElement("br"));
      container.appendChild(document.createTextNode(line));
    });
  }
  function safeExternalUrl(value) {
    try {
      var url = new URL(String(value || "").replace(/^<|>$/g, "").trim());
      return url.protocol === "http:" || url.protocol === "https:" ? url.href : "";
    } catch (error) { return ""; }
  }
  // 与旧入口一致，仅构造受控链接和知识库图片，绝不注入消息 HTML。
  function renderMarkdown(container, content) {
    var pattern = /!\[([^\]]*)\]\(\s*(<?(?:https?:\/\/|\/uploads\/)[^\s)>]+>?)\s*(?:["'][^)]*["'])?\s*\)|\[([^\]]+)\]\(\s*(<?https?:\/\/[^\s)>]+>?)\s*\)/gi;
    var text = String(content || "");
    var lastIndex = 0;
    var match;
    container.textContent = "";
    while ((match = pattern.exec(text))) {
      appendText(container, text.slice(lastIndex, match.index));
      var isImage = match[1] !== undefined;
      var label = (isImage ? match[1] : match[3]).trim();
      var url = isImage ? api.resolveKnowledgeImageUrl(match[2]) : safeExternalUrl(match[4]);
      if (!url) appendText(container, match[0]);
      else if (isImage) {
        var figure = element("figure", "knowledge-image");
        var image = document.createElement("img");
        image.src = url;
        image.alt = label || "知识库图片";
        image.loading = "lazy";
        image.referrerPolicy = "no-referrer";
        figure.appendChild(image);
        if (label) figure.appendChild(element("figcaption", "", label));
        container.appendChild(figure);
      } else {
        var link = element("a", "knowledge-link", label || url);
        link.href = url;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        container.appendChild(link);
      }
      lastIndex = pattern.lastIndex;
    }
    appendText(container, text.slice(lastIndex));
  }

  function mergeMessages(previous, incoming) {
    var entries = new Map();
    (previous || []).concat(incoming || []).forEach(function (message) {
      entries.set(String(message.id), message);
    });
    return Array.from(entries.values()).sort(function (a, b) { return Number(a.id) - Number(b.id); });
  }

  function renderedContent(message) {
    var content = message.content || "";
    var details = taskDetails[message.taskId];
    if (message.role === "ai" && details && details.images) {
      details.images.forEach(function (image) {
        var url = api.resolveKnowledgeImageUrl(image && image.url);
        if (url && content.indexOf(url) === -1 && content.indexOf(String(image.url)) === -1) {
          content += "\n\n![" + String(image.alt || "知识库图片").replace(/[\[\]\r\n]/g, "") + "](" + url + ")";
        }
      });
    }
    return content;
  }

  function messageNode(key, message, draft) {
    var details = taskDetails[message.taskId];
    var content = renderedContent(message);
    var signature = JSON.stringify([message.role, content, message.agentName, message.createdAt, draft, details && details.thinking]);
    var saved = nodeMap.get(key);
    if (saved && saved.signature === signature) return saved.node;
    var node = saved ? saved.node : element("div");
    node.className = "msg msg-restored msg-" + message.role + (draft ? " msg-pending" : "");
    node.textContent = "";
    if (message.role === "system") {
      node.textContent = content;
    } else {
      var isUser = message.role === "user";
      if (!isUser) {
        var avatar = element("span", "msg-avatar");
        avatar.setAttribute("aria-hidden", "true");
        avatar.innerHTML = message.role === "agent" ? agentAvatar : aiAvatar;
        node.appendChild(avatar);
      }
      var body = element("div", "msg-body");
      if (!isUser) body.appendChild(element("p", "msg-name", message.role === "agent"
        ? "人工客服 · " + (message.agentName || "客服")
        : "AI 客服 · SID " + currentSession.sessionId));
      if (message.role === "ai" && details && details.thinking) {
        var panel = element("details", "thinking-panel" + (draft ? " is-streaming" : ""));
        panel.open = saved && saved.thinkingOpen !== undefined ? saved.thinkingOpen : !!draft;
        panel.appendChild(element("summary", "", draft ? "正在分析…" : "回答依据"));
        panel.appendChild(element("div", "thinking-content", details.thinking));
        panel.addEventListener("toggle", function () {
          var entry = nodeMap.get(key);
          if (entry) entry.thinkingOpen = panel.open;
        });
        body.appendChild(panel);
      }
      var bubble = element("div", "bubble " + (isUser ? "user-bubble" : "ai-bubble"));
      if (message.role === "ai") renderMarkdown(bubble, content);
      else appendText(bubble, content);
      if (draft && message.role === "ai") bubble.appendChild(element("span", "typing-cursor"));
      body.appendChild(bubble);
      if (message.createdAt || message.time) body.appendChild(element("p", "msg-time", message.time || formatTime(message.createdAt)));
      node.appendChild(body);
    }
    nodeMap.set(key, { node: node, signature: signature, thinkingOpen: saved && saved.thinkingOpen });
    return node;
  }

  function renderMessages(forceBottom) {
    var bottom = messageList.scrollHeight - messageList.scrollTop - messageList.clientHeight < 90;
    var oldHeight = messageList.scrollHeight;
    var oldScroll = messageList.scrollTop;
    var used = new Set();
    var messages = currentSession ? currentSession.messages || [] : [];
    if (hasMoreMessages) {
      var earlier = document.getElementById("load-earlier");
      if (!earlier) {
        earlier = element("button", "service-button load-earlier", "加载更早消息");
        earlier.id = "load-earlier";
        earlier.type = "button";
        earlier.addEventListener("click", loadEarlier);
      }
      earlier.disabled = loadingEarlier;
      earlier.textContent = loadingEarlier ? "加载中…" : "加载更早消息";
      messageList.prepend(earlier);
    } else {
      var oldEarlier = document.getElementById("load-earlier");
      if (oldEarlier) oldEarlier.remove();
    }
    if (currentSession && !messages.length) {
      used.add("welcome");
      messageList.appendChild(messageNode("welcome", { role: "system", content: "你好，请描述你的问题，也可以点击「转人工」请求客服接待。" }, false));
    }
    messages.forEach(function (message, index) {
      var key = "message:" + (message.id === undefined ? "legacy:" + index : message.id);
      used.add(key);
      messageList.appendChild(messageNode(key, message, false));
    });
    if (pendingMessage && !messages.some(function (message) { return message.clientMessageId === pendingMessage.clientMessageId; })) {
      used.add("pending");
      messageList.appendChild(messageNode("pending", { role: "user", content: pendingMessage.content }, true));
    }
    var task = currentSession && currentSession.activeTask;
    if (task && task.status === "running" && currentSession.serviceStatus === "ai") {
      var draftKey = "task:" + task.id;
      used.add(draftKey);
      messageList.appendChild(messageNode(draftKey, { role: "ai", content: task.answer || "正在分析问题…", taskId: task.id }, true));
    }
    nodeMap.forEach(function (saved, key) {
      if (!used.has(key)) { saved.node.remove(); nodeMap.delete(key); }
    });
    if (forceBottom || bottom) messageList.scrollTop = messageList.scrollHeight;
    else if (loadingEarlier) messageList.scrollTop = oldScroll + messageList.scrollHeight - oldHeight;
    else messageList.scrollTop = oldScroll;
  }

  function showError(message, retry) {
    errorLabel.textContent = message || "";
    errorLabel.hidden = !message;
    retryAction = retry || null;
    retryButton.hidden = !retryAction;
  }
  function saveSession() {
    if (!currentSession || currentSession.legacy) return;
    currentSession.pendingMessage = pendingMessage;
    currentSession.taskDetails = taskDetails;
    store.setCurrent(currentSession);
    store.upsert(currentSession);
  }
  function updateControls() {
    var ready = currentSession && currentSession.sessionToken && !loading;
    var status = currentSession && currentSession.serviceStatus;
    var task = currentSession && currentSession.activeTask;
    var canSend = ready && connected && !sending && !actionBusy && !pendingMessage &&
      (status === "human" || (status === "ai" && !task));
    input.disabled = !canSend;
    sendButton.disabled = !canSend || !input.value.trim();
    handoffButton.hidden = !!currentSession && (status !== "ai" || !!currentSession.legacy);
    handoffButton.disabled = !ready || !connected || actionBusy || sending;
    cancelButton.hidden = !ready || status !== "ai" || !task || task.status !== "queued";
    cancelButton.disabled = !connected || actionBusy || sending;
    resumeButton.hidden = status !== "waiting_human";
    resumeButton.disabled = !ready || !connected || actionBusy || sending;
    retryButton.disabled = loading || sending || actionBusy;
    connectionLabel.textContent = connected ? (status === "human" ? "在线 · 人工客服" : "在线 · 客服助手") : "连接未就绪";
    connectionLabel.parentElement.classList.toggle("is-disconnected", !connected);
    if (loading) statusLabel.textContent = "正在恢复会话…";
    else if (!currentSession) statusLabel.textContent = "会话尚未创建";
    else if (currentSession.legacy) statusLabel.textContent = "旧版历史仅供查看，请新建聊天继续咨询";
    else if (status === "closed") statusLabel.textContent = "本次接待已结束，可点击右上角开始新聊天";
    else if (status === "waiting_human") statusLabel.textContent = "正在等待人工客服接入，尚未分配客服";
    else if (status === "human") statusLabel.textContent = "人工客服「" + (currentSession.assignedAgentName || "客服") + "」正在接待";
    else if (task && task.status === "queued") statusLabel.textContent = currentSession.queuePosition === null
      ? "正在排队，等待 AI 服务名额…"
      : "正在排队，前方还有 " + Math.max(0, Number(currentSession.queuePosition) - 1) + " 个会话";
    else if (task && task.status === "cancelling") statusLabel.textContent = "正在取消本轮处理…";
    else if (task) statusLabel.textContent = "AI 正在处理，本轮结束后可继续发送";
    else if (pendingMessage) statusLabel.textContent = "消息发送结果待确认，请点击重试";
    else statusLabel.textContent = "AI 在线，可随时转人工";
    input.placeholder = status === "human" ? "向人工客服发送消息…" : status === "waiting_human" ? "请等待人工接入…" : "输入消息…";
  }

  function applySnapshot(snapshot, requestRevision) {
    if (!snapshot || !currentSession || String(snapshot.sessionId) !== String(currentSession.sessionId)) return;
    var previous = currentSession;
    var incomingVersion = Number(snapshot.serviceVersion || 0);
    var currentVersion = Number(previous.serviceVersion || 0);
    // 接待版本优先于数据库时间；同秒内人工接手也不能被旧 AI 快照覆盖。
    // HTTP 请求期间若已收到新 SSE，旧响应只补不可变消息，任务状态以推送为准。
    var stale = incomingVersion < currentVersion || (incomingVersion === currentVersion && (
      (snapshot.updatedAt && previous.updatedAt && new Date(snapshot.updatedAt) < new Date(previous.updatedAt)) ||
      (requestRevision !== undefined && requestRevision !== snapshotRevision)
    ));
    var task = snapshot.activeTask;
    if (task && previous.activeTask && task.id === previous.activeTask.id &&
      (previous.activeTask.answer || "").length > (task.answer || "").length) {
      task = Object.assign({}, task, { answer: previous.activeTask.answer });
    }
    currentSession = Object.assign({}, previous, stale ? {} : snapshot, {
      sessionToken: previous.sessionToken,
      activeTask: stale ? previous.activeTask : task,
      messages: mergeMessages(previous.messages, snapshot.messages),
    });
    if (!stale && !historyLoaded) {
      hasMoreMessages = !!snapshot.hasMoreMessages;
      nextBeforeMessageId = snapshot.nextBeforeMessageId;
    }
    if (pendingMessage && currentSession.messages.some(function (message) { return message.clientMessageId === pendingMessage.clientMessageId; })) {
      pendingMessage = null;
      if (retryAction === retrySend) showError("");
    }
    saveSession();
    renderMessages(false);
    updateControls();
  }

  function handleAiEvent(payload) {
    var task = currentSession && currentSession.activeTask;
    if (!payload || !task || String(payload.taskId) !== String(task.id) || currentSession.serviceStatus !== "ai") return;
    var data = payload.data || {};
    var detail = taskDetails[task.id] || (taskDetails[task.id] = {});
    if (payload.event === "delta") {
      var chunk = typeof data === "string" ? data : data.content || data.delta || data.text || "";
      if (typeof chunk === "string") task.answer = (task.answer || "") + chunk;
    } else if (payload.event === "thinking") {
      if (data.kind === "summary" || !detail.hasSummary) detail.thinking = data.content || "正在分析…";
      if (data.kind === "summary") detail.hasSummary = true;
    } else if (payload.event === "retrieval") {
      detail.images = Array.isArray(data.referenceImages) ? data.referenceImages : [];
    }
    // done 只描述模型流结束，后台还可能保存记录/摘要；最终状态由 snapshot 决定。
    renderMessages(false);
  }

  function stopConnection() {
    connectionAttempt += 1;
    if (stopSubscription) stopSubscription();
    stopSubscription = null;
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
    connected = false;
  }
  function retryConnection() {
    stopConnection();
    retryDelay = 1000;
    connect(generation);
  }
  async function connect(expectedGeneration) {
    if (!currentSession || !currentSession.sessionToken) return;
    var expectedAttempt = ++connectionAttempt;
    var session = currentSession;
    var requestRevision = snapshotRevision;
    try {
      var snapshot = await api.snapshot(session);
      if (generation !== expectedGeneration || connectionAttempt !== expectedAttempt) return;
      connected = true;
      loading = false;
      applySnapshot(snapshot, requestRevision);
      if (retryAction === retryConnection) showError("");
      stopSubscription = api.subscribe(session, {
        onEvent: function (event, data) {
          if (generation !== expectedGeneration || connectionAttempt !== expectedAttempt) return;
          retryDelay = 1000;
          connected = true;
          if (event === "snapshot") { snapshotRevision += 1; applySnapshot(data); }
          else if (event === "ai-event") { snapshotRevision += 1; handleAiEvent(data); }
          else if (event === "error") onDisconnect(new Error(data.message || "实时消息读取失败"), expectedGeneration);
        },
        onDisconnect: function (error) {
          if (connectionAttempt === expectedAttempt) onDisconnect(error, expectedGeneration);
        },
      });
      updateControls();
    } catch (error) {
      if (generation !== expectedGeneration || connectionAttempt !== expectedAttempt) return;
      loading = false;
      onDisconnect(error, expectedGeneration);
    }
  }
  function onDisconnect(error, expectedGeneration) {
    if (generation !== expectedGeneration) return;
    stopConnection();
    var fatal = [401, 403, 404].indexOf(error.status) !== -1;
    if (!pendingMessage) showError(fatal ? "无法访问该会话：" + error.message + " 请开始新聊天。" : "连接中断，正在重连并恢复消息。", fatal ? null : retryConnection);
    updateControls();
    if (!fatal) {
      reconnectTimer = setTimeout(function () { connect(expectedGeneration); }, retryDelay);
      retryDelay = Math.min(retryDelay * 2, 15000);
    }
  }

  function activate(session) {
    stopConnection();
    generation += 1;
    snapshotRevision = 0;
    currentSession = Object.assign({ messages: [], serviceStatus: "ai", activeTask: null }, session);
    pendingMessage = session.pendingMessage || null;
    taskDetails = session.taskDetails || {};
    hasMoreMessages = false;
    nextBeforeMessageId = null;
    historyLoaded = false;
    loadingEarlier = false;
    loading = !session.legacy;
    sending = false;
    actionBusy = false;
    retryDelay = 1000;
    input.value = "";
    nodeMap.clear();
    messageList.textContent = "";
    showError(pendingMessage ? "上次消息结果待确认，将恢复记录；如仍未出现，请点击重试。" : "", pendingMessage ? retrySend : null);
    store.setCurrent(currentSession);
    renderMessages(true);
    updateControls();
    if (!session.legacy) connect(generation);
  }

  async function newChat(skipConfirm) {
    if (skipConfirm !== true && currentSession && !confirm("开始新聊天？当前记录仍保留在历史中，正在排队或接待的旧会话不会被自动取消。")) return;
    stopConnection();
    generation += 1;
    var expectedGeneration = generation;
    currentSession = null;
    pendingMessage = null;
    store.setCurrent(null);
    loading = true;
    nodeMap.clear();
    messageList.textContent = "";
    showError("");
    updateControls();
    try {
      var session = await api.createSession();
      if (generation !== expectedGeneration) return;
      activate(session);
    } catch (error) {
      if (generation !== expectedGeneration) return;
      loading = false;
      showError("创建会话失败：" + error.message, function () { newChat(true); });
      updateControls();
    }
  }

  function messageId() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") return window.crypto.randomUUID();
    var bytes = new Uint8Array(16);
    window.crypto.getRandomValues(bytes);
    return Array.from(bytes, function (value) { return value.toString(16).padStart(2, "0"); }).join("");
  }
  async function retrySend() {
    if (!pendingMessage || !currentSession || sending) return;
    var expectedGeneration = generation;
    var session = currentSession;
    var outgoing = pendingMessage;
    var requestRevision = snapshotRevision;
    sending = true;
    updateControls();
    try {
      var snapshot = await api.send(session, outgoing);
      if (generation !== expectedGeneration) return;
      // POST 成功本身可确认已接收，即便该消息已不在最近一页。
      if (pendingMessage && pendingMessage.clientMessageId === outgoing.clientMessageId) pendingMessage = null;
      showError("");
      connected = true;
      applySnapshot(snapshot, requestRevision);
    } catch (error) {
      if (generation !== expectedGeneration) return;
      // SSE 已确认这条消息时，不因稍晚的 HTTP 错误再显示重复发送入口。
      if (pendingMessage && [400, 413, 422, 429].indexOf(error.status) !== -1) {
        input.value = outgoing.content;
        pendingMessage = null;
        resizeInput();
        showError("消息未发送：" + error.message + " 请调整后重试。");
      } else if (pendingMessage) showError("发送结果待确认：" + error.message, retrySend);
      saveSession();
    } finally {
      if (generation === expectedGeneration) {
        sending = false;
        renderMessages(false);
        updateControls();
      }
    }
  }
  function send() {
    if (sendButton.disabled) return;
    var content = input.value.trim();
    if (!content) return;
    pendingMessage = { clientMessageId: messageId(), content: content };
    input.value = "";
    resizeInput();
    saveSession();
    renderMessages(true);
    retrySend();
  }

  async function action(name) {
    if (!currentSession || actionBusy || sending) return;
    var expectedGeneration = generation;
    var requestRevision = snapshotRevision;
    actionBusy = true;
    updateControls();
    try {
      var snapshot = await api.action(currentSession, name);
      if (generation !== expectedGeneration) return;
      showError(name === "resume-ai" ? "已返回 AI。之前取消的问题不会自动重发，请重新输入。" : "");
      applySnapshot(snapshot, requestRevision);
    } catch (error) {
      if (generation !== expectedGeneration) return;
      showError("操作失败：" + error.message, function () { action(name); });
    } finally {
      if (generation === expectedGeneration) { actionBusy = false; updateControls(); }
    }
  }

  async function loadEarlier() {
    if (!currentSession || !hasMoreMessages || !nextBeforeMessageId || loadingEarlier) return;
    var expectedGeneration = generation;
    loadingEarlier = true;
    renderMessages(false);
    try {
      var snapshot = await api.snapshot(currentSession, nextBeforeMessageId);
      if (generation !== expectedGeneration) return;
      currentSession.messages = mergeMessages(currentSession.messages, snapshot.messages);
      hasMoreMessages = !!snapshot.hasMoreMessages;
      nextBeforeMessageId = snapshot.nextBeforeMessageId;
      historyLoaded = true;
      renderMessages(false);
    } catch (error) {
      if (generation === expectedGeneration) showError("历史消息加载失败：" + error.message, loadEarlier);
    } finally {
      if (generation === expectedGeneration) { loadingEarlier = false; renderMessages(false); }
    }
  }

  function closeHistory() {
    historyMask.classList.remove("show");
    historyPanel.classList.remove("show");
    historyPanel.setAttribute("aria-hidden", "true");
  }
  function renderHistory() {
    historyList.textContent = "";
    var sessions = store.loadAll();
    if (!sessions.length) historyList.appendChild(element("div", "history-empty", "暂无历史会话"));
    sessions.forEach(function (session) {
      var item = element("div", "history-item");
      var main = element("button", "history-item-main");
      main.type = "button";
      main.appendChild(element("p", "history-item-title", session.title || "未命名会话"));
      main.appendChild(element("p", "history-item-meta", formatTime(session.updatedAt || session.createdAt, true) + (session.legacy ? " · 旧版只读" : " · " + (session.messages || []).length + " 条缓存消息")));
      main.addEventListener("click", function () { activate(session); closeHistory(); });
      var remove = element("button", "history-item-del", "×");
      remove.type = "button";
      remove.setAttribute("aria-label", "删除本地历史记录");
      remove.addEventListener("click", function () {
        if (!confirm("仅删除本地历史记录，不会取消后台任务或删除后台记录。确定继续？")) return;
        store.remove(session.sessionId, session.legacy);
        if (currentSession && String(currentSession.sessionId) === String(session.sessionId) && !!currentSession.legacy === !!session.legacy) {
          stopConnection();
          generation += 1;
          currentSession = null;
          pendingMessage = null;
          store.setCurrent(null);
          loading = false;
          nodeMap.clear();
          messageList.textContent = "";
          showError("本地记录已移除，可点击右上角新建聊天。");
          updateControls();
        }
        renderHistory();
      });
      item.appendChild(main);
      item.appendChild(remove);
      historyList.appendChild(item);
    });
  }
  function resizeInput() {
    input.style.height = "auto";
    input.style.height = Math.min(input.scrollHeight, 96) + "px";
  }

  sendButton.addEventListener("click", send);
  document.getElementById("btn-new-chat").addEventListener("click", function () { newChat(false); });
  document.getElementById("btn-history").addEventListener("click", function () {
    renderHistory();
    historyMask.classList.add("show");
    historyPanel.classList.add("show");
    historyPanel.setAttribute("aria-hidden", "false");
  });
  document.getElementById("btn-close-history").addEventListener("click", closeHistory);
  historyMask.addEventListener("click", closeHistory);
  handoffButton.addEventListener("click", function () { action("handoff"); });
  cancelButton.addEventListener("click", function () { action("cancel"); });
  resumeButton.addEventListener("click", function () { action("resume-ai"); });
  retryButton.addEventListener("click", function () { if (retryAction) retryAction(); });
  input.addEventListener("input", function () { resizeInput(); updateControls(); });
  input.addEventListener("keydown", function (event) {
    if (event.key === "Enter" && !event.shiftKey && !event.isComposing) { event.preventDefault(); send(); }
  });
  window.addEventListener("online", function () { if (currentSession && currentSession.sessionToken && !connected) retryConnection(); });
  window.addEventListener("pagehide", stopConnection);
  window.addEventListener("pageshow", function (event) { if (event.persisted && currentSession && currentSession.sessionToken) retryConnection(); });

  var saved = store.getCurrent();
  if (saved && saved.sessionId && saved.sessionToken) activate(saved);
  else newChat(true);
})();
