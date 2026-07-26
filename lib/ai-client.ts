/**
 * Thin client for the Python AI microservice (spec v1 §7.1). The app talks to it
 * server-to-server with a shared bearer token; the AI service never sees the DB.
 *
 * Graceful degradation is the rule: any error, timeout or non-200 returns null
 * so a page renders "AI unavailable" instead of crashing (spec §7.1).
 */

const TIMEOUT_MS = 12_000;

// Read env at call time (not module load) so config changes and tests take effect.
const base = () => process.env.AI_SERVICE_URL ?? "http://localhost:8001";
const token = () => process.env.AI_SERVICE_TOKEN ?? "dev-ai-service-token";

async function post<T>(path: string, body: unknown): Promise<T | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${base()}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token()}` },
      body: JSON.stringify(body),
      signal: controller.signal,
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null; // network error / timeout / abort → degrade
  } finally {
    clearTimeout(timer);
  }
}

export type PredictResult = {
  values: number[];
  low: number[];
  high: number[];
  mape: number | null;
  method: string;
};

export type ElasticityResult = { elasticity: number | null; r2: number | null; n: number };

export type ColdStartResult = { values: number[]; method: string; k: number };

export async function aiHealth(): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5_000);
  try {
    const res = await fetch(`${base()}/health`, { signal: controller.signal, cache: "no-store" });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export function predict(history: number[], horizon = 6): Promise<PredictResult | null> {
  return post<PredictResult>("/predict", { history, horizon });
}

export function elasticity(points: { price: number; qty: number }[]): Promise<ElasticityResult | null> {
  return post<ElasticityResult>("/elasticity", { points });
}

export function coldstart(comparables: number[][], horizon = 6, scale = 1): Promise<ColdStartResult | null> {
  return post<ColdStartResult>("/coldstart", { comparables, horizon, scale });
}
