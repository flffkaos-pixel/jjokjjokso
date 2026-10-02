import { db, isConfigured } from "./db.js";
import {
  $, $$, CATEGORIES, REGIONS, esc, fmtBytes, toast, copyText, setupPage, qs,
} from "./app.js";

setupPage();

const MAX_FILES = 6;
const MAX_SIZE = 8 * 1024 * 1024;

const state = { step: 1, files: [], links: [] };

/* ---------- 옵션 채우기 ---------- */
CATEGORIES.forEach((c) =>
  $("#category").insertAdjacentHTML("beforeend", `<option value="${esc(c)}">${esc(c)}</option>`));
REGIONS.forEach((r) =>
  $("#region").insertAdjacentHTML("beforeend", `<option value="${esc(r)}">${esc(r)}</option>`));

/* ---------- 등록된 대상 자동완성 + URL 프리필 ---------- */
async function loadSubjectOptions() {
  try {
    const { data, error } = await db.from("subjects").select("name").limit(500);
    if (error) throw error;
    const seen = new Set();
    const opts = [];
    (data || []).forEach((r) => {
      const n = r.name.trim();
      if (!seen.has(n.toLowerCase())) { seen.add(n.toLowerCase()); opts.push(`<option value="${esc(n)}"></option>`); }
    });
    $("#subject-options").innerHTML = opts.join("");
  } catch (_) { /* 테이블 미실행 상태 — 무시 */ }
}
if (isConfigured()) loadSubjectOptions();

const preSubject = qs("subject");
const preKind = qs("kind");
if (preSubject) $("#subject").value = preSubject;
if (preKind === "company" || preKind === "store") {
  const radio = $(`input[name=kind][value=${preKind}]`);
  if (radio) radio.checked = true;
}

/* ---------- 증거 렌더 ---------- */
function renderFiles() {
  const list = $("#file-list");
  list.innerHTML = state.files.map((f, i) => `
    <div class="file-item">
      ${f.file.type.startsWith("image/")
        ? `<img class="file-thumb" src="${f.preview}" alt="" />`
        : `<div class="file-thumb" style="display:grid;place-items:center;font-size:11px;font-weight:800;color:#64748B">PDF</div>`}
      <div class="file-meta">
        <div class="file-name">${esc(f.file.name)}</div>
        <div class="file-size">${fmtBytes(f.file.size)}</div>
      </div>
      <button type="button" class="file-remove" data-i="${i}">삭제</button>
    </div>`).join("");
  list.querySelectorAll(".file-remove").forEach((b) =>
    b.addEventListener("click", () => {
      const i = +b.dataset.i;
      URL.revokeObjectURL(state.files[i].preview);
      state.files.splice(i, 1);
      renderFiles();
    }));
}

function renderLinks() {
  const list = $("#link-list");
  list.innerHTML = state.links.map((l, i) => `
    <div class="file-item">
      <div class="file-thumb" style="display:grid;place-items:center;font-size:16px">🔗</div>
      <div class="file-meta">
        <div class="file-name">${esc(l.cap || "출처 링크")}</div>
        <div class="file-size" style="word-break:break-all">${esc(l.url)}</div>
      </div>
      <button type="button" class="file-remove" data-i="${i}">삭제</button>
    </div>`).join("");
  list.querySelectorAll(".file-remove").forEach((b) =>
    b.addEventListener("click", () => { state.links.splice(+b.dataset.i, 1); renderLinks(); }));
}

/* ---------- 파일 선택 ---------- */
const zone = $("#upload-zone");
const input = $("#file-input");

zone.addEventListener("click", () => input.click());
zone.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") input.click(); });
["dragenter", "dragover"].forEach((ev) =>
  zone.addEventListener(ev, (e) => { e.preventDefault(); zone.classList.add("is-drag"); }));
["dragleave", "drop"].forEach((ev) =>
  zone.addEventListener(ev, (e) => { e.preventDefault(); zone.classList.remove("is-drag"); }));
zone.addEventListener("drop", (e) => addFiles(e.dataTransfer.files));
input.addEventListener("change", () => { addFiles(input.files); input.value = ""; });

function addFiles(fileList) {
  for (const file of fileList) {
    if (state.files.length >= MAX_FILES) { toast(`최대 ${MAX_FILES}개까지 첨부할 수 있습니다.`); break; }
    if (file.size > MAX_SIZE) { toast(`${file.name}: 8MB를 초과합니다.`); continue; }
    if (!file.type.startsWith("image/") && file.type !== "application/pdf") {
      toast(`${file.name}: 이미지 또는 PDF만 첨부 가능합니다.`); continue;
    }
    state.files.push({ file, preview: file.type.startsWith("image/") ? URL.createObjectURL(file) : "" });
  }
  renderFiles();
}

$("#add-link").addEventListener("click", () => {
  const url = $("#link-url").value.trim();
  const cap = $("#link-cap").value.trim();
  if (!/^https?:\/\/.+/i.test(url)) { toast("http:// 또는 https:// 로 시작하는 URL을 입력해 주세요."); return; }
  state.links.push({ url, cap });
  $("#link-url").value = ""; $("#link-cap").value = "";
  renderLinks();
});

/* ---------- 유효성 검사 ---------- */
function setError(fieldId, on) {
  const el = $(fieldId);
  if (el) el.classList.toggle("has-error", !!on);
}

function validate(step) {
  let ok = true;
  if (step === 1) {
    const s = $("#subject").value.trim().length >= 2;
    const t = $("#title").value.trim().length >= 5;
    const c = !!$("#category").value;
    setError("#f-subject", !s); setError("#f-title", !t); setError("#f-category", !c);
    ok = s && t && c;
  }
  if (step === 2) {
    const b = $("#body").value.trim().length >= 40;
    const e = state.files.length + state.links.length >= 1;
    setError("#f-body", !b); setError("#f-evidence", !e);
    ok = b && e;
  }
  if (step === 3) {
    const a = $("#agree-1").checked && $("#agree-2").checked;
    setError("#f-agree", !a);
    ok = a;
  }
  if (!ok) { toast("필수 항목을 확인해 주세요."); $(".has-error")?.scrollIntoView({ behavior: "smooth", block: "center" }); }
  return ok;
}

/* ---------- 위자드 ---------- */
function renderStep() {
  $$("[data-panel]").forEach((p) => p.classList.toggle("hidden", +p.dataset.panel !== state.step));
  $$("#steps .step").forEach((s) => {
    const n = +s.dataset.step;
    s.classList.toggle("is-active", n === state.step);
    s.classList.toggle("is-done", n < state.step);
  });
  $("#btn-prev").disabled = state.step === 1;
  $("#btn-next").classList.toggle("hidden", state.step === 3);
  $("#btn-submit").classList.toggle("hidden", state.step !== 3);
  if (state.step === 3) renderPreview();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

$("#btn-next").addEventListener("click", () => { if (validate(state.step)) { state.step += 1; renderStep(); } });
$("#btn-prev").addEventListener("click", () => { state.step -= 1; renderStep(); });

/* ---------- 미리보기 ---------- */
function renderPreview() {
  const kind = $("input[name=kind]:checked").value === "company" ? "기업·사업자" : "매장·점포";
  const evid = [
    ...state.files.map((f) => `${f.file.name} (${fmtBytes(f.file.size)})`),
    ...state.links.map((l) => l.url),
  ];
  $("#preview").innerHTML = `
    <div class="card-pad">
      <div class="post-card-top">
        <span class="chip chip-kind">${kind}</span>
        <span class="chip">${esc($("#category").value)}</span>
        ${$("#region").value ? `<span class="chip">${esc($("#region").value)}</span>` : ""}
      </div>
      <h3 class="post-title">${esc($("#title").value.trim())}</h3>
      <div class="post-subject">대상 · ${esc($("#subject").value.trim())}</div>
      <p class="post-excerpt" style="-webkit-line-clamp:6">${esc($("#body").value.trim())}</p>
      <div class="post-meta"><span>증거 ${evid.length}건</span>
        ${$("#occurred").value ? `<span>발생일 ${esc($("#occurred").value)}</span>` : "<span>발생일 미입력</span>"}</div>
      <ul class="small muted" style="margin:10px 0 0">${evid.map((e) => `<li>${esc(e)}</li>`).join("")}</ul>
    </div>`;
}

/* ---------- 익명 토글 ---------- */
$("#anonymous").addEventListener("change", (e) => {
  const name = $("#author-name");
  name.disabled = e.target.checked;
  if (e.target.checked) name.value = "";
});

/* ---------- 제출 ---------- */
$("#report-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!validate(3)) return;
  if (!isConfigured()) { toast("Supabase 설정(config.js)이 필요합니다."); return; }

  const btn = $("#btn-submit");
  btn.disabled = true;
  $("#upload-progress").classList.remove("hidden");

  const setStatus = (pct, msg) => {
    $("#upload-bar").style.width = pct + "%";
    $("#upload-status").classList.remove("hidden");
    $("#upload-status").textContent = msg;
  };

  try {
    setStatus(8, "제보 저장 중…");

    const payload = {
      kind: $("input[name=kind]:checked").value,
      title: $("#title").value.trim(),
      subject: $("#subject").value.trim(),
      category: $("#category").value,
      region: $("#region").value || null,
      body: $("#body").value.trim(),
      occurred_at: $("#occurred").value || null,
      is_anonymous: $("#anonymous").checked,
      author_name: $("#anonymous").checked ? null : ($("#author-name").value.trim() || "익명"),
      status: "pending",
    };

    const { data: post, error: pErr } = await db.from("posts")
      .insert(payload).select("id, access_token").single();
    if (pErr) throw pErr;

    setStatus(30, "증거 업로드 중…");
    const evRows = [];
    const total = state.files.length || 1;

    for (let i = 0; i < state.files.length; i++) {
      const f = state.files[i];
      const ext = (f.file.name.split(".").pop() || "bin").replace(/[^a-z0-9]/gi, "").slice(0, 6) || "bin";
      const path = `${post.id}/${crypto.randomUUID ? crypto.randomUUID() : Date.now() + i}.${ext}`;
      const { error: uErr } = await db.storage.from("evidence").upload(path, f.file, {
        cacheControl: "3600", upsert: false,
      });
      if (uErr) throw new Error(`파일 업로드 실패: ${f.file.name} — ${uErr.message}`);
      const { data: pub } = db.storage.from("evidence").getPublicUrl(path);
      evRows.push({
        post_id: post.id,
        kind: $("#ev-kind").value,
        url: pub.publicUrl,
        caption: f.file.name.length > 80 ? f.file.name.slice(0, 77) + "..." : f.file.name,
      });
      setStatus(30 + Math.round(((i + 1) / total) * 45), `증거 업로드 중… (${i + 1}/${state.files.length})`);
    }

    state.links.forEach((l) => {
      evRows.push({ post_id: post.id, kind: "link", url: l.url, caption: l.cap || null });
    });

    if (evRows.length) {
      setStatus(85, "증거 기록 중…");
      const { error: eErr } = await db.from("evidence").insert(evRows);
      if (eErr) throw eErr;
    }

    // 제보 대상 자동 등록 (테이블 미실행 상태면 조용히 건너뜀)
    const { error: sErr } = await db.rpc("register_subject", {
      p_name: payload.subject,
      p_kind: payload.kind,
      p_category: payload.category,
      p_region: payload.region,
    });
    if (sErr) console.warn("대상 자동 등록 생략:", sErr.message);

    setStatus(100, "완료되었습니다.");

    const url = `${location.origin}${location.pathname.replace(/[^/]*$/, "")}post.html?id=${post.id}&t=${post.access_token}`;
    $("#track-url").textContent = url;
    $("#go-detail").href = `post.html?id=${post.id}&t=${post.access_token}`;
    $("#copy-link").onclick = () => copyText(url);

    $("#report-form").classList.add("hidden");
    $("#steps").classList.add("hidden");
    $("#success").classList.remove("hidden");
    window.scrollTo({ top: 0, behavior: "smooth" });
  } catch (err) {
    console.error(err);
    toast("제출에 실패했습니다: " + (err.message || "알 수 없는 오류"));
    setStatus(0, "");
    $("#upload-progress").classList.add("hidden");
    $("#upload-status").classList.add("hidden");
  } finally {
    btn.disabled = false;
  }
});

renderStep();
