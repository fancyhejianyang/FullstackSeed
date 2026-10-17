/** 正式客服接口：会话凭证鉴权、持久化消息和独立 SSE 订阅，不提供演示兜底。 */
(function () {
  "use strict";

  var config = {
    baseUrl: "http://localhost:4000",
    path: "/api/customer-service/sessions",
    appid: "1",
  };

  function headers(session, streaming) {
    var result = { appid: config.appid, Accept: streaming ? "text/event-stream" : "application/json" };
    if (session && session.sessionToken) result["x-session-token"] = session.sessionToken;
    return result;
  }

  function unwrap(body) {
    return body && Object.prototype.hasOwnProperty.call(body, "data") ? body.data : body;
  }

  async function responseError(response) {
    var message = "请求失败（HTTP " + response.status + "），请稍后重试。";
    try {
      var body = await response.json();
      var detail = body.message || body.errorMessage || (body.data && body.data.message);
      if (Array.isArray(detail)) detail = detail.join("；");
      if (typeof detail === "string") message = detail;
    } catch (error) {
      // 非 JSON 的代理错误页不直接显示为聊天内容。
    }
    var error = new Error(message);
    error.status = response.status;
    return error;
  }

  async function request(method, path, session, data) {
    var controller = new AbortController();
    var timer = setTimeout(function () { controller.abort(); }, 25000);
    try {
      var requestHeaders = headers(session, false);
      if (data !== undefined) requestHeaders["Content-Type"] = "application/json";
      var response = await fetch(config.baseUrl + config.path + path, {
        method: method,
        headers: requestHeaders,
        body: data === undefined ? undefined : JSON.stringify(data),
        signal: controller.signal,
        cache: "no-store",
      });
      if (!response.ok) throw await responseError(response);
      return unwrap(await response.json());
    } catch (error) {
      if (error.name === "AbortError") throw new Error("请求超时，请重试；重试不会重复发送同一条消息。");
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  function sessionPath(session) {
    if (!session || !session.sessionId || !session.sessionToken) {
      throw new Error("该会话缺少访问凭证，请开始新聊天。");
    }
    return "/" + encodeURIComponent(session.sessionId);
  }

  function parseBlock(block, onEvent) {
    var event = "message";
    var data = [];
    block.split(/\r?\n/).forEach(function (line) {
      if (line.indexOf("event:") === 0) event = line.slice(6).trim();
      if (line.indexOf("data:") === 0) data.push(line.slice(5).replace(/^ /, ""));
    });
    if (!data.length) return;
    var payload;
    try { payload = JSON.parse(data.join("\n")); } catch (error) { return; }
    onEvent(event, payload);
  }

  // 断开订阅不等于取消任务。排队、AI 生成和人工聊天均由服务端持续管理。
  function subscribe(session, handlers) {
    var controller = new AbortController();
    var stopped = false;
    var idleTimer;
    function touch() {
      clearTimeout(idleTimer);
      idleTimer = setTimeout(function () { controller.abort(); }, 45000);
    }
    async function run() {
      var reader;
      try {
        touch();
        var response = await fetch(config.baseUrl + config.path + sessionPath(session) + "/events", {
          headers: headers(session, true),
          signal: controller.signal,
          cache: "no-store",
        });
        if (!response.ok) throw await responseError(response);
        if (!response.body || !response.body.getReader) throw new Error("当前浏览器不支持实时消息，请更换浏览器。");
        reader = response.body.getReader();
        var decoder = new TextDecoder("utf-8");
        var buffer = "";
        while (!stopped) {
          var result = await reader.read();
          if (result.done) throw new Error("实时连接已断开，正在恢复会话…");
          touch();
          buffer += decoder.decode(result.value, { stream: true });
          var blocks = buffer.split(/\r?\n\r?\n/);
          buffer = blocks.pop();
          if (buffer.length > 1024 * 1024) throw new Error("实时消息格式异常，请重试。");
          blocks.forEach(function (block) {
            if (!stopped) parseBlock(block, handlers.onEvent);
          });
        }
      } catch (error) {
        if (!stopped && handlers.onDisconnect) handlers.onDisconnect(error);
      } finally {
        clearTimeout(idleTimer);
        controller.abort();
        if (reader) reader.releaseLock();
      }
    }
    run();
    return function () {
      stopped = true;
      clearTimeout(idleTimer);
      controller.abort();
    };
  }

  // 保留知识库公开图片目录校验，拒绝脚本协议、任意相对路径和路径回退。
  function resolveKnowledgeImageUrl(value) {
    var raw = String(value || "").replace(/^<|>$/g, "").trim();
    if (!raw) return "";
    try {
      var url = new URL(raw);
      return url.protocol === "http:" || url.protocol === "https:" ? url.href : "";
    } catch (error) {
      if (!/^\/uploads\/[A-Za-z0-9._~%/-]+(?:\?[A-Za-z0-9._~%&=+/-]*)?$/.test(raw) || raw.indexOf("..") !== -1) return "";
      try { return new URL(raw, config.baseUrl).href; } catch (urlError) { return ""; }
    }
  }

  window.ReceptionAPI = {
    getConfig: function () { return Object.assign({}, config); },
    createSession: async function () {
      var result = await request("POST", "/init", null, {});
      if (!result || !result.sessionId || !result.sessionToken) throw new Error("创建会话失败：服务端没有返回完整会话凭证。");
      return result;
    },
    snapshot: function (session, beforeMessageId) {
      return request("GET", sessionPath(session) + (beforeMessageId ? "?beforeMessageId=" + encodeURIComponent(beforeMessageId) : ""), session);
    },
    send: function (session, message) { return request("POST", sessionPath(session) + "/messages", session, message); },
    action: function (session, name) {
      if (["handoff", "resume-ai", "cancel"].indexOf(name) === -1) throw new Error("未知会话操作");
      return request("POST", sessionPath(session) + "/" + name, session, {});
    },
    subscribe: subscribe,
    resolveKnowledgeImageUrl: resolveKnowledgeImageUrl,
  };
})();
