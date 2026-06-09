from pydantic import BaseModel
from typing import Optional, List


class UploadResponse(BaseModel):
    upload_id: str
    detected_columns: dict
    row_count: int
    year_range: List[int]
    governorates: List[str]


class ForecastRequest(BaseModel):
    upload_id: str
    governorate: str
    region: str
    neighborhood: str
    age_group: str
    target_year: int
    order: str = "auto"
    p: Optional[int] = None
    d: Optional[int] = None
    q: Optional[int] = None
    confidence: float = 95.0


class ForecastPoint(BaseModel):
    year: int
    value: float
    lower: Optional[float] = None
    upper: Optional[float] = None
    is_forecast: bool


class ForecastResponse(BaseModel):
    historical: List[ForecastPoint]
    forecast: List[ForecastPoint]
    selected_order: List[int]
    aic: float
    data_points: int
    combination: str
    informal_estimate: bool = True
    message: Optional[str] = None
