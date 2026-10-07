import { db, isConfigured } from "./db.js";
import {
  $, $$, esc, toast, setupPage, fmtDate, fmtNum, qs, getVoterKey, emptyBox,
} from "./app.js";

setupPage();

const CAT_LABEL = { free: "자유", qna: "질문", info: "정보", share: "나눔" };
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
  $("#v-like").hidden = true;
  const cf = $("#comment-form");
  if (cf) cf.closest(".card").hidden = true;
}

function renderPost() {
  const name = post.is_anonymous || !post.author_name ? "익명" : post.author_name;
  document.title = `${post.title} · 자유게시판 — 좌좌소`;
  $("#v-title").textContent = post.title;
  $("#v-meta").textContent = `${name} · ${fmtDate(post.created_at, true)} · 조회 ${fmtNum(post.view_count)}`;
  $("#v-top").innerHTML = `<span class="chip chip-kind">${CAT_LABEL[post.category] || "자유"}</span>`;
  $("#v-body").textContent = post.body;
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
    const { data, error } = await db.from("board_posts").select("*").eq("id", id).maybeSingle();
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

loadPost();
