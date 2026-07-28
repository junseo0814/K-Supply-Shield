# Handoff: K-Supply Shield — 핵심광물 공급망 관리 플랫폼 프론트엔드

## Overview
산업통상부(가상) 핵심광물 공급망 관리 플랫폼 "K-Supply Shield"의 프론트엔드 리디자인. FTA 강국, KOREA(fta.motie.go.kr)의 디자인 시스템(네이비 #1B2556 + 화이트 + 블루 #007AFF 팔레트, 관공서 톤)을 차용해 5개 화면(로그인, 통합 대시보드, 충격 시뮬레이터, 비축·조달 의사결정 도구, 시나리오 비교, 정책·보고서)을 구현했다. 원본 기획 프롬프트는 `original-design-brief.md` 참고.

## About the Design Files
이 번들의 HTML 파일들은 **디자인 레퍼런스**다 — 의도한 화면 구조·상호작용·비주얼을 보여주는 프로토타입이며, 그대로 복사해 붙일 프로덕션 코드가 아니다. 작업은 이 HTML 디자인을 대상 코드베이스의 기존 스택(React/Vue/등)과 기존 패턴·컴포넌트 라이브러리를 이용해 **재구현**하는 것이다. 아직 프레임워크가 없다면 프로젝트에 가장 적합한 스택을 선택해 구현한다.

`K-Supply Shield.dc.html`은 Claude 환경 전용 "Design Component" 포맷(커스텀 템플릿 문법 `{{ }}`, `<sc-for>`, `<sc-if>` 등과 `support.js` 런타임에 의존)이라 브라우저 밖에서는 그대로 동작하지 않는다 — 마크업/로직/스타일 값을 참고용 소스로만 사용할 것. 실제 지도는 `worldmap.html`(d3 + topojson, 순수 HTML/JS로 완결된 iframe)이며 이 파일은 그대로 재사용하거나 이식 가능하다.

## Fidelity
**High-fidelity.** 색상 hex 값, 레이아웃 구조, 타이포그래피, 인터랙션까지 확정된 상태로, 코드베이스의 기존 컴포넌트 라이브러리를 사용해 픽셀 단위로 재현하는 것을 목표로 한다.

## Screens / Views

### 0. 로그인
- **목적**: 서비스 진입점. 로그인 성공 시 통합 대시보드로 이동.
- **레이아웃**: 전체 화면 중앙 정렬 플렉스(`min-height:100vh`, `align-items:center; justify-content:center`), 배경 `#F1F2F3`. 카드: 흰 배경, `1px solid #DDDDDD`, width 380px, padding 40px 36px.
- **컴포넌트**:
  - 산업통상부 로고(세로형, `assets/motie-logo-stacked.png`), height 96px, 카드 상단 중앙
  - 서브타이틀 "핵심광물 공급망 관리시스템" — 11px, `#999999`, 중앙 정렬
  - 아이디 입력(text), 비밀번호 입력(password) — 각각 라벨(12px bold `#333333`) + input(height 40px, `1px solid #DDDDDD`, radius 3px, padding 0 10px, font-size 13px)
  - 로그인 버튼 — full width, height 44px, 배경 `#1B2556`, 글자 흰색 bold 14px, border 없음
  - 하단 "아이디 찾기 | 비밀번호 찾기" 링크, 11px, 가운데 정렬, 구분자 `#DDDDDD`

### 1. 헤더 / GNB (모든 로그인 후 화면 공통)
- **레이아웃**: height 60px, 배경 흰색, 하단 `1px solid #DDDDDD`. flex row, padding 0 24px.
- **좌측 그룹**: 산업통상부 가로형 로고(`assets/motie-logo-horizontal.png`, height 42px) + 세로 구분선(`1px solid #DDDDDD`, height 24px) + "K-Supply Shield"(16px, bold, italic, `#1B2556`) / 서브카피 "핵심광물 공급망 관리시스템"(11px, `#666666`)
- **GNB 탭** (좌측 그룹 바로 우측, `margin-left:auto`로 우측 정렬 시작): 5개 탭 — 공급망 현황 / 충격 시뮬레이터 / 비축·조달 / 시나리오 비교 / 정책·보고서. 각 탭 height 60px, padding 0 12px, font-size 13px, `white-space:nowrap`. 활성 탭: `#1B2556` bold + 하단 3px solid `#1B2556` 보더. 비활성: `#333333`. 좁은 화면에서는 `overflow-x:auto`로 가로 스크롤.
- **우측**: "홍길동 책임관" 텍스트, 13px `#333333`, `margin-left:32px`.
- **푸터** (모든 화면 하단): 배경 `#1B2556`, 흰 텍스트, padding 24px, flex space-between. 좌측 기관 주소, 우측 유관기관 링크(조달청/KOTRA/광물자원공사/개인정보처리방침).

### 2. 통합 대시보드 (공급망 현황) — 메인
- 상단 긴급 알림 배너: 배경 `#C0392B`, 흰 텍스트, "⚠ 코발트 공급 위험 감지 — 즉각 조치 필요" + "바로가기" 버튼(outline).
- **광물 공급망 지도 카드**: 좌측 세계지도(iframe `worldmap.html`, height 380px) + 우측 300px 폭 "국가 상세 정보" 패널(클릭한 국가의 이름/수출광물/의존도%/위험도 배지 표시). 지도 위 탭: 전체 광물 / 위험 광물만 / 국가별 보기.
- **KPI 스트립**: 6열 grid, 각 카드 흰 배경 + `1px solid #DDDDDD`, 라벨 12px `#666666` + 값 26px bold(색상은 지표별로 다름: 네이비/레드/블루/그린).
- **최신 알림**: 4개 탭(공급 이상/정책 변동/시장 동향/입고 현황)로 필터링되는 리스트. 각 행: 시간(11px `#999999`) + 제목(13px) + 위험도 배지(우측, 색상별).
- **정책·보고서 카드 3개**: 각각 배경색이 다른 컬러 블록(네이비/블루/레드), 제목+설명.
- **유관기관 배너**: 흰 카드 5개 가로 나열(조달청/KOTRA/광물자원공사/한국무역협회/관세청).

### 3. 충격 시뮬레이터
- **좌측 패널(300px)**: ① 광물 선택(select) ② 충격 유형(라디오 5종) ③ 공급 감소율(슬라이더 0-100%, 75% 초과 시 상단 헤더가 붉게 flash) ④ 지속 기간(1/3/6/12/24개월 토글) ⑤ 대상 국가 체크박스(7개국) + 실행 버튼.
- **중앙**: KPI 4개(예상 충격률/영향기간/비축여유/긴급조달필요량) → Chart.js 라인 차트(정상 공급선 점선 / 충격 시나리오 영역 / 안전기준선) → 국가별 영향도 테이블(광물별 충격 전/후/변화율/위험도 배지) → 공급망 파급 경로 다이어그램(원산지→항만→중간재→국내산업→최종재, 화살표 연결).
- **우측 패널(280px)**: 위험 경보 카드, 권고 조치 리스트, 비축 현황 대비 progress bar, "시나리오로 저장" 버튼.

### 4. 비축·조달 의사결정 도구
4개 탭(비축 현황 / 조달 시뮬레이션 / 의사결정 매트릭스 / 이력 관리):
- **비축 현황**: 요약 스트립(총 관리광물/위험/경계/정상 건수) + 5개 광물 카드(현재 비축일수, progress bar, 목표 대비, "조달 요청" 버튼).
- **조달 시뮬레이션**: 좌측 조건 설정 패널(광물/수량/조달방식 4종/예산 슬라이더/납기/리스크 허용수준) + 우측 3개 옵션 카드(긴급현물/장기계약/공동비축 — 단가/총비용/납기/리스크점수/공급국, 1순위 배지) + 레이더 차트(비용효율/납기속도/리스크안정성) + HHI 다변화 지수 바.
- **의사결정 매트릭스**: 필터(광물/위험도) + 테이블(광물/현재비축/위험도/충격가능성/권고조치/담당자/진행상태 4단계 바/액션 버튼).
- **이력 관리**: 조달 이력 테이블(일자/광물/액션유형/수량/담당자/상태 배지).

### 5. 시나리오 비교
- 상단 시나리오 A/B/C 토글 체크박스 + "비교 실행"/"내보내기 PDF" 버튼.
- 선택된 시나리오 수만큼 grid 컬럼 동적 생성(`repeat(n,1fr)`).
- 각 시나리오 헤더 컬러 블록 + KPI 카드(최악값은 붉은 배경 하이라이트) + 위험도 히트맵(광물별 점수 배지) + 종합평가 레이더 차트(공급안보/비용효율/조달속도/다변화/회복력) + AI 권고 요약 박스.
- 공통: 공급량 시계열 비교 라인차트, 비용 비교 바차트, 파레토 분석(누적 기여도 바).
- 하단 고정 액션바(`position:fixed;bottom:0`): "최적 시나리오: B" + 실행계획 수립/보고서 생성 버튼.

### 6. 정책·보고서
- 발간물 카드 3개(컬러 블록) + 카테고리 필터(전체/정책발표/발간보고서/법령고시) + 리스트(일자/카테고리 배지/제목/다운로드 버튼).

## Interactions & Behavior
- GNB 탭 클릭 → 해당 화면으로 전환 (SPA, 페이지 리로드 없음).
- 세계지도: 국가 클릭 시 `postMessage({type:'countryClick', ...})`로 부모 프레임에 전달 → 우측 상세 패널 갱신. 탭 전환(`setMode`)도 postMessage로 iframe에 전달.
- 슬라이더/셀렉트/체크박스 변경 시 즉시 하위 KPI·차트·테이블 재계산(디바운스 없음, 실시간 반영).
- 시뮬레이션 "실행" 버튼: 1.2초 로딩 상태(버튼 텍스트 "분석 중...") 후 "마지막 실행" 타임스탬프 갱신.
- 차트는 Chart.js(라인/바/레이더), 데이터 변경 시 `chart.update()`로 갱신(destroy/recreate 아님).
- 로그인 폼: 실제 인증 없음 — 버튼 클릭 시 즉시 로그인 처리 후 대시보드로 전환.

## State Management
필요한 상태 변수(현재 프로토타입 기준):
- `activePage`: 'dashboard' | 'simulator' | 'procurement' | 'scenario' | 'reports'
- `loggedIn`, `loginId`, `loginPw`
- 대시보드: `heroTab`(all/risk/country), `alertTab`(supply/policy/market/inbound), `selectedCountry`
- 시뮬레이터: `simMineral`, `simShockType`, `simIntensity`(0-100), `simDuration`, `simCountries`(국가별 boolean), `simRunning`, `simRanAt`
- 조달: `procTab`, `simProcMineral`, `procQty`, `procMethod`, `procBudget`, `procDeadline`, `procRisk`, `matrixMineralFilter`, `matrixRiskFilter`
- 시나리오: `scenSelected`(A/B/C boolean)
- 보고서: `reportsFilter`

데이터는 현재 모두 프로토타입 내 하드코딩된 목업(광물 5종, 국가 7개, 실제 백엔드 연동 없음) — 실제 구현 시 API 연동 필요.

## Design Tokens
- **Primary Navy**: `#1B2556` — 헤더 로고/타이틀, 활성 탭, 버튼, 푸터, KPI 강조
- **Secondary Blue**: `#007AFF` / `#3B9AE1`(지도용) — 정보성 배지, 링크, 보조 강조
- **Danger Red**: `#C0392B` — 위험 경보, 위험 배지
- **Warning Orange**: `#E67E22` / `#F39C12` — 경계/주의 배지
- **Success Green**: `#27AE60` — 정상 배지
- **Background**: `#F1F2F3`(페이지 전체), `#FFFFFF`(카드), `#F8F9FA`(테이블 zebra)
- **Border**: `#DDDDDD`
- **Text**: `#222222`(본문), `#333333`(서브헤딩), `#666666`/`#999999`(보조/캡션)
- **Font**: Noto Sans KR (400/500/700/900) — 전체 유일 서체
- **Spacing**: 카드 padding 16-24px, 카드 간 gap 12-16px, 컨텐츠 max-width 1280px 중앙 정렬
- **Border radius**: 대부분 각진 사각형(0-3px) — 관공서 톤, 큰 라운드 지양

## Assets
- `assets/motie-logo-stacked.png` — 산업통상부 로고(세로형), 로그인 화면용, 사용자 업로드 원본
- `assets/motie-logo-horizontal.png` — 산업통상부 로고(가로형), 헤더용, 사용자 업로드 원본
- `assets/motie-logo-horizontal-transparent.png` — 위 가로형 로고의 배경 투명·흰 글자 처리 버전(현재 미사용, 흰 배경 헤더로 변경되며 원본 `motie-logo-horizontal.png` 사용 중)
- 세계지도는 `worldmap.html` 내부에서 `world-atlas@2.0.2`(topojson, CDN)를 fetch — 별도 이미지 자산 없음. 국가 라벨은 국기 이모지 사용.

## Files
- `K-Supply Shield.dc.html` — 메인 애플리케이션 전체(로그인 + 5개 화면 + 헤더/푸터), Claude Design Component 포맷
- `worldmap.html` — 세계지도 컴포넌트(d3 + topojson), iframe으로 임베드됨. 순수 HTML/JS라 그대로 이식 가능
- `original-design-brief.md` — 원본 기획 프롬프트(디자인 시스템 표, 화면별 요구사항 상세)
