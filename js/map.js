const MIN_ZOOM_LEVEL_FOR_POINTS = 6; // kakao level: 작을수록 확대. 이보다 축소되면 동별 집계 버블로 전환
const MAX_POINTS_PER_RENDER = 6000;

const RiskMap = {
  kakaoMap: null,
  clusterer: null,
  infowindow: null,
  kakaoReady: false,
  mapBuilt: false,
  donePoints: [], // [lat, lng]
  doneLoaded: false,
  dongCounts: [], // [{gu, dong, lat, lng, count}]
  dongLoaded: false,
  dongOverlays: [],
  historyMarkers: [],
  reportMarkers: [],
  renderToken: 0,
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
      this.renderHistoryLayer();
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
    script.src = "https://dapi.kakao.com/v2/maps/sdk.js?appkey=" + APP_KEY + "&libraries=clusterer&autoload=false";
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
        if (this.kakaoMap) this.renderHistoryLayer();
        this.updateStatus();
      });

    fetch("./data/busan_dong_counts.json")
      .then((r) => r.json())
      .then((data) => {
        this.dongCounts = data;
        this.dongLoaded = true;
        if (this.kakaoMap) this.renderHistoryLayer();
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
    this.clusterer = new kakao.maps.MarkerClusterer({
      map: this.kakaoMap,
      averageCenter: true,
      minLevel: 7,
      disableClickZoom: false
    });
    this.infowindow = new kakao.maps.InfoWindow({ zIndex: 1 });

    kakao.maps.event.addListener(this.kakaoMap, "idle", () => this.renderHistoryLayer());

    this.render();
    this.renderHistoryLayer();
    this.updateStatus();
  },

  clearDongOverlays() {
    this.dongOverlays.forEach((o) => o.setMap(null));
    this.dongOverlays = [];
  },

  renderDongBubbles() {
    this.clusterer.clear();
    this.historyMarkers.forEach((m) => m.setMap(null));
    this.historyMarkers = [];
    this.clearDongOverlays();

    if (!this.dongLoaded) return;
    const counts = this.dongCounts.map((d) => d.count);
    const maxCount = Math.max(...counts, 1);

    this.dongCounts.forEach((d) => {
      const size = Math.round(22 + Math.sqrt(d.count / maxCount) * 34);
      const el = document.createElement("div");
      el.style.cssText = `
        width:${size}px;height:${size}px;border-radius:50%;
        background:rgba(31,138,82,0.6);border:2px solid #ffffff;
        display:flex;align-items:center;justify-content:center;
        color:#fff;font-weight:700;font-size:${size > 34 ? 13 : 11}px;
        box-shadow:0 1px 4px rgba(0,0,0,.25); cursor:pointer;
      `;
      el.textContent = d.count;
      el.title = d.gu + " " + d.dong + " · 완료 " + d.count + "건";
      el.addEventListener("click", () => {
        this.kakaoMap.setLevel(4, { anchor: new kakao.maps.LatLng(d.lat, d.lng) });
        this.kakaoMap.setCenter(new kakao.maps.LatLng(d.lat, d.lng));
      });
      const overlay = new kakao.maps.CustomOverlay({
        position: new kakao.maps.LatLng(d.lat, d.lng),
        content: el,
        yAnchor: 0.5,
        xAnchor: 0.5,
        zIndex: 3
      });
      overlay.setMap(this.kakaoMap);
      this.dongOverlays.push(overlay);
    });

    this.hideSpinner();
    this.updateStatus();
  },

  renderHistoryLayer() {
    if (!this.kakaoMap) return;
    const level = this.kakaoMap.getLevel();

    if (level > MIN_ZOOM_LEVEL_FOR_POINTS) {
      this.zoomedOut = true;
      this.renderDongBubbles();
      return;
    }
    this.zoomedOut = false;
    this.clearDongOverlays();
    this.renderPointsInBounds();
  },

  renderPointsInBounds() {
    if (!this.kakaoMap || !this.doneLoaded) return;

    const token = ++this.renderToken;
    this.clusterer.clear();
    this.historyMarkers.forEach((m) => m.setMap(null));
    this.historyMarkers = [];

    const bounds = this.kakaoMap.getBounds();
    const visibleAll = this.donePoints.filter((p) => bounds.contain(new kakao.maps.LatLng(p[0], p[1])));
    this.truncated = visibleAll.length > MAX_POINTS_PER_RENDER;
    const visible = visibleAll.slice(0, MAX_POINTS_PER_RENDER);

    const chunkSize = 300;
    let i = 0;
    const step = () => {
      if (token !== this.renderToken) return;
      const slice = visible.slice(i, i + chunkSize);
      const markers = slice.map((p) => this.buildDoneMarker(p));
      this.historyMarkers.push(...markers);
      this.clusterer.addMarkers(markers);
      i += chunkSize;
      this.updateStatus();
      if (i < visible.length) {
        requestAnimationFrame(step);
      } else {
        this.hideSpinner();
      }
    };

    if (visible.length === 0) {
      this.hideSpinner();
      this.updateStatus();
    } else {
      requestAnimationFrame(step);
    }
  },

  buildDoneMarker(p) {
    const marker = new kakao.maps.Marker({
      position: new kakao.maps.LatLng(p[0], p[1]),
      image: this.starImage()
    });
    kakao.maps.event.addListener(marker, "click", () => {
      this.infowindow.setContent('<div style="padding:6px 10px;font-size:11.5px;">구조활동 완료(매칭됨)</div>');
      this.infowindow.open(this.kakaoMap, marker);
    });
    return marker;
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
    if (this.zoomedOut) {
      el.textContent = `부산 전체 구조활동 완료 ${this.donePoints.length.toLocaleString()}건 · 동별 집계로 표시 중 (확대하면 개별 지점)`;
      return;
    }
    let text = `현재 화면 완료 ${this.historyMarkers.length.toLocaleString()}건 + 제보 ${Store.reports.length}건`;
    if (this.truncated) text += ` (밀집 지역이라 최대 ${MAX_POINTS_PER_RENDER.toLocaleString()}건만 표시)`;
    el.textContent = text;
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
