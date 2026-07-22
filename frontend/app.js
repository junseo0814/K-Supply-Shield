// K-Supply Shield — Tab1 (충격 시뮬레이션) 프론트엔드 로직
// 시각 언어는 디자인 목업(design_handoff_ksupply_shield)을 이식, 데이터/계산은 실제 백엔드 API 사용.
const API = "";

// 목업에서 가져온 광물별 포인트 컬러 (oklch → hex로 변환).
// 원래 oklch() + color-mix(in oklch, ...)를 사용했으나, 일부 브라우저(이 미리보기 포함)에서
// 특정 hue(특히 리튬의 hue 300, 보라색)가 채도를 잃고 회색으로 렌더링되는 문제가 있어
// 발표 환경 호환성을 위해 표준 hex로 교체.
const MINERAL_ACCENTS = {
  "흑연 (Graphite)": "#8a93a0",
  "리튬 (Lithium)": "#9d3fd1",
  "코발트 (Cobalt)": "#2f7fe0",
  "니켈 (Nickel)": "#12a58c",
  "망간 (Manganese)": "#d8367e",
  "희토류 (Rare Earths)": "#b3941a",
  "텅스텐 (Tungsten)": "#5b4fd6",
};

const state = {
  minerals: {},
  mineralKey: null,
  restrictionPct: 30,
  importTrillion: 0, // 사이드바 표시 단위: 조원
  komis: [],
  ddayIdx: 2, // 0=D+7, 1=D+18, 2=D+40
  simResult: null,
  activeView: "simulate",
  compareChecked: new Set(),
  comparePct: 50,
  stockDays: 45,
  dailyCons: 500,
  releasePct: 50,
  importCost: 0.5,
  targetDays: 45,
  stockpileResult: null,
  industryExpanded: false, // 모바일: 산업별 파급 손실 목록 전체 펼침 여부
};

const RADAR_CATEGORIES = ["조달 속도", "비용 효율", "물량 충분성", "공급 안정성", "지속 가능성"];
const RADAR_OPTIONS = [
  { name: "🏦 비축 방출", scores: [95, 90, 40, 70, 30], color: "#0b78ca" },
  { name: "✈️ 긴급 수입", scores: [40, 55, 90, 60, 75], color: "#d8367e" },
  { name: "⚡ 복합 전략", scores: [75, 72, 80, 88, 82], color: "#12a58c" },
];

const DOMINO_STAGES = [
  { title: "공급 차단", desc: "수입 물량 즉시 감소, 통관 지연 발생", day: "D+0", threshold: -1 },
  { title: "원자재 재고 소진", desc: "완충 재고 소진으로 대체선 확보 착수", day: "D+7", threshold: 0 },
  { title: "소재·부품 생산 중단", desc: "핵심 소재 라인 가동률 급감", day: "D+18", threshold: 1 },
  { title: "완성품 출하 차질", desc: "조립 공정 지연, 납기 차질 확산", day: "D+40", threshold: 2 },
  { title: "수출 손실 현실화", desc: "해외 계약 불이행 및 매출 손실 확정", day: "D+40+", threshold: 2 },
];
const DDAY_KEYS = ["D+7", "D+18", "D+40"];
const DDAY_OPTS = ["D+7", "D+18", "D+40"];
const DDAY_PHASE = { "D+7": "초기 단계", "D+18": "확산 단계", "D+40": "심화 단계" };

async function fetchJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} failed: ${res.status}`);
  return res.json();
}

function fmt(n, digits = 2) {
  return Number(n).toLocaleString("ko-KR", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}
function fmtPct(v) { return (v >= 0 ? "+" : "") + fmt(v, 1) + "%"; }

async function init() {
  const [minerals, komis] = await Promise.all([
    fetchJSON(`${API}/api/minerals`),
    fetchJSON(`${API}/api/komis`),
  ]);

  minerals.forEach((m) => { state.minerals[m.key] = m; });
  state.komis = komis;

  setupMineralDropdown(minerals);
  setupViewTabs();
  setupCompareView(minerals);
  setupReportButton();

  document.getElementById("restriction-range").addEventListener("input", (e) => {
    state.restrictionPct = Number(e.target.value);
    document.getElementById("restriction-value").textContent = `${state.restrictionPct}%`;
    e.target.setAttribute("aria-valuetext", `${state.restrictionPct}%`);
    updatePreview();
    updateMineralChip();
    runSimulation();
    runStockpile();
  });

  document.getElementById("import-input").addEventListener("input", (e) => {
    state.importTrillion = Number(e.target.value) || 0;
    updatePreview();
    runSimulation();
    runStockpile();
  });

  document.getElementById("dday-select").addEventListener("click", (e) => {
    const idx = e.target.dataset.idx;
    if (idx === undefined) return;
    state.ddayIdx = Number(idx);
    renderDomino();
    renderDdaySelect();
  });

  document.getElementById("alert-date").textContent = `기준일: ${new Date().toISOString().slice(0, 10).replace(/-/g, ".")}`;

  document.getElementById("industry-toggle-btn").addEventListener("click", () => {
    state.industryExpanded = !state.industryExpanded;
    if (state.simResult) renderIndustryList(state.simResult);
  });

  setupStockpileView();

  selectMineral(minerals[0].key);
  renderKomis();
}

// ── ② 비축 조달 의사결정 ──────────────────────────────────
function setupStockpileView() {
  document.getElementById("stock-days-range").addEventListener("input", (e) => {
    state.stockDays = Number(e.target.value);
    document.getElementById("stock-days-value").textContent = `${state.stockDays}일`;
    runStockpile();
  });
  document.getElementById("daily-cons-input").addEventListener("input", (e) => {
    state.dailyCons = Number(e.target.value) || 0;
    runStockpile();
  });
  document.getElementById("release-pct-range").addEventListener("input", (e) => {
    state.releasePct = Number(e.target.value);
    document.getElementById("release-pct-value").textContent = `${state.releasePct}%`;
    runStockpile();
  });
  document.getElementById("import-cost-input").addEventListener("input", (e) => {
    state.importCost = Number(e.target.value) || 0;
    runStockpile();
  });
  document.getElementById("target-days-range").addEventListener("input", (e) => {
    state.targetDays = Number(e.target.value);
    document.getElementById("target-days-value").textContent = `${state.targetDays}일`;
    runStockpile();
  });
}

async function runStockpile() {
  if (!state.mineralKey || state.activeView !== "stockpile") return;
  const koreaImportBn = state.importTrillion * 10000;
  const params = new URLSearchParams({
    mineral: state.mineralKey,
    restriction_pct: state.restrictionPct,
    korea_import_bn: koreaImportBn,
    days_stock: state.stockDays,
    daily_cons_ton: state.dailyCons,
    release_pct: state.releasePct,
    import_cost: state.importCost,
    target_days: state.targetDays,
  });
  const result = await fetchJSON(`${API}/api/stockpile?${params}`);
  state.stockpileResult = result;
  renderStockpile(result);
}

function renderStockpile(s) {
  const shortName = state.mineralKey.replace(/\s*\(.*\)/, "");
  document.getElementById("stockpile-summary").textContent =
    `현재 설정: ${shortName} · 비축 ${state.stockDays}일 | 일일소비 ${state.dailyCons.toLocaleString("ko-KR")} MT | 방출비율 ${state.releasePct}% | 공급차질 ${state.restrictionPct}%`;

  renderStockpileA(s);
  renderStockpileB(s);
  renderStockpileC(s);
  renderStockpileD(s);
}

function renderStockpileA(s) {
  const coverPct = Math.min(100, s.cover_ratio * 100);
  const barColor = s.cover_ratio >= 1 ? "var(--success)" : s.cover_ratio >= 0.5 ? "var(--warning)" : "var(--danger)";
  document.getElementById("coverage-pct-label").textContent = `${coverPct.toFixed(0)}% / 100%`;
  const fill = document.getElementById("coverage-fill");
  fill.style.width = `${coverPct}%`;
  fill.style.background = barColor;
  document.getElementById("coverage-status").innerHTML = s.shortage <= 0
    ? `<span style="color:var(--success)">✅ 목표 달성 가능</span>`
    : `<span style="color:${barColor}">⚠️ ${Math.round(s.shortage).toLocaleString("ko-KR")} MT 추가 필요</span>`;

  document.getElementById("stockpile-a-table").innerHTML = `
    <tr><th>일일 공급 차질량</th><td class="num">${Math.round(s.gap_per_day).toLocaleString("ko-KR")} MT/일</td></tr>
    <tr><th>${state.targetDays}일 버티기 필요 비축량</th><td class="num">${Math.round(s.needed_stock).toLocaleString("ko-KR")} MT</td></tr>
    <tr><th>현재 방출 가능 비축량</th><td class="num">${Math.round(s.usable_stock).toLocaleString("ko-KR")} MT</td></tr>
    <tr><th>현재 비축으로 버틸 수 있는 기간</th><td class="num">${Math.round(s.coverage_days)}일</td></tr>
    <tr><th>추가 확보 필요</th><td class="num">${Math.round(s.shortage).toLocaleString("ko-KR")} MT</td></tr>
    <tr><th>부족분 긴급수입 비용 (추정)</th><td class="num">${Math.round(s.emergency_cost).toLocaleString("ko-KR")} 억원</td></tr>
  `;
  const hint = document.getElementById("stockpile-a-hint");
  if (s.shortage > 0) {
    hint.hidden = false;
    hint.innerHTML = `💡 <b>조달 방안:</b> 긴급수입 ${Math.round(s.shortage).toLocaleString("ko-KR")} MT → 추정 비용 <b>${Math.round(s.emergency_cost).toLocaleString("ko-KR")}억원</b> (단가 ${state.importCost}억원/MT 기준)`;
  } else {
    hint.hidden = true;
  }
}

function renderStockpileB(s) {
  const t = s.thresholds;
  const badge = document.getElementById("signal-badge");
  const signalText = {
    RED: "🔴 위험 — 즉각 비축 확충", YELLOW_CAUTION: "🟡 주의 — 비축 확대 권고",
    YELLOW_GOOD: "🟡 양호 — 전략 비축 검토", GREEN: "🟢 안전 — 현재 비축 충분",
  }[t.signal];
  badge.innerHTML = `<span class="signal-badge ${t.signal}">${signalText}</span>`;

  const bars = [
    ["D+7 최소선", t.min_danger, "var(--danger)"],
    ["D+18 안전선", t.min_safe, "var(--warning)"],
    ["D+45 전략선", t.min_strat, "var(--accent)"],
    ["현재 방출가능", s.usable_stock, s.usable_stock >= t.min_safe ? "var(--success)" : "var(--danger)"],
  ];
  const maxVal = Math.max(...bars.map((b) => b[1]), 1);
  document.getElementById("threshold-bars").innerHTML = bars.map(([label, val, color]) => `
    <div class="industry-row">
      <div class="industry-name">${label}</div>
      <div class="industry-track"><div class="industry-bar" style="width:${Math.max(4, (val / maxVal) * 100).toFixed(0)}%; background:${color}"></div></div>
      <div class="industry-value">${Math.round(val).toLocaleString("ko-KR")} MT</div>
    </div>`).join("");

  document.getElementById("stockpile-b-table").innerHTML = `
    <tr><th>🔴 최소 (D+7)</th><td class="num">${Math.round(t.min_danger).toLocaleString("ko-KR")} MT</td></tr>
    <tr><th>🟡 안전 (D+18)</th><td class="num">${Math.round(t.min_safe).toLocaleString("ko-KR")} MT</td></tr>
    <tr><th>🔵 전략 (D+45)</th><td class="num">${Math.round(t.min_strat).toLocaleString("ko-KR")} MT</td></tr>
    <tr><th>현재 방출가능</th><td class="num">${Math.round(s.usable_stock).toLocaleString("ko-KR")} MT</td></tr>
  `;
  const cards = [];
  if (t.d2s > 0) cards.push(`<div class="threshold-warn-card">⚠️ <b>안전선 부족</b><br>추가 필요: ${Math.round(t.d2s).toLocaleString("ko-KR")} MT · 긴급수입 비용: ${Math.round(t.d2s_cost).toLocaleString("ko-KR")}억원</div>`);
  if (t.d2st > 0) cards.push(`<div class="threshold-warn-card">📋 <b>전략선 부족</b><br>순차 확충 필요: ${Math.round(t.d2st).toLocaleString("ko-KR")} MT · 순차 구매 비용: ${Math.round(t.d2st_cost).toLocaleString("ko-KR")}억원</div>`);
  document.getElementById("stockpile-b-cards").innerHTML = cards.join("");
}

function renderStockpileC(s) {
  const rows = s.priority.map((p) => {
    const tag = p.rank <= 2 ? '<span class="priority-tag urgent">긴급</span>'
      : p.rank <= 5 ? '<span class="priority-tag high">우선</span>'
      : '<span class="priority-tag normal">일반</span>';
    return `
      <div class="priority-row">
        <span class="priority-rank">#${p.rank}</span>${tag}
        <span class="priority-name">${p.industry}</span>
        <span class="priority-detail">생산손실 ${fmt(p.prod_loss, 3)}조 | 고용 ${Math.round(p.emp_loss).toLocaleString("ko-KR")}명</span>
      </div>`;
  }).join("");
  document.getElementById("priority-rows").innerHTML = rows +
    `<div class="metric-sub" style="margin-top:8px">종합점수 = 생산유발계수(60%) + 고용유발계수(40%) 가중 산출</div>`;

  const sorted = [...s.priority].sort((a, b) => b.score - a.score);
  const maxScore = sorted.length ? sorted[0].score : 1;
  document.getElementById("priority-bars").innerHTML = sorted.map((p) => {
    const color = p.rank <= 2 ? "var(--danger)" : p.rank <= 5 ? "var(--warning)" : "var(--multiplier-blue)";
    return `
      <div class="industry-row">
        <div class="industry-name">${p.industry}</div>
        <div class="industry-track"><div class="industry-bar" style="width:${Math.max(4, (p.score / maxScore) * 100).toFixed(0)}%; background:${color}"></div></div>
        <div class="industry-value">${fmt(p.score, 2)}</div>
      </div>`;
  }).join("");
}

function renderStockpileD(s) {
  document.getElementById("radar-wrap").innerHTML = buildRadarSVG(RADAR_CATEGORIES, RADAR_OPTIONS);

  const optionInfo = {
    "🏦 비축 방출": {
      기간: "즉시 (0~2일)", 비용: "정상가 기준", 물량: `${Math.round(s.usable_stock).toLocaleString("ko-KR")} MT`,
      장점: "즉각 투입 가능, 시장 교란 없음", 단점: "물량 소진 후 재확보 불가",
    },
    "✈️ 긴급 수입": {
      기간: "7~14일 (해운 기준)", 비용: "정상가 +20~40%", 물량: "이론상 무제한",
      장점: "중·장기 공급 지속 가능", 단점: "가격 급등, 조달 시간 소요",
    },
    "⚡ 복합 전략": {
      기간: "즉시 + 14일~", 비용: "정상가 +10~15%", 물량: "비축 + 수입 병행",
      장점: "D+7 비축 방출로 시간 확보 → 수입으로 장기 대응", 단점: "이중 관리 체계 필요",
    },
  };
  document.getElementById("option-cards").innerHTML = Object.entries(optionInfo).map(([name, info]) => `
    <div class="option-card">
      <div class="opt-name">${name}</div>
      <div class="opt-meta">기간: ${info.기간} | 비용: ${info.비용}<br>물량: ${info.물량}</div>
      <div class="opt-pro">✓ ${info.장점}</div>
      <div class="opt-con">✗ ${info.단점}</div>
    </div>`).join("");

  document.getElementById("recommendation-box").innerHTML = `💡 <b>권고 전략:</b> ${s.recommendation.text}`;
}

function buildRadarSVG(categories, options) {
  const cx = 150, cy = 150, r = 110;
  const n = categories.length;
  const angleFor = (i) => -Math.PI / 2 + (i * 2 * Math.PI) / n;
  const pointAt = (i, val) => {
    const a = angleFor(i);
    const rad = (val / 100) * r;
    return [cx + rad * Math.cos(a), cy + rad * Math.sin(a)];
  };

  const gridLevels = [0.25, 0.5, 0.75, 1];
  const gridPolys = gridLevels.map((lvl) => {
    const pts = categories.map((_, i) => pointAt(i, lvl * 100).join(",")).join(" ");
    return `<polygon points="${pts}" fill="none" stroke="rgba(10,20,35,0.12)" stroke-width="1"></polygon>`;
  }).join("");

  const axisLines = categories.map((_, i) => {
    const [x, y] = pointAt(i, 100);
    return `<line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" stroke="rgba(10,20,35,0.12)" stroke-width="1"></line>`;
  }).join("");

  const labels = categories.map((cat, i) => {
    const a = angleFor(i);
    const lx = cx + (r + 22) * Math.cos(a);
    const ly = cy + (r + 22) * Math.sin(a);
    const anchor = Math.cos(a) > 0.3 ? "start" : Math.cos(a) < -0.3 ? "end" : "middle";
    return `<text x="${lx}" y="${ly}" font-size="11" fill="#5b6472" text-anchor="${anchor}" dominant-baseline="middle">${cat}</text>`;
  }).join("");

  const series = options.map((opt) => {
    const pts = opt.scores.map((v, i) => pointAt(i, v).join(",")).join(" ");
    return `<polygon points="${pts}" fill="${opt.color}22" stroke="${opt.color}" stroke-width="2"></polygon>`;
  }).join("");

  const legend = options.map((opt, i) => `
    <span style="display:inline-flex; align-items:center; gap:5px; margin-right:12px; font-size:12px; color:var(--text-secondary)">
      <span style="width:9px; height:9px; border-radius:50%; background:${opt.color}; display:inline-block"></span>${opt.name}
    </span>`).join("");

  return `
    <svg viewBox="0 0 300 300" style="width:100%; height:280px; display:block;">
      ${gridPolys}${axisLines}${series}${labels}
    </svg>
    <div style="text-align:center; margin-top:6px;">${legend}</div>
  `;
}

// ── 광물 커스텀 드롭다운 ──────────────────────────────────
function setupMineralDropdown(minerals) {
  const trigger = document.getElementById("mineral-trigger");
  const list = document.getElementById("mineral-list");

  list.innerHTML = minerals.map((m) => `
    <div class="mineral-option" data-key="${m.key}" role="option" aria-selected="false">${m.key.replace(/\s*\(.*\)/, "")}</div>
  `).join("");

  trigger.addEventListener("click", (e) => {
    e.stopPropagation();
    toggleMineralDropdown();
  });
  list.addEventListener("click", (e) => {
    const key = e.target.dataset.key;
    if (!key) return;
    selectMineral(key);
    closeMineralDropdown();
  });
  document.addEventListener("click", (e) => {
    if (!list.hidden && !list.contains(e.target) && e.target !== trigger) closeMineralDropdown();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeMineralDropdown();
  });
}

function toggleMineralDropdown() {
  const list = document.getElementById("mineral-list");
  if (list.hidden) openMineralDropdown(); else closeMineralDropdown();
}
function openMineralDropdown() {
  document.getElementById("mineral-list").hidden = false;
  document.getElementById("mineral-trigger").setAttribute("aria-expanded", "true");
}
function closeMineralDropdown() {
  document.getElementById("mineral-list").hidden = true;
  document.getElementById("mineral-trigger").setAttribute("aria-expanded", "false");
}

function setAccent(mineralKey) {
  const accent = MINERAL_ACCENTS[mineralKey] || "#246beb";
  document.documentElement.style.setProperty("--accent", accent);
  document.getElementById("accent-dot").style.background = accent;
  const line = document.getElementById("komis-line");
  if (line) line.setAttribute("stroke", accent);
}

function selectMineral(key) {
  state.mineralKey = key;
  const m = state.minerals[key];
  state.restrictionPct = m.shock_example;
  state.importTrillion = Math.round((m.korea_import_bn / 10000) * 100) / 100; // 억원 → 조원

  const shortName = key.replace(/\s*\(.*\)/, "");
  document.getElementById("mineral-trigger").textContent = shortName;
  const list = document.getElementById("mineral-list");
  list.querySelectorAll(".mineral-option").forEach((opt) => {
    const isSelected = opt.dataset.key === key;
    opt.classList.toggle("selected", isSelected);
    opt.setAttribute("aria-selected", String(isSelected));
  });

  const restrictionRange = document.getElementById("restriction-range");
  restrictionRange.value = state.restrictionPct;
  restrictionRange.setAttribute("aria-valuetext", `${state.restrictionPct}%`);
  document.getElementById("restriction-value").textContent = `${state.restrictionPct}%`;
  document.getElementById("import-input").value = state.importTrillion;

  setAccent(key);
  updatePreview();
  updateMineralChip();
  renderDdaySelect();
  runSimulation();
  runStockpile();
}

// 모바일 상단바의 광물 칩("{mineral}·{pct}%") 갱신
function updateMineralChip() {
  if (!state.mineralKey) return;
  const shortName = state.mineralKey.replace(/\s*\(.*\)/, "");
  document.getElementById("mineral-chip-label").textContent = `${shortName} · ${state.restrictionPct}%`;
}

function updatePreview() {
  const shock = state.importTrillion * (state.restrictionPct / 100);
  document.getElementById("shock-preview-value").textContent = `${fmt(shock)}조원`;
  const shortName = state.mineralKey ? state.mineralKey.replace(/\s*\(.*\)/, "") : "";
  document.getElementById("shock-preview-formula").textContent =
    `${shortName} · 수입 ${fmt(state.importTrillion)}조원 × 제한 ${state.restrictionPct}%`;
}

async function runSimulation() {
  if (!state.mineralKey) return;
  const koreaImportBn = state.importTrillion * 10000; // 조원 → 억원 (API 단위)
  const params = new URLSearchParams({
    mineral: state.mineralKey,
    restriction_pct: state.restrictionPct,
    korea_import_bn: koreaImportBn,
  });
  const result = await fetchJSON(`${API}/api/simulate?${params}`);
  state.simResult = result;
  renderAll(result);
}

function renderAll(r) {
  renderAlert(r);
  renderMetrics(r);
  renderDdaySelect();
  renderDomino();
  renderDdayCards(r);
  renderIndustryList(r);
  updatePrintHeader();
}

// 접근성: 위험도를 색상만으로 구분하지 않도록 아이콘 병기 (아이콘은 장식용, aria-hidden)
const RISK_ICONS = {
  LOW: `<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 8.5l3.2 3.2L13 4.5"/></svg>`,
  MEDIUM: `<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 2L1 14h14L8 2z"/><line x1="8" y1="6.3" x2="8" y2="9.3"/><circle cx="8" cy="11.4" r="0.7" fill="currentColor" stroke="none"/></svg>`,
  HIGH: `<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="8" cy="8" r="6.5"/><line x1="8" y1="4.8" x2="8" y2="8.6"/><circle cx="8" cy="11" r="0.7" fill="currentColor" stroke="none"/></svg>`,
};

function renderAlert(r) {
  const shortName = r.mineral.replace(/\s*\(.*\)/, "");
  const el = document.getElementById("alert-banner");
  const cls = r.risk_level === "HIGH" ? "alert-high" : r.risk_level === "MEDIUM" ? "alert-medium" : "alert-low";
  const badgeText = r.risk_level === "HIGH" ? "HIGH" : r.risk_level === "MEDIUM" ? "MEDIUM" : "LOW";
  const desc = r.risk_level === "HIGH" ? "위험도 높음, 즉각 대응 필요"
    : r.risk_level === "MEDIUM" ? "위험도 중간, 선제적 대응 권고"
    : "위험도 낮음, 안정적 공급망 유지";

  el.className = `alert ${cls}`;
  document.getElementById("alert-badge").innerHTML = `${RISK_ICONS[r.risk_level]}${badgeText}`;
  document.getElementById("alert-message").textContent =
    `${shortName} 공급 제한 ${r.restriction_pct}% 시나리오 — ${desc}`;
}

function renderMetrics(r) {
  const shortName = r.mineral.replace(/\s*\(.*\)/, "");
  const items = [
    ["직접 수입 충격", `${fmt(r.shock_trillion)}조원`, `${shortName} 수입 기준 즉시 손실`, "var(--accent)"],
    ["총 생산 파급 손실", `${fmt(r.total_prod)}조원`, "전후방 산업 연쇄 파급", "var(--loss-orange)"],
    ["총 고용 위협", `${Math.round(r.total_emp).toLocaleString("ko-KR")}명`, "관련 산업 종사자 기준", "var(--employment-red)"],
    ["생산유발 배수", `${fmt(r.multiplier, 1)}배`, "1단위 충격당 파급 배율", "var(--multiplier-blue)"],
  ];
  document.getElementById("metric-grid").innerHTML = items
    .map(([label, val, sub, color]) => `
      <div class="metric-card" style="--card-accent:${color}" role="group" aria-label="${label}: ${val}">
        <div class="metric-label">${label}</div>
        <div class="metric-value">${val}</div>
        <div class="metric-sub">${sub}</div>
      </div>`)
    .join("");
}

function renderDdaySelect() {
  document.getElementById("dday-select").innerHTML = DDAY_OPTS
    .map((opt, i) => `<button data-idx="${i}" class="${i === state.ddayIdx ? "active" : ""}">${opt}</button>`)
    .join("");
  document.getElementById("domino-meta").textContent =
    `${DDAY_OPTS[state.ddayIdx]} 시점 기준 · 활성 ${state.ddayIdx + 2}/5 단계`;
}

function renderDomino() {
  const r = state.simResult;
  if (!r) return;
  const cascade = r.cascade;

  const items = DOMINO_STAGES.map((s, i) => {
    const isActive = s.threshold <= state.ddayIdx;
    const boxCls = `domino-box${isActive ? " active" : ""}`;
    return `
      <div class="domino-item">
        <div class="${boxCls}">
          <span class="domino-status-badge ${isActive ? "active" : "idle"}">${isActive ? "진행중" : "대기"}</span>
          <div class="domino-step">STEP ${i + 1}</div>
          <div class="domino-title">${s.title}</div>
          <div class="domino-desc">${s.desc}</div>
        </div>
        ${i < DOMINO_STAGES.length - 1 ? `<div class="domino-arrow${DOMINO_STAGES[i + 1].threshold <= state.ddayIdx ? " active" : ""}">&rarr;</div>` : ""}
      </div>`;
  });
  document.getElementById("domino").innerHTML = items.join("");
}

function renderDdayCards(r) {
  const html = DDAY_KEYS.map((key) => {
    const d = r.cascade[key];
    return `
      <div class="dday-card">
        <div class="dday-card-head">
          <div class="dday-badge">${key}</div>
          <div class="dday-phase">${DDAY_PHASE[key]}</div>
        </div>
        <div class="dday-desc">${d.desc}</div>
        <div class="dday-metric">
          <div class="dday-metric-label">생산손실</div>
          <div class="dday-metric-value loss">${fmt(d.total_prod_loss)}조원</div>
        </div>
        <div class="dday-metric">
          <div class="dday-metric-label">고용위협</div>
          <div class="dday-metric-value emp">${Math.round(d.total_emp_loss).toLocaleString("ko-KR")}명</div>
        </div>
      </div>`;
  }).join("");
  document.getElementById("dday-cards").innerHTML = html;
}

const MOBILE_INDUSTRY_LIMIT = 8;

function renderIndustryList(r) {
  const full = [...r.sector_impacts]; // 이미 내림차순 정렬됨
  const maxVal = full.length ? full[0].prod_loss : 1;
  document.getElementById("industry-meta").textContent =
    `${r.mineral.replace(/\s*\(.*\)/, "")} 기준 · ${full.length}개 산업 섹터`;

  const isMobile = window.innerWidth <= 860;
  const data = (isMobile && !state.industryExpanded) ? full.slice(0, MOBILE_INDUSTRY_LIMIT) : full;

  document.getElementById("industry-list").innerHTML = data.map((d) => {
    const widthPct = Math.max(4, (d.prod_loss / maxVal) * 100).toFixed(0);
    return `
      <div class="industry-row">
        <div class="industry-name">${d.sector}</div>
        <div class="industry-track"><div class="industry-bar" style="width:${widthPct}%"></div></div>
        <div class="industry-value">${fmt(d.prod_loss)}조</div>
      </div>`;
  }).join("");

  const toggleBtn = document.getElementById("industry-toggle-btn");
  if (isMobile && full.length > MOBILE_INDUSTRY_LIMIT) {
    toggleBtn.hidden = false;
    toggleBtn.textContent = state.industryExpanded
      ? "접기"
      : `전체 ${full.length}개 보기`;
  } else {
    toggleBtn.hidden = true;
  }
}

function renderKomis() {
  if (!state.komis.length) return;
  const series = state.komis.map((d) => Number(d["희소금속지수"]));
  const maxK = Math.max(...series);
  const minK = Math.min(...series);
  const points = series.map((v, i) => {
    const x = (i / (series.length - 1)) * 600;
    const y = 160 - ((v - minK) / (maxK - minK || 1)) * 140 - 10;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  document.getElementById("komis-line").setAttribute("points", points);

  const first = state.komis[0];
  const last = state.komis[state.komis.length - 1];
  const stats = [
    ["희소금속지수", first["희소금속지수"], last["희소금속지수"], "var(--danger)"],
    ["광물종합지수", first["광물종합지수"], last["광물종합지수"], "var(--warning)"],
    ["메이저금속지수", first["메이저금속지수"], last["메이저금속지수"], "var(--accent)"],
  ];
  document.getElementById("komis-stats").innerHTML = stats.map(([label, start, end, color]) => `
    <div class="komis-stat" style="border-left-color:${color}">
      <div class="komis-stat-label">${label}</div>
      <div class="komis-stat-value" style="color:${color}">${fmtPct((end / start - 1) * 100)}</div>
    </div>`).join("");
}

// ── 로그인 / 로그아웃 (더미 인증 — 실제 계정 검증 없음) ─────
function showDashboard() {
  document.getElementById("login-screen").hidden = true;
  document.getElementById("app-shell").hidden = false;
}
function showLogin() {
  document.getElementById("login-screen").hidden = false;
  document.getElementById("app-shell").hidden = true;
  document.getElementById("login-id").value = "";
  document.getElementById("login-pw").value = "";
}

function setupAuth() {
  document.getElementById("login-form").addEventListener("submit", (e) => {
    e.preventDefault();
    sessionStorage.setItem("ksupply_logged_in", "1");
    showDashboard();
  });
  const doLogout = () => {
    sessionStorage.removeItem("ksupply_logged_in");
    showLogin();
  };
  document.getElementById("logout-btn").addEventListener("click", doLogout);
  document.getElementById("logout-icon-btn").addEventListener("click", doLogout);

  if (sessionStorage.getItem("ksupply_logged_in") === "1") showDashboard();
  else showLogin();
}

function startClock() {
  const el = document.getElementById("top-clock");
  const tick = () => {
    el.textContent = new Date().toLocaleString("ko-KR", {
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
    });
  };
  tick();
  setInterval(tick, 1000);
}

// ── 뷰 전환 (① 충격 시뮬레이션 / ② 비축 조달 / ③ 시나리오 비교) ──
// 데스크톱 상단 탭(#view-tabs)과 모바일 하단 탭바(#mobile-tabbar) 둘 다 같은 방식으로 처리
function setupViewTabs() {
  const onTabClick = (e) => {
    const btn = e.target.closest("[data-view]");
    if (!btn) return;
    switchView(btn.dataset.view);
  };
  document.getElementById("view-tabs").addEventListener("click", onTabClick);
  document.getElementById("mobile-tabbar").addEventListener("click", onTabClick);
}
function switchView(view) {
  state.activeView = view;
  document.querySelectorAll("#view-tabs button, #mobile-tabbar button").forEach((btn) => {
    const isActive = btn.dataset.view === view;
    btn.classList.toggle("active", isActive);
    btn.setAttribute("aria-current", String(isActive));
  });
  document.getElementById("view-simulate").hidden = view !== "simulate";
  document.getElementById("view-stockpile").hidden = view !== "stockpile";
  document.getElementById("view-compare").hidden = view !== "compare";
  if (view === "stockpile" && state.mineralKey) runStockpile();
  updatePrintHeader();
}

// ── ② 시나리오 비교 ───────────────────────────────────────
function setupCompareView(minerals) {
  minerals.forEach((m) => state.compareChecked.add(m.key));

  const checksEl = document.getElementById("compare-checks");
  checksEl.innerHTML = minerals.map((m) => {
    const shortName = m.key.replace(/\s*\(.*\)/, "");
    const accent = MINERAL_ACCENTS[m.key] || "#246beb";
    return `
      <label class="compare-check checked" data-key="${m.key}">
        <input type="checkbox" checked>
        <span class="dot" style="background:${accent}"></span>${shortName}
      </label>`;
  }).join("");

  checksEl.addEventListener("change", (e) => {
    const label = e.target.closest(".compare-check");
    if (!label) return;
    const key = label.dataset.key;
    if (e.target.checked) state.compareChecked.add(key);
    else state.compareChecked.delete(key);
    label.classList.toggle("checked", e.target.checked);
    runCompare();
  });

  const pctRange = document.getElementById("compare-pct-range");
  pctRange.addEventListener("input", (e) => {
    state.comparePct = Number(e.target.value);
    document.getElementById("compare-pct-value").textContent = `${state.comparePct}%`;
    runCompare();
  });

  runCompare();
}

async function runCompare() {
  const keys = [...state.compareChecked];
  if (!keys.length) {
    document.getElementById("compare-bars").innerHTML = "";
    document.getElementById("compare-table").innerHTML = "";
    document.getElementById("compare-meta").textContent = "";
    return;
  }
  document.getElementById("compare-meta").textContent = `공급 제한 ${state.comparePct}% 공통 적용 · ${keys.length}개 광물`;

  const results = await Promise.all(keys.map((key) => {
    const params = new URLSearchParams({ mineral: key, restriction_pct: state.comparePct });
    return fetchJSON(`${API}/api/simulate?${params}`);
  }));
  results.sort((a, b) => b.total_prod - a.total_prod);

  const maxVal = results.length ? results[0].total_prod : 1;
  document.getElementById("compare-bars").innerHTML = results.map((r) => {
    const accent = MINERAL_ACCENTS[r.mineral] || "#246beb";
    const shortName = r.mineral.replace(/\s*\(.*\)/, "");
    const widthPct = Math.max(4, (r.total_prod / maxVal) * 100).toFixed(0);
    return `
      <div class="industry-row">
        <div class="industry-name">${shortName}</div>
        <div class="industry-track"><div class="industry-bar" style="width:${widthPct}%; background:${accent}"></div></div>
        <div class="industry-value">${fmt(r.total_prod)}조</div>
      </div>`;
  }).join("");

  document.getElementById("compare-table").innerHTML = `
    <thead>
      <tr>
        <th>광물</th><th style="text-align:right">직접충격</th><th style="text-align:right">총생산손실</th>
        <th style="text-align:right">총고용위협</th><th style="text-align:right">배수</th><th>위험도</th>
      </tr>
    </thead>
    <tbody>
      ${results.map((r) => {
        const accent = MINERAL_ACCENTS[r.mineral] || "#246beb";
        const shortName = r.mineral.replace(/\s*\(.*\)/, "");
        return `
          <tr>
            <td><span class="mineral-cell"><span class="dot" style="background:${accent}"></span>${shortName}</span></td>
            <td class="num">${fmt(r.shock_trillion)}조원</td>
            <td class="num">${fmt(r.total_prod)}조원</td>
            <td class="num">${Math.round(r.total_emp).toLocaleString("ko-KR")}명</td>
            <td class="num">${fmt(r.multiplier, 1)}배</td>
            <td><span class="risk-badge ${r.risk_level}">${r.risk_level}</span></td>
          </tr>`;
      }).join("")}
    </tbody>`;

  // 모바일: 표 대신 세로 카드 리스트
  document.getElementById("compare-cards").innerHTML = results.map((r) => {
    const accent = MINERAL_ACCENTS[r.mineral] || "#246beb";
    const shortName = r.mineral.replace(/\s*\(.*\)/, "");
    return `
      <div class="compare-card">
        <div class="compare-card-head">
          <span class="dot" style="background:${accent}"></span>
          <span class="name">${shortName}</span>
          <span class="risk-badge ${r.risk_level}">${r.risk_level}</span>
        </div>
        <div class="compare-card-grid">
          <div><div class="cc-label">직접충격</div><div class="cc-value">${fmt(r.shock_trillion)}조원</div></div>
          <div><div class="cc-label">총생산손실</div><div class="cc-value">${fmt(r.total_prod)}조원</div></div>
          <div><div class="cc-label">총고용위협</div><div class="cc-value">${Math.round(r.total_emp).toLocaleString("ko-KR")}명</div></div>
          <div><div class="cc-label">배수</div><div class="cc-value">${fmt(r.multiplier, 1)}배</div></div>
        </div>
      </div>`;
  }).join("");

  state.compareResults = results;
  updatePrintHeader();
}

// ── 리포트 저장 (브라우저 인쇄 → PDF로 저장) ──────────────
// 양식 출처: 재시험_관련_방안_조사_보고-0506_수정.hwp
// (제목 그라데이션 배너 + □/◦ 불릿 위계 + 라벤더 헤더 표)
function setupReportButton() {
  document.getElementById("report-btn").addEventListener("click", () => {
    updatePrintHeader();
    window.print();
  });
}

function todayStr() {
  return new Date().toISOString().slice(0, 10).replace(/-/g, ".");
}

function updatePrintHeader() {
  if (state.activeView === "compare" && state.compareResults) {
    renderPrintReportCompare();
  } else if (state.activeView === "stockpile" && state.stockpileResult) {
    renderPrintReportStockpile();
  } else if (state.simResult) {
    renderPrintReportSimulate();
  }
}

function riskDesc(level) {
  return level === "HIGH" ? "즉각 대응 필요"
    : level === "MEDIUM" ? "선제적 대응 권고"
    : "안정적 관리 가능";
}

function renderPrintReportSimulate() {
  const r = state.simResult;
  const shortName = r.mineral.replace(/\s*\(.*\)/, "");
  document.getElementById("report-title").textContent = `${shortName} 공급망 충격 시뮬레이션 보고`;
  document.getElementById("report-meta").textContent = `- 출력일 ${todayStr()}, K-Supply Shield 시뮬레이터 -`;

  const cascadeRows = DDAY_KEYS.map((key) => {
    const d = r.cascade[key];
    return `<tr><td>${key}</td><td class="left">${d.label}</td><td class="left">${d.desc}</td><td>${fmt(d.total_prod_loss)}조원</td><td>${Math.round(d.total_emp_loss).toLocaleString("ko-KR")}명</td></tr>`;
  }).join("");

  const allIndustries = [...r.sector_impacts];
  const industryRows = allIndustries.map((d, i) =>
    `<tr><td>${i + 1}</td><td class="left">${d.sector}</td><td>${fmt(d.prod_loss)}조원</td></tr>`
  ).join("");
  const topIndustryName = allIndustries[0]?.sector || "-";

  const komisMonthRows = state.komis.map((d) =>
    `<tr><td>${d["연월"]}</td><td>${fmt(d["광물종합지수"], 1)}</td><td>${fmt(d["메이저금속지수"], 1)}</td><td>${fmt(d["희소금속지수"], 1)}</td></tr>`
  ).join("");
  const first = state.komis[0];
  const last = state.komis[state.komis.length - 1];

  document.getElementById("report-body").innerHTML = `
    <!-- ══════ 요약 (1p) ══════ -->
    <div class="report-section">
      <div class="report-h1">시뮬레이션 개요</div>
      <table class="report-table">
        <tr><th style="width:22%">대상 광물</th><td class="left">${r.mineral}</td></tr>
        <tr><th>공급 제한 비율</th><td class="left">${r.restriction_pct}%</td></tr>
        <tr><th>연간 수입 규모</th><td class="left">${fmt(r.korea_import_bn / 10000)}조원 (${r.korea_import_bn.toLocaleString("ko-KR")}억원)</td></tr>
        <tr><th>공급망 위험도</th><td class="left">${r.risk_level}</td></tr>
      </table>
    </div>

    <div class="report-section">
      <div class="report-h1">핵심 지표 요약</div>
      <table class="report-table">
        <thead><tr><th>구분</th><th>값</th><th>설명</th></tr></thead>
        <tbody>
          <tr><td class="left">직접 수입 충격</td><td>${fmt(r.shock_trillion)}조원</td><td class="left">${shortName} 수입 기준 즉시 손실</td></tr>
          <tr><td class="left">총 생산 파급 손실</td><td>${fmt(r.total_prod)}조원</td><td class="left">전후방 산업 연쇄 파급 (D+40 기준)</td></tr>
          <tr><td class="left">총 고용 위협</td><td>${Math.round(r.total_emp).toLocaleString("ko-KR")}명</td><td class="left">관련 산업 종사자 기준</td></tr>
          <tr><td class="left">생산유발 배수</td><td>${fmt(r.multiplier, 1)}배</td><td class="left">레온티에프 역행렬 기반</td></tr>
        </tbody>
      </table>
    </div>

    <div class="report-section">
      <div class="report-h1">종합 시사점</div>
      <div class="report-h2">${shortName} 공급이 ${r.restriction_pct}% 제한될 경우, D+40 시점까지 누적 생산 파급 손실 ${fmt(r.total_prod)}조원, 고용 위협 ${Math.round(r.total_emp).toLocaleString("ko-KR")}명 발생이 추정됨</div>
      <div class="report-h2">공급망 위험도는 <b>${r.risk_level}</b> 수준으로 평가되며, ${riskDesc(r.risk_level)}</div>
      <div class="report-h2">파급 영향이 가장 큰 산업은 <b>${topIndustryName}</b>이며, 전후방 연쇄 효과가 집중됨</div>
    </div>

    <div class="report-appendix-list">
      <span class="label">별첨:</span> 1. 공급망 충격 전파 상세 현황<br>
      &nbsp;&nbsp;&nbsp;&nbsp;2. 산업별 생산 파급 손실 상세 (전체 ${allIndustries.length}개 섹터)<br>
      &nbsp;&nbsp;&nbsp;&nbsp;3. KOMIS 광물종합지수 월별 동향
    </div>
    <div class="report-footer-page">- 1 -</div>

    <!-- ══════ 별첨 1 ══════ -->
    <div class="report-page-break">
      <div class="appendix-label"><div class="appendix-tag">별첨 1</div><div class="appendix-title">공급망 충격 전파 상세 현황</div></div>
      <div class="report-section">
        <table class="report-table">
          <thead><tr><th>시점</th><th>단계</th><th>내용</th><th>생산손실</th><th>고용위협</th></tr></thead>
          <tbody>${cascadeRows}</tbody>
        </table>
      </div>
      <div class="report-footer-page">- 2 -</div>
    </div>

    <!-- ══════ 별첨 2 ══════ -->
    <div class="report-page-break">
      <div class="appendix-label"><div class="appendix-tag">별첨 2</div><div class="appendix-title">산업별 생산 파급 손실 상세</div></div>
      <div class="report-section">
        <table class="report-table">
          <thead><tr><th>순위</th><th>산업</th><th>생산손실</th></tr></thead>
          <tbody>${industryRows}</tbody>
        </table>
      </div>
      <div class="report-footer-page">- 3 -</div>
    </div>

    <!-- ══════ 별첨 3 ══════ -->
    <div class="report-page-break">
      <div class="appendix-label"><div class="appendix-tag">별첨 3</div><div class="appendix-title">KOMIS 광물종합지수 월별 동향</div></div>
      <div class="report-section">
        <table class="report-table">
          <thead><tr><th>연월</th><th>광물종합지수</th><th>메이저금속지수</th><th>희소금속지수</th></tr></thead>
          <tbody>${komisMonthRows}</tbody>
        </table>
        <div class="report-h2">희소금속지수 12개월 변화율: ${first ? fmtPct((last["희소금속지수"] / first["희소금속지수"] - 1) * 100) : "-"}</div>
      </div>
      <div class="report-footer-page">- 4 -</div>
    </div>
  `;
}

function renderPrintReportCompare() {
  const results = state.compareResults;
  document.getElementById("report-title").textContent = "핵심광물 공급 시나리오 비교 보고";
  document.getElementById("report-meta").textContent = `- 출력일 ${todayStr()}, K-Supply Shield 시뮬레이터 -`;

  const top5 = results.slice(0, 5);
  const summaryRows = top5.map((r, i) => {
    const shortName = r.mineral.replace(/\s*\(.*\)/, "");
    return `<tr><td>${i + 1}</td><td class="left">${shortName}</td><td>${fmt(r.total_prod)}조원</td><td>${r.risk_level}</td></tr>`;
  }).join("");

  const allRows = results.map((r, i) => {
    const shortName = r.mineral.replace(/\s*\(.*\)/, "");
    return `<tr>
      <td>${i + 1}</td><td class="left">${shortName}</td>
      <td>${fmt(r.shock_trillion)}조원</td><td>${fmt(r.total_prod)}조원</td>
      <td>${Math.round(r.total_emp).toLocaleString("ko-KR")}명</td>
      <td>${fmt(r.multiplier, 1)}배</td><td>${r.risk_level}</td>
    </tr>`;
  }).join("");

  const worst = results[0];
  const worstName = worst ? worst.mineral.replace(/\s*\(.*\)/, "") : "-";
  const highCount = results.filter((r) => r.risk_level === "HIGH").length;

  document.getElementById("report-body").innerHTML = `
    <!-- ══════ 요약 (1p) ══════ -->
    <div class="report-section">
      <div class="report-h1">비교 개요</div>
      <table class="report-table">
        <tr><th style="width:22%">공통 공급 제한 비율</th><td class="left">${state.comparePct}%</td></tr>
        <tr><th>비교 대상 광물 수</th><td class="left">${results.length}개</td></tr>
      </table>
    </div>

    <div class="report-section">
      <div class="report-h1">상위 5개 광물 (총 생산 파급 손실 순)</div>
      <table class="report-table">
        <thead><tr><th>순위</th><th>광물</th><th>총생산손실</th><th>위험도</th></tr></thead>
        <tbody>${summaryRows}</tbody>
      </table>
    </div>

    <div class="report-section">
      <div class="report-h1">종합 시사점</div>
      <div class="report-h2">공급 제한 ${state.comparePct}% 동일 적용 시, <b>${worstName}</b>의 생산 파급 손실이 가장 크게 나타남</div>
      <div class="report-h2">비교 대상 ${results.length}개 광물 중 <b>${highCount}개</b>가 위험도 HIGH로 분류됨</div>
    </div>

    <div class="report-appendix-list">
      <span class="label">별첨:</span> 1. 광물별 시나리오 상세 비교표 (전체 ${results.length}개)
    </div>
    <div class="report-footer-page">- 1 -</div>

    <!-- ══════ 별첨 1 ══════ -->
    <div class="report-page-break">
      <div class="appendix-label"><div class="appendix-tag">별첨 1</div><div class="appendix-title">광물별 시나리오 상세 비교표</div></div>
      <div class="report-section">
        <table class="report-table">
          <thead>
            <tr><th>순위</th><th>광물</th><th>직접충격</th><th>총생산손실</th><th>총고용위협</th><th>배수</th><th>위험도</th></tr>
          </thead>
          <tbody>${allRows}</tbody>
        </table>
      </div>
      <div class="report-footer-page">- 2 -</div>
    </div>
  `;
}

function renderPrintReportStockpile() {
  const s = state.stockpileResult;
  const t = s.thresholds;
  const shortName = state.mineralKey.replace(/\s*\(.*\)/, "");
  document.getElementById("report-title").textContent = `${shortName} 비축 조달 의사결정 보고`;
  document.getElementById("report-meta").textContent = `- 출력일 ${todayStr()}, K-Supply Shield 시뮬레이터 -`;

  const signalText = {
    RED: "위험 — 즉각 비축 확충", YELLOW_CAUTION: "주의 — 비축 확대 권고",
    YELLOW_GOOD: "양호 — 전략 비축 검토", GREEN: "안전 — 현재 비축 충분",
  }[t.signal];

  const priorityRows = s.priority.map((p) =>
    `<tr><td>${p.rank}</td><td class="left">${p.industry}</td><td>${fmt(p.prod_loss, 3)}조원</td><td>${Math.round(p.emp_loss).toLocaleString("ko-KR")}명</td><td>${fmt(p.score, 2)}</td></tr>`
  ).join("");

  const optionRows = RADAR_OPTIONS.map((o) =>
    `<tr><td class="left">${o.name}</td>${o.scores.map((v) => `<td>${v}</td>`).join("")}</tr>`
  ).join("");

  document.getElementById("report-body").innerHTML = `
    <div class="report-section">
      <div class="report-h1">비축 조달 개요</div>
      <table class="report-table">
        <tr><th style="width:22%">대상 광물</th><td class="left">${state.mineralKey}</td></tr>
        <tr><th>현재 비축 재고</th><td class="left">${state.stockDays}일 · 일일소비 ${state.dailyCons.toLocaleString("ko-KR")} MT · 방출비율 ${state.releasePct}%</td></tr>
        <tr><th>공급 제한 비율</th><td class="left">${state.restrictionPct}%</td></tr>
        <tr><th>비축 안전 신호</th><td class="left">${signalText}</td></tr>
      </table>
    </div>

    <div class="report-section">
      <div class="report-h1">핵심 지표 요약</div>
      <table class="report-table">
        <thead><tr><th>구분</th><th>값</th></tr></thead>
        <tbody>
          <tr><td class="left">${state.targetDays}일 버티기 필요 비축량</td><td>${Math.round(s.needed_stock).toLocaleString("ko-KR")} MT</td></tr>
          <tr><td class="left">현재 방출 가능 비축량</td><td>${Math.round(s.usable_stock).toLocaleString("ko-KR")} MT</td></tr>
          <tr><td class="left">현재 비축 커버 가능 기간</td><td>${Math.round(s.coverage_days)}일</td></tr>
          <tr><td class="left">추가 확보 필요량</td><td>${Math.round(s.shortage).toLocaleString("ko-KR")} MT</td></tr>
          <tr><td class="left">부족분 긴급수입 비용(추정)</td><td>${Math.round(s.emergency_cost).toLocaleString("ko-KR")} 억원</td></tr>
        </tbody>
      </table>
    </div>

    <div class="report-section">
      <div class="report-h1">종합 시사점</div>
      <div class="report-h2">비축 안전 신호는 <b>${signalText}</b> 상태로 평가됨</div>
      <div class="report-h2">권고 전략: ${s.recommendation.text}</div>
    </div>

    <div class="report-appendix-list">
      <span class="label">별첨:</span> 1. 방출 우선순위 산업 상세 (상위 ${s.priority.length}개)<br>
      &nbsp;&nbsp;&nbsp;&nbsp;2. 대체 조달 전략별 평가 점수
    </div>
    <div class="report-footer-page">- 1 -</div>

    <div class="report-page-break">
      <div class="appendix-label"><div class="appendix-tag">별첨 1</div><div class="appendix-title">방출 우선순위 산업 상세</div></div>
      <div class="report-section">
        <table class="report-table">
          <thead><tr><th>순위</th><th>산업</th><th>생산손실</th><th>고용손실</th><th>종합점수</th></tr></thead>
          <tbody>${priorityRows}</tbody>
        </table>
      </div>
      <div class="report-footer-page">- 2 -</div>
    </div>

    <div class="report-page-break">
      <div class="appendix-label"><div class="appendix-tag">별첨 2</div><div class="appendix-title">대체 조달 전략별 평가 점수</div></div>
      <div class="report-section">
        <table class="report-table">
          <thead><tr><th>전략</th>${RADAR_CATEGORIES.map((c) => `<th>${c}</th>`).join("")}</tr></thead>
          <tbody>${optionRows}</tbody>
        </table>
      </div>
      <div class="report-footer-page">- 3 -</div>
    </div>
  `;
}

// ── 모바일 바텀시트 (광물 칩 탭 → 시뮬레이션 조건 설정 열기) ──
function setupMobileDrawer() {
  const sidebar = document.getElementById("sidebar");
  const backdrop = document.getElementById("sidebar-backdrop");
  const openBtn = document.getElementById("mineral-chip-trigger");
  const closeBtn = document.getElementById("sidebar-close-btn");
  const applyBtn = document.getElementById("sidebar-apply-btn");

  const openDrawer = () => {
    sidebar.classList.add("open");
    backdrop.classList.add("open");
    openBtn.setAttribute("aria-expanded", "true");
  };
  const closeDrawer = () => {
    sidebar.classList.remove("open");
    backdrop.classList.remove("open");
    openBtn.setAttribute("aria-expanded", "false");
  };

  openBtn.addEventListener("click", openDrawer);
  closeBtn.addEventListener("click", closeDrawer);
  applyBtn.addEventListener("click", closeDrawer);
  backdrop.addEventListener("click", closeDrawer);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeDrawer(); });

  // 광물 선택 시 모바일에서는 바텀시트 자동 닫기 (본문 결과를 바로 볼 수 있도록)
  document.getElementById("mineral-list").addEventListener("click", () => {
    if (window.innerWidth <= 860) closeDrawer();
  });
}

setupMobileDrawer();
setupAuth();
startClock();
init();
