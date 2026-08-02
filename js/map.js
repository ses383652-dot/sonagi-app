const MIN_ZOOM_LEVEL_FOR_HISTORY = 6; // kakao level: 작을수록 확대. 이보다 축소되면 개별 마커 대신 안내문구
const MAX_HISTORY_MARKERS_PER_RENDER = 4000;

const RiskMap = {
  kakaoMap: null,
  clusterer: null,
  infowindow: null,
  kakaoReady: false,
  mapBuilt: false,
  historyData: [], // [lat, lng, status(1=완료,0=미처리)]
  historyLoaded: false,
  historyMarkers: [],
  reportMarkers: [],
  renderToken: 0,
  filters: {
    recentOnly: false,
    group: "전체",
    tiers: { high: true, mid: true, low: true, done: true },
    alerts: false,
    historyDone: true,
    historyPending: true
  },

  init() {
    this.buildFilterBar();
    this.loadKakaoScript();
    this.prefetchHistory();
    window.addEventListener("resize", () => {
      if (App.current === "map") this.onShow();
    });
  },

  onShow() {
    this.tryBuildMap();
    if (this.kakaoMap) {
      this.kakaoMap.relayout();
      this.renderHistoryInBounds();
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

    const doneChip = this.makeChip("구조활동 완료", () => {
      this.filters.historyDone = !this.filters.historyDone;
      doneChip.classList.toggle("on", this.filters.historyDone);
      this.renderHistoryInBounds();
    });
    doneChip.classList.add("on");
    bar.appendChild(doneChip);

    const pendingChip = this.makeChip("신고만(미처리)", () => {
      this.filters.historyPending = !this.filters.historyPending;
      pendingChip.classList.toggle("on", this.filters.historyPending);
      this.renderHistoryInBounds();
    });
    pendingChip.classList.add("on");
    bar.appendChild(pendingChip);
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

  prefetchHistory() {
    fetch("./data/busan_reports.json")
      .then((r) => r.json())
      .then((data) => {
        this.historyData = data;
        this.historyLoaded = true;
        if (this.kakaoMap) this.renderHistoryInBounds();
        this.updateStatus();
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

    kakao.maps.event.addListener(this.kakaoMap, "idle", () => this.renderHistoryInBounds());

    this.render();
    if (this.historyLoaded) this.renderHistoryInBounds();
    this.updateStatus();
  },

  renderHistoryInBounds() {
    if (!this.kakaoMap || !this.historyLoaded) return;

    const token = ++this.renderToken;
    this.clusterer.clear();
    this.historyMarkers.forEach((m) => m.setMap(null));
    this.historyMarkers = [];

    const level = this.kakaoMap.getLevel();
    if (level > MIN_ZOOM_LEVEL_FOR_HISTORY) {
      this.tooZoomedOut = true;
      this.updateStatus();
      this.hideSpinner();
      return;
    }
    this.tooZoomedOut = false;

    const bounds = this.kakaoMap.getBounds();
    const visibleAll = this.historyData.filter((p) => {
      const status = p[2];
      if (status === 1 && !this.filters.historyDone) return false;
      if (status === 0 && !this.filters.historyPending) return false;
      return bounds.contain(new kakao.maps.LatLng(p[0], p[1]));
    });
    this.truncated = visibleAll.length > MAX_HISTORY_MARKERS_PER_RENDER;
    const visible = visibleAll.slice(0, MAX_HISTORY_MARKERS_PER_RENDER);

    const chunkSize = 300;
    let i = 0;

    const step = () => {
      if (token !== this.renderToken) return;
      const slice = visible.slice(i, i + chunkSize);
      const markers = slice.map((p) => this.buildHistoryMarker(p));
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

  buildHistoryMarker(p) {
    const isDone = p[2] === 1;
    const image = isDone ? this.starImage() : this.dotImage("#8a97a8", 8);
    const marker = new kakao.maps.Marker({
      position: new kakao.maps.LatLng(p[0], p[1]),
      image
    });
    kakao.maps.event.addListener(marker, "click", () => {
      const content = `<div style="padding:6px 10px;font-size:11.5px;">${isDone ? "구조활동 완료(매칭됨)" : "신고 접수만 있음(미처리)"}</div>`;
      this.infowindow.setContent(content);
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
    if (!this.historyLoaded) {
      el.textContent = "데이터 불러오는 중...";
      return;
    }
    if (this.tooZoomedOut) {
      el.textContent = `부산 전체 신고 ${this.historyData.length.toLocaleString()}건 (완료 ${this.historyData.filter(p=>p[2]===1).length.toLocaleString()} / 미처리 ${this.historyData.filter(p=>p[2]===0).length.toLocaleString()}) — 확대하면 지점이 표시됩니다`;
      return;
    }
    let text = `현재 화면 ${this.historyMarkers.length.toLocaleString()}건 표시 중 + 제보 ${Store.reports.length}건`;
    if (this.truncated) text += ` (밀집 지역이라 최대 ${MAX_HISTORY_MARKERS_PER_RENDER.toLocaleString()}건만 표시, 확대해서 더 보세요)`;
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
