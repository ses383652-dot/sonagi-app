const Report = {
  photoDataUrl: null,

  init() {
    document.getElementById("reportBack").addEventListener("click", () => App.showScreen(App.lastTabScreen));
    document.getElementById("galleryBtn").addEventListener("click", () => document.getElementById("galleryInput").click());
    document.getElementById("shutterBtn").addEventListener("click", () => document.getElementById("cameraInput").click());
    document.getElementById("galleryInput").addEventListener("change", (e) => this.onPhoto(e));
    document.getElementById("cameraInput").addEventListener("change", (e) => this.onPhoto(e));
    document.getElementById("categoryBack").addEventListener("click", () => this.resetToCapture());
    document.getElementById("postBtn").addEventListener("click", () => this.submit());
    document.getElementById("resultConfirm").addEventListener("click", () => this.finish());
    this.renderCategories();
  },

  reset() {
    this.resetToCapture();
  },

  resetToCapture() {
    this.photoDataUrl = null;
    this.selectedCategory = null;
    document.getElementById("captureStep").style.display = "flex";
    document.getElementById("categoryStep").style.display = "none";
    document.getElementById("galleryInput").value = "";
    document.getElementById("cameraInput").value = "";
  },

  onPhoto(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      this.resizeImage(reader.result, 900, 0.82).then(async (resizedDataUrl) => {
        const overlay = document.getElementById("faceProcessingOverlay");
        if (overlay) overlay.style.display = "flex";

        this.photoDataUrl = await FaceBlur.process(resizedDataUrl);

        if (overlay) overlay.style.display = "none";
        document.getElementById("captureStep").style.display = "none";
        document.getElementById("categoryStep").style.display = "block";
        document.getElementById("photoPreviewSmall").src = this.photoDataUrl;
        this.selectedCategory = null;
        this.renderCategories();
      });
    };
    reader.readAsDataURL(file);
  },

  // 사진을 실제로 저장(IndexedDB)하게 되면서, 원본 그대로(수 MB) 쌓이지 않도록
  // 긴 변 기준 900px로 줄이고 JPEG로 압축해 용량을 크게 낮춘다.
  resizeImage(dataUrl, maxSize, quality) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width <= maxSize && height <= maxSize) {
          resolve(dataUrl);
          return;
        }
        const scale = maxSize / Math.max(width, height);
        width = Math.round(width * scale);
        height = Math.round(height * scale);
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        canvas.getContext("2d").drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.onerror = () => resolve(dataUrl);
      img.src = dataUrl;
    });
  },

  renderCategories() {
    const wrap = document.getElementById("categoryList");
    wrap.innerHTML = "";
    CATEGORY_GROUPS.forEach((group) => {
      const groupEl = document.createElement("div");
      groupEl.className = "catGroup";
      const heading = document.createElement("h3");
      heading.textContent = group.name;
      groupEl.appendChild(heading);
      group.items.forEach((item) => {
        const label = document.createElement("label");
        label.className = "catOption";
        label.innerHTML = `<input type="radio" name="category" value="${item}"> ${item}`;
        label.querySelector("input").addEventListener("change", () => {
          this.selectedCategory = item;
          document.querySelectorAll(".catOption").forEach((el) => el.classList.remove("selected"));
          label.classList.add("selected");
        });
        groupEl.appendChild(label);
      });
      wrap.appendChild(groupEl);
    });
  },

  getLocation() {
    return new Promise((resolve) => {
      if (!navigator.geolocation) {
        alert("이 브라우저에서는 위치 확인을 지원하지 않아 임시로 부산시청 좌표를 사용합니다.");
        resolve({ lat: 35.1796, lng: 129.0756 });
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => {
          alert("위치 정보를 가져올 수 없어 임시로 부산시청 좌표를 사용합니다. 위치 접근 권한을 확인해주세요.");
          resolve({ lat: 35.1796, lng: 129.0756 });
        },
        { timeout: 8000, enableHighAccuracy: true }
      );
    });
  },

  snapToNearestRoad(lat, lng) {
    return { lat, lng };
  },

  async submit() {
    if (!this.selectedCategory) {
      alert("유형을 선택해주세요.");
      return;
    }
    const postBtn = document.getElementById("postBtn");
    postBtn.disabled = true;
    postBtn.textContent = "위치 확인 중...";

    const rawLoc = await this.getLocation();
    const loc = this.snapToNearestRoad(rawLoc.lat, rawLoc.lng);

    // 긴급도는 더 이상 카테고리로 정하지 않는다 — 공감 수(0부터 시작)로만 정해지며
    // 공감이 쌓여 임계값(5, 10)을 넘을 때마다 자동으로 한 단계씩 올라간다.
    const report = {
      id: "r" + Date.now(),
      category: this.selectedCategory,
      lat: loc.lat,
      lng: loc.lng,
      photo: this.photoDataUrl,
      time: new Date().toISOString(),
      status: "접수됨"
    };
    Store.addReport(report);
    this.lastSubmittedLoc = { lat: report.lat, lng: report.lng };

    postBtn.disabled = false;
    postBtn.textContent = "게시";
    this.showResult();
  },

  showResult() {
    document.getElementById("resultMessage").textContent =
      "지도에 공개됩니다.\n다른 시민들의 공감이 모이면 긴급도가 자동으로 올라가고, 고긴급(공감 10개 이상)이 되면 소방청에 즉시 알림이 전송됩니다.";
    document.getElementById("resultTier").textContent = TIER_LABEL.low;
    document.getElementById("resultTier").style.color = TIER_COLOR.low;
    document.getElementById("reportResultOverlay").classList.add("active");
  },

  finish() {
    document.getElementById("reportResultOverlay").classList.remove("active");
    this.resetToCapture();
    if (this.lastSubmittedLoc) {
      RiskMap.focusOn(this.lastSubmittedLoc.lat, this.lastSubmittedLoc.lng, 3);
    }
    App.showScreen("map");
    RiskMap.render();
  }
};
