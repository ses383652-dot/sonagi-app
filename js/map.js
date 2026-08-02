const Map = {
  kakaoMap: null,
  clusterer: null,
  historyMarkers: [],
  reportMarkers: [],
  infowindow: null,
  filters: {
    recentOnly: false,
    group: "전체",
    tiers: { high: true, mid: true, low: true, done: true },
    alerts: false,
    historyVisible: true
  },

  init() {
    this.buildFilterBar();
    this.loadKakao();
  },

  buildFilterBar() {
    const bar = document.getElementById("mapFilterBar");
    const dateChip = this.makeChip("날짜: 최근1주일", () => {
      this.filters.recentOnly = !this.filters.recentOnly;
      dateChip.textContent = this.filters.recentOnly ? "날짜: 최근1주일" : "날짜: 전체";
      dateChip.classList.toggle("on", this.filters.recentOnly);
      this.render();
    });
    dateChip.textContent = "날짜: 전체";
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

    const historyChip = this.makeChip("기존 출동이력", () => {
      this.filters.historyVisible = !this.filters.historyVisible;
      historyChip.classList.toggle("on", this.filters.historyVisible);
      this.historyMarkers.forEach((m) => m.setMap(this.filters.historyVisible ? this.kakaoMap : null));
    });
    historyChip.classList.add("on");
    bar.appendChild(historyChip);
  },

  makeChip(text, onClick) {
    const chip = document.createElement("button");
    chip.className = "chip";
    chip.textContent = text;
    chip.addEventListener("click", onClick);
    return chip;
  },

  loadKakao() {
    const APP_KEY = "e36a91c3b660cbbdbc3545f24389d0d3";
    const script = document.createElement("script");
    script.src = "https://dapi.kakao.com/v2/maps/sdk.js?appkey=" + APP_KEY + "&libraries=clusterer&autoload=false";
    script.onload = () => {
      kakao.maps.load(() => {
        this.kakaoMap = new kakao.maps.Map(document.getElementById("map"), {
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
        this.loadHistory();
        this.render();
      });
    };
    document.head.appendChild(script);
  },

  loadHistory() {
    fetch("./lifesafety_points.json")
      .then((r) => r.json())
      .then((data) => {
        this.historyMarkers = data.map((p) => {
          const marker = new kakao.maps.Marker({
            position: new kakao.maps.LatLng(p.lat, p.lng),
            image: this.dotImage("#b9b4a8", 8)
          });
          kakao.maps.event.addListener(marker, "click", () => {
            const content = `<div style="padding:6px 10px;font-size:11.5px;">기존 출동이력 · ${p.src}${p.type ? " · " + p.type : ""}<br/>${p.date || ""} ${p.sgg || ""}</div>`;
            this.infowindow.setContent(content);
            this.infowindow.open(this.kakaoMap, marker);
          });
          return marker;
        });
        this.clusterer.addMarkers(this.historyMarkers);
        document.getElementById("mapStatus").textContent = "기존 출동이력 " + data.length + "건 + 제보 " + Store.reports.length + "건";
      });
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

    document.getElementById("mapStatus").textContent =
      "기존 출동이력 " + this.historyMarkers.length + "건 + 제보 " + Store.reports.length + "건 표시 중";
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
