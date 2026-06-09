"""Run once to generate sample_data.xlsx"""
import pandas as pd
import numpy as np
import random

random.seed(42)
np.random.seed(42)

YEARS = list(range(2015, 2025))
GOVERNORATES = {
    "عمّان": {
        "قصبة عمّان": ["جبل الحسين", "الجاردنز"],
        "الجنوبية": ["ماركا", "الموقر"],
    },
    "إربد": {
        "قصبة إربد": ["وسط إربد", "شمال إربد"],
        "الرمثا": ["مركز الرمثا", "الصريح"],
    },
}
AGE_GROUPS = ["0-4", "5-14", "15-24", "25-34", "35-44", "45-54", "55-64", "65+"]
BASE_POP = {"0-4": 3000, "5-14": 5500, "15-24": 7000, "25-34": 6500,
            "35-44": 5000, "45-54": 3800, "55-64": 2500, "65+": 1500}

rows = []
for gov, regions in GOVERNORATES.items():
    for reg, hoods in regions.items():
        for hood in hoods:
            for age in AGE_GROUPS:
                base = BASE_POP[age] + random.randint(-500, 500)
                for i, year in enumerate(YEARS):
                    pop = int(base * (1 + 0.02 * i) + np.random.normal(0, base * 0.03))
                    rows.append({
                        "السنة": year,
                        "المحافظة": gov,
                        "المنطقة": reg,
                        "الحي": hood,
                        "الفئة العمرية": age,
                        "عدد السكان": max(100, pop),
                    })

df = pd.DataFrame(rows)
df.to_excel("sample_data.xlsx", index=False, engine="openpyxl")
print(f"Created sample_data.xlsx: {len(df)} rows")
