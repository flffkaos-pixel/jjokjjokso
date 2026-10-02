import { db } from "./db.js";
import {
  $, STATUS, KIND_LABEL, EVIDENCE_KINDS, esc, fmtDate, fmtNum, badge,
  toast, copyText, initLightbox, qs, getVoterKey,
} from "./app.js";

const id = qs("id");
const token = qs("t");
const lightbox = initLightbox();

let post = null;

/* ---------- 로드 ---------- */
async function load() {
  if (!id) return show("not-found");

  try {
    const { data: rows, error } = await db.rpc("get_post", { p_id: id, p_token: token });
    if (error) throw error;
    post = rows && rows[0];
    if (!post) return show("not-found");

    show("detail");
    document.title = `${post.title} — 좆좆소`;
    renderHead();

    const { data: ev, error: evErr } = await db.from("evidence").select("*").eq("post_id", id).order("created_at");
    const { data: tg, error: tgErr } = await db.from("status_events").select("*").eq("post_id", id).order("created_at");
    const { data: rb } = await db.from("rebuttals").select("*").eq("post_id", id).eq("status", "approved").order("created_at");
    const { data: cm } = await db.from("comments").select("*").eq("post_id", id).order("created_at");

    renderEvidence(evErr ? [] : (ev || []));
    renderTimeline(tgErr ? [] : (tg || []));
    renderRebuttals(rb || []);
    renderComments(cm || []);

    // 조회수 (세션당 1회)
    const key = "cr_view_" + id;
    if (!sessionStorage.getItem(key)) {
      sessionStorage.setItem(key, "1");
      db.rpc("view_post", { p_id: id }).then(() => {}).catch(() => {});
    }
  } catch (e) {
    console.error(e);
    show("not-found");
  }
}

function show(which) {
  ["loading", "detail", "not-found"].forEach((s) =>
    $("#" + s).classList.toggle("hidden", s !== which));
}

/* ---------- 헤더/메타 ---------- */
function renderHead() {
  const s = STATUS[post.status];
  $("#d-badges").innerHTML = `
    ${badge(post.status)}
    <span class="chip chip-kind">${KIND_LABEL[post.kind] || "제보"}</span>
    <span class="chip">${esc(post.category)}</span>
    ${post.region ? `<span class="chip">${esc(post.region)}</span>` : ""}`;

  $("#d-title").textContent = post.title;
  $("#d-subject").innerHTML = `대상 · <strong>${esc(post.subject)}</strong>`;
  $("#d-meta").innerHTML = `
    <span>접수 ${fmtDate(post.created_at, true)}</span>
    <span>조회 ${fmtNum(post.view_count + (sessionStorage.getItem("cr_view_" + id) ? 1 : 0))}</span>
    <span>익명 여부 · ${post.is_anonymous ? "익명 제보" : esc(post.author_name || "익명")}</span>`;

  $("#d-facts").innerHTML = [
    ["상태", s.label],
    ["구분", KIND_LABEL[post.kind] || "—"],
    ["유형", post.category],
    ["지역", post.region || "—"],
    ["발생일", post.occurred_at ? post.occurred_at.replaceAll("-", ". ") : "미입력"],
    ["공감", fmtNum(post.helpful_count)],
  ].map(([k, v]) => `<div class="fact"><div class="fact-label">${k}</div><div class="fact-value">${esc(v)}</div></div>`).join("");

  $("#helpful-count").textContent = fmtNum(post.helpful_count);

  const notices = {
    pending:   ["접수 대기 중인 제보입니다", "아직 공개 검증이 시작되지 않았습니다. 접수번호를 가진 분만 확인할 수 있습니다."],
    reviewing: ["검증 진행 중입니다", "담당자가 증거의 출처·시점·일관성을 확인하고 있습니다. 판정 전에는 사실로 단정하지 마세요."],
    verified:  ["증거 검증이 완료되었습니다", "제출된 증거가 내용과 일치함을 확인했습니다. 다만 최종 법적 판단을 의미하지는 않습니다."],
    partial:   ["부분 검증되었습니다", "일부 구간은 증거가 확인되었으나, 나머지는 확인이 불가능했습니다. 각각 구분해 읽어 주세요."],
    disputed:  ["대상의 반론이 등록되었습니다", "제보와 함께 상대측 해명이 공개됩니다. 양쪽 주장을 모두 확인하세요."],
    rejected:  ["반려된 제보입니다", "증거 불충분 또는 기준 위반으로 반려되어 공개되지 않습니다."],
  };
  const [t, d] = notices[post.status] || notices.reviewing;
  $("#d-notice").innerHTML = `<strong>${t}</strong>${d}`;
}

/* ---------- 본문 ---------- */
function renderEvidence(items) {
  $("#d-evidence-count").textContent = `증거 ${items.length}건`;
  const wrap = $("#d-evidence");
  if (!items.length) {
    wrap.innerHTML = `<div class="empty" style="grid-column:1/-1"><strong>제출된 증거가 없습니다</strong>검증 전 단계이거나 관리자가 비공개로 전환한 경우입니다.</div>`;
    return;
  }
  wrap.innerHTML = items.map((e, i) => {
    const isImg = /\.(png|jpe?g|gif|webp|avif|bmp)(\?|$)/i.test(e.url);
    const isPdf = /\.pdf(\?|$)/i.test(e.url);
    return `
    <figure class="evidence-card" data-url="${esc(e.url)}" data-cap="${esc(e.caption || EVIDENCE_KINDS[e.kind] || "")}" data-i="${i}" style="margin:0">
      <div class="evidence-thumb">
        ${isImg
          ? `<img src="${esc(e.url)}" alt="${esc(e.caption || "증거 이미지")}" loading="lazy" />`
          : `<div style="text-align:center;padding:14px">
               <div style="font-size:30px">${isPdf ? "📄" : "🔗"}</div>
               <div style="font-size:12px;font-weight:700">${isPdf ? "PDF 문서" : "외부 링크"}</div>
             </div>`}
      </div>
      <figcaption class="evidence-info">
        <div class="evidence-kind">${esc(EVIDENCE_KINDS[e.kind] || "증거")}</div>
        <div class="evidence-cap">${esc(e.caption || (isPdf ? "첨부 문서" : "출처 확인"))}</div>
        ${e.captured_at ? `<div class="evidence-cap muted small">시점 ${esc(e.captured_at.replaceAll("-", ". "))}</div>` : ""}
      </figcaption>
    </figure>`;
  }).join("");

  wrap.querySelectorAll(".evidence-card").forEach((card) => {
    card.addEventListener("click", () => {
      const url = card.dataset.url;
      if (/\.(png|jpe?g|gif|webp|avif|bmp)(\?|$)/i.test(url)) lightbox.open(url, card.dataset.cap);
      else window.open(url, "_blank", "noopener");
    });
  });
}

function renderTimeline(events) {
  const labels = {
    pending: "제보 접수", reviewing: "증거 검증 시작",
    verified: "검증 완료", partial: "부분 검증 완료",
    disputed: "대상 반론 접수", rejected: "반려 처리",
  };
  const wrap = $("#d-timeline");
  if (!events.length) {
    wrap.innerHTML = `<li class="is-done"><div class="timeline-title">제보 접수</div></li>`;
    return;
  }
  const last = events[events.length - 1];
  wrap.innerHTML = events.map((e, i) => {
    const isLast = i === events.length - 1;
    const cls = isLast && ["reviewing", "pending"].includes(e.to_status) ? "is-current" : "is-done";
    return `
    <li class="${cls}">
      <div class="timeline-time">${fmtDate(e.created_at, true)}</div>
      <div class="timeline-title">${labels[e.to_status] || e.to_status}</div>
      ${e.note ? `<div class="timeline-note">${esc(e.note)}</div>` : ""}
    </li>`;
  }).join("");
}

function renderRebuttals(items) {
  const wrap = $("#d-rebuttals");
  if (!items.length) {
    wrap.innerHTML = `<div class="empty"><strong>등록된 반론이 없습니다</strong>대상 측이 아직 반론을 제출하지 않았습니다.</div>`;
    return;
  }
  wrap.innerHTML = items.map((r) => `
    <div class="rebuttal">
      <div class="rebuttal-head">
        <span class="rebuttal-author">🏢 ${esc(r.author_name)}</span>
        <span class="badge badge-verified">공식 반론 · 확인됨</span>
      </div>
      <p class="body-text" style="font-size:15.5px; line-height:1.8">${esc(r.body)}</p>
      <div class="small muted">등록일 ${fmtDate(r.created_at, true)}</div>
    </div>`).join("");
}

function renderComments(items) {
  $("#d-comment-count").textContent = `(${fmtNum(items.length)})`;
  const wrap = $("#d-comments");
  if (!items.length) {
    wrap.innerHTML = `<div class="empty" style="padding:34px"><strong>댓글이 없습니다</strong>사실 중심의 첫 댓글을 남겨 주세요.</div>`;
    return;
  }
  wrap.innerHTML = items.map((c) => {
    const name = c.is_anonymous && !c.author_name ? "익명" : (c.author_name || "익명");
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

/* ---------- 상호작용 ---------- */
$("#btn-helpful").addEventListener("click", async () => {
  try {
    const { error } = await db.rpc("vote_post", { p_id: id, p_voter: getVoterKey() });
    if (error) throw error;
    const { data } = await db.rpc("get_post", { p_id: id, p_token: token });
    const c = data?.[0]?.helpful_count ?? post.helpful_count + 1;
    $("#helpful-count").textContent = fmtNum(c);
    toast("공감이 기록되었습니다.");
  } catch (e) {
    toast("이미 참여하셨거나 처리에 실패했습니다.");
  }
});

$("#btn-share").addEventListener("click", () => copyText(location.href));

$("#comment-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const body = $("#c-body").value.trim();
  if (body.length < 2) { toast("댓글을 2자 이상 입력해 주세요."); return; }
  const name = $("#c-name").value.trim();
  const { error } = await db.from("comments").insert({
    post_id: id, body,
    author_name: name || null,
    is_anonymous: !name,
  });
  if (error) { toast("댓글 등록에 실패했습니다. (비공개 제보에는 댓글이 불가합니다)"); return; }
  $("#c-body").value = "";
  toast("댓글이 등록되었습니다.");
  const { data } = await db.from("comments").select("*").eq("post_id", id).order("created_at");
  renderComments(data || []);
});

$("#rebuttal-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = $("#rb-name").value.trim();
  const body = $("#rb-body").value.trim();
  if (name.length < 2) { toast("명칭을 입력해 주세요."); return; }
  if (body.length < 20) { toast("반론 내용을 20자 이상 입력해 주세요."); return; }
  const { error } = await db.from("rebuttals").insert({
    post_id: id, author_name: name, body,
    contact: $("#rb-contact").value.trim() || null,
    status: "pending",
  });
  if (error) { toast("반론 제출에 실패했습니다."); return; }
  e.target.reset();
  toast("반론이 접수되었습니다. 검토 후 공개됩니다.");
});

load();
