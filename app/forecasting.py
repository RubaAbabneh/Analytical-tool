import itertools
import warnings
import numpy as np
import pandas as pd
from statsmodels.tsa.arima.model import ARIMA
from typing import Tuple, List, Dict, Any
import logging

logger = logging.getLogger(__name__)

warnings.filterwarnings("ignore")


def _auto_arima_aic(series: np.ndarray) -> Tuple[int, int, int, float]:
    """Grid search ARIMA order by AIC for short series (p,d,q in 0..2)."""
    best_aic = np.inf
    best_order = (0, 1, 0)
    for p, d, q in itertools.product(range(3), range(3), range(3)):
        if p + d + q == 0:
            continue
        try:
            model = ARIMA(series, order=(p, d, q))
            result = model.fit()
            if result.aic < best_aic:
                best_aic = result.aic
                best_order = (p, d, q)
        except Exception:
            continue
    return best_order[0], best_order[1], best_order[2], best_aic


def run_forecast(
    series: pd.Series,
    target_year: int,
    order: str = "auto",
    manual_order: Tuple[int, int, int] = None,
    confidence: float = 95.0,
) -> Dict[str, Any]:
    years = series.index.tolist()
    values = series.values.astype(float)
    last_year = years[-1]

    historical = [
        {"year": int(y), "value": float(v), "lower": None, "upper": None, "is_forecast": False}
        for y, v in zip(years, values)
    ]

    # Target year is within or at historical range
    if target_year <= last_year:
        if target_year in years:
            val = float(series[target_year])
            return {
                "historical": historical,
                "forecast": [{"year": target_year, "value": val, "lower": None, "upper": None, "is_forecast": False}],
                "selected_order": [0, 0, 0],
                "aic": 0.0,
                "data_points": len(series),
                "message": f"السنة {target_year} موجودة في البيانات الفعلية، القيمة الحقيقية: {val:,.0f}",
            }
        else:
            return {
                "historical": historical,
                "forecast": [],
                "selected_order": [0, 0, 0],
                "aic": 0.0,
                "data_points": len(series),
                "message": f"السنة {target_year} لا توجد في البيانات ولا تحتاج تنبؤًا.",
            }

    horizon = target_year - last_year

    # Handle near-constant series
    if np.std(values) < 1e-6:
        forecast_vals = [values[-1]] * horizon
        forecast_years = list(range(last_year + 1, target_year + 1))
        forecast = [
            {"year": y, "value": v, "lower": v, "upper": v, "is_forecast": True}
            for y, v in zip(forecast_years, forecast_vals)
        ]
        return {
            "historical": historical,
            "forecast": forecast,
            "selected_order": [0, 0, 0],
            "aic": 0.0,
            "data_points": len(series),
            "message": "السلسلة الزمنية شبه ثابتة؛ تم استخدام آخر قيمة كتنبؤ.",
        }

    if order == "auto":
        p, d, q, aic = _auto_arima_aic(values)
    else:
        p, d, q = manual_order
        try:
            result_test = ARIMA(values, order=(p, d, q)).fit()
            aic = result_test.aic
        except Exception:
            p, d, q, aic = _auto_arima_aic(values)

    try:
        model = ARIMA(values, order=(p, d, q))
        result = model.fit()
        alpha = 1.0 - (confidence / 100.0)
        pred = result.get_forecast(steps=horizon)
        mean_vals = pred.predicted_mean
        ci = pred.conf_int(alpha=alpha)
    except Exception as e:
        logger.warning(f"ARIMA fit failed ({p},{d},{q}): {e}. Falling back to (0,1,0).")
        p, d, q = 0, 1, 0
        try:
            model = ARIMA(values, order=(p, d, q))
            result = model.fit()
            aic = result.aic
            alpha = 1.0 - (confidence / 100.0)
            pred = result.get_forecast(steps=horizon)
            mean_vals = pred.predicted_mean
            ci = pred.conf_int(alpha=alpha)
        except Exception as e2:
            logger.error(f"Fallback ARIMA also failed: {e2}")
            mean_vals = np.full(horizon, values[-1])
            ci = np.column_stack([mean_vals, mean_vals])
            aic = 0.0

    forecast_years = list(range(last_year + 1, target_year + 1))
    forecast = []
    for i, y in enumerate(forecast_years):
        v = float(mean_vals[i]) if i < len(mean_vals) else float(values[-1])
        lo = float(ci[i, 0]) if i < len(ci) else v
        hi = float(ci[i, 1]) if i < len(ci) else v
        forecast.append({"year": y, "value": max(0, v), "lower": max(0, lo), "upper": max(0, hi), "is_forecast": True})

    return {
        "historical": historical,
        "forecast": forecast,
        "selected_order": [p, d, q],
        "aic": float(aic),
        "data_points": len(series),
        "message": None,
    }
