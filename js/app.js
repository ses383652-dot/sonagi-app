const NAV_MAP = {
  main: {
    left: { screen: "community", icon: "💬", label: "커뮤니티" },
    right: { screen: "map", icon: "🗺️", label: "지역위험지도" }
  },
  community: {
    left: { screen: "main", icon: "🏠", label: "메인화면" },
    right: { screen: "map", icon: "🗺️", label: "지역위험지도" }
  },
  map: {
    left: { screen: "community", icon: "💬", label: "커뮤니티" },
    right: { screen: "main", icon: "🏠", label: "메인화면" }
  }
};

const App = {
  current: "main",
  lastTabScreen: "main",
  titles: { main: "메인화면", community: "커뮤니티", report: "＋ 촬영(제보)", map: "지역위험지도" },

  init() {
    Store.load();
    document.getElementById("fireBtn").addEventListener("click", () => this.callFireStation());

    document.getElementById("navLeft").addEventListener("click", () => {
      this.showScreen(document.getElementById("navLeft").dataset.screen);
    });
    document.getElementById("navRight").addEventListener("click", () => {
      this.showScreen(document.getElementById("navRight").dataset.screen);
    });
    document.getElementById("navCenter").addEventListener("click", () => {
      this.showScreen("report");
    });

    Community.init();
    Report.init();
    RiskMap.init();

    this.applyScreen("main");
  },

  showScreen(name) {
    if (!name || name === this.current) return;
    this.applyScreen(name);
  },

  applyScreen(name) {
    if (this.current === "report" && name !== "report") Report.resetToCapture();

    this.current = name;
    if (name !== "report") this.lastTabScreen = name;

    document.querySelectorAll(".screen").forEach((el) => el.classList.remove("active"));
    document.getElementById("screen-" + name).classList.add("active");
    document.getElementById("headerTitle").textContent = this.titles[name];

    const navKey = name === "report" ? this.lastTabScreen : name;
    const navConf = NAV_MAP[navKey] || NAV_MAP.main;
    this.setNavButton("navLeft", navConf.left);
    this.setNavButton("navRight", navConf.right);
    document.getElementById("navCenter").classList.toggle("active", name === "report");

    if (name === "map") {
      // 지도 컨테이너가 실제로 화면에 자리잡은(레이아웃이 반영된) 다음 프레임에
      // relayout을 호출해야 좌상단만 렌더링되는 문제가 안 생긴다.
      requestAnimationFrame(() => RiskMap.onShow());
    }
  },

  callFireStation() {
    if (!confirm("전화를 거시겠습니까?")) return;
    if (!confirm("지금 이 통화가, 누군가의 구조 요청을 늦출 수 있습니다.\n신중한 선택 부탁드립니다.")) return;
    window.location.href = "tel:119";
  },

  setNavButton(id, conf) {
    const btn = document.getElementById(id);
    btn.dataset.screen = conf.screen;
    btn.querySelector(".navIcon").textContent = conf.icon;
    btn.querySelector(".navLabel").textContent = conf.label;
  }
};

document.addEventListener("DOMContentLoaded", () => App.init());
