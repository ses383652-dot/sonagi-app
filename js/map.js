const HEAT_GRID_CELL_PX = 4;   // 밀도 그리드 해상도(작을수록 정밀하지만 느림)
const HEAT_KERNEL_RADIUS_CELLS = 5; // 커널 반경(그리드 셀 단위)
const SPATIAL_BUCKET_SIZE_DEG = 0.02; // 공간 인덱스 버킷 크기(약 2km) — 확대 시 후보를 크게 줄여줌

const DATE_MODES = ["1w", "1m", "1y", "all"];
const DATE_MODE_LABEL = { "1w": "최근 1주일", "1m": "최근 1달", "1y": "최근 1년", all: "전체" };
const DATE_MODE_DAYS = { "1w": 7, "1m": 30, "1y": 365, all: Infinity };

const RiskMap = {
  kakaoMap: null,
  infowindow: null,
  kakaoReady: false,
  mapBuilt: false,
  donePoints: [], // [lat, lng, catIndex, dayIndex]
  doneLoaded: false,
  doneMaxDay: 365,
  spatialIndex: null, // Map<"bx_by", number[]> (donePoints 인덱스 목록)
  doneCategories: [],
  doneCategoriesLoaded: false,
  selectedDoneCategory: null, // null = 전체
  gradientLUT: null,
  reportMarkers: [],
  openPopupReport: null,
  tagPickMode: false,
  tagPickCallback: null,
  heatmapVisible: true,
  dateMode: "all",
  filters: {
    group: "전체",
    buckets: { low: true, mid: true, high: true }
  },

  init() {
    this.buildFilterBars();
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

  // 화면 상단 필터를 "제보(공감/유형)"와 "기존 매핑데이터(구조활동)" 두 줄로
  // 나눠서 배치한다(항목 22) — 서로 다른 데이터셋을 다루므로 한 줄에 이어붙이지 않는다.
  buildFilterBars() {
    const bar1 = document.getElementById("mapFilterBar");
    const bar2 = document.getElementById("mapFilterBar2");

    const dateChip = this.makeChip("날짜: " + DATE_MODE_LABEL[this.dateMode], () => {
      const idx = DATE_MODES.indexOf(this.dateMode);
      this.dateMode = DATE_MODES[(idx + 1) % DATE_MODES.length];
      dateChip.textContent = "날짜: " + DATE_MODE_LABEL[this.dateMode];
      this.render();
      this.renderHeatmap();
    });
    bar1.appendChild(dateChip);

    const groupSelect = document.createElement("select");
    groupSelect.className = "chip";
    groupSelect.innerHTML = ["전체", ...CATEGORY_GROUPS.map((g) => g.name)]
      .map((g) => `<option value="${g}">${g}</option>`).join("");
    groupSelect.addEventListener("change", () => {
      this.filters.group = groupSelect.value;
      if (
        this.openPopupReport &&
        this.filters.group !== "전체" &&
        this.categoryGroup(this.openPopupReport.category) !== this.filters.group
      ) {
        this.closePopup();
      }
      this.render();
    });
    bar1.appendChild(groupSelect);

    ["low", "mid", "high"].forEach((bucket) => {
      const chip = this.makeChip("❤️ " + EMPATHY_BUCKET_LABEL[bucket], () => {
        this.filters.buckets[bucket] = !this.filters.buckets[bucket];
        chip.classList.toggle("on", this.filters.buckets[bucket]);
        this.render();
      });
      chip.classList.add("on");
      bar1.appendChild(chip);
    });

    const hostChip = this.makeChip(Store.isHost ? "🔑 호스트 모드 ON" : "호스트 모드", () => {
      const on = Store.toggleHost();
      hostChip.textContent = on ? "🔑 호스트 모드 ON" : "호스트 모드";
      hostChip.classList.toggle("on", on);
    });
    if (Store.isHost) hostChip.classList.add("on");
    bar1.appendChild(hostChip);

    const doneCatSelect = document.createElement("select");
    doneCatSelect.className = "chip";
    doneCatSelect.innerHTML = '<option value="">구조활동 유형: 전체</option>';
    doneCatSelect.addEventListener("change", () => {
      this.selectedDoneCategory = doneCatSelect.value === "" ? null : Number(doneCatSelect.value);
      this.renderHeatmap();
    });
    bar2.appendChild(doneCatSelect);
    this.doneCatSelectEl = doneCatSelect;

    const heatChip = this.makeChip("히트맵 표시", () => {
      this.heatmapVisible = !this.heatmapVisible;
      heatChip.classList.toggle("on", this.heatmapVisible);
      this.renderHeatmap();
    });
    heatChip.classList.add("on");
    bar2.appendChild(heatChip);
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
        this.buildSpatialIndex();
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

    fetch("./data/busan_done_meta.json")
      .then((r) => r.json())
      .then((data) => {
        this.doneMaxDay = data.maxDay;
      })
      .catch(() => {});
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

  // 공간 인덱싱: 포인트를 위경도 기준 버킷(격자)으로 한 번만 정리해둔다.
  buildSpatialIndex() {
    this.spatialIndex = new Map();
    for (let i = 0; i < this.donePoints.length; i++) {
      const p = this.donePoints[i];
      const bx = Math.floor(p[0] / SPATIAL_BUCKET_SIZE_DEG);
      const by = Math.floor(p[1] / SPATIAL_BUCKET_SIZE_DEG);
      const key = bx + "_" + by;
      let arr = this.spatialIndex.get(key);
      if (!arr) {
        arr = [];
        this.spatialIndex.set(key, arr);
      }
      arr.push(i);
    }
  },

  getCandidateIndices(bounds) {
    const sw = bounds.getSouthWest();
    const ne = bounds.getNorthEast();
    const bx0 = Math.floor(sw.getLat() / SPATIAL_BUCKET_SIZE_DEG);
    const bx1 = Math.floor(ne.getLat() / SPATIAL_BUCKET_SIZE_DEG);
    const by0 = Math.floor(sw.getLng() / SPATIAL_BUCKET_SIZE_DEG);
    const by1 = Math.floor(ne.getLng() / SPATIAL_BUCKET_SIZE_DEG);
    const result = [];
    for (let bx = bx0; bx <= bx1; bx++) {
      for (let by = by0; by <= by1; by++) {
        const arr = this.spatialIndex.get(bx + "_" + by);
        if (arr) result.push(...arr);
      }
    }
    return result;
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

  dateCutoffDay() {
    const span = DATE_MODE_DAYS[this.dateMode];
    if (!isFinite(span)) return -Infinity;
    return this.doneMaxDay - span;
  },

  // 커널밀도추정(KDE): 화면을 작은 그리드로 나누고, 각 지점마다 가우시안 커널을
  // 주변 셀에 더해 누적한다. 그리드 안에서 실제 관측된 최댓값 기준으로 정규화한다.
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

    if (!this.heatmapVisible) {
      this.updateStatus();
      this.hideSpinner();
      return;
    }

    const gw = Math.ceil(w / HEAT_GRID_CELL_PX);
    const gh = Math.ceil(h / HEAT_GRID_CELL_PX);
    const density = new Float32Array(gw * gh);

    const bounds = this.kakaoMap.getBounds();
    const proj = this.kakaoMap.getProjection();
    const R = HEAT_KERNEL_RADIUS_CELLS;
    const sigma2 = (R / 2) * (R / 2) * 2;
    const cutoffDay = this.dateCutoffDay();
    let count = 0;

    const candidates = this.getCandidateIndices(bounds);
    for (let ci = 0; ci < candidates.length; ci++) {
      const p = this.donePoints[candidates[ci]];
      if (this.selectedDoneCategory !== null && p[2] !== this.selectedDoneCategory) continue;
      if (p[3] < cutoffDay) continue;
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
          const v = density[i] / maxV;
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
    const days = DATE_MODE_DAYS[this.dateMode];
    if (isFinite(days)) {
      const ageDays = (Date.now() - new Date(report.time).getTime()) / 86400000;
      if (ageDays > days) return false;
    }
    if (this.filters.group !== "전체" && this.categoryGroup(report.category) !== this.filters.group) return false;
    const bucket = empathyBucket(Store.getEmpathyCount(report.caseId));
    return this.filters.buckets[bucket];
  },

  dotImage(color, size) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
      <circle cx="${size/2}" cy="${size/2}" r="${size/2-1.5}" fill="${color}" stroke="white" stroke-width="1.5"/>
    </svg>`;
    const url = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svg)));
    return new kakao.maps.MarkerImage(url, new kakao.maps.Size(size, size));
  },

  render() {
    if (!this.kakaoMap) return;
    this.reportMarkers.forEach((m) => m.setMap(null));
    this.reportMarkers = [];

    Store.reports.filter((r) => this.passesFilter(r)).forEach((report) => {
      const bucket = empathyBucket(Store.getEmpathyCount(report.caseId));
      const image = this.dotImage(EMPATHY_BUCKET_COLOR[bucket], 16);
      const marker = new kakao.maps.Marker({
        position: new kakao.maps.LatLng(report.lat, report.lng),
        image
      });
      marker.setMap(this.kakaoMap);
      kakao.maps.event.addListener(marker, "click", () => {
        if (this.tagPickMode) {
          const cb = this.tagPickCallback;
          this.tagPickMode = false;
          this.tagPickCallback = null;
          if (cb) cb(report);
          return;
        }
        this.openPopup(marker, report);
      });
      this.reportMarkers.push(marker);
    });

    this.updateStatus();
  },

  // 커뮤니티 글 작성 중 "위치 태그"용 — 지도의 제보 마커를 고르는 모드로 전환한다.
  startTagPick(onPicked) {
    this.tagPickMode = true;
    this.tagPickCallback = onPicked;
  },

  cancelTagPick() {
    this.tagPickMode = false;
    this.tagPickCallback = null;
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
    const heatTxt = this.heatmapVisible ? `구조활동 완료(${catName}) ${total.toLocaleString()}건(밀도 히트맵)` : "히트맵 숨김";
    el.textContent = `${heatTxt} + 제보 ${Store.reports.length}건`;
  },

  hideSpinner() {
    const el = document.getElementById("mapSpinner");
    if (el) el.style.display = "none";
  },

  closePopup() {
    if (this.infowindow) this.infowindow.close();
    this.openPopupReport = null;
  },

  openPopup(marker, report) {
    this.openPopupReport = report;
    const caseId = report.caseId;
    const empCount = Store.getEmpathyCount(caseId);
    const mine = Store.hasEmpathized(caseId);
    const tier = effectiveTier(report.tier, empCount);

    const photoHtml = report.photo
      ? `<img src="${report.photo}" style="width:64px;height:64px;object-fit:cover;border-radius:6px;">`
      : `<div style="width:64px;height:64px;background:#ddd;border-radius:6px;"></div>`;

    const content = document.createElement("div");
    content.style.cssText = "padding:10px 12px;font-size:12px;max-width:220px;position:relative;";
    content.innerHTML = `
      <button id="popupClose" style="position:absolute;top:4px;right:4px;border:none;background:none;font-size:15px;line-height:1;cursor:pointer;color:#999;">✕</button>
      <div style="font-weight:700;color:#e05a4b;margin:0 18px 6px 0;">❤️ ${empCount} 공감</div>
      <div style="display:flex;gap:10px;">
        ${photoHtml}
        <div>
          <b>${report.category}</b><br/>
          <span style="color:${TIER_COLOR[tier]}">${TIER_LABEL[tier]}</span><br/>
          상태: ${report.status}
        </div>
      </div>
      <div style="display:flex;gap:6px;margin-top:8px;">
        <button id="empathyBtn" style="flex:1;padding:6px;border-radius:6px;border:1px solid #e74c3c;background:${mine ? "#e74c3c" : "#fff"};color:${mine ? "#fff" : "#e74c3c"};font-size:11.5px;cursor:pointer;">${mine ? "🤍 공감취소" : "❤️ 공감"} (${empCount})</button>
        <button id="deleteBtn" style="padding:6px 10px;border-radius:6px;border:1px solid #ccc;background:#fff;color:#777;font-size:11.5px;cursor:pointer;">삭제</button>
      </div>
      ${Store.isHost && report.status !== "처리완료" ? '<button id="doneBtn" style="margin-top:6px;width:100%;padding:6px;border-radius:6px;border:1px solid #2ecc71;background:#eafaf1;color:#1f8a52;font-size:11.5px;cursor:pointer;">처리완료로 표시(호스트)</button>' : ""}
    `;
    this.infowindow.setContent(content);
    this.infowindow.open(this.kakaoMap, marker);

    content.querySelector("#popupClose").addEventListener("click", () => this.closePopup());

    content.querySelector("#empathyBtn").addEventListener("click", () => {
      Store.toggleEmpathy(caseId);
      this.openPopup(marker, report);
      this.render();
    });

    content.querySelector("#deleteBtn").addEventListener("click", () => {
      if (!confirm("이 촬영본(제보)을 삭제할까요?")) return;
      Store.deleteReport(report.id);
      this.closePopup();
      this.render();
    });

    const doneBtn = content.querySelector("#doneBtn");
    if (doneBtn) {
      doneBtn.addEventListener("click", () => {
        report.status = "처리완료";
        Store.saveReports();
        this.openPopup(marker, report);
        this.render();
      });
    }
  }
};
