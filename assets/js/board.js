import { db, isConfigured } from "./db.js";
import {
  $, $$, esc, toast, setupPage, fmtDate, fmtNum, emptyBox,
} from "./app.js";

setupPage();

const CAT_LABEL = { free: "자유", qna: "질문", info: "정보", share: "나눔" };
const PER = 10;

let cat = "";
let sort = "latest";
let page = 0;
let total = 0;
let loading = false;
let rows = [];

/* ---------- 렌더 ---------- */
function rowCard(p) {
  const name = p.is_anonymous || !p.author_name ? "익명" : p.author_name;
  return `
  <a class="post-card" href="board-view.html?b=${p.id}">
    <div class="post-card-top">
      <span class="chip chip-kind">${CAT_LABEL[p.category] || "자유"}</span>
    </div>
    <h3 class="post-title">${esc(p.title)}</h3>
    <p class="post-excerpt">${esc(p.body)}</p>
    <div class="post-meta">
      <span>${esc(name)}</span>
      <span>추천 ${fmtNum(p.like_count)}</span>
      <span>댓글 ${fmtNum(p.comment_count)}</span>
      <span>조회 ${fmtNum(p.view_count)}</span>
      <span>${fmtDate(p.created_at)}</span>
    </div>
  </a>`;
}

function render() {
  const box = $("#board-list");
  if (!rows.length) {
    const q = $("#b-q").value.trim();
    box.innerHTML = q || cat
      ? emptyBox("검색 결과가 없습니다", "다른 키워드나 분류로 다시 찾아보세요.")
      : emptyBox("아직 글이 없습니다", "첫 번째 글을 올려 보세요.");
  } else {
    box.innerHTML = rows.map(rowCard).join("");
  }
  $("#b-count").textContent = total > rows.length || page > 0
    ? `${fmtNum(rows.length)} / ${fmtNum(total)}건`
    : `전체 ${fmtNum(total)}건`;
  $("#load-more").hidden = rows.length >= total;
}

/* ---------- 로드 ---------- */
async function load(reset = false) {
  if (loading) return;
  if (!isConfigured()) {
    $("#board-list").innerHTML = emptyBox("Supabase 미연결", "config.js 설정이 필요합니다.");
    return;
  }
  if (reset) { page = 0; rows = []; }
  loading = true;
  try {
    const term = $("#b-q").value.trim().replace(/[%_,()]/g, " ").trim();
    let query = db.from("board_posts").select("*", { count: "exact" });
    if (cat) query = query.eq("category", cat);
    if (term) query = query.or(`title.ilike.%${term}%,body.ilike.%${term}%`);
    query = sort === "hot"
      ? query.order("like_count", { ascending: false }).order("created_at", { ascending: false })
      : query.order("created_at", { ascending: false });

    const from = page * PER;
    const { data, error, count } = await query.range(from, from + PER - 1);
    if (error) throw error;
    rows = reset ? (data || []) : rows.concat(data || []);
    total = count ?? rows.length;
    render();
  } catch (err) {
    console.error(err);
    const missing = /does not exist|schema cache/i.test(err.message || "");
    $("#board-list").innerHTML = missing
      ? emptyBox("게시판 테이블이 아직 없습니다", "supabase/community.sql 을 SQL Editor 에서 실행하면 목록이 켜집니다.")
      : emptyBox("목록을 불러오지 못했습니다", err.message || "");
    $("#b-count").textContent = "";
    $("#load-more").hidden = true;
  } finally {
    loading = false;
  }
}

/* ---------- 글쓰기 ---------- */
$("#board-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const title = $("#b-title").value.trim();
  const body = $("#b-body").value.trim();
  const name = $("#b-name").value.trim();

  const tOk = title.length >= 1;
  const bOk = body.length >= 1;
  $("#f-btitle").classList.toggle("has-error", !tOk);
  $("#f-bbody").classList.toggle("has-error", !bOk);
  if (!tOk) { toast("제목을 입력해 주세요."); return; }
  if (!bOk) { toast("내용을 입력해 주세요."); return; }
  if (!isConfigured()) { toast("Supabase 설정(config.js)이 필요합니다."); return; }

  const btn = $("#btn-write");
  btn.disabled = true;
  try {
    const category = $("input[name=bcat]:checked").value;
    const { data, error } = await db.from("board_posts").insert({
      title, body, category,
      author_name: name || null,
      is_anonymous: !name,
    }).select("id").single();
    if (error) throw error;
    toast("글이 올라갔습니다.");
    $("#b-title").value = "";
    $("#b-body").value = "";
    $("#b-name").value = "";
    location.href = `board-view.html?b=${data.id}`;
  } catch (err) {
    console.error(err);
    const missing = /does not exist|schema cache/i.test(err.message || "");
    toast(missing
      ? "게시판 테이블이 없습니다 — supabase/community.sql 을 실행해 주세요."
      : "글 올리기에 실패했습니다: " + (err.message || "알 수 없는 오류"));
  } finally {
    btn.disabled = false;
  }
});

/* ---------- 필터/정렬/검색 ---------- */
$$("#cat-tabs .tab").forEach((btn) => {
  btn.addEventListener("click", () => {
    $$("#cat-tabs .tab").forEach((b) => b.classList.remove("is-active"));
    btn.classList.add("is-active");
    cat = btn.dataset.cat;
    load(true);
  });
});

$$("#sort-tabs .tab").forEach((btn) => {
  btn.addEventListener("click", () => {
    $$("#sort-tabs .tab").forEach((b) => b.classList.remove("is-active"));
    btn.classList.add("is-active");
    sort = btn.dataset.sort;
    load(true);
  });
});

let qTimer;
$("#b-q").addEventListener("input", () => {
  clearTimeout(qTimer);
  qTimer = setTimeout(() => load(true), 300);
});

$("#load-more").addEventListener("click", () => { page += 1; load(); });

load(true);
