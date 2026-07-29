"""
공공데이터포털 "관세청_품목별 국가별 수출입실적(GW)" API 연동.
엔드포인트: http://apis.data.go.kr/1220000/nitemtrade/getNitemtradeList

CLAUDE.md 방침대로 이 모듈은 데이터 수집 레이어일 뿐이다 — 계산 엔진(engine.py)은
건드리지 않는다. scripts/refresh_customs_snapshot.py가 이 모듈로 받아온 데이터를
data/customs_live_snapshot.csv에 저장해두면, 필요할 때 그 CSV만 읽어 쓰는 구조다.

실제 서비스키로 확인 완료 (2026-07-29) — 이 API는 type=json 파라미터를 무시하고 항상
XML로 응답한다. 조회기간(strtYymm~endYymm)은 반드시 1년 이내여야 한다(넘으면
resultCode=99, "조회기간은 1년 이내"). 정상 응답은 resultCode=00이고, 결과에는
매월 데이터 외에 hsCd="-"·year="총계"인 합계 로우가 함께 온다.
"""
import os
import xml.etree.ElementTree as ET

import requests
from dotenv import load_dotenv

load_dotenv()

ENDPOINT = "http://apis.data.go.kr/1220000/nitemtrade/getNitemtradeList"


def _service_key():
    key = os.environ.get("DATA_GO_KR_API_KEY")
    if not key:
        raise RuntimeError(
            "DATA_GO_KR_API_KEY가 설정되어 있지 않습니다. .env.example을 .env로 복사하고 "
            "공공데이터포털에서 발급받은 서비스키를 넣어주세요."
        )
    return key


def fetch_raw(hs_sgn, cnty_cd, strt_yymm, end_yymm, num_of_rows=100):
    """품목별 국가별 수출입실적 API를 호출해 XML 응답 원문(str)을 반환한다."""
    params = {
        "serviceKey": _service_key(),
        "hsSgn": hs_sgn,
        "cntyCd": cnty_cd,
        "strtYymm": strt_yymm,
        "endYymm": end_yymm,
        "numOfRows": num_of_rows,
        "pageNo": 1,
    }
    resp = requests.get(ENDPOINT, params=params, timeout=15)
    resp.raise_for_status()
    return resp.text


def parse_items(raw_xml, include_total_row=False):
    """fetch_raw() 결과(XML 문자열)를 표준 dict 리스트로 변환한다.
    resultCode != '00'이면 (예: 조회기간 1년 초과) RuntimeError를 낸다.
    include_total_row=False면 year="총계"인 합계 로우는 제외하고 월별 데이터만 남긴다."""
    root = ET.fromstring(raw_xml)
    result_code = (root.findtext("./header/resultCode") or "").strip()
    result_msg = (root.findtext("./header/resultMsg") or "").strip()
    if result_code != "00":
        raise RuntimeError(f"resultCode={result_code} {result_msg}")

    items = []
    for item in root.findall("./body/items/item"):
        row = {
            "hs_code": item.findtext("hsCd"),
            "country_code": item.findtext("statCd"),
            "country_name": item.findtext("statCdCntnKor1"),
            "item_name": item.findtext("statKor"),
            "period": item.findtext("year"),
            "import_amount_usd": item.findtext("impDlr"),
            "import_weight_kg": item.findtext("impWgt"),
            "export_amount_usd": item.findtext("expDlr"),
            "export_weight_kg": item.findtext("expWgt"),
            "balance_usd": item.findtext("balPayments"),
        }
        if not include_total_row and row["period"] == "총계":
            continue
        items.append(row)
    return items
