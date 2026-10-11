// 全ツール共通の設定。LIFF アプリは1つだけ作り、エンドポイントにこのサイトのトップ
// （例: https://katsuan.github.io/line-share/）を設定する。
// 各ツールは https://liff.line.me/<liffId>/plan/ のようにパスを付けて開く。
window.LINE_SHARE_CONFIG = {
  liffId: "2009927876-DioOJd0z",

  // 場所の検索に使う Google Maps JavaScript API のキー。
  // Google Cloud でこのサイトのURLだけに使えるよう「HTTPリファラー」で制限して設定する。
  // 空のときは場所名・住所を手入力する。
  googleMapsApiKey: "",

  // 画像（文字アイコン・お絵描き）のアップロード先。server/ を Render にデプロイしたURL
  imageApiBaseUrl: "https://liff-image.onrender.com",

  // 送るカードに「Created by おくるん」を付けるか（false で全員から消える）
  showCredit: true,

  // Created by を出さない LINE ユーザー（ユーザーIDの SHA-256。?credit=whoami を付けて LINE で開くと表示される）
  creditFreeUsers: [
    "24f2d88d2332937479e0e0275c2f8713d029cdf4a7fe788a136178b456e5b519" // katsuan
  ]
};
