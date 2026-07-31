"""Nashriyot-Master AI microservice (v1 §7.1).

Stateless, on-the-fly model fitting. The Next.js app sends history as JSON —
the AI service NEVER touches the database. A shared bearer token guards every
endpoint except /health. Every model is deterministic so a forecast can be
reproduced and back-tested.

Endpoints:
  GET  /health       liveness
  POST /predict      monthly demand forecast (moving-avg + linear reg + seasonal ensemble)
  POST /elasticity   log-log price elasticity from (price, qty) points
  POST /coldstart    kNN mean over supplied comparable curves
"""

from __future__ import annotations

import math
import os
from typing import Annotated

import numpy as np
from fastapi import Depends, FastAPI, Header, HTTPException
from pydantic import BaseModel, Field

app = FastAPI(title="Nashriyot-Master AI Service", version="1.1.0")

AI_TOKEN = os.environ.get("AI_SERVICE_TOKEN", "dev-ai-service-token")
MIN_HISTORY = 18  # months required before the full ensemble runs (spec §6.6)
BACKTEST_MONTHS = 6
SEASONAL_PERIOD = 12  # monthly seasonality


def require_token(authorization: Annotated[str | None, Header()] = None) -> None:
    """Bearer-token gate. Server-to-server only; no user context here."""
    expected = f"Bearer {AI_TOKEN}"
    if authorization != expected:
        raise HTTPException(status_code=401, detail="Invalid AI service token")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "ai-service"}


# ── Forecast ──────────────────────────────────────────────────────────────────
class PredictIn(BaseModel):
    history: list[float] = Field(..., description="Monthly units, oldest first")
    horizon: int = Field(6, ge=1, le=24)


class PredictOut(BaseModel):
    values: list[float]
    low: list[float]
    high: list[float]
    mape: float | None
    method: str
    seasonal_indices: list[float] | None = None  # 12-month indices (for transparency)


def _moving_average(history: np.ndarray, horizon: int, w: int = 3) -> np.ndarray:
    """Flat forecast at the mean of the last `w` observations."""
    base = float(history[-w:].mean()) if len(history) >= w else float(history.mean())
    return np.full(horizon, max(base, 0.0))


def _linear_regression(history: np.ndarray, horizon: int) -> np.ndarray:
    """Least-squares trend extrapolated forward, floored at zero."""
    x = np.arange(len(history), dtype=float)
    slope, intercept = np.polyfit(x, history, 1)
    future_x = np.arange(len(history), len(history) + horizon, dtype=float)
    return np.maximum(slope * future_x + intercept, 0.0)


def _seasonal_indices(history: np.ndarray) -> np.ndarray:
    """
    Compute 12 multiplicative seasonal indices from the history.

    Method: ratio-to-moving-average (classical decomposition).
    1. Compute a 12-month centred moving average (the trend).
    2. Divide each point by its trend value to get the seasonal-irregular ratio.
    3. Average the ratios by month position → raw seasonal indices.
    4. Normalise so the indices sum to 12 (preserves total volume).
    Returns an array of 12 floats (index 0 = same month as history[0]).
    """
    n = len(history)
    if n < SEASONAL_PERIOD * 2:
        return np.ones(SEASONAL_PERIOD)

    # Centred moving average (12-month, double-smoothed for even period)
    ma = np.convolve(history, np.ones(SEASONAL_PERIOD) / SEASONAL_PERIOD, mode="valid")
    # Double-smooth to centre the MA on an integer month
    cma = (ma[:-1] + ma[1:]) / 2  # length = n - 12

    # The centred MA aligns with history[6 : n-6]
    offset = SEASONAL_PERIOD // 2
    ratio = history[offset : n - offset] / np.where(cma > 0, cma, 1.0)

    # Group ratios by month position
    raw = np.zeros(SEASONAL_PERIOD)
    counts = np.zeros(SEASONAL_PERIOD, dtype=int)
    for i, r in enumerate(ratio):
        m = (offset + i) % SEASONAL_PERIOD
        raw[m] += r
        counts[m] += 1

    # Mean ratio per month (at least 1 observation guaranteed by len >= 24)
    with np.errstate(invalid="ignore"):
        si = np.where(counts > 0, raw / np.maximum(counts, 1), 1.0)

    # Normalise: sum → 12
    total = si.sum()
    if total > 0:
        si = si * SEASONAL_PERIOD / total
    else:
        si = np.ones(SEASONAL_PERIOD)

    return si


def _seasonal_forecast(history: np.ndarray, horizon: int) -> np.ndarray:
    """
    Trend × seasonal model:
    1. Fit a linear trend to the deseasonalised series.
    2. Project the trend forward.
    3. Multiply each projected month by its seasonal index.
    """
    si = _seasonal_indices(history)

    # Deseasonalise the history
    season_pos = np.arange(len(history)) % SEASONAL_PERIOD
    si_history = si[season_pos]
    deseason = history / np.where(si_history > 0, si_history, 1.0)

    # Fit trend on deseasonalised series
    x = np.arange(len(deseason), dtype=float)
    slope, intercept = np.polyfit(x, deseason, 1)
    future_x = np.arange(len(history), len(history) + horizon, dtype=float)
    trend_proj = np.maximum(slope * future_x + intercept, 0.0)

    # Reapply seasonal indices for the future months
    future_season_pos = np.arange(len(history), len(history) + horizon) % SEASONAL_PERIOD
    si_future = si[future_season_pos]
    return np.maximum(trend_proj * si_future, 0.0)


def _mape(actual: np.ndarray, predicted: np.ndarray) -> float | None:
    """Mean abs pct error; skips zero-actual months (undefined there)."""
    mask = actual != 0
    if not mask.any():
        return None
    return float(np.mean(np.abs((actual[mask] - predicted[mask]) / actual[mask])))


def _backtest_mape(history: np.ndarray, fn) -> float | None:
    """Fit on all-but-last-N, score the held-out N months."""
    if len(history) <= BACKTEST_MONTHS:
        return None
    train, test = history[:-BACKTEST_MONTHS], history[-BACKTEST_MONTHS:]
    pred = fn(train, BACKTEST_MONTHS)
    return _mape(test, pred)


@app.post("/predict", dependencies=[Depends(require_token)])
def predict(body: PredictIn) -> PredictOut:
    history = np.array(body.history, dtype=float)
    if len(history) < MIN_HISTORY:
        raise HTTPException(
            status_code=400,
            detail=f"Kamida {MIN_HISTORY} oylik tarix kerak (cold-start uchun /coldstart)",
        )

    models: dict[str, object] = {
        "moving_average": _moving_average,
        "linear_regression": _linear_regression,
        "seasonal": _seasonal_forecast,
    }

    # Inverse-MAPE ensemble weights: a model that back-tests better counts more.
    weights: dict[str, float] = {}
    scored: dict[str, float] = {}
    for name, fn in models.items():
        m = _backtest_mape(history, fn)
        scored[name] = m if m is not None else float("inf")
        weights[name] = 1.0 / (m + 1e-6) if m is not None else 0.0

    total_w = sum(weights.values())
    if total_w == 0:
        weights = {name: 1.0 for name in models}
        total_w = float(len(models))

    forecast = np.zeros(body.horizon)
    for name, fn in models.items():
        forecast += (weights[name] / total_w) * fn(history, body.horizon)

    # Ensemble MAPE = weighted blend of the components' back-test scores.
    finite = {n: s for n, s in scored.items() if math.isfinite(s)}
    ensemble_mape = (
        sum(weights[n] * finite[n] for n in finite) / sum(weights[n] for n in finite)
        if finite
        else None
    )

    # A simple, honest band: ±1 residual-std around the point forecast.
    resid_std = float(history.std()) if len(history) > 1 else 0.0
    low = np.maximum(forecast - resid_std, 0.0)
    high = forecast + resid_std

    # Compute and return the 12 seasonal indices (transparency / debugging)
    si = _seasonal_indices(history)

    return PredictOut(
        values=[round(v, 2) for v in forecast.tolist()],
        low=[round(v, 2) for v in low.tolist()],
        high=[round(v, 2) for v in high.tolist()],
        mape=round(ensemble_mape, 4) if ensemble_mape is not None else None,
        method="ensemble_seasonal",
        seasonal_indices=[round(v, 4) for v in si.tolist()],
    )


# ── Elasticity ────────────────────────────────────────────────────────────────
class ElasticityPoint(BaseModel):
    price: float = Field(..., gt=0)
    qty: float = Field(..., ge=0)


class ElasticityIn(BaseModel):
    points: list[ElasticityPoint]


class ElasticityOut(BaseModel):
    elasticity: float | None
    r2: float | None
    n: int


@app.post("/elasticity", dependencies=[Depends(require_token)])
def elasticity(body: ElasticityIn) -> ElasticityOut:
    """Log-log OLS: ln(qty) = a + e*ln(price); slope e is the elasticity."""
    pts = [p for p in body.points if p.price > 0 and p.qty > 0]
    if len(pts) < 3:
        return ElasticityOut(elasticity=None, r2=None, n=len(pts))

    lp = np.log(np.array([p.price for p in pts]))
    lq = np.log(np.array([p.qty for p in pts]))
    if np.ptp(lp) == 0:
        return ElasticityOut(elasticity=None, r2=None, n=len(pts))

    slope, intercept = np.polyfit(lp, lq, 1)
    pred = slope * lp + intercept
    ss_res = float(np.sum((lq - pred) ** 2))
    ss_tot = float(np.sum((lq - lq.mean()) ** 2))
    r2 = 1.0 - ss_res / ss_tot if ss_tot > 0 else None

    return ElasticityOut(
        elasticity=round(float(slope), 4),
        r2=round(r2, 4) if r2 is not None else None,
        n=len(pts),
    )


# ── Cold-start ────────────────────────────────────────────────────────────────
class ColdStartIn(BaseModel):
    comparables: list[list[float]] = Field(..., description="Comparable monthly curves")
    horizon: int = Field(6, ge=1, le=24)
    scale: float = Field(1.0, gt=0, description="External-signal scale multiplier")


class ColdStartOut(BaseModel):
    values: list[float]
    method: str
    k: int


@app.post("/coldstart", dependencies=[Depends(require_token)])
def coldstart(body: ColdStartIn) -> ColdStartOut:
    """Mean of the (length-normalised) comparable curves * external scale."""
    curves = [np.array(c, dtype=float) for c in body.comparables if len(c) > 0]
    if not curves:
        raise HTTPException(status_code=400, detail="Kamida bitta o'xshash egri kerak")

    resampled = []
    for c in curves:
        idx = np.linspace(0, len(c) - 1, body.horizon)
        resampled.append(np.interp(idx, np.arange(len(c)), c))
    mean_curve = np.mean(resampled, axis=0) * body.scale
    return ColdStartOut(
        values=[round(float(v), 2) for v in np.maximum(mean_curve, 0.0).tolist()],
        method="coldstart_knn",
        k=len(curves),
    )
