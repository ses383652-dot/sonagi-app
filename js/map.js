const HEAT_GRID_CELL_PX = 4;   // 밀도 그리드 해상도(작을수록 정밀하지만 느림)
const HEAT_KERNEL_RADIUS_CELLS = 5; // 커널 반경(그리드 셀 단위)

const RiskMap = {
  kakaoMap: null,
  infowindow: null,
  kakaoReady: false,
  mapBuilt: false,
  donePoints: [], // [lat, lng, catIndex]
  doneLoaded: false,
  doneCategories: [],
  doneCategoriesLoaded: false,
  selectedDoneCategory: null, // null = 전체
  gradientLUT: null,
  reportMarkers: [],
  filters: {
    recentOnly: false,
    group: "전체",
    tiers: { high: true, mid: true, low: true, done: true },
    alerts: false
  },

  init() {
    this.buildFilterBar();
    this.loadKakaoScript();
    this.prefetchData();
    window.addEventListener("resize", () => {
      if (App.current === "map") this.onShow();
    });
  },

  onShow() {
    this.tryBuildMap();
    if (this.kakaoMap) {
      this.kakaoMap.relayout();
      this.renderHeatmap();
      this.render();
    }
  },

  buildFilterBar() {
    const bar = document.getElementById("mapFilterBar");
    const dateChip = this.makeChip("날짜: 전체", () => {
      this.filters.recentOnly = !this.filters.recentOnly;
      dateChip.textContent = this.filters.recentOnly ? "날짜: 최근1주일" : "날짜: 전체";
      dateChip.classList.toggle("on", this.filters.recentOnly);
      this.render();
    });
    bar.appendChild(dateChip);

    const groupSelect = document.createElement("select");
    groupSelect.className = "chip";
    groupSelect.innerHTML = ["전체", ...CATEGORY_GROUPS.map((g) => g.name)]
      .map((g) => `<option value="${g}">${g}</option>`).join("");
    groupSelect.addEventListener("change", () => {
      this.filters.group = groupSelect.value;
      this.render();
    });
    bar.appendChild(groupSelect);

    ["high", "mid", "low", "done"].forEach((tier) => {
      const label = tier === "done" ? "완료★" : (tier === "high" ? "고긴급" : tier === "mid" ? "중간" : "저긴급");
      const chip = this.makeChip(label, () => {
        this.filters.tiers[tier] = !this.filters.tiers[tier];
        chip.classList.toggle("on", this.filters.tiers[tier]);
        this.render();
      });
      chip.classList.add("on");
      bar.appendChild(chip);
    });

    const alertChip = this.makeChip("🔔 알림", () => {
      this.filters.alerts = !this.filters.alerts;
      alertChip.classList.toggle("on", this.filters.alerts);
    });
    bar.appendChild(alertChip);

    const doneCatSelect = document.createElement("select");
    doneCatSelect.className = "chip";
    doneCatSelect.innerHTML = '<option value="">구조활동 유형: 전체</option>';
    doneCatSelect.addEventListener("change", () => {
      this.selectedDoneCategory = doneCatSelect.value === "" ? null : Number(doneCatSelect.value);
      this.renderHeatmap();
    });
    bar.appendChild(doneCatSelect);
    this.doneCatSelectEl = doneCatSelect;
  },

  populateDoneCategorySelect() {
    const sel = this.doneCatSelectEl;
    if (!sel || !this.doneCategoriesLoaded) return;
    this.doneCategories.forEach((name, i) => {
      const opt = document.createElement("option");
      opt.value = String(i);
      opt.textContent = name;
      sel.appendChild(opt);
    });
  },

  makeChip(text, onClick) {
    const chip = document.createElement("button");
    chip.className = "chip";
    chip.textContent = text;
    chip.addEventListener("click", onClick);
    return chip;
  },

  loadKakaoScript() {
    const APP_KEY = "e36a91c3b660cbbdbc3545f24389d0d3";
    const script = document.createElement("script");
    script.src = "https://dapi.kakao.com/v2/maps/sdk.js?appkey=" + APP_KEY + "&autoload=false";
    script.onload = () => {
      kakao.maps.load(() => {
        this.kakaoReady = true;
        this.tryBuildMap();
      });
    };
    document.head.appendChild(script);
  },

  prefetchData() {
    fetch("./data/busan_done_points.json")
      .then((r) => r.json())
      .then((data) => {
        this.donePoints = data;
        this.doneLoaded = true;
        if (this.kakaoMap) this.renderHeatmap();
        this.updateStatus();
      });

    fetch("./data/busan_done_categories.json")
      .then((r) => r.json())
      .then((data) => {
        this.doneCategories = data;
        this.doneCategoriesLoaded = true;
        this.populateDoneCategorySelect();
      });
  },

  tryBuildMap() {
    if (this.mapBuilt) return;
    const container = document.getElementById("map");
    if (!this.kakaoReady || !container || container.offsetHeight === 0) return;

    this.mapBuilt = true;
    this.kakaoMap = new kakao.maps.Map(container, {
      center: new kakao.maps.LatLng(35.1796, 129.0756),
      level: 9
    });
    this.infowindow = new kakao.maps.InfoWindow({ zIndex: 1 });
    this.gradientLUT = this.buildGradientLUT();

    kakao.maps.event.addListener(this.kakaoMap, "idle", () => this.renderHeatmap());

    this.render();
    this.renderHeatmap();
    this.updateStatus();
  },

  buildGradientLUT() {
    const c = document.createElement("canvas");
    c.width = 1;
    c.height = 256;
    const ctx = c.getContext("2d");
    const grad = ctx.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0.0, "rgba(0,0,255,0)");
    grad.addColorStop(0.25, "rgba(0,0,255,1)");
    grad.addColorStop(0.45, "rgba(0,255,255,1)");
    grad.addColorStop(0.65, "rgba(0,255,0,1)");
    grad.addColorStop(0.85, "rgba(255,255,0,1)");
    grad.addColorStop(1.0, "rgba(255,0,0,1)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 1, 256);
    return ctx.getImageData(0, 0, 1, 256).data;
  },

  // 커널밀도추정(KDE): 화면을 작은 그리드로 나누고, 각 지점마다 가우시안 커널을
  // 주변 셀에 더해 누적한다. 절대 알파값을 그대로 쌓지 않고, 그리드 안에서
  // "실제로 관측된 최댓값" 기준으로 정규화한 뒤 색을 입힌다 — 그래야 확대/축소나
  // 화면 안 점 개수가 달라져도(도심 vs 외곽) 항상 상대적 밀도 차이가 보인다.
  renderHeatmap() {
    if (!this.kakaoMap || !this.doneLoaded) return;
    const canvas = document.getElementById("heatmapCanvas");
    const mapEl = document.getElementById("map");
    const w = mapEl.clientWidth;
    const h = mapEl.clientHeight;
    if (!w || !h) return;

    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }

    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, w, h);

    const gw = Math.ceil(w / HEAT_GRID_CELL_PX);
    const gh = Math.ceil(h / HEAT_GRID_CELL_PX);
    const density = new Float32Array(gw * gh);

    const bounds = this.kakaoMap.getBounds();
    const proj = this.kakaoMap.getProjection();
    const R = HEAT_KERNEL_RADIUS_CELLS;
    const sigma2 = (R / 2) * (R / 2) * 2;
    let count = 0;

    for (let i = 0; i < this.donePoints.length; i++) {
      const p = this.donePoints[i];
      if (this.selectedDoneCategory !== null && p[2] !== this.selectedDoneCategory) continue;
      const latlng = new kakao.maps.LatLng(p[0], p[1]);
      if (!bounds.contain(latlng)) continue;
      const pt = proj.containerPointFromCoords(latlng);
      const gx = pt.x / HEAT_GRID_CELL_PX;
      const gy = pt.y / HEAT_GRID_CELL_PX;
      const x0 = Math.max(0, Math.floor(gx - R));
      const x1 = Math.min(gw - 1, Math.ceil(gx + R));
      const y0 = Math.max(0, Math.floor(gy - R));
      const y1 = Math.min(gh - 1, Math.ceil(gy + R));
      for (let yy = y0; yy <= y1; yy++) {
        const dy = yy - gy;
        const rowBase = yy * gw;
        for (let xx = x0; xx <= x1; xx++) {
          const dx = xx - gx;
          const d2 = dx * dx + dy * dy;
          if (d2 > R * R) continue;
          density[rowBase + xx] += Math.exp(-d2 / sigma2);
        }
      }
      count++;
    }

    if (count > 0) {
      let maxV = 0;
      for (let i = 0; i < density.length; i++) if (density[i] > maxV) maxV = density[i];

      if (maxV > 0) {
        const small = document.createElement("canvas");
        small.width = gw;
        small.height = gh;
        const sctx = small.getContext("2d");
        const img = sctx.createImageData(gw, gh);
        const lut = this.gradientLUT;
        for (let i = 0; i < density.length; i++) {
          const v = density[i] / maxV; // 0~1 정규화
          if (v <= 0) continue;
          const a = Math.min(255, Math.round(Math.pow(v, 0.6) * 255));
          const li = a * 4;
          const o = i * 4;
          img.data[o] = lut[li];
          img.data[o + 1] = lut[li + 1];
          img.data[o + 2] = lut[li + 2];
          img.data[o + 3] = a;
        }
        sctx.putImageData(img, 0, 0);
        ctx.imageSmoothingEnabled = true;
        ctx.drawImage(small, 0, 0, gw, gh, 0, 0, w, h);
      }
    }

    this.visibleCount = count;
    this.hideSpinner();
    this.updateStatus();
  },

  categoryGroup(category) {
    const found = CATEGORY_GROUPS.find((g) => g.items.includes(category));
    return found ? found.name : "";
  },

  passesFilter(report) {
    if (this.filters.recentOnly) {
      const days = (Date.now() - new Date(report.time).getTime()) / 86400000;
      if (days > 7) return false;
    }
    if (this.filters.group !== "전체" && this.categoryGroup(report.category) !== this.filters.group) return false;
    const isDone = report.status === "처리완료";
    if (isDone) return this.filters.tiers.done;
    return this.filters.tiers[report.tier];
  },

  dotImage(color, size) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
      <circle cx="${size/2}" cy="${size/2}" r="${size/2-1.5}" fill="${color}" stroke="white" stroke-width="1.5"/>
    </svg>`;
    const url = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svg)));
    return new kakao.maps.MarkerImage(url, new kakao.maps.Size(size, size));
  },

  starImage() {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22">
      <text x="11" y="17" font-size="18" text-anchor="middle" fill="#1f8a52">★</text>
    </svg>`;
    const url = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svg)));
    return new kakao.maps.MarkerImage(url, new kakao.maps.Size(22, 22));
  },

  render() {
    if (!this.kakaoMap) return;
    this.reportMarkers.forEach((m) => m.setMap(null));
    this.reportMarkers = [];

    Store.reports.filter((r) => this.passesFilter(r)).forEach((report) => {
      const isDone = report.status === "처리완료";
      const image = isDone ? this.starImage() : this.dotImage(TIER_COLOR[report.tier], 16);
      const marker = new kakao.maps.Marker({
        position: new kakao.maps.LatLng(report.lat, report.lng),
        image
      });
      marker.setMap(this.kakaoMap);
      kakao.maps.event.addListener(marker, "click", () => this.openPopup(marker, report));
      this.reportMarkers.push(marker);
    });

    this.updateStatus();
  },

  updateStatus() {
    const el = document.getElementById("mapStatus");
    if (!el) return;
    if (!this.doneLoaded) {
      el.textContent = "데이터 불러오는 중...";
      return;
    }
    const catName = this.selectedDoneCategory !== null && this.doneCategories[this.selectedDoneCategory]
      ? this.doneCategories[this.selectedDoneCategory]
      : "전체";
    const total = this.selectedDoneCategory === null
      ? this.donePoints.length
      : this.donePoints.filter((p) => p[2] === this.selectedDoneCategory).length;
    el.textContent = `구조활동 완료(${catName}) ${total.toLocaleString()}건(밀도 히트맵) + 제보 ${Store.reports.length}건`;
  },

  hideSpinner() {
    const el = document.getElementById("mapSpinner");
    if (el) el.style.display = "none";
  },

  openPopup(marker, report) {
    const photoHtml = report.photo
      ? `<img src="${report.photo}" style="width:64px;height:64px;object-fit:cover;border-radius:6px;">`
      : `<div style="width:64px;height:64px;background:#ddd;border-radius:6px;"></div>`;
    const content = document.createElement("div");
    content.style.cssText = "padding:10px 12px;font-size:12px;max-width:220px;";
    content.innerHTML = `
      <div style="display:flex;gap:10px;">
        ${photoHtml}
        <div>
          <b>${report.category}</b><br/>
          <span style="color:${TIER_COLOR[report.tier]}">${TIER_LABEL[report.tier]}</span><br/>
          상태: ${report.status}
        </div>
      </div>
      ${report.status !== "처리완료" ? '<button id="doneBtn" style="margin-top:8px;width:100%;padding:6px;border-radius:6px;border:1px solid #2ecc71;background:#eafaf1;color:#1f8a52;font-size:11.5px;cursor:pointer;">처리완료로 표시</button>' : ""}
    `;
    this.infowindow.setContent(content);
    this.infowindow.open(this.kakaoMap, marker);
    const doneBtn = content.querySelector("#doneBtn");
    if (doneBtn) {
      doneBtn.addEventListener("click", () => {
        report.status = "처리완료";
        Store.saveReports();
        this.infowindow.close();
        this.render();
      });
    }
  }
};
