import pandas as pd
from typing import Tuple, Dict, List
import logging

logger = logging.getLogger(__name__)

REQUIRED_ARABIC = {
    "year": ["السنة", "سنة", "Year", "year"],
    "governorate": ["المحافظة", "محافظة", "Governorate", "governorate"],
    "region": ["المنطقة", "منطقة", "Region", "region"],
    "neighborhood": ["الحي", "حي", "Neighborhood", "neighborhood"],
    "age_group": ["الفئة العمرية", "فئة عمرية", "Age Group", "age_group"],
    "population": ["عدد السكان", "السكان", "Population", "population"],
}


def detect_columns(columns: List[str]) -> Dict[str, str]:
    """Returns mapping from internal key to actual column name."""
    col_map = {}
    for key, candidates in REQUIRED_ARABIC.items():
        for c in candidates:
            if c in columns:
                col_map[key] = c
                break
    return col_map


def load_and_validate(file_bytes: bytes) -> Tuple[pd.DataFrame, Dict[str, str]]:
    try:
        df = pd.read_excel(file_bytes, engine="openpyxl")
    except Exception as e:
        raise ValueError(f"تعذّر قراءة ملف Excel: {e}")

    col_map = detect_columns(list(df.columns))
    missing = [k for k in REQUIRED_ARABIC if k not in col_map]
    if missing:
        raise ValueError(
            f"الأعمدة التالية مفقودة أو لم يتم التعرف عليها: {missing}. "
            f"الأعمدة الموجودة: {list(df.columns)}"
        )

    df = df.rename(columns={v: k for k, v in col_map.items()})
    df["year"] = pd.to_numeric(df["year"], errors="coerce")
    df["population"] = pd.to_numeric(df["population"], errors="coerce")
    df = df.dropna(subset=["year", "population"])
    df["year"] = df["year"].astype(int)
    df["population"] = df["population"].astype(int)

    for col in ["governorate", "region", "neighborhood", "age_group"]:
        df[col] = df[col].astype(str).str.strip()

    return df, col_map


def get_governorates(df: pd.DataFrame) -> List[str]:
    return sorted(df["governorate"].unique().tolist())


def get_regions(df: pd.DataFrame, governorate: str) -> List[str]:
    return sorted(df[df["governorate"] == governorate]["region"].unique().tolist())


def get_neighborhoods(df: pd.DataFrame, governorate: str, region: str) -> List[str]:
    mask = (df["governorate"] == governorate) & (df["region"] == region)
    return sorted(df[mask]["neighborhood"].unique().tolist())


def get_age_groups(df: pd.DataFrame) -> List[str]:
    return sorted(df["age_group"].unique().tolist())


def filter_series(
    df: pd.DataFrame,
    governorate: str,
    region: str,
    neighborhood: str,
    age_group: str,
) -> pd.Series:
    mask = (
        (df["governorate"] == governorate)
        & (df["region"] == region)
    )
    if neighborhood.lower() not in ("الكل", "all", "*"):
        mask &= df["neighborhood"] == neighborhood
    if age_group.lower() not in ("الكل", "all", "*"):
        mask &= df["age_group"] == age_group

    subset = df[mask].groupby("year")["population"].sum().sort_index()
    return subset
