"""Nashriyot-Master AI microservice (v1 §7.1).

Stateless, on-the-fly model fitting. The Next.js app sends history as JSON —
the AI service NEVER touches the database. A shared bearer token guards every
endpoint except /health. Every model is deterministic so a forecast can be
reproduced and back-tested.

Endpoints:
  GET  /health       liveness
  POST /predict      monthly demand forecast (moving-avg + linear reg ensemble)
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

app = FastAPI(title="Nashriyot-Master AI Service", version="1.0.0")

AI_TOKEN = os.environ.get("AI_SERVICE_TOKEN", "dev-ai-service-token")
MIN_HISTORY = 18  # months required before the full ensemble runs (spec §6.6)
BACKTEST_MONTHS = 6


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

    models = {"moving_average": _moving_average, "linear_regression": _linear_regression}

    # Inverse-MAPE ensemble weights: a model that back-tests better counts more.
    weights: dict[str, float] = {}
    scored: dict[str, float] = {}
    for name, fn in models.items():
        m = _backtest_mape(history, fn)
        scored[name] = m if m is not None else float("inf")
        # +epsilon so a perfect (0) MAPE doesn't divide by zero.
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

    return PredictOut(
        values=[round(v, 2) for v in forecast.tolist()],
        low=[round(v, 2) for v in low.tolist()],
        high=[round(v, 2) for v in high.tolist()],
        mape=round(ensemble_mape, 4) if ensemble_mape is not None else None,
        method="ensemble",
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
        # Not enough distinct observations to fit anything trustworthy.
        return ElasticityOut(elasticity=None, r2=None, n=len(pts))

    lp = np.log(np.array([p.price for p in pts]))
    lq = np.log(np.array([p.qty for p in pts]))
    if np.ptp(lp) == 0:  # all prices identical -> slope undefined
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
