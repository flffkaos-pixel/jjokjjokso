import { db } from "./db.js";
import {
  $, $$, STATUS, KIND_LABEL, esc, fmtDate, fmtNum, badge, toast, setupPage,
} from "./app.js";

setupPage();

let current = null;

/* ---------- 인증 ---------- */
async function init() {
  const { data } = await db.auth.getSession();
  if (data.session) return enter(data.session);
  showLogin();
}

function showLogin() {
  $("#login-view").classList.remove("hidden");
  $("#dash-view").classList.add("hidden");
}

function enter(session) {
  $("#login-view").classList.add("hidden");
  $("#dash-view").classList.remove("hidden");
  $("#me-email").textContent = session.user.email || "";
  loadQueue();
  loadRebuttalQueue();
}

$("#login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const err = $("#login-error");
  err.style.display = "none";
  const { data, error } = await db.auth.signInWithPassword({
    email: $("#email").value.trim(),
    password: $("#password").value,
  });
  if (error) {
    err.textContent = "로그인 실패: " + error.message;
    err.style.display = "block";
    return;
  }
  toast("로그인되었습니다.");
  enter(data.session);
});

$("#btn-logout").addEventListener("click", async () => {
  await db.auth.signOut();
  showLogin();
});

db.auth.onAuthStateChange((_event, session) => {
  if (session) { if ($("#dash-view").classList.contains("hidden")) enter(session); }
  else showLogin();
});

/* ---------- 큐 ---------- */
let queueMode = "review";

$$("#queue-tabs .tab").forEach((t) =>
  t.addEventListener("click", () => {
    $$("#queue-tabs .tab").forEach((b) => b.classList.remove("is-active"));
    t.classList.add("is-active");
    queueMode = t.dataset.q;
    loadQueue();
  }));

async function loadQueue() {
  const box = $("#queue");
  box.innerHTML = '<div class="skeleton" style="height:90px"></div><div class="skeleton" style="height:90px"></div>';
  try {
    let query = db.from("posts").select("*").order("created_at", { ascending: false }).limit(40);

    if (queueMode === "review") query = db.from("posts").select("*").in("status", ["pending", "reviewing"]).order("created_at", { ascending: false }).limit(40);
    if (queueMode === "disputed") query = db.from("posts").select("*").in("status", ["disputed", "verified", "partial"]).order("updated_at", { ascending: false }).limit(40);

    const { data, error } = await query;
    if (error) throw error;

    if (!data.length) {
      box.innerHTML = `<div class="empty" style="padding:28px"><strong>검토 대상이 없습니다</strong></div>`;
      return;
    }
    box.innerHTML = data.map((p) => `
      <button class="queue-item" data-id="${p.id}">
        <div class="queue-title">${esc(p.title)}</div>
        <div class="queue-sub">${badge(p.status)} &nbsp; ${esc(p.subject)} · ${fmtDate(p.created_at)}</div>
      </button>`).join("");
    box.querySelectorAll(".queue-item").forEach((b) =>
      b.addEventListener("click", () => {
        box.querySelectorAll(".queue-item").forEach((x) => x.classList.remove("is-active"));
        b.classList.add("is-active");
        openDetail(b.dataset.id);
      }));
  } catch (e) {
    console.error(e);
    box.innerHTML = `<div class="empty"><strong>목록을 불러오지 못했습니다</strong>${esc(e.message || "")}</div>`;
  }
}

/* ---------- 상세 ---------- */
async function openDetail(id) {
  const box = $("#admin-detail");
  box.innerHTML = '<div class="skeleton" style="height:320px"></div>';

  const { data: post, error } = await db.from("posts").select("*").eq("id", id).single();
  if (error || !post) { box.innerHTML = '<div class="empty"><strong>불러오기 실패</strong></div>'; return; }
  current = post;

  const { data: ev } = await db.from("evidence").select("*").eq("post_id", id).order("created_at");
  const { data: cm } = await db.from("comments").select("*").eq("post_id", id).order("created_at", { ascending: false });
  const { data: rb } = await db.from("rebuttals").select("*").eq("post_id", id).order("created_at", { ascending: false });

  box.innerHTML = `
    <div class="card card-pad">
      <div class="post-card-top">${badge(post.status)}<span class="chip">${esc(post.category)}</span>
        <span class="chip chip-kind">${KIND_LABEL[post.kind] || ""}</span></div>
      <h2 style="font-family:var(--font-sans); font-size:22px">${esc(post.title)}</h2>
      <div class="post-subject">대상 · ${esc(post.subject)}</div>
      <div class="post-meta" style="margin-bottom:16px">
        <span>접수 ${fmtDate(post.created_at, true)}</span>
        <span>조회 ${fmtNum(post.view_count)}</span>
        <span>공감 ${fmtNum(post.helpful_count)}</span>
        <span>${post.is_anonymous ? "익명" : esc(post.author_name || "익명")}</span>
        <span><a href="post.html?id=${post.id}&t=${post.access_token}" target="_blank" rel="noopener">공개 화면 ↗</a></span>
      </div>

      <div class="body-text" style="font-size:15.5px; background:var(--line-soft); padding:18px; border-radius:10px">${esc(post.body)}</div>

      <h3 style="font-family:var(--font-sans); font-size:15px; margin:20px 0 10px">증거 (${(ev || []).length})</h3>
      <div style="display:grid; gap:8px">
        ${(ev || []).map((e) => `
          <div class="file-item">
            <div class="file-meta">
              <div class="file-name">${esc(e.caption || e.kind)}</div>
              <a class="file-size" href="${esc(e.url)}" target="_blank" rel="noopener" style="word-break:break-all">${esc(e.url)}</a>
            </div>
            <span class="chip">${esc(e.kind)}</span>
          </div>`).join("") || '<p class="muted small">증거 없음</p>'}
      </div>

      ${rb && rb.length ? `
        <h3 style="font-family:var(--font-sans); font-size:15px; margin:20px 0 10px">반론 (${rb.length})</h3>
        ${rb.map((r) => `
          <div class="file-item" style="align-items:flex-start">
            <div class="file-meta">
              <div class="file-name">${esc(r.author_name)} <span class="muted small">· ${r.status}</span></div>
              <div class="file-size" style="white-space:normal">${esc(r.body)}</div>
            </div>
          </div>`).join("")}` : ""}

      <h3 style="font-family:var(--font-sans); font-size:15px; margin:20px 0 10px">댓글 (${(cm || []).length})</h3>
      <div style="display:grid; gap:6px; margin-bottom:18px">
        ${(cm || []).map((c) => `
          <div class="file-item">
            <div class="file-meta">
              <div class="file-name">${esc(c.author_name || "익명")} <span class="muted small">${fmtDate(c.created_at, true)}</span></div>
              <div class="file-size" style="white-space:normal">${esc(c.body)}</div>
            </div>
            <button class="file-remove" data-del-comment="${c.id}">삭제</button>
          </div>`).join("") || '<p class="muted small">댓글 없음</p>'}
      </div>

      <div class="field">
        <label class="field-label" for="mod-note">처리 메모 (공개 이력에 기록됩니다)</label>
        <input class="input" id="mod-note" placeholder="예) 영수증 원본과 대화 내역 일치 확인" />
      </div>

      <div class="admin-actions">
        <button class="btn btn-secondary btn-sm" data-set="reviewing">검증 시작</button>
        <button class="btn btn-primary btn-sm" data-set="verified">검증 완료</button>
        <button class="btn btn-secondary btn-sm" data-set="partial">부분 검증</button>
        <button class="btn btn-secondary btn-sm" data-set="disputed">반론 등록 처리</button>
        <button class="btn btn-danger btn-sm" data-set="rejected">반려</button>
      </div>
      <p class="small muted" style="margin-top:10px">상태 변경은 즉시 공개 범위에 반영됩니다 (반려 제외 공개).</p>
    </div>`;

  box.querySelectorAll("[data-set]").forEach((b) =>
    b.addEventListener("click", () => setStatus(post.id, b.dataset.set)));
  box.querySelectorAll("[data-del-comment]").forEach((b) =>
    b.addEventListener("click", async () => {
      const { error: e } = await db.from("comments").delete().eq("id", b.dataset.delComment);
      if (e) return toast("삭제 실패");
      toast("댓글이 삭제되었습니다.");
      openDetail(post.id);
    }));
}

async function setStatus(id, status) {
  const note = $("#mod-note")?.value.trim() || null;
  const { error } = await db.from("posts").update({ status, mod_note: note }).eq("id", id);
  if (error) { toast("변경 실패: " + error.message); return; }
  toast(`상태가 '${STATUS[status].label}'(으)로 변경되었습니다.`);
  loadQueue();
  openDetail(id);
}

/* ---------- 반론 승인 ---------- */
async function loadRebuttalQueue() {
  const box = $("#rebuttal-queue");
  const { data, error } = await db.from("rebuttals")
    .select("*, post:posts(title, id, access_token)")
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(10);
  if (error) { box.innerHTML = '<p class="muted small">불러오기 실패</p>'; return; }
  if (!data.length) { box.innerHTML = '<p class="muted small">대기 중인 반론이 없습니다.</p>'; return; }

  box.innerHTML = data.map((r) => `
    <div class="file-item" style="flex-direction:column; align-items:stretch; gap:10px; margin-top:10px">
      <div class="file-name">${esc(r.author_name)}</div>
      <div class="file-size" style="white-space:normal">${esc(r.body)}</div>
      <div class="small muted">${r.post ? esc(r.post.title) : "—"}</div>
      <div style="display:flex; gap:8px">
        <button class="btn btn-primary btn-sm" data-approve="${r.id}" data-post="${r.post_id}">승인 → 반론 등록</button>
        <button class="btn btn-danger btn-sm" data-reject="${r.id}">반려</button>
      </div>
    </div>`).join("");

  box.querySelectorAll("[data-approve]").forEach((b) =>
    b.addEventListener("click", async () => {
      const { error: e1 } = await db.from("rebuttals").update({ status: "approved" }).eq("id", b.dataset.approve);
      if (e1) return toast("승인 실패");
      await db.from("posts").update({ status: "disputed", mod_note: "대상 측 공식 반론이 승인되었습니다." }).eq("id", b.dataset.post);
      toast("반론이 승인되어 공개되었습니다.");
      loadRebuttalQueue();
      loadQueue();
    }));

  box.querySelectorAll("[data-reject]").forEach((b) =>
    b.addEventListener("click", async () => {
      const { error: e } = await db.from("rebuttals").update({ status: "rejected" }).eq("id", b.dataset.reject);
      if (e) return toast("처리 실패");
      toast("반론이 반려되었습니다.");
      loadRebuttalQueue();
    }));
}

init();
