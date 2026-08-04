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
      this.resizeImage(reader.result, 900, 0.82).then((resizedDataUrl) => {
        this.photoDataUrl = resizedDataUrl;
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
        resolve({ lat: 35.1796, lng: 129.0756 });
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => resolve({ lat: 35.1796, lng: 129.0756 }),
        { timeout: 5000 }
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
    const tier = CATEGORY_TIER[this.selectedCategory] || "mid";

    const report = {
      id: "r" + Date.now(),
      category: this.selectedCategory,
      tier,
      lat: loc.lat,
      lng: loc.lng,
      photo: this.photoDataUrl,
      time: new Date().toISOString(),
      status: tier === "high" ? "긴급 알림 전송됨" : "접수됨"
    };
    Store.addReport(report);

    postBtn.disabled = false;
    postBtn.textContent = "게시";
    this.showResult(tier);
  },

  showResult(tier) {
    const messages = {
      high: "🚒 소방청에 즉시 알림이 전송되었습니다.\n동시에 지도에 경고 표시로 공개됩니다.",
      mid: "접수되어 관계기관에 이관됩니다.\n지도에 공개됩니다.",
      low: "지도에 공개됩니다.\n아래 자가 대처 안내를 참고해주세요."
    };
    document.getElementById("resultMessage").textContent = messages[tier];
    document.getElementById("resultTier").textContent = TIER_LABEL[tier];
    document.getElementById("resultTier").style.color = TIER_COLOR[tier];
    document.getElementById("reportResultOverlay").classList.add("active");
  },

  finish() {
    document.getElementById("reportResultOverlay").classList.remove("active");
    this.resetToCapture();
    App.showScreen("map");
    RiskMap.render();
  }
};
