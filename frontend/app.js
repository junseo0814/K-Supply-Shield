// K-CESS — Tab1 (충격 시뮬레이션) 프론트엔드 로직
// 시각 언어는 디자인 목업(design_handoff_ksupply_shield)을 이식, 데이터/계산은 실제 백엔드 API 사용.
const API = "";

// 탭 전환이 실제 브라우저 풀 네비게이션(페이지 새로고침)이라, 광물/파라미터 선택값을
// 세션스토리지에 저장해뒀다가 다음 페이지 로드 시 복원한다 (탭 이동할 때마다 초기화되지 않도록).
const PARAM_KEYS = ["mineralKey", "restrictionPct", "importTrillion", "stockDays", "dailyCons", "releasePct", "importCost", "targetDays"];
function saveParams() {
  const data = {};
  PARAM_KEYS.forEach((k) => { data[k] = state[k]; });
  sessionStorage.setItem("ksupply_params", JSON.stringify(data));
}
function loadParams() {
  try {
    return JSON.parse(sessionStorage.getItem("ksupply_params"));
  } catch {
    return null;
  }
}

// 광물별 포인트 컬러 (디자인 리뉴얼 목업의 oklch(0.56 0.14 {hue}) 값을 sRGB hex로 변환).
// oklch() 원본을 그대로 쓰지 않는 이유: 일부 브라우저에서 특정 hue가 채도를 잃고
// 회색으로 렌더링되는 문제가 있어 발표 환경 호환성을 위해 표준 hex로 고정.
const MINERAL_ACCENTS = {
  "흑연 (Graphite)": "#2378c2",
  "리튬 (Lithium)": "#b84c51",
  "코발트 (Cobalt)": "#4b70c6",
  "니켈 (Nickel)": "#218a45",
  "망간 (Manganese)": "#885cb5",
  "희토류 (Rare Earths)": "#9a6b00",
  "텅스텐 (Tungsten)": "#008a9b",
  "게르마늄 (Germanium)": "#8338ec",
  "갈륨 (Gallium)": "#c9184a",
};
// 위 accent보다 어두운 톤 (oklch(0.4 0.15 {hue})) — 흰 배경 위 강조 텍스트용 (WCAG AA 대비 확보)
const MINERAL_ACCENTS_DARK = {
  "흑연 (Graphite)": "#004794",
  "리튬 (Lithium)": "#860f23",
  "코발트 (Cobalt)": "#1e3f97",
  "니켈 (Nickel)": "#005c0f",
  "망간 (Manganese)": "#5b2987",
  "희토류 (Rare Earths)": "#6b3c00",
  "텅스텐 (Tungsten)": "#005a6d",
  "게르마늄 (Germanium)": "#5a1fb0",
  "갈륨 (Gallium)": "#8a0f36",
};

const state = {
  minerals: {},
  mineralKey: null,
  restrictionPct: 30,
  importTrillion: 0, // 사이드바 표시 단위: 조원
  komis: [],
  comtrade: [], // UN Comtrade 對중국 수입 세부내역 (리포트 별첨 전용)
  customsSnapshot: [], // 관세청 API 스냅샷 (scripts/refresh_customs_snapshot.py로 갱신)
  kotraNews: null, // KOTRA 단신속보뉴스 — 대시보드 첫 진입 시 지연 로딩
  publications: [], // data/publications.csv 직접 편집 관리
  reportTeasers: [], // data/report_teasers.csv 직접 편집 관리
  ddayIdx: 2, // 0=D+7, 1=D+18, 2=D+40
  simResult: null,
  activeView: "dashboard",
  compareChecked: new Set(),
  comparePct: 50,
  stockDays: 45,
  dailyCons: 500,
  releasePct: 50,
  importCost: 0.5,
  targetDays: 45,
  stockpileResult: null,
  industryExpanded: false, // 모바일: 산업별 파급 손실 목록 전체 펼침 여부
  dashboardScan: null, // 실시간 관제 — 9개 광물 전체 자동 스캔 결과 (loadDashboardScan)

  // 충격 시뮬레이터 좌측 패널 — ②충격유형/④지속기간/⑤대상국가 (분류·기록용, 레온티에프 계산에는 영향 없음)
  simShockType: "export",
  simDuration: "6",
  simCountries: { china: true, congo: true, chile: false, australia: false, philippines: false, indonesia: false, other: false },
  simRunning: false,
  simRanAt: null,

  // 비축·조달 탭 상태
  procTab: "stock",
  procMineral: null,
  procQty: 0,
  procMethod: "emergency",
  procBudget: 50,
  procDeadline: "30",
  procRisk: "medium",
  matrixMineralFilter: "all",
  matrixRiskFilter: "all",
  matrixData: null,

  // 시나리오 비교 (A/B/C)
  scenSelected: { A: true, B: true, C: true },
  scenarioResults: null,
};

// prob(발동확률)은 USGS 확률가중 GDP손실모델 방법론을 참고한 예시치 — 실제 발동확률
// 추정은 정교한 통계모형이 필요하므로, 여기서는 최근 실제 동향(중국 수출통제 상시화 등)을
// 반영한 시연용 근사값을 사용한다.
const SCENARIO_DEFS = [
  { key: "A", label: "시나리오 A", mineralKey: "희토류 (Rare Earths)", pct: 70, color: "#1B2556", shockLabel: "중국 희토류 수출통제", prob: 35 },
  { key: "B", label: "시나리오 B", mineralKey: "니켈 (Nickel)", pct: 50, color: "#007AFF", shockLabel: "인도네시아 물류 리스크", prob: 18 },
  { key: "C", label: "시나리오 C", mineralKey: "코발트 (Cobalt)", pct: 80, color: "#E67E22", shockLabel: "DRC 코발트 공급 중단", prob: 22 },
];

const PROC_METHODS = [
  { key: "emergency", label: "긴급 현물" }, { key: "longterm", label: "장기 계약" },
  { key: "futures", label: "선물 계약" }, { key: "pooled", label: "공동 비축" },
];
const PROC_RISK_LEVELS = [{ key: "low", label: "Low" }, { key: "medium", label: "Medium" }, { key: "high", label: "High" }];
const MATRIX_OWNERS = ["김민준", "이서연", "박도윤", "최지우", "정하은", "한서준", "오하윤"]; // MOCK — 실제 담당자 배정 시스템 부재로 임시 배정
const MOCK_PROC_HISTORY = [
  { date: "2026-07-25", mineral: "리튬 (Lithium)", action: "조달 발주", qty: 800, owner: "이서연", status: "완료" },
  { date: "2026-07-22", mineral: "코발트 (Cobalt)", action: "긴급 조달", qty: 300, owner: "김민준", status: "진행중" },
  { date: "2026-07-18", mineral: "니켈 (Nickel)", action: "입고", qty: 1200, owner: "최지우", status: "완료" },
  { date: "2026-07-14", mineral: "희토류 (Rare Earths)", action: "장기 계약 체결", qty: 500, owner: "박도윤", status: "완료" },
  { date: "2026-07-09", mineral: "흑연 (Graphite)", action: "입고", qty: 2000, owner: "정하은", status: "완료" },
  { date: "2026-07-03", mineral: "코발트 (Cobalt)", action: "조달 발주", qty: 400, owner: "김민준", status: "지연" },
]; // MOCK DATA — 실 조달 이력 시스템 연동 필요

const SHOCK_TYPES = [
  { key: "export", label: "수출 규제 (중국/콩고 등 주요국)" },
  { key: "logistics", label: "물류 차단 (항만 봉쇄, 운임 급등)" },
  { key: "disaster", label: "자연재해 (광산 사고, 기후)" },
  { key: "geopolitical", label: "지정학적 분쟁" },
  { key: "compound", label: "복합 충격" },
];
const DURATIONS = ["1", "3", "6", "12", "24"];
const DURATION_DDAY_MAP = { "1": 0, "3": 0, "6": 1, "12": 2, "24": 2 };
const SIM_COUNTRIES = [
  { key: "china", label: "중국" }, { key: "congo", label: "콩고" }, { key: "chile", label: "칠레" },
  { key: "australia", label: "호주" }, { key: "philippines", label: "필리핀" },
  { key: "indonesia", label: "인도네시아" }, { key: "other", label: "기타" },
];

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
  const [minerals, komis, comtrade, customsSnapshot, publications, reportTeasers] = await Promise.all([
    fetchJSON(`${API}/api/minerals`),
    fetchJSON(`${API}/api/komis`),
    fetchJSON(`${API}/api/comtrade`),
    fetchJSON(`${API}/api/customs-snapshot`),
    fetchJSON(`${API}/api/publications`),
    fetchJSON(`${API}/api/report-teasers`),
  ]);

  minerals.forEach((m) => { state.minerals[m.key] = m; });
  state.komis = komis;
  state.comtrade = comtrade;
  state.customsSnapshot = customsSnapshot;
  state.publications = publications;
  state.reportTeasers = reportTeasers;

  setupMineralDropdown(minerals);
  setupViewTabs();
  setupCompareView(minerals);
  setupReportButton();
  setupSimulatorPanel();

  document.getElementById("restriction-range").addEventListener("input", (e) => {
    state.restrictionPct = Number(e.target.value);
    document.getElementById("restriction-value").textContent = `${state.restrictionPct}%`;
    e.target.setAttribute("aria-valuetext", `${state.restrictionPct}%`);
    updatePreview();
    updateIntensityLabel();
    flashHeaderIfHigh();
    saveParams();
  });

  document.getElementById("import-input").addEventListener("input", (e) => {
    state.importTrillion = Number(e.target.value) || 0;
    updatePreview();
    saveParams();
  });

  document.getElementById("dday-select").addEventListener("click", (e) => {
    const idx = e.target.dataset.idx;
    if (idx === undefined) return;
    state.ddayIdx = Number(idx);
    renderDomino();
    renderDdaySelect();
  });

  document.getElementById("industry-toggle-btn").addEventListener("click", () => {
    state.industryExpanded = !state.industryExpanded;
    if (state.simResult) renderIndustryList(state.simResult);
  });

  setupStockpileView();
  setupLandingCarousel();
  setupDashboard();
  setupReportsView();
  setupProcurementView();
  setupScenarioView();

  const persisted = loadParams();
  selectMineral((persisted && state.minerals[persisted.mineralKey]) ? persisted.mineralKey : minerals[0].key);
  if (persisted) {
    state.restrictionPct = persisted.restrictionPct;
    state.importTrillion = persisted.importTrillion;
    document.getElementById("restriction-range").value = state.restrictionPct;
    document.getElementById("restriction-value").textContent = `${state.restrictionPct}%`;
    document.getElementById("import-input").value = state.importTrillion;
    updatePreview();
    updateIntensityLabel();
  }
  renderKomis();
  const initialView = PATH_VIEWS[window.location.pathname] || "dashboard";
  switchView(initialView);
}

// ── ② 비축 조달 의사결정 ──────────────────────────────────
function setupStockpileView() {
  // 비축·조달 화면 전용 컨트롤은 setupProcurementView()에서 구성한다 (④ 비축·조달 재건축).
}

async function runStockpile() {
  if (!state.mineralKey) return;
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
  if (state.simResult) { renderSimKpiGrid(state.simResult); renderSimInsightPanel(state.simResult); }
}

function renderStockpile(s) {
  const shortName = state.mineralKey.replace(/\s*\(.*\)/, "");
  document.getElementById("stockpile-summary").textContent =
    `현재 설정: ${shortName} · 비축 ${state.stockDays}일 | 일일소비 ${state.dailyCons.toLocaleString("ko-KR")} MT | 방출비율 ${state.releasePct}% | 공급차질 ${state.restrictionPct}%`;

  renderStockpileA(s);
  renderStockpileB(s);
  renderStockpileC(s);
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

// ── ③ 비축·조달 의사결정 도구 (4탭: 비축현황 / 조달시뮬레이션 / 의사결정매트릭스 / 이력관리) ──
function setupProcurementView() {
  state.procMineral = Object.keys(state.minerals)[0] || null;

  document.getElementById("proc-tabs").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-proctab]");
    if (!btn) return;
    setProcTab(btn.dataset.proctab);
  });

  document.getElementById("stock-card-grid").addEventListener("click", (e) => {
    const key = e.target.closest("[data-mineral]")?.dataset.mineral;
    if (!key) return;
    state.procMineral = key;
    setProcTab("sim");
    const sel = document.getElementById("proc-mineral-select");
    if (sel) sel.value = key;
    runProcSim();
  });

  setupProcSimTab();

  const mineralFilter = document.getElementById("matrix-mineral-filter");
  Object.keys(state.minerals).forEach((key) => {
    const opt = document.createElement("option");
    opt.value = key;
    opt.textContent = key.replace(/\s*\(.*\)/, "");
    mineralFilter.appendChild(opt);
  });
  mineralFilter.addEventListener("change", (e) => { state.matrixMineralFilter = e.target.value; renderMatrixTable(); });
  document.getElementById("matrix-risk-filter").addEventListener("change", (e) => { state.matrixRiskFilter = e.target.value; renderMatrixTable(); });
  document.getElementById("matrix-table").addEventListener("click", (e) => {
    const detailKey = e.target.closest("[data-detail]")?.dataset.detail;
    const reqKey = e.target.closest("[data-request]")?.dataset.request;
    if (detailKey) { selectMineral(detailKey); window.location.href = "/simulate"; }
    if (reqKey) {
      state.procMineral = reqKey;
      setProcTab("sim");
      const sel = document.getElementById("proc-mineral-select");
      if (sel) sel.value = reqKey;
      runProcSim();
    }
  });

  renderHistoryTable();
  setProcTab("stock");
}

function setProcTab(tab) {
  state.procTab = tab;
  ["stock", "sim", "matrix", "history"].forEach((t) => {
    document.getElementById(`proc-tab-${t}`).hidden = t !== tab;
  });
  document.querySelectorAll("#proc-tabs button").forEach((b) => b.classList.toggle("active", b.dataset.proctab === tab));
  if (tab === "stock" && !state._stockCardsLoaded) { state._stockCardsLoaded = true; loadStockCards(); }
  if (tab === "sim" && !state._procSimRan) { state._procSimRan = true; runProcSim(); }
  if (tab === "matrix" && !state.matrixData) loadMatrixData();
}

// 7개 광물 각각의 표준 가정 기반 비축 현황 카드 — 실 /api/stockpile 연동 (mock 아님)
async function loadStockCards() {
  const keys = Object.keys(state.minerals);
  const results = await Promise.all(keys.map(async (key) => {
    const m = state.minerals[key];
    const params = new URLSearchParams({
      mineral: key, restriction_pct: m.shock_example, korea_import_bn: m.korea_import_bn,
      days_stock: 45, daily_cons_ton: 500, release_pct: 50, import_cost: 0.5, target_days: 60,
    });
    const s = await fetchJSON(`${API}/api/stockpile?${params}`);
    return { key, m, s };
  }));
  renderStockCards(results);
}

function renderStockCards(results) {
  const cards = results.map(({ key, m, s }) => {
    const shortName = key.replace(/\s*\(.*\)/, "");
    const currentDays = Math.max(0, Math.round(s.coverage_days));
    const targetDays = 60;
    const pct = Math.min(100, Math.round((currentDays / targetDays) * 100));
    const riskColor = pct < 50 ? "var(--danger)" : pct < 80 ? "var(--warning)" : "var(--success)";
    const accent = MINERAL_ACCENTS[key] || "var(--primary)";
    return { key, shortName, en: m.en, accent, currentDays, targetDays, pct, riskColor };
  });

  const critical = cards.filter((c) => c.pct < 50).length;
  const warn = cards.filter((c) => c.pct >= 50 && c.pct < 80).length;
  const safe = cards.filter((c) => c.pct >= 80).length;

  document.getElementById("stock-summary").innerHTML = [
    ["총 관리 광물 수", `${cards.length}종`, "var(--primary)"],
    ["위험 광물", `${critical}종`, "var(--danger)"],
    ["경계 광물", `${warn}종`, "var(--warning)"],
    ["정상", `${safe}종`, "var(--success)"],
  ].map(([label, val, color]) => `
    <div class="stock-summary-item"><div class="stat-label">${label}</div><div class="stat-value" style="color:${color}">${val}</div></div>`).join("");

  document.getElementById("stock-card-grid").innerHTML = cards.map((c) => `
    <div class="stock-card">
      <div class="stock-card-bar" style="background:${c.accent}"></div>
      <div class="stock-card-body">
        <div class="stock-card-name">${c.shortName}</div>
        <div class="stock-card-en">${c.en}</div>
        <div class="stock-card-big" style="color:${c.riskColor}">${c.currentDays}<span class="unit"> 일분</span></div>
        <div class="stock-card-progress"><div class="stock-card-progress-fill" style="width:${c.pct}%;background:${c.riskColor}"></div></div>
        <div class="stock-card-meta"><span>목표 ${c.targetDays}일</span><span>현재 ${c.currentDays}일</span></div>
        <button type="button" class="stock-card-btn" data-mineral="${c.key}">조달 요청</button>
      </div>
    </div>`).join("");
}

function setupProcSimTab() {
  const minerals = Object.keys(state.minerals);
  const sel = document.getElementById("proc-mineral-select");
  sel.innerHTML = minerals.map((key) => `<option value="${key}">${key.replace(/\s*\(.*\)/, "")}</option>`).join("");
  if (state.procMineral) sel.value = state.procMineral;
  sel.addEventListener("change", (e) => { state.procMineral = e.target.value; runProcSim(); });

  document.getElementById("proc-qty-input").addEventListener("input", (e) => {
    state.procQty = Number(e.target.value) || 0;
    renderProcOptionsFromState();
  });

  renderProcMethods();
  document.getElementById("proc-method-group").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-method]");
    if (!btn) return;
    state.procMethod = btn.dataset.method;
    renderProcMethods();
  });

  const budgetRange = document.getElementById("proc-budget-range");
  budgetRange.value = state.procBudget;
  document.getElementById("proc-budget-value").textContent = `${state.procBudget}억 원`;
  budgetRange.addEventListener("input", (e) => {
    state.procBudget = Number(e.target.value);
    document.getElementById("proc-budget-value").textContent = `${state.procBudget}억 원`;
  });

  document.getElementById("proc-deadline-select").value = state.procDeadline;
  document.getElementById("proc-deadline-select").addEventListener("change", (e) => { state.procDeadline = e.target.value; });

  renderProcRiskLevels();
  document.getElementById("proc-risk-group").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-risk]");
    if (!btn) return;
    state.procRisk = btn.dataset.risk;
    renderProcRiskLevels();
  });

  document.getElementById("proc-run-btn").addEventListener("click", () => { runProcSim(); });
}

function renderProcMethods() {
  document.getElementById("proc-method-group").innerHTML = PROC_METHODS.map((pm) => `
    <button type="button" class="toggle-btn ${state.procMethod === pm.key ? "active" : ""}" data-method="${pm.key}">${pm.label}</button>`).join("");
}
function renderProcRiskLevels() {
  document.getElementById("proc-risk-group").innerHTML = PROC_RISK_LEVELS.map((rl) => `
    <button type="button" class="toggle-btn flex1 ${state.procRisk === rl.key ? "active" : ""}" data-risk="${rl.key}">${rl.label}</button>`).join("");
}

let state_procLastStockpile = null;
async function runProcSim() {
  const key = state.procMineral;
  const m = state.minerals[key];
  if (!m) return;
  const params = new URLSearchParams({
    mineral: key, restriction_pct: m.shock_example, korea_import_bn: m.korea_import_bn,
    days_stock: 45, daily_cons_ton: 500, release_pct: 50, import_cost: 0.5, target_days: 60,
  });
  const s = await fetchJSON(`${API}/api/stockpile?${params}`);
  state_procLastStockpile = s;
  if (!state.procQty) {
    state.procQty = Math.max(10, Math.round(s.shortage) || 100);
    document.getElementById("proc-qty-input").value = state.procQty;
  }
  renderProcOptionsFromState(m);
  renderProcRadar();
  renderProcHHI(m);
}

function renderProcOptionsFromState(mArg) {
  const m = mArg || state.minerals[state.procMineral];
  if (!m) return;
  const qty = state.procQty || 0;
  const baseUnitCost = 0.5; // 억원/MT — 기존 앱 긴급수입 단가 기본 가정치
  const options = [
    { name: "긴급 현물 조달", top: true, unitPrice: baseUnitCost, leadDays: 7, riskScore: 62, supplier: m.top_producer },
    { name: "장기 계약 조달", top: false, unitPrice: baseUnitCost * 0.83, leadDays: 45, riskScore: 28, supplier: m.top_producer },
    { name: "공동 비축 조달", top: false, unitPrice: baseUnitCost * 0.89, leadDays: 21, riskScore: 41, supplier: m.top_producer },
  ];
  document.getElementById("proc-option-cards").innerHTML = options.map((o) => {
    const totalCost = (o.unitPrice * qty).toFixed(1);
    const riskColor = o.riskScore > 50 ? "var(--danger)" : o.riskScore > 30 ? "var(--warning)" : "var(--success)";
    return `
    <div class="option-card-v2">
      <div class="option-card-v2-head" style="background:${o.top ? "var(--primary)" : "var(--bg)"};color:${o.top ? "#fff" : "var(--primary)"}">
        <div style="font-size:13px;font-weight:700">${o.name}</div>
        ${o.top ? '<div class="option-badge-top">1순위</div>' : ""}
      </div>
      <div class="option-card-v2-body">
        <div class="option-row"><span>단가</span><b>${o.unitPrice.toFixed(2)}억원/MT</b></div>
        <div class="option-row"><span>총비용</span><b>${totalCost}억 원</b></div>
        <div class="option-row"><span>납기</span><b>${o.leadDays}일</b></div>
        <div class="option-row"><span>리스크 점수</span><b style="color:${riskColor}">${o.riskScore}</b></div>
        <div class="option-row"><span>공급국</span><b>${o.supplier}</b></div>
      </div>
      <div class="option-card-v2-foot"><button type="button" class="option-select-btn">선택</button></div>
    </div>`;
  }).join("");
}

function renderProcRadar() {
  const cats = ["비용 효율", "납기 속도", "리스크 안정성"];
  const opts = [
    { name: "긴급 현물", scores: [55, 90, 38], color: "#1B2556" },
    { name: "장기 계약", scores: [85, 45, 72], color: "#007AFF" },
    { name: "공동 비축", scores: [70, 60, 59], color: "#E67E22" },
  ];
  document.getElementById("proc-radar-wrap").innerHTML = buildRadarSVG(cats, opts);
}

function renderProcHHI(m) {
  const share = m ? m.china_mine_share : 50;
  const rows = [
    { name: "긴급 현물", value: Math.round(share * share + ((100 - share) * (100 - share)) / 2), color: "var(--danger)" },
    { name: "장기 계약", value: Math.round((share * 0.6) ** 2 + ((100 - share * 0.6) ** 2) / 3), color: "var(--success)" },
    { name: "공동 비축", value: Math.round((share * 0.8) ** 2 + ((100 - share * 0.8) ** 2) / 2.5), color: "var(--warning)" },
  ];
  const maxV = Math.max(...rows.map((r) => r.value), 1);
  const refPct = Math.min(100, (2500 / maxV) * 100);
  document.getElementById("proc-hhi-wrap").innerHTML = rows.map((r) => `
    <div class="hhi-row">
      <div class="hhi-row-label"><span>${r.name}</span><b>${r.value.toLocaleString("ko-KR")}</b></div>
      <div class="hhi-track">
        <div class="hhi-fill" style="width:${Math.min(100, (r.value / maxV) * 100)}%;background:${r.color}"></div>
        <div class="hhi-ref-line" style="left:${refPct}%"></div>
      </div>
    </div>`).join("") + `<div class="hhi-note">┊ 권고 HHI 2500 이하 (${m ? m.key.replace(/\s*\(.*\)/, "") : ""} 중국 광산 점유율 ${share}% 기반 추정)</div>`;
}

// 의사결정 매트릭스: 7개 광물 전체 실계산(시뮬레이션+비축분석) 기반. 담당자/진행상태만 mock.
async function loadMatrixData() {
  const keys = Object.keys(state.minerals);
  const results = await Promise.all(keys.map(async (key) => {
    const m = state.minerals[key];
    const simParams = new URLSearchParams({ mineral: key, restriction_pct: m.shock_example, korea_import_bn: m.korea_import_bn });
    const r = await fetchJSON(`${API}/api/simulate?${simParams}`);
    const stockParams = new URLSearchParams({
      mineral: key, restriction_pct: m.shock_example, korea_import_bn: m.korea_import_bn,
      days_stock: 45, daily_cons_ton: 500, release_pct: 50, import_cost: 0.5, target_days: 60,
    });
    const s = await fetchJSON(`${API}/api/stockpile?${stockParams}`);
    return { key, m, r, s };
  }));
  state.matrixData = results;
  renderMatrixTable();
}

function renderMatrixTable() {
  if (!state.matrixData) return;
  let rows = state.matrixData.filter(({ key }) => state.matrixMineralFilter === "all" || key === state.matrixMineralFilter);
  rows = rows.filter(({ r }) => state.matrixRiskFilter === "all" || r.risk_level === state.matrixRiskFilter);
  rows = [...rows].sort((a, b) => b.r.restriction_pct - a.r.restriction_pct);

  const html = rows.map(({ key, r, s }, idx) => {
    const shortName = key.replace(/\s*\(.*\)/, "");
    const riskLabel = r.risk_level === "HIGH" ? "위험" : r.risk_level === "MEDIUM" ? "심각" : "정상";
    const riskBg = r.risk_level === "HIGH" ? "var(--danger)" : r.risk_level === "MEDIUM" ? "var(--warning)" : "var(--success)";
    const actionKey = s.recommendation.key; // hold/combined/import — 실계산 결과
    const actionLabel = actionKey === "import" ? "긴급조달" : actionKey === "combined" ? "모니터링" : "유지";
    const actionBg = actionKey === "import" ? "var(--danger)" : actionKey === "combined" ? "var(--multiplier-blue)" : "var(--success)";
    const step = actionKey === "import" ? 1 : actionKey === "combined" ? 2 : 4; // 권고조치 기반 근사 (실 워크플로 시스템 부재)
    const steps = [0, 1, 2, 3].map((i) => `<div class="step-seg ${i < step ? "done" : ""}"></div>`).join("");
    const rowBg = r.risk_level === "HIGH" ? "background:rgba(192,57,43,0.08)" : r.risk_level === "MEDIUM" ? "background:rgba(230,126,34,0.08)" : "";
    return `<tr style="${rowBg}">
      <td>${shortName}</td>
      <td>${Math.round(s.coverage_days)}일</td>
      <td><span class="risk-badge" style="background:${riskBg};color:#fff">${riskLabel}</span></td>
      <td>${r.restriction_pct}%</td>
      <td><span class="risk-badge" style="background:${actionBg};color:#fff">${actionLabel}</span></td>
      <td>${MATRIX_OWNERS[idx % MATRIX_OWNERS.length]}</td>
      <td><div class="step-track">${steps}</div></td>
      <td style="white-space:nowrap">
        <button type="button" class="tbl-btn-ghost" data-detail="${key}">상세보기</button>
        <button type="button" class="tbl-btn-solid" data-request="${key}">조달요청</button>
      </td>
    </tr>`;
  }).join("");
  document.getElementById("matrix-table").innerHTML = `
    <thead><tr><th>광물</th><th>현재비축</th><th>위험도</th><th>충격가능성</th><th>권고조치</th><th>담당자</th><th>진행상태</th><th>액션</th></tr></thead>
    <tbody>${html}</tbody>`;
}

function renderHistoryTable() {
  const statusColor = { "완료": "var(--success)", "진행중": "var(--multiplier-blue)", "지연": "var(--danger)" };
  const rows = MOCK_PROC_HISTORY.map((h, idx) => {
    const shortName = h.mineral.replace(/\s*\(.*\)/, "");
    return `<tr class="${idx % 2 === 1 ? "zebra" : ""}">
      <td>${h.date}</td><td>${shortName}</td><td>${h.action}</td><td>${h.qty.toLocaleString("ko-KR")}톤</td><td>${h.owner}</td>
      <td><span class="risk-badge" style="background:${statusColor[h.status]};color:#fff">${h.status}</span></td>
    </tr>`;
  }).join("");
  document.getElementById("history-table").innerHTML = `
    <thead><tr><th>일자</th><th>광물</th><th>액션 유형</th><th>수량</th><th>담당자</th><th>상태</th></tr></thead>
    <tbody>${rows}</tbody>`;
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
  const accent = MINERAL_ACCENTS[mineralKey] || "#0b3d78";
  const accentDark = MINERAL_ACCENTS_DARK[mineralKey] || "#082a54";
  document.documentElement.style.setProperty("--accent", accent);
  document.documentElement.style.setProperty("--accent-dark", accentDark);
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

  document.getElementById("sim-mineral-badge").textContent = shortName;

  setAccent(key);
  updatePreview();
  updateIntensityLabel();
  renderDdaySelect();
  saveParams();
}

function updateIntensityLabel() {
  const v = state.restrictionPct;
  let label, color;
  if (v > 75) { label = "위험"; color = "var(--danger)"; }
  else if (v > 50) { label = "심각"; color = "var(--warning)"; }
  else if (v > 25) { label = "주의"; color = "#F39C12"; }
  else { label = "경계"; color = "var(--primary)"; }
  const el = document.getElementById("sim-intensity-label");
  if (el) el.innerHTML = `<span style="color:${color}">${label}</span>`;
}

function flashHeaderIfHigh() {
  const bar = document.getElementById("sim-header-bar");
  if (!bar) return;
  if (state.restrictionPct > 75) {
    bar.classList.add("flash");
    clearTimeout(state._flashTimer);
    state._flashTimer = setTimeout(() => bar.classList.remove("flash"), 400);
  }
}

// ── 충격 시뮬레이터 좌측 패널: 충격유형 라디오 / 지속기간 토글 / 대상국가 체크 ──
function setupSimulatorPanel() {
  renderShockTypes();
  renderDurationGroup();
  renderCountryChecks();
  updateIntensityLabel();

  document.getElementById("shock-type-list").addEventListener("click", (e) => {
    const row = e.target.closest("[data-shock]");
    if (!row) return;
    state.simShockType = row.dataset.shock;
    renderShockTypes();
  });

  document.getElementById("duration-group").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-duration]");
    if (!btn) return;
    state.simDuration = btn.dataset.duration;
    renderDurationGroup();
    state.ddayIdx = DURATION_DDAY_MAP[state.simDuration] ?? state.ddayIdx;
    renderDdaySelect();
    renderDomino();
  });

  document.getElementById("country-check-list").addEventListener("click", (e) => {
    const row = e.target.closest("[data-country]");
    if (!row) return;
    state.simCountries[row.dataset.country] = !state.simCountries[row.dataset.country];
    renderCountryChecks();
  });

  document.getElementById("run-sim-btn").addEventListener("click", () => {
    const btn = document.getElementById("run-sim-btn");
    state.simRunning = true;
    btn.textContent = "분석 중...";
    btn.disabled = true;
    setTimeout(() => {
      state.simRunning = false;
      state.simRanAt = new Date();
      btn.textContent = "▶ 시뮬레이션 실행";
      btn.disabled = false;
      document.getElementById("sim-last-run").textContent = `마지막 실행: ${state.simRanAt.toLocaleTimeString("ko-KR")}`;
      runSimulation();
      runStockpile();
    }, 1200);
  });

  document.getElementById("sim-reset-btn").addEventListener("click", () => {
    state.simShockType = "export";
    state.simDuration = "6";
    state.simCountries = { china: true, congo: true, chile: false, australia: false, philippines: false, indonesia: false, other: false };
    state.simRanAt = null;
    document.getElementById("sim-last-run").textContent = "아직 실행되지 않음";
    renderShockTypes();
    renderDurationGroup();
    renderCountryChecks();
  });
}

function renderShockTypes() {
  document.getElementById("shock-type-list").innerHTML = SHOCK_TYPES.map((s) => `
    <div class="radio-row" data-shock="${s.key}">
      <span class="radio-dot ${state.simShockType === s.key ? "active" : ""}"></span>${s.label}
    </div>`).join("");
}

function renderDurationGroup() {
  document.getElementById("duration-group").innerHTML = DURATIONS.map((d) => `
    <button type="button" class="toggle-btn ${state.simDuration === d ? "active" : ""}" data-duration="${d}">${d}개월</button>`).join("");
}

function renderCountryChecks() {
  document.getElementById("country-check-list").innerHTML = SIM_COUNTRIES.map((c) => {
    const on = !!state.simCountries[c.key];
    return `<div class="check-row" data-country="${c.key}"><span class="check-box ${on ? "active" : ""}">${on ? "✓" : ""}</span>${c.label}</div>`;
  }).join("");
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
  renderSimKpiGrid(r);
  renderSimLineChart(r);
  renderSimHeatmapTable(r);
  renderSimPathway(r);
  renderSimInsightPanel(r);
  renderDdaySelect();
  renderDomino();
  renderDdayCards(r);
  renderIndustryList(r);
  updatePrintHeader();
}

function renderSimKpiGrid(r) {
  const s = state.stockpileResult;
  const stockDaysDisp = s ? Math.round(s.coverage_days) : "-";
  const stockColor = !s ? "var(--primary)" : (s.coverage_days < 40 ? "var(--danger)" : s.coverage_days < 60 ? "var(--warning)" : "var(--success)");
  const urgentQty = s ? Math.round(s.shortage).toLocaleString("ko-KR") : "-";
  const items = [
    ["예상 공급 충격률", r.restriction_pct, "%", "var(--danger)"],
    ["영향 기간", state.simDuration, "개월", "var(--primary)"],
    ["국내 비축 여유", stockDaysDisp, "일분", stockColor],
    ["긴급 조달 필요량", urgentQty, "톤", "var(--primary)"],
  ];
  document.getElementById("sim-kpi-grid").innerHTML = items.map(([label, val, unit, color]) => `
    <div class="sim-kpi-card">
      <div class="sim-kpi-label">${label}</div>
      <div class="sim-kpi-value" style="color:${color}">${val}<span class="sim-kpi-unit"> ${unit}</span></div>
    </div>`).join("");
}

let simLineChart = null;
function renderSimLineChart(r) {
  const canvas = document.getElementById("sim-line-chart");
  if (!canvas || typeof Chart === "undefined") return;
  const months = [];
  for (let i = -3; i <= 24; i++) months.push(i);
  const pct = r.restriction_pct;
  // D-Day cascade 실계산 비율(15%/55%/100%)로 곡선 형태를 근사
  const shock = months.map((m) => {
    if (m < 0) return 100;
    if (m <= 0) return 100 - pct * 0.15;
    if (m <= 1) return 100 - pct * 0.55;
    if (m <= 2) return 100 - pct;
    const recover = Math.min(1, (m - 2) / 10);
    return Math.min(100, (100 - pct) + recover * pct);
  });
  const data = {
    labels: months.map((m) => `${m}개월`),
    datasets: [
      { label: "정상 공급선", data: months.map(() => 100), borderColor: "#007AFF", borderDash: [6, 4], pointRadius: 0, fill: false, tension: 0 },
      { label: "충격 시나리오", data: shock, borderColor: "#C0392B", backgroundColor: "rgba(192,57,43,0.1)", pointRadius: 0, fill: true, tension: 0.3 },
      { label: "안전 기준선 (60%)", data: months.map(() => 60), borderColor: "#E67E22", borderDash: [4, 4], pointRadius: 0, fill: false },
    ],
  };
  if (!simLineChart) {
    simLineChart = new Chart(canvas.getContext("2d"), {
      type: "line", data,
      options: {
        responsive: true, maintainAspectRatio: true,
        plugins: { legend: { position: "bottom", labels: { font: { size: 11 }, boxWidth: 12 } } },
        scales: { y: { min: 0, max: 110, ticks: { font: { size: 10 } } }, x: { ticks: { font: { size: 9 }, maxRotation: 0, autoSkip: true, maxTicksLimit: 10 } } },
      },
    });
  } else { simLineChart.data = data; simLineChart.update(); }
}

function renderSimHeatmapTable(r) {
  const chain = r.mineral_info.supply_chain || [];
  const dependency = r.mineral_info.china_mine_share;
  const rows = chain.map((sector, idx) => {
    const weight = Math.max(0.4, 1 - idx * 0.15);
    const before = 100;
    const after = Math.max(0, Math.round(100 - r.restriction_pct * weight));
    const change = after - before;
    let riskLabel, riskBg;
    if (after < 40) { riskLabel = "위험"; riskBg = "var(--danger)"; }
    else if (after < 60) { riskLabel = "심각"; riskBg = "var(--warning)"; }
    else if (after < 80) { riskLabel = "주의"; riskBg = "#F39C12"; }
    else { riskLabel = "안전"; riskBg = "var(--success)"; }
    return `<tr class="${idx % 2 === 1 ? "zebra" : ""}">
      <td>${sector}</td><td>${dependency}%</td><td>${before}%</td><td>${after}%</td><td>${change}%</td>
      <td><span class="risk-badge" style="background:${riskBg};color:#fff">${riskLabel}</span></td>
    </tr>`;
  }).join("");
  document.getElementById("sim-heatmap-table").innerHTML = `
    <thead><tr><th>산업</th><th>중국 의존도</th><th>충격 전</th><th>충격 후</th><th>변화율</th><th>위험도</th></tr></thead>
    <tbody>${rows}</tbody>`;
}

function renderSimPathway(r) {
  const shortName = r.mineral.replace(/\s*\(.*\)/, "");
  const chain = r.mineral_info.supply_chain || [];
  const nodes = [shortName, "항만", ...chain]; // 광물 7종 전부 4단계 공급망을 가져 총 6개 노드 → 3+3 두 줄로 고정 배치
  const rows = [];
  for (let i = 0; i < nodes.length; i += 3) rows.push(nodes.slice(i, i + 3));

  document.getElementById("sim-pathway").innerHTML = rows.map((rowNodes, rowIdx) => `
    <div class="pathway-line">
      ${rowNodes.map((label, idx) => {
        const globalIdx = rowIdx * 3 + idx;
        const shocked = globalIdx === 0 && r.restriction_pct > 50;
        const isLastInRow = idx === rowNodes.length - 1;
        return `<div class="pathway-item">
          <div class="pathway-node${shocked ? " shocked" : ""}">${label}</div>
          ${!isLastInRow ? '<div class="pathway-arrow"></div>' : ""}
        </div>`;
      }).join("")}
    </div>`).join("");
}

const SIM_RISK_MAP = {
  HIGH: { color: "var(--danger)", label: "즉각 조치 필요" },
  MEDIUM: { color: "var(--warning)", label: "모니터링 강화" },
  LOW: { color: "var(--success)", label: "정상" },
};

function renderSimInsightPanel(r) {
  const info = SIM_RISK_MAP[r.risk_level];
  const box = document.getElementById("sim-risk-alert-box");
  box.style.setProperty("--kpi-color", info.color);
  const badge = document.getElementById("sim-risk-alert-badge");
  badge.style.background = info.color;
  badge.textContent = info.label;

  document.getElementById("sim-recommendations").innerHTML = buildRecommendations(r).map((rec) => `
    <div class="rec-row"><span class="rec-badge" style="background:${rec.color}">${rec.badge}</span><span>${rec.text}</span></div>`).join("");

  const cur = state.stockDays;
  const target = state.targetDays;
  const pct = Math.min(100, Math.round((cur / target) * 100));
  const barColor = pct < 50 ? "var(--danger)" : pct < 80 ? "var(--warning)" : "var(--success)";
  document.getElementById("sim-stock-compare").innerHTML = `
    <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--text-quaternary);margin-bottom:6px">
      <span>현재 ${cur}일</span><span>목표 ${target}일</span>
    </div>
    <div class="mini-bar-track"><div class="mini-bar-fill" style="width:${pct}%;background:${barColor}"></div></div>`;
}

function buildRecommendations(r) {
  const m = r.mineral_info;
  const shortName = r.mineral.replace(/\s*\(.*\)/, "");
  const recs = [];
  if (r.risk_level === "HIGH") {
    recs.push({ badge: "긴급", color: "var(--danger)", text: `${m.top_producer} 등 대체 공급처 긴급 협의 개시` });
  }
  recs.push({ badge: "권고", color: "var(--multiplier-blue)", text: "국내 비축분 조기 방출 검토 및 방출 규모 산정" });
  recs.push({ badge: "권고", color: "var(--multiplier-blue)", text: `${shortName} 장기 계약 물량 비중 확대로 가격 변동성 완화` });
  return recs;
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
    // 광산품은 KOSIS 광업제조업조사(2019, 전국 광업 05~08) 총생산액 대비 비중을 함께 표시
    const miningShare = (d.sector === "광산품" && r.mining_sector_total_prod_trillion)
      ? ` <span class="industry-share">(광업 산업 총생산의 ${fmtPct(d.prod_loss / r.mining_sector_total_prod_trillion * 100).replace("+", "")})</span>`
      : "";
    return `
      <div class="industry-row">
        <div class="industry-name">${d.sector}</div>
        <div class="industry-track"><div class="industry-bar" style="width:${widthPct}%"></div></div>
        <div class="industry-value">${fmt(d.prod_loss)}조${miningShare}</div>
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
    switchView("dashboard");
  });
  const doLogout = () => {
    sessionStorage.removeItem("ksupply_logged_in");
    sessionStorage.removeItem("ksupply_params");
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
// FTA 강국 KOREA 레퍼런스처럼 실제로 페이지가 넘어가는 느낌을 주기 위해, SPA 방식(pushState)
// 대신 진짜 브라우저 풀 네비게이션(location.href)을 사용. 광물/파라미터 선택값은 새로고침
// 후에도 유지되도록 saveParams()/loadParams()로 세션스토리지에 저장·복원한다.
const VIEW_PATHS = { dashboard: "/", simulate: "/simulate", stockpile: "/stockpile", compare: "/compare", reports: "/reports" };
const PATH_VIEWS = { "/": "dashboard", "/simulate": "simulate", "/stockpile": "stockpile", "/compare": "compare", "/reports": "reports" };
const ALL_VIEWS = ["dashboard", "simulate", "stockpile", "compare", "reports"];

function setupViewTabs() {
  const onTabClick = (e) => {
    const btn = e.target.closest("[data-view]");
    if (!btn) return;
    window.location.href = VIEW_PATHS[btn.dataset.view] || "/";
  };
  document.getElementById("view-tabs").addEventListener("click", onTabClick);
  document.getElementById("mobile-tabbar").addEventListener("click", onTabClick);
  document.getElementById("dashboard-alert").addEventListener("click", onTabClick);
  document.querySelector(".top-nav-brand").addEventListener("click", () => { window.location.href = "/"; });
}
function switchView(view) {
  state.activeView = view;
  document.querySelectorAll("#view-tabs button, #mobile-tabbar button").forEach((btn) => {
    const isActive = btn.dataset.view === view;
    btn.classList.toggle("active", isActive);
    btn.setAttribute("aria-current", String(isActive));
  });
  ALL_VIEWS.forEach((v) => {
    document.getElementById(`view-${v}`).hidden = v !== view;
  });
  const activePage = document.getElementById(`view-${view}`);
  if (activePage) {
    activePage.classList.remove("page-enter");
    void activePage.offsetWidth; // 리플로우 강제 → 애니메이션 재시작
    activePage.classList.add("page-enter");
  }
  document.getElementById("app-shell").classList.toggle("dashboard-mode", view === "dashboard");
  if (view === "stockpile" && state.mineralKey) runStockpile();
  if (view === "dashboard") renderDashboard();
  if (view === "reports") renderReportsList();
  updatePrintHeader();
}

// ── ① 통합 대시보드 (공급망 현황) ──────────────────────────
// 알림/발간물 데이터는 data/alerts.csv, data/publications.csv, data/report_teasers.csv를
// 직접 편집해 관리한다 (프로토타입 단계). 실 API 연동 시에는 backend/main.py의 해당
// 엔드포인트 내부만 외부 API 호출로 바꾸면 되고, 이 파일의 렌더 로직은 그대로 둔다.
const dashboardState = { mapMode: "all" };

function setupDashboard() {
  document.getElementById("map-mode-tabs").addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-mode]");
    if (!btn) return;
    dashboardState.mapMode = btn.dataset.mode;
    document.querySelectorAll("#map-mode-tabs button").forEach((b) => b.classList.toggle("active", b === btn));
    const frame = document.getElementById("world-map-frame");
    if (frame.contentWindow) frame.contentWindow.postMessage({ type: "setMode", mode: btn.dataset.mode }, "*");
  });

  window.addEventListener("message", (e) => {
    if (e.data && e.data.type === "countryClick") renderCountryPanel(e.data);
  });
}

function renderCountryPanel(info) {
  const riskClass = info.risk === "위험" ? "HIGH" : info.risk === "경계" ? "MEDIUM" : "LOW";
  document.getElementById("country-panel").innerHTML = `
    <div class="country-panel-flag">${info.flag || ""}</div>
    <div class="country-panel-name">${info.name}</div>
    <div class="country-panel-row"><span>주요 수출 광물</span><b>${info.minerals}</b></div>
    <div class="country-panel-row"><span>한국 수입 의존도</span><b>${info.dependency}%</b></div>
    <div class="country-panel-row"><span>위험도</span><span class="risk-badge ${riskClass}">${info.risk}</span></div>
  `;
}

async function loadKotraNews() {
  state.kotraNews = []; // 중복 호출 방지용 로딩 플래그
  try {
    state.kotraNews = await fetchJSON(`${API}/api/kotra-news`);
  } catch (e) {
    state.kotraNews = [];
  }
  renderKotraNews();
}

function renderKotraNews() {
  const el = document.getElementById("alerts-list");
  if (!state.kotraNews) { el.innerHTML = `<div class="metric-sub">뉴스를 불러오는 중...</div>`; return; }
  if (!state.kotraNews.length) { el.innerHTML = `<div class="metric-sub">표시할 뉴스가 없습니다.</div>`; return; }
  el.innerHTML = state.kotraNews.map((n) => `
    <div class="alert-item">
      <span class="alert-item-time">${n.date || "-"}</span>
      <a class="alert-item-title" href="${n.url}" target="_blank" rel="noopener noreferrer">${n.title}</a>
      <span class="reports-cat-badge">${n.country || "-"}</span>
    </div>`).join("");
}

// 위험 광물 유무는 실 데이터(각 광물의 기본 시나리오 shock_example)로 판단 — mock 아님
// EU CRMA 벤치마킹: 단일국 의존도 65% 초과 시 자동 경보 트리거 (worldmap.html DATA와 동일 소스값)
const COUNTRY_DEPENDENCY = [
  { name: "중국", dependency: 62 },
  { name: "콩고민주공화국", dependency: 78 },
  { name: "칠레", dependency: 45 },
  { name: "호주", dependency: 38 },
  { name: "필리핀", dependency: 30 },
  { name: "인도네시아", dependency: 35 },
];
const DEPENDENCY_ALERT_THRESHOLD = 65;

function renderDashboardAlert() {
  const minerals = Object.entries(state.minerals);
  const highRisk = minerals.filter(([, m]) => m.shock_example >= 50);
  const depAlert = COUNTRY_DEPENDENCY.filter((c) => c.dependency >= DEPENDENCY_ALERT_THRESHOLD);
  const banner = document.getElementById("dashboard-alert");
  if (highRisk.length || depAlert.length) {
    banner.classList.add("show");
    const parts = [];
    if (depAlert.length) {
      const maxDep = Math.max(...depAlert.map((c) => c.dependency));
      parts.push(`${depAlert.map((c) => c.name).join("·")} 의존도 ${maxDep}% (EU CRMA 임계값 65% 초과)`);
    }
    if (highRisk.length) {
      const shortName = highRisk[0][0].replace(/\s*\(.*\)/, "");
      parts.push(`${shortName} 등 ${highRisk.length}개 광물 공급 위험`);
    }
    document.getElementById("dashboard-alert-text").textContent = `⚠ ${parts.join(" · ")} — 즉각 조치 필요`;
  } else {
    banner.classList.remove("show");
  }
}

function renderDashboardKPI() {
  const minerals = Object.values(state.minerals);
  const total = minerals.length;
  const riskCount = minerals.filter((m) => m.shock_example >= 50).length;
  const depAlertCount = COUNTRY_DEPENDENCY.filter((c) => c.dependency >= DEPENDENCY_ALERT_THRESHOLD).length;
  const scan = state.dashboardScan || [];
  const avgDays = scan.length
    ? Math.round(scan.reduce((sum, r) => sum + r.stock.coverage_days, 0) / scan.length)
    : null;
  const lastKomis = state.komis.length ? state.komis[state.komis.length - 1]["연월"] : "-";
  const lastCustoms = state.customsSnapshot.length
    ? state.customsSnapshot.reduce((max, r) => (r.period > max ? r.period : max), state.customsSnapshot[0].period)
    : "-";
  const items = [
    ["관리 광물 수", `${total}종`, "var(--primary)"],
    ["위험 광물 수", `${riskCount}종`, "var(--danger)"],
    ["의존도 임계값(65%) 초과국", `${depAlertCount}개국`, "var(--warning)"],
    ["평균 비축일수", avgDays === null ? "계산 중" : `${avgDays}일`, "var(--multiplier-blue)"],
    ["KOMIS 최근 갱신", lastKomis, "var(--success)"],
    ["관세청 최신 반영월", lastCustoms, "var(--primary)"],
  ];
  document.getElementById("dashboard-kpi").innerHTML = items.map(([label, val, color]) => `
    <div class="kpi-card" style="--kpi-color:${color}">
      <div class="kpi-label">${label}</div>
      <div class="kpi-value">${val}</div>
    </div>`).join("");
  document.getElementById("dashboard-last-update").textContent = `KOMIS 최근 갱신 ${lastKomis}`;
}

// 9개 광물 전체를 각자의 기본 공급제한율(shock_example)로 자동 시뮬레이션 — 사용자가
// 광물을 고르지 않아도 "지금 가장 위험한 광물이 무엇인지"를 상시 보여주기 위한 관제 스캔.
async function loadDashboardScan() {
  const keys = Object.keys(state.minerals);
  const scan = await Promise.all(keys.map(async (key) => {
    const m = state.minerals[key];
    const simParams = new URLSearchParams({ mineral: key, restriction_pct: m.shock_example, korea_import_bn: m.korea_import_bn });
    const stockParams = new URLSearchParams({
      mineral: key, restriction_pct: m.shock_example, korea_import_bn: m.korea_import_bn,
      days_stock: 45, daily_cons_ton: 500, release_pct: 50, import_cost: 0.5, target_days: 60,
    });
    const [sim, stock] = await Promise.all([
      fetchJSON(`${API}/api/simulate?${simParams}`),
      fetchJSON(`${API}/api/stockpile?${stockParams}`),
    ]);
    return { key, m, sim, stock };
  }));
  state.dashboardScan = scan;
  renderDashboardKPI();
  renderDashboardScanList(scan);
  renderDashboardPriority(scan);
}

function renderDashboardScanList(scan) {
  const sorted = [...scan].sort((a, b) => b.sim.total_prod - a.sim.total_prod).slice(0, 5);
  const maxVal = sorted.length ? sorted[0].sim.total_prod : 1;
  document.getElementById("dashboard-scan-list").innerHTML = sorted.map(({ key, sim }) => {
    const shortName = key.replace(/\s*\(.*\)/, "");
    const color = sim.risk_level === "HIGH" ? "var(--danger)" : sim.risk_level === "MEDIUM" ? "var(--warning)" : "var(--success)";
    return `
      <div class="industry-row">
        <div class="industry-name">${shortName}</div>
        <div class="industry-track"><div class="industry-bar" style="width:${Math.max(4, (sim.total_prod / maxVal) * 100).toFixed(0)}%; background:${color}"></div></div>
        <div class="industry-value">${fmt(sim.total_prod, 2)}조 <span class="risk-badge ${sim.risk_level}">${sim.risk_level}</span></div>
      </div>`;
  }).join("");
}

// 각 광물의 방출 우선순위(/api/stockpile priority)는 모두 같은 '광산품' 유발계수 열을
// 광물별 shock_trillion으로 스케일한 값이라, 위험 광물(공급제한 50%↑)들의 산업별
// 생산·고용손실을 합산해도 유효한 종합 우선순위가 된다.
function renderDashboardPriority(scan) {
  const risky = scan.filter(({ m }) => m.shock_example >= 50);
  const merged = {};
  risky.forEach(({ stock }) => {
    stock.priority.forEach((p) => {
      if (!merged[p.industry]) merged[p.industry] = { industry: p.industry, prod_loss: 0, emp_loss: 0 };
      merged[p.industry].prod_loss += p.prod_loss;
      merged[p.industry].emp_loss += p.emp_loss;
    });
  });
  const list = Object.values(merged);
  const priorityRowsEl = document.getElementById("dashboard-priority-rows");
  const priorityBarsEl = document.getElementById("dashboard-priority-bars");
  if (!list.length) {
    priorityRowsEl.innerHTML = `<div class="metric-sub">현재 공급제한 50% 이상인 광물이 없어 우선순위 대상이 없습니다.</div>`;
    priorityBarsEl.innerHTML = "";
    return;
  }

  const maxProd = Math.max(...list.map((x) => x.prod_loss), 1);
  const maxEmp = Math.max(...list.map((x) => x.emp_loss), 1);
  list.forEach((x) => { x.score = (x.prod_loss / maxProd) * 0.6 + (x.emp_loss / maxEmp) * 0.4; });
  const sorted = list.sort((a, b) => b.score - a.score).slice(0, 8);
  sorted.forEach((x, i) => { x.rank = i + 1; });

  priorityRowsEl.innerHTML = sorted.map((p) => {
    const tag = p.rank <= 2 ? '<span class="priority-tag urgent">긴급</span>'
      : p.rank <= 5 ? '<span class="priority-tag high">우선</span>'
      : '<span class="priority-tag normal">일반</span>';
    return `
      <div class="priority-row">
        <span class="priority-rank">#${p.rank}</span>${tag}
        <span class="priority-name">${p.industry}</span>
        <span class="priority-detail">생산손실 ${fmt(p.prod_loss, 3)}조 | 고용 ${Math.round(p.emp_loss).toLocaleString("ko-KR")}명</span>
      </div>`;
  }).join("") + `<div class="metric-sub" style="margin-top:8px">대상: ${risky.length}개 광물(공급제한 50%↑) 종합 · 종합점수 = 생산유발계수(60%) + 고용유발계수(40%) 가중 산출</div>`;

  const topScore = sorted[0].score || 1;
  priorityBarsEl.innerHTML = sorted.map((p) => {
    const color = p.rank <= 2 ? "var(--danger)" : p.rank <= 5 ? "var(--warning)" : "var(--multiplier-blue)";
    return `
      <div class="industry-row">
        <div class="industry-name">${p.industry}</div>
        <div class="industry-track"><div class="industry-bar" style="width:${Math.max(4, (p.score / topScore) * 100).toFixed(0)}%; background:${color}"></div></div>
        <div class="industry-value">${p.score.toFixed(2)}</div>
      </div>`;
  }).join("");
}

function renderDashboard() {
  if (!state.mineralKey) return;
  renderDashboardAlert();
  renderDashboardKPI();
  if (!state.dashboardScan) loadDashboardScan();
  if (state.kotraNews === null) loadKotraNews();
  else renderKotraNews();
}

// ── ⑤ 정책·보고서 (data/publications.csv, data/report_teasers.csv 직접 편집 관리) ──
const reportsState = { cat: "전체", expanded: new Set() };
function setupReportsView() {
  document.getElementById("publication-cards").innerHTML = state.reportTeasers.map((r) => `
    <div class="color-block-card c-${r.color}">
      <div class="color-block-card-title">${r.title}</div>
      <div class="color-block-card-desc">${r.desc}</div>
    </div>`).join("");

  document.getElementById("reports-filter").addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-cat]");
    if (!btn) return;
    reportsState.cat = btn.dataset.cat;
    reportsState.expanded.clear();
    document.querySelectorAll("#reports-filter button").forEach((b) => b.classList.toggle("active", b === btn));
    renderReportsList();
  });

  document.getElementById("reports-list").addEventListener("click", (e) => {
    const row = e.target.closest(".reports-list-item[data-idx]");
    if (!row) return;
    const idx = Number(row.dataset.idx);
    if (reportsState.expanded.has(idx)) reportsState.expanded.delete(idx);
    else reportsState.expanded.add(idx);
    renderReportsList();
  });
}

function renderReportsList() {
  const filtered = reportsState.cat === "전체"
    ? state.publications
    : state.publications.filter((p) => p.category === reportsState.cat);
  document.getElementById("reports-meta").textContent = `${filtered.length}건`;
  document.getElementById("reports-list").innerHTML = filtered.map((p, idx) => {
    const open = reportsState.expanded.has(idx);
    return `
    <div class="reports-list-item${open ? " open" : ""}" data-idx="${idx}">
      <span class="reports-expand-icon">${open ? "▾" : "▸"}</span>
      <span class="reports-date">${p.date}</span>
      <span class="reports-cat-badge">${p.category}</span>
      <span class="reports-title">${p.title}</span>
      <button type="button" class="reports-dl-btn" disabled title="데모 버전에서는 다운로드가 제공되지 않습니다" onclick="event.stopPropagation()">다운로드</button>
    </div>
    ${open ? `<div class="reports-detail">${p.content || "상세 내용이 아직 등록되지 않았습니다."}</div>` : ""}`;
  }).join("");
}

// ── 랜딩 화면: 유관기관 바로가기 캐러셀 ───────────────────
// 국가자원안보전략센터/산업통상부 무역안보과는 별도 대국민 사이트가 없어 산업통상부 홈페이지로 연결.
const CAROUSEL_PARTNERS = [
  { name: "한국광해광업공단", url: "https://www.komir.or.kr" },
  { name: "조달청", url: "https://www.pps.go.kr" },
  { name: "KOMIS 광물자원정보", url: "https://www.komis.or.kr" },
  { name: "국가자원안보전략센터", url: "https://www.motir.go.kr" },
  { name: "산업통상부 무역안보과", url: "https://www.motir.go.kr" },
  { name: "한국무역보험공사", url: "https://www.ksure.or.kr" },
];
const carouselState = { index: 0, paused: false, timer: null };
function renderCarousel() {
  const n = CAROUSEL_PARTNERS.length;
  const visible = [0, 1, 2, 3].map((i) => CAROUSEL_PARTNERS[(carouselState.index + i) % n]);
  document.getElementById("landing-carousel-track").innerHTML = visible.map((p) =>
    `<a class="carousel-item" href="${p.url}" target="_blank" rel="noopener noreferrer">${p.name}</a>`
  ).join("");
  document.getElementById("carousel-toggle").textContent = carouselState.paused ? "재생하기" : "정지하기";
}
function setupLandingCarousel() {
  const advance = (dir) => {
    const n = CAROUSEL_PARTNERS.length;
    carouselState.index = (carouselState.index + dir + n) % n;
    renderCarousel();
  };
  document.getElementById("carousel-prev").addEventListener("click", () => advance(-1));
  document.getElementById("carousel-next").addEventListener("click", () => advance(1));
  document.getElementById("carousel-toggle").addEventListener("click", () => {
    carouselState.paused = !carouselState.paused;
    renderCarousel();
  });
  carouselState.timer = setInterval(() => {
    if (!carouselState.paused) advance(1);
  }, 3000);
  renderCarousel();
}

// ── ④ 시나리오 비교 (A/B/C, 실 /api/simulate·/api/stockpile 연동) ──
function setupScenarioView() {
  renderScenToggles();
  document.getElementById("scen-toggles").addEventListener("click", (e) => {
    const row = e.target.closest("[data-scen]");
    if (!row) return;
    const key = row.dataset.scen;
    state.scenSelected[key] = !state.scenSelected[key];
    renderScenToggles();
    renderScenario();
  });
  document.getElementById("scen-run-btn").addEventListener("click", () => loadScenarioData());
  document.getElementById("scen-export-btn").addEventListener("click", () => window.print());
  document.getElementById("scen-report-btn").addEventListener("click", () => window.print());

  loadScenarioData();
}

function renderScenToggles() {
  document.getElementById("scen-toggles").innerHTML = SCENARIO_DEFS.map((s) => `
    <div class="scen-toggle" data-scen="${s.key}">
      <span class="scen-toggle-box" style="background:${state.scenSelected[s.key] ? s.color : "#fff"};border-color:${s.color}"></span>${s.label}
    </div>`).join("");
}

async function loadScenarioData() {
  const results = await Promise.all(SCENARIO_DEFS.map(async (def) => {
    const m = state.minerals[def.mineralKey];
    const simParams = new URLSearchParams({ mineral: def.mineralKey, restriction_pct: def.pct, korea_import_bn: m.korea_import_bn });
    const r = await fetchJSON(`${API}/api/simulate?${simParams}`);
    const stockParams = new URLSearchParams({
      mineral: def.mineralKey, restriction_pct: def.pct, korea_import_bn: m.korea_import_bn,
      days_stock: 45, daily_cons_ton: 500, release_pct: 50, import_cost: 0.5, target_days: 60,
    });
    const s = await fetchJSON(`${API}/api/stockpile?${stockParams}`);
    return { ...def, m, r, s };
  }));
  state.scenarioResults = results;
  renderScenario();
}

function renderScenario() {
  if (!state.scenarioResults) return;
  const selected = state.scenarioResults.filter((s) => state.scenSelected[s.key]);
  const cols = `repeat(${Math.max(1, selected.length)}, 1fr)`;
  ["scen-header-grid", "scen-kpi-grid", "scen-heatmap-grid", "scen-radar-grid", "scen-ai-grid"].forEach((id) => {
    document.getElementById(id).style.gridTemplateColumns = cols;
  });

  document.getElementById("scen-header-grid").innerHTML = selected.map((s) => `
    <div class="scen-header-block" style="background:${s.color}">
      <div class="scen-header-title">${s.label}</div>
      <div class="scen-header-sub">${s.shockLabel} · 강도 ${s.pct}% · 발동확률 ${s.prob}%</div>
    </div>`).join("");

  if (!selected.length) {
    ["scen-kpi-grid", "scen-heatmap-grid", "scen-radar-grid", "scen-ai-grid"].forEach((id) => { document.getElementById(id).innerHTML = ""; });
    document.getElementById("scen-pareto-wrap").innerHTML = "";
    document.getElementById("scen-best-label").textContent = "최적 시나리오: -";
    return;
  }

  const worstSupplyDrop = Math.max(...selected.map((s) => s.pct));
  const worstStockDays = Math.min(...selected.map((s) => s.s.coverage_days));
  const worstUrgentQty = Math.max(...selected.map((s) => s.s.shortage));
  const worstEconLoss = Math.max(...selected.map((s) => s.r.total_prod));
  const worstWeighted = Math.max(...selected.map((s) => s.r.total_prod * (s.prob / 100)));
  document.getElementById("scen-kpi-grid").innerHTML = selected.map((s) => {
    const weighted = s.r.total_prod * (s.prob / 100);
    const kpis = [
      ["공급 감소율", `${s.pct}%`, s.pct === worstSupplyDrop],
      ["발동확률 (USGS 방법론 참고)", `${s.prob}%`, false],
      ["비축 여유 일수", `${Math.round(s.s.coverage_days)}일`, s.s.coverage_days === worstStockDays],
      ["긴급 조달 필요량", `${Math.round(s.s.shortage).toLocaleString("ko-KR")}톤`, s.s.shortage === worstUrgentQty],
      ["경제적 피해 추정액", `${fmt(s.r.total_prod)}조원`, s.r.total_prod === worstEconLoss],
      ["확률가중 손실액", `${fmt(weighted)}조원`, weighted === worstWeighted],
    ];
    return `<div class="scen-kpi-col">${kpis.map(([label, val, worst]) => `
      <div class="scen-kpi-card ${worst ? "worst" : ""}">
        <div class="scen-kpi-label">${label}</div>
        <div class="scen-kpi-value" style="color:${s.color}">${val}</div>
      </div>`).join("")}</div>`;
  }).join("");

  document.getElementById("scen-heatmap-grid").innerHTML = selected.map((s) => {
    const top5 = s.r.sector_impacts.slice(0, 5);
    const maxLoss = top5.length ? top5[0].prod_loss : 1;
    const rows = top5.map((sec) => {
      const score = Math.round((sec.prod_loss / maxLoss) * 100);
      const bg = score >= 75 ? "var(--danger)" : score >= 55 ? "var(--warning)" : score >= 35 ? "#F39C12" : "var(--success)";
      return `<div class="scen-heatmap-row"><span>${sec.sector}</span><span class="scen-heatmap-score" style="background:${bg}">${score}</span></div>`;
    }).join("");
    return `<div class="scen-heatmap-card">${rows}</div>`;
  }).join("");

  renderScenLineChart(selected);
  renderScenCostChart(selected);
  renderScenPareto(selected);
  renderScenRadars(selected);

  document.getElementById("scen-ai-grid").innerHTML = selected.map((s) => {
    const actions = buildRecommendations(s.r).map((rec) => rec.text);
    return `<div class="ai-box" style="--kpi-color:${s.color}">
      <div class="ai-box-title">AI 권고 요약</div>
      <div class="ai-box-summary">${s.shockLabel} 시나리오 기준 공급 ${s.pct}% 제한 시 총 생산 파급 손실 ${fmt(s.r.total_prod)}조원, 비축 커버리지 ${Math.round(s.s.coverage_days)}일 확보. 발동확률 ${s.prob}% 반영 시 확률가중 손실액은 ${fmt(s.r.total_prod * (s.prob / 100))}조원.</div>
      ${actions.map((a) => `<div class="ai-box-action">· ${a}</div>`).join("")}
    </div>`;
  }).join("");

  const best = selected.reduce((a, b) => (a.r.total_prod <= b.r.total_prod ? a : b), selected[0]);
  document.getElementById("scen-best-label").textContent = `최적 시나리오: ${best.label} (${best.mineralKey.replace(/\s*\(.*\)/, "")})`;
}

let scenLineChart = null;
function renderScenLineChart(selected) {
  const canvas = document.getElementById("scen-line-chart");
  if (!canvas || typeof Chart === "undefined") return;
  const months = [];
  for (let i = 0; i <= 12; i++) months.push(i);
  const datasets = selected.map((s) => ({
    label: s.label, borderColor: s.color, borderDash: s.key === "A" ? [] : [6, 4],
    data: months.map((m) => {
      if (m === 0) return 100;
      if (m <= 1) return 100 - s.pct * 0.15;
      if (m <= 2) return 100 - s.pct * 0.55;
      if (m <= 4) return 100 - s.pct;
      const recover = Math.min(1, (m - 4) / 8);
      return Math.min(100, (100 - s.pct) + recover * s.pct);
    }),
    pointRadius: 0, fill: false, tension: 0.3,
  }));
  datasets.push({ label: "정상 공급", data: months.map(() => 100), borderColor: "#AAAAAA", borderDash: [3, 3], pointRadius: 0, fill: false });
  datasets.push({ label: "안전 임계선", data: months.map(() => 60), borderColor: "#C0392B", borderDash: [4, 4], pointRadius: 0, fill: false });
  const data = { labels: months.map((m) => `${m}개월`), datasets };
  if (!scenLineChart) {
    scenLineChart = new Chart(canvas.getContext("2d"), {
      type: "line", data,
      options: { responsive: true, maintainAspectRatio: true, plugins: { legend: { position: "bottom", labels: { font: { size: 10 }, boxWidth: 10 } } }, scales: { y: { min: 0, max: 110, ticks: { font: { size: 10 } } }, x: { ticks: { font: { size: 9 } } } } },
    });
  } else { scenLineChart.data = data; scenLineChart.update(); }
}

let scenCostChart = null;
function renderScenCostChart(selected) {
  const canvas = document.getElementById("scen-cost-chart");
  if (!canvas || typeof Chart === "undefined") return;
  const cats = ["조달비용", "비축비용", "기회비용"];
  const datasets = selected.map((s) => ({
    label: s.label, backgroundColor: s.color,
    data: [
      Math.round(s.s.emergency_cost),
      Math.round(s.s.usable_stock * 0.5 * 0.25),
      Math.round(s.r.total_prod * 1000),
    ],
  }));
  const data = { labels: cats, datasets };
  if (!scenCostChart) {
    scenCostChart = new Chart(canvas.getContext("2d"), {
      type: "bar", data,
      options: { responsive: true, maintainAspectRatio: true, plugins: { legend: { position: "bottom", labels: { font: { size: 10 }, boxWidth: 10 } } }, scales: { y: { ticks: { font: { size: 10 } } }, x: { ticks: { font: { size: 10 } } } } },
    });
  } else { scenCostChart.data = data; scenCostChart.update(); }
}

function renderScenPareto(selected) {
  if (!selected.length) { document.getElementById("scen-pareto-wrap").innerHTML = ""; return; }
  const worst = selected.reduce((a, b) => (a.r.total_prod >= b.r.total_prod ? a : b));
  const top5 = worst.r.sector_impacts.slice(0, 5);
  const total = top5.reduce((sum, s) => sum + s.prod_loss, 0) || 1;
  let cum = 0;
  const rows = top5.map((sec) => {
    const pct = (sec.prod_loss / total) * 100;
    cum += pct;
    return { name: sec.sector, pct, cum, color: cum <= 80 ? "var(--primary)" : "var(--multiplier-blue)" };
  });
  document.getElementById("scen-pareto-wrap").innerHTML = `
    <div style="font-size:11px;color:var(--text-quaternary);margin-bottom:10px">기준 시나리오: ${worst.label} (${worst.mineralKey.replace(/\s*\(.*\)/, "")}) — 생산 파급 손실 상위 5개 산업</div>
    ${rows.map((p) => `
    <div style="margin-bottom:12px">
      <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px"><span>${p.name}</span><span>${p.pct.toFixed(1)}% · 누적 ${p.cum.toFixed(1)}%</span></div>
      <div class="industry-track"><div class="industry-bar" style="width:${Math.max(4, p.pct * 3).toFixed(0)}%;background:${p.color}"></div></div>
    </div>`).join("")}`;
}

function renderScenRadars(selected) {
  document.getElementById("scen-radar-grid").innerHTML = selected.map((s) => {
    const supplySecurity = Math.max(0, 100 - s.pct);
    const costEfficiency = Math.max(0, 100 - Math.min(100, s.s.emergency_cost / 5));
    const speed = Math.max(0, 100 - Math.min(100, s.s.coverage_days));
    const diversification = Math.max(0, 100 - s.m.china_mine_share);
    const resilience = Math.max(0, 100 - (s.r.risk_level === "HIGH" ? 70 : s.r.risk_level === "MEDIUM" ? 45 : 20));
    const cats = ["공급안보", "비용효율", "조달속도", "다변화", "회복력"];
    const opts = [{ name: s.label, scores: [supplySecurity, costEfficiency, speed, diversification, resilience], color: s.color }];
    return `<div class="scen-radar-card">${buildRadarSVG(cats, opts)}</div>`;
  }).join("");
}

// ── ② 시나리오 비교 ───────────────────────────────────────
function setupCompareView(minerals) {
  minerals.forEach((m) => state.compareChecked.add(m.key));

  const checksEl = document.getElementById("compare-checks");
  checksEl.innerHTML = minerals.map((m) => {
    const shortName = m.key.replace(/\s*\(.*\)/, "");
    const accent = MINERAL_ACCENTS[m.key] || "#0b3d78";
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
    const accent = MINERAL_ACCENTS[r.mineral] || "#0b3d78";
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
        const accent = MINERAL_ACCENTS[r.mineral] || "#0b3d78";
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
    const accent = MINERAL_ACCENTS[r.mineral] || "#0b3d78";
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
  document.getElementById("report-meta").textContent = `- 출력일 ${todayStr()}, K-CESS 시뮬레이터 -`;

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

  const comtradeRows = state.comtrade.filter((d) => d["광물"] === shortName);
  const hasComtrade = comtradeRows.length > 0;
  const comtradeTableRows = comtradeRows.map((d) =>
    `<tr><td>${d["HS코드"]}</td><td class="left">${d["품목명"]}</td><td>${Math.round(d["수입중량_kg"]).toLocaleString("ko-KR")}</td><td>$${Math.round(d["수입액_USD"]).toLocaleString("en-US")}</td></tr>`
  ).join("");
  const comtradeTotalUsd = comtradeRows.reduce((s, d) => s + Number(d["수입액_USD"]), 0);

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
      &nbsp;&nbsp;&nbsp;&nbsp;3. KOMIS 광물종합지수 월별 동향${hasComtrade ? '<br>&nbsp;&nbsp;&nbsp;&nbsp;4. 對중국 수입 세부내역 (UN Comtrade)' : ''}
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

    ${hasComtrade ? `
    <!-- ══════ 별첨 4 ══════ -->
    <div class="report-page-break">
      <div class="appendix-label"><div class="appendix-tag">별첨 4</div><div class="appendix-title">對중국 수입 세부내역 (UN Comtrade)</div></div>
      <div class="report-section">
        <table class="report-table">
          <thead><tr><th>HS코드</th><th>품목명</th><th>수입중량(kg)</th><th>수입액(USD)</th></tr></thead>
          <tbody>${comtradeTableRows}</tbody>
        </table>
        <div class="report-h2">${shortName} 對중국 수입 합계 (2025년 연간, CIF 기준): $${Math.round(comtradeTotalUsd).toLocaleString("en-US")}</div>
        <div class="report-h2" style="font-size:11px;color:#666">※ 출처: UN Comtrade. 위 관세청 실측 수입 규모(2024, 전세계 기준·원화)와 연도·통화·집계 기준이 달라 직접 비교에는 유의 필요.</div>
      </div>
      <div class="report-footer-page">- 5 -</div>
    </div>
    ` : ""}
  `;
}

function renderPrintReportCompare() {
  const results = state.compareResults;
  document.getElementById("report-title").textContent = "핵심광물 공급 시나리오 비교 보고";
  document.getElementById("report-meta").textContent = `- 출력일 ${todayStr()}, K-CESS 시뮬레이터 -`;

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
  document.getElementById("report-meta").textContent = `- 출력일 ${todayStr()}, K-CESS 시뮬레이터 -`;

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

setupAuth();
startClock();
init();
