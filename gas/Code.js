// おくるんのサーバー側（GAS のウェブアプリ）。プランの判定と、有償プランの画像保存を受け持つ。
//
// 受け付けるもの（doPost。本文は JSON）
//   { action: "me", accessToken }                 … 本人を LINE で確かめ、プランを返す（shared/plan.js が聞く）
//   { action: "upload", imageData, accessToken }   … 長く保存できるプランなら Google ドライブに保存し、公開 URL を返す
//     （action がないものは upload として扱う。古いページとの互換）
//   Stripe の Webhook（object: "event"）           … 支払い・解約をプランの一覧に書く
//   { action: "log", events: [...] }               … 利用状況とエラーの記録（shared/log.js が送る。個人がわかるものは含まない）
//
// 役割の分け方
//   システム管理者 … このコードのデプロイと Script Properties（下）
//   ツール管理者   … プランの一覧（シート「plans」）。手で行を足す・期限を書く・消す
//   ユーザー       … /account/ で自分のプランを見る・Stripe で支払う
//
// Script Properties（setup() で作る。STRIPE_SECRET_KEY だけは手で入れる）
//   DRIVE_FOLDER_ID   … 画像の保存先フォルダ
//   PLANS_SHEET_ID    … プランの一覧（スプレッドシート。シート「plans」）
//   LINE_CHANNEL_ID   … LIFF アプリの LINE ログインチャネル ID（ほかのチャネルのトークンは断る）
//   PREMIUM_USERS     … 有償プランのユーザー（ユーザーIDの SHA-256。カンマか改行区切り）。シートを使う前からの一覧。今も有効
//   KEEP_DAYS         … 画像を残す日数（毎日の掃除で、これより古いものをゴミ箱へ移す）
//   STRIPE_SECRET_KEY … Stripe の秘密鍵（制限付きキーなら Events の読み取りだけで足りる）。空なら Stripe の知らせは受けない
//   LOG_SHEET_ID      … 利用状況の記録（スプレッドシート。シート「events」＝細かい記録、「daily」＝日ごとの集計）
//   LOG_KEEP_DAYS     … 細かい記録を残す日数（毎日の集計のあと、これより古い行を消す。集計は消さない）

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const DEFAULT_KEEP_DAYS = 30;
const DEFAULT_LINE_CHANNEL_ID = '2009927876';
const FOLDER_NAME = 'おくるカード画像';
const SHEET_NAME = 'plans';
// シート「plans」の列。1行＝1人。plan が premium で、expiresAt が空か未来なら有償
const COLUMNS = ['userHash', 'plan', 'source', 'expiresAt', 'stripeCustomerId', 'stripeSubscriptionId', 'note', 'updatedAt'];
// 利用状況の記録の列。events は1行＝1つの出来事、daily は1行＝1日・1道具・1種類の件数
// from＝流入口（どこから来たか）、prev・step＝足跡（直前のページ・そのタブで何ページ目か）
const LOG_COLUMNS = ['receivedAt', 'at', 'event', 'tool', 'kind', 'count', 'inClient', 'message', 'session', 'from', 'prev', 'step'];
const DAILY_COLUMNS = ['date', 'tool', 'event', 'kind', 'events', 'sessions', 'inClient', 'from'];
// paths は1行＝1日・1つの移り方（prev → tool）の回数。prev が空なら、そのタブで最初に開いたページ（入口）
const PATH_COLUMNS = ['date', 'from', 'prev', 'tool', 'count'];
const LOG_EVENTS = ['open', 'send', 'error'];
const MAX_LOG_EVENTS = 50; // 1回に受け取る上限
const DEFAULT_LOG_KEEP_DAYS = 30;
// Stripe は届かなかった知らせを3日まで送り直す。それより古い知らせは使わない
const STRIPE_EVENT_MAX_AGE_SECONDS = 4 * 24 * 60 * 60;
const FRIENDLY_ERROR = 'うまくいきませんでした。時間をおいて、もう一度ためしてください。';

// プランごとに使える機能（shared/plan.js の PLANS とそろえる）
const PLANS = {
  free: { longImageStorage: false, hideCredit: false },
  premium: { longImageStorage: true, hideCredit: true }
};

function doGet() {
  return jsonResponse_({ ok: true, name: 'line-share-gas' });
}

// qcheck-ok: G3 Stripe はイベント ID で Stripe から取り直す・me と upload は LINE のトークンで本人を確かめる・log はだれでも送れるが個人の情報は受けとらない
function doPost(e) {
  let payload = {};
  try {
    payload = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (payload.object === 'event' && /^evt_[A-Za-z0-9]{1,64}$/.test(String(payload.id || ''))) return handleStripeEvent_(payload.id);
    if (payload.action === 'me') return jsonResponse_(me_(String(payload.accessToken || '')));
    if (payload.action === 'log') return jsonResponse_(log_(payload.events));
    return jsonResponse_(upload_(payload));
  } catch (error) {
    // 画面に返すのは、こちらで書いたやさしい言葉だけ。エラーの中身は実行ログに
    console.error(error);
    return jsonResponse_({ ok: false, error: error && error.forUser ? error.message : FRIENDLY_ERROR });
  }
}

/** 画面にそのまま見せてよいエラー */
function userError_(message) {
  const error = new Error(message);
  error.forUser = true;
  return error;
}

// ---- プラン ----

/** 本人のプラン。{ ok, plan, features, expiresAt } */
function me_(accessToken) {
  const userHash = verifyUser_(accessToken);
  const found = findPlan_(userHash);
  return { ok: true, plan: found.plan, features: PLANS[found.plan], expiresAt: found.expiresAt || '' };
}

/** ユーザーのいまのプラン。シートの行 → Script Properties の PREMIUM_USERS の順に見る */
function findPlan_(userHash) {
  const row = findRow_(userHash);
  if (row && PLANS[row.plan] && isActive_(row.expiresAt)) return { plan: row.plan, expiresAt: row.expiresAt };
  if (premiumUsersFromProperties_().indexOf(userHash) !== -1) return { plan: 'premium', expiresAt: '' };
  return { plan: 'free', expiresAt: '' };
}

function isActive_(expiresAt) {
  if (!expiresAt) return true;
  const time = new Date(expiresAt).getTime();
  return !isNaN(time) && time > Date.now();
}

function premiumUsersFromProperties_() {
  return String(PropertiesService.getScriptProperties().getProperty('PREMIUM_USERS') || '')
    .split(/[\s,]+/)
    .filter(Boolean);
}

function sheet_() {
  const id = PropertiesService.getScriptProperties().getProperty('PLANS_SHEET_ID');
  if (!id) return null;
  return SpreadsheetApp.openById(id).getSheetByName(SHEET_NAME);
}

/** シートから1人分を探す。{ row（行番号）, userHash, plan, … } */
function findRow_(userHash, key) {
  const sheet = sheet_();
  if (!sheet || sheet.getLastRow() < 2) return null;
  const column = COLUMNS.indexOf(key || 'userHash');
  const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, COLUMNS.length).getValues();
  for (let i = 0; i < values.length; i += 1) {
    if (String(values[i][column]) === String(userHash)) {
      const record = { row: i + 2 };
      COLUMNS.forEach(function (name, j) {
        const value = values[i][j];
        record[name] = value instanceof Date ? value.toISOString() : String(value || '');
      });
      return record;
    }
  }
  return null;
}

/** 1人分を書く（あれば上書き、なければ足す）。fields に渡した列だけ変える */
function upsertRow_(match, fields) {
  const sheet = sheet_();
  if (!sheet) throw new Error('PLANS_SHEET_ID が未設定です。setup() を実行してください。');
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const existing = findRow_(match.value, match.key);
    const record = existing || {};
    COLUMNS.forEach(function (name) {
      if (fields[name] !== undefined) record[name] = fields[name];
    });
    record.updatedAt = new Date().toISOString();
    const values = [COLUMNS.map(function (name) { return safeCell(record[name] || ''); })];
    if (existing) sheet.getRange(existing.row, 1, 1, COLUMNS.length).setValues(values);
    else sheet.appendRow(values[0]);
  } finally {
    lock.releaseLock();
  }
}

// ---- Stripe ----
// GAS のウェブアプリはリクエストのヘッダー（Stripe-Signature）を読めず、署名を確かめられない。
// そこで届いた知らせはイベント ID だけを使い、Stripe の API から本物のイベントを取り直して処理する（偽の知らせは取り直せない）。
//
// 支払いリンク（Payment Links）には、ページが ?client_reference_id=<ユーザーのハッシュ> を付けて開く（shared/plan.js の checkoutUrl）。

function handleStripeEvent_(eventId) {
  const secret = PropertiesService.getScriptProperties().getProperty('STRIPE_SECRET_KEY');
  if (!secret) return jsonResponse_({ ok: false, error: 'stripe disabled' });
  const response = UrlFetchApp.fetch('https://api.stripe.com/v1/events/' + encodeURIComponent(eventId), {
    headers: { Authorization: 'Bearer ' + secret },
    muteHttpExceptions: true
  });
  if (response.getResponseCode() !== 200) return jsonResponse_({ ok: false, error: 'unknown event' });
  const event = JSON.parse(response.getContentText());
  const object = event.data && event.data.object;
  // 古い知らせ（3日の送り直しの期間をすぎたもの）は使わない
  if (event.id !== eventId || !(Number(event.created) > Date.now() / 1000 - STRIPE_EVENT_MAX_AGE_SECONDS)) {
    return jsonResponse_({ ok: false, error: 'old event' });
  }
  const stripeId = function (value, prefix) {
    return new RegExp('^' + prefix + '_[A-Za-z0-9]{1,64}$').test(String(value || '')) ? String(value) : '';
  };

  if (['checkout.session.completed', 'checkout.session.async_payment_succeeded'].indexOf(event.type) !== -1 && object && /^[0-9a-f]{64}$/.test(String(object.client_reference_id || ''))) {
    // 支払いが済んだ：有償にする。あとで払う支払い方法（コンビニなど）は、払ったときの知らせ（async_payment_succeeded）で。
    // サブスクリプションなら期限は解約の知らせが来るまで空（ずっと有効）
    if (['paid', 'no_payment_required'].indexOf(object.payment_status) === -1) return jsonResponse_({ ok: true, type: event.type, skipped: 'unpaid' });
    upsertRow_({ key: 'userHash', value: object.client_reference_id }, {
      userHash: object.client_reference_id,
      plan: 'premium',
      source: 'stripe',
      expiresAt: '',
      stripeCustomerId: stripeId(object.customer, 'cus'),
      stripeSubscriptionId: stripeId(object.subscription, 'sub')
    });
  } else if (event.type === 'customer.subscription.deleted' && object && stripeId(object.customer, 'cus')) {
    // 解約された（期間の終わり）：無料に戻す
    if (findRow_(object.customer, 'stripeCustomerId')) {
      upsertRow_({ key: 'stripeCustomerId', value: object.customer }, { plan: 'free', expiresAt: new Date().toISOString() });
    }
  }
  return jsonResponse_({ ok: true, type: event.type });
}

// ---- 利用状況の記録 ----
// ページ（shared/log.js）が sendBeacon でまとめて送ってくる。中身は決まった列だけを短く切って書く（それ以外は捨てる）

function log_(events) {
  const id = PropertiesService.getScriptProperties().getProperty('LOG_SHEET_ID');
  if (!id || !Array.isArray(events)) return { ok: false };
  const now = new Date().toISOString();
  // 外から来た文字なので、短く切って、式として動かないようにする（safeCell は selfcheck.gs）
  const cut = function (value, max) { return safeCell(String(value === undefined || value === null ? '' : value).slice(0, max)); };
  const rows = events.slice(0, MAX_LOG_EVENTS)
    .filter(function (e) { return e && LOG_EVENTS.indexOf(e.event) !== -1; })
    .map(function (e) {
      return [now, cut(e.at, 30), e.event, cut(e.tool, 20), cut(e.kind, 20), Number(e.count) || '', e.inClient ? 1 : 0, cut(e.message, 200), cut(e.session, 12),
        cut(e.from, 20), cut(e.prev, 20), Number(e.step) || ''];
    });
  if (!rows.length) return { ok: true, count: 0 };
  const sheet = SpreadsheetApp.openById(id).getSheetByName('events');
  ensureHeader_(sheet, LOG_COLUMNS);
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, LOG_COLUMNS.length).setValues(rows);
  } finally {
    lock.releaseLock();
  }
  return { ok: true, count: rows.length };
}

// 列を足したとき、見出しの行を今の列にそろえる
function ensureHeader_(sheet, columns) {
  if (sheet.getLastColumn() < columns.length) sheet.getRange(1, 1, 1, columns.length).setValues([columns]);
}

function sheetOf_(book, name, columns) {
  const sheet = book.getSheetByName(name) || book.insertSheet(name);
  if (sheet.getLastRow() === 0) sheet.appendRow(columns);
  ensureHeader_(sheet, columns);
  sheet.setFrozenRows(1);
  return sheet;
}

/**
 * 毎日（setup() が登録する）：まだ集計していない日の細かい記録を、日・道具・種類・形式ごとの件数にして daily に足し、
 * LOG_KEEP_DAYS より古い細かい記録を消す（ログのローテーション）。集計（daily）は残る
 */
function rollupLogs() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('LOG_SHEET_ID');
  if (!id) return;
  const book = SpreadsheetApp.openById(id);
  const events = sheetOf_(book, 'events', LOG_COLUMNS);
  const daily = sheetOf_(book, 'daily', DAILY_COLUMNS);
  const paths = sheetOf_(book, 'paths', PATH_COLUMNS);
  const today = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd');
  const lastDone = props.getProperty('LOG_ROLLED_UP_TO') || '';
  const keepDays = Number(props.getProperty('LOG_KEEP_DAYS')) || DEFAULT_LOG_KEEP_DAYS;
  const cutoff = Utilities.formatDate(new Date(Date.now() - keepDays * 24 * 60 * 60 * 1000), 'Asia/Tokyo', 'yyyy-MM-dd');

  const lastRow = events.getLastRow();
  const values = lastRow >= 2 ? events.getRange(2, 1, lastRow - 1, LOG_COLUMNS.length).getValues() : [];
  const dayOf = function (row) { return Utilities.formatDate(new Date(row[0]), 'Asia/Tokyo', 'yyyy-MM-dd'); };

  // 集計：今日より前で、まだ集計していない日だけ。流入口（from）ごとに分ける
  const groups = {};
  const moves = {};
  values.forEach(function (row) {
    const day = dayOf(row);
    if (day >= today || day <= lastDone) return;
    const from = row[9] || '';
    const key = [day, row[3], row[2], row[4], from].join('\t');
    const g = groups[key] || (groups[key] = { events: 0, sessions: {}, inClient: 0 });
    g.events += 1;
    if (row[8]) g.sessions[row[8]] = true;
    if (row[6]) g.inClient += 1;
    // 足跡：開いたページごとに「直前のページ → このページ」を数える
    if (row[2] === 'open') {
      const move = [day, from, row[10] || '', row[3]].join('\t');
      moves[move] = (moves[move] || 0) + 1;
    }
  });
  const out = Object.keys(groups).sort().map(function (key) {
    const parts = key.split('\t');
    const g = groups[key];
    // シートから読み直した文字は先頭の ' が外れているので、書くときにもう一度 safeCell を通す
    return [parts[0], parts[1], parts[2], parts[3], g.events, Object.keys(g.sessions).length, g.inClient, parts[4]].map(safeCell);
  });
  if (out.length) daily.getRange(daily.getLastRow() + 1, 1, out.length, DAILY_COLUMNS.length).setValues(out);
  const pathRows = Object.keys(moves).sort().map(function (key) {
    return key.split('\t').map(safeCell).concat([moves[key]]);
  });
  if (pathRows.length) paths.getRange(paths.getLastRow() + 1, 1, pathRows.length, PATH_COLUMNS.length).setValues(pathRows);
  const yesterday = Utilities.formatDate(new Date(Date.now() - 24 * 60 * 60 * 1000), 'Asia/Tokyo', 'yyyy-MM-dd');
  props.setProperty('LOG_ROLLED_UP_TO', yesterday);

  // ローテーション：上から順（古い順）に書いているので、cutoff より前の行をまとめて消す
  let old = 0;
  while (old < values.length && dayOf(values[old]) < cutoff) old += 1;
  if (old > 0) events.deleteRows(2, old);
  console.log('rolled up ' + out.length + ' groups, deleted ' + old + ' rows older than ' + cutoff);
}

// ---- 画像の保存 ----

function upload_(payload) {
  const userHash = verifyUser_(String(payload.accessToken || ''));
  if (!PLANS[findPlan_(userHash).plan].longImageStorage) throw userError_('有償プランではありません。');
  const image = parseDataUrl_(String(payload.imageData || ''));

  const folder = DriveApp.getFolderById(getProperty_('DRIVE_FOLDER_ID'));
  const name = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyyMMdd-HHmmss') + '-' + Utilities.getUuid() + '.' + image.extension;
  const file = folder.createFile(Utilities.newBlob(image.bytes, image.mimeType, name));
  file.setDescription(JSON.stringify({ user: userHash }));
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return { ok: true, imageUrl: buildPublicUrl_(file.getId()) };
}

// ---- 共通 ----

/** LIFF のアクセストークンから本人を確かめ、ユーザーIDのハッシュを返す */
function verifyUser_(accessToken) {
  if (!accessToken) throw userError_('LINE でログインしてください。');

  const verify = fetchJson_('https://api.line.me/oauth2/v2.1/verify?access_token=' + encodeURIComponent(accessToken));
  if (!verify || String(verify.client_id) !== getProperty_('LINE_CHANNEL_ID')) {
    throw userError_('LINE のログインを確かめられませんでした。');
  }

  const profile = fetchJson_('https://api.line.me/v2/profile', { Authorization: 'Bearer ' + accessToken });
  if (!profile || !profile.userId) throw userError_('LINE のユーザーを確かめられませんでした。');
  return sha256Hex_(profile.userId);
}

function fetchJson_(url, headers) {
  const response = UrlFetchApp.fetch(url, { headers: headers || {}, muteHttpExceptions: true });
  if (response.getResponseCode() !== 200) return null;
  return JSON.parse(response.getContentText());
}

function parseDataUrl_(imageData) {
  const match = /^data:image\/(png|jpeg);base64,([A-Za-z0-9+/=]+)$/.exec(imageData);
  if (!match) throw userError_('PNG または JPEG の data URL を送信してください。');

  const bytes = Utilities.base64Decode(match[2]);
  if (!bytes.length) throw userError_('画像データが空です。');
  if (bytes.length > MAX_IMAGE_BYTES) throw userError_('画像サイズが大きすぎます。5MB 以下にしてください。');

  return {
    bytes: bytes,
    mimeType: 'image/' + match[1],
    extension: match[1] === 'jpeg' ? 'jpg' : 'png'
  };
}

// LINE の画像メッセージ・Flex から直接読める URL（ドライブの表示ページではなく画像そのもの）
function buildPublicUrl_(fileId) {
  return 'https://drive.usercontent.google.com/download?id=' + encodeURIComponent(fileId) + '&export=view';
}

function sha256Hex_(text) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, text, Utilities.Charset.UTF_8)
    .map(function (byte) {
      return ('0' + (byte & 0xff).toString(16)).slice(-2);
    })
    .join('');
}

function getProperty_(key) {
  const value = PropertiesService.getScriptProperties().getProperty(key);
  if (!value) throw new Error(key + ' が Script Properties に未設定です。setup() を実行してください。');
  return value;
}

function jsonResponse_(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}

/** KEEP_DAYS より古い画像をゴミ箱へ移す（setup() が毎日 3 時台に動くよう登録する） */
function cleanupOldImages() {
  const props = PropertiesService.getScriptProperties();
  const keepDays = Number(props.getProperty('KEEP_DAYS')) || DEFAULT_KEEP_DAYS;
  const limit = Date.now() - keepDays * 24 * 60 * 60 * 1000;
  const files = DriveApp.getFolderById(getProperty_('DRIVE_FOLDER_ID')).getFiles();
  let count = 0;
  while (files.hasNext()) {
    const file = files.next();
    if (file.getDateCreated().getTime() < limit) {
      file.setTrashed(true);
      count += 1;
    }
  }
  console.log('trashed ' + count + ' images older than ' + keepDays + ' days');
}

/** 最初に一度だけエディタから実行する。保存先フォルダ・プランの一覧・初期値・毎日の掃除を用意する（何度実行してもよい） */
function setup() {
  const props = PropertiesService.getScriptProperties();
  if (!props.getProperty('DRIVE_FOLDER_ID')) {
    props.setProperty('DRIVE_FOLDER_ID', DriveApp.createFolder(FOLDER_NAME).getId());
  }
  if (!props.getProperty('PLANS_SHEET_ID')) {
    const book = SpreadsheetApp.create('おくるん プランの一覧');
    const sheet = book.getSheets()[0].setName(SHEET_NAME);
    sheet.appendRow(COLUMNS);
    sheet.setFrozenRows(1);
    props.setProperty('PLANS_SHEET_ID', book.getId());
  }
  if (!props.getProperty('LINE_CHANNEL_ID')) props.setProperty('LINE_CHANNEL_ID', DEFAULT_LINE_CHANNEL_ID);
  if (!props.getProperty('KEEP_DAYS')) props.setProperty('KEEP_DAYS', String(DEFAULT_KEEP_DAYS));
  if (props.getProperty('PREMIUM_USERS') === null) props.setProperty('PREMIUM_USERS', '');
  if (props.getProperty('STRIPE_SECRET_KEY') === null) props.setProperty('STRIPE_SECRET_KEY', '');
  if (!props.getProperty('LOG_SHEET_ID')) {
    const logBook = SpreadsheetApp.create('おくるん 利用状況');
    logBook.getSheets()[0].setName('events').appendRow(LOG_COLUMNS);
    logBook.insertSheet('daily').appendRow(DAILY_COLUMNS);
    logBook.insertSheet('paths').appendRow(PATH_COLUMNS);
    logBook.getSheets().forEach(function (sheet) { sheet.setFrozenRows(1); });
    props.setProperty('LOG_SHEET_ID', logBook.getId());
  }
  if (!props.getProperty('LOG_KEEP_DAYS')) props.setProperty('LOG_KEEP_DAYS', String(DEFAULT_LOG_KEEP_DAYS));

  // 毎日の処理（画像の掃除・記録の集計とローテーション）を登録し直す
  ScriptApp.getProjectTriggers()
    .filter(function (trigger) {
      return ['cleanupOldImages', 'rollupLogs'].indexOf(trigger.getHandlerFunction()) !== -1;
    })
    .forEach(function (trigger) {
      ScriptApp.deleteTrigger(trigger);
    });
  ScriptApp.newTrigger('cleanupOldImages').timeBased().everyDays(1).atHour(3).create();
  ScriptApp.newTrigger('rollupLogs').timeBased().everyDays(1).atHour(4).create();

  console.log('folder: https://drive.google.com/drive/folders/' + props.getProperty('DRIVE_FOLDER_ID'));
  console.log('plans: https://docs.google.com/spreadsheets/d/' + props.getProperty('PLANS_SHEET_ID'));
  console.log('logs: https://docs.google.com/spreadsheets/d/' + props.getProperty('LOG_SHEET_ID'));
}

// 使う前の確かめ（selfcheck.gs の qCheckAll を GAS エディタで実行する）。何も書きこまない
var Q_SELF_CHECK = {
  properties: ['DRIVE_FOLDER_ID', 'PLANS_SHEET_ID', 'LINE_CHANNEL_ID', 'KEEP_DAYS', 'LOG_SHEET_ID', 'LOG_KEEP_DAYS'],
  secretProperties: ['STRIPE_SECRET_KEY'],
  spreadsheetId: function () { return PropertiesService.getScriptProperties().getProperty('PLANS_SHEET_ID'); },
  sheets: { plans: COLUMNS },
  triggers: ['cleanupOldImages', 'rollupLogs']
};
