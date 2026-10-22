// ほかのツール（さくせん盤・くろのす・ジェンダーリビール・くじなど）から、おくるんのお知らせカードを開くための入口。
// LIFF ID とカードの URL はここ1か所で持つ（line-share の config.js の liffId と同じ値）。
//
// 使い方（各ツールの HTML。ツールの script より前に読む）
//   <script src="https://katsuan.github.io/line-share/shared/oqrn.js"></script>
//   OQRN.cardUrl({ headerTitle: "…", title: "…", from: "qji" })   … 中身を入れた状態でカードを開く URL
//   OQRN.cardUrl(new URLSearchParams(...))                         … URLSearchParams もそのまま渡せる（badge など同じ名前を重ねるとき）
(function () {
  "use strict";
  const LIFF_ID = "2009927876-DioOJd0z";
  const CARD = `https://liff.line.me/${LIFF_ID}/card/`;

  function cardUrl(params) {
    const query = params instanceof URLSearchParams ? params : new URLSearchParams(params || {});
    // 空白は「+」ではなく %20 で書く（liff.line.me を通ると「+」がそのまま残り、カードに「+」が出るため）
    return `${CARD}?${String(query).replace(/\+/g, "%20")}`;
  }

  window.OQRN = Object.freeze({
    liffId: LIFF_ID,
    site: "https://katsuan.github.io/line-share/",
    top: `https://liff.line.me/${LIFF_ID}`,
    card: CARD,
    cardUrl
  });
})();
