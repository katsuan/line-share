// 全ツール共通の設定。LIFF アプリは1つだけ作り、エンドポイントにこのサイトのトップ
// （例: https://katsuan.github.io/line-share/）を設定する。
// 各ツールは https://liff.line.me/<liffId>/plan/ のようにパスを付けて開く。
window.LINE_SHARE_CONFIG = {
  liffId: "",

  // 地図情報の取得・Bot返信（gas/maps）
  mapsGasUrl:
    "https://script.google.com/macros/s/AKfycbyWJvdBist0kksEkE2DTvrFdZCrQEuy608y__R9NOLKExTHGTn4oKPYUR3WYdRjbVXJ7w/exec",

  // 文字アイコン画像の Drive 保存（gas/icon）
  iconGasUrl:
    "https://script.google.com/macros/s/AKfycbycFbrZz6JiiX36cOQ_RpGo-argzaxIydP41hnpiaqBt-u_vnzqXulsW3qS_eZtTmyQ/exec",

  // お絵描き画像のアップロード先（draw/server を Render にデプロイしたURL）
  drawApiBaseUrl: "https://liff-image.onrender.com"
};
