// 有償プランの画像保存（おくるカード）。
// ページ（shared/plan.js）から data URL と LIFF のアクセストークンを受け取り、
// 本人を LINE で確かめてから Google ドライブに保存し、LINE から読める公開 URL を返す。
//
// Script Properties（setup() で作る。運営者だけが変える）
//   DRIVE_FOLDER_ID … 保存先フォルダ
//   LINE_CHANNEL_ID … LIFF アプリの LINE ログインチャネル ID（ほかのチャネルのトークンは断る）
//   PREMIUM_USERS   … 有償プランのユーザー（LINE ユーザーIDの SHA-256。カンマか改行区切り）
//   KEEP_DAYS       … 画像を残す日数（毎日の掃除で、これより古いものをゴミ箱へ移す）

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const DEFAULT_KEEP_DAYS = 30;
const DEFAULT_LINE_CHANNEL_ID = '2009927876';
const FOLDER_NAME = 'おくるカード画像';

function doGet() {
  return jsonResponse_({ ok: true, name: 'line-share-gas' });
}

function doPost(e) {
  try {
    const payload = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    const userHash = verifyPremiumUser_(String(payload.accessToken || ''));
    const image = parseDataUrl_(String(payload.imageData || ''));

    const folder = DriveApp.getFolderById(getProperty_('DRIVE_FOLDER_ID'));
    const name = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyyMMdd-HHmmss') + '-' + Utilities.getUuid() + '.' + image.extension;
    const file = folder.createFile(Utilities.newBlob(image.bytes, image.mimeType, name));
    file.setDescription(JSON.stringify({ user: userHash }));
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

    return jsonResponse_({ ok: true, imageUrl: buildPublicUrl_(file.getId()) });
  } catch (error) {
    console.error(error);
    return jsonResponse_({ ok: false, error: error.message || String(error) });
  }
}

/** LIFF のアクセストークンから本人を確かめ、有償プランならユーザーIDのハッシュを返す */
function verifyPremiumUser_(accessToken) {
  if (!accessToken) throw new Error('LINE でログインしてください。');

  const verify = fetchJson_('https://api.line.me/oauth2/v2.1/verify?access_token=' + encodeURIComponent(accessToken));
  if (!verify || String(verify.client_id) !== getProperty_('LINE_CHANNEL_ID')) {
    throw new Error('LINE のログインを確かめられませんでした。');
  }

  const profile = fetchJson_('https://api.line.me/v2/profile', { Authorization: 'Bearer ' + accessToken });
  if (!profile || !profile.userId) throw new Error('LINE のユーザーを確かめられませんでした。');

  const userHash = sha256Hex_(profile.userId);
  const premiumUsers = String(PropertiesService.getScriptProperties().getProperty('PREMIUM_USERS') || '')
    .split(/[\s,]+/)
    .filter(Boolean);
  if (premiumUsers.indexOf(userHash) === -1) throw new Error('有償プランではありません。');
  return userHash;
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

/** 最初に一度だけエディタから実行する。保存先フォルダ・初期値・毎日の掃除を用意する（何度実行してもよい） */
function setup() {
  const props = PropertiesService.getScriptProperties();
  if (!props.getProperty('DRIVE_FOLDER_ID')) {
    props.setProperty('DRIVE_FOLDER_ID', DriveApp.createFolder(FOLDER_NAME).getId());
  }
  if (!props.getProperty('LINE_CHANNEL_ID')) props.setProperty('LINE_CHANNEL_ID', DEFAULT_LINE_CHANNEL_ID);
  if (!props.getProperty('KEEP_DAYS')) props.setProperty('KEEP_DAYS', String(DEFAULT_KEEP_DAYS));
  if (props.getProperty('PREMIUM_USERS') === null) props.setProperty('PREMIUM_USERS', '');

  ScriptApp.getProjectTriggers()
    .filter(function (trigger) {
      return trigger.getHandlerFunction() === 'cleanupOldImages';
    })
    .forEach(function (trigger) {
      ScriptApp.deleteTrigger(trigger);
    });
  ScriptApp.newTrigger('cleanupOldImages').timeBased().everyDays(1).atHour(3).create();

  console.log('folder: https://drive.google.com/drive/folders/' + props.getProperty('DRIVE_FOLDER_ID'));
}
