/**
 * 会话本地存储（localStorage）
 * 保存聊天记录（含 sessionId），新聊天后仍可通过历史面板找回
 *
 * 数据结构：
 *   {
 *     sessions: [{
 *       sessionId, title,
 *       createdAt, updatedAt,
 *       messages: [{ role, content, time }]
 *     }]
 *   }
 */
(function () {
  "use strict";

  var STORAGE_KEY = "aiChatSessions_v1";
  var MAX_SESSIONS = 50; // 最多保留 50 个会话，超出移除最旧

  function loadAll() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      var data = JSON.parse(raw);
      if (data && Array.isArray(data.sessions)) return data.sessions;
    } catch (e) {
      console.warn("读取本地会话失败:", e);
    }
    return [];
  }

  function saveAll(sessions) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ sessions: sessions }));
      return true;
    } catch (e) {
      console.warn("保存本地会话失败:", e);
      return false;
    }
  }

  // 按 sessionId 查找（数字/字符串兼容）
  function get(sessionId) {
    var sessions = loadAll();
    for (var i = 0; i < sessions.length; i++) {
      if (String(sessions[i].sessionId) === String(sessionId)) {
        return sessions[i];
      }
    }
    return null;
  }

  // 新增或更新会话，最近更新的排在最前
  function upsert(session) {
    var sessions = loadAll();
    var next = sessions.filter(function (s) {
      return String(s.sessionId) !== String(session.sessionId);
    });
    next.unshift(session);
    if (next.length > MAX_SESSIONS) next = next.slice(0, MAX_SESSIONS);
    saveAll(next);
    return session;
  }

  function remove(sessionId) {
    var sessions = loadAll();
    var next = sessions.filter(function (s) {
      return String(s.sessionId) !== String(sessionId);
    });
    saveAll(next);
  }

  window.ChatStore = {
    loadAll: loadAll,
    get: get,
    upsert: upsert,
    remove: remove,
  };
})();
