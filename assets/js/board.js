import { db, isConfigured } from "./db.js";
import {
  $, $$, esc, toast, setupPage, fmtDate, fmtNum, emptyBox,
} from "./app.js";

setupPage();

const CAT_LABEL = { free: "자유", qna: "질문", info: "정보", share: "나눔" };
const PER = 10;
const MAX_FILES = 3;
const MAX_SIZE = 5 * 1024 * 1024;

let cat = "";
let sort = "latest";
let page = 0;
let total = 0;
let loading = false;
let rows = [];
let picked = [];
const objUrls = [];

/* ---------- 렌더 ---------- */
function rowCard(p) {
  const name = p.is_anonymous || !p.author_name ? "익명" : p.author_name;
  const thumb = p.images && p.images[0]
    ? `<img src="${esc(p.images[0])}" alt="" loading="lazy" style="width:100%; height:150px; object-fit:cover; border:1.5px solid var(--line); border-radius:9px; margin-bottom:12px; display:block" />`
    : "";
  return `
  <a class="post-card" href="board-view.html?b=${p.id}">
    <div class="post-card-top">
      <span class="chip chip-kind">${CAT_LABEL[p.category] || "자유"}</span>
      ${p.images && p.images.length ? `<span class="chip">📷 사진 ${p.images.length}</span>` : ""}
    </div>
    <h3 class="post-title">${esc(p.title)}</h3>
    ${thumb}
    <p class="post-excerpt">${esc(p.body.replace(/\[[1-9]\]/g, "").trim())}</p>
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
    let query = db.from("board_posts")
      .select("id, title, body, category, author_name, is_anonymous, view_count, like_count, comment_count, created_at, images", { count: "exact" });
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

/* ---------- 사진 선택 ---------- */
function renderPreviews() {
  objUrls.forEach((u) => URL.revokeObjectURL(u));
  objUrls.length = 0;
  const box = $("#b-previews");
  box.innerHTML = picked.map((f, i) => {
    const url = URL.createObjectURL(f);
    objUrls.push(url);
    return `<div style="position:relative">
      <img src="${url}" alt="${esc(f.name)}" style="width:76px; height:76px; object-fit:cover; border:1.5px solid var(--line); border-radius:8px; display:block" />
      <button type="button" data-rm="${i}" aria-label="첨부 취소" style="position:absolute; top:-8px; right:-8px; width:21px; height:21px; border-radius:50%; border:1.5px solid var(--ink); background:#fff; font-size:13px; font-weight:800; cursor:pointer; line-height:1; padding:0">×</button>
    </div>`;
  }).join("");
  box.querySelectorAll("[data-rm]").forEach((b) => {
    b.addEventListener("click", () => {
      picked.splice(Number(b.dataset.rm), 1);
      renderPreviews();
    });
  });
}

$("#b-files").addEventListener("change", (e) => {
  const files = [...e.target.files];
  for (const f of files) {
    if (!f.type.startsWith("image/")) { toast("이미지 파일만 첨부할 수 있습니다."); continue; }
    if (f.size > MAX_SIZE) { toast(`"${f.name}"은 5MB를 넘습니다.`); continue; }
    if (picked.length >= MAX_FILES) { toast("사진은 최대 3장까지 첨부할 수 있습니다."); break; }
    picked.push(f);
  }
  e.target.value = "";
  renderPreviews();
});

async function uploadImages() {
  const urls = [];
  for (const f of picked) {
    const extRaw = (f.name.split(".").pop() || "jpg").toLowerCase();
    const ext = extRaw.replace(/[^a-z0-9]/g, "").slice(0, 8) || "jpg";
    const path = `board/${crypto.randomUUID()}.${ext}`;
    const { error } = await db.storage.from("evidence").upload(path, f, {
      contentType: f.type,
      upsert: false,
    });
    if (error) throw new Error(`사진 업로드 실패: ${error.message}`);
    const { data } = db.storage.from("evidence").getPublicUrl(path);
    urls.push(data.publicUrl);
  }
  return urls;
}

/* ---------- 글쓰기 ---------- */
async function sha256(s) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

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
  const label = btn.textContent;
  btn.disabled = true;
  btn.textContent = picked.length ? "사진 올리는 중…" : "올리는 중…";
  try {
    const category = $("input[name=bcat]:checked").value;
    const payload = {
      title, body, category,
      author_name: name || null,
      is_anonymous: !name,
    };
    const pass = $("#b-pass").value.trim();
    if (pass) payload.password_hash = await sha256(pass);
    if (picked.length) payload.images = await uploadImages();

    let res = await db.from("board_posts").insert(payload).select("id").single();
    if (res.error && payload.images && /images|column/i.test(res.error.message || "")) {
      delete payload.images;
      res = await db.from("board_posts").insert(payload).select("id").single();
      if (!res.error) toast("글이 올라갔습니다. (사진 컬럼 SQL 미실행으로 사진 없이 등록)");
    }
    if (res.error) throw res.error;
    picked = [];
    renderPreviews();
    location.href = `board-view.html?b=${res.data.id}`;
  } catch (err) {
    console.error(err);
    const missing = /does not exist|schema cache/i.test(err.message || "");
    toast(missing
      ? "게시판 테이블이 없습니다 — supabase/community.sql 을 실행해 주세요."
      : "글 올리기에 실패했습니다: " + (err.message || "알 수 없는 오류"));
  } finally {
    btn.disabled = false;
    btn.textContent = label;
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
