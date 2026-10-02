import { db, isConfigured } from "./db.js";

/* ---------- 상수 ---------- */
export const STATUS = {
  pending:   { label: "접수 대기",   cls: "badge-pending",   rank: 5 },
  reviewing: { label: "검증 진행중", cls: "badge-reviewing", rank: 4 },
  verified:  { label: "검증 완료",   cls: "badge-verified",  rank: 1 },
  partial:   { label: "부분 검증",   cls: "badge-partial",   rank: 2 },
  disputed:  { label: "반론 등록",   cls: "badge-disputed",  rank: 3 },
  rejected:  { label: "반려",       cls: "badge-rejected",  rank: 6 },
};

export const CATEGORIES = [
  "환불·교환 거부", "허위·과장광고", "불완전 판매", "사기·기망",
  "AS 거부", "임금·근로", "안전·위생", "개인정보 유출", "불친절·갑질", "기타",
];

export const REGIONS = [
  "전국/온라인", "서울", "경기", "인천", "강원", "충북", "충남", "대전", "세종",
  "전북", "전남", "광주", "경북", "경남", "대구", "부산", "울산", "제주",
];

export const EVIDENCE_KINDS = {
  screenshot: "스크린샷",
  receipt:    "영수증·거래내역",
  contract:   "계약서·서류",
  recording:  "녹취·통화기록",
  message:    "문자·메신저",
  link:       "외부 링크·게시물",
  other:      "기타 자료",
};

export const KIND_LABEL = { company: "기업·사업자", store: "매장·점포" };

/* ---------- 유틸 ---------- */
export const $  = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

export function fmtDate(d, withTime = false) {
  if (!d) return "—";
  const dt = new Date(d);
  const s = `${dt.getFullYear()}. ${String(dt.getMonth() + 1).padStart(2, "0")}. ${String(dt.getDate()).padStart(2, "0")}`;
  if (!withTime) return s;
  return `${s} ${String(dt.getHours()).padStart(2, "0")}:${String(dt.getMinutes()).padStart(2, "0")}`;
}

export function fmtNum(n) {
  return new Intl.NumberFormat("ko-KR").format(n ?? 0);
}

export function fmtBytes(b) {
  if (b < 1024) return b + " B";
  if (b < 1048576) return (b / 1024).toFixed(1) + " KB";
  return (b / 1048576).toFixed(1) + " MB";
}

export function badge(status) {
  const s = STATUS[status] || STATUS.pending;
  return `<span class="badge ${s.cls}">${s.label}</span>`;
}

export function toast(msg) {
  let el = $(".toast");
  if (!el) {
    el = document.createElement("div");
    el.className = "toast";
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.add("is-show");
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove("is-show"), 2600);
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast("클립보드에 복사했습니다.");
  } catch {
    toast("복사에 실패했습니다. 직접 선택해서 복사해 주세요.");
  }
}

export function getVoterKey() {
  let k = localStorage.getItem("cr_voter");
  if (!k) {
    k = (crypto.randomUUID ? crypto.randomUUID() : Date.now() + "-" + Math.random().toString(36).slice(2));
    localStorage.setItem("cr_voter", k);
  }
  return k;
}

export function qs(name) {
  return new URLSearchParams(location.search).get(name);
}

/* ---------- 공통 렌더 ---------- */
export function postCard(p) {
  const ev = p.evidence_count ?? p.ev_count ?? 0;
  const cm = p.comment_count ?? 0;
  return `
  <a class="post-card" href="post.html?id=${p.id}">
    <div class="post-card-top">
      ${badge(p.status)}
      <span class="chip">${esc(p.category)}</span>
      <span class="chip chip-kind">${KIND_LABEL[p.kind] || "제보"}</span>
    </div>
    <h3 class="post-title">${esc(p.title)}</h3>
    <div class="post-subject">대상 · ${esc(p.subject)}${p.region ? ` <span class="muted" style="font-weight:500">| ${esc(p.region)}</span>` : ""}</div>
    <p class="post-excerpt">${esc(p.body)}</p>
    <div class="post-meta">
      <span>${fmtDate(p.created_at)}</span>
      <span>증거 ${fmtNum(ev)}건</span>
      <span>공감 ${fmtNum(p.helpful_count)}</span>
      <span>조회 ${fmtNum(p.view_count)}</span>
      ${cm ? `<span>댓글 ${fmtNum(cm)}</span>` : ""}
    </div>
  </a>`;
}

export function emptyBox(title, desc) {
  return `<div class="empty"><strong>${esc(title)}</strong>${esc(desc || "")}</div>`;
}

/* ---------- 라이트박스 ---------- */
export function initLightbox() {
  const lb = document.createElement("div");
  lb.className = "lightbox";
  lb.innerHTML = `
    <button class="lightbox-close" aria-label="닫기">&times;</button>
    <img alt="증거 이미지" />
    <div class="lightbox-cap"></div>`;
  document.body.appendChild(lb);
  const img = lb.querySelector("img");
  const cap = lb.querySelector(".lightbox-cap");
  const close = () => lb.classList.remove("is-open");
  lb.addEventListener("click", (e) => { if (e.target === lb) close(); });
  lb.querySelector(".lightbox-close").addEventListener("click", close);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });
  return {
    open(src, caption) { img.src = src; cap.textContent = caption || ""; lb.classList.add("is-open"); },
  };
}

/* ---------- 페이지 초기화 ---------- */
export function setupPage() {
  if (!isConfigured()) {
    console.warn("[좆좆소] Supabase 설정(config.js)이 필요합니다.");
    const bar = document.createElement("div");
    bar.style.cssText = "background:#FFF4D6;border-bottom:1px solid #F3DFA6;color:#6B4700;padding:10px 16px;text-align:center;font-size:13.5px;font-weight:600;";
    bar.textContent = "⚠ 아직 Supabase가 연결되지 않았습니다. assets/js/config.js 에 프로젝트 URL과 anon 키를 입력해 주세요.";
    document.body.prepend(bar);
  }
  const y = $("#year");
  if (y) y.textContent = new Date().getFullYear();

  const page = document.body.dataset.page;
  $$("[data-nav]").forEach((a) => {
    if (a.dataset.nav === page) a.classList.add("is-active");
  });
}

/* ---------- 목록 로딩 공통 ---------- */
export async function fetchPosts({
  statusIn = ["verified", "partial", "reviewing", "disputed"],
  q = "", category = "", region = "", kind = "", sort = "latest", page = 0, perPage = 10,
} = {}) {
  let query = db.from("posts").select("*", { count: "exact" })
    .in("status", statusIn);

  if (q) {
    const term = q.replace(/[%_,()]/g, " ").trim();
    if (term) query = query.or(`title.ilike.%${term}%,subject.ilike.%${term}%,body.ilike.%${term}%`);
  }
  if (category) query = query.eq("category", category);
  if (region) query = query.eq("region", region);
  if (kind) query = query.eq("kind", kind);

  query = sort === "helpful"
    ? query.order("helpful_count", { ascending: false }).order("created_at", { ascending: false })
    : query.order("created_at", { ascending: false });

  const from = page * perPage;
  const { data, error, count } = await query.range(from, from + perPage - 1);
  if (error) throw error;

  // 증거 개수 일괄 조회
  const ids = (data || []).map((p) => p.id);
  const counts = {};
  if (ids.length) {
    const { data: ev } = await db.from("evidence").select("post_id").in("post_id", ids);
    (ev || []).forEach((e) => { counts[e.post_id] = (counts[e.post_id] || 0) + 1; });
  }
  return {
    items: (data || []).map((p) => ({ ...p, evidence_count: counts[p.id] || 0 })),
    total: count ?? 0,
  };
}

setupPage();
