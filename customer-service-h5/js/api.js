/**
 * API 层：对接真实后端（SSE 流式输出）
 *
 * 接口：POST {baseUrl}/api/knowledge-ai-chat/ask/stream
 * 请求头：
 *   Content-Type: application/json
 *   Accept: text/event-stream
 *   appid: <应用 ID>（后端按 appid + 来源域名校验，无需用户登录）
 * 请求体：
 *   {
 *     "question": "用户问题",
 *     "sessionId": 123,          // 会话 ID（每次新聊天由 init 接口生成）
 *     "model": "qwen-plus",
 *     "systemPrompt": "系统提示词",
 *     "title": "会话标题"
 *   }
 *
 * 若真实接口不可用（未启动 / CORS / 网络错误），自动降级为本地 mock 流式输出，
 * 保证页面交互可预览，详情见 console.warn。
 */
(function () {
  "use strict";

  /* ---------- 配置 ---------- */
  var CONFIG = {
    baseUrl: "http://localhost:4000",
    path: "/api/knowledge-ai-chat/ask/stream",
    initPath: "/api/knowledge-ai-chat/sessions/init",
    appid: "1", // 应用 ID，从请求头传入（ask/stream 接口）
    model: "qwen-plus",
    systemPrompt: "你是一个简洁、准确的中文助手",
    defaultTitle: "AI 客服会话",
  };

  // 知识库图片可能由后端以 /uploads/... 返回。本页面与 API 分域部署时，
  // 统一按 API 服务地址解析，避免错误地请求到 H5 自身的 images 目录。
  function resolveKnowledgeImageUrl(value) {
    var raw = String(value || "").replace(/^<|>$/g, "").trim();
    if (!raw) return "";
    try {
      var externalUrl = new URL(raw);
      return externalUrl.protocol === "http:" || externalUrl.protocol === "https:"
        ? externalUrl.href
        : "";
    } catch (err) {
      // 仅接受后端公开上传目录，不能把任意相对路径作为页面资源请求。
      if (
        !/^\/uploads\/[A-Za-z0-9._~%/-]+(?:\?[A-Za-z0-9._~%&=+/-]*)?$/.test(raw) ||
        raw.indexOf("..") !== -1
      ) {
        return "";
      }
      try {
        return new URL(raw, CONFIG.baseUrl).href;
      } catch (urlError) {
        return "";
      }
    }
  }

  /* ---------- 创建会话 ---------- */
  // 调用服务端 init 接口创建会话，获取 sessionId（不再本地生成）
  // POST {baseUrl}/api/knowledge-ai-chat/sessions/init
  // Body: { "appid": "app_xxxxx" }
  function createSession() {
    return fetch(CONFIG.baseUrl + CONFIG.initPath, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "appId": CONFIG.appid
      },
    })
      .then(function (res) {
        if (!res.ok) {
          throw new Error("HTTP " + res.status + " " + res.statusText);
        }
        return res.json();
      })
      .then(function (data) {
        var sid = extractSessionId(data);
        if (sid == null) {
          throw new Error("响应中未找到 sessionId: " + JSON.stringify(data));
        }
        return sid;
      })
      .catch(function (err) {
        // init 失败时降级为本地生成，保证页面可用
        console.warn("init 会话失败，降级为本地生成 sessionId:", err);
        return Date.now() * 1000 + Math.floor(Math.random() * 1000);
      });
  }

  // 从 init 接口响应中提取 sessionId，兼容常见返回结构
  function extractSessionId(data) {
    if (data == null) return null;
    if (typeof data === "number") return data;
    if (typeof data === "string" && /^\d+$/.test(data)) return parseInt(data, 10);
    if (typeof data === "object") {
      var keys = ["sessionId", "session_id", "sessionID", "sid", "id"];
      for (var i = 0; i < keys.length; i++) {
        var v = data[keys[i]];
        if (v != null) return v;
      }
      if (data.data != null) return extractSessionId(data.data);
    }
    return null;
  }

  /* ---------- SSE 解析 ---------- */
  function parseJsonData(data) {
    try {
      return JSON.parse(data);
    } catch (e) {
      return data;
    }
  }

  // 从 data 行提取文本：优先 JSON 常见字段，非 JSON 直接当文本
  function extractText(data) {
    var obj = parseJsonData(data);
    if (typeof obj === "string") return obj;

    var candidates = ["content", "delta", "text", "message", "data", "answer"];
    for (var i = 0; i < candidates.length; i++) {
      var v = obj[candidates[i]];
      if (typeof v === "string" && v.length > 0) return v;
    }
    // OpenAI 兼容格式
    if (obj.choices && obj.choices[0]) {
      var c = obj.choices[0];
      if (c.delta && typeof c.delta.content === "string") return c.delta.content;
      if (c.message && typeof c.message.content === "string") return c.message.content;
      if (typeof c.text === "string") return c.text;
    }
    return null;
  }

  // 按 SSE 消息块解析，避免把 done/meta/retrieval 的 data 当作正文输出
  function parseSSEBlock(block, handlers) {
    var lines = block.split(/\r?\n/);
    var eventName = "message";
    var dataLines = [];

    lines.forEach(function (line) {
      var t = line.trim();
      if (t === "" || t.charAt(0) === ":") return;
      if (t.indexOf("event:") === 0) {
        eventName = t.slice(6).trim() || "message";
      } else if (t.indexOf("data:") === 0) {
        dataLines.push(t.slice(5).trim());
      }
    });

    if (dataLines.length === 0) return;

    var data = dataLines.join("\n");
    if (data === "[DONE]" || eventName === "done") {
      handlers.onDone && handlers.onDone(parseJsonData(data));
      return;
    }
    if (eventName === "meta") {
      handlers.onMeta && handlers.onMeta(parseJsonData(data));
      return;
    }
    if (eventName === "retrieval") {
      handlers.onRetrieval && handlers.onRetrieval(parseJsonData(data));
      return;
    }
    if (eventName === "thinking") {
      var thinkingPayload = parseJsonData(data);
      var thinkingText = extractText(data);
      if (thinkingText) {
        handlers.onThinkingChunk && handlers.onThinkingChunk(thinkingText, thinkingPayload);
      }
      return;
    }
    if (eventName === "error") {
      handlers.onServerError && handlers.onServerError(parseJsonData(data));
      return;
    }
    if (eventName === "delta" || eventName === "message") {
      var text = extractText(data);
      if (text) {
        handlers.onChunk && handlers.onChunk(text);
      }
    }
  }

  /* ---------- 本地 mock 回复（降级兜底） ---------- */
  var mockReplies = [
    "（本地演示）收到你的消息啦～我已经记录了，请稍等片刻。",
    "（本地演示）这个问题我会尽快为你核实，先别着急哦。",
    "（本地演示）感谢反馈！如有进一步进展我会第一时间同步给你。",
    "（本地演示）我这边可以帮你查询相关信息，麻烦补充一下具体内容～",
    "（本地演示）好的，已为你生成一份参考说明：建议先查看帮助中心，或描述更详细的问题，我会继续跟进。",
  ];

  function mockReply(text) {
    if (/你好|您好|hi|hello|嗨/i.test(text)) {
      return "（本地演示）你好呀！我是 AI 客服助手，请问有什么可以帮你的？";
    }
    if (/在吗|在不在|有人吗/i.test(text)) {
      return "（本地演示）在的，我一直都在线，随时为你服务。";
    }
    if (/谢谢|感谢|3q|thx/i.test(text)) {
      return "（本地演示）不客气～能帮到你就好，还有其它问题随时找我！";
    }
    var idx = Math.floor(Math.random() * mockReplies.length);
    return mockReplies[idx];
  }

  // 模拟流式输出的打字机效果
  function mockStream(question, handlers) {
    var fullText = mockReply(question);
    var chars = Array.from(fullText);
    var i = 0;
    setTimeout(function start() {
      if (i < chars.length) {
        var count = Math.random() < 0.25 ? 2 : 1;
        var chunk = chars.slice(i, i + count).join("");
        i += count;
        handlers.onChunk && handlers.onChunk(chunk);
        setTimeout(start, 20 + Math.random() * 40);
      } else {
        handlers.onDone && handlers.onDone();
      }
    }, 300);
  }

  /* ---------- 流式发送（真实 SSE） ---------- */
  function sendMessage(sessionId, question, handlers) {
    handlers = handlers || {};
    var controller =
      typeof AbortController !== "undefined" ? new AbortController() : null;
    var canceled = false;
    var doneCalled = false;
    var requestHandlers = Object.assign({}, handlers, {
      onDone: function (payload) {
        if (doneCalled) return;
        doneCalled = true;
        handlers.onDone && handlers.onDone(payload);
      },
      onServerError: function (payload) {
        doneCalled = true;
        handlers.onServerError && handlers.onServerError(payload);
        handlers.onError && handlers.onError(payload);
      },
    });

    fetch(CONFIG.baseUrl + CONFIG.path, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "text/event-stream",
        appid: CONFIG.appid,
      },
      body: JSON.stringify({
        question: question,
        sessionId: sessionId,
        model: CONFIG.model,
        systemPrompt: CONFIG.systemPrompt,
        title: CONFIG.defaultTitle,
      }),
      signal: controller ? controller.signal : undefined,
    })
      .then(function (res) {
        if (!res.ok) {
          throw new Error("HTTP " + res.status + " " + res.statusText);
        }
        if (!res.body || !res.body.getReader) {
          throw new Error("当前浏览器不支持流式读取");
        }
        return res.body.getReader();
      })
      .then(function (reader) {
        var decoder = new TextDecoder("utf-8");
        var buffer = "";

        function pump() {
          return reader.read().then(function (result) {
            if (result.done) {
              if (buffer.trim()) parseSSEBlock(buffer, requestHandlers);
              requestHandlers.onDone();
              return;
            }
            buffer += decoder.decode(result.value, { stream: true });
            var blocks = buffer.split(/\r?\n\r?\n/);
            buffer = blocks.pop();
            blocks.forEach(function (block) {
              parseSSEBlock(block, requestHandlers);
            });
            return pump();
          });
        }
        return pump();
      })
      .catch(function (err) {
        if (canceled) return;
        console.warn("真实接口不可用，降级为本地演示:", err);
        // 兜底：使用本地 mock 保证交互可预览
        mockStream(question, {
          onChunk: function (chunk) {
            handlers.onChunk && handlers.onChunk(chunk);
          },
          onDone: function () {
            requestHandlers.onDone();
          },
        });
      });

    // 返回取消函数（预留：中断请求场景）
    return function cancel() {
      canceled = true;
      if (controller) {
        controller.abort();
      }
    };
  }

  /* ---------- 暴露 ---------- */
  window.ChatAPI = {
    createSession: createSession,
    sendMessage: sendMessage,
    resolveKnowledgeImageUrl: resolveKnowledgeImageUrl,
    getConfig: function () {
      return CONFIG;
    },
  };
})();
