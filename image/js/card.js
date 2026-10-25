// 文字・手書き：送るメッセージ（画像か、画像を大きく見せるカード）を組み立てる（画面には触らない）。image/app.js が読む。
import { BUBBLE_SIZES } from "./config.js?v=202610251830";

// 今の LINE ではカード（Flex）の背景は透過しない（元の文字アイコンも同じ）。透過したいときは「画像で送る」
export function buildMessage(mode, imageUrl, item) {
  if (mode === "image") {
    return { type: "image", originalContentUrl: imageUrl, previewImageUrl: imageUrl };
  }
  const sourceText = item.text?.trim().replace(/\s+/g, " ") || "";
  const credit = window.LineShareCredit;
  return {
    type: "flex",
    altText: (sourceText || "画像").slice(0, 100),
    contents: {
      type: "bubble",
      size: BUBBLE_SIZES.includes(item.size) ? item.size : "giga",
      hero: {
        type: "image",
        url: imageUrl,
        size: "full",
        aspectRatio: aspectRatio(item.width, item.height),
        aspectMode: "fit",
        animated: item.animated,
        backgroundColor: "#00000000",
        // Created by が ON のときは画像のタップでも「おくるん」を開く
        ...(credit?.enabled() ? { action: { type: "uri", label: "おくるん", uri: credit.topUrl() } } : {})
      },
      // 画像だけを見せるため本文は空にする（Created by はフッターに付く）
      body: {
        type: "box",
        layout: "vertical",
        contents: [],
        paddingAll: "0px",
        spacing: "none",
        backgroundColor: "#00000000"
      },
      styles: {
        hero: { backgroundColor: "#00000000" },
        body: { backgroundColor: "#00000000" }
      }
    }
  };
}

// 縦横比を約分して「横:縦」にする（LINE の上限に合わせて 3 倍までに抑える）
export function aspectRatio(width, height) {
  // 最大公約数
  const gcd = (a, b) => (b ? gcd(b, a % b) : a);
  const divisor = gcd(width, height) || 1;
  let w = width / divisor;
  let h = height / divisor;
  if (w / h > 3) [w, h] = [3, 1];
  if (w / h < 1 / 3) [w, h] = [1, 3];
  return `${w}:${h}`;
}
