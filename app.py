"""
K-Supply Shield — 핵심광물 공급망 충격 시뮬레이터 v2
산업통상자원부 청년인턴 1조 정책 제안

데이터 출처:
- 산업연관표: 한국은행 ECOS 2023년 연장표 (생산유발·수입유발·취업유발계수)
- 광물 현황: USGS Mineral Commodity Summaries 2026 (May 2026)
- 수출입 실적: 관세청 2022~2026 (HS 10자리 기준)
- 광물지수: KOMIS 한국자원정보서비스 (2025.07~2026.07)
"""

import streamlit as st
import pandas as pd
import numpy as np
import plotly.graph_objects as go
import os

# ──────────────────────────────────────────────────────────────
# 0. 페이지 설정
# ──────────────────────────────────────────────────────────────
st.set_page_config(
    page_title="K-Supply Shield",
    page_icon="🛡️",
    layout="wide",
    initial_sidebar_state="expanded",
)

st.markdown("""
<style>
.metric-box {
    background: linear-gradient(135deg,#1a1a2e 0%,#16213e 100%);
    border:1px solid #0f3460; border-radius:12px;
    padding:20px; text-align:center; color:white;
}
.metric-value { font-size:2.2rem; font-weight:800; color:#e94560; }
.metric-label { font-size:0.85rem; color:#a8b2c1; margin-top:4px; }
.alert-red {
    background-color:#2d0000; border-left:4px solid #e94560;
    padding:12px 16px; border-radius:4px; color:#ffcccc;
}
.alert-yellow {
    background-color:#2d2000; border-left:4px solid #f5a623;
    padding:12px 16px; border-radius:4px; color:#ffe8aa;
}
.dday-card {
    background:#0d1117; border:1px solid #30363d;
    border-radius:8px; padding:14px; margin-bottom:8px;
}
.priority-row {
    background:#0d1117; border:1px solid #30363d;
    border-radius:6px; padding:10px 14px; margin-bottom:6px;
    display:flex; align-items:center; gap:10px;
}
.tag-red   { background:#3d0000; color:#ff8888; padding:2px 8px; border-radius:4px; font-size:0.75rem; }
.tag-yellow{ background:#3d2000; color:#ffcc88; padding:2px 8px; border-radius:4px; font-size:0.75rem; }
.tag-green { background:#003d1a; color:#88ffaa; padding:2px 8px; border-radius:4px; font-size:0.75rem; }
</style>
""", unsafe_allow_html=True)

# ──────────────────────────────────────────────────────────────
# 1. 데이터 로드 (산업연관표)
# ──────────────────────────────────────────────────────────────
EXCLUDE  = ['기타', '행합', '열합', '감응도계수', '영향력계수']
DATA_DIR = os.path.join(os.path.dirname(__file__), 'data')

@st.cache_data
def load_matrices():
    prod = pd.read_csv(os.path.join(DATA_DIR, 'prod.csv'), encoding='utf-8-sig')
    imp  = pd.read_csv(os.path.join(DATA_DIR, 'imp.csv'),  encoding='utf-8-sig')
    emp  = pd.read_csv(os.path.join(DATA_DIR, 'emp.csv'),  encoding='utf-8-sig')
    def to_matrix(df, year='2023'):
        cc = [c for c in df.columns if '수요부문' in c][0]
        rc = [c for c in df.columns if '투입부문' in c][0]
        d  = df[~df[cc].isin(EXCLUDE) & ~df[rc].isin(EXCLUDE)]
        return d.pivot(index=rc, columns=cc, values=year).astype(float)
    return to_matrix(prod), to_matrix(imp), to_matrix(emp)

prod_mat, imp_mat, emp_mat = load_matrices()

# ──────────────────────────────────────────────────────────────
# 2. 광물 마스터 데이터 (USGS MCS 2026)
# ──────────────────────────────────────────────────────────────
MINERAL_DATA = {
    '흑연 (Graphite)': {
        'en':'Graphite', 'world_prod_2025':1_900_000, 'china_mine_share':74,
        'top_producer':'중국 (74%)', 'hs_codes':['2504101000','2504102000'],
        'korea_import_bn':5_500, 'key_use':'배터리 음극재, 전기차', 'shock_example':60,
        'supply_chain':['광산품','화학제품','전기·전자기기','운송장비'],
        'color':'#00b4d8', 'usgs_note':'한국 100% 수입의존, 對중국 수입 46%',
    },
    '리튬 (Lithium)': {
        'en':'Lithium', 'world_prod_2025':290_000, 'china_mine_share':21,
        'top_producer':'호주 (32%), 칠레 (19%)', 'hs_codes':['2836910000','2825202000'],
        'korea_import_bn':27_134, 'key_use':'배터리 양극재, 리튬이온전지', 'shock_example':30,
        'supply_chain':['광산품','화학제품','전기·전자기기','운송장비'],
        'color':'#f72585', 'usgs_note':'관세청 2024 실측 2.7조원 (수산화+탄산). 2023 정점 11.1조',
    },
    '코발트 (Cobalt)': {
        'en':'Cobalt', 'world_prod_2025':310_000, 'china_mine_share':1,
        'top_producer':'DRC (74%), 인도네시아 (14%)', 'hs_codes':['2605000000'],
        'korea_import_bn':8_000, 'key_use':'배터리 양극재, 초합금', 'shock_example':40,
        'supply_chain':['광산품','화학제품','전기·전자기기','운송장비'],
        'color':'#7209b7', 'usgs_note':'DRC 2025년 수출 일시 금지, 중국 정제 70%+',
    },
    '니켈 (Nickel)': {
        'en':'Nickel', 'world_prod_2025':3_900_000, 'china_mine_share':3,
        'top_producer':'인도네시아 (67%), 필리핀 (7%)', 'hs_codes':['2604000000'],
        'korea_import_bn':30_000, 'key_use':'스테인리스강, 배터리 양극재(NCM)', 'shock_example':30,
        'supply_chain':['광산품','1차금속제품','전기·전자기기','운송장비'],
        'color':'#4361ee', 'usgs_note':'인도네시아 급부상, 글로벌 공급과잉 지속',
    },
    '망간 (Manganese)': {
        'en':'Manganese', 'world_prod_2025':20_000_000, 'china_mine_share':4,
        'top_producer':'남아공 (38%), 가봉 (25%)', 'hs_codes':['2602000000'],
        'korea_import_bn':5_000, 'key_use':'철강, 배터리(LMFP), 알루미늄합금', 'shock_example':50,
        'supply_chain':['광산품','1차금속제품','기계·장비','운송장비'],
        'color':'#3a86ff', 'usgs_note':'미국 100% 수입의존, 한국도 사실상 전량 수입',
    },
    '희토류 (Rare Earths)': {
        'en':'Rare Earths', 'world_prod_2025':390_000, 'china_mine_share':69,
        'top_producer':'중국 (69%), 호주 (7%)', 'hs_codes':['2846100000','2846909000','2805301000'],
        'korea_import_bn':10_000, 'key_use':'영구자석(모터), 촉매, 형광체', 'shock_example':50,
        'supply_chain':['광산품','화학제품','전기·전자기기','기계·장비'],
        'color':'#e63946', 'usgs_note':'2025년 4월 중국 수출통제 강화 (Sm·Gd·Tb·Dy 등). 관세청 2846 실측 ~868억',
    },
    '텅스텐 (Tungsten)': {
        'en':'Tungsten', 'world_prod_2025':85_000, 'china_mine_share':79,
        'top_producer':'중국 (79%), 베트남 (4%)', 'hs_codes':['2611000000'],
        'korea_import_bn':3_000, 'key_use':'절삭공구(초경합금), 특수강, 전자부품', 'shock_example':40,
        'supply_chain':['광산품','화학제품','기계·장비','전기·전자기기'],
        'color':'#fb8500', 'usgs_note':'2025년 2월 중국 수출통제 발동 (텅스텐 분말 포함)',
    },
}

# ──────────────────────────────────────────────────────────────
# 3. 계산 엔진
# ──────────────────────────────────────────────────────────────
def run_simulation(shock_trillion, sector='광산품'):
    if sector not in prod_mat.columns:
        return None, None, None
    prod_impact = prod_mat[sector] * shock_trillion
    emp_impact  = emp_mat[sector] * shock_trillion * 1000 if sector in emp_mat.columns else pd.Series(dtype=float)
    imp_impact  = imp_mat[sector] * shock_trillion if sector in imp_mat.columns else pd.Series(dtype=float)
    return prod_impact, emp_impact, imp_impact

def d_day_cascade(shock_trillion):
    stages = {
        'D+7':  {'label':'1단계: 원자재 재고 소진',    'ratio':0.15, 'desc':'비축 재고 소진 → 긴급 대체공급선 모색'},
        'D+18': {'label':'2단계: 소재·부품 생산 중단', 'ratio':0.55, 'desc':'중간재 투입 부족 → 배터리셀·부품 라인 중단'},
        'D+40': {'label':'3단계: 완성품·수출 차질',    'ratio':1.00, 'desc':'완성차·전자제품 출하 중단 → 수출 손실 현실화'},
    }
    results = {}
    for key, s in stages.items():
        eff   = shock_trillion * s['ratio']
        pi, ei, _ = run_simulation(eff)
        results[key] = {
            'label':s['label'], 'desc':s['desc'], 'effective_shock':eff,
            'total_prod_loss': pi.sum() if pi is not None else 0,
            'total_emp_loss':  ei.sum() if ei is not None else 0,
            'prod_by_sector':  pi,
        }
    return results

def stockpile_sim(days_stock, daily_cons_ton, restriction_pct, release_pct=50):
    daily_gap       = daily_cons_ton * restriction_pct / 100
    total_stock     = daily_cons_ton * days_stock
    release_per_day = total_stock * (release_pct / 100) / max(days_stock, 1)
    deficit_with    = max(0, daily_gap - release_per_day)
    buffer_days     = total_stock * (release_pct / 100) / daily_gap if daily_gap > 0 else 999
    return {
        'total_stock_ton':       total_stock,
        'daily_gap_ton':         daily_gap,
        'release_per_day':       release_per_day,
        'buffer_days':           buffer_days,
        'usable_stock':          total_stock * release_pct / 100,
        'deficit_ratio_without': daily_gap / daily_cons_ton * 100 if daily_cons_ton > 0 else 0,
        'deficit_ratio_with':    deficit_with / daily_cons_ton * 100 if daily_cons_ton > 0 else 0,
    }

# ──────────────────────────────────────────────────────────────
# 4. 도미노 시각화
# ──────────────────────────────────────────────────────────────
DOMINO_STAGES = [
    {'label':'🚫 공급<br>차단',          'day':'D+0',   'threshold':-1},
    {'label':'📦 원자재<br>재고 소진',   'day':'D+7',   'threshold': 0},
    {'label':'🔧 소재·부품<br>생산 중단','day':'D+18',  'threshold': 1},
    {'label':'🚗 완성품<br>출하 차질',   'day':'D+40',  'threshold': 2},
    {'label':'📉 수출손실<br>현실화',    'day':'D+40+', 'threshold': 2},
]
DDAY_KEYS = ['D+7', 'D+18', 'D+40']

def domino_html(cascade, mineral_color, dday_idx):
    """
    dday_idx: 0=D+7, 1=D+18, 2=D+40
    각 단계 박스와 화살표를 HTML로 렌더링
    """
    boxes_html = []
    for i, s in enumerate(DOMINO_STAGES):
        is_trigger = (i == 0)
        is_active  = is_trigger or (s['threshold'] <= dday_idx)

        if is_trigger:
            bg = '#1a0800'; border = mineral_color; tc = mineral_color; fw = 'bold'
        elif is_active:
            bg = '#2d0000'; border = '#e94560';     tc = 'white';        fw = 'normal'
        else:
            bg = '#0d1117'; border = '#2a2a2a';     tc = '#444';         fw = 'normal'

        # 손실 수치 (활성 비트리거 박스)
        loss_html = ''
        if is_active and not is_trigger:
            k   = DDAY_KEYS[min(i - 1, 2)]
            pl  = cascade[k]['total_prod_loss']
            el  = int(cascade[k]['total_emp_loss'])
            loss_html = (
                f'<div style="color:#f5a623;font-size:0.68rem;margin-top:5px;line-height:1.4">'
                f'▼{pl:.2f}조원<br>{el:,}명</div>'
            )

        boxes_html.append(
            f'<div style="display:inline-flex;flex-direction:column;align-items:center;'
            f'background:{bg};border:2px solid {border};border-radius:8px;'
            f'padding:10px 14px;min-width:88px;font-weight:{fw};'
            f'color:{tc};font-size:0.78rem;text-align:center;">'
            f'<div>{s["label"]}</div>'
            f'<div style="color:#666;font-size:0.66rem;margin-top:3px">{s["day"]}</div>'
            f'{loss_html}</div>'
        )

    # 화살표 삽입
    parts = []
    for i, box in enumerate(boxes_html):
        parts.append(box)
        if i < len(boxes_html) - 1:
            next_thresh = DOMINO_STAGES[i + 1]['threshold']
            arrow_active = (next_thresh <= dday_idx)
            ac = '#e94560' if arrow_active else '#2a2a2a'
            parts.append(
                f'<div style="color:{ac};font-size:1.4rem;padding:0 6px;'
                f'align-self:center;line-height:1">▶</div>'
            )

    inner = '\n'.join(parts)
    return (
        f'<div style="display:flex;align-items:flex-start;gap:2px;'
        f'background:#060d17;border:1px solid #1a2a3a;'
        f'border-radius:12px;padding:16px;overflow-x:auto;">'
        f'{inner}</div>'
    )

# ──────────────────────────────────────────────────────────────
# 5. 방출 우선순위 계산
# ──────────────────────────────────────────────────────────────
def calc_priority(shock_trillion):
    if '광산품' not in prod_mat.columns:
        return None
    pv = (prod_mat['광산품'] * shock_trillion).rename('생산손실')
    ev = (emp_mat['광산품'] * shock_trillion * 1000).rename('고용손실') \
         if '광산품' in emp_mat.columns else pd.Series(0, index=pv.index, name='고용손실')
    df = pd.concat([pv, ev], axis=1).reset_index()
    df.columns = ['산업', '생산손실', '고용손실']
    df = df[df['생산손실'] > 0].copy()
    mp = df['생산손실'].max(); me = max(df['고용손실'].max(), 1)
    df['종합점수'] = (df['생산손실'] / mp) * 0.6 + (df['고용손실'] / me) * 0.4
    df = df.nlargest(8, '종합점수').reset_index(drop=True)
    df['순위'] = range(1, len(df) + 1)
    return df

# ──────────────────────────────────────────────────────────────
# 6. 사이드바
# ──────────────────────────────────────────────────────────────
with st.sidebar:
    st.image(
        "https://upload.wikimedia.org/wikipedia/commons/thumb/0/09/Flag_of_South_Korea.svg/120px-Flag_of_South_Korea.svg.png",
        width=60,
    )
    st.markdown("## 🛡️ K-Supply Shield")
    st.markdown("**핵심광물 공급망 충격 시뮬레이터**")
    st.markdown("산업통상자원부 청년인턴 1조")
    st.divider()

    selected_mineral = st.selectbox("📦 시뮬레이션 광물", list(MINERAL_DATA.keys()))
    m = MINERAL_DATA[selected_mineral]
    st.markdown(f"**주요 용도:** {m['key_use']}")
    st.markdown(f"**최대 생산국:** {m['top_producer']}")
    st.markdown(f"**중국 광산 점유율:** {m['china_mine_share']}%")
    st.divider()

    st.markdown("### ⚡ 충격 시나리오")
    restriction_pct = st.slider("공급 제한 비율 (%)", 10, 100, m['shock_example'], 5,
                                help="예: 60 = 수출 60% 제한")
    korea_import_bn = st.number_input(
        "한국 연간 수입 규모 (억원)", 10, 100_000, m['korea_import_bn'], 50,
        help="관세청 수출입 통계 기준",
    )
    shock_trillion = korea_import_bn * restriction_pct / 100 / 10_000
    st.markdown(f"**예상 직접 충격:** `{shock_trillion:.2f}조원`")
    st.divider()

    st.markdown("### 🏭 비축 파라미터")
    days_stock  = st.slider("현재 비축 재고 (일)", 0, 180, 45, 5)
    daily_cons  = st.number_input("일일 소비량 (MT)", 1, 10_000, 500, 50)
    release_pct = st.slider("비축 방출 비율 (%)", 0, 100, 50, 10)
    import_cost = st.number_input("긴급수입 단가 (억원/MT)", 0.01, 10.0, 0.5, 0.01,
                                  help="긴급 수입 시 MT당 비용 추정")
    st.divider()
    st.caption("📊 한국은행 ECOS 2023 산업연관표 | USGS MCS 2026 | 관세청 | KOMIS")

# ──────────────────────────────────────────────────────────────
# 7. 공통 계산
# ──────────────────────────────────────────────────────────────
prod_impact, emp_impact, _ = run_simulation(shock_trillion)
total_prod  = prod_impact.sum() if prod_impact is not None else 0
total_emp   = emp_impact.sum()  if emp_impact  is not None else 0
multiplier  = total_prod / shock_trillion if shock_trillion > 0 else 0
cascade     = d_day_cascade(shock_trillion)
sr          = stockpile_sim(days_stock, daily_cons, restriction_pct, release_pct)
gap_per_day = daily_cons * restriction_pct / 100

# ──────────────────────────────────────────────────────────────
# 8. 헤더 + 경보 배너
# ──────────────────────────────────────────────────────────────
st.title(f"🛡️ K-Supply Shield — {selected_mineral} 공급 충격 시뮬레이션")
st.caption(f"시나리오: {selected_mineral} 공급 {restriction_pct}% 제한 → 직접 충격 {shock_trillion:.2f}조원")

risk_level  = "🔴 HIGH"   if restriction_pct >= 50 else ("🟡 MEDIUM" if restriction_pct >= 25 else "🟢 LOW")
alert_class = "alert-red" if restriction_pct >= 50 else "alert-yellow"
alert_msg   = "즉각 대응 필요" if restriction_pct >= 50 else "모니터링 강화"
st.markdown(
    f'<div class="{alert_class}">⚠️ <b>공급망 경보 {risk_level}</b> '
    f'| {selected_mineral} {restriction_pct}% 제한 시나리오 — {alert_msg}</div>',
    unsafe_allow_html=True,
)
st.markdown("<br>", unsafe_allow_html=True)

# ──────────────────────────────────────────────────────────────
# 9. 탭
# ──────────────────────────────────────────────────────────────
tab1, tab2, tab3 = st.tabs(["① 충격 시뮬레이션", "② 비축 조달 의사결정", "📌 정책 권고"])

# ══════════════════════════════════════════════════════════════
# TAB 1: 충격 시뮬레이션
# ══════════════════════════════════════════════════════════════
with tab1:

    # ── 핵심 지표 4개 ──
    c1, c2, c3, c4 = st.columns(4)
    for col, val, label in zip(
        [c1, c2, c3, c4],
        [f"{shock_trillion:.2f}조", f"{total_prod:.1f}조", f"{int(total_emp):,}명", f"{multiplier:.1f}배"],
        ["직접 수입 충격", "총 생산 파급 손실", "총 고용 위협", "생산유발 배수 (레온티에프)"],
    ):
        with col:
            st.markdown(
                f'<div class="metric-box">'
                f'<div class="metric-value">{val}</div>'
                f'<div class="metric-label">{label}</div></div>',
                unsafe_allow_html=True,
            )

    st.markdown("<br>", unsafe_allow_html=True)

    # ── 도미노 시각화 ──
    st.subheader("💥 공급망 도미노 충격 전파")
    dday_opts = ['D+7 (원자재 소진)', 'D+18 (소재·부품 중단)', 'D+40 (완성품·수출 차질)']
    dday_sel  = st.select_slider("D-Day 단계", options=dday_opts, value=dday_opts[2])
    dday_idx  = dday_opts.index(dday_sel)
    st.markdown(domino_html(cascade, m['color'], dday_idx), unsafe_allow_html=True)

    st.markdown("<br>", unsafe_allow_html=True)

    # ── D-Day 카드 3개 ──
    st.subheader("📅 단계별 충격 상세")
    tc1, tc2, tc3 = st.columns(3)
    for col, (key, data) in zip([tc1, tc2, tc3], cascade.items()):
        with col:
            st.markdown(
                f'<div class="dday-card">'
                f'<h3 style="color:#e94560;margin:0">{key}</h3>'
                f'<p style="color:#a8b2c1;font-size:0.8rem;margin:4px 0 8px">{data["label"]}</p>'
                f'<p style="color:#f0f0f0;font-size:0.85rem">{data["desc"]}</p>'
                f'<hr style="border-color:#30363d;margin:8px 0">'
                f'<b style="color:#f5a623">생산 손실:</b> <span style="color:white">{data["total_prod_loss"]:.2f}조원</span><br>'
                f'<b style="color:#f5a623">고용 위협:</b> <span style="color:white">{int(data["total_emp_loss"]):,}명</span>'
                f'</div>',
                unsafe_allow_html=True,
            )

    st.markdown("<br>", unsafe_allow_html=True)

    # ── 산업별 파급 바차트 ──
    st.subheader("🏭 산업별 생산 파급 손실 (레온티에프 역행렬)")
    if prod_impact is not None:
        df_prod = prod_impact.reset_index()
        df_prod.columns = ['산업부문', '생산손실(조원)']
        df_prod = df_prod[df_prod['생산손실(조원)'] > 0.001].sort_values('생산손실(조원)', ascending=True)
        fig_bar = go.Figure(go.Bar(
            x=df_prod['생산손실(조원)'], y=df_prod['산업부문'], orientation='h',
            marker_color=m['color'],
            text=[f"{v:.3f}조" for v in df_prod['생산손실(조원)']], textposition='outside',
        ))
        fig_bar.update_layout(
            paper_bgcolor='rgba(0,0,0,0)', plot_bgcolor='rgba(13,17,23,0.8)', font_color='white',
            height=max(350, len(df_prod) * 22), margin=dict(l=10, r=80, t=20, b=20),
            xaxis=dict(gridcolor='#30363d', title='생산 손실 (조원)'),
            yaxis=dict(gridcolor='#30363d'),
        )
        st.plotly_chart(fig_bar, use_container_width=True)

    # ── D-Day 꺾은선 ──
    st.subheader("📈 D+7 → D+18 → D+40 피해 누적 추이")
    dl = list(cascade.keys())
    pl = [cascade[k]['total_prod_loss'] for k in dl]
    el = [cascade[k]['total_emp_loss']  for k in dl]
    fig_line = go.Figure()
    fig_line.add_trace(go.Scatter(
        x=dl, y=pl, name='생산 손실 (조원)',
        mode='lines+markers+text', line=dict(color=m['color'], width=3), marker=dict(size=12),
        text=[f"{v:.2f}조" for v in pl], textposition='top center', yaxis='y1',
    ))
    fig_line.add_trace(go.Scatter(
        x=dl, y=[e / 10000 for e in el], name='고용 위협 (만명)',
        mode='lines+markers+text', line=dict(color='#f5a623', width=3, dash='dot'), marker=dict(size=12),
        text=[f"{e/10000:.1f}만명" for e in el], textposition='bottom center', yaxis='y2',
    ))
    fig_line.update_layout(
        paper_bgcolor='rgba(0,0,0,0)', plot_bgcolor='rgba(13,17,23,0.8)', font_color='white', height=320,
        legend=dict(bgcolor='rgba(0,0,0,0)'),
        yaxis=dict(title='생산 손실 (조원)', gridcolor='#30363d', color=m['color']),
        yaxis2=dict(title='고용 위협 (만명)', overlaying='y', side='right', color='#f5a623'),
        margin=dict(t=20, b=20),
    )
    st.plotly_chart(fig_line, use_container_width=True)

    # ── KOMIS 동향 ──
    komis_path = os.path.join(DATA_DIR, 'komis_mineral_index.csv')
    if os.path.exists(komis_path):
        st.subheader("📊 KOMIS 광물종합지수 동향 (2025.07~2026.07)")
        df_komis = pd.read_csv(komis_path, encoding='utf-8-sig')
        fig_k = go.Figure()
        for col_name, clr in {'광물종합지수':'#00b4d8','메이저금속지수':'#4361ee','희소금속지수':'#e94560'}.items():
            fig_k.add_trace(go.Scatter(
                x=df_komis['연월'], y=df_komis[col_name], name=col_name,
                mode='lines+markers', line=dict(color=clr, width=2.5), marker=dict(size=7),
            ))
        ann_row = df_komis[df_komis['연월'] == '2026-01']
        if not ann_row.empty:
            fig_k.add_annotation(
                x='2026-01', y=ann_row['희소금속지수'].values[0],
                text="2026.01 중국 수출통제 확대",
                showarrow=True, arrowhead=2, font=dict(color='#e94560', size=11),
                arrowcolor='#e94560', ax=55, ay=-35,
            )
        fig_k.update_layout(
            paper_bgcolor='rgba(0,0,0,0)', plot_bgcolor='rgba(13,17,23,0.8)',
            font_color='white', height=280, margin=dict(t=20, b=20),
            xaxis=dict(gridcolor='#30363d'), yaxis=dict(gridcolor='#30363d', title='지수'),
            legend=dict(bgcolor='rgba(0,0,0,0)'),
        )
        st.plotly_chart(fig_k, use_container_width=True)
        idx_s = df_komis['희소금속지수'].iloc[0]
        idx_e = df_komis['희소금속지수'].iloc[-1]
        kc1, kc2, kc3 = st.columns(3)
        kc1.metric("희소금속지수 (2025-07)", f"{idx_s:,.1f}")
        kc2.metric("희소금속지수 (2026-07)", f"{idx_e:,.1f}", delta=f"+{(idx_e/idx_s-1)*100:.1f}%")
        kc3.metric(
            "광물종합지수 (2026-07)", f"{df_komis['광물종합지수'].iloc[-1]:,.1f}",
            delta=f"+{(df_komis['광물종합지수'].iloc[-1]/df_komis['광물종합지수'].iloc[0]-1)*100:.1f}%",
        )
        st.caption("출처: KOMIS 한국자원정보서비스")

    # ── USGS 요약 ──
    st.subheader("📋 광물 현황 요약 (USGS MCS 2026)")
    ic1, ic2 = st.columns(2)
    with ic1:
        st.markdown(f"""
| 항목 | 내용 |
|------|------|
| 세계 생산량 (2025) | {m['world_prod_2025']:,} MT |
| 중국 광산 점유율 | {m['china_mine_share']}% |
| 세계 최대 생산국 | {m['top_producer']} |
| 한국 주요 용도 | {m['key_use']} |
""")
    with ic2:
        st.markdown(f"""
| 항목 | 내용 |
|------|------|
| 관련 HS 코드 | {', '.join(m['hs_codes'])} |
| 한국 추정 수입 | {m['korea_import_bn']:,} 억원/년 |
| 공급망 섹터 | {' → '.join(m['supply_chain'])} |
| 비고 | {m['usgs_note']} |
""")


# ══════════════════════════════════════════════════════════════
# TAB 2: 비축 조달 의사결정
# ══════════════════════════════════════════════════════════════
with tab2:
    st.markdown("### ② 비축 조달 의사결정 지원 플랫폼")
    st.caption(f"현재 설정: 비축 {days_stock}일 | 일일소비 {daily_cons:,} MT | 방출비율 {release_pct}% | 공급차질 {restriction_pct}%")

    # ────────────────────────────────────────────────────
    # A. 비축량 최적화 역산
    # ────────────────────────────────────────────────────
    st.subheader('📐 A. 비축량 최적화 — "D+N 버티려면 몇 톤?"')

    ba1, ba2 = st.columns([1, 2])
    with ba1:
        target_days = st.slider("목표 생존 일수", 7, 90, 45, 1,
                                help="공급 차질 없이 버텨야 하는 목표 일수")
        needed_stock   = gap_per_day * target_days
        usable_stock   = sr['usable_stock']
        shortage       = max(0, needed_stock - usable_stock)
        coverage_days  = usable_stock / gap_per_day if gap_per_day > 0 else 999
        cover_ratio    = min(1.0, usable_stock / needed_stock) if needed_stock > 0 else 1.0
        bar_color      = '#00cc66' if cover_ratio >= 1 else ('#f5a623' if cover_ratio >= 0.5 else '#e94560')

        st.markdown(f"""
<div style="margin-top:12px">
  <div style="display:flex;justify-content:space-between;color:#888;font-size:0.8rem">
    <span>현재 커버리지</span><span>{cover_ratio*100:.0f}% / 100%</span>
  </div>
  <div style="background:#1a1a2e;border-radius:6px;height:22px;margin-top:6px">
    <div style="background:{bar_color};width:{min(cover_ratio*100,100):.0f}%;height:100%;border-radius:6px"></div>
  </div>
  <div style="color:{bar_color};font-size:0.85rem;margin-top:6px">
    {'✅ 목표 달성 가능' if cover_ratio >= 1 else f'⚠️ {shortage:,.0f} MT 추가 필요'}
  </div>
</div>
""", unsafe_allow_html=True)

    with ba2:
        emergency_cost = shortage * import_cost
        st.markdown(f"""
| 항목 | 계산값 |
|------|--------|
| 일일 공급 차질량 | **{gap_per_day:,.0f} MT/일** ({restriction_pct}% 제한) |
| {target_days}일 버티기 필요 비축량 | **{needed_stock:,.0f} MT** |
| 현재 방출 가능 비축량 | **{usable_stock:,.0f} MT** ({days_stock}일 × {release_pct}% 방출) |
| 현재 비축으로 버틸 수 있는 기간 | **{coverage_days:.0f}일** |
| 추가 확보 필요 | **{shortage:,.0f} MT** |
| 부족분 긴급수입 비용 (추정) | **{emergency_cost:,.0f} 억원** |
""")
        if shortage > 0:
            st.markdown(
                f'<div style="background:#2d1a00;border-left:3px solid #f5a623;padding:10px 14px;border-radius:4px;color:#ffe8aa">'
                f'💡 <b>조달 방안:</b> 긴급수입 {shortage:,.0f} MT → 추정 비용 <b>{emergency_cost:,.0f}억원</b>'
                f' (단가 {import_cost:.2f}억원/MT 기준)</div>',
                unsafe_allow_html=True,
            )

    st.divider()

    # ────────────────────────────────────────────────────
    # B. 최소 안전 비축량 임계값
    # ────────────────────────────────────────────────────
    st.subheader("🛑 B. 최소 안전 비축량 임계값")

    min_danger = gap_per_day * 7
    min_safe   = gap_per_day * 18
    min_strat  = gap_per_day * 45

    if usable_stock < min_danger:
        sig = '<span class="tag-red">🔴 위험 — 즉각 비축 확충</span>'
    elif usable_stock < min_safe:
        sig = '<span class="tag-yellow">🟡 주의 — 비축 확대 권고</span>'
    elif usable_stock < min_strat:
        sig = '<span class="tag-yellow">🟡 양호 — 전략 비축 검토</span>'
    else:
        sig = '<span class="tag-green">🟢 안전 — 현재 비축 충분</span>'
    st.markdown(f"**현재 상태:** {sig}", unsafe_allow_html=True)
    st.markdown("<br>", unsafe_allow_html=True)

    bb1, bb2 = st.columns([1, 1])
    with bb1:
        labels = ['D+7 최소선', 'D+18 안전선', 'D+45 전략선', '현재 방출가능']
        vals   = [min_danger, min_safe, min_strat, usable_stock]
        bcolors = [
            '#e94560', '#f5a623', '#00b4d8',
            '#00cc66' if usable_stock >= min_safe else '#e94560',
        ]
        fig_thresh = go.Figure(go.Bar(
            x=labels, y=vals, marker_color=bcolors,
            text=[f"{v:,.0f} MT" for v in vals], textposition='outside',
        ))
        fig_thresh.update_layout(
            paper_bgcolor='rgba(0,0,0,0)', plot_bgcolor='rgba(13,17,23,0.8)', font_color='white',
            height=300, margin=dict(t=30, b=10, l=10, r=10),
            yaxis=dict(gridcolor='#30363d', title='비축량 (MT)'),
            xaxis=dict(gridcolor='#30363d'),
        )
        st.plotly_chart(fig_thresh, use_container_width=True)

    with bb2:
        d2s  = max(0, min_safe  - usable_stock)
        d2st = max(0, min_strat - usable_stock)
        st.markdown(f"""
| 임계 수준 | 기준 | 필요량 |
|-----------|------|--------|
| 🔴 최소 (D+7)  | 7일치 차질분  | {min_danger:,.0f} MT |
| 🟡 안전 (D+18) | 18일치 차질분 | {min_safe:,.0f} MT |
| 🔵 전략 (D+45) | 45일치 차질분 | {min_strat:,.0f} MT |
| **현재 방출가능** | {days_stock}일 비축 × {release_pct}% | **{usable_stock:,.0f} MT** |
""")
        if d2s > 0:
            st.markdown(
                f'<div class="dday-card"><b style="color:#e94560">⚠️ 안전선 부족</b><br>'
                f'추가 필요: <span style="color:white">{d2s:,.0f} MT</span><br>'
                f'긴급수입 비용: <span style="color:#f5a623">{d2s*import_cost:,.0f} 억원</span></div>',
                unsafe_allow_html=True,
            )
        if d2st > 0:
            st.markdown(
                f'<div class="dday-card"><b style="color:#f5a623">📋 전략선 부족</b><br>'
                f'순차 확충 필요: <span style="color:white">{d2st:,.0f} MT</span><br>'
                f'순차 구매 비용: <span style="color:#f5a623">{d2st*import_cost*0.85:,.0f} 억원</span></div>',
                unsafe_allow_html=True,
            )

    st.divider()

    # ────────────────────────────────────────────────────
    # C. 방출 우선순위 자동산출
    # ────────────────────────────────────────────────────
    st.subheader("🏆 C. 방출 대상 산업 우선순위 자동산출")

    priority_df = calc_priority(shock_trillion)
    if priority_df is not None:
        pc1, pc2 = st.columns([3, 2])
        with pc1:
            rows = ''
            for _, row in priority_df.iterrows():
                rank = int(row['순위'])
                tag  = ('<span class="tag-red">긴급</span>'   if rank <= 2 else
                        '<span class="tag-yellow">우선</span>' if rank <= 5 else
                        '<span class="tag-green">일반</span>')
                rows += (
                    f'<div class="priority-row">'
                    f'<span style="color:#f5a623;font-weight:bold;font-size:1.1rem;min-width:28px">#{rank}</span>'
                    f'{tag}'
                    f'<span style="color:white;flex:1">{row["산업"]}</span>'
                    f'<span style="color:#a8b2c1;font-size:0.8rem">'
                    f'생산손실 {row["생산손실"]:.3f}조 | 고용 {int(row["고용손실"]):,}명</span>'
                    f'</div>'
                )
            st.markdown(rows, unsafe_allow_html=True)
            st.caption("종합점수 = 생산유발계수(60%) + 고용유발계수(40%) 가중 산출")

        with pc2:
            fig_pri = go.Figure(go.Bar(
                y=priority_df['산업'].tolist()[::-1],
                x=priority_df['종합점수'].tolist()[::-1],
                orientation='h',
                marker_color=[
                    '#e94560' if i >= len(priority_df) - 2 else
                    '#f5a623' if i >= len(priority_df) - 5 else '#4361ee'
                    for i in range(len(priority_df))
                ],
                text=[f"{v:.2f}" for v in priority_df['종합점수'].tolist()[::-1]],
                textposition='outside',
            ))
            fig_pri.update_layout(
                paper_bgcolor='rgba(0,0,0,0)', plot_bgcolor='rgba(13,17,23,0.8)',
                font_color='white', height=330,
                margin=dict(t=15, b=10, l=10, r=55),
                xaxis=dict(gridcolor='#30363d', title='종합점수'),
                yaxis=dict(gridcolor='#30363d'),
            )
            st.plotly_chart(fig_pri, use_container_width=True)

    st.divider()

    # ────────────────────────────────────────────────────
    # D. 대체 조달 전략 비교
    # ────────────────────────────────────────────────────
    st.subheader("⚖️ D. 대체 조달 전략 비교")

    categories = ['조달 속도', '비용 효율', '물량 충분성', '공급 안정성', '지속 가능성']
    option_scores = {
        '🏦 비축 방출':  [95, 90, 40, 70, 30],
        '✈️ 긴급 수입':  [40, 55, 90, 60, 75],
        '⚡ 복합 전략':  [75, 72, 80, 88, 82],
    }
    opt_colors = ['#00b4d8', '#f72585', '#00cc88']

    fig_radar = go.Figure()
    for (name, scores), clr in zip(option_scores.items(), opt_colors):
        fig_radar.add_trace(go.Scatterpolar(
            r=scores + [scores[0]],
            theta=categories + [categories[0]],
            fill='toself', name=name,
            line=dict(color=clr, width=2),
            fillcolor=clr + '22',
        ))
    fig_radar.update_layout(
        polar=dict(
            radialaxis=dict(visible=True, range=[0, 100], gridcolor='#30363d', color='#888'),
            angularaxis=dict(gridcolor='#30363d', color='white'),
            bgcolor='rgba(13,17,23,0.8)',
        ),
        paper_bgcolor='rgba(0,0,0,0)', font_color='white',
        height=320, margin=dict(t=30, b=30),
        legend=dict(bgcolor='rgba(0,0,0,0)'),
    )

    dc1, dc2 = st.columns([1, 1])
    with dc1:
        st.plotly_chart(fig_radar, use_container_width=True)

    with dc2:
        option_info = {
            '🏦 비축 방출': {
                '조달기간': '즉시 (0~2일)', '비용': '정상가 기준',
                '가용물량': f'{usable_stock:,.0f} MT',
                '장점': '즉각 투입 가능, 시장 교란 없음',
                '단점': '물량 소진 후 재확보 불가',
            },
            '✈️ 긴급 수입': {
                '조달기간': '7~14일 (해운 기준)', '비용': '정상가 +20~40%',
                '가용물량': '이론상 무제한',
                '장점': '중·장기 공급 지속 가능',
                '단점': '가격 급등, 조달 시간 소요',
            },
            '⚡ 복합 전략': {
                '조달기간': '즉시 + 14일~',  '비용': '정상가 +10~15%',
                '가용물량': '비축 + 수입 병행',
                '장점': 'D+7 비축 방출로 시간 확보 → 수입으로 장기 대응',
                '단점': '이중 관리 체계 필요',
            },
        }
        for name, info in option_info.items():
            st.markdown(
                f'<div class="dday-card" style="margin-bottom:8px">'
                f'<b style="color:#f5a623">{name}</b><br>'
                f'<span style="color:#a8b2c1;font-size:0.8rem">'
                f'기간: {info["조달기간"]} | 비용: {info["비용"]}<br>'
                f'물량: {info["가용물량"]}</span><br>'
                f'<span style="color:#00cc88;font-size:0.78rem">✓ {info["장점"]}</span><br>'
                f'<span style="color:#e94560;font-size:0.78rem">✗ {info["단점"]}</span>'
                f'</div>',
                unsafe_allow_html=True,
            )

    # 권고 전략 자동 출력
    st.markdown("<br>", unsafe_allow_html=True)
    if coverage_days >= target_days:
        rec = "🟢 **비축 방출 단독** — 현재 비축으로 목표 기간을 충분히 커버합니다."
    elif coverage_days >= 7:
        rec = "⚡ **복합 전략 권고** — 비축 방출로 D+7 확보 후, 긴급 수입으로 장기 대응하세요."
    else:
        rec = "✈️ **긴급수입 즉시 발주 + 비축 방출 병행** — 비축이 임계 미달, 즉각적 외부 조달이 필요합니다."
    st.info(f"💡 **권고 전략:** {rec}")


# ══════════════════════════════════════════════════════════════
# TAB 3: 정책 권고
# ══════════════════════════════════════════════════════════════
with tab3:
    st.markdown("### 📌 즉각 대응 권고")
    pc1, pc2, pc3 = st.columns(3)
    with pc1:
        n_alt = 3 if restriction_pct >= 50 else 2
        st.markdown(f"""#### 📡 단기 (D+0~7)
- **비축 재고 {release_pct}% 긴급 방출** 승인
- 대체 공급선 **{n_alt}개국 이상** 긴급 접촉
- 관련 기업 수요 실태 즉시 파악
- 비상 대책반 구성""")
    with pc2:
        st.markdown(f"""#### 🔧 중기 (D+7~40)
- 피해 예상: **{cascade['D+40']['total_prod_loss']:.1f}조원**
- 고용 위협: **{int(cascade['D+40']['total_emp_loss']):,}명** 모니터링
- 수입선 다변화 긴급 MOU 지원
- KOMIR 긴급 비축 구매 요청""")
    with pc3:
        st.markdown(f"""#### 🏗️ 구조적 대응
- K-Supply Shield 상시 모니터링
- 제안①: 기업 재고 의무 보고 제도화
- 제안③: 공급 중단 보험 연계
- 핵심광물 비축 목표 **90일** 상향 검토""")

st.divider()
st.caption(
    "데이터: 한국은행 ECOS 2023년 산업연관표 연장표 | USGS MCS 2026 | "
    "관세청 수출입 실적 (2022~2026) | KOMIS 광물종합지수 (2025.07~2026.07) | "
    "본 시뮬레이터는 레온티에프 투입산출 모형 기반 추정치입니다."
)
