# K-Supply Shield — Claude Code 인수인계 문서

## 프로젝트 개요

**산업통상자원부 청년인턴 1조** (준서 외 5명)의 8월 장관급 발표용 정책 제안.
정책 제안 3개 중 핵심이 **K-Supply Shield** — 핵심광물 공급망 충격 시뮬레이터.

- **발표 일정:** 2026년 8월 (장관급)
- **작업 경로:** `C:\Users\준서\Desktop\인턴연구모임\`
- **실행 방법:** `streamlit run app.py`

---

## 정책 제안 3개 구조

| # | 제안 | 상태 |
|---|------|------|
| ① | 기업 재고 의무 보고 제도화 | 시뮬레이터에서 참조만 |
| ② | **K-Supply Shield 시뮬레이터** | ✅ 구현 완료 |
| ③ | 공급 중단 보험 | 시뮬레이터에서 참조만 |

---

## 시스템 아키텍처

```
데이터 소스 (KOMIS·관세청·한국은행·USGS·KOSIS)
        ↓
  n8n 데이터 파이프라인  ← 아직 미구현 (수동 수집으로 대체)
        ↓
  Python 계산 엔진 (레온티에프 역행렬, D-Day Cascade, 비축 최적화)
        ↓
  Streamlit 프론트엔드 (app.py) ← 현재 동작 중
```

**n8n은 데이터 자동 수집 레이어**일 뿐, 계산 로직과 무관. 현재는 CSV 파일로 수동 대체.

---

## 파일 구조

```
인턴연구모임/
├── app.py                         ← 메인 Streamlit 앱 (786줄, v2)
├── requirements.txt
├── CLAUDE.md                      ← 이 파일
├── 실행방법.txt
├── data/                          ← 앱이 실제로 읽는 데이터
│   ├── prod.csv                   ← 생산유발계수표 (한국은행 ECOS 2023 연장표)
│   ├── imp.csv                    ← 수입유발계수표
│   ├── emp.csv                    ← 취업유발계수표
│   ├── usgs_minerals_summary.csv  ← 7개 광물 USGS MCS 2026 요약
│   ├── komis_mineral_index.csv    ← KOMIS 광물종합지수 (2025.07~2026.07)
│   ├── customs_import_all_countries.csv ← 관세청 전세계 수입 실적
│   └── customs_import_china.csv   ← 관세청 對중국 수입 실적
└── 데이터셋/                       ← 원본 파일 보관
    ├── 1. 한국은행 산업연관표(투입계수)/
    │   ├── prod.csv, imp.csv, emp.csv  (data/에 복사된 원본)
    └── 5. USGS MCS 2026/
        ├── mcs2026.pdf
        └── usgs_minerals_summary.csv
```

> ⚠️ `app.py`의 `DATA_DIR`은 `./data/`를 가리킴. `prod.csv` 등은 반드시 `data/` 폴더 안에 있어야 함.

---

## app.py 핵심 구조 (786줄)

### 탭 구성
```
st.tabs([
    "① 충격 시뮬레이션",      ← Tab 1
    "② 비축 조달 의사결정",    ← Tab 2
    "📌 정책 권고"             ← Tab 3
])
```

### 계산 엔진 핵심 함수
```python
# 레온티에프 역행렬 기반 파급 계산
def run_simulation(shock_trillion, sector='광산품'):
    prod_impact = prod_mat[sector] * shock_trillion   # 생산 파급
    emp_impact  = emp_mat[sector]  * shock_trillion * 1000  # 고용 파급
    imp_impact  = imp_mat[sector]  * shock_trillion   # 수입 파급
    return prod_impact, emp_impact, imp_impact

# D-Day 단계별 충격 전파
def d_day_cascade(shock_trillion):
    # D+7: 15% 충격 (원자재 소진)
    # D+18: 55% 충격 (소재부품 중단)
    # D+40: 100% 충격 (완성품 차질)

# 비축량 최적화 역산
def stockpile_sim(days_stock, daily_cons_ton, restriction_pct, release_pct=50):
    # "D+N 버티려면 몇 톤?" 계산

# 방출 우선순위 산출
def calc_priority(shock_trillion):
    # 생산유발(60%) + 고용유발(40%) 종합점수 → 산업 순위 8개
```

### 광물 마스터 데이터 (MINERAL_DATA)
7개 광물: 흑연·리튬·코발트·니켈·망간·희토류·텅스텐
각 광물별 파라미터:
- `korea_import_bn`: 한국 연간 수입 규모 (억원, 관세청 실측)
- `shock_example`: 기본 시나리오 공급제한율 (%)
- `supply_chain`: 파급 산업 체인
- `china_mine_share`: 중국 광산 점유율 (USGS 2026)

리튬 실측치: **27,134억원** (관세청 2024, 수산화+탄산 합산)

---

## 데이터 현황

### ✅ 수집 완료

| 데이터 | 파일 | 출처 | 비고 |
|--------|------|------|------|
| 생산유발계수표 | data/prod.csv | 한국은행 ECOS 2023 연장표 | 32×32 행렬 |
| 수입유발계수표 | data/imp.csv | 한국은행 ECOS 2023 연장표 | |
| 취업유발계수표 | data/emp.csv | 한국은행 ECOS 2023 연장표 | |
| USGS 광물요약 | data/usgs_minerals_summary.csv | USGS MCS 2026 | 7개 광물 |
| KOMIS 광물종합지수 | data/komis_mineral_index.csv | KOMIS | 2025.07~2026.07 희소금속 +120% |
| 관세청 전세계 수입 | data/customs_import_all_countries.csv | 관세청 | 2022~2025, HS 10자리 |
| 관세청 對중국 수입 | data/customs_import_china.csv | 관세청 | 2022~2023 |

### ❌ 미수집 (슬라이더/추정으로 대체)
- UN Comtrade (중국→한국 무역량)
- KOSIS 산업별 생산액
- 국가 비축량 공식 수치

---

## 관세청 실측 수입 규모 (2024 기준)

| 광물 | HS코드 | 2024 수입액 | 비고 |
|------|--------|------------|------|
| 리튬 (수산화+탄산) | 2825202000, 2836910000 | 27,134억원 | 2023 정점 11.1조 |
| 황산니켈 | 2833240000 | 1,071억원 | 한국은 순수출국 |
| 세륨화합물 (희토류) | 2846100000 | 341억원 | 원료 기준 |
| 황산염기타 (코발트 추정) | 2833299000 | 159억원 | 단독 미분리 |

---

## KOMIS 핵심 수치 (발표 활용)

- 희소금속지수 2025-07: **1,370**
- 희소금속지수 2026-07: **3,011**
- 12개월 변화율: **+120%**
- 2026-01 급등 사유: 중국 희토류 수출통제 확대

---

## Tab 2 (② 비축 조달 의사결정) 4개 섹션

```
A. 비축량 최적화 역산
   - 목표 생존 일수 슬라이더 → 필요 비축량 계산
   - 커버리지 진행바 + 긴급수입 비용 자동 산출

B. 최소 안전 비축량 임계값
   - D+7 최소선 / D+18 안전선 / D+45 전략선
   - 현재 비축과 비교 → 신호등 (🔴🟡🟢)

C. 방출 우선순위 자동산출
   - 산업연관표 기반 종합점수 = 생산유발(60%) + 고용유발(40%)
   - 상위 8개 산업 순위 출력

D. 대체 조달 전략 비교
   - 비축방출 vs 긴급수입 vs 복합전략
   - 레이더 차트 (5개 지표: 속도·비용·물량·안정성·지속성)
   - 권고 전략 자동 출력
```

---

## 다음에 할 일 (우선순위 순)

### 1순위 — 앱 실행 테스트
```bash
cd C:\Users\준서\Desktop\인턴연구모임
pip install -r requirements.txt
streamlit run app.py
```
`data/` 폴더 안에 `prod.csv`, `imp.csv`, `emp.csv` 있는지 확인.
현재 `데이터셋/1. 한국은행 산업연관표(투입계수)/` 안에만 있을 수 있음 — `data/`로 복사 필요할 수 있음.

### 2순위 — UI/디자인 개선
현재 Streamlit 기본 다크테마. 발표용으로 더 세련되게 하고 싶음.
Figma MCP 또는 React로 교체 논의 중이었으나 결정 안 됨.

### 3순위 — n8n 파이프라인 구축 (시간 여유 있을 때)
KOMIS, 관세청 API 자동 수집 → `data/` CSV 갱신.
계산 로직은 건드리지 않고 데이터만 자동화.

---

## 주의사항

1. `app.py`의 CSV 로딩 시 `encoding='utf-8-sig'` 필수 (한글 깨짐 방지)
2. 산업연관표 필터링: `EXCLUDE = ['기타', '행합', '열합', '감응도계수', '영향력계수']`
3. 레온티에프 계산 섹터명은 `'광산품'` (한국은행 32부문 분류 기준)
4. `korea_import_bn`은 억원 단위, `shock_trillion`은 조원 단위 — 혼동 주의
   - `shock_trillion = korea_import_bn * restriction_pct / 100 / 10_000`

---

## requirements.txt

```
streamlit>=1.32.0
pandas>=2.0.0
numpy>=1.24.0
plotly>=5.18.0
openpyxl>=3.1.0
```
