const App = {
  current: "community",
  titles: { community: "커뮤니티", report: "＋ 촬영(제보)", map: "지역위험지도" },

  init() {
    Store.load();
    document.getElementById("fireBtn").addEventListener("click", () => {
      alert("근처 소방서 연결 (mock)\n☎ 119");
    });
    document.querySelectorAll(".navItem").forEach((btn) => {
      btn.addEventListener("click", () => this.showScreen(btn.dataset.screen));
    });

    Community.init();
    Report.init();
    Map.init();

    this.showScreen("community");
  },

  showScreen(name) {
    if (name === "report" && this.current === "report") return;
    if (this.current === "report" && name !== "report") Report.resetToCapture();

    this.current = name;
    document.querySelectorAll(".screen").forEach((el) => el.classList.remove("active"));
    document.getElementById("screen-" + name).classList.add("active");
    document.getElementById("headerTitle").textContent = this.titles[name];

    document.querySelectorAll(".navItem").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.screen === name);
    });

    if (name === "map") {
      setTimeout(() => Map.kakaoMap && kakao.maps.event.trigger(Map.kakaoMap, "resize"), 0);
    }
  }
};

document.addEventListener("DOMContentLoaded", () => App.init());
