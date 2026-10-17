/** 按应用保存历史，按标签页保存当前会话；凭证只发给对应服务端，不写日志。 */
(function () {
  "use strict";
  var config = window.ReceptionAPI.getConfig();
  var suffix = encodeURIComponent(config.baseUrl + ":" + config.appid);
  var historyKey = "customerServiceSessions_v2:" + suffix;
  var currentKey = "customerServiceCurrent_v2:" + suffix;
  var legacyKey = "aiChatSessions_v1";

  function read(storage, key, fallback) {
    try { return JSON.parse(storage.getItem(key) || "null") || fallback; } catch (error) { return fallback; }
  }
  function write(storage, key, value) {
    try { storage.setItem(key, JSON.stringify(value)); return true; } catch (error) { return false; }
  }
  function loadAll() {
    var current = read(localStorage, historyKey, []);
    if (!Array.isArray(current)) current = [];
    // 旧记录没有凭证，只允许本地查看，不能向后端认领。
    var old = read(localStorage, legacyKey, { sessions: [] });
    var legacy = Array.isArray(old.sessions) ? old.sessions : [];
    return current.concat(legacy.map(function (item) {
      return Object.assign({}, item, { legacy: true, sessionToken: null });
    })).sort(function (a, b) { return new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0); });
  }
  function upsert(session) {
    if (!session || !session.sessionToken) return;
    var sessions = read(localStorage, historyKey, []);
    if (!Array.isArray(sessions)) sessions = [];
    var next = sessions.filter(function (item) { return String(item.sessionId) !== String(session.sessionId); });
    // 服务端是权威消息源，本地只缓存最近 200 条以控制存储空间。
    next.unshift(Object.assign({}, session, { messages: (session.messages || []).slice(-200) }));
    write(localStorage, historyKey, next.slice(0, 50));
  }
  function remove(sessionId, legacy) {
    if (legacy) {
      var old = read(localStorage, legacyKey, { sessions: [] });
      old.sessions = (old.sessions || []).filter(function (item) { return String(item.sessionId) !== String(sessionId); });
      write(localStorage, legacyKey, old);
    } else {
      var items = read(localStorage, historyKey, []);
      write(localStorage, historyKey, items.filter(function (item) { return String(item.sessionId) !== String(sessionId); }));
    }
  }
  function setCurrent(session) {
    if (!session || !session.sessionToken) {
      try { sessionStorage.removeItem(currentKey); } catch (error) { /* 隐私模式可继续当前页面。 */ }
      return;
    }
    write(sessionStorage, currentKey, {
      sessionId: session.sessionId,
      sessionToken: session.sessionToken,
      pendingMessage: session.pendingMessage || null,
    });
  }
  window.ReceptionStore = {
    loadAll: loadAll,
    upsert: upsert,
    remove: remove,
    setCurrent: setCurrent,
    getCurrent: function () { return read(sessionStorage, currentKey, null); },
  };
})();
