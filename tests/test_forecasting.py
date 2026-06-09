import pandas as pd
import pytest
from app.forecasting import run_forecast


@pytest.fixture
def sample_series():
    years = list(range(2015, 2025))
    values = [3000 + i * 80 + (i % 3) * 30 for i in range(10)]
    return pd.Series(values, index=years)


def test_forecast_length(sample_series):
    result = run_forecast(sample_series, 2030)
    assert len(result["forecast"]) == 6  # 2025..2030


def test_forecast_columns(sample_series):
    result = run_forecast(sample_series, 2028)
    for pt in result["forecast"]:
        assert "year" in pt
        assert "value" in pt
        assert "lower" in pt
        assert "upper" in pt
        assert "is_forecast" in pt


def test_forecast_years(sample_series):
    result = run_forecast(sample_series, 2027)
    fc_years = [p["year"] for p in result["forecast"]]
    assert fc_years == list(range(2025, 2028))


def test_historical_in_range(sample_series):
    result = run_forecast(sample_series, 2024)
    assert len(result["historical"]) == 10
    assert result["forecast"] == [] or result["forecast"][0]["is_forecast"] == False


def test_non_negative_values(sample_series):
    result = run_forecast(sample_series, 2030)
    for pt in result["forecast"]:
        assert pt["value"] >= 0


def test_order_returned(sample_series):
    result = run_forecast(sample_series, 2026)
    assert isinstance(result["selected_order"], list)
    assert len(result["selected_order"]) == 3
