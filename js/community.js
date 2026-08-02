const Community = {
  init() {
    document.getElementById("writeFab").addEventListener("click", () => this.openModal());
    document.getElementById("writeCancel").addEventListener("click", () => this.closeModal());
    document.getElementById("writeSubmit").addEventListener("click", () => this.submit());
    this.render();
  },

  render() {
    const feed = document.getElementById("communityFeed");
    feed.innerHTML = '<p class="disclaimer">※ 이 화면 글은 지도에 표시되지 않음 · 자유 서술 가능(제보와 별개 채널)</p>';
    Store.posts.forEach((post) => {
      const el = document.createElement("div");
      el.className = "post";
      el.innerHTML = `
        <div class="meta">
          <div class="avatar"></div>
          <div>
            <div class="name">${escapeHtml(post.name)}</div>
            <div class="time">${escapeHtml(post.time)}</div>
          </div>
        </div>
        <div class="body">${escapeHtml(post.body)}</div>
        <div class="stats">♡ ${post.likes}   💬 ${post.comments}</div>
      `;
      feed.appendChild(el);
    });
  },

  openModal() {
    document.getElementById("writeOverlay").classList.add("active");
    document.getElementById("writeText").value = "";
    document.getElementById("writeText").focus();
  },

  closeModal() {
    document.getElementById("writeOverlay").classList.remove("active");
  },

  submit() {
    const text = document.getElementById("writeText").value.trim();
    if (!text) return;
    Store.addPost(text);
    this.render();
    this.closeModal();
  }
};

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}
