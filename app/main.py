import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import io
import logging
import httpx
from fastapi import FastAPI, File, UploadFile, HTTPException, Query, Request
from fastapi.responses import HTMLResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
import pandas as pd

from app.data_io import (
    load_and_validate, get_governorates, get_regions,
    get_neighborhoods, get_age_groups, filter_series,
)
from app.forecasting import run_forecast
from app.schemas import UploadResponse, ForecastRequest, ForecastResponse, ForecastPoint
from app.store import save_upload, get_upload

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="نمذجة وتحليل البيانات — دائرة الإحصاءات العامة الأردنية")

app.mount("/static", StaticFiles(directory="static"), name="static")
templates = Jinja2Templates(directory="templates")


@app.get("/", response_class=HTMLResponse)
async def index(request: Request):
    return templates.TemplateResponse(request, "index.html")


@app.post("/upload", response_model=UploadResponse)
async def upload_file(file: UploadFile = File(...)):
    if not file.filename.endswith((".xlsx", ".xls")):
        raise HTTPException(status_code=400, detail="يُقبل فقط ملفات Excel بصيغة .xlsx أو .xls")
    try:
        content = await file.read()
        df, col_map = load_and_validate(io.BytesIO(content))
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        logger.error(f"Upload error: {e}")
        raise HTTPException(status_code=500, detail="خطأ غير متوقع أثناء معالجة الملف")

    upload_id = save_upload(df, col_map)
    years = sorted(df["year"].unique().tolist())
    return UploadResponse(
        upload_id=upload_id,
        detected_columns={v: k for k, v in col_map.items()},
        row_count=len(df),
        year_range=[years[0], years[-1]],
        governorates=get_governorates(df),
    )


@app.get("/options/regions")
async def options_regions(upload_id: str = Query(...), governorate: str = Query(...)):
    try:
        data = get_upload(upload_id)
    except KeyError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return {"regions": get_regions(data["df"], governorate)}


@app.get("/options/neighborhoods")
async def options_neighborhoods(
    upload_id: str = Query(...),
    governorate: str = Query(...),
    region: str = Query(...),
):
    try:
        data = get_upload(upload_id)
    except KeyError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return {"neighborhoods": get_neighborhoods(data["df"], governorate, region)}


@app.get("/options/age_groups")
async def options_age_groups(upload_id: str = Query(...)):
    try:
        data = get_upload(upload_id)
    except KeyError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return {"age_groups": get_age_groups(data["df"])}


@app.post("/forecast")
async def forecast(req: ForecastRequest):
    try:
        data = get_upload(req.upload_id)
    except KeyError as e:
        raise HTTPException(status_code=404, detail=str(e))

    df = data["df"]
    try:
        series = filter_series(df, req.governorate, req.region, req.neighborhood, req.age_group)
    except Exception as e:
        logger.error(f"Filter error: {e}")
        raise HTTPException(status_code=422, detail=f"خطأ في الفلترة: {e}")

    if len(series) < 2:
        raise HTTPException(status_code=422, detail="البيانات المفلترة غير كافية للتنبؤ (أقل من نقطتين)")

    manual_order = None
    if req.order == "manual" and req.p is not None:
        manual_order = (req.p, req.d or 0, req.q or 0)

    try:
        result = run_forecast(series, req.target_year, req.order, manual_order, req.confidence)
    except Exception as e:
        logger.error(f"Forecast error: {e}")
        raise HTTPException(status_code=500, detail=f"خطأ في النمذجة: {e}")

    combination = f"{req.governorate} / {req.region} / {req.neighborhood} / {req.age_group}"
    result["combination"] = combination
    result["informal_estimate"] = True
    return result


@app.get("/download_csv")
async def download_csv(
    upload_id: str = Query(...),
    governorate: str = Query(...),
    region: str = Query(...),
    neighborhood: str = Query(...),
    age_group: str = Query(...),
    target_year: int = Query(...),
):
    try:
        data = get_upload(upload_id)
    except KeyError as e:
        raise HTTPException(status_code=404, detail=str(e))

    df = data["df"]
    series = filter_series(df, governorate, region, neighborhood, age_group)
    result = run_forecast(series, target_year)

    rows = []
    for pt in result["historical"]:
        rows.append({"السنة": pt["year"], "عدد السكان": pt["value"], "الحد الأدنى": "", "الحد الأعلى": "", "نوع": "فعلي"})
    for pt in result["forecast"]:
        rows.append({"السنة": pt["year"], "عدد السكان": pt["value"], "الحد الأدنى": pt["lower"], "الحد الأعلى": pt["upper"], "نوع": "تنبؤ"})

    out_df = pd.DataFrame(rows)
    csv_bytes = out_df.to_csv(index=False, encoding="utf-8-sig").encode("utf-8-sig")
    return StreamingResponse(
        io.BytesIO(csv_bytes),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=forecast.csv"},
    )


@app.post("/ai_analyze")
async def ai_analyze(request: Request):
    body = await request.json()
    api_key = body.get("api_key", "").strip()
    forecast_data = body.get("forecast_data", {})

    if not api_key:
        raise HTTPException(status_code=400, detail="مفتاح Groq API مطلوب")

    combo = forecast_data.get("combination", "غير محدد")
    historical = forecast_data.get("historical", [])
    forecast_pts = forecast_data.get("forecast", [])
    order = forecast_data.get("selected_order", [0, 0, 0])
    aic = forecast_data.get("aic", 0)

    hist_text = "\n".join([f"  - {p['year']}: {int(p['value']):,} نسمة" for p in historical])
    fc_text = "\n".join([
        f"  - {p['year']}: {int(p['value']):,} نسمة (مجال الثقة 95%: {int(p['lower']):,} — {int(p['upper']):,})"
        for p in forecast_pts
    ])

    growth_note = ""
    if historical and forecast_pts:
        last_hist_val = historical[-1]["value"]
        last_fc_val = forecast_pts[-1]["value"]
        last_fc_year = forecast_pts[-1]["year"]
        if last_hist_val > 0:
            pct = ((last_fc_val - last_hist_val) / last_hist_val) * 100
            direction = "نمو" if pct >= 0 else "انخفاض"
            growth_note = f"نسبة ال{direction} المتوقعة حتى {last_fc_year}: {abs(pct):.1f}%"

    prompt = f"""أنت محلل إحصائي متخصص في دائرة الإحصاءات العامة الأردنية.
قم بتحليل نتائج نموذج ARIMA للتنبؤ بالأعداد السكانية وكتابة تقرير احترافي مختصر باللغة العربية الفصحى.

المعطيات:
- التركيبة: {combo}
- رتبة النموذج ARIMA(p,d,q): ({order[0]},{order[1]},{order[2]})
- معيار AIC: {aic:.1f}
{growth_note}

البيانات التاريخية:
{hist_text}

التنبؤات المستقبلية:
{fc_text}

اكتب تقريرًا احترافيًا يشمل الأقسام الأربعة التالية فقط، بأسلوب رسمي مناسب للمسؤولين الحكوميين:

## أولاً: تحليل الاتجاه السكاني
(تحليل مختصر للاتجاه من البيانات التاريخية والتنبؤات)

## ثانياً: الملاحظات الإحصائية
(جودة النموذج وأبرز الملاحظات التقنية)

## ثالثاً: توصيات لصناع القرار
(توصيات عملية مبنية على نتائج التحليل)

## رابعاً: التحفظات والمخاطر
(حدود دقة التنبؤ والعوامل غير المؤكدة)

اجعل كل قسم موجزاً (٣-٥ جمل) ومفيداً للمخططين والمسؤولين الحكوميين."""

    try:
        async with httpx.AsyncClient(timeout=40.0) as client:
            response = await client.post(
                "https://api.groq.com/openai/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": "llama-3.3-70b-versatile",
                    "messages": [{"role": "user", "content": prompt}],
                    "max_tokens": 1200,
                    "temperature": 0.3,
                },
            )

        if response.status_code == 401:
            raise HTTPException(status_code=401, detail="مفتاح API غير صحيح. تحقق من المفتاح في console.groq.com")
        if response.status_code == 429:
            raise HTTPException(status_code=429, detail="تم تجاوز حد الطلبات. انتظر قليلاً وأعد المحاولة")
        if response.status_code != 200:
            err = response.json().get("error", {}).get("message", "خطأ غير معروف")
            raise HTTPException(status_code=400, detail=f"خطأ من Groq API: {err}")

        result = response.json()
        analysis = result["choices"][0]["message"]["content"]
        return {"analysis": analysis}

    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="انتهت مهلة الاتصال. حاول مرة أخرى")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"AI analyze error: {e}")
        raise HTTPException(status_code=500, detail=f"خطأ في الاتصال بالذكاء الاصطناعي: {str(e)}")
