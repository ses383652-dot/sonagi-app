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

const TRANSITION_DURATION_MS = 360;

const App = {
  current: "main",
  lastTabScreen: "main",
  transitioning: false,
  titles: { main: "메인화면", community: "커뮤니티", report: "＋ 촬영(제보)", map: "지역위험지도" },

  init() {
    Store.load();
    document.getElementById("fireBtn").addEventListener("click", () => {
      alert("근처 소방서 연결 (mock)\n☎ 119");
    });

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
    if (!name || this.transitioning) return;
    if (name === this.current) return;
    this.playTransition(name);
  },

  playTransition(name) {
    const layer = document.getElementById("transitionLayer");
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (reduceMotion || !layer) {
      this.applyScreen(name);
      return;
    }

    this.transitioning = true;
    layer.classList.add("playing");

    setTimeout(() => {
      this.applyScreen(name);
    }, TRANSITION_DURATION_MS * 0.5);

    setTimeout(() => {
      layer.classList.remove("playing");
      this.transitioning = false;
    }, TRANSITION_DURATION_MS);
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
      // 지도 컨테이너가 화면에 완전히 자리잡은 뒤(전환 애니메이션 종료 후)
      // relayout을 호출해야 좌상단만 렌더링되는 문제가 안 생긴다.
      const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (reduceMotion) {
        RiskMap.onShow();
      } else {
        setTimeout(() => RiskMap.onShow(), TRANSITION_DURATION_MS * 0.5 + 20);
      }
    }
  },

  setNavButton(id, conf) {
    const btn = document.getElementById(id);
    btn.dataset.screen = conf.screen;
    btn.querySelector(".navIcon").textContent = conf.icon;
    btn.querySelector(".navLabel").textContent = conf.label;
  }
};

document.addEventListener("DOMContentLoaded", () => App.init());
