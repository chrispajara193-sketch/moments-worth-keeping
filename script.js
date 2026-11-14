const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwq-CEALuQWgVd7M98xAJpeChajtgh76J4ODq7sJjIv9Pq0hnUW4oAC9wdAsgdokXlfoA/exec";
const POLL_INTERVAL_MS = 4000;

const params = new URLSearchParams(window.location.search);
const isCameraMode = params.get("mode") === "camera";

if (isCameraMode) {
  initCameraMode();
} else {
  initWallMode();
}

/* ==================== LIVE WALL MODE ==================== */
function initWallMode() {
  document.getElementById("wall-view").classList.remove("hidden");

  // Build QR code pointing directly to ?mode=camera on your deployed domain
  const cameraUrl = `${window.location.origin}${window.location.pathname}?mode=camera`;
  document.getElementById("qr-url-text").textContent = cameraUrl;

  new QRCode(document.getElementById("qrcode"), {
    text: cameraUrl,
    width: 180,
    height: 180,
    colorDark: "#0f172a",
    colorLight: "#ffffff",
    correctLevel: QRCode.CorrectLevel.M
  });

  const renderedIds = new Set();
  const gallery = document.getElementById("gallery-grid");
  const emptyState = document.getElementById("empty-state");
  const syncStatus = document.getElementById("sync-status");

  async function fetchPosts() {
    if (SCRIPT_URL.includes("PASTE_YOUR")) {
      syncStatus.textContent = "Set SCRIPT_URL in script.js";
      return;
    }

    try {
      const res = await fetch(`${SCRIPT_URL}?t=${Date.now()}`);
      const data = await res.json();

      if (data.status === "success" && Array.isArray(data.posts)) {
        // API returns newest first; iterate in reverse so newest ends up on top
        const posts = [...data.posts].reverse();
        posts.forEach((post) => {
          if (!renderedIds.has(post.id)) {
            renderedIds.add(post.id);
            gallery.prepend(createPhotoCard(post));
          }
        });

        emptyState.classList.toggle("hidden", renderedIds.size > 0);
        syncStatus.textContent = `Updated ${new Date().toLocaleTimeString()}`;
      }
    } catch (err) {
      console.error("Polling error:", err);
      syncStatus.textContent = "Reconnecting...";
    } finally {
      setTimeout(fetchPosts, POLL_INTERVAL_MS);
    }
  }

  fetchPosts();
}

function createPhotoCard(post) {
  const card = document.createElement("article");
  card.className = "photo-card";

  const img = document.createElement("img");
  img.src = post.imageUrl;
  img.alt = post.caption || "Guest photo";
  img.loading = "lazy";
  img.referrerPolicy = "no-referrer";

  const meta = document.createElement("div");
  meta.className = "photo-meta";

  const author = document.createElement("div");
  author.className = "photo-author";
  author.textContent = post.author || "Guest";

  const time = document.createElement("div");
  time.className = "photo-time";
  time.textContent = formatTime(post.timestamp);

  meta.appendChild(author);

  if (post.caption) {
    const caption = document.createElement("div");
    caption.className = "photo-caption";
    caption.textContent = post.caption;
    meta.appendChild(caption);
  }

  meta.appendChild(time);
  card.appendChild(img);
  card.appendChild(meta);
  return card;
}

function formatTime(isoString) {
  const date = new Date(isoString);
  return isNaN(date.getTime()) ? "" : date.toLocaleString();
}

/* ==================== DIRECT CAMERA MODE ==================== */
function initCameraMode() {
  document.getElementById("camera-view").classList.remove("hidden");

  const video = document.getElementById("camera-video");
  const canvas = document.getElementById("capture-canvas");
  const cameraError = document.getElementById("camera-error");

  const cameraStage = document.getElementById("camera-stage");
  const previewStage = document.getElementById("preview-stage");
  const successStage = document.getElementById("success-stage");

  const photoPreview = document.getElementById("photo-preview");
  const flipBtn = document.getElementById("flip-btn");
  const snapBtn = document.getElementById("snap-btn");
  const nativeInput = document.getElementById("native-camera-input");
  const retakeBtn = document.getElementById("retake-btn");
  const postForm = document.getElementById("post-form");
  const uploadBtn = document.getElementById("upload-btn");
  const uploadStatus = document.getElementById("upload-status");
  const anotherBtn = document.getElementById("another-btn");

  let stream = null;
  let facingMode = "environment"; // Rear camera by default
  let capturedBase64 = "";

  async function startCamera() {
    stopCamera();
    cameraError.classList.add("hidden");

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      cameraError.classList.remove("hidden");
      return;
    }

    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: facingMode }, width: { ideal: 1280 }, height: { ideal: 960 } },
        audio: false
      });
      video.srcObject = stream;
      video.classList.toggle("mirrored", facingMode === "user");
    } catch (err) {
      console.warn("Camera access denied or unavailable:", err);
      cameraError.classList.remove("hidden");
    }
  }

  function stopCamera() {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      stream = null;
    }
  }

  function compressToJpeg(sourceWidth, sourceHeight, drawFn) {
    const maxDim = 1080;
    const scale = Math.min(1, maxDim / Math.max(sourceWidth, sourceHeight));
    canvas.width = Math.round(sourceWidth * scale);
    canvas.height = Math.round(sourceHeight * scale);

    const ctx = canvas.getContext("2d");
    ctx.save();
    drawFn(ctx, canvas.width, canvas.height);
    ctx.restore();

    return canvas.toDataURL("image/jpeg", 0.8);
  }

  function showPreview(dataUrl) {
    capturedBase64 = dataUrl;
    photoPreview.src = dataUrl;
    stopCamera();
    cameraStage.classList.add("hidden");
    successStage.classList.add("hidden");
    previewStage.classList.remove("hidden");
  }

  flipBtn.addEventListener("click", () => {
    facingMode = facingMode === "environment" ? "user" : "environment";
    startCamera();
  });

  snapBtn.addEventListener("click", () => {
    if (!video.videoWidth) return;
    const dataUrl = compressToJpeg(video.videoWidth, video.videoHeight, (ctx, w, h) => {
      if (facingMode === "user") {
        ctx.translate(w, 0);
        ctx.scale(-1, 1);
      }
      ctx.drawImage(video, 0, 0, w, h);
    });
    showPreview(dataUrl);
  });

  // Fallback for native mobile camera app
  nativeInput.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const img = new Image();
    img.onload = () => {
      const dataUrl = compressToJpeg(img.width, img.height, (ctx, w, h) => {
        ctx.drawImage(img, 0, 0, w, h);
      });
      URL.revokeObjectURL(img.src);
      showPreview(dataUrl);
    };
    img.src = URL.createObjectURL(file);
  });

  retakeBtn.addEventListener("click", () => {
    capturedBase64 = "";
    uploadStatus.textContent = "";
    previewStage.classList.add("hidden");
    cameraStage.classList.remove("hidden");
    startCamera();
  });

  anotherBtn.addEventListener("click", () => {
    document.getElementById("caption-input").value = "";
    uploadStatus.textContent = "";
    successStage.classList.add("hidden");
    cameraStage.classList.remove("hidden");
    startCamera();
  });

  postForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!capturedBase64) return;

    uploadBtn.disabled = true;
    uploadStatus.textContent = "Uploading photo...";

    const payload = {
      imageBase64: capturedBase64,
      author: document.getElementById("author-input").value,
      caption: document.getElementById("caption-input").value
    };

    try {
      // text/plain prevents CORS preflight failure on Google Apps Script
      const res = await fetch(SCRIPT_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(payload),
        redirect: "follow"
      });
      const result = await res.json();

      if (result.status === "success") {
        previewStage.classList.add("hidden");
        successStage.classList.remove("hidden");
      } else {
        throw new Error(result.message || "Upload failed");
      }
    } catch (err) {
      console.error(err);
      uploadStatus.textContent = "Upload failed. Check your connection and try again.";
    } finally {
      uploadBtn.disabled = false;
    }
  });

  startCamera();
}