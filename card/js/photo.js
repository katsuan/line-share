// お知らせカード：端末の写真（縮めてアップロード。保存先は shared/plan.js が選ぶ）

// ---- 端末の写真 ----

const PHOTO_MAX_SIDE = 1200;

async function uploadPhoto(file) {
  if (!file.type.startsWith("image/")) {
    setPhotoStatus("画像ファイルを選んでください。", true);
    return;
  }
  try {
    const dataUrl = await resizePhoto(file);
    photo.uploading = true;
    photo.localUrl = dataUrl;
    setPhotoStatus("アップロードしています…（初回は30秒ほどかかることがあります）");
    render();

    // アップロード先（無料は画像サーバー、有償は GAS）は shared/plan.js が選ぶ
    const imageUrl = await window.LineSharePlan.upload(dataUrl);

    state.imageUrl = imageUrl;
    state.imageRatio = "";
    els.imageUrlInput.value = imageUrl;
    setPhotoStatus("写真を入れました。");
  } catch (error) {
    console.error(error);
    setPhotoStatus("写真をアップロードできませんでした。時間をおいてもう一度お試しください。", true);
  } finally {
    photo.uploading = false;
    photo.localUrl = "";
    render();
  }
}

// 端末から選んでアップロードした写真か（画像サーバーのファイルはスリープで消えることがある）
function isUploadedPhoto(url) {
  const base = String(config.imageApiBaseUrl || "").replace(/\/$/, "");
  return Boolean(base && url && url.startsWith(`${base}/uploads/`));
}

// 長い辺を 1200px までに縮めて JPEG にする（アップロードを軽くし、カードに十分な大きさを保つ）
function resizePhoto(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, PHOTO_MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.naturalWidth * scale);
      canvas.height = Math.round(img.naturalHeight * scale);
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/jpeg", 0.85));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("画像を読み込めませんでした。"));
    };
    img.src = url;
  });
}

function setPhotoStatus(message, isError = false) {
  els.photoStatus.textContent = message;
  els.photoStatus.hidden = !message;
  els.photoStatus.classList.toggle("is-error", isError);
}
