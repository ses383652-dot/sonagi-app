const Community = {
  sortMode: "latest",
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
    this.render();
  },

  render() {
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
