// GAS の偽物（Q のツール共通のテストの道具）。本番のシート・LINE・ドライブに触らずに、GAS のコードを node で動かす。
//
//   const { createGas } = require("../q-oqrn/tools/qtest/fake-gas.js");
//   const gas = createGas({ dir: "gs", properties: { LINE_CHANNEL_ACCESS_TOKEN: "test" } });
//   gas.seed("users", [["userId", "name"], ["U1", "かつ"]]);
//   const res = gas.doPost({ action: "getLiffAppState", idToken: "t" });   // JSON を返すときは中身を返す
//   gas.lineEvent({ type: "message", replyToken: "r", source: { type: "user", userId: "U1" }, message: { type: "text", text: "こんにちは" } });
//   gas.replies();          // 返事・送ったメッセージ（[{ kind: "reply" | "push", messages }]）
//   gas.flexProblems();     // LINE が受けつけない書き方（色・空の箱・ラベルの長さなど）
//   gas.formulaCells();     // シートに、= + - @ で始まる文字がそのまま書かれたところ（式として動いてしまう）
//
// 足りないサービス（CalendarApp など）は、呼んだことだけを覚える置きもの（gas.calls）。
// 必要になったら、ここに足す（ほかのツールも使うので、名前は変えない）。
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const crypto = require("crypto");

const pad = (n) => String(n).padStart(2, "0");

// GAS のファイルを読む順：パスの名前順（clasp と同じく、番号つきのフォルダ・ファイル名がそのまま並ぶ）
function collectFiles(dir) {
  const out = [];
  const walk = (d) => {
    for (const name of fs.readdirSync(d).sort()) {
      const p = path.join(d, name);
      const st = fs.statSync(p);
      if (st.isDirectory()) {
        if (["node_modules", ".git", "test", "tests", "__tests__"].includes(name)) continue;
        walk(p);
      } else if (/\.(gs|js)$/.test(name) && !/\.test\.js$/.test(name)) {
        out.push(p);
      }
    }
  };
  walk(dir);
  return out;
}

// 日時の書式（Utilities.formatDate）。よく使う書式だけ。時差は timeZone の時間（既定は日本）
function formatDate(date, tz, format, offsetHours) {
  const d = new Date(new Date(date).getTime() + offsetHours * 3600e3);
  const Y = d.getUTCFullYear(), M = d.getUTCMonth() + 1, D = d.getUTCDate();
  const H = d.getUTCHours(), m = d.getUTCMinutes(), s = d.getUTCSeconds();
  const u = d.getUTCDay() || 7;
  const E = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getUTCDay()];
  const sign = offsetHours < 0 ? "-" : "+";
  const abs = Math.abs(offsetHours);
  const zone = `${sign}${pad(Math.floor(abs))}:${pad(Math.round((abs % 1) * 60))}`;
  return String(format).replace(/yyyy|XXX|MM|dd|HH|mm|ss|M|d|H|u|E|'[^']*'/g, (t) => {
    switch (t) {
      case "XXX": return zone;
      case "yyyy": return Y;
      case "MM": return pad(M);
      case "dd": return pad(D);
      case "HH": return pad(H);
      case "mm": return pad(m);
      case "ss": return pad(s);
      case "M": return M;
      case "d": return D;
      case "H": return H;
      case "u": return u;
      case "E": return E;
      default: return t.slice(1, -1);
    }
  });
}

// 呼んだことだけを覚える置きもの（どんな呼び方をしても、自分を返してつなげられる）
function recorder(name, calls) {
  const fn = function () {};
  return new Proxy(fn, {
    get(_t, key) {
      if (key === Symbol.toPrimitive) return () => `[${name}]`;
      if (key === "toString") return () => `[${name}]`;
      if (key === "then") return undefined;
      return recorder(`${name}.${String(key)}`, calls);
    },
    apply(_t, _this, args) {
      calls.push({ name, args });
      return recorder(`${name}()`, calls);
    },
  });
}

function createSheet(name, book, writes) {
  const rows = [];
  let frozen = 0;
  const cell = (r, c) => (rows[r - 1] ? rows[r - 1][c - 1] ?? "" : "");
  const put = (r, c, v, how) => {
    rows[r - 1] = rows[r - 1] || [];
    rows[r - 1][c - 1] = v;
    writes.push({ sheet: name, row: r, col: c, value: v, how });
  };
  const sheet = {
    rows,
    getName: () => name,
    setName: (n) => {
      delete book.sheets[name];
      name = n;
      book.sheets[n] = sheet;
      return sheet;
    },
    getParent: () => book.api,
    getLastRow: () => rows.length,
    getLastColumn: () => Math.max(0, ...rows.map((r) => (r ? r.length : 0))),
    getMaxRows: () => Math.max(1000, rows.length),
    getMaxColumns: () => Math.max(26, sheet.getLastColumn()),
    getFrozenRows: () => frozen,
    setFrozenRows: (n) => {
      frozen = n;
      return sheet;
    },
    appendRow(values) {
      const r = rows.length + 1;
      values.forEach((v, i) => put(r, i + 1, v, "appendRow"));
      if (!values.length) rows.push([]);
      return sheet;
    },
    deleteRow(r) {
      rows.splice(r - 1, 1);
      return sheet;
    },
    deleteRows(r, n) {
      rows.splice(r - 1, n);
      return sheet;
    },
    insertRowAfter() {
      return sheet;
    },
    clear() {
      rows.length = 0;
      return sheet;
    },
    clearContents() {
      rows.length = 0;
      return sheet;
    },
    getDataRange() {
      book.reads.count += 1;
      return sheet.getRange(1, 1, Math.max(1, rows.length), Math.max(1, sheet.getLastColumn()));
    },
    getRange(a, b, c, d) {
      let r = a, col = b, nr = c || 1, nc = d || 1;
      if (typeof a === "string") {
        const m = a.match(/^([A-Z]+)(\d+)(?::([A-Z]+)(\d+))?$/);
        if (!m) throw new Error(`fake-gas: getRange("${a}") はまだ使えません`);
        const colNum = (s) => [...s].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0);
        r = Number(m[2]);
        col = colNum(m[1]);
        nr = m[4] ? Number(m[4]) - r + 1 : 1;
        nc = m[3] ? colNum(m[3]) - col + 1 : 1;
      }
      const range = {
        getRow: () => r,
        getColumn: () => col,
        getNumRows: () => nr,
        getNumColumns: () => nc,
        getSheet: () => sheet,
        getValue: () => cell(r, col),
        getValues: () => Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => cell(r + i, col + j))),
        getDisplayValues: () => range.getValues().map((row) => row.map((v) => String(v))),
        // シートは = で始まる文字を式として持つ（' で始まれば文字のまま）
        getFormulas: () => range.getValues().map((row) => row.map((v) => (typeof v === "string" && v.startsWith("=") ? v : ""))),
        setValue(v) {
          put(r, col, v, "setValue");
          return range;
        },
        setValues(values) {
          values.forEach((row, i) => row.forEach((v, j) => put(r + i, col + j, v, "setValues")));
          return range;
        },
        clearContent() {
          for (let i = 0; i < nr; i++) for (let j = 0; j < nc; j++) if (rows[r - 1 + i]) rows[r - 1 + i][col - 1 + j] = "";
          return range;
        },
        setNumberFormat: () => range,
        setNumberFormats: () => range,
        setFontWeight: () => range,
        setBackground: () => range,
        setWrap: () => range,
        setHorizontalAlignment: () => range,
        setDataValidation: () => range,
        setNote: () => range,
        createFilter: () => range,
      };
      return range;
    },
    autoResizeColumns: () => sheet,
    setColumnWidth: () => sheet,
    hideSheet: () => sheet,
    protect: () => recorder("Protection", book.calls),
  };
  return sheet;
}

function createBook(id, calls, writes, reads) {
  const book = { id, sheets: {}, calls, reads };
  book.api = {
    getId: () => id,
    getUrl: () => `https://docs.google.com/spreadsheets/d/${id}/edit`,
    getName: () => `fake-${id}`,
    getSheetByName: (n) => book.sheets[n] || null,
    getSheets: () => Object.values(book.sheets),
    insertSheet: (n) => {
      const name = n || `Sheet${Object.keys(book.sheets).length + 1}`;
      book.sheets[name] = createSheet(name, book, writes);
      return book.sheets[name];
    },
    deleteSheet: (s) => {
      delete book.sheets[s.getName()];
    },
    getSpreadsheetTimeZone: () => "Asia/Tokyo",
    toast: () => {},
  };
  return book;
}

function createStore(initial) {
  const data = { ...(initial || {}) };
  return {
    data,
    getProperty: (k) => (Object.prototype.hasOwnProperty.call(data, k) ? String(data[k]) : null),
    getProperties: () => ({ ...data }),
    getKeys: () => Object.keys(data),
    setProperty: (k, v) => {
      data[k] = String(v);
    },
    setProperties: (o, deleteOthers) => {
      if (deleteOthers) for (const k of Object.keys(data)) delete data[k];
      Object.assign(data, o);
    },
    deleteProperty: (k) => {
      delete data[k];
    },
    deleteAllProperties: () => {
      for (const k of Object.keys(data)) delete data[k];
    },
  };
}

function createCache() {
  const data = {};
  return {
    data,
    get: (k) => (k in data ? data[k] : null),
    getAll: (keys) => Object.fromEntries(keys.filter((k) => k in data).map((k) => [k, data[k]])),
    put: (k, v) => {
      data[k] = String(v);
    },
    putAll: (o) => Object.assign(data, o),
    remove: (k) => {
      delete data[k];
    },
    removeAll: (keys) => keys.forEach((k) => delete data[k]),
  };
}

function response(status, body, headers) {
  const text = typeof body === "string" ? body : JSON.stringify(body ?? {});
  return {
    getResponseCode: () => status,
    getContentText: () => text,
    getHeaders: () => headers || {},
    getAllHeaders: () => headers || {},
    getBlob: () => ({
      getBytes: () => [...Buffer.from(text)],
      getContentType: () => (headers && headers["Content-Type"]) || "application/octet-stream",
      setContentType() {
        return this;
      },
      setName() {
        return this;
      },
      getDataAsString: () => text,
    }),
  };
}

// LINE の API の見本の返事（テストで fetch を渡さなかったとき）
function defaultLineFetch(url) {
  if (/\/oauth2\/v2\.1\/verify/.test(url)) return response(200, { sub: "U_TEST", name: "テスト", exp: Date.now() / 1000 + 3600 });
  if (/\/v2\/bot\/profile\//.test(url)) return response(200, { displayName: "テスト", pictureUrl: "https://example.com/p.png" });
  if (/\/v2\/bot\/richmenu$/.test(url)) return response(200, { richMenuId: `richmenu-${Date.now()}` });
  if (/\/v2\/bot\/info$/.test(url)) return response(200, { userId: "Ubot", basicId: "@test", displayName: "テストボット" });
  return response(200, {});
}

/**
 * GAS の偽物を作る
 * @param {object} o
 *   dir / files      … GAS のフォルダか、ファイルの並び（.gs と .js。test は読まない）
 *   source           … ファイルの代わりに、コードの文字
 *   properties       … Script Properties
 *   userProperties   … User Properties
 *   fetch(url, opt)  … UrlFetchApp.fetch の返事を決める（response(status, body) を返す。undefined なら見本の返事）
 *   timeZoneOffset   … 時差（時間。既定 9＝日本）
 *   expose           … テストから呼びたいトップレベルの名前（const・let で書いたもの。function はそのまま呼べる）
 */
function createGas(o = {}) {
  const calls = [];
  const writes = [];
  const fetches = [];
  const logs = [];
  const reads = { count: 0 };
  const books = {};
  const getBook = (id) => (books[id] = books[id] || createBook(id, calls, writes, reads));
  const activeId = o.spreadsheetId || "SPREADSHEET_TEST";
  const offset = o.timeZoneOffset ?? 9;
  const stores = {
    script: createStore(o.properties),
    user: createStore(o.userProperties),
    document: createStore(o.documentProperties),
  };
  const caches = { script: createCache(), user: createCache(), document: createCache() };

  const fetchImpl = (url, opt = {}) => {
    const entry = { url, method: String(opt.method || "get").toLowerCase(), opt, payload: opt.payload };
    try {
      entry.json = typeof opt.payload === "string" ? JSON.parse(opt.payload) : undefined;
    } catch {
      entry.json = undefined;
    }
    fetches.push(entry);
    const res = (o.fetch && o.fetch(url, opt, entry)) || defaultLineFetch(url, opt);
    if (!opt.muteHttpExceptions && res.getResponseCode() >= 400) {
      throw new Error(`Request failed for ${url} returned code ${res.getResponseCode()}. Truncated server response: ${res.getContentText().slice(0, 200)}`);
    }
    return res;
  };

  const ctx = {
    console: {
      log: (...a) => logs.push(a.map(String).join(" ")),
      info: (...a) => logs.push(a.map(String).join(" ")),
      warn: (...a) => logs.push(`WARN ${a.map(String).join(" ")}`),
      error: (...a) => logs.push(`ERROR ${a.map(String).join(" ")}`),
    },
    Logger: { log: (...a) => logs.push(a.map(String).join(" ")) },
    SpreadsheetApp: {
      openById: (id) => {
        reads.count += 1;
        return getBook(id).api;
      },
      openByUrl: (url) => getBook((String(url).match(/\/d\/([^/]+)/) || [])[1] || activeId).api,
      getActive: () => getBook(activeId).api,
      getActiveSpreadsheet: () => getBook(activeId).api,
      create: (name) => getBook(`created-${name}`).api,
      flush: () => {},
      newDataValidation: () => recorder("DataValidation", calls),
      BorderStyle: {},
    },
    PropertiesService: {
      getScriptProperties: () => stores.script,
      getUserProperties: () => stores.user,
      getDocumentProperties: () => stores.document,
    },
    CacheService: {
      getScriptCache: () => caches.script,
      getUserCache: () => caches.user,
      getDocumentCache: () => caches.document,
    },
    LockService: {
      getScriptLock: () => ({ waitLock() {}, tryLock: () => true, releaseLock() {}, hasLock: () => true }),
      getUserLock: () => ({ waitLock() {}, tryLock: () => true, releaseLock() {}, hasLock: () => true }),
      getDocumentLock: () => ({ waitLock() {}, tryLock: () => true, releaseLock() {}, hasLock: () => true }),
    },
    Utilities: {
      formatDate: (d, tz, f) => formatDate(d, tz, f, offset),
      getUuid: () => crypto.randomUUID(),
      sleep: () => {},
      computeDigest: (alg, text) => [...crypto.createHash(alg === "MD5" ? "md5" : alg === "SHA_1" ? "sha1" : "sha256").update(Array.isArray(text) ? Buffer.from(text) : String(text)).digest()].map((b) => (b > 127 ? b - 256 : b)),
      computeHmacSha256Signature: (value, key) => [...crypto.createHmac("sha256", Array.isArray(key) ? Buffer.from(key) : String(key)).update(Array.isArray(value) ? Buffer.from(value) : String(value)).digest()].map((b) => (b > 127 ? b - 256 : b)),
      base64Encode: (v) => Buffer.from(Array.isArray(v) ? v.map((b) => b & 255) : String(v)).toString("base64"),
      base64EncodeWebSafe: (v) => Buffer.from(Array.isArray(v) ? v.map((b) => b & 255) : String(v)).toString("base64url"),
      base64Decode: (t) => [...Buffer.from(String(t), "base64")],
      base64DecodeWebSafe: (t) => [...Buffer.from(String(t), "base64url")],
      newBlob: (data, type, name) => {
        const bytes = Array.isArray(data) ? data : [...Buffer.from(String(data ?? ""))];
        const blob = {
          getBytes: () => bytes,
          getContentType: () => type || "application/octet-stream",
          getName: () => name || "",
          setName: (n) => ((name = n), blob),
          setContentType: (t) => ((type = t), blob),
          getDataAsString: () => Buffer.from(bytes.map((b) => b & 255)).toString("utf8"),
        };
        return blob;
      },
      DigestAlgorithm: { SHA_256: "SHA_256", SHA_1: "SHA_1", MD5: "MD5" },
      Charset: { UTF_8: "UTF_8" },
    },
    UrlFetchApp: {
      fetch: fetchImpl,
      fetchAll: (reqs) => reqs.map((r) => fetchImpl(r.url, r)),
    },
    ContentService: {
      createTextOutput: (t) => {
        const out = { __body: String(t ?? ""), __mime: "TEXT", setMimeType: (m) => ((out.__mime = m), out), getContent: () => out.__body };
        return out;
      },
      MimeType: { JSON: "JSON", TEXT: "TEXT", JAVASCRIPT: "JAVASCRIPT" },
    },
    HtmlService: recorder("HtmlService", calls),
    Session: {
      getScriptTimeZone: () => "Asia/Tokyo",
      getActiveUser: () => ({ getEmail: () => "owner@example.com" }),
      getEffectiveUser: () => ({ getEmail: () => "owner@example.com" }),
      getTemporaryActiveUserKey: () => "temp-key",
    },
    ScriptApp: {
      getService: () => ({ getUrl: () => "https://script.google.com/macros/s/TEST/exec" }),
      getProjectTriggers: () => [],
      newTrigger: (fn) => recorder(`ScriptApp.newTrigger(${fn})`, calls),
      deleteTrigger: () => {},
      getOAuthToken: () => "oauth-test",
      getScriptId: () => "SCRIPT_TEST",
    },
    DriveApp: recorder("DriveApp", calls),
    CalendarApp: recorder("CalendarApp", calls),
    GmailApp: recorder("GmailApp", calls),
    MailApp: recorder("MailApp", calls),
    DocumentApp: recorder("DocumentApp", calls),
  };
  ctx.globalThis = ctx;
  vm.createContext(ctx);

  // コードを読む
  let code = o.source || "";
  if (!code) {
    const files = o.files || collectFiles(o.dir);
    if (!files.length) throw new Error(`fake-gas: GAS のファイルが見つかりません（${o.dir}）`);
    code = files.map((f) => `\n// ---- ${f}\n${fs.readFileSync(f, "utf8")}`).join("\n");
  }
  const expose = (o.expose || []).map((n) => `try { globalThis[${JSON.stringify(n)}] = ${n}; } catch (e) {}`).join("\n");
  vm.runInContext(`${code}\n;${expose}`, ctx, { filename: "gas-project.js" });

  const parseOutput = (out) => {
    if (out && typeof out === "object" && "__body" in out) {
      try {
        return JSON.parse(out.__body);
      } catch {
        return out.__body;
      }
    }
    return out;
  };

  const gas = {
    ctx,
    calls,
    fetches,
    logs,
    writes,
    reads,
    properties: stores.script.data,
    cache: caches.script.data,
    response,
    /** トップレベルの関数を呼ぶ（名前で） */
    call(name, ...args) {
      const fn = vm.runInContext(`typeof ${name} === "function" ? ${name} : undefined`, ctx);
      if (!fn) throw new Error(`fake-gas: 関数 ${name} がありません`);
      return fn(...args);
    },
    /** 式を GAS の中で動かす（テスト用） */
    eval(expr) {
      return vm.runInContext(expr, ctx);
    },
    /** シート（名前で）。なければ作る */
    sheet(name, bookId = activeId) {
      const book = getBook(bookId);
      return book.sheets[name] || book.api.insertSheet(name);
    },
    /** シートに見本の行を入れる（1行目は見出し）。ここで入れた分は formulaCells に数えない */
    seed(name, rows, bookId = activeId) {
      const sh = gas.sheet(name, bookId);
      sh.rows.length = 0;
      rows.forEach((r) => sh.rows.push([...r]));
      return sh;
    },
    rows(name, bookId = activeId) {
      const sh = getBook(bookId).sheets[name];
      return sh ? sh.rows.map((r) => [...(r || [])]) : null;
    },
    /** doPost にふつうの呼び出し（画面から）を渡す。JSON で返したものは中身を返す */
    doPost(body, { parameter = {}, contentType = "text/plain" } = {}) {
      const contents = typeof body === "string" ? body : JSON.stringify(body);
      return parseOutput(gas.call("doPost", { postData: { contents, type: contentType }, parameter, parameters: {} }));
    },
    doGet(parameter = {}) {
      return parseOutput(gas.call("doGet", { parameter, parameters: {} }));
    },
    /** LINE の Webhook として1つのイベントを送る（key は Webhook の URL の ?key=） */
    lineEvent(event, { key, destination = "Ubot" } = {}) {
      return gas.doPost({ destination, events: [{ timestamp: Date.now(), mode: "active", webhookEventId: crypto.randomUUID(), ...event }] }, { parameter: key ? { key } : {} });
    },
    /** LINE に送ったメッセージ（reply と push） */
    replies() {
      return fetches
        .filter((f) => /\/v2\/bot\/message\/(reply|push|multicast|broadcast)/.test(f.url) && f.json)
        .map((f) => ({ kind: f.url.match(/message\/(\w+)/)[1], to: f.json.to, messages: f.json.messages || [] }));
    },
    /** 同じ返事の合図（replyToken）で2回以上 reply したもの。LINE では2回目は断られる（断られたあとの返しなおしは push で） */
    reusedReplyTokens() {
      const seen = new Map();
      fetches
        .filter((f) => /\/v2\/bot\/message\/reply/.test(f.url) && f.json)
        .forEach((f) => seen.set(f.json.replyToken, (seen.get(f.json.replyToken) || 0) + 1));
      return [...seen].filter(([, n]) => n > 1).map(([token]) => token);
    },
    lastMessages() {
      const all = gas.replies();
      return all.length ? all[all.length - 1].messages : [];
    },
    /** LINE が受けつけない・受けつけないことがある書き方 */
    flexProblems(messages) {
      return checkMessages(messages || gas.replies().flatMap((r) => r.messages));
    },
    /** シートに、= + - @ で始まる文字がそのまま書かれたところ（式として動いてしまう） */
    formulaCells() {
      return writes.filter((w) => typeof w.value === "string" && /^[=+\-@]/.test(w.value) && !/^[+-]?\d/.test(w.value));
    },
    reset() {
      fetches.length = 0;
      logs.length = 0;
      calls.length = 0;
      writes.length = 0;
      reads.count = 0;
    },
  };
  return gas;
}

// ---- LINE のメッセージの書き方を確かめる（LINE の validate API が断る形を、手元で先に見つける） ----
const COLOR = /^#([0-9a-fA-F]{6})$/;
function checkMessages(messages) {
  const problems = [];
  // level：error は LINE が断る形、warn は断られることがある形（確かめてから使う）
  const add = (where, why, level = "error") => problems.push({ level, where, why });
  (messages || []).forEach((m, mi) => {
    const at = `messages[${mi}]`;
    if (!m || !m.type) return add(at, "type がない");
    if (m.type === "text" && !String(m.text || "").trim()) add(at, "文字が空");
    if (m.type === "text" && String(m.text || "").length > 5000) add(at, "文字が 5000 字をこえる");
    if (m.type === "flex") {
      if (!m.altText) add(at, "altText がない");
      if (String(m.altText || "").length > 400) add(at, "altText が 400 字をこえる");
      const c = m.contents || {};
      if (c.type === "carousel" && (c.contents || []).length > 12) add(at, "カルーセルが 12 枚をこえる");
      // 横に並べるカードは、すべて同じ大きさ（size。書かないときは mega）でないと LINE に断られる
      if (c.type === "carousel") {
        const sizes = [...new Set((c.contents || []).map((b) => (b && b.size) || "mega"))];
        if (sizes.length > 1) add(at, `カルーセルのカードの大きさがそろっていない（${sizes.join("・")}）`);
      }
      walk(c, `${at}.contents`);
    }
    if (m.quickReply) {
      const items = m.quickReply.items || [];
      if (items.length > 13) add(`${at}.quickReply`, "クイックリプライが 13 個をこえる");
      items.forEach((it, i) => checkAction(it.action, `${at}.quickReply.items[${i}]`, 20));
    }
  });

  function checkAction(a, where, labelMax) {
    if (!a) return;
    if (a.label && [...String(a.label)].length > labelMax) add(where, `ラベルが ${labelMax} 字をこえる（${a.label}）`);
    if (a.type === "uri" && !/^(https:|line:|tel:|mailto:)/.test(String(a.uri || ""))) add(where, `uri が https でない（${a.uri}）`);
    if (a.type === "uri" && String(a.uri || "").length > 1000) add(where, "uri が 1000 字をこえる");
    if (a.type === "postback" && String(a.data || "").length > 300) add(where, "postback の data が 300 字をこえる");
    if (a.type === "message" && String(a.text || "").length > 300) add(where, "message の text が 300 字をこえる");
  }

  function walk(node, where) {
    if (!node || typeof node !== "object") return;
    if (node.type === "filler") add(where, "filler は使わない（中身のない箱で代える）", "warn");
    if (node.type === "box" && Array.isArray(node.contents) && node.contents.length === 0 && !node.width && !node.height) add(where, "中身のない箱（大きさを決めていない）", "warn");
    for (const key of ["color", "backgroundColor", "borderColor", "separatorColor"]) {
      const v = node[key];
      if (!v) continue;
      if (/^#[0-9a-fA-F]{8}$/.test(v)) {
        if (key !== "backgroundColor") add(where, `${key} の透明度つきの色（${v}）は断られることがある。#RRGGBB に`, "warn");
      } else if (!COLOR.test(v)) {
        add(where, `${key} は #RRGGBB にする（${v}）`);
      }
    }
    if (node.type === "text" && !String(node.text ?? "").length && !node.contents) add(where, "text が空");
    if (node.type === "image" && !/^https:/.test(String(node.url || ""))) add(where, "画像の url が https でない");
    if (node.action) checkAction(node.action, `${where}.action`, 40);
    for (const part of ["header", "hero", "body", "footer"]) if (node[part]) walk(node[part], `${where}.${part}`);
    if (Array.isArray(node.contents)) node.contents.forEach((child, i) => walk(child, `${where}.contents[${i}]`));
  }
  return problems;
}

module.exports = { createGas, checkMessages, response, collectFiles };
