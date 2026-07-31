"""
공공데이터포털 "대한무역투자진흥공사(KOTRA)_단신속보뉴스" API 연동.
엔드포인트: https://apis.data.go.kr/B410001/shortBreakingNews/shortBreakingNews
(경로에 shortBreakingNews가 두 번 들어간다 — 리소스명과 오퍼레이션명이 같다.
실제 "미리보기" 테스트 호출 URL로 확인했다, 2026-07-29.)

정책연구 배경 PPT가 지적한 "① 사후 통계 의존" 문제(관세청 통계는 2~4주 지연 반영)를
근본적으로 푸는 소스 — 통계가 아니라 KOTRA 해외무역관이 올리는 뉴스/공시 자체를 가져온다.
search1은 제목 키워드 필터로 보인다(공식 문서 미확인 — 응답 결과로 역추정, search1=""이면
전체 18,000여 건, 최신순으로 반환됨을 확인).
"""
import json
import os
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta

import requests
from dotenv import load_dotenv

load_dotenv()

ENDPOINT = "https://apis.data.go.kr/B410001/shortBreakingNews/shortBreakingNews"

# K-CESS 7대 핵심광물 + 게르마늄/갈륨 관련 정책·공급망 뉴스를 잡기 위한 기본 검색 키워드.
DEFAULT_KEYWORDS = [
    "희토류", "리튬", "코발트", "니켈", "망간", "흑연", "텅스텐", "게르마늄", "갈륨",
    "수출통제", "핵심광물", "공급망", "광산",
]


def _service_key():
    key = os.environ.get("DATA_GO_KR_API_KEY")
    if not key:
        raise RuntimeError(
            "DATA_GO_KR_API_KEY가 설정되어 있지 않습니다. .env.example을 .env로 복사하고 "
            "공공데이터포털에서 발급받은 서비스키를 넣어주세요."
        )
    return key


def fetch_raw(search1="", search2="", num_of_rows=20, page_no=1):
    """단신속보뉴스를 검색해 JSON 응답 원문(str)을 반환한다.
    search1: 제목 키워드 필터(빈 문자열=전체), search2: 작성일(YYYYMMDD, 옵션)."""
    params = {
        "serviceKey": _service_key(),
        "type": "json",
        "numOfRows": num_of_rows,
        "pageNo": page_no,
        "search1": search1,
        "search2": search2,
    }
    resp = requests.get(ENDPOINT, params=params, timeout=15)
    resp.raise_for_status()
    return resp.text


def parse_items(raw_json):
    """fetch_raw() 결과(JSON 문자열)를 표준 dict 리스트로 변환한다."""
    data = json.loads(raw_json)
    header = data.get("response", {}).get("header", {})
    if header.get("resultCode") != "00":
        raise RuntimeError(f"resultCode={header.get('resultCode')} {header.get('resultMsg')}")
    body = data.get("response", {}).get("body", {})
    items = body.get("itemList", {}).get("item", [])
    if isinstance(items, dict):
        items = [items]
    return [
        {
            "country": it.get("nat"),
            "title": it.get("nttSj"),
            # API가 주는 kotraNewsUrl 필드는 옛 URL 스킴(bbsGbn/bbsSn)이라 실제로는 404가 뜬다
            # (2026-07-29 확인). 실제 사이트가 쓰는 SITE_NO/MENU_ID/CONTENTS_NO 스킴으로 직접 구성.
            "url": f"https://dream.kotra.or.kr/kotranews/cms/news/actionKotraBoardDetail.do"
                   f"?SITE_NO=3&MENU_ID=180&CONTENTS_NO=1&pNttSn={it.get('nttSn')}",
            "date": it.get("othbcDt"),
            "id": it.get("nttSn"),
            "office": it.get("kbc"),
            "region": it.get("regn"),
        }
        for it in items
    ]


def _fetch_one(kw, rows_per_keyword):
    """실패하면 None, "결과 0건"이면 빈 리스트를 반환한다 — 이 둘을 구분해야 위(호출부)에서
    "API 호출 자체가 실패했다"를 "그냥 뉴스가 없다"로 착각해 빈 결과를 캐싱하지 않는다."""
    try:
        return parse_items(fetch_raw(search1=kw, num_of_rows=rows_per_keyword))
    except Exception:
        return None


# 한때 동시 요청 수를 6개로 제한했었는데, 오히려 13개 키워드가 3배치(6+6+1)로 나뉘어
# 순차 실행되면서 전체 응답이 30초 이상 걸려 프런트엔드에서 타임아웃/실패로 보이는
# 역효과가 있었다(2026-07-31 실측). data.go.kr이 동시 호출 자체를 막는다는 근거는
# 없었으므로, 키워드 수만큼 그대로 병렬 실행해 원래의 빠른 응답 속도로 되돌린다.
MAX_CONCURRENT_REQUESTS = 20


def fetch_recent_by_keywords(keywords=None, rows_per_keyword=10):
    """여러 키워드로 병렬 검색해 중복(id 기준) 제거 후 날짜 내림차순으로 합쳐 반환한다.
    키워드별 API 호출이 순차 실행 시 10초 이상 걸려 스레드풀로 병렬화했다.
    모든 키워드 호출이 실패하면(레이트리밋 등) RuntimeError를 던진다 — 호출부가 이걸
    "뉴스 0건"으로 착각해 빈 결과를 캐싱하지 않도록 하기 위함."""
    keywords = keywords or DEFAULT_KEYWORDS
    with ThreadPoolExecutor(max_workers=min(MAX_CONCURRENT_REQUESTS, len(keywords))) as ex:
        results = list(ex.map(lambda kw: _fetch_one(kw, rows_per_keyword), keywords))
    if all(r is None for r in results):
        raise RuntimeError("KOTRA API 호출이 모든 키워드에서 실패했습니다 (레이트리밋 또는 네트워크 문제로 추정).")
    seen = {}
    for items in results:
        for it in (items or []):
            seen[it["id"]] = it
    return sorted(seen.values(), key=lambda x: x["date"] or "", reverse=True)


# 광물별 뉴스 기반 조기경보 — 광물 이름을 키워드로 개별 검색해, 제목에 위험 신호 단어가
# 포함된 최신 기사가 있으면 그 광물을 "뉴스로 위험 신호가 감지됨"으로 태깅한다.
# (기사 본문은 API로 못 가져와 제목만으로 판단 — 과도하게 넓은 단어는 오탐이 잦아서
# 뺐다. "제한"/"규제"/"관세"처럼 광물과 무관한 일반 무역기사에도 흔한 단어는 제외.)
MINERAL_SHORT_NAMES = ["흑연", "리튬", "코발트", "니켈", "망간", "희토류", "텅스텐", "게르마늄", "갈륨"]
DANGER_WORDS = ["수출통제", "수출 통제", "수출금지", "수출 금지", "수입금지", "수입 금지", "금수", "봉쇄", "쿼터"]
# KOTRA 단신속보뉴스 데이터셋 자체가 얇아서(세션 중 확인된 특성), 위험 단어가 걸려도
# 몇 년 지난 기사가 걸리는 경우가 있다 — 최근 기사가 아니면 "지금의" 조기경보로 보기
# 어려우므로 최근 180일 이내 기사만 인정한다.
RECENT_WINDOW_DAYS = 365


def _has_danger_word(title):
    if not title:
        return False
    return any(w in title for w in DANGER_WORDS)


def _is_recent(date_str):
    if not date_str:
        return False
    try:
        d = datetime.strptime(date_str[:10], "%Y-%m-%d")
    except ValueError:
        return False
    return d >= datetime.now() - timedelta(days=RECENT_WINDOW_DAYS)


def mineral_news_alerts(rows_per_keyword=8):
    """{광물 짧은 이름: 위험 신호가 감지된 최신 기사} 형태로 반환한다.
    신호가 없거나(위험 단어 미포함) 오래된(365일 초과) 기사만 있는 광물은 제외한다.
    광물 9종 전부 호출이 실패하면 RuntimeError를 던진다(캐싱 방지 목적, fetch_recent_by_keywords와 동일 이유)."""
    with ThreadPoolExecutor(max_workers=min(MAX_CONCURRENT_REQUESTS, len(MINERAL_SHORT_NAMES))) as ex:
        results = dict(zip(MINERAL_SHORT_NAMES, ex.map(lambda kw: _fetch_one(kw, rows_per_keyword), MINERAL_SHORT_NAMES)))
    if all(v is None for v in results.values()):
        raise RuntimeError("KOTRA API 호출이 모든 광물에서 실패했습니다 (레이트리밋 또는 네트워크 문제로 추정).")
    alerts = {}
    for name, items in results.items():
        hit = next((it for it in (items or []) if _has_danger_word(it.get("title")) and _is_recent(it.get("date"))), None)
        if hit:
            alerts[name] = hit
    return alerts
