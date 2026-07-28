"""
K-CESS 계산 엔진
app.py(Streamlit)에서 사용하던 레온티에프 역행렬 기반 파급 계산 로직을 그대로 이식.
Streamlit 의존성 없이 순수 Python/pandas만 사용한다.
"""
import os
import pandas as pd

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(BASE_DIR, 'data')

EXCLUDE = ['기타', '행합', '열합', '감응도계수', '영향력계수']

# ──────────────────────────────────────────────────────────────
# 1. 데이터 로드 (산업연관표)
# ──────────────────────────────────────────────────────────────
_matrices_cache = None


def load_matrices():
    global _matrices_cache
    if _matrices_cache is not None:
        return _matrices_cache

    prod = pd.read_csv(os.path.join(DATA_DIR, 'prod.csv'), encoding='utf-8-sig')
    imp = pd.read_csv(os.path.join(DATA_DIR, 'imp.csv'), encoding='utf-8-sig')
    emp = pd.read_csv(os.path.join(DATA_DIR, 'emp.csv'), encoding='utf-8-sig')

    def to_matrix(df, year='2023'):
        cc = [c for c in df.columns if '수요부문' in c][0]
        rc = [c for c in df.columns if '투입부문' in c][0]
        d = df[~df[cc].isin(EXCLUDE) & ~df[rc].isin(EXCLUDE)]
        return d.pivot(index=rc, columns=cc, values=year).astype(float)

    _matrices_cache = (to_matrix(prod), to_matrix(imp), to_matrix(emp))
    return _matrices_cache


# ──────────────────────────────────────────────────────────────
# 2. 광물 마스터 데이터 (USGS MCS 2026)
# ──────────────────────────────────────────────────────────────
MINERAL_DATA = {
    '흑연 (Graphite)': {
        'en': 'Graphite', 'world_prod_2025': 1_900_000, 'china_mine_share': 74,
        'top_producer': '중국 (74%)', 'hs_codes': ['2504101000', '2504102000'],
        'korea_import_bn': 5_500, 'key_use': '배터리 음극재, 전기차', 'shock_example': 60,
        'supply_chain': ['광산품', '화학제품', '전기·전자기기', '운송장비'],
        'color': '#00b4d8', 'usgs_note': '한국 100% 수입의존, 對중국 수입 46%',
    },
    '리튬 (Lithium)': {
        'en': 'Lithium', 'world_prod_2025': 290_000, 'china_mine_share': 21,
        'top_producer': '호주 (32%), 칠레 (19%)', 'hs_codes': ['2836910000', '2825202000'],
        'korea_import_bn': 27_134, 'key_use': '배터리 양극재, 리튬이온전지', 'shock_example': 30,
        'supply_chain': ['광산품', '화학제품', '전기·전자기기', '운송장비'],
        'color': '#f72585', 'usgs_note': '관세청 2024 실측 2.7조원 (수산화+탄산). 2023 정점 11.1조',
    },
    '코발트 (Cobalt)': {
        'en': 'Cobalt', 'world_prod_2025': 310_000, 'china_mine_share': 1,
        'top_producer': 'DRC (74%), 인도네시아 (14%)', 'hs_codes': ['2605000000'],
        'korea_import_bn': 8_000, 'key_use': '배터리 양극재, 초합금', 'shock_example': 40,
        'supply_chain': ['광산품', '화학제품', '전기·전자기기', '운송장비'],
        'color': '#7209b7', 'usgs_note': 'DRC 2025년 수출 일시 금지, 중국 정제 70%+',
    },
    '니켈 (Nickel)': {
        'en': 'Nickel', 'world_prod_2025': 3_900_000, 'china_mine_share': 3,
        'top_producer': '인도네시아 (67%), 필리핀 (7%)', 'hs_codes': ['2604000000'],
        'korea_import_bn': 30_000, 'key_use': '스테인리스강, 배터리 양극재(NCM)', 'shock_example': 30,
        'supply_chain': ['광산품', '1차금속제품', '전기·전자기기', '운송장비'],
        'color': '#4361ee', 'usgs_note': '인도네시아 급부상, 글로벌 공급과잉 지속',
    },
    '망간 (Manganese)': {
        'en': 'Manganese', 'world_prod_2025': 20_000_000, 'china_mine_share': 4,
        'top_producer': '남아공 (38%), 가봉 (25%)', 'hs_codes': ['2602000000'],
        'korea_import_bn': 5_000, 'key_use': '철강, 배터리(LMFP), 알루미늄합금', 'shock_example': 50,
        'supply_chain': ['광산품', '1차금속제품', '기계·장비', '운송장비'],
        'color': '#3a86ff', 'usgs_note': '미국 100% 수입의존, 한국도 사실상 전량 수입',
    },
    '희토류 (Rare Earths)': {
        'en': 'Rare Earths', 'world_prod_2025': 390_000, 'china_mine_share': 69,
        'top_producer': '중국 (69%), 호주 (7%)', 'hs_codes': ['2846100000', '2846909000', '2805301000'],
        'korea_import_bn': 10_000, 'key_use': '영구자석(모터), 촉매, 형광체', 'shock_example': 50,
        'supply_chain': ['광산품', '화학제품', '전기·전자기기', '기계·장비'],
        'color': '#e63946', 'usgs_note': '2025년 4월 중국 수출통제 강화 (Sm·Gd·Tb·Dy 등). 관세청 2846 실측 ~868억',
    },
    '텅스텐 (Tungsten)': {
        'en': 'Tungsten', 'world_prod_2025': 85_000, 'china_mine_share': 79,
        'top_producer': '중국 (79%), 베트남 (4%)', 'hs_codes': ['2611000000'],
        'korea_import_bn': 3_000, 'key_use': '절삭공구(초경합금), 특수강, 전자부품', 'shock_example': 40,
        'supply_chain': ['광산품', '화학제품', '기계·장비', '전기·전자기기'],
        'color': '#fb8500', 'usgs_note': '2025년 2월 중국 수출통제 발동 (텅스텐 분말 포함)',
    },
    # 게르마늄·갈륨: korea_import_bn은 관세청 실측 데이터를 아직 확보하지 못해 잠정 추정치임
    # (다른 5종은 관세청 실측). 나머지 수치는 IEA/패스트마켓·글로벌이코노믹·파이낸셜타임스
    # 2026.7.15~17 보도 기준 (정책연구 1팀 배경자료 34p 인용).
    '게르마늄 (Germanium)': {
        'en': 'Germanium', 'world_prod_2025': 140, 'china_mine_share': 68,
        'top_producer': '중국 (68%)', 'hs_codes': ['8112921000'],
        'korea_import_bn': 400, 'key_use': '광섬유, 적외선광학, 태양전지, 반도체', 'shock_example': 70,
        'supply_chain': ['광산품', '화학제품', '컴퓨터, 전자 및 광학기기', '전기·전자기기'],
        'color': '#8338ec', 'usgs_note': '2026.7 기준 가격 5.5배 폭등(2,000→11,000달러/kg). korea_import_bn은 추정치',
    },
    '갈륨 (Gallium)': {
        'en': 'Gallium', 'world_prod_2025': 430, 'china_mine_share': 99,
        'top_producer': '중국 (99%, 정제 기준)', 'hs_codes': ['8112921000'],
        'korea_import_bn': 500, 'key_use': '화합물반도체(GaAs·GaN), LED, 태양전지', 'shock_example': 70,
        'supply_chain': ['광산품', '화학제품', '컴퓨터, 전자 및 광학기기', '전기·전자기기'],
        'color': '#ff006e', 'usgs_note': '2026.7 기준 가격 5.6배 폭등(500→2,800달러/kg), 中 정제 독점(프로젝트 블루). korea_import_bn은 추정치',
    },
}

DDAY_STAGES = {
    'D+7': {'label': '1단계: 원자재 재고 소진', 'ratio': 0.15, 'desc': '비축 재고 소진 → 긴급 대체공급선 모색'},
    'D+18': {'label': '2단계: 소재·부품 생산 중단', 'ratio': 0.55, 'desc': '중간재 투입 부족 → 배터리셀·부품 라인 중단'},
    'D+40': {'label': '3단계: 완성품·수출 차질', 'ratio': 1.00, 'desc': '완성차·전자제품 출하 중단 → 수출 손실 현실화'},
}


# ──────────────────────────────────────────────────────────────
# 3. 계산 엔진
# ──────────────────────────────────────────────────────────────
def run_simulation(shock_trillion, sector='광산품'):
    prod_mat, imp_mat, emp_mat = load_matrices()
    if sector not in prod_mat.columns:
        return None, None, None
    prod_impact = prod_mat[sector] * shock_trillion
    emp_impact = emp_mat[sector] * shock_trillion * 1000 if sector in emp_mat.columns else pd.Series(dtype=float)
    imp_impact = imp_mat[sector] * shock_trillion if sector in imp_mat.columns else pd.Series(dtype=float)
    return prod_impact, emp_impact, imp_impact


def d_day_cascade(shock_trillion):
    results = {}
    for key, s in DDAY_STAGES.items():
        eff = shock_trillion * s['ratio']
        pi, ei, _ = run_simulation(eff)
        results[key] = {
            'label': s['label'], 'desc': s['desc'], 'effective_shock': eff,
            'total_prod_loss': float(pi.sum()) if pi is not None else 0.0,
            'total_emp_loss': float(ei.sum()) if ei is not None else 0.0,
            'prod_by_sector': pi,
        }
    return results


def stockpile_sim(days_stock, daily_cons_ton, restriction_pct, release_pct=50):
    daily_gap = daily_cons_ton * restriction_pct / 100
    total_stock = daily_cons_ton * days_stock
    release_per_day = total_stock * (release_pct / 100) / max(days_stock, 1)
    deficit_with = max(0, daily_gap - release_per_day)
    buffer_days = total_stock * (release_pct / 100) / daily_gap if daily_gap > 0 else 999
    return {
        'total_stock_ton': total_stock,
        'daily_gap_ton': daily_gap,
        'release_per_day': release_per_day,
        'buffer_days': buffer_days,
        'usable_stock': total_stock * release_pct / 100,
        'deficit_ratio_without': daily_gap / daily_cons_ton * 100 if daily_cons_ton > 0 else 0,
        'deficit_ratio_with': deficit_with / daily_cons_ton * 100 if daily_cons_ton > 0 else 0,
    }


def calc_priority(shock_trillion):
    prod_mat, imp_mat, emp_mat = load_matrices()
    if '광산품' not in prod_mat.columns:
        return None
    pv = (prod_mat['광산품'] * shock_trillion).rename('생산손실')
    ev = (emp_mat['광산품'] * shock_trillion * 1000).rename('고용손실') \
        if '광산품' in emp_mat.columns else pd.Series(0, index=pv.index, name='고용손실')
    df = pd.concat([pv, ev], axis=1).reset_index()
    df.columns = ['산업', '생산손실', '고용손실']
    df = df[df['생산손실'] > 0].copy()
    mp = df['생산손실'].max()
    me = max(df['고용손실'].max(), 1)
    df['종합점수'] = (df['생산손실'] / mp) * 0.6 + (df['고용손실'] / me) * 0.4
    df = df.nlargest(8, '종합점수').reset_index(drop=True)
    df['순위'] = range(1, len(df) + 1)
    return df


def sector_impacts(shock_trillion, min_loss=0.001):
    prod_impact, _, _ = run_simulation(shock_trillion)
    if prod_impact is None:
        return []
    s = prod_impact[prod_impact > min_loss].sort_values(ascending=False)
    return [{'sector': idx, 'prod_loss': float(val)} for idx, val in s.items()]


def stockpile_analysis(shock_trillion, restriction_pct, days_stock, daily_cons_ton,
                        release_pct, import_cost, target_days):
    sr = stockpile_sim(days_stock, daily_cons_ton, restriction_pct, release_pct)
    gap_per_day = daily_cons_ton * restriction_pct / 100
    usable_stock = sr['usable_stock']

    needed_stock = gap_per_day * target_days
    shortage = max(0, needed_stock - usable_stock)
    coverage_days = usable_stock / gap_per_day if gap_per_day > 0 else 999
    cover_ratio = min(1.0, usable_stock / needed_stock) if needed_stock > 0 else 1.0
    emergency_cost = shortage * import_cost

    min_danger = gap_per_day * 7
    min_safe = gap_per_day * 18
    min_strat = gap_per_day * 45
    if usable_stock < min_danger:
        signal = 'RED'
    elif usable_stock < min_safe:
        signal = 'YELLOW_CAUTION'
    elif usable_stock < min_strat:
        signal = 'YELLOW_GOOD'
    else:
        signal = 'GREEN'
    d2s = max(0, min_safe - usable_stock)
    d2st = max(0, min_strat - usable_stock)

    priority_df = calc_priority(shock_trillion)
    priority = []
    if priority_df is not None:
        for _, row in priority_df.iterrows():
            priority.append({
                'rank': int(row['순위']), 'industry': row['산업'],
                'prod_loss': float(row['생산손실']), 'emp_loss': float(row['고용손실']),
                'score': float(row['종합점수']),
            })

    if coverage_days >= target_days:
        rec_key, rec_text = 'hold', '비축 방출 단독 — 현재 비축으로 목표 기간을 충분히 커버합니다.'
    elif coverage_days >= 7:
        rec_key, rec_text = 'combined', '복합 전략 권고 — 비축 방출로 D+7 확보 후, 긴급 수입으로 장기 대응하세요.'
    else:
        rec_key, rec_text = 'import', '긴급수입 즉시 발주 + 비축 방출 병행 — 비축이 임계 미달, 즉각적 외부 조달이 필요합니다.'

    return {
        'gap_per_day': gap_per_day, 'usable_stock': usable_stock,
        'needed_stock': needed_stock, 'shortage': shortage,
        'coverage_days': coverage_days, 'cover_ratio': cover_ratio,
        'emergency_cost': emergency_cost,
        'thresholds': {
            'min_danger': min_danger, 'min_safe': min_safe, 'min_strat': min_strat,
            'signal': signal, 'd2s': d2s, 'd2st': d2st,
            'd2s_cost': d2s * import_cost, 'd2st_cost': d2st * import_cost * 0.85,
        },
        'priority': priority,
        'recommendation': {'key': rec_key, 'text': rec_text},
    }
