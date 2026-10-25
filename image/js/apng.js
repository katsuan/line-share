// 動く画像（APNG）の組み立て。文字アイコン（TextIconSender）から移植。
// LINE の Flex で animated: true の画像は 300KB まで。

export const MOTIONS = [
  { value: "none", label: "なし" },
  { value: "xshake", label: "ゆらゆら" },
  { value: "yshake", label: "ぷるぷる" },
  { value: "hop", label: "ぴょん" },
  { value: "zoom", label: "どきどき" },
  { value: "flowLeft", label: "流れる" }
];

const APNG_MAX_BYTES = 300 * 1024;
const APNG_FRAME_DURATION_MS = 70;
const APNG_FRAME_COUNTS = [12, 8, 6, 4];
const APNG_COLOR_LEVELS = [256, 64, 32, 16, 8];

export function computeMotionTransform(preset, t, width, height = width) {
  const size = Math.min(width, height);
  const shake = size * (10 / 180);
  const hop = size * (16 / 180);

  switch (preset) {
    case "xshake":
      return { offsetX: Math.round(Math.sin(t * Math.PI * 2) * shake), rotation: Math.round(Math.sin(t * Math.PI * 2) * 4) };
    case "yshake":
      return { offsetY: Math.round(Math.sin(t * Math.PI * 2) * shake) };
    case "hop":
      return { offsetY: -Math.round(Math.sin(t * Math.PI) * hop), scale: 1 + Math.sin(t * Math.PI) * 0.06 };
    case "zoom":
      return { scale: 0.9 + Math.sin(t * Math.PI) * 0.16 };
    case "flowLeft":
      return { offsetX: Math.round(width - width * 2 * t), wrapX: true };
    default:
      return {};
  }
}

export function canvasToBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("PNG の生成に失敗しました。"))), "image/png");
  });
}

/**
 * renderFrame(ctx, transform) で1コマずつ描き、300KB に収まるまで色数→コマ数の順に落とす。
 * 収まらなければ { blob, oversized: true } を返す。
 */
export async function buildAnimationBlob({ width, height, preset, renderFrame }) {
  let last = null;

  // まずコマ数はそのままに色数を落とし、それでも収まらなければコマ数を減らす
  const fullFrames = renderFrames_(width, height, preset, APNG_FRAME_COUNTS[0], renderFrame);
  for (const levels of APNG_COLOR_LEVELS) {
    last = await buildApng_(await encodeFrames_(fullFrames, width, height, levels), width, height);
    if (last.size <= APNG_MAX_BYTES) return { blob: last, oversized: false };
  }

  const minLevels = APNG_COLOR_LEVELS[APNG_COLOR_LEVELS.length - 1];
  for (const count of APNG_FRAME_COUNTS.slice(1)) {
    const frames = renderFrames_(width, height, preset, count, renderFrame);
    last = await buildApng_(await encodeFrames_(frames, width, height, minLevels), width, height);
    if (last.size <= APNG_MAX_BYTES) return { blob: last, oversized: false };
  }

  return { blob: last, oversized: true };
}

function renderFrames_(width, height, preset, frameCount, renderFrame) {
  const frames = [];
  for (let i = 0; i < frameCount; i += 1) {
    const t = frameCount <= 1 ? 0 : i / (frameCount - 1);
    const edge = i === 0 || i === frameCount - 1;
    const frame = document.createElement("canvas");
    frame.width = width;
    frame.height = height;
    const frameCtx = frame.getContext("2d");
    renderFrame(frameCtx, edge && preset !== "flowLeft" ? {} : computeMotionTransform(preset, t, width, height));
    frames.push(frameCtx.getImageData(0, 0, width, height));
  }
  return frames;
}

async function encodeFrames_(frames, width, height, colorLevels) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  const blobs = [];
  for (const frame of frames) {
    const imageData = new ImageData(new Uint8ClampedArray(frame.data), width, height);
    if (colorLevels < 256) quantize_(imageData, colorLevels);
    ctx.putImageData(imageData, 0, 0);
    blobs.push(await canvasToBlob(canvas));
  }
  return blobs;
}

function quantize_(imageData, levels) {
  const step = 256 / levels;
  const data = imageData.data;
  for (let i = 0; i < data.length; i += 1) {
    data[i] = Math.min(255, Math.round(data[i] / step) * step);
  }
}

const PNG_SIGNATURE = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32_(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) {
    c = CRC32_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function chunk_(type, data) {
  const chunk = new Uint8Array(12 + data.length);
  const view = new DataView(chunk.buffer);
  view.setUint32(0, data.length, false);
  chunk.set(new TextEncoder().encode(type), 4);
  chunk.set(data, 8);
  view.setUint32(8 + data.length, crc32_(chunk.subarray(4, 8 + data.length)), false);
  return chunk;
}

async function frameParts_(blob) {
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  let ihdr = null;
  const idat = [];
  for (let offset = 8; offset < bytes.length; ) {
    const length = view.getUint32(offset, false);
    const type = new TextDecoder().decode(bytes.subarray(offset + 4, offset + 8));
    const data = bytes.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") ihdr = data;
    if (type === "IDAT") idat.push(data);
    offset += 12 + length;
  }
  const idatData = new Uint8Array(idat.reduce((sum, part) => sum + part.length, 0));
  let pos = 0;
  for (const part of idat) {
    idatData.set(part, pos);
    pos += part.length;
  }
  return { ihdr, idatData };
}

function fcTL_(sequence, width, height) {
  const data = new Uint8Array(26);
  const view = new DataView(data.buffer);
  view.setUint32(0, sequence, false);
  view.setUint32(4, width, false);
  view.setUint32(8, height, false);
  view.setUint16(20, APNG_FRAME_DURATION_MS, false);
  view.setUint16(22, 1000, false);
  return chunk_("fcTL", data);
}

async function buildApng_(frameBlobs, width, height) {
  const parts = await Promise.all(frameBlobs.map(frameParts_));
  const acTL = new Uint8Array(8);
  new DataView(acTL.buffer).setUint32(0, parts.length, false); // 再生回数 0 = 無限ループ

  const chunks = [chunk_("IHDR", parts[0].ihdr), chunk_("acTL", acTL)];
  let sequence = 0;
  parts.forEach((part, index) => {
    chunks.push(fcTL_(sequence, width, height));
    sequence += 1;
    if (index === 0) {
      chunks.push(chunk_("IDAT", part.idatData));
    } else {
      const fdAT = new Uint8Array(4 + part.idatData.length);
      new DataView(fdAT.buffer).setUint32(0, sequence, false);
      sequence += 1;
      fdAT.set(part.idatData, 4);
      chunks.push(chunk_("fdAT", fdAT));
    }
  });
  chunks.push(chunk_("IEND", new Uint8Array(0)));

  const out = new Uint8Array(PNG_SIGNATURE.length + chunks.reduce((sum, chunk) => sum + chunk.length, 0));
  out.set(PNG_SIGNATURE, 0);
  let pos = PNG_SIGNATURE.length;
  for (const chunk of chunks) {
    out.set(chunk, pos);
    pos += chunk.length;
  }
  return new Blob([out], { type: "image/png" });
}
