const REPORT_STATUS_COLOR = {
  "접수됨": { bg: "#eef0f2", fg: "#666" },
  "긴급 알림 전송됨": { bg: "#fdeceb", fg: "#e74c3c" },
  "처리완료": { bg: "#eafaf1", fg: "#1f8a52" }
};

const Community = {
  sortMode: "latest",
  viewMode: "community", // "community" | "mine"
  pendingTag: null,
  draftText: "",

  init() {
    document.getElementById("writeFab").addEventListener("click", () => this.openModal(false));
    document.getElementById("writeCancel").addEventListener("click", () => this.closeModal());
    document.getElementById("writeSubmit").addEventListener("click", () => this.submit());
    document.getElementById("sortSelect").addEventListener("change", (e) => {
      this.sortMode = e.target.value;
      this.render();
    });
    document.getElementById("tagLocationBtn").addEventListener("click", () => this.beginTagPick());
    document.getElementById("tagPickCancel").addEventListener("click", () => this.cancelTagPick());

    document.getElementById("tabCommunity").addEventListener("click", () => this.setViewMode("community"));
    document.getElementById("tabMine").addEventListener("click", () => this.setViewMode("mine"));

    this.render();
  },

  setViewMode(mode) {
    if (this.viewMode === mode) return;
    this.viewMode = mode;
    document.getElementById("tabCommunity").classList.toggle("active", mode === "community");
    document.getElementById("tabMine").classList.toggle("active", mode === "mine");
    document.getElementById("writeFab").style.display = mode === "community" ? "block" : "none";
    this.render();
  },

  render() {
    if (this.viewMode === "mine") {
      this.renderMyReports();
    } else {
      this.renderCommunity();
    }
  },

  renderCommunity() {
    const feed = document.getElementById("communityFeed");
    feed.innerHTML = '<p class="disclaimer">※ 이 화면 글은 지도에 표시되지 않음(위치 태그 시 해당 지도 말풍선과 공감이 합산됨) · 자유 서술 가능(제보와 별개 채널)</p>';

    const sorted = Store.posts.slice();
    if (this.sortMode === "empathy") {
      sorted.sort((a, b) => Store.getEmpathyCount(b.caseId) - Store.getEmpathyCount(a.caseId));
    } else {
      sorted.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());
    }

    sorted.forEach((post) => {
      const empCount = Store.getEmpathyCount(post.caseId);
      const mine = Store.hasEmpathized(post.caseId);
      const taggedReport = post.taggedReportId ? Store.getReportById(post.taggedReportId) : null;

      const el = document.createElement("div");
      el.className = "post";
      el.innerHTML = `
        <div class="meta">
          <div class="avatar"></div>
          <div>
            <div class="name">${escapeHtml(post.name)}</div>
            <div class="time">${formatRelativeTime(post.time)}</div>
          </div>
        </div>
        <div class="body">${escapeHtml(post.body)}</div>
        ${taggedReport ? `<div class="tagBadge">📍 ${escapeHtml(taggedReport.category)} 근처에 태그됨</div>` : ""}
        <div class="stats">
          <button class="empathyBtn${mine ? " mine" : ""}" data-id="${post.id}">${mine ? "❤️" : "🤍"} 공감 ${empCount}</button>
          <span>💬 ${post.comments}</span>
          <button class="deleteBtn" data-id="${post.id}">삭제</button>
        </div>
      `;
      feed.appendChild(el);
    });

    feed.querySelectorAll(".empathyBtn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const post = Store.posts.find((p) => p.id === btn.dataset.id);
        if (!post) return;
        Store.toggleEmpathy(post.caseId);
        this.render();
        RiskMap.render();
      });
    });
    feed.querySelectorAll(".deleteBtn").forEach((btn) => {
      btn.addEventListener("click", () => {
        if (!confirm("이 글을 삭제할까요?")) return;
        Store.deletePost(btn.dataset.id);
        this.render();
      });
    });
  },

  // "내 제보" — 처리 상태를 한눈에 추적하는 목록 (지금은 단일 사용자 구조라
  // Store.reports 전체가 곧 "내가 올린 것"과 같다)
  renderMyReports() {
    const feed = document.getElementById("communityFeed");
    feed.innerHTML = "";

    const sorted = Store.reports.slice();
    if (this.sortMode === "empathy") {
      sorted.sort((a, b) => Store.getEmpathyCount(b.caseId) - Store.getEmpathyCount(a.caseId));
    } else {
      sorted.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());
    }

    if (sorted.length === 0) {
      feed.innerHTML = '<div class="emptyMine">아직 올린 제보가 없어요.<br/>＋ 버튼으로 첫 제보를 올려보세요.</div>';
      return;
    }

    sorted.forEach((report) => {
      const empCount = Store.getEmpathyCount(report.caseId);
      const statusStyle = REPORT_STATUS_COLOR[report.status] || REPORT_STATUS_COLOR["접수됨"];

      const el = document.createElement("div");
      el.className = "reportCard";
      el.innerHTML = `
        <img class="thumb" id="thumb-${report.id}" />
        <div class="info">
          <div class="category">${escapeHtml(report.category)}</div>
          <div class="meta2">${formatRelativeTime(report.time)}</div>
          <span class="statusBadge" style="background:${statusStyle.bg};color:${statusStyle.fg};">${escapeHtml(report.status)}</span>
          <span style="font-size:11px;color:var(--sub);">❤️ 공감 ${empCount}</span>
          <div class="rowActions">
            <button class="viewMap" data-id="${report.id}">지도에서 보기</button>
            <button class="deleteReportBtn" data-id="${report.id}">삭제</button>
          </div>
        </div>
      `;
      feed.appendChild(el);

      if (report.photo) {
        document.getElementById(`thumb-${report.id}`).src = report.photo;
      } else {
        PhotoStore.get(report.id).then((url) => {
          if (url) document.getElementById(`thumb-${report.id}`).src = url;
        });
      }
    });

    feed.querySelectorAll(".viewMap").forEach((btn) => {
      btn.addEventListener("click", () => RiskMap.viewReport(btn.dataset.id));
    });
    feed.querySelectorAll(".deleteReportBtn").forEach((btn) => {
      btn.addEventListener("click", () => {
        if (!confirm("이 제보를 삭제할까요?")) return;
        Store.deleteReport(btn.dataset.id);
        this.render();
        RiskMap.render();
      });
    });
  },

  openModal(preserveDraft) {
    document.getElementById("writeOverlay").classList.add("active");
    if (!preserveDraft) {
      document.getElementById("writeText").value = "";
      this.pendingTag = null;
    } else {
      document.getElementById("writeText").value = this.draftText || "";
    }
    document.getElementById("writeText").focus();
    this.renderTagUI();
  },

  closeModal() {
    document.getElementById("writeOverlay").classList.remove("active");
    this.pendingTag = null;
  },

  renderTagUI() {
    const btn = document.getElementById("tagLocationBtn");
    const info = document.getElementById("tagLocationInfo");
    if (this.pendingTag) {
      btn.style.display = "none";
      info.style.display = "flex";
      info.innerHTML = `📍 태그됨: ${escapeHtml(this.pendingTag.category)} 근처 <button id="tagRemoveBtn">제거</button>`;
      info.querySelector("#tagRemoveBtn").addEventListener("click", () => {
        this.pendingTag = null;
        this.renderTagUI();
      });
    } else {
      btn.style.display = "block";
      info.style.display = "none";
    }
  },

  beginTagPick() {
    this.draftText = document.getElementById("writeText").value;
    document.getElementById("writeOverlay").classList.remove("active");
    document.getElementById("tagPickBanner").style.display = "flex";
    App.showScreen("map");
    RiskMap.startTagPick((report) => {
      this.pendingTag = report;
      document.getElementById("tagPickBanner").style.display = "none";
      App.showScreen("community");
      setTimeout(() => this.openModal(true), 420);
    });
  },

  cancelTagPick() {
    RiskMap.cancelTagPick();
    document.getElementById("tagPickBanner").style.display = "none";
    App.showScreen("community");
    setTimeout(() => this.openModal(true), 420);
  },

  submit() {
    const text = document.getElementById("writeText").value.trim();
    if (!text) return;
    Store.addPost(text, this.pendingTag ? this.pendingTag.id : null);
    this.pendingTag = null;
    this.render();
    this.closeModal();
  }
};

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function formatRelativeTime(iso) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return "방금 전";
  if (min < 60) return min + "분 전";
  const hr = Math.floor(min / 60);
  if (hr < 24) return hr + "시간 전";
  const day = Math.floor(hr / 24);
  return day + "일 전";
}
