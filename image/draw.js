// 文字と手書きを1枚に描く（画面には触らない）。look は今の設定（app.js の state）。
//   dims → buildLayer（文字・手書き・縁取り）→ compose（背景と動きをかけて描く）
import { BASE, BLACK, EDGE_MARGIN, FONTS, WHITE } from "./constants.js?v=202610230122";

// 長い辺を longSide にしたときの幅と高さ
export function dims(look, longSide) {
  const [w, h] = look.shape.split(":").map(Number);
  return w >= h
    ? { width: longSide, height: Math.round((longSide * h) / w) }
    : { width: Math.round((longSide * w) / h), height: longSide };
}

export function fontOf(look, px) {
  const weight = FONTS.find((option) => option.value === look.font)?.weight ?? 800;
  return `${weight} ${px}px ${look.font}`;
}

// 手書き風など、読みこみが要る書体か
export function needsWebFont(look) {
  return Boolean(FONTS.find((option) => option.value === look.font)?.webFont);
}

/**
 * 文字と手書きを重ね、縁取りまでかけた1枚（動きをかける前）を作る。
 */
export function buildLayer(look, width, height) {
  const scale = Math.min(width, height) / BASE;
  const content = renderContent(look, width, height, scale);
  const layer = document.createElement("canvas");
  layer.width = width;
  layer.height = height;
  const layerCtx = layer.getContext("2d");

  const ring = look.outline === "none" ? 0 : Math.max(1, Math.round(look.outlineWidth * scale));
  if (look.outline === "double") {
    drawOutline(layerCtx, content, ring * 2, WHITE);
    drawOutline(layerCtx, content, ring, BLACK);
  } else if (ring > 0) {
    drawOutline(layerCtx, content, ring, outlineColor(look));
  }
  layerCtx.drawImage(content, 0, 0);
  return layer;
}

function outlineColor(look) {
  if (look.outline === "custom") return look.outlineColor;
  return look.outline === "white" ? WHITE : BLACK;
}

/**
 * 背景を敷き、動きの変形をかけて layer を ctx に描く。
 */
export function compose(look, ctx, width, height, layer, transform = {}) {
  ctx.clearRect(0, 0, width, height);
  if (look.background) {
    ctx.fillStyle = look.background;
    ctx.fillRect(0, 0, width, height);
  }

  const { offsetX = 0, offsetY = 0, scale: zoom = 1, rotation = 0, wrapX = false } = transform;
  for (const tileX of wrapX ? [-width, 0, width] : [0]) {
    ctx.save();
    ctx.translate(width / 2 + offsetX + tileX, height / 2 + offsetY);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.scale(zoom, zoom);
    ctx.translate(-width / 2, -height / 2);
    ctx.drawImage(layer, 0, 0);
    ctx.restore();
  }
}

function renderContent(look, width, height, scale) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");

  const text = look.text.trim();
  if (text) {
    const lines = text.split("\n");
    const outline = look.outline === "none" ? 0 : look.outlineWidth * scale * (look.outline === "double" ? 2 : 1);
    const padding = EDGE_MARGIN * scale + outline;
    const fontSize = fitFontSize(look, ctx, lines, width - padding * 2, height - padding * 2);
    const lineHeight = fontSize * 1.15;
    const startY = height / 2 - (lines.length * lineHeight) / 2 + lineHeight / 2;

    ctx.font = fontOf(look, fontSize);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = look.textColor;
    lines.forEach((line, index) => ctx.fillText(line, width / 2, startY + index * lineHeight));
  }

  // 手書きの点は「中心からの距離 ÷ 短い辺」で持つので、形を変えても線が伸び縮みしない
  const unit = Math.min(width, height);
  const toX = (x) => width / 2 + x * unit;
  const toY = (y) => height / 2 + y * unit;
  const strokes = look.currentStroke ? [...look.strokes, look.currentStroke] : look.strokes;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const stroke of strokes) {
    ctx.lineWidth = stroke.size * scale;
    ctx.strokeStyle = stroke.color;
    ctx.beginPath();
    stroke.points.forEach(([x, y], index) => {
      if (index === 0) ctx.moveTo(toX(x), toY(y));
      else ctx.lineTo(toX(x), toY(y));
    });
    if (stroke.points.length === 1) {
      const [x, y] = stroke.points[0];
      ctx.lineTo(toX(x) + 0.01, toY(y));
    }
    ctx.stroke();
  }

  return canvas;
}

function fitFontSize(look, ctx, lines, maxWidth, maxHeight) {
  let low = 8;
  let high = Math.floor(maxHeight / (lines.length * 1.15));
  // 二分探索で枠に収まる最大の文字サイズを探す
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    ctx.font = fontOf(look, mid);
    const width = Math.max(
      ...lines.map((line) => {
        const m = ctx.measureText(line || " ");
        return m.actualBoundingBoxLeft + m.actualBoundingBoxRight;
      })
    );
    if (width <= maxWidth) low = mid;
    else high = mid - 1;
  }
  return low;
}

// 不透明な部分を円状にずらして重ね、縁取りを作る（文字・手書き・絵文字すべてに効く）
function drawOutline(targetCtx, source, radius, color) {
  const tinted = document.createElement("canvas");
  tinted.width = source.width;
  tinted.height = source.height;
  const tintedCtx = tinted.getContext("2d");
  tintedCtx.drawImage(source, 0, 0);
  tintedCtx.globalCompositeOperation = "source-in";
  tintedCtx.fillStyle = color;
  tintedCtx.fillRect(0, 0, tinted.width, tinted.height);

  const steps = Math.max(16, Math.min(48, radius * 4));
  for (const ratio of [1, 0.66, 0.33]) {
    const r = radius * ratio;
    for (let i = 0; i < steps; i += 1) {
      const angle = (i / steps) * Math.PI * 2;
      targetCtx.drawImage(tinted, Math.cos(angle) * r, Math.sin(angle) * r);
    }
  }
}
