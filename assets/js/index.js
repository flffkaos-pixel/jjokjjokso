import { db } from "./db.js";
import {
  $, $$, CATEGORIES, REGIONS, STATUS, esc, fmtNum,
  postCard, emptyBox, toast, fetchPosts,
} from "./app.js";

const state = {
  q: "", status: "", category: "", region: "", kind: "", sort: "latest",
  page: 0, perPage: 8, loading: false, done: false,
};

const list = $("#post-list");
const countEl = $("#result-count");
const moreBtn = $("#load-more");

/* ---------- 통계 ---------- */
async function loadStats() {
  try {
    const { data, error } = await db.rpc("site_stats");
    if (error) throw error;
    $("#stat-posts").textContent = fmtNum(data.posts);
    $("#stat-verified").textContent = fmtNum(data.verified);
    $("#stat-evidence").textContent = fmtNum(data.evidence);
    $("#stat-rebuttals").textContent = fmtNum(data.rebuttals);
  } catch (e) {
    console.error(e);
  }
}

/* ---------- 필터 옵션 ---------- */
function fillFilters() {
  const cat = $("#filter-category");
  const reg = $("#filter-region");
  CATEGORIES.forEach((c) => cat.insertAdjacentHTML("beforeend", `<option value="${esc(c)}">${esc(c)}</option>`));
  REGIONS.forEach((r) => reg.insertAdjacentHTML("beforeend", `<option value="${esc(r)}">${esc(r)}</option>`));
}

/* ---------- 목록 ---------- */
async function load(reset = false) {
  if (state.loading) return;
  if (reset) {
    state.page = 0;
    state.done = false;
    list.innerHTML = '<div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div>';
    moreBtn.classList.add("hidden");
  }
  if (state.done) return;

  state.loading = true;
  try {
    const statusIn = state.status
      ? [state.status]
      : ["verified", "partial", "reviewing", "disputed"];

    const { items, total } = await fetchPosts({
      statusIn, q: state.q, category: state.category,
      region: state.region, kind: state.kind, sort: state.sort,
      page: state.page, perPage: state.perPage,
    });

    if (reset) list.innerHTML = "";

    if (!items.length && reset) {
      list.innerHTML = emptyBox(
        state.q ? "검색 결과가 없습니다." : "아직 공개된 제보가 없습니다.",
        state.q ? "다른 키워드나 필터로 다시 검색해 보세요." : "첫 제보를 남겨 보세요.",
      );
      countEl.textContent = "";
      moreBtn.classList.add("hidden");
      return;
    }

    list.insertAdjacentHTML("beforeend", items.map(postCard).join(""));
    countEl.textContent = total ? `총 ${fmtNum(total)}건` : "";
    state.page += 1;
    state.done = state.page * state.perPage >= total;
    moreBtn.classList.toggle("hidden", state.done || !items.length);
  } catch (e) {
    console.error(e);
    if (reset) list.innerHTML = emptyBox("목록을 불러오지 못했습니다.", "잠시 후 다시 시도해 주세요.");
    toast("목록 로딩에 실패했습니다.");
  } finally {
    state.loading = false;
  }
}

/* ---------- 이벤트 ---------- */
$("#hero-search").addEventListener("submit", (e) => {
  e.preventDefault();
  state.q = $("#hero-q").value.trim();
  load(true);
  $("#post-list").scrollIntoView({ behavior: "smooth", block: "start" });
});

$$("#status-tabs .tab").forEach((btn) => {
  btn.addEventListener("click", () => {
    $$("#status-tabs .tab").forEach((b) => b.classList.remove("is-active"));
    btn.classList.add("is-active");
    state.status = btn.dataset.status;
    load(true);
  });
});

$("#filter-category").addEventListener("change", (e) => { state.category = e.target.value; load(true); });
$("#filter-region").addEventListener("change", (e) => { state.region = e.target.value; load(true); });
$("#filter-kind").addEventListener("change", (e) => { state.kind = e.target.value; load(true); });
$("#filter-sort").addEventListener("change", (e) => { state.sort = e.target.value; load(true); });
moreBtn.addEventListener("click", () => load(false));

/* ---------- init ---------- */
fillFilters();
loadStats();
load(true);
