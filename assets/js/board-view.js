import { db, isConfigured } from "./db.js";
import {
  $, $$, esc, toast, setupPage, fmtDate, fmtNum, qs, getVoterKey, emptyBox, initLightbox,
} from "./app.js";

setupPage();

const lightbox = initLightbox();

const CAT_LABEL = { free: "자유", qna: "질문", info: "정보", share: "나눔" };
const POST_FIELDS = "id, title, body, category, author_name, is_anonymous, view_count, like_count, comment_count, created_at, updated_at, images";
const id = qs("b");
let post = null;

/* ---------- 추천 상태(로컬) ---------- */
function likedIds() {
  try { return JSON.parse(localStorage.getItem("bjk_likes") || "[]"); } catch { return []; }
}
function saveLiked(ids) { localStorage.setItem("bjk_likes", JSON.stringify(ids)); }

/* ---------- 상태 표시 ---------- */
function notFound(title, desc) {
  $("#v-title").textContent = "글을 찾을 수 없습니다";
  $("#v-meta").textContent = "";
  $("#v-top").innerHTML = "";
  $("#v-body").innerHTML = emptyBox(title, desc);
  $("#v-images").innerHTML = "";
  $("#v-images").hidden = true;
  $("#v-like").hidden = true;
  $("#v-edit").hidden = true;
  $("#v-del").hidden = true;
  const cf = $("#comment-form");
  if (cf) cf.closest(".card").hidden = true;
}

function renderBody() {
  const body = post.body || "";
  const imgs = post.images || [];
  const used = new Set();
  let html = "";
  const segments = body.split(/(\[[1-9]\])/);
  for (const seg of segments) {
    const m = /^\[([1-9])\]$/.exec(seg);
    if (m) {
      const idx = Number(m[1]) - 1;
      if (imgs[idx]) {
        used.add(idx);
        html += `<img src="${esc(imgs[idx])}" alt="첨부 이미지 ${m[1]}" loading="lazy" style="display:block; width:100%; height:400px; object-fit:contain; background:#F7F3EC; padding:8px; box-sizing:border-box; border:1.5px solid var(--line); border-radius:10px; margin:16px 0; cursor:zoom-in" data-full="${esc(imgs[idx])}" />`;
        continue;
      }
    }
    html += esc(seg);
  }
  $("#v-body").innerHTML = html;
  $("#v-body").querySelectorAll("img[data-full]").forEach((im) => {
    im.addEventListener("click", () => lightbox.open(im.dataset.full, post.title));
  });

  const rest = imgs.map((u, i) => ({ u, i })).filter((x) => !used.has(x.i));
  renderImages(rest);
}

function renderImages(rest) {
  const box = $("#v-images");
  if (!rest.length) { box.innerHTML = ""; box.hidden = true; return; }
  box.hidden = false;
  box.innerHTML = rest.map(({ u, i }) =>
    `<img src="${esc(u)}" alt="첨부 이미지 ${i + 1}" loading="lazy" style="flex:1 1 260px; width:100%; height:230px; object-fit:contain; background:#F7F3EC; padding:6px; box-sizing:border-box; border:1.5px solid var(--line); border-radius:10px; cursor:zoom-in; display:block" data-full="${esc(u)}" />`
  ).join("");
  box.querySelectorAll("img").forEach((im) => {
    im.addEventListener("click", () => lightbox.open(im.dataset.full, post.title));
  });
}

function renderPost() {
  const name = post.is_anonymous || !post.author_name ? "익명" : post.author_name;
  document.title = `${post.title} · 자유게시판 — 좆좆소`;
  $("#v-title").textContent = post.title;
  $("#v-meta").textContent = `${name} · ${fmtDate(post.created_at, true)} · 조회 ${fmtNum(post.view_count)}`;
  $("#v-top").innerHTML = `<span class="chip chip-kind">${CAT_LABEL[post.category] || "자유"}</span>`;
  renderBody();
  renderLike();
}

function renderLike() {
  const liked = likedIds().includes(id);
  const btn = $("#v-like");
  btn.classList.toggle("btn-primary", liked);
  btn.classList.toggle("btn-secondary", !liked);
  btn.innerHTML = `${liked ? "추천 취소" : "추천"} <span id="v-like-count">${fmtNum(post.like_count)}</span>`;
}

function renderComments(items) {
  $("#v-cm-n").textContent = `(${fmtNum(items.length)})`;
  const cc = $("#v-comment-count");
  if (cc) cc.textContent = fmtNum(items.length);
  const wrap = $("#v-comments");
  if (!items.length) {
    wrap.innerHTML = `<p class="small muted" style="padding:14px 0">아직 댓글이 없습니다. 첫 댓글을 남겨 보세요.</p>`;
    return;
  }
  wrap.innerHTML = items.map((c) => {
    const name = c.author_name || "익명";
    return `
    <div class="comment">
      <div class="comment-avatar">${esc(name.slice(0, 1))}</div>
      <div class="comment-body">
        <div><span class="comment-name">${esc(name)}</span><span class="comment-time">${fmtDate(c.created_at, true)}</span></div>
        <p class="comment-text">${esc(c.body)}</p>
      </div>
    </div>`;
  }).join("");
}

/* ---------- 로드 ---------- */
async function loadPost() {
  if (!id) { notFound("주소가 올바르지 않습니다.", "목록에서 글을 선택해 주세요."); return; }
  if (!isConfigured()) { notFound("Supabase 미연결", "config.js 설정이 필요합니다."); return; }
  try {
    const { data, error } = await db.from("board_posts").select(POST_FIELDS).eq("id", id).maybeSingle();
    if (error) throw error;
    if (!data) { notFound("삭제되었거나 잘못된 주소입니다.", "목록에서 다른 글을 확인해 주세요."); return; }
    post = data;
    renderPost();

    const vkey = "bv_" + id;
    if (!sessionStorage.getItem(vkey)) {
      sessionStorage.setItem(vkey, "1");
      db.rpc("board_view", { p_id: id }).then(() => {}).catch(() => {});
    }
    loadComments();
  } catch (err) {
    console.error(err);
    const missing = /does not exist|schema cache/i.test(err.message || "");
    notFound(
      missing ? "게시판 테이블이 아직 없습니다" : "글을 불러오지 못했습니다",
      missing ? "supabase/community.sql 을 SQL Editor 에서 실행해 주세요." : (err.message || "")
    );
  }
}

async function loadComments() {
  try {
    const { data } = await db.from("board_comments")
      .select("id, body, author_name, created_at")
      .eq("post_id", id)
      .order("created_at", { ascending: true });
    renderComments(data || []);
  } catch (err) {
    console.error(err);
    renderComments([]);
  }
}

/* ---------- 추천 ---------- */
$("#v-like").addEventListener("click", async () => {
  if (!post) return;
  if (!isConfigured()) { toast("Supabase 설정(config.js)이 필요합니다."); return; }
  const btn = $("#v-like");
  btn.disabled = true;
  try {
    const { data, error } = await db.rpc("board_like", { p_id: id, p_voter: getVoterKey() });
    if (error) throw error;
    const ids = likedIds();
    if (data) { if (!ids.includes(id)) ids.push(id); }
    else { const i = ids.indexOf(id); if (i >= 0) ids.splice(i, 1); }
    saveLiked(ids);
    post.like_count = Math.max(0, post.like_count + (data ? 1 : -1));
    renderLike();
  } catch (err) {
    console.error(err);
    const missing = /could not find the function/i.test(err.message || "");
    toast(missing
      ? "추천 함수가 없습니다 — supabase/community.sql 을 실행해 주세요."
      : "추천에 실패했습니다: " + (err.message || "알 수 없는 오류"));
  } finally {
    btn.disabled = false;
  }
});

/* ---------- 댓글 ---------- */
$("#comment-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!post) return;
  const body = $("#c-body").value.trim();
  if (body.length < 2) { toast("댓글을 2자 이상 입력해 주세요."); return; }
  if (!isConfigured()) { toast("Supabase 설정(config.js)이 필요합니다."); return; }

  try {
    const name = $("#c-name").value.trim();
    const { error } = await db.from("board_comments").insert({
      post_id: id,
      body,
      author_name: name || null,
    });
    if (error) throw error;
    toast("댓글이 등록되었습니다.");
    $("#c-body").value = "";
    await loadComments();
  } catch (err) {
    console.error(err);
    const missing = /does not exist|schema cache/i.test(err.message || "");
    toast(missing
      ? "게시판 테이블이 없습니다 — supabase/community.sql 을 실행해 주세요."
      : "댓글 등록에 실패했습니다: " + (err.message || "알 수 없는 오류"));
  }
});

/* ---------- 수정/삭제 (비밀번호) ---------- */
async function sha256(s) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
let pendingMode = null;
let pendingHash = null;

function openPwBox(mode) {
  if (!post) return;
  pendingMode = mode;
  $("#pw-title").textContent = mode === "edit" ? "수정 비밀번호 확인" : "삭제 비밀번호 확인";
  $("#pw-input").value = "";
  $("#pw-box").style.display = "grid";
  $("#pw-input").focus();
}
function closePwBox() {
  $("#pw-box").style.display = "none";
  $("#pw-input").value = "";
  pendingMode = null;
}
function openEditBox() {
  $("#e-title").value = post.title;
  $("#e-body").value = post.body;
  $("#edit-box").style.display = "grid";
  $("#v-body").style.display = "none";
  $("#v-images").hidden = true;
  $("#e-title").focus();
}

function pwFailMsg() {
  return "비밀번호가 다르거나 비밀번호가 설정되지 않은 글입니다.";
}

$("#v-edit").addEventListener("click", () => openPwBox("edit"));
$("#v-del").addEventListener("click", () => openPwBox("delete"));
$("#pw-cancel").addEventListener("click", closePwBox);
$("#pw-input").addEventListener("keydown", (e) => {
  if (e.key === "Enter") { e.preventDefault(); $("#pw-ok").click(); }
});

$("#pw-ok").addEventListener("click", async () => {
  if (!post || !pendingMode) return;
  const raw = $("#pw-input").value;
  if (!raw) { toast("비밀번호를 입력해 주세요."); return; }
  if (!isConfigured()) { toast("Supabase 설정(config.js)이 필요합니다."); return; }

  const btn = $("#pw-ok");
  btn.disabled = true;
  btn.textContent = "확인 중…";
  try {
    const h = await sha256(raw);
    if (pendingMode === "delete") {
      if (!confirm("정말 삭제할까요? 되돌릴 수 없습니다.")) return;
      const { data, error } = await db.rpc("board_delete", { p_id: id, p_pass_hash: h });
      if (error) throw error;
      if (!data) { toast(pwFailMsg()); return; }
      toast("삭제되었습니다.");
      location.href = "board.html";
    } else {
      const { data, error } = await db.rpc("board_check", { p_id: id, p_pass_hash: h });
      if (error) throw error;
      if (!data) { toast(pwFailMsg()); return; }
      pendingHash = h;
      closePwBox();
      openEditBox();
    }
  } catch (err) {
    console.error(err);
    const missing = /could not find the function/i.test(err.message || "");
    toast(missing
      ? "비밀번호 함수가 없습니다 — supabase/board_password.sql 을 SQL Editor에서 실행해 주세요."
      : "확인에 실패했습니다: " + (err.message || "알 수 없는 오류"));
  } finally {
    btn.disabled = false;
    btn.textContent = "확인";
  }
});

$("#e-save").addEventListener("click", async () => {
  if (!post || !pendingHash) { toast("비밀번호 확인이 필요합니다."); return; }
  const title = $("#e-title").value.trim();
  const body = $("#e-body").value.trim();
  if (!title) { toast("제목을 입력해 주세요."); return; }
  if (!body) { toast("내용을 입력해 주세요."); return; }
  if (!isConfigured()) { toast("Supabase 설정(config.js)이 필요합니다."); return; }

  const btn = $("#e-save");
  btn.disabled = true;
  btn.textContent = "저장 중…";
  try {
    const { data, error } = await db.rpc("board_update", {
      p_id: id, p_pass_hash: pendingHash, p_title: title, p_body: body,
    });
    if (error) throw error;
    if (!data) { toast(pwFailMsg()); return; }
    toast("수정되었습니다.");
    location.reload();
  } catch (err) {
    console.error(err);
    const missing = /could not find the function/i.test(err.message || "");
    toast(missing
      ? "비밀번호 함수가 없습니다 — supabase/board_password.sql 을 SQL Editor에서 실행해 주세요."
      : "저장에 실패했습니다: " + (err.message || "알 수 없는 오류"));
  } finally {
    btn.disabled = false;
    btn.textContent = "저장";
  }
});
$("#e-cancel").addEventListener("click", () => location.reload());

loadPost();
