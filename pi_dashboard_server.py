"""Internal PI dashboard server.

Serves index.html and provides /api/current.  It keeps Windows/Negotiate
authentication on the server side, so the browser never sends credentials to
the PI Web API and is not blocked by PI Web API CORS.
"""

import json
import os
import ssl
import warnings
import csv
from concurrent.futures import ThreadPoolExecutor, as_completed
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

import requests
import urllib3
import joblib
import pandas as pd
from requests_negotiate_sspi import HttpNegotiateAuth

BASE_URL = os.getenv("PI_WEB_API_URL", "https://vpkgbppivs01.scg.com/piwebapi").rstrip("/")
PI_SERVER = os.getenv("PI_SERVER", "172.31.224.78")
PORT = int(os.getenv("PI_DASHBOARD_PORT", "8082"))
BIND_HOST = os.getenv("PI_DASHBOARD_BIND", "127.0.0.1").strip() or "127.0.0.1"
UPSTREAM_URL = os.getenv("PI_DASHBOARD_UPSTREAM", "").strip().rstrip("/")
ROOT_DIR = os.path.dirname(os.path.abspath(__file__))
FORECAST_MODEL_DIR = os.path.join(ROOT_DIR, "output", "forecast_30s_models")
REALTIME_MODEL_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "output", "realtime_kw_models")
DYNAMIC_MODEL_DIR = os.path.join(ROOT_DIR, "output", "dynamic_optimization_models")
FORECAST_MANIFEST_PATH = os.path.join(FORECAST_MODEL_DIR, "manifest.json")
with open(FORECAST_MANIFEST_PATH, encoding="utf-8") as manifest_file:
    FORECAST_MANIFEST = json.load(manifest_file)
with open(os.path.join(REALTIME_MODEL_DIR, "manifest.json"), encoding="utf-8") as manifest_file:
    REALTIME_MANIFEST = json.load(manifest_file)
with open(os.path.join(DYNAMIC_MODEL_DIR, "manifest.json"), encoding="utf-8") as manifest_file:
    DYNAMIC_MANIFEST = json.load(manifest_file)

TAGS = [
    "TPC3-SB_REEL.PV", "TPC3-GRADE", "TPC3-CAL_PRODUCT.CPV", "TPC3-BW1.PV",
    "TPC3-FI2409.PV", "TPC3-SI2101.PV", "TPC3-JW.PV", "TPC3-MP0.PV",
    "TPC3-KWC2723_SP.PV", "TPC3-KWC2723OVL.PV", "TPC3-SI2934.PV", "TPC3-DRYNESS.PV",
    "TPC3-PIC2714.MV", "TPC3-PIC2714.PV", "TPC3-PIC2715.MV", "TPC3-PIC2715.PV", "TPC3-PIC2715.SV",
    "TPC3-PIC2716.MV", "TPC3-PIC2716.PV", "TPC3-PIC2716.SV", "TPC3-PIC2717.MV", "TPC3-PIC2717.PV", "TPC3-PIC2717.SV",
    "TPC3-PIC2718.MV", "TPC3-PIC2718.PV", "TPC3-PIC2718.SV", "TPC3-PIC2719.MV", "TPC3-PIC2719.PV", "TPC3-PIC2719.SV",
    "TPC3-PIC2720.MV", "TPC3-PIC2720.PV", "TPC3-PIC2720.SV", "TPC3-PIC2721.MV", "TPC3-PIC2721.PV", "TPC3-PIC2721.SV",
    "TPC3-TI2708.PV", "TPC3-TI2709.PV", "TPC3-TI2710.PV", "TPC3-TI2711.PV", "TPC3-TI2712.PV",
    "TPC3-PIC2401.PV", "TPC3-PIC2402.PV", "TPC3-PIC2403.PV", "TPC3-PIC2404.PV", "TPC3-PIC2405.PV",
    "TPC3-PIC2406.PV", "TPC3-PIC2407.PV", "TPC3-PIC2408.PV", "TPC3-PIC2409.PV", "TPC3-PIC2410.PV",
]
ALLOWED_TAGS = set(TAGS)

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
warnings.filterwarnings("ignore", message="Unverified HTTPS request")
session = requests.Session()
# Default SSO is used when the interactive Windows session has a domain
# ticket.  start_pi_dashboard.bat can also supply an explicit, temporary
# credential through environment variables when SSO returns
# SEC_E_NO_CREDENTIALS.  The password is never written to disk.
pi_username = os.getenv("PI_USERNAME")
pi_password = os.getenv("PI_PASSWORD")
pi_domain = os.getenv("PI_DOMAIN") or "."
if pi_username and pi_password:
    if "\\" in pi_username and pi_domain == ".":
        pi_domain, pi_username = pi_username.split("\\", 1)
    session.auth = HttpNegotiateAuth(
        username=pi_username,
        password=pi_password,
        domain=pi_domain,
    )
else:
    session.auth = HttpNegotiateAuth()
session.verify = False  # PI Web API uses an internal certificate.
session.trust_env = False  # PI Server is an internal address; bypass system proxy settings.
webids = {}
models = {}
prediction_cache = {"at": 0, "payload": None}
optimization_models = {}
optimization_cache = {"at": 0, "payload": None}
specific_energy_cache = {"at": 0, "payload": None}
OPTIMIZATION_DIR = os.path.join(ROOT_DIR, "output", "ml_optimization")
OPTIMIZATION_RECOMMENDATIONS = os.path.join(OPTIMIZATION_DIR, "top5_integer_optimization_recommendations.csv")
OPTIMIZATION_CONDITIONS = os.path.join(OPTIMIZATION_DIR, "top5_quality_constrained_conditions.csv")
DRYER_CONDITIONS = os.path.join(OPTIMIZATION_DIR, "dryer_condition_ranges.csv")
VACUUM_LEVEL_RECOMMENDATIONS = os.path.join(OPTIMIZATION_DIR, "optimization_recommendations.csv")
ROBUST_OPTIMIZATION_SCENARIOS = os.path.join(OPTIMIZATION_DIR, "top5_robust_optimization_scenarios.csv")
forecast_manifest_mtime = os.path.getmtime(FORECAST_MANIFEST_PATH)
PI_CACHE_PATH = os.path.join(ROOT_DIR, "output", "pi_current_cache.json")

FEATURE_TAGS = {
    "kW_now": "TPC3-KWC2723OVL.PV",
    "Product Rate": "TPC3-CAL_PRODUCT.CPV",
    "Basis Weight": "TPC3-BW1.PV",
    "Main steam flow": "TPC3-FI2409.PV",
    "Reel Speed": "TPC3-SI2101.PV",
    "Jet/Wire Ratio": "TPC3-JW.PV",
    "Moisture Size press": "TPC3-MP0.PV",
    "Turbo Vacumm level": "TPC3-KWC2723_SP.PV",
    "Turbo Vacuum Speed Motor": "TPC3-SI2934.PV",
    "Turbo Vacuum Dryness soft sensor": "TPC3-DRYNESS.PV",
    "Turbo Vacuum Diffusor Guide Vanes C/V": "TPC3-PIC2714.MV",
    "Turbo Vacuum Suction Blower Vac": "TPC3-PIC2714.PV",
    "Turbo Vacuum Suction Box Overload C/V": "TPC3-PIC2715.MV",
    "Turbo Vacuum pressure line Suction Box": "TPC3-PIC2715.PV",
    "Turbo Vacuum pressure line Suction Box Set point": "TPC3-PIC2715.SV",
    "Turbo Vacuum Pressure Pick up High C/V": "TPC3-PIC2716.MV",
    "Turbo Vacuum Press Line Pick up High": "TPC3-PIC2716.PV",
    "Turbo Vacuum Press Line Pick up High Set point": "TPC3-PIC2716.SV",
    "Turbo Vacuum Prss Pick up Low C/V": "TPC3-PIC2717.MV",
    "Turbo Vacuum Press Line Pick up Low": "TPC3-PIC2717.PV",
    "Turbo Vacuum Press Line Pick up Low Set point": "TPC3-PIC2717.SV",
    "Turbo Vacuum Press Line 2nd Press Felt C/V": "TPC3-PIC2718.MV",
    "Turbo Vacuum Press Line 2nd Press Felt": "TPC3-PIC2718.PV",
    "Turbo Vacuum Press Line 2nd Press Felt Set point": "TPC3-PIC2718.SV",
    "Turbo Vacuum Press Line 1st Press Felt C/V": "TPC3-PIC2719.MV",
    "Turbo Vacuum Press Line 1st Press Felt": "TPC3-PIC2719.PV",
    "Turbo Vacuum Press Line 1st Press Felt Set point": "TPC3-PIC2719.SV",
    "Turbo Vacuum Press Line 3rd Press Felt C/V": "TPC3-PIC2720.MV",
    "Turbo Vacuum Press Line 3rd Press Felt": "TPC3-PIC2720.PV",
    "Turbo Vacuum Press Line 3rd Press Felt Set point": "TPC3-PIC2720.SV",
    "Turbo Vacuum Press Line Couch Roll C/V": "TPC3-PIC2721.MV",
    "Turbo Vacuum Press Line Couch Roll": "TPC3-PIC2721.PV",
    "Turbo Vacuum Press Line Couch Roll Set point": "TPC3-PIC2721.SV",
    "Turbo Vacuum Bearing Front Temp": "TPC3-TI2708.PV",
    "Turbo Vacuum Bearing Rear Temp": "TPC3-TI2709.PV",
    "Turbo Vacuum Motor Wind. Temp PH. L1": "TPC3-TI2710.PV",
    "Turbo Vacuum Motor Wind. Temp PH. L2": "TPC3-TI2711.PV",
    "Turbo Vacuum Motor Wind. Temp PH. L3": "TPC3-TI2712.PV",
    "Dryer steam pressure cylinder1": "TPC3-PIC2401.PV",
    "Dryer steam pressure cylinder3": "TPC3-PIC2402.PV",
    "Dryer steam pressure cylinder5": "TPC3-PIC2403.PV",
    "Dryer steam pressure cylinder6": "TPC3-PIC2404.PV",
    "Dryer steam pressure group2": "TPC3-PIC2405.PV",
    "Pre-Dryer (Dryer steam pressure group3)": "TPC3-PIC2406.PV",
    "Dryer steam pressure cylinder26": "TPC3-PIC2407.PV",
    "Dryer steam pressure cylinder27": "TPC3-PIC2408.PV",
    "Dryer steam pressure group6": "TPC3-PIC2409.PV",
    "After-Dryer (Dryer steam pressure group7)": "TPC3-PIC2410.PV",
}

RECOMMENDATION_FEATURES = {
    "Suction Box SP": "Turbo Vacuum pressure line Suction Box Set point",
    "Pick up High SP": "Turbo Vacuum Press Line Pick up High Set point",
    "Pick up Low SP": "Turbo Vacuum Press Line Pick up Low Set point",
    "1st Press Felt SP": "Turbo Vacuum Press Line 1st Press Felt Set point",
    "2nd Press Felt SP": "Turbo Vacuum Press Line 2nd Press Felt Set point",
    "3rd Press Felt SP": "Turbo Vacuum Press Line 3rd Press Felt Set point",
    "Couch Roll SP": "Turbo Vacuum Press Line Couch Roll Set point",
}

CONDITION_FEATURES = {
    "Production Rate": "Product Rate", "Reel Speed": "Reel Speed", "Basis Weight": "Basis Weight",
    "Main Steam Flow": "Main steam flow", "Jet/Wire Ratio": "Jet/Wire Ratio",
    "Turbo Speed Motor": "Turbo Vacuum Speed Motor",
}


def point_path(tag):
    return rf"\\{PI_SERVER}\{tag}"


def cached_value(tag, fallback_reason=None):
    if not os.path.isfile(PI_CACHE_PATH):
        raise ValueError("No local PI cache is available yet")
    with open(PI_CACHE_PATH, encoding="utf-8") as cache_file:
        payload = json.load(cache_file)
    item = payload.get("values", {}).get(tag)
    if item is None:
        raise ValueError(f"No cached PI value for {tag}")
    item = dict(item) if isinstance(item, dict) else {"Value": item}
    item["Cached"] = True
    item["CacheTimestamp"] = payload.get("saved_at")
    if fallback_reason:
        item["FallbackReason"] = fallback_reason
    return tag, item


def get_value(tag):
    try:
        webid = webids.get(tag)
        if not webid:
            response = session.get(f"{BASE_URL}/points", params={"path": point_path(tag)}, timeout=20)
            response.raise_for_status()
            webid = response.json()["WebId"]
            webids[tag] = webid
        response = session.get(f"{BASE_URL}/streams/{webid}/value", timeout=20)
        response.raise_for_status()
        return tag, response.json()
    except Exception as error:
        # No-login mode: if Windows SSO is unavailable, keep the dashboard
        # usable with the last successfully downloaded snapshot.  Cached data
        # is marked explicitly and is never represented as live PI data.
        return cached_value(tag, str(error))


def get_value_at(tag, at_time):
    """Return the interpolated archive value for one PI tag at one timestamp."""
    webid = webids.get(tag)
    if not webid:
        response = session.get(f"{BASE_URL}/points", params={"path": point_path(tag)}, timeout=20)
        response.raise_for_status()
        webid = response.json()["WebId"]
        webids[tag] = webid
    response = session.get(
        f"{BASE_URL}/streams/{webid}/interpolatedattimes",
        params=[("time", at_time)],
        timeout=30,
    )
    response.raise_for_status()
    items = response.json().get("Items", [])
    if not items:
        raise ValueError(f"No PI archive value at {at_time}")
    return tag, items[0]


def get_history(tag, duration="1h", interval="5m"):
    """Return interpolated PI values for a small dashboard trend."""
    webid = webids.get(tag)
    if not webid:
        response = session.get(f"{BASE_URL}/points", params={"path": point_path(tag)}, timeout=20)
        response.raise_for_status()
        webid = response.json()["WebId"]
        webids[tag] = webid
    response = session.get(
        f"{BASE_URL}/streams/{webid}/interpolated",
        params={"startTime": f"*-{duration}", "endTime": "*", "interval": interval},
        timeout=30,
    )
    response.raise_for_status()
    return response.json().get("Items", [])


def get_history_range(tag, start_time, end_time, interval="1m"):
    """Return a bounded interpolated PI series for historical comparisons."""
    webid = webids.get(tag)
    if not webid:
        response = session.get(f"{BASE_URL}/points", params={"path": point_path(tag)}, timeout=20)
        response.raise_for_status()
        webid = response.json()["WebId"]
        webids[tag] = webid
    response = session.get(
        f"{BASE_URL}/streams/{webid}/interpolated",
        params={"startTime": start_time, "endTime": end_time, "interval": interval},
        timeout=90,
    )
    response.raise_for_status()
    return response.json().get("Items", [])


SPECIFIC_ENERGY_PERIODS = (
    {"id": "grp75_feb", "grade": "GRP-75", "label": "8-11 ก.พ. 2026",
     "start": "2026-02-08T00:00:00+07:00", "end": "2026-02-12T00:00:00+07:00"},
    {"id": "grp75_jun", "grade": "GRP-75", "label": "18–22 มิ.ย. 2026",
     "start": "2026-06-18T00:00:00+07:00", "end": "2026-06-23T00:00:00+07:00"},
    {"id": "grp75_aug", "grade": "GRP-75", "label": "17–20 ส.ค. 2026",
     "start": "2026-08-17T00:00:00+07:00", "end": "2026-08-21T00:00:00+07:00"},
    {"id": "ppc_feb", "grade": "PPC-GL-80", "label": "27 ก.พ.-1 มี.ค. 2026",
     "start": "2026-02-27T00:00:00+07:00", "end": "2026-03-02T00:00:00+07:00"},
    {"id": "ppc_apr", "grade": "PPC-GL-80", "label": "19–22 เม.ย. 2026",
     "start": "2026-04-19T00:00:00+07:00", "end": "2026-04-23T00:00:00+07:00"},
    {"id": "ppc_aug", "grade": "PPC-GL-80", "label": "12–14 ส.ค. 2026",
     "start": "2026-08-12T00:00:00+07:00", "end": "2026-08-15T00:00:00+07:00"},
)

OPERATING_VARIABLES = {
    "turbo_load": {"label": "Turbo Vacuum Load", "tag": "TPC3-KWC2723OVL.PV", "unit": "kW", "min": 0, "max": 1000},
    "product_rate": {"label": "Product Rate", "tag": "TPC3-CAL_PRODUCT.CPV", "unit": "t/h", "min": 0, "max": 20},
    "main_steam": {"label": "Main Steam Flow", "tag": "TPC3-FI2409.PV", "unit": "t/h", "min": 0, "max": 30},
    "motor_speed": {"label": "Turbo Vacuum Motor Speed", "tag": "TPC3-SI2934.PV", "unit": "rpm", "min": 0, "max": 5000},
    "dryness": {"label": "Dryness", "tag": "TPC3-DRYNESS.PV", "unit": "%", "min": 0, "max": 100},
    "vacuum_level": {"label": "Turbo Vacuum Level SP", "tag": "TPC3-KWC2723_SP.PV", "unit": "kPa", "min": -100, "max": 0},
    "reel_speed": {"label": "Reel Speed", "tag": "TPC3-SI2101.PV", "unit": "m/min", "min": 0, "max": 2000},
    "basis_weight": {"label": "Basis Weight", "tag": "TPC3-BW1.PV", "unit": "gsm", "min": 0, "max": 500},
    "jet_wire": {"label": "Jet / Wire Ratio", "tag": "TPC3-JW.PV", "unit": "", "min": 0.5, "max": 1.5},
    "moisture": {"label": "Moisture Size Press", "tag": "TPC3-MP0.PV", "unit": "%", "min": 0, "max": 100},
}


def raw_pi_value(item):
    value = item.get("Value") if isinstance(item, dict) else item
    if isinstance(value, dict):
        return value.get("Name", value.get("Value"))
    return value


def grade_matches(value, expected):
    normalize = lambda text: "".join(char for char in str(text or "").upper() if char.isalnum())
    return normalize(value) == normalize(expected)


def is_sheet_run(value):
    if isinstance(value, (int, float)):
        return float(value) >= 0.5
    return str(value or "").strip().upper() in {"1", "RUN", "TRUE", "ON"}


def calculate_specific_energy_period(period):
    required_tags = ("TPC3-GRADE", "TPC3-SB_REEL.PV") + tuple(
        variable["tag"] for variable in OPERATING_VARIABLES.values())
    with ThreadPoolExecutor(max_workers=len(required_tags)) as pool:
        futures = {pool.submit(get_history_range, tag, period["start"], period["end"]): tag
                   for tag in required_tags}
        series_by_tag = {futures[future]: future.result() for future in as_completed(futures)}

    count = min(len(series_by_tag[tag]) for tag in required_tags)
    rows = []
    run_samples = 0
    for index in range(count):
        grade = raw_pi_value(series_by_tag["TPC3-GRADE"][index])
        run = raw_pi_value(series_by_tag["TPC3-SB_REEL.PV"][index])
        if not grade_matches(grade, period["grade"]) or not is_sheet_run(run):
            continue
        try:
            load = numeric_value(series_by_tag["TPC3-KWC2723OVL.PV"][index])
            rate = numeric_value(series_by_tag["TPC3-CAL_PRODUCT.CPV"][index])
            steam = numeric_value(series_by_tag["TPC3-FI2409.PV"][index])
        except (TypeError, ValueError):
            continue
        if rate <= 0 or steam <= 0:
            continue
        timestamp = series_by_tag["TPC3-KWC2723OVL.PV"][index].get("Timestamp", "")
        row = {"timestamp": timestamp, "product": load / rate, "steam": load / steam}
        for key, variable in OPERATING_VARIABLES.items():
            try:
                value = numeric_value(series_by_tag[variable["tag"]][index])
                row[key] = value if variable["min"] <= value <= variable["max"] else None
            except (TypeError, ValueError):
                row[key] = None
        rows.append(row)
        run_samples += 1

    def iqr_bounds(values):
        if len(values) < 4:
            return float("-inf"), float("inf")
        series = pd.Series(values, dtype="float64")
        q1, q3 = float(series.quantile(0.25)), float(series.quantile(0.75))
        spread = q3 - q1
        return q1 - 1.5 * spread, q3 + 1.5 * spread

    product_bounds = iqr_bounds([row["product"] for row in rows])
    steam_bounds = iqr_bounds([row["steam"] for row in rows])
    hourly = {}
    product_load_values, product_rate_values = [], []
    steam_load_values, main_steam_values = [], []
    excluded_outliers = 0
    for row in rows:
        product_ok = product_bounds[0] <= row["product"] <= product_bounds[1]
        steam_ok = steam_bounds[0] <= row["steam"] <= steam_bounds[1]
        if not product_ok or not steam_ok:
            excluded_outliers += 1
        hour_key = row["timestamp"][:13]
        bucket = hourly.setdefault(hour_key, {"timestamp": row["timestamp"],
                                              "product_load": [], "product_rate": [],
                                              "steam_load": [], "main_steam": []})
        if product_ok:
            bucket["product_load"].append(row["turbo_load"])
            bucket["product_rate"].append(row["product_rate"])
            product_load_values.append(row["turbo_load"])
            product_rate_values.append(row["product_rate"])
        if steam_ok:
            bucket["steam_load"].append(row["turbo_load"])
            bucket["main_steam"].append(row["main_steam"])
            steam_load_values.append(row["turbo_load"])
            main_steam_values.append(row["main_steam"])

    points = []
    for _, bucket in sorted(hourly.items()):
        if not bucket["product_load"] and not bucket["steam_load"]:
            continue
        points.append({"timestamp": bucket["timestamp"],
                       "product_kwh_t": round(sum(bucket["product_load"]) / sum(bucket["product_rate"]), 3) if bucket["product_rate"] and sum(bucket["product_rate"]) > 0 else None,
                       "steam_kwh_t": round(sum(bucket["steam_load"]) / sum(bucket["main_steam"]), 3) if bucket["main_steam"] and sum(bucket["main_steam"]) > 0 else None})
    operating_stats = {}
    for key, variable in OPERATING_VARIABLES.items():
        values = [row[key] for row in rows if row.get(key) is not None]
        lower, upper = iqr_bounds(values)
        clean = sorted(value for value in values if lower <= value <= upper)
        if not clean:
            continue
        operating_stats[key] = {
            "label": variable["label"], "unit": variable["unit"],
            "mean": round(sum(clean) / len(clean), 4),
            "median": round(float(pd.Series(clean).median()), 4),
            "p10": round(float(pd.Series(clean).quantile(0.10)), 4),
            "p90": round(float(pd.Series(clean).quantile(0.90)), 4),
            "samples": len(clean),
        }
    product_energy_kwh = sum(product_load_values) / 60
    production_t = sum(product_rate_values) / 60
    steam_energy_kwh = sum(steam_load_values) / 60
    main_steam_t = sum(main_steam_values) / 60
    return {**period, "points": points, "run_hours": round(run_samples / 60, 2),
            "minute_samples": run_samples, "excluded_outliers": excluded_outliers,
            "outlier_method": "IQR 1.5x", "calculation_method": "integrated totals",
            "operating_stats": operating_stats,
            "product_energy_kwh": round(product_energy_kwh, 2),
            "production_t": round(production_t, 3),
            "steam_energy_kwh": round(steam_energy_kwh, 2),
            "main_steam_t": round(main_steam_t, 3),
            "product_kwh_t": round(product_energy_kwh / production_t, 2) if production_t > 0 else None,
            "steam_kwh_t": round(steam_energy_kwh / main_steam_t, 2) if main_steam_t > 0 else None}


def get_specific_energy_comparison(refresh=False):
    import time
    if (not refresh and specific_energy_cache["payload"] and
            time.time() - specific_energy_cache["at"] < 600):
        return specific_energy_cache["payload"]
    periods = []
    for period in SPECIFIC_ENERGY_PERIODS:
        periods.append(calculate_specific_energy_period(period))
    payload = {"interval": "1m", "aggregation": "integrated hourly and period totals", "periods": periods}
    specific_energy_cache.update({"at": time.time(), "payload": payload})
    return payload


def numeric_value(item):
    value = item.get("Value") if isinstance(item, dict) else item
    if isinstance(value, dict):
        name = str(value.get("Name", "")).strip().lower()
        if value.get("IsSystem") or value.get("Good") is False or name in {
                "no data", "bad", "i/o timeout", "intf shut", "pt created"}:
            raise ValueError(f"PI digital/system state is not numeric data: {name or 'unknown'}")
        value = value.get("Value")
    return float(value)


HISTORY_FEATURES = {"kW_lag_1", "kW_lag_10", "kW_rolling_5min"}


def get_kw_history_features(current_kw):
    """Build the 30-second lag features exactly as used by the new models."""
    history = []
    for item in get_history("TPC3-KWC2723OVL.PV", duration="6m", interval="30s"):
        try:
            history.append(numeric_value(item))
        except (TypeError, ValueError):
            continue
    # The interpolated series normally includes the current endpoint.  Remove
    # it so lag_1 represents the previous 30-second sample, not kW_now again.
    previous = history[:-1] if len(history) > 1 else history
    lag_1 = previous[-1] if previous else current_kw
    lag_10 = previous[-10] if len(previous) >= 10 else (previous[0] if previous else current_kw)
    rolling_values = (previous[-9:] + [current_kw])[-10:]
    rolling_5min = sum(rolling_values) / len(rolling_values)
    return {"kW_lag_1": lag_1, "kW_lag_10": lag_10, "kW_rolling_5min": rolling_5min}


def build_model_inputs(features):
    inputs = {}
    for feature in features:
        if feature in HISTORY_FEATURES:
            continue
        _, item = get_value(FEATURE_TAGS[feature])
        inputs[feature] = numeric_value(item)
    if HISTORY_FEATURES.intersection(features):
        current_kw = inputs.get("kW_now")
        if current_kw is None:
            _, item = get_value("TPC3-KWC2723OVL.PV")
            current_kw = numeric_value(item)
        try:
            inputs.update(get_kw_history_features(current_kw))
        except Exception:
            # Keep the prediction endpoint available if the PI history stream
            # or Windows SSO is unavailable.  Using kW_now for the three lag
            # fields is equivalent to a neutral short-term persistence state.
            inputs.update({"kW_lag_1": current_kw, "kW_lag_10": current_kw,
                           "kW_rolling_5min": current_kw})
    return inputs


def get_model(grade):
    global FORECAST_MANIFEST, forecast_manifest_mtime
    current_mtime = os.path.getmtime(FORECAST_MANIFEST_PATH)
    if current_mtime != forecast_manifest_mtime:
        with open(FORECAST_MANIFEST_PATH, encoding="utf-8") as manifest_file:
            FORECAST_MANIFEST = json.load(manifest_file)
        forecast_manifest_mtime = current_mtime
        models.clear()
        prediction_cache.update({"at": 0, "payload": None})
    if grade not in models:
        metadata = FORECAST_MANIFEST.get("models", {}).get(grade)
        model_dir = FORECAST_MODEL_DIR
        horizon_seconds = FORECAST_MANIFEST.get("forecast_horizon_seconds", 30)
        # A persistence rule only copies the current kW into the future.  Keep it
        # as a benchmark, but never present it to operators as an AI prediction.
        if metadata and "persistence" in str(metadata.get("model", "")).lower():
            metadata = None
        if not metadata:
            metadata = REALTIME_MANIFEST.get("models", {}).get(grade)
            model_dir = REALTIME_MODEL_DIR
            horizon_seconds = 0
        if not metadata:
            raise ValueError(f"No trained model for grade '{grade}'")
        path = os.path.join(model_dir, metadata["file"])
        if not os.path.isfile(path):
            raise ValueError(f"No trained model for grade '{grade}'")
        if path.lower().endswith(".json"):
            bundle = json.loads(open(path, encoding="utf-8").read())
        else:
            bundle = joblib.load(path)
        models[grade] = {"bundle": bundle, "validation": metadata, "horizon_seconds": horizon_seconds}
    return models[grade]


def get_prediction():
    import time
    _, grade_item = get_value("TPC3-GRADE")
    grade = str(grade_item.get("Value", "")).strip()
    if isinstance(grade_item.get("Value"), dict):
        grade = str(grade_item["Value"].get("Name") or grade_item["Value"].get("Value")).strip()
    if prediction_cache["payload"] and prediction_cache["payload"].get("grade") == grade and time.time() - prediction_cache["at"] < 15:
        return prediction_cache["payload"]
    selected = get_model(grade)
    bundle = selected["bundle"]
    features = bundle["features"]
    inputs = build_model_inputs(features)
    if "pipeline" in bundle:
        predicted = float(bundle["pipeline"].predict(pd.DataFrame([inputs], columns=features))[0])
    else:
        # Persistence forecast: the best prediction for the next 30 seconds is kW now.
        predicted = inputs["kW_now"]
    _, actual_item = get_value("TPC3-KWC2723OVL.PV")
    actual = numeric_value(actual_item)
    validation = selected["validation"]
    mae = float(validation.get("mae_kw", 0))
    delta = actual - predicted
    error_percent = abs(delta) / max(abs(actual), 1.0) * 100
    live_accuracy_percent = max(0.0, 100.0 - error_percent)
    if delta > mae:
        suggestion = "Actual load สูงกว่าค่าคาดการณ์: ตรวจสอบ Vacuum level และ Valve position"
    elif delta < -mae:
        suggestion = "Actual load ต่ำกว่าค่าคาดการณ์: ตรวจสอบเงื่อนไขการผลิตและ Vacuum system"
    else:
        suggestion = "Actual load อยู่ในช่วงความคลาดเคลื่อนของโมเดล"
    model_name = str(validation.get("model", ""))
    prediction_type = "persistence_baseline" if "persistence" in model_name.lower() else ("forecast_model" if selected["horizon_seconds"] else "realtime_model")
    r2_value = validation.get("r2")
    r2_display = None if r2_value is None else f"{float(r2_value):.4f}"
    payload = {"grade": grade, "predicted_kw": predicted, "actual_kw": actual, "delta_kw": delta, "live_accuracy_percent": live_accuracy_percent, "error_percent": error_percent, "mae_kw": mae, "r2": r2_display, "model": model_name, "prediction_type": prediction_type, "horizon_seconds": selected["horizon_seconds"], "suggestion": suggestion, "inputs": inputs}
    prediction_cache.update({"at": time.time(), "payload": payload})
    return payload


def load_optimization_files():
    with open(OPTIMIZATION_RECOMMENDATIONS, newline="", encoding="utf-8-sig") as file:
        recommendations = {row["grade"]: row for row in csv.DictReader(file)}
    windows = {}
    support_windows = {}
    with open(OPTIMIZATION_CONDITIONS, newline="", encoding="utf-8-sig") as file:
        for row in csv.DictReader(file):
            if row["constraint_type"] == "held operating condition":
                low, high = float(row["p25"]), float(row["p75"])
                windows.setdefault(row["grade"], {})[row["parameter"]] = (low, high)
                # P25-P75 is appropriate for a conservative plant trial, but is
                # too narrow for a read-only simulation.  A 2x expanded IQR is
                # used only to decide whether the model is still being asked to
                # interpolate close to its historical operating envelope.
                iqr = max(high - low, abs(high) * 0.0001, 0.0001)
                support_windows.setdefault(row["grade"], {})[row["parameter"]] = (
                    low - 2.0 * iqr,
                    high + 2.0 * iqr,
                )
    if os.path.isfile(DRYER_CONDITIONS):
        feature_labels = {feature: label for label, feature in CONDITION_FEATURES.items()}
        with open(DRYER_CONDITIONS, newline="", encoding="utf-8-sig") as file:
            for row in csv.DictReader(file):
                label = feature_labels.get(row["parameter"], row["parameter"])
                support_windows.setdefault(row["grade"], {})[label] = (float(row["min"]), float(row["max"]))
    with open(VACUUM_LEVEL_RECOMMENDATIONS, newline="", encoding="utf-8-sig") as file:
        vacuum_levels = {row["grade"]: row for row in csv.DictReader(file)}
    ranges = {}
    scenarios = {}
    with open(ROBUST_OPTIMIZATION_SCENARIOS, newline="", encoding="utf-8-sig") as file:
        for row in csv.DictReader(file):
            if row.get("vacuum_window_pass") != "True" or float(row.get("estimated_mean_saving_kW", 0)) <= 0:
                continue
            scenarios.setdefault(row["grade"], []).append(row)
            grade_ranges = ranges.setdefault(row["grade"], {})
            for label in RECOMMENDATION_FEATURES:
                value = float(row[label])
                bounds = grade_ranges.setdefault(label, [value, value])
                bounds[0] = min(bounds[0], value)
                bounds[1] = max(bounds[1], value)
    return recommendations, windows, support_windows, vacuum_levels, ranges, scenarios


def get_optimization_model(grade):
    if grade not in optimization_models:
        metadata = FORECAST_MANIFEST.get("models", {}).get(grade)
        if metadata and metadata.get("actionable_optimization"):
            path = os.path.join(FORECAST_MODEL_DIR, metadata["file"])
        else:
            metadata = DYNAMIC_MANIFEST.get("grades", {}).get(grade, {}).get("kW")
            if not metadata:
                raise ValueError(f"No optimization model for grade '{grade}'")
            path = os.path.join(DYNAMIC_MODEL_DIR, metadata["file"])
        optimization_models[grade] = {"bundle": joblib.load(path), "metrics": metadata}
    return optimization_models[grade]


def get_optimization():
    import time
    if optimization_cache["payload"] and time.time() - optimization_cache["at"] < 15:
        return optimization_cache["payload"]
    _, grade_item = get_value("TPC3-GRADE")
    grade = str(grade_item.get("Value", "")).strip()
    if isinstance(grade_item.get("Value"), dict):
        grade = str(grade_item["Value"].get("Name") or grade_item["Value"].get("Value")).strip()
    recommendations, windows, support_windows, vacuum_levels, ranges, scenarios = load_optimization_files()
    if grade not in recommendations:
        raise ValueError(f"No approved optimization recommendation for grade '{grade}'")
    rec = recommendations[grade]
    selected_model = get_optimization_model(grade)
    bundle = selected_model["bundle"]
    current = build_model_inputs(bundle["features"])
    candidate = dict(current)
    for column, feature in RECOMMENDATION_FEATURES.items():
        candidate[feature] = float(rec[column])
    vacuum_rec = recommendations.get(grade)
    if vacuum_rec:
        candidate["Turbo Vacumm level"] = float(vacuum_rec["vacuum_level_recommended_kPa"])
    current_kw = float(bundle["pipeline"].predict(pd.DataFrame([current], columns=bundle["features"]))[0])
    # Re-simulate every robust integer candidate with the live operating
    # conditions held constant.  This avoids presenting a static offline row
    # when another approved candidate is better for the current process state.
    trial_candidates = []
    for scenario in scenarios.get(grade, []):
        trial = dict(current)
        for column, feature in RECOMMENDATION_FEATURES.items():
            trial[feature] = float(scenario[column])
        if vacuum_rec:
            trial["Turbo Vacumm level"] = float(rec["vacuum_level_recommended_kPa"])
        trial_candidates.append(trial)
    if trial_candidates:
        predictions = bundle["pipeline"].predict(pd.DataFrame(trial_candidates, columns=bundle["features"]))
        best_index = min(range(len(predictions)), key=lambda index: float(predictions[index]))
        candidate_kw, candidate = float(predictions[best_index]), trial_candidates[best_index]
    else:
        candidate_kw = float(bundle["pipeline"].predict(pd.DataFrame([candidate], columns=bundle["features"]))[0])
    _, actual_item = get_value("TPC3-KWC2723OVL.PV")
    actual_kw = numeric_value(actual_item)
    actual_saving_kw = actual_kw - candidate_kw
    model_saving_kw = current_kw - candidate_kw
    checks, strict_eligible, simulation_eligible = [], True, True
    for label, feature in CONDITION_FEATURES.items():
        low, high = windows.get(grade, {}).get(label, (None, None))
        support_low, support_high = support_windows.get(grade, {}).get(label, (None, None))
        if feature in current:
            value = current[feature]
        else:
            _, condition_item = get_value(FEATURE_TAGS[feature])
            value = numeric_value(condition_item)
        rule_text = None
        if label == "Production Rate":
            passed = simulation_passed = value > 7.5
            low, high = 7.5, None
            support_low, support_high = 7.5, None
            rule_text = "> 7.5 t/h"
        elif label == "Main Steam Flow":
            passed = simulation_passed = True
            low = high = support_low = support_high = None
            rule_text = "ไม่จำกัด"
        else:
            if low is None or high is None:
                passed = support_low is not None and support_low <= value <= support_high
            else:
                passed = low <= value <= high
            simulation_passed = support_low is not None and support_low <= value <= support_high
        strict_eligible = strict_eligible and passed
        simulation_eligible = simulation_eligible and simulation_passed
        checks.append({"name": label, "value": value, "min": low if low is not None else support_low,
                       "max": high if high is not None else support_high, "passed": passed,
                       "simulation_min": support_low, "simulation_max": support_high,
                       "simulation_passed": simulation_passed, "rule_text": rule_text})
    quality_pass = rec.get("all_constraints_pass", "True") == "True"
    meaningful_saving = model_saving_kw > 0.5
    strict_eligible = strict_eligible and meaningful_saving and quality_pass
    simulation_eligible = simulation_eligible and quality_pass
    setpoints = {label: candidate[feature] for label, feature in RECOMMENDATION_FEATURES.items()}
    current_setpoints = {label: current[feature] for label, feature in RECOMMENDATION_FEATURES.items()}
    if vacuum_rec:
        setpoints["Turbo Vacuum Level SP"] = candidate["Turbo Vacumm level"]
        current_setpoints["Turbo Vacuum Level SP"] = current["Turbo Vacumm level"]
    payload = {"grade": grade, "current_predicted_kw": current_kw, "optimized_predicted_kw": candidate_kw, "actual_kw": actual_kw,
               "estimated_saving_kw": model_saving_kw, "model_to_model_saving_kw": model_saving_kw, "actual_saving_kw": actual_saving_kw, "recommended_setpoints": setpoints, "current_setpoints": current_setpoints,
               "recommended_ranges": ranges.get(grade, {}), "vacuum_level_range": f"{vacuum_rec['vacuum_level_min_kPa']} to {vacuum_rec['vacuum_level_max_kPa']}" if vacuum_rec else None,
               "eligible_for_trial": strict_eligible, "simulation_available": simulation_eligible,
               "optimization_mode": "trial" if strict_eligible else ("simulation" if simulation_eligible else "outside_model_envelope"),
               "has_improvement": meaningful_saving,
               "checks": checks, "quality_constraints_pass": quality_pass,
               "model": selected_model["metrics"].get("model"), "r2": selected_model["metrics"].get("r2"), "mae_kw": selected_model["metrics"].get("mae"),
               "note": "คำแนะนำจากโมเดลเท่านั้น ระบบนี้ไม่เขียนค่าเข้า PI และต้องผ่าน MOC ก่อนทดลอง"}
    optimization_cache.update({"at": time.time(), "payload": payload})
    return payload


class DashboardHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        # The dashboard is edited in place. Always load the latest HTML/JS when
        # it is opened through start_pi_dashboard.bat instead of a cached copy.
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def send_json(self, payload, status=HTTPStatus.OK):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def proxy_to_live_server(self):
        """Forward API reads to the local SSO-enabled dashboard process."""
        response = requests.get(f"{UPSTREAM_URL}{self.path}", timeout=45)
        body = response.content
        self.send_response(response.status_code)
        self.send_header("Content-Type", response.headers.get("Content-Type", "application/json; charset=utf-8"))
        self.send_header("Content-Length", str(len(body)))
        self.send_header("X-Dashboard-Upstream", UPSTREAM_URL)
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        path = urlparse(self.path)
        if UPSTREAM_URL and path.path.startswith("/api/"):
            try:
                self.proxy_to_live_server()
                return
            except Exception:
                # Keep the shared page usable with its local cache if the
                # private SSO-enabled server is temporarily unavailable.
                pass
        if path.path == "/api/health":
            self.send_json({"status": "ok", "pi_web_api": BASE_URL, "pi_server": PI_SERVER,
                            "historical_snapshot": True, "dashboard_version": "2026-08-24"})
            return
        if path.path == "/api/snapshot":
            query = parse_qs(path.query)
            at_time = query.get("time", [""])[0].strip()
            requested = query.get("tags", [","])[0].split(",")
            requested = [tag for tag in requested if tag in ALLOWED_TAGS] or TAGS
            try:
                timestamp = pd.Timestamp(at_time)
                if pd.isna(timestamp):
                    raise ValueError("Invalid timestamp")
                if timestamp.tzinfo is None:
                    timestamp = timestamp.tz_localize("Asia/Bangkok")
                at_time = timestamp.isoformat()
            except Exception:
                self.send_json({"error": "กรุณาระบุวันและเวลาที่ถูกต้อง"}, HTTPStatus.BAD_REQUEST)
                return
            values, errors = {}, {}
            with ThreadPoolExecutor(max_workers=8) as pool:
                futures = {pool.submit(get_value_at, tag, at_time): tag for tag in requested}
                for future in as_completed(futures):
                    tag = futures[future]
                    try:
                        key, value = future.result()
                        values[key] = value
                    except Exception as error:
                        errors[tag] = str(error)
            status = HTTPStatus.OK if values else HTTPStatus.BAD_GATEWAY
            self.send_json({"mode": "historical", "requested_time": at_time,
                            "values": values, "errors": errors, "count": len(values)}, status)
            return
        if path.path == "/api/history":
            query = parse_qs(path.query)
            tag = query.get("tag", [""])[0]
            if tag not in ALLOWED_TAGS:
                self.send_json({"error": "Unknown or unauthorized PI tag"}, HTTPStatus.BAD_REQUEST)
                return
            try:
                duration = query.get("duration", ["1h"])[0]
                interval = query.get("interval", ["5m"])[0]
                if duration not in {"1h", "6h", "8h", "12h", "24h"} or interval not in {"1m", "5m", "10m"}:
                    self.send_json({"error": "Unsupported trend period"}, HTTPStatus.BAD_REQUEST)
                    return
                items = get_history(tag, duration, interval)
                self.send_json({"tag": tag, "items": items})
            except Exception as error:
                self.send_json({"error": str(error)}, HTTPStatus.BAD_GATEWAY)
            return
        if path.path == "/api/specific-energy-comparison":
            try:
                refresh = parse_qs(path.query).get("refresh", ["0"])[0] == "1"
                self.send_json(get_specific_energy_comparison(refresh))
            except Exception as error:
                self.send_json({"error": str(error)}, HTTPStatus.BAD_GATEWAY)
            return
        if path.path == "/api/prediction":
            try:
                self.send_json(get_prediction())
            except Exception as error:
                self.send_json({"error": str(error)}, HTTPStatus.BAD_GATEWAY)
            return
        if path.path == "/api/model-status":
            status_path = os.path.join(FORECAST_MODEL_DIR, "retraining_status.json")
            if os.path.isfile(status_path):
                self.send_json(json.loads(open(status_path, encoding="utf-8").read()))
            else:
                self.send_json({"message": "No retraining run has been completed yet."})
            return
        if path.path == "/api/optimization":
            try:
                self.send_json(get_optimization())
            except Exception as error:
                self.send_json({"error": str(error)}, HTTPStatus.BAD_GATEWAY)
            return
        if path.path != "/api/current":
            return super().do_GET()

        requested = parse_qs(path.query).get("tags", [","])[0].split(",")
        requested = [tag for tag in requested if tag in ALLOWED_TAGS] or TAGS
        values, errors = {}, {}
        with ThreadPoolExecutor(max_workers=8) as pool:
            futures = {pool.submit(get_value, tag): tag for tag in requested}
            for future in as_completed(futures):
                tag = futures[future]
                try:
                    key, value = future.result()
                    values[key] = value
                # SSPI can raise a Windows credential error before Requests
                # turns it into a RequestException, so always return JSON.
                except Exception as error:
                    errors[tag] = str(error)
        cached_count = sum(
            1 for item in values.values()
            if isinstance(item, dict) and item.get("Cached")
        )
        mode = "cached" if values and cached_count == len(values) else ("mixed" if cached_count else "live")
        source_errors = [
            item.get("FallbackReason") for item in values.values()
            if isinstance(item, dict) and item.get("FallbackReason")
        ]
        source_error = source_errors[0] if source_errors else None
        if values and mode == "live":
            os.makedirs(os.path.dirname(PI_CACHE_PATH), exist_ok=True)
            with open(PI_CACHE_PATH, "w", encoding="utf-8") as cache_file:
                json.dump({"saved_at": pd.Timestamp.now(tz="Asia/Bangkok").isoformat(),
                           "values": values}, cache_file, ensure_ascii=False, indent=2)
        status = HTTPStatus.OK if values else HTTPStatus.BAD_GATEWAY
        self.send_json({"values": values, "errors": errors, "count": len(values),
                        "mode": mode, "cached": mode != "live",
                        "source_error": source_error,
                        "auto_retry_seconds": 30}, status)

    def log_message(self, fmt, *args):
        print(f"{self.client_address[0]} - {fmt % args}")


if __name__ == "__main__":
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    server = ThreadingHTTPServer((BIND_HOST, PORT), DashboardHandler)
    print(f"Dashboard ready: http://{BIND_HOST}:{PORT}")
    if UPSTREAM_URL:
        print(f"API upstream: {UPSTREAM_URL}")
    print(f"PI Web API: {BASE_URL}  |  PI Server: {PI_SERVER}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nDashboard stopped.")
    finally:
        server.server_close()
