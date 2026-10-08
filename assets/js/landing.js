import { db, isConfigured } from "./db.js";
import { $, fmtNum, fmtDate, esc, emptyBox, setupPage } from "./app.js";

setupPage();

const CAT_LABEL = { free: "자유", qna: "질문", info: "정보", share: "나눔" };

async function loadStats() {
  if (!isConfigured()) return;
  try {
    const [{ count: posts }, { count: comments }] = await Promise.all([
      db.from("board_posts").select("id", { count: "exact", head: true }),
      db.from("board_comments").select("id", { count: "exact", head: true }),
    ]);
    $("#stat-posts").textContent = fmtNum(posts);
    $("#stat-comments").textContent = fmtNum(comments);
  } catch (err) {
    console.error(err);
  }
}

function commentBlock(p, comments) {
  const shown = (comments || []).slice(0, 2);
  let html = `<div style="margin-top:10px; padding-top:9px; border-top:1.5px dashed var(--line); display:grid; gap:6px">`;
  if (!shown.length) {
    html += `<span class="small" style="color:var(--muted-2)">아직 댓글이 없습니다</span>`;
  } else {
    for (const c of shown) {
      const name = c.author_name || "익명";
      const body = c.body.length > 64 ? c.body.slice(0, 64) + "…" : c.body;
      html += `<span class="small" style="color:var(--ink-2); line-height:1.5"><b>${esc(name)}</b> <span style="color:var(--muted)">· ${fmtDate(c.created_at)}</span><br />${esc(body)}</span>`;
    }
    const rest = (p.comment_count || 0) - shown.length;
    if (rest > 0) {
      html += `<span class="small" style="color:var(--accent); font-weight:800">+${fmtNum(rest)}개 댓글 더</span>`;
    }
  }
  return html + `</div>`;
}

function popCard(p, cmap) {
  const name = p.is_anonymous || !p.author_name ? "익명" : esc(p.author_name);
  return `
  <a class="post-card" href="board-view.html?b=${p.id}">
    <div class="post-card-top">
      <span class="chip chip-kind">${CAT_LABEL[p.category] || "자유"}</span>
      <span class="small" style="color:var(--muted); margin-left:auto">${fmtDate(p.created_at)}</span>
    </div>
    <h3 class="post-title" style="font-size:16.5px; margin-bottom:8px">${esc(p.title)}</h3>
    ${p.images && p.images[0] ? `<img src="${esc(p.images[0])}" alt="" loading="lazy" style="width:100%; height:140px; object-fit:cover; border:1.5px solid var(--line); border-radius:9px; margin-bottom:10px; display:block" />` : ""}
    <div class="post-meta">
      <span>${name}</span>
      <span>♥ 추천 ${fmtNum(p.like_count)}</span>
      <span>◉ 조회 ${fmtNum(p.view_count)}</span>
      ${p.comment_count ? `<span>댓글 ${fmtNum(p.comment_count)}</span>` : ""}
    </div>
    ${commentBlock(p, cmap[p.id] || [])}
  </a>`;
}

async function loadPopular() {
  const likesBox = $("#top-likes");
  const viewsBox = $("#top-views");
  if (!likesBox || !viewsBox) return;

  if (!isConfigured()) {
    likesBox.innerHTML = emptyBox("Supabase 미연결", "config.js 설정이 필요합니다.");
    viewsBox.innerHTML = emptyBox("Supabase 미연결", "config.js 설정이 필요합니다.");
    return;
  }

  try {
    const fields = "id, title, category, like_count, view_count, comment_count, created_at, author_name, is_anonymous, images";
    const [likes, views] = await Promise.all([
      db.from("board_posts").select(fields)
        .order("like_count", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(5),
      db.from("board_posts").select(fields)
        .order("view_count", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(5),
    ]);
    if (likes.error) throw likes.error;
    if (views.error) throw views.error;

    const L = likes.data || [];
    const V = views.data || [];
    const ids = [...new Set([...L, ...V].map((p) => p.id))];
    const cmap = {};
    if (ids.length) {
      const { data: cms, error: cErr } = await db.from("board_comments")
        .select("post_id, body, author_name, created_at")
        .in("post_id", ids)
        .order("created_at", { ascending: false });
      if (cErr) throw cErr;
      (cms || []).forEach((c) => {
        (cmap[c.post_id] = cmap[c.post_id] || []).push(c);
      });
    }

    const empty = emptyBox("아직 글이 없습니다", "첫 글을 올려 보세요.");
    likesBox.innerHTML = L.length ? L.map((p) => popCard(p, cmap)).join("") : empty;
    viewsBox.innerHTML = V.length ? V.map((p) => popCard(p, cmap)).join("") : empty;
  } catch (err) {
    console.error(err);
    const missing = /does not exist|schema cache/i.test(err.message || "");
    const title = missing ? "게시판 테이블이 아직 없습니다" : "인기 글을 불러오지 못했습니다";
    const desc = missing ? "supabase/community.sql 을 SQL Editor 에서 실행해 주세요." : (err.message || "");
    likesBox.innerHTML = emptyBox(title, desc);
    viewsBox.innerHTML = emptyBox(title, desc);
  }
}

loadStats();
loadPopular();
