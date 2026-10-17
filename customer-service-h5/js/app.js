/**
 * AI 客服 - 页面逻辑
 * 纯原生 JS，HTML/CSS/JS 分离
 * - 流式交互由 API 层（js/api.js）提供
 * - 会话记录由存储层（js/store.js）持久化到 localStorage（含 sessionId）
 */
(function () {
  "use strict";

  /* ---------- DOM 引用 ---------- */
  var messageList = document.getElementById("message-list");
  var chatInput = document.getElementById("chat-input");
  var btnSend = document.getElementById("btn-send");
  var btnNewChat = document.getElementById("btn-new-chat");
  var btnHistory = document.getElementById("btn-history");
  var historyMask = document.getElementById("history-mask");
  var historyPanel = document.getElementById("history-panel");
  var historyList = document.getElementById("history-list");
  var btnCloseHistory = document.getElementById("btn-close-history");

  /* ---------- 会话状态 ---------- */
  var currentSession = {
    sessionId: null,
    title: "",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    messages: [], // { role, content, time }
    retrieval: null,
  };
  var streaming = false; // 是否有流式回复进行中

  /* ---------- 工具 ---------- */
  function pad(n) {
    return String(n).padStart(2, "0");
  }

  function nowTime() {
    var d = new Date();
    return pad(d.getHours()) + ":" + pad(d.getMinutes());
  }

  // 历史列表时间显示：MM-DD HH:mm
  function formatTime(ts) {
    var d = new Date(ts);
    var now = new Date();
    var sameDay =
      d.getFullYear() === now.getFullYear() &&
      d.getMonth() === now.getMonth() &&
      d.getDate() === now.getDate();
    var hm = pad(d.getHours()) + ":" + pad(d.getMinutes());
    if (sameDay) return "今天 " + hm;
    return pad(d.getMonth() + 1) + "-" + pad(d.getDate()) + " " + hm;
  }

  function scrollToBottom() {
    messageList.scrollTop = messageList.scrollHeight;
  }

  /* ---------- 消息渲染 ---------- */
  var AI_AVATAR_SVG =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">' +
    '<rect x="4" y="7" width="16" height="12" rx="3"></rect>' +
    '<path d="M9 12h.01M15 12h.01M9 16h6"></path>' +
    '<path d="M12 7V4"></path><circle cx="12" cy="4" r="1"></circle></svg>';

  // 客服昵称行：显示会话 ID 前 8 位，便于直观验证 sessionId 变化
  function makeNameEl() {
    var name = document.createElement("p");
    name.className = "msg-name";
    var sid = currentSession.sessionId
      ? String(currentSession.sessionId).slice(0, 8)
      : "-";
    name.textContent = "AI 客服 · SID " + sid;
    return name;
  }

  function makeTimeEl(time) {
    var el = document.createElement("p");
    el.className = "msg-time";
    el.textContent = time || nowTime();
    return el;
  }

  function getSafeExternalUrl(value) {
    try {
      var url = new URL(String(value || "").replace(/^<|>$/g, "").trim());
      return url.protocol === "http:" || url.protocol === "https:" ? url.href : "";
    } catch (err) {
      return "";
    }
  }

  function getSafeKnowledgeImageUrl(value) {
    return window.ChatAPI && typeof window.ChatAPI.resolveKnowledgeImageUrl === "function"
      ? window.ChatAPI.resolveKnowledgeImageUrl(value)
      : "";
  }

  function appendTextWithLineBreaks(container, text) {
    String(text || "").split("\n").forEach(function (line, index) {
      if (index > 0) container.appendChild(document.createElement("br"));
      container.appendChild(document.createTextNode(line));
    });
  }

  // 只识别受控的 Markdown 图片和链接，避免将模型输出作为 HTML 注入页面。
  function renderMarkdownContent(container, content) {
    var tokenPattern =
      /!\[([^\]]*)\]\(\s*(<?(?:https?:\/\/|\/uploads\/)[^\s)>]+>?)\s*(?:["'][^)]*["'])?\s*\)|\[([^\]]+)\]\(\s*(<?https?:\/\/[^\s)>]+>?)\s*\)/gi;
    var text = String(content || "");
    var lastIndex = 0;
    var match;

    container.textContent = "";
    while ((match = tokenPattern.exec(text))) {
      appendTextWithLineBreaks(container, text.slice(lastIndex, match.index));
      var isImage = match[1] !== undefined;
      var label = (isImage ? match[1] : match[3]).trim();
      var url = isImage
        ? getSafeKnowledgeImageUrl(match[2])
        : getSafeExternalUrl(match[4]);

      if (!url) {
        appendTextWithLineBreaks(container, match[0]);
      } else if (isImage) {
        var figure = document.createElement("figure");
        figure.className = "knowledge-image";
        var image = document.createElement("img");
        image.src = url;
        image.alt = label || "知识库图片";
        image.loading = "lazy";
        image.referrerPolicy = "no-referrer";
        figure.appendChild(image);
        if (label) {
          var caption = document.createElement("figcaption");
          caption.textContent = label;
          figure.appendChild(caption);
        }
        container.appendChild(figure);
      } else {
        var link = document.createElement("a");
        link.className = "knowledge-link";
        link.href = url;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.textContent = label || url;
        container.appendChild(link);
      }
      lastIndex = tokenPattern.lastIndex;
    }
    appendTextWithLineBreaks(container, text.slice(lastIndex));
  }

  // 渲染一条消息（不落存储，由调用方负责）
  function renderMessage(role, content, time) {
    var isUser = role === "user";

    var msg = document.createElement("div");
    msg.className = "msg " + (isUser ? "msg-user" : "msg-ai");

    if (!isUser) {
      var avatar = document.createElement("span");
      avatar.className = "msg-avatar";
      avatar.setAttribute("aria-hidden", "true");
      avatar.innerHTML = AI_AVATAR_SVG;
      msg.appendChild(avatar);
    }

    var body = document.createElement("div");
    body.className = "msg-body";

    if (!isUser) {
      body.appendChild(makeNameEl());
    }

    var bubble = document.createElement("div");
    bubble.className = "bubble " + (isUser ? "user-bubble" : "ai-bubble");
    if (isUser) appendTextWithLineBreaks(bubble, content);
    else renderMarkdownContent(bubble, content);
    body.appendChild(bubble);
    body.appendChild(makeTimeEl(time));

    msg.appendChild(body);
    messageList.appendChild(msg);
    scrollToBottom();
  }

  /* 客服"正在输入"指示 */
  function showTyping() {
    var msg = document.createElement("div");
    msg.className = "msg msg-ai";
    msg.id = "typing-msg";
    msg.innerHTML =
      '<span class="msg-avatar" aria-hidden="true">' + AI_AVATAR_SVG + "</span>" +
      '<div class="msg-body"><div class="bubble ai-bubble">' +
      '<span class="typing-indicator"><span></span><span></span><span></span></span>' +
      "</div></div>";
    messageList.appendChild(msg);
    scrollToBottom();
  }

  function hideTyping() {
    var el = document.getElementById("typing-msg");
    if (el) el.remove();
  }

  /**
   * 流式消息渲染：创建客服消息骨架（带闪烁光标），
   * 每收到一个 chunk 追加到光标前，结束后补时间戳
   */
  function startStreaming() {
    var bubbleEl = null;
    var cursorEl = null;
    var msgEl = null;
    var bodyEl = null;
    var thinkingPanelEl = null;
    var thinkingSummaryEl = null;
    var thinkingContentEl = null;
    var hasThinkingSummary = false;
    var answerText = "";
    var started = false;

    function ensureMessage() {
      if (started) return;
      started = true;
      hideTyping();

      msgEl = document.createElement("div");
      msgEl.className = "msg msg-ai";

      var avatar = document.createElement("span");
      avatar.className = "msg-avatar";
      avatar.setAttribute("aria-hidden", "true");
      avatar.innerHTML = AI_AVATAR_SVG;
      msgEl.appendChild(avatar);

      bodyEl = document.createElement("div");
      bodyEl.className = "msg-body";
      bodyEl.appendChild(makeNameEl());

      msgEl.appendChild(bodyEl);
      messageList.appendChild(msgEl);
      scrollToBottom();
    }

    function ensureBubble() {
      ensureMessage();
      if (bubbleEl) return;

      bubbleEl = document.createElement("div");
      bubbleEl.className = "bubble ai-bubble";
      cursorEl = document.createElement("span");
      cursorEl.className = "typing-cursor";
      bubbleEl.appendChild(cursorEl);
      bodyEl.appendChild(bubbleEl);
    }

    function ensureThinkingPanel() {
      ensureMessage();
      if (thinkingPanelEl) return;

      thinkingPanelEl = document.createElement("details");
      thinkingPanelEl.className = "thinking-panel is-streaming";
      thinkingPanelEl.open = true;

      thinkingSummaryEl = document.createElement("summary");
      thinkingSummaryEl.textContent = "正在思考…";
      thinkingPanelEl.appendChild(thinkingSummaryEl);

      thinkingContentEl = document.createElement("div");
      thinkingContentEl.className = "thinking-content";
      thinkingPanelEl.appendChild(thinkingContentEl);

      bodyEl.insertBefore(thinkingPanelEl, bubbleEl || null);
      scrollToBottom();
    }

    function renderStreamAnswer() {
      renderMarkdownContent(bubbleEl, answerText);
      if (cursorEl) bubbleEl.appendChild(cursorEl);
    }

    return {
      append: function (chunk) {
        ensureBubble();
        answerText += chunk;
        renderStreamAnswer();
        scrollToBottom();
      },
      appendReferenceImages: function (images) {
        var hasAddedImage = false;
        (Array.isArray(images) ? images : []).forEach(function (image) {
          var url = getSafeKnowledgeImageUrl(image && image.url);
          if (!url || answerText.indexOf(url) !== -1) return;
          answerText +=
            (hasAddedImage ? "\n" : "\n\n相关图片：\n") +
            "![" + String((image && image.alt) || "知识库图片") + "](" + url + ")";
          hasAddedImage = true;
        });
        if (hasAddedImage) renderStreamAnswer();
      },
      getContent: function () {
        return answerText;
      },
      // 服务端只发送独立生成的用户可见摘要，不透传模型原始推理文本。
      appendThinking: function (chunk, payload) {
        ensureThinkingPanel();
        if (payload && payload.kind === "summary") {
          thinkingContentEl.textContent = chunk;
          hasThinkingSummary = true;
        } else if (!hasThinkingSummary) {
          thinkingContentEl.textContent = chunk || "正在分析问题并生成回答…";
        }
        scrollToBottom();
      },
      done: function () {
        ensureBubble();
        if (cursorEl) {
          cursorEl.remove();
          cursorEl = null;
        }
        renderStreamAnswer();
        if (thinkingPanelEl) {
          thinkingPanelEl.classList.remove("is-streaming");
          thinkingSummaryEl.textContent = hasThinkingSummary
            ? "思考过程"
            : "已完成分析";
        }
        bodyEl.appendChild(makeTimeEl());
        scrollToBottom();
      },
    };
  }

  /* ---------- 会话持久化 ---------- */
  // 保存消息到当前会话并写盘
  function pushMessage(role, content, time) {
    currentSession.messages.push({
      role: role,
      content: content,
      time: time || nowTime(),
    });
    currentSession.updatedAt = Date.now();
    // 会话标题：取第一条用户消息
    if (!currentSession.title && role === "user") {
      currentSession.title =
        content.length > 12 ? content.slice(0, 12) + "…" : content;
    }
    ChatStore.upsert(currentSession);
  }

  /* ---------- 发送逻辑（流式） ---------- */
  function send() {
    var text = chatInput.value.trim();
    if (!text) return;

    if (currentSession.sessionId == null) {
      console.warn("会话尚未就绪，请稍候再试");
      return;
    }
    if (streaming) return; // 回复进行中，忽略发送

    chatInput.value = "";
    autoResize();
    setSendState();

    var userTime = nowTime();
    renderMessage("user", text, userTime);
    pushMessage("user", text, userTime);

    showTyping();
    streaming = true;

    var stream = startStreaming();
    var fullText = "";
    var referenceImages = [];
    var failed = false;

    ChatAPI.sendMessage(currentSession.sessionId, text, {
      onMeta: function (meta) {
        if (meta && meta.sessionId != null) {
          currentSession.sessionId = meta.sessionId;
        }
        if (meta && meta.retrievalConfigId != null) {
          currentSession.retrieval = {
            retrievalConfigId: meta.retrievalConfigId,
            retrievalConfigName: meta.retrievalConfigName || "",
            hasReference: null,
          };
        }
      },
      onRetrieval: function (info) {
        currentSession.retrieval = Object.assign(
          currentSession.retrieval || {},
          info || {}
        );
        referenceImages = Array.isArray(info && info.referenceImages)
          ? info.referenceImages
          : [];
        if (info && info.retrievalConfigId && info.hasReference === false) {
          console.warn(
            "本次已绑定知识库检索配置，但没有命中可用知识库内容:",
            info
          );
        } else if (info && info.hasReference) {
          console.info("本次已命中知识库参考资料:", info);
        }
      },
      onChunk: function (chunk) {
        if (failed) return;
        fullText += chunk;
        stream.append(chunk);
      },
      onThinkingChunk: function (chunk) {
        if (failed) return;
        stream.appendThinking(chunk);
      },
      onDone: function () {
        if (failed) return;
        streaming = false;
        stream.appendReferenceImages(referenceImages);
        stream.done();
        pushMessage("ai", stream.getContent() || fullText || "（无回复内容）", nowTime());
      },
      onError: function (err) {
        failed = true;
        streaming = false;
        hideTyping();
        var msg =
          err && (err.message || err.errorMessage)
            ? String(err.message || err.errorMessage)
            : "抱歉，服务暂时开小差了，请稍后再试。";
        renderMessage("ai", msg);
        pushMessage("ai", msg);
        console.error("chat error:", err);
      },
    });
  }

  function setSendState() {
    btnSend.disabled = !chatInput.value.trim();
  }

  function autoResize() {
    chatInput.style.height = "auto";
    chatInput.style.height = Math.min(chatInput.scrollHeight, 96) + "px";
  }

  /* ---------- 新聊天 ---------- */
  function newChat() {
    var hasMessages = currentSession.messages.length > 0;
    if (hasMessages && !confirm("确定要开始新聊天吗？当前对话记录将被清空。")) {
      return;
    }
    if (streaming) {
      alert("回复正在输出中，请稍候再开始新聊天。");
      return;
    }

    // 重置会话状态（历史记录已由 pushMessage 实时保存）
    currentSession = {
      sessionId: null,
      title: "",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      messages: [],
      retrieval: null,
    };

    messageList.innerHTML = "";
    renderDate();

    // 调用服务端 init 接口创建会话，成功后播放欢迎语
    ChatAPI.createSession().then(function (sid) {
      currentSession.sessionId = sid;
      console.log("新会话 sessionId:", currentSession.sessionId);
      playWelcome();
    });
  }

  function renderDate() {
    var date = document.createElement("div");
    date.className = "chat-date";
    date.textContent = "今天";
    messageList.appendChild(date);
  }

  // 流式播放欢迎语
  function playWelcome() {
    var stream = startStreaming();
    var welcome =
      "你好，我是 AI 客服助手 👋\n很高兴为你服务，有什么可以帮你的吗？";
    var chars = Array.from(welcome);
    var i = 0;
    (function play() {
      if (i < chars.length) {
        stream.append(chars[i++]);
        setTimeout(play, 40 + Math.random() * 60);
      } else {
        stream.done();
      }
    })();
  }

  /* ---------- 历史会话 ---------- */
  function openHistory() {
    renderHistory();
    historyMask.classList.add("show");
    historyPanel.classList.add("show");
    historyPanel.setAttribute("aria-hidden", "false");
  }

  function closeHistory() {
    historyMask.classList.remove("show");
    historyPanel.classList.remove("show");
    historyPanel.setAttribute("aria-hidden", "true");
  }

  function renderHistory() {
    var sessions = ChatStore.loadAll();
    historyList.innerHTML = "";

    if (sessions.length === 0) {
      var empty = document.createElement("div");
      empty.className = "history-empty";
      empty.textContent = "暂无历史会话\n开始聊天后会自动保存";
      historyList.appendChild(empty);
      return;
    }

    sessions.forEach(function (session) {
      var item = document.createElement("div");
      item.className = "history-item";
      item.setAttribute("data-session-id", session.sessionId);

      var main = document.createElement("div");
      main.className = "history-item-main";

      var title = document.createElement("p");
      title.className = "history-item-title";
      title.textContent = session.title || "未命名会话";

      var meta = document.createElement("p");
      meta.className = "history-item-meta";
      meta.textContent =
        formatTime(session.updatedAt || session.createdAt) +
        " · " +
        session.messages.length +
        " 条消息";

      main.appendChild(title);
      main.appendChild(meta);

      var del = document.createElement("button");
      del.className = "history-item-del";
      del.type = "button";
      del.setAttribute("aria-label", "删除该会话");
      del.innerHTML =
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">' +
        '<path d="M3 6h18"></path>' +
        '<path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2"></path>' +
        '<path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path></svg>';

      item.appendChild(main);
      item.appendChild(del);
      historyList.appendChild(item);
    });
  }

  // 恢复历史会话到聊天页，可继续对话
  function restoreSession(sessionId) {
    if (streaming) {
      alert("回复正在输出中，请稍候再切换会话。");
      return;
    }
    var session = ChatStore.get(sessionId);
    if (!session) return;

    currentSession = JSON.parse(JSON.stringify(session));

    messageList.innerHTML = "";
    renderDate();
    currentSession.messages.forEach(function (m) {
      renderMessage(m.role, m.content, m.time);
    });

    console.log("恢复会话 sessionId:", currentSession.sessionId);
    closeHistory();
  }

  // 删除历史会话；若删除的是当前会话，重置为新聊天
  function deleteSession(sessionId) {
    ChatStore.remove(sessionId);
    if (
      currentSession.sessionId != null &&
      String(currentSession.sessionId) === String(sessionId)
    ) {
      currentSession = {
        sessionId: null,
        title: "",
        createdAt: Date.now(),
        updatedAt: Date.now(),
        messages: [],
        retrieval: null,
      };
      messageList.innerHTML = "";
      renderDate();
      ChatAPI.createSession().then(function (sid) {
        currentSession.sessionId = sid;
        playWelcome();
      });
    }
    renderHistory();
  }

  /* ---------- 事件绑定 ---------- */
  btnSend.addEventListener("click", send);
  btnNewChat.addEventListener("click", newChat);
  btnHistory.addEventListener("click", openHistory);
  btnCloseHistory.addEventListener("click", closeHistory);
  historyMask.addEventListener("click", closeHistory);

  // 历史列表事件委托：点击项恢复会话，点删除按钮删除
  historyList.addEventListener("click", function (e) {
    var delBtn = e.target.closest(".history-item-del");
    var item = e.target.closest(".history-item");
    if (!item) return;
    var sid = item.getAttribute("data-session-id");
    if (delBtn) {
      deleteSession(sid);
    } else {
      restoreSession(sid);
    }
  });

  chatInput.addEventListener("input", function () {
    setSendState();
    autoResize();
  });

  chatInput.addEventListener("keydown", function (e) {
    // 回车发送，Shift+回车换行
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  });

  /* ---------- 初始化：开始第一个会话 ---------- */
  newChat();
})();
