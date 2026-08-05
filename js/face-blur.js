// 제보 사진 속 얼굴을 자동으로 모자이크 처리한다. 전부 브라우저 안에서 실행되며
// (face-api.js + TinyFaceDetector, 서버 없이 클라이언트에서만 추론) 최초 1회만
// 라이브러리/모델(약 850KB)을 내려받고, 이후엔 캐시돼 바로 추론한다.
// 얼굴 인식이 실패하거나(네트워크 문제 등) 얼굴이 없으면 원본 사진을 그대로 쓴다 —
// 게시 자체가 막히지는 않는다.
const FaceBlur = {
  libLoadPromise: null,
  modelsLoadPromise: null,

  loadLibrary() {
    if (this.libLoadPromise) return this.libLoadPromise;
    this.libLoadPromise = new Promise((resolve, reject) => {
      if (window.faceapi) {
        resolve();
        return;
      }
      const script = document.createElement("script");
      script.src = "vendor/face-api.min.js";
      script.onload = () => resolve();
      script.onerror = () => reject(new Error("face-api.js 로드 실패"));
      document.head.appendChild(script);
    });
    return this.libLoadPromise;
  },

  loadModels() {
    if (this.modelsLoadPromise) return this.modelsLoadPromise;
    this.modelsLoadPromise = this.loadLibrary().then(() =>
      faceapi.nets.tinyFaceDetector.loadFromUri("./models")
    );
    return this.modelsLoadPromise;
  },

  loadImage(dataUrl) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = dataUrl;
    });
  },

  // 얼굴 박스를 축소→확대(블록화)해서 모자이크 처리한다. 경계에 살짝 여유(pad)를 둬서
  // 얼굴 인식 박스가 약간 작게 잡혀도 얼굴 윤곽이 남지 않게 한다.
  pixelateRegion(ctx, box) {
    const pad = box.width * 0.15;
    const x = Math.max(0, Math.floor(box.x - pad));
    const y = Math.max(0, Math.floor(box.y - pad));
    const w = Math.min(ctx.canvas.width - x, Math.ceil(box.width + pad * 2));
    const h = Math.min(ctx.canvas.height - y, Math.ceil(box.height + pad * 2));
    if (w <= 0 || h <= 0) return;

    const blockSize = Math.max(6, Math.round(w / 12));
    const small = document.createElement("canvas");
    small.width = Math.max(1, Math.round(w / blockSize));
    small.height = Math.max(1, Math.round(h / blockSize));
    const sctx = small.getContext("2d");
    sctx.drawImage(ctx.canvas, x, y, w, h, 0, 0, small.width, small.height);

    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(small, 0, 0, small.width, small.height, x, y, w, h);
    ctx.imageSmoothingEnabled = true;
  },

  // dataUrl -> Promise<dataUrl> (얼굴 부분만 모자이크된 새 이미지, 실패/얼굴없음 시 원본 그대로)
  async process(dataUrl) {
    try {
      await this.loadModels();
      const img = await this.loadImage(dataUrl);
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth || img.width;
      canvas.height = img.naturalHeight || img.height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      const detections = await faceapi.detectAllFaces(canvas, new faceapi.TinyFaceDetectorOptions());
      if (!detections.length) return dataUrl;

      detections.forEach((d) => this.pixelateRegion(ctx, d.box));
      return canvas.toDataURL("image/jpeg", 0.9);
    } catch (e) {
      console.warn("얼굴 인식 실패 — 원본 사진을 그대로 사용합니다:", e);
      return dataUrl;
    }
  }
};
