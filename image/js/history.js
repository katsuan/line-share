// 文字・手書き：送った画像をこの端末（IndexedDB）に残し、あとから選んで送り直せるようにする。image/app.js が読む。
// 画像サーバー（Render）のファイルは消えることがあるため、画像そのものを手元に保存しておく。
const DB_NAME = "line-share-image";
const STORE = "sent";
const MAX_ITEMS = 20;

let dbPromise = null;

// 送った画像を入れておく IndexedDB を1回だけ開く
function openDb() {
  if (!("indexedDB" in window)) return Promise.reject(new Error("IndexedDB unavailable"));
  dbPromise ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE, { keyPath: "id", autoIncrement: true });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return dbPromise;
}

// IndexedDB で1つの操作をする（mode："readonly"・"readwrite"）
function run(mode, action) {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const result = action(tx.objectStore(STORE));
        tx.oncomplete = () => resolve(result?.result);
        tx.onerror = () => reject(tx.error);
      })
  );
}

// 送った画像の一覧（新しい順）。読めなければ空
export async function listSent() {
  try {
    const items = (await run("readonly", (store) => store.getAll())) || [];
    return items.sort((a, b) => b.sentAt - a.sentAt);
  } catch (error) {
    console.error(error);
    return [];
  }
}

// 送った画像を足す（多くなったら古いものから消す）
export async function addSent(item) {
  try {
    await run("readwrite", (store) => store.add({ ...item, sentAt: Date.now() }));
    const items = await listSent();
    const overflow = items.slice(MAX_ITEMS);
    if (overflow.length) {
      await run("readwrite", (store) => overflow.forEach((old) => store.delete(old.id)));
    }
  } catch (error) {
    console.error(error);
  }
}

// 送った画像を消す
export async function deleteSent(id) {
  try {
    await run("readwrite", (store) => store.delete(id));
  } catch (error) {
    console.error(error);
  }
}

// 消したものを、元の id と送った日時のまま戻す（「元に戻す」用）
export async function restoreSent(item) {
  try {
    await run("readwrite", (store) => store.put(item));
  } catch (error) {
    console.error(error);
  }
}
