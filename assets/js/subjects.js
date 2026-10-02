import { db, isConfigured } from "./db.js";
import {
  $, CATEGORIES, REGIONS, esc, toast, setupPage, KIND_LABEL, fmtDate, emptyBox,
} from "./app.js";

setupPage();

/* ---------- 옵션 ---------- */
$("#s-category").insertAdjacentHTML("beforeend",
  `<option value="">선택 안 함</option>` +
  CATEGORIES.map((c) => `<option value="${esc(c)}">${esc(c)}</option>`).join(""));
$("#s-region").insertAdjacentHTML("beforeend",
  `<option value="">선택 안 함</option>` +
  REGIONS.map((r) => `<option value="${esc(r)}">${esc(r)}</option>`).join(""));

/* ---------- 목록 ---------- */
let rows = [];

function render() {
  const q = $("#s-q").value.trim().toLowerCase();
  const list = rows.filter((r) => !q || r.name.toLowerCase().includes(q));
  const box = $("#subject-list");

  if (!list.length) {
    box.innerHTML = q
      ? emptyBox("검색 결과가 없습니다", "없다면 위에서 직접 등록할 수 있습니다.")
      : emptyBox("아직 등록된 대상이 없습니다", "첫 번째 대상을 등록해 주세요.");
  } else {
    box.innerHTML = list.map((r) => `
      <div class="subject-card">
        <div class="subject-top">
          <span class="chip chip-kind">${KIND_LABEL[r.kind] || "대상"}</span>
          <span class="subject-date">${fmtDate(r.created_at)}</span>
        </div>
        <div class="subject-name">${esc(r.name)}</div>
        <div class="subject-chips">
          ${r.category ? `<span class="chip">${esc(r.category)}</span>` : ""}
          ${r.region ? `<span class="chip">${esc(r.region)}</span>` : ""}
        </div>
        <a class="subject-report" href="report.html?subject=${encodeURIComponent(r.name)}&amp;kind=${r.kind}">이 대상으로 제보하기 →</a>
      </div>`).join("");
  }
  $("#s-count").textContent = q
    ? `${list.length}건 검색됨 (전체 ${rows.length}건)`
    : `전체 ${rows.length}건`;
}

async function load() {
  if (!isConfigured()) {
    $("#subject-list").innerHTML = emptyBox("Supabase 미연결", "config.js 설정이 필요합니다.");
    return;
  }
  try {
    const { data, error } = await db.from("subjects")
      .select("id, name, kind, category, region, created_at")
      .order("created_at", { ascending: false })
      .limit(300);
    if (error) throw error;
    rows = data || [];
    render();
  } catch (err) {
    console.error(err);
    const missing = /does not exist|schema cache/i.test(err.message || "");
    $("#subject-list").innerHTML = missing
      ? emptyBox("테이블이 아직 없습니다", "관리자가 supabase/subjects.sql 을 SQL Editor 에서 실행하면 이목록이 켜집니다.")
      : emptyBox("목록을 불러오지 못했습니다", err.message || "");
  }
}

/* ---------- 등록 ---------- */
$("#subject-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = $("#s-name").value.trim();
  const ok = name.length >= 2;
  $("#f-name").classList.toggle("has-error", !ok);
  if (!ok) { toast("대상명을 2자 이상 입력해 주세요."); return; }
  if (!isConfigured()) { toast("Supabase 설정(config.js)이 필요합니다."); return; }

  const btn = $("#btn-register");
  btn.disabled = true;
  try {
    const kind = $("input[name=kind]:checked").value;
    const { error } = await db.rpc("register_subject", {
      p_name: name,
      p_kind: kind,
      p_category: $("#s-category").value || null,
      p_region: $("#s-region").value || null,
    });
    if (error) throw error;
    toast(`"${name}" 등록 완료`);
    $("#s-name").value = "";
    await load();
    document.getElementById("subject-list").scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (err) {
    console.error(err);
    const missing = /could not find the function|does not exist/i.test(err.message || "");
    toast(missing
      ? "등록 함수가 없습니다 — supabase/subjects.sql 을 실행해 주세요."
      : "등록에 실패했습니다: " + (err.message || "알 수 없는 오류"));
  } finally {
    btn.disabled = false;
  }
});

$("#s-q").addEventListener("input", render);

load();
