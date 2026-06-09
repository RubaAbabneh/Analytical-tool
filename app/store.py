import uuid
from typing import Dict, Any
import pandas as pd

_store: Dict[str, Dict[str, Any]] = {}


def save_upload(df: pd.DataFrame, col_map: dict) -> str:
    uid = str(uuid.uuid4())
    _store[uid] = {"df": df, "col_map": col_map}
    return uid


def get_upload(upload_id: str) -> Dict[str, Any]:
    if upload_id not in _store:
        raise KeyError("معرّف الرفع غير موجود أو انتهت صلاحيته")
    return _store[upload_id]


def clear_upload(upload_id: str):
    _store.pop(upload_id, None)
