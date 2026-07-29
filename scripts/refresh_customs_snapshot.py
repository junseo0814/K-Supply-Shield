"""
K-CESS 데이터 수집 스크립트 — data/customs_live_snapshot.csv 갱신용.

data/customs_import_*.csv(수기로 정리한 참고 원본)는 건드리지 않는다 — 그 파일들은
비고란에 담당자가 직접 남긴 주석(예: "한국은 순수출국", "2024 미수집")이 있어 자동
덮어쓰기 대상이 아니다. 이 스크립트는 backend/engine.py의 MINERAL_DATA에 이미 있는
hs_codes를 기준으로, app.js COUNTRY_DEPENDENCY와 동일한 6개 공급 위험국의 최근 12개월
관세청 실적을 받아와 별도의 "실시간 스냅샷" 파일만 새로 만든다.

사전 준비:
  1. pip install -r requirements.txt
  2. .env.example을 .env로 복사하고 DATA_GO_KR_API_KEY 채우기
실행: python scripts/refresh_customs_snapshot.py
"""
import csv
import datetime
import os
import sys

try:
    sys.stdout.reconfigure(encoding="utf-8")
except AttributeError:
    pass

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend import customs_api, engine

DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data")
OUT_PATH = os.path.join(DATA_DIR, "customs_live_snapshot.csv")

# worldmap.html DATA / app.js COUNTRY_DEPENDENCY와 동일 소스의 6개 공급 위험국
COUNTRY_CODES = {"중국": "CN", "콩고민주공화국": "CD", "칠레": "CL", "호주": "AU", "필리핀": "PH", "인도네시아": "ID"}

FIELDNAMES = ["mineral", "country", "hs_code", "country_code", "country_name", "item_name", "period",
              "import_amount_usd", "import_weight_kg",
              "export_amount_usd", "export_weight_kg", "balance_usd"]


def yymm_range_last_12_months():
    today = datetime.date.today()
    end = today.replace(day=1) - datetime.timedelta(days=1)  # 전월 말일 기준 (당월은 통계 미확정)
    start = (end.replace(day=1) - datetime.timedelta(days=335))  # 대략 11개월 전
    return start.strftime("%Y%m"), end.strftime("%Y%m")


def main():
    strt_yymm, end_yymm = yymm_range_last_12_months()
    print(f"조회 기간: {strt_yymm} ~ {end_yymm}")

    rows = []
    for mineral_key, m in engine.MINERAL_DATA.items():
        for hs_code in m.get("hs_codes", []):
            for country_name, country_code in COUNTRY_CODES.items():
                try:
                    raw = customs_api.fetch_raw(hs_code, country_code, strt_yymm, end_yymm)
                    items = customs_api.parse_items(raw)
                except Exception as e:
                    print(f"[실패] {mineral_key} · {hs_code} · {country_name}: {e}")
                    continue
                if not items:
                    print(f"[결과없음] {mineral_key} · {hs_code} · {country_name} — 해당 기간 실적 없음")
                    continue
                for it in items:
                    rows.append({"mineral": mineral_key, "country": country_name, **it})

    if not rows:
        print("\n가져온 데이터가 없습니다. 위 [실패]/[결과없음] 로그에서 원인을 먼저 확인해주세요.")
        print("(자주 있는 원인: CUSTOMS_API_KEY 미설정, 개발계정 승인 대기, 필드명 불일치)")
        return

    with open(OUT_PATH, "w", newline="", encoding="utf-8-sig") as f:
        writer = csv.DictWriter(f, fieldnames=FIELDNAMES)
        writer.writeheader()
        writer.writerows(rows)
    print(f"\n완료: {len(rows)}건 저장 → {OUT_PATH}")


if __name__ == "__main__":
    main()
