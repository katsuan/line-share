// 値はリポジトリ直下の config.js（全ツール共通）で設定する
export const CONFIG = {
  liffId: window.LINE_SHARE_CONFIG.liffId,
  googleMapsApiKey: window.LINE_SHARE_CONFIG.googleMapsApiKey
};

// LINE の URI アクションは 1000 文字まで
export const MAX_URI_LENGTH = 1000;
