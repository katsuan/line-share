// おくるんの画像サーバー（Render で動く Node.js）。無料プランの画像を受けとって保存し、だれでも読める URL を返す。
// 中身：POST /api/upload（自分のページからの PNG・JPEG だけ。送りすぎは止める）・/uploads/（保存した画像）・/health。
// Render は line-draw-share リポジトリの server/ から動く（このフォルダと同じ中身にそろえる）。shared/plan.js が呼ぶ。
const crypto = require("crypto");
const fs = require("fs/promises");
const path = require("path");

const cors = require("cors");
const express = require("express");

const app = express();
const port = process.env.PORT || 3000;
const uploadDir = path.join(__dirname, "uploads");
const allowedOrigin = process.env.ALLOWED_ORIGIN || "https://katsuan.github.io";
const maxImageBytes = 5 * 1024 * 1024;
// 1つの接続元から受けるアップロードの数（1分あたり）
const uploadsPerMinute = Number(process.env.UPLOADS_PER_MINUTE) || 20;

// Render の前のプロキシが付ける接続元を使う（送りすぎを止める目安。Render の前は何段かあるので、先頭を見る）
app.set("trust proxy", true);
app.disable("x-powered-by");

app.use((request, _response, next) => {
  console.log(
    `[${new Date().toISOString()}] ${request.method} ${request.originalUrl} origin=${
      request.get("origin") || "-"
    } ua=${request.get("user-agent") || "-"}`,
  );
  next();
});

// アップロードは自分のページ（ALLOWED_ORIGIN）からだけ受け付ける
const uploadCors = cors({
  origin(origin, callback) {
    callback(null, origin === allowedOrigin);
  },
});

// 同じ接続元からの送りすぎを止める（覚えるのはこのサーバーが動いている間だけ）
const recentUploads = new Map();
// 同じ接続元から、1分のうちに送りすぎていないか（今回の分も数える）
function tooManyUploads(ip) {
  const now = Date.now();
  const list = (recentUploads.get(ip) || []).filter((time) => now - time < 60 * 1000);
  list.push(now);
  recentUploads.set(ip, list);
  if (recentUploads.size > 10000) recentUploads.clear();
  return list.length > uploadsPerMinute;
}

// 送った画像は LINE の受信者など誰からでも読めるようにする。
// ここに Origin の制限をかけると、Flex の画像を受信者側で読み込めず枠だけになる。
app.use(
  "/uploads",
  express.static(uploadDir, {
    maxAge: "1d",
    setHeaders(response) {
      response.set("X-Content-Type-Options", "nosniff");
      response.set("Access-Control-Allow-Origin", "*");
      response.set("Cross-Origin-Resource-Policy", "cross-origin");
    },
  }),
);

// 保存した画像の公開 URL の頭（PUBLIC_BASE_URL か、届いたリクエストの宛先）
function buildPublicBaseUrl(request) {
  if (process.env.PUBLIC_BASE_URL) {
    return process.env.PUBLIC_BASE_URL.replace(/\/$/, "");
  }

  return `${request.protocol}://${request.get("host")}`;
}

// 画面にそのまま見せてよいエラーを作る
function userError(message) {
  const error = new Error(message);
  error.forUser = true;
  return error;
}

// PNG・JPEG の data URL を確かめて、中身と拡張子を返す（中身の先頭の印も見る）
function parseDataUrl(imageData) {
  const match = /^data:image\/(png|jpeg);base64,([A-Za-z0-9+/=]+)$/.exec(imageData);

  if (!match) {
    throw userError("PNG または JPEG の data URL を送信してください。");
  }

  const extension = match[1] === "jpeg" ? "jpg" : "png";
  const buffer = Buffer.from(match[2], "base64");

  if (!buffer.length) {
    throw userError("画像データが空です。");
  }

  if (buffer.length > maxImageBytes) {
    throw userError("画像サイズが大きすぎます。5MB 以下にしてください。");
  }

  // 中身も PNG・JPEG か（先頭の印を見る）
  const isPng = buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const isJpeg = buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  if (!(extension === "png" ? isPng : isJpeg)) {
    throw userError("PNG または JPEG の data URL を送信してください。");
  }

  return { extension, buffer };
}

app.get("/health", (_request, response) => {
  response.json({ ok: true });
});

app.options("/api/upload", uploadCors);
app.post("/api/upload", uploadCors, express.json({ limit: "10mb" }), async (request, response) => {
  // 自分のページ（ブラウザはかならず Origin を付ける）からだけ受け付ける
  if (request.get("origin") !== allowedOrigin) {
    response.status(403).json({ error: "このサイトからはアップロードできません。" });
    return;
  }
  if (tooManyUploads(request.ip)) {
    response.status(429).json({ error: "少し時間をおいてから、もう一度ためしてください。" });
    return;
  }

  try {
    const imageData = request.body?.imageData;

    if (typeof imageData !== "string") {
      response.status(400).json({ error: "imageData を文字列で送信してください。" });
      return;
    }

    const { extension, buffer } = parseDataUrl(imageData);
    const filename = `${Date.now()}-${crypto.randomUUID()}.${extension}`;
    const filePath = path.join(uploadDir, filename);

    await fs.mkdir(uploadDir, { recursive: true });
    await fs.writeFile(filePath, buffer);

    const imageUrl = `${buildPublicBaseUrl(request)}/uploads/${filename}`;
    response.status(201).json({ imageUrl });
  } catch (error) {
    console.error(error);
    response.status(400).json({ error: error.forUser ? error.message : "画像保存に失敗しました。" });
  }
});

app.get("/", (_request, response) => {
  response.json({
    name: "liff-draw-send-server",
    endpoints: {
      health: "/health",
      upload: "/api/upload",
    },
  });
});

// 読めない本文・大きすぎる本文など：中身は出さずに短く答える
app.use((error, _request, response, _next) => {
  console.error(error);
  response.status(error.status && error.status < 500 ? error.status : 500).json({ error: "画像保存に失敗しました。" });
});

module.exports = { app, parseDataUrl };

if (require.main === module) {
  app.listen(port, async () => {
    await fs.mkdir(uploadDir, { recursive: true });
    console.log(`Server listening on port ${port}`);
  });
}
