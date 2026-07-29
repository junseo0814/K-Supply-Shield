"""
K-CESS FastAPI 백엔드
계산 엔진(engine.py)을 API로 감싸고, frontend/ 정적 파일을 서빙한다.
"""
import os
import pandas as pd
from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

from . import engine

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FRONTEND_DIR = os.path.join(BASE_DIR, 'frontend')
DATA_DIR = os.path.join(BASE_DIR, 'data')

app = FastAPI(title="K-CESS API")


class NoCacheStaticFiles(StaticFiles):
    """정적 파일(HTML/CSS/JS) 배포 후에도 브라우저가 이전 버전을 캐시해서 보여주는
    문제를 막기 위해 매 요청마다 재검증하도록 강제한다 (ETag/Last-Modified는 유지되어
    변경 없으면 304로 응답하므로 트래픽 부담은 적음)."""
    def file_response(self, *args, **kwargs):
        resp = super().file_response(*args, **kwargs)
        resp.headers["Cache-Control"] = "no-cache"
        return resp


@app.get("/api/minerals")
def get_minerals():
    return [
        {"key": key, **{k: v for k, v in m.items() if k != 'color' or True}}
        for key, m in engine.MINERAL_DATA.items()
    ]


@app.get("/api/simulate")
def simulate(
    mineral: str,
    restriction_pct: float = 30,
    korea_import_bn: float | None = None,
):
    if mineral not in engine.MINERAL_DATA:
        raise HTTPException(status_code=404, detail=f"unknown mineral: {mineral}")

    m = engine.MINERAL_DATA[mineral]
    if korea_import_bn is None:
        korea_import_bn = m['korea_import_bn']

    shock_trillion = korea_import_bn * restriction_pct / 100 / 10_000

    prod_impact, emp_impact, _ = engine.run_simulation(shock_trillion)
    total_prod = float(prod_impact.sum()) if prod_impact is not None else 0.0
    total_emp = float(emp_impact.sum()) if emp_impact is not None else 0.0
    multiplier = total_prod / shock_trillion if shock_trillion > 0 else 0.0

    cascade_raw = engine.d_day_cascade(shock_trillion)
    cascade = {
        k: {
            'label': v['label'], 'desc': v['desc'],
            'total_prod_loss': v['total_prod_loss'], 'total_emp_loss': v['total_emp_loss'],
        }
        for k, v in cascade_raw.items()
    }

    risk_level = "HIGH" if restriction_pct >= 50 else ("MEDIUM" if restriction_pct >= 25 else "LOW")

    return {
        "mineral": mineral,
        "mineral_info": m,
        "restriction_pct": restriction_pct,
        "korea_import_bn": korea_import_bn,
        "shock_trillion": shock_trillion,
        "total_prod": total_prod,
        "total_emp": total_emp,
        "multiplier": multiplier,
        "risk_level": risk_level,
        "cascade": cascade,
        "sector_impacts": engine.sector_impacts(shock_trillion),
        "mining_sector_total_prod_trillion": engine.MINING_SECTOR_TOTAL_PROD_TRILLION,
    }


@app.get("/api/stockpile")
def stockpile(
    mineral: str,
    restriction_pct: float = 30,
    korea_import_bn: float | None = None,
    days_stock: float = 45,
    daily_cons_ton: float = 500,
    release_pct: float = 50,
    import_cost: float = 0.5,
    target_days: float = 45,
):
    if mineral not in engine.MINERAL_DATA:
        raise HTTPException(status_code=404, detail=f"unknown mineral: {mineral}")

    m = engine.MINERAL_DATA[mineral]
    if korea_import_bn is None:
        korea_import_bn = m['korea_import_bn']
    shock_trillion = korea_import_bn * restriction_pct / 100 / 10_000

    return engine.stockpile_analysis(
        shock_trillion, restriction_pct, days_stock, daily_cons_ton,
        release_pct, import_cost, target_days,
    )


@app.get("/api/komis")
def get_komis():
    path = os.path.join(DATA_DIR, 'komis_mineral_index.csv')
    if not os.path.exists(path):
        return []
    df = pd.read_csv(path, encoding='utf-8-sig')
    return df.to_dict(orient='records')


@app.get("/api/comtrade")
def get_comtrade():
    path = os.path.join(DATA_DIR, 'uncomtrade_china_korea.csv')
    if not os.path.exists(path):
        return []
    df = pd.read_csv(path, encoding='utf-8-sig')
    return df.to_dict(orient='records')


# 아래 3개는 현재 data/*.csv 직접 수기 편집으로 관리한다 (프로토타입 단계).
# 실 API 연동 시에는 이 함수 내부만 외부 API 호출로 교체하면 되고, 프론트엔드는 그대로 둔다.
@app.get("/api/alerts")
def get_alerts():
    path = os.path.join(DATA_DIR, 'alerts.csv')
    if not os.path.exists(path):
        return []
    df = pd.read_csv(path, encoding='utf-8-sig')
    return df.to_dict(orient='records')


@app.get("/api/publications")
def get_publications():
    path = os.path.join(DATA_DIR, 'publications.csv')
    if not os.path.exists(path):
        return []
    df = pd.read_csv(path, encoding='utf-8-sig')
    return df.to_dict(orient='records')


@app.get("/api/report-teasers")
def get_report_teasers():
    path = os.path.join(DATA_DIR, 'report_teasers.csv')
    if not os.path.exists(path):
        return []
    df = pd.read_csv(path, encoding='utf-8-sig')
    return df.to_dict(orient='records')


app.mount("/static", NoCacheStaticFiles(directory=FRONTEND_DIR), name="static")


@app.get("/")
@app.get("/simulate")
@app.get("/stockpile")
@app.get("/compare")
@app.get("/reports")
def index():
    return FileResponse(os.path.join(FRONTEND_DIR, 'index.html'))
