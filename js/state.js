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

const CATEGORY_TIER = {
  "옹벽·축대 붕괴위험": "high",
  "노후 전선·전신주 파손(감전위험)": "high",
  "가스 누출 의심": "high",
  "싱크홀·지반침하": "high",
  "간판·현수막 낙하위험": "mid",
  "옥상 적재물 낙하위험": "mid",
  "외벽·구조물 균열": "mid",
  "맨홀 뚜껑 파손·이탈": "mid",
  "가로수 쓰러짐 위험": "low",
  "파손된 계단·난간": "low"
};

const TIER_LABEL = { high: "고긴급", mid: "중간", low: "저긴급" };
const TIER_COLOR = { high: "#e74c3c", mid: "#f39c12", low: "#2ecc71" };

const Store = {
  posts: [],
  reports: [],

  load() {
    try {
      const savedPosts = JSON.parse(localStorage.getItem("sonagi_posts") || "null");
      this.posts = savedPosts || [
        { id: "seed1", name: "해운대주민", time: "2시간 전", body: "OO아파트 앞 골목 가로수가 많이 기울었어요.\n비 오면 더 위험할 것 같은데 다들 아시나요?", likes: 12, comments: 5 },
        { id: "seed2", name: "동래동 이웃", time: "어제", body: "사직동 방범등 하나가 며칠째 꺼져 있네요, 밤에 좀 무섭습니다.", likes: 8, comments: 3 },
        { id: "seed3", name: "기장 산책러", time: "3일 전", body: "주말에 등산로 정비해주셔서 감사합니다! 덕분에 안전하게 다녀왔어요.", likes: 21, comments: 2 }
      ];
    } catch (e) {
      this.posts = [];
    }

    try {
      const savedReports = JSON.parse(localStorage.getItem("sonagi_reports") || "null");
      this.reports = savedReports || [];
    } catch (e) {
      this.reports = [];
    }
  },

  savePosts() {
    localStorage.setItem("sonagi_posts", JSON.stringify(this.posts));
  },

  saveReports() {
    const withoutPhoto = this.reports.map(({ photo, ...rest }) => rest);
    localStorage.setItem("sonagi_reports", JSON.stringify(withoutPhoto));
  },

  addPost(body) {
    this.posts.unshift({
      id: "p" + Date.now(),
      name: "나",
      time: "방금 전",
      body,
      likes: 0,
      comments: 0
    });
    this.savePosts();
  },

  addReport(report) {
    this.reports.unshift(report);
    this.saveReports();
  }
};
