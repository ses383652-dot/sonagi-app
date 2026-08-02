const RiskMap = {
  kakaoMap: null,
  clusterer: null,
  infowindow: null,
  kakaoReady: false,
  mapBuilt: false,
  donePoints: [], // [lat, lng]
  doneLoaded: false,
  doneMarkersBuilt: false,
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
        this.buildDoneMarkersOnce();
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
      minLevel: 6,
      calculator: [10, 30, 100, 300, 1000],
      styles: this.clustererStyles()
    });
    this.infowindow = new kakao.maps.InfoWindow({ zIndex: 1 });

    this.render();
    this.buildDoneMarkersOnce();
    this.updateStatus();
  },

  clustererStyles() {
    const base = {
      color: "#fff", fontWeight: "bold", textAlign: "center",
      borderRadius: "50%", border: "2px solid #fff",
      display: "flex", alignItems: "center", justifyContent: "center",
      boxShadow: "0 1px 4px rgba(0,0,0,.3)"
    };
    const sizes = [36, 44, 52, 60, 68];
    return sizes.map((s) => Object.assign({}, base, {
      width: s + "px", height: s + "px", lineHeight: s + "px",
      background: "rgba(31,138,82,0.75)", fontSize: (s > 50 ? 14 : 12) + "px"
    }));
  },

  // 완료 지점은 전체를 한 번만 만들어 클러스터러에 등록 — 이후 확대/축소에 따른
  // 뭉치기/풀기는 카카오 클러스터러가 알아서 처리한다 (뷰포트별 재생성 없음).
  buildDoneMarkersOnce() {
    if (this.doneMarkersBuilt || !this.doneLoaded || !this.clusterer) return;
    this.doneMarkersBuilt = true;

    const chunkSize = 1000;
    let i = 0;
    const step = () => {
      const slice = this.donePoints.slice(i, i + chunkSize);
      const markers = slice.map((p) => this.buildDoneMarker(p));
      this.clusterer.addMarkers(markers);
      i += chunkSize;
      if (i < this.donePoints.length) {
        requestAnimationFrame(step);
      } else {
        this.hideSpinner();
        this.updateStatus();
      }
    };
    requestAnimationFrame(step);
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
    el.textContent = `구조활동 완료 ${this.donePoints.length.toLocaleString()}건 + 제보 ${Store.reports.length}건`;
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
