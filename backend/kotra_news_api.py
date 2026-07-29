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

import requests
from dotenv import load_dotenv

load_dotenv()

ENDPOINT = "https://apis.data.go.kr/B410001/shortBreakingNews/shortBreakingNews"

# K-CESS 7대 핵심광물 + 게르마늄/갈륨 관련 정책·공급망 뉴스를 잡기 위한 기본 검색 키워드.
DEFAULT_KEYWORDS = [
    "희토류", "리튬", "코발트", "니켈", "망간", "흑연", "텅스텐", "게르마늄", "갈륨",
    "수출통제", "핵심광물", "공급망",
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
            "url": it.get("kotraNewsUrl"),
            "date": it.get("othbcDt"),
            "id": it.get("nttSn"),
            "office": it.get("kbc"),
            "region": it.get("regn"),
        }
        for it in items
    ]


def fetch_recent_by_keywords(keywords=None, rows_per_keyword=10):
    """여러 키워드로 검색해 중복(id 기준) 제거 후 날짜 내림차순으로 합쳐 반환한다."""
    keywords = keywords or DEFAULT_KEYWORDS
    seen = {}
    for kw in keywords:
        try:
            raw = fetch_raw(search1=kw, num_of_rows=rows_per_keyword)
            items = parse_items(raw)
        except Exception:
            continue
        for it in items:
            seen[it["id"]] = it
    return sorted(seen.values(), key=lambda x: x["date"] or "", reverse=True)
