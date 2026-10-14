// お知らせカード：localStorage（使えない環境でも落ちないように）

// ---- localStorage（使えない環境でも落ちないように） ----

function localStorageGet(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function localStorageSet(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch (error) {
    console.error(error);
  }
}

function localStorageRemove(key) {
  try {
    localStorage.removeItem(key);
  } catch (error) {
    console.error(error);
  }
}

function loadJson(key) {
  try {
    return JSON.parse(localStorageGet(key) || "null");
  } catch {
    return null;
  }
}

function saveJson(key, value) {
  localStorageSet(key, JSON.stringify(value));
}
