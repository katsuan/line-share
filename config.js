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

  // 有償プランの画像の保存先。gas/ をウェブアプリとしてデプロイしたURL（空なら全員が imageApiBaseUrl に保存）
  gasWebAppUrl: "https://script.google.com/macros/s/AKfycbzS7t9G-ryS_brovmbJxlIPv3hQNQsWSHfq-72i0JqWLBE7fp-CCR60resQkHzOV2-uHw/exec",

  // 有償プランの LINE ユーザー（ユーザーIDの SHA-256）。GAS がプランを答えられないときだけ使う予備の一覧。
  // 正本は GAS（プランの一覧のシートと Script Properties「PREMIUM_USERS」）。保存してよいかも GAS が確かめる
  premiumUsers: [
    "24f2d88d2332937479e0e0275c2f8713d029cdf4a7fe788a136178b456e5b519" // katsuan
  ],

  // 有償プランの支払いページ（Stripe の支払いリンク）。/account/ の「有償プランにする」から、
  // ?client_reference_id=<ユーザーのハッシュ> を付けて開く。空なら「準備中」と出す
  premiumCheckoutUrl: "",

  // お支払いの確認・解約のページ（Stripe のカスタマーポータルのリンク）。空ならボタンを出さない
  billingPortalUrl: "",

  // 利用状況とエラーを GAS に記録するか（個人がわかるものは送らない。shared/log.js）。false で記録しない
  logging: true,

  // 送るカードに「Created by おくるん」を付けるか（false で全員から消える）
  showCredit: true,

  // 自分たちのほかの LIFF アプリ（キロっく・ひっくり・くるかな）。お知らせカードはリンクで渡されたボタンのうち、
  // katsuan.github.io と、liff.line.me のこの ID（とおくるん自身の liffId）だけを送れるリンクとして通す
  trustedLiffIds: [
    "2009927582-2isjfmkk", // キロっく
    "2009927876-PcLT1IYA", // ひっくり
    "2009927582-qytzPvoy" // くるかな
  ],

  // 作成者（ユーザーIDの SHA-256）。トップのシェアに「全ツールのカードを送る」が出る（?credit=whoami でハッシュを確かめられる）
  ownerUsers: [
    "24f2d88d2332937479e0e0275c2f8713d029cdf4a7fe788a136178b456e5b519" // katsuan
  ],

  // Created by を出さない LINE ユーザー（ユーザーIDの SHA-256。?credit=whoami を付けて LINE で開くと表示される）
  creditFreeUsers: [
    "24f2d88d2332937479e0e0275c2f8713d029cdf4a7fe788a136178b456e5b519" // katsuan
  ]
};
