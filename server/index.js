const crypto = require("crypto");
const fs = require("fs/promises");
const path = require("path");

const cors = require("cors");
const express = require("express");

const app = express();
const port = process.env.PORT || 3000;
const uploadDir = path.join(__dirname, "uploads");
const allowedOrigin = process.env.ALLOWED_ORIGIN || "";
const maxImageBytes = 5 * 1024 * 1024;

app.set("trust proxy", true);

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
    callback(null, !allowedOrigin || !origin || origin === allowedOrigin);
  },
});

// 送った画像は LINE の受信者など誰からでも読めるようにする。
// ここに Origin の制限をかけると、Flex の画像を受信者側で読み込めず枠だけになる。
app.use(
  "/uploads",
  express.static(uploadDir, {
    maxAge: "1d",
    setHeaders(response) {
      response.set("Access-Control-Allow-Origin", "*");
      response.set("Cross-Origin-Resource-Policy", "cross-origin");
    },
  }),
);

function buildPublicBaseUrl(request) {
  if (process.env.PUBLIC_BASE_URL) {
    return process.env.PUBLIC_BASE_URL.replace(/\/$/, "");
  }

  return `${request.protocol}://${request.get("host")}`;
}

function parseDataUrl(imageData) {
  const match = /^data:image\/(png|jpeg);base64,([A-Za-z0-9+/=]+)$/.exec(imageData);

  if (!match) {
    throw new Error("PNG または JPEG の data URL を送信してください。");
  }

  const extension = match[1] === "jpeg" ? "jpg" : "png";
  const buffer = Buffer.from(match[2], "base64");

  if (!buffer.length) {
    throw new Error("画像データが空です。");
  }

  if (buffer.length > maxImageBytes) {
    throw new Error("画像サイズが大きすぎます。5MB 以下にしてください。");
  }

  return { extension, buffer };
}

app.get("/health", (_request, response) => {
  response.json({ ok: true });
});

app.options("/api/upload", uploadCors);
app.post("/api/upload", uploadCors, express.json({ limit: "10mb" }), async (request, response) => {
  const origin = request.get("origin");
  if (allowedOrigin && origin && origin !== allowedOrigin) {
    response.status(403).json({ error: "このサイトからはアップロードできません。" });
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
    response.status(400).json({ error: error.message || "画像保存に失敗しました。" });
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

app.listen(port, async () => {
  await fs.mkdir(uploadDir, { recursive: true });
  console.log(`Server listening on port ${port}`);
});
