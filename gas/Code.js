// おくるんのサーバー側（GAS のウェブアプリ）。プランの判定と、有償プランの画像保存を受け持つ。
//
// 受け付けるもの（doPost。本文は JSON）
//   { action: "me", accessToken }                 … 本人を LINE で確かめ、プランを返す（shared/plan.js が聞く）
//   { action: "upload", imageData, accessToken }   … 長く保存できるプランなら Google ドライブに保存し、公開 URL を返す
//     （action がないものは upload として扱う。古いページとの互換）
//   Stripe の Webhook（object: "event"）           … 支払い・解約をプランの一覧に書く
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

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const DEFAULT_KEEP_DAYS = 30;
const DEFAULT_LINE_CHANNEL_ID = '2009927876';
const FOLDER_NAME = 'おくるカード画像';
const SHEET_NAME = 'plans';
// シート「plans」の列。1行＝1人。plan が premium で、expiresAt が空か未来なら有償
const COLUMNS = ['userHash', 'plan', 'source', 'expiresAt', 'stripeCustomerId', 'stripeSubscriptionId', 'note', 'updatedAt'];

// プランごとに使える機能（shared/plan.js の PLANS とそろえる）
const PLANS = {
  free: { longImageStorage: false, hideCredit: false },
  premium: { longImageStorage: true, hideCredit: true }
};

function doGet() {
  return jsonResponse_({ ok: true, name: 'line-share-gas' });
}

function doPost(e) {
  let payload = {};
  try {
    payload = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (payload.object === 'event' && /^evt_/.test(String(payload.id || ''))) return handleStripeEvent_(payload.id);
    if (payload.action === 'me') return jsonResponse_(me_(String(payload.accessToken || '')));
    return jsonResponse_(upload_(payload));
  } catch (error) {
    console.error(error);
    return jsonResponse_({ ok: false, error: error.message || String(error) });
  }
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
    const values = [COLUMNS.map(function (name) { return record[name] || ''; })];
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

  if (event.type === 'checkout.session.completed' && object && object.client_reference_id) {
    // 支払いが済んだ：有償にする。サブスクリプションなら期限は解約の知らせが来るまで空（ずっと有効）
    upsertRow_({ key: 'userHash', value: object.client_reference_id }, {
      userHash: object.client_reference_id,
      plan: 'premium',
      source: 'stripe',
      expiresAt: '',
      stripeCustomerId: object.customer || '',
      stripeSubscriptionId: object.subscription || ''
    });
  } else if (event.type === 'customer.subscription.deleted' && object && object.customer) {
    // 解約された（期間の終わり）：無料に戻す
    if (findRow_(object.customer, 'stripeCustomerId')) {
      upsertRow_({ key: 'stripeCustomerId', value: object.customer }, { plan: 'free', expiresAt: new Date().toISOString() });
    }
  }
  return jsonResponse_({ ok: true, type: event.type });
}

// ---- 画像の保存 ----

function upload_(payload) {
  const userHash = verifyUser_(String(payload.accessToken || ''));
  if (!PLANS[findPlan_(userHash).plan].longImageStorage) throw new Error('有償プランではありません。');
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
  if (!accessToken) throw new Error('LINE でログインしてください。');

  const verify = fetchJson_('https://api.line.me/oauth2/v2.1/verify?access_token=' + encodeURIComponent(accessToken));
  if (!verify || String(verify.client_id) !== getProperty_('LINE_CHANNEL_ID')) {
    throw new Error('LINE のログインを確かめられませんでした。');
  }

  const profile = fetchJson_('https://api.line.me/v2/profile', { Authorization: 'Bearer ' + accessToken });
  if (!profile || !profile.userId) throw new Error('LINE のユーザーを確かめられませんでした。');
  return sha256Hex_(profile.userId);
}

function fetchJson_(url, headers) {
  const response = UrlFetchApp.fetch(url, { headers: headers || {}, muteHttpExceptions: true });
  if (response.getResponseCode() !== 200) return null;
  return JSON.parse(response.getContentText());
}

function parseDataUrl_(imageData) {
  const match = /^data:image\/(png|jpeg);base64,([A-Za-z0-9+/=]+)$/.exec(imageData);
  if (!match) throw new Error('PNG または JPEG の data URL を送信してください。');

  const bytes = Utilities.base64Decode(match[2]);
  if (!bytes.length) throw new Error('画像データが空です。');
  if (bytes.length > MAX_IMAGE_BYTES) throw new Error('画像サイズが大きすぎます。5MB 以下にしてください。');

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

  ScriptApp.getProjectTriggers()
    .filter(function (trigger) {
      return trigger.getHandlerFunction() === 'cleanupOldImages';
    })
    .forEach(function (trigger) {
      ScriptApp.deleteTrigger(trigger);
    });
  ScriptApp.newTrigger('cleanupOldImages').timeBased().everyDays(1).atHour(3).create();

  console.log('folder: https://drive.google.com/drive/folders/' + props.getProperty('DRIVE_FOLDER_ID'));
  console.log('plans: https://docs.google.com/spreadsheets/d/' + props.getProperty('PLANS_SHEET_ID'));
}
