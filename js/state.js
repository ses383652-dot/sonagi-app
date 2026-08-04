const CATEGORY_GROUPS = [
  {
    name: "낙하·추락형",
    items: ["간판·현수막 낙하위험", "옥상 적재물 낙하위험", "가로수 쓰러짐 위험"]
  },
  {
    name: "지반·구조형",
    items: ["싱크홀·지반침하", "옹벽·축대 붕괴위험", "외벽·구조물 균열", "맨홀 뚜껑 파손·이탈"]
  },
  {
    name: "전기·화재유발형",
    items: ["노후 전선·전신주 파손(감전위험)", "가스 누출 의심"]
  },
  {
    name: "보행 안전형",
    items: ["파손된 계단·난간"]
  }
];

const TIER_LABEL = { high: "고긴급", mid: "중간", low: "저긴급" };
const TIER_COLOR = { high: "#e74c3c", mid: "#f39c12", low: "#2ecc71" }; // 제보 결과화면·팝업 표시 전용

// 공감 수 기준 3단계 — 긴급도와 지도 범례/마커 색상 모두 이 하나의 기준을 쓴다.
// 카테고리는 더 이상 긴급도에 관여하지 않고, 공감 수가 임계값(5, 10)을
// 넘을 때마다 긴급도가 한 단계씩 올라간다.
const EMPATHY_BUCKET_COLOR = { low: "#8a97a8", mid: "#f39c12", high: "#e74c3c" };
const EMPATHY_BUCKET_LABEL = { low: "5개 이하", mid: "5~10개", high: "10개 이상" };

function empathyBucket(count) {
  if (count >= 10) return "high";
  if (count >= 5) return "mid";
  return "low";
}

// 사진 전용 저장소 — localStorage는 용량이 작아(보통 5~10MB) 사진을 담기 부적합해서
// 제외해왔는데, 그러면 새로고침/재방문 시 사진이 사라진다. 브라우저의 IndexedDB는
// 용량 제한이 훨씬 커서(보통 수백MB~) 사진을 여기 따로 저장해 재방문해도 남게 한다.
const PhotoStore = {
  dbPromise: null,

  open() {
    if (this.dbPromise) return this.dbPromise;
    this.dbPromise = new Promise((resolve, reject) => {
      if (!window.indexedDB) {
        reject(new Error("indexedDB unsupported"));
        return;
      }
      const req = indexedDB.open("sonagi_photos_db", 1);
      req.onupgradeneeded = () => {
        req.result.createObjectStore("photos");
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return this.dbPromise;
  },

  async save(id, dataUrl) {
    try {
      const db = await this.open();
      return new Promise((resolve, reject) => {
        const tx = db.transaction("photos", "readwrite");
        tx.objectStore("photos").put(dataUrl, id);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch (e) {
      console.warn("사진 저장 실패:", e);
    }
  },

  async get(id) {
    try {
      const db = await this.open();
      return new Promise((resolve, reject) => {
        const tx = db.transaction("photos", "readonly");
        const req = tx.objectStore("photos").get(id);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => reject(req.error);
      });
    } catch (e) {
      return null;
    }
  },

  async delete(id) {
    try {
      const db = await this.open();
      return new Promise((resolve, reject) => {
        const tx = db.transaction("photos", "readwrite");
        tx.objectStore("photos").delete(id);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch (e) {
      // ignore
    }
  }
};

const Store = {
  posts: [],
  reports: [],
  empathy: {},        // caseId -> count
  myEmpathized: [],   // 이 브라우저(계정)가 이미 공감한 caseId 목록
  isHost: false,

  load() {
    try {
      this.posts = JSON.parse(localStorage.getItem("sonagi_posts") || "null") || [];
    } catch (e) {
      this.posts = [];
    }

    try {
      const savedReports = JSON.parse(localStorage.getItem("sonagi_reports") || "null");
      this.reports = savedReports || [];
    } catch (e) {
      this.reports = [];
    }

    // 이전 버전(공감 시스템 도입 전) 데이터 호환 — caseId가 없으면 자기 id로 채워준다.
    this.posts.forEach((p) => { if (!p.caseId) p.caseId = p.id; });
    this.reports.forEach((r) => { if (!r.caseId) r.caseId = r.id; });

    try {
      this.empathy = JSON.parse(localStorage.getItem("sonagi_empathy") || "null") || {};
    } catch (e) {
      this.empathy = {};
    }

    try {
      this.myEmpathized = JSON.parse(localStorage.getItem("sonagi_my_empathy") || "null") || [];
    } catch (e) {
      this.myEmpathized = [];
    }

    this.isHost = localStorage.getItem("sonagi_host") === "1";

    this.hydratePhotos();
  },

  // 새로고침/재방문 직후에는 reports에 photo가 없으므로(용량 문제로 localStorage에
  // 안 담아둠) IndexedDB에서 비동기로 불러와 채워 넣는다. 지도 팝업을 열 때도
  // 한 번 더 확인하므로(openPopup) 이 시점에 실패해도 나중에 다시 시도된다.
  hydratePhotos() {
    this.reports.forEach((r) => {
      if (r.photo) return;
      PhotoStore.get(r.id).then((url) => {
        if (url) r.photo = url;
      });
    });
  },

  savePosts() {
    localStorage.setItem("sonagi_posts", JSON.stringify(this.posts));
  },

  saveReports() {
    const withoutPhoto = this.reports.map(({ photo, ...rest }) => rest);
    localStorage.setItem("sonagi_reports", JSON.stringify(withoutPhoto));
  },

  saveEmpathy() {
    localStorage.setItem("sonagi_empathy", JSON.stringify(this.empathy));
    localStorage.setItem("sonagi_my_empathy", JSON.stringify(this.myEmpathized));
  },

  getEmpathyCount(caseId) {
    return this.empathy[caseId] || 0;
  },

  hasEmpathized(caseId) {
    return this.myEmpathized.includes(caseId);
  },

  // 한 계정당 같은 사안(caseId) 1회만 — 이미 눌렀으면 취소(토글), 아니면 추가.
  // 커뮤니티 글과 그 글에 태그된 지도 말풍선은 같은 caseId를 공유하므로
  // 어느 쪽에서 누르든 공감 수가 합산되어 반영된다.
  toggleEmpathy(caseId) {
    const already = this.hasEmpathized(caseId);
    const current = this.getEmpathyCount(caseId);
    if (already) {
      this.myEmpathized = this.myEmpathized.filter((id) => id !== caseId);
      this.empathy[caseId] = Math.max(0, current - 1);
    } else {
      this.myEmpathized.push(caseId);
      this.empathy[caseId] = current + 1;
    }
    this.saveEmpathy();
    this.syncReportStatusByEmpathy(caseId);
    return !already;
  },

  // 공감 수가 고긴급 구간(10개 이상)을 넘나들 때 제보 상태를 맞춰준다.
  // 호스트가 이미 "처리완료"로 표시한 건은 공감 변동으로 되돌리지 않는다.
  syncReportStatusByEmpathy(caseId) {
    const report = this.reports.find((r) => r.caseId === caseId);
    if (!report || report.status === "처리완료") return;
    const bucket = empathyBucket(this.getEmpathyCount(caseId));
    const newStatus = bucket === "high" ? "긴급 알림 전송됨" : "접수됨";
    if (report.status !== newStatus) {
      report.status = newStatus;
      this.saveReports();
    }
  },

  toggleHost() {
    this.isHost = !this.isHost;
    localStorage.setItem("sonagi_host", this.isHost ? "1" : "0");
    return this.isHost;
  },

  addPost(body, taggedReportId) {
    const id = "p" + Date.now();
    this.posts.unshift({
      id,
      name: "익명",
      time: new Date().toISOString(),
      body,
      caseId: taggedReportId || id,
      taggedReportId: taggedReportId || null,
      comments: 0
    });
    this.savePosts();
  },

  deletePost(id) {
    this.posts = this.posts.filter((p) => p.id !== id);
    this.savePosts();
  },

  addReport(report) {
    report.caseId = report.id;
    this.reports.unshift(report);
    this.saveReports();
    if (report.photo) PhotoStore.save(report.id, report.photo);
  },

  deleteReport(id) {
    this.reports = this.reports.filter((r) => r.id !== id);
    this.saveReports();
    PhotoStore.delete(id);
  },

  getReportById(id) {
    return this.reports.find((r) => r.id === id);
  }
};
