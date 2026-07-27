/**
 * Thin read-only client to the platform's reports API. The bot NEVER touches
 * the database — every number comes from here, gated by REPORTS_API_TOKEN and
 * scoped to the acting user (spec §5.3).
 */

const BASE = process.env.PLATFORM_API_URL ?? "http://localhost:3100";
const TOKEN = process.env.REPORTS_API_TOKEN ?? "";

export type Menu = { name: string; label: string; icon: string }[];
export type Identity = {
  userId: string;
  permissions: string[];
  entityAccess: string[];
  menu: Menu;
  subscriptions: unknown;
} | null;

function authHeaders(userId?: string): Record<string, string> {
  const h: Record<string, string> = { authorization: `Bearer ${TOKEN}`, "content-type": "application/json" };
  if (userId) h["x-user-id"] = userId;
  return h;
}

/** Resolve a chat → its linked user and permitted menu (null if not linked). */
export async function getIdentity(chatId: string): Promise<Identity> {
  const res = await fetch(`${BASE}/api/v1/telegram/me?chatId=${encodeURIComponent(chatId)}`, {
    headers: authHeaders(),
  });
  const body = (await res.json()) as { data: Identity };
  return body.data;
}

export async function link(chatId: string, code: string): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch(`${BASE}/api/v1/telegram/link`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ chatId, code }),
  });
  const body = (await res.json()) as { data: unknown; error?: string };
  return res.ok ? { ok: true } : { ok: false, error: body.error };
}

export async function unlink(chatId: string): Promise<boolean> {
  const res = await fetch(`${BASE}/api/v1/telegram/link`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ chatId, action: "unlink" }),
  });
  const body = (await res.json()) as { data: { removed: boolean } };
  return res.ok && body.data?.removed === true;
}

export async function subscribe(chatId: string, subscriptions: unknown): Promise<boolean> {
  const res = await fetch(`${BASE}/api/v1/telegram/link`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ chatId, action: "subscribe", subscriptions }),
  });
  return res.ok;
}

export type ChatPush = { chatId: string; notifications: { id: string; text: string }[] };

/** Poll per-chat pending push notifications since `sinceIso` (playbook §5.2). */
export async function getPushes(sinceIso: string): Promise<ChatPush[]> {
  const res = await fetch(`${BASE}/api/v1/telegram/pushes?since=${encodeURIComponent(sinceIso)}`, {
    headers: authHeaders(),
  });
  if (!res.ok) return [];
  const body = (await res.json()) as { data: ChatPush[] | null };
  return body.data ?? [];
}

// ── Telegram entry write (M27-E) ───────────────────────────────────────────

export type ParsedEntry = {
  type:          string;
  amount:        number | null;
  currency:      string;
  description:   string;
  date:          string | null;
  partnerName:   string | null;
  productName:   string | null;
  qty:           number | null;
  unitPrice:     number | null;
  unknownFields: string[];
};

/**
 * Ask the platform to parse free text into a structured entry card.
 * The bot shows this card to the user for confirmation — nothing is saved.
 */
export async function parseEntry(
  chatId: string,
  type: string,
  text: string,
): Promise<{ data: ParsedEntry | null; error?: string }> {
  const res = await fetch(`${BASE}/api/v1/telegram/entry`, {
    method:  "POST",
    headers: authHeaders(),
    body:    JSON.stringify({ chatId, action: "parse", type, text }),
  });
  const body = (await res.json()) as { data: ParsedEntry | null; error?: string };
  return body;
}

/**
 * Save a confirmed parsed entry as a DRAFT on the platform.
 * Returns the created record id.
 */
export async function saveEntry(
  chatId:          string,
  type:            string,
  parsed:          ParsedEntry,
  clientRequestId: string,
): Promise<{ ok: boolean; id?: string; kind?: string; error?: string }> {
  const res = await fetch(`${BASE}/api/v1/telegram/entry`, {
    method:  "POST",
    headers: authHeaders(),
    body:    JSON.stringify({ chatId, action: "save", type, parsed, clientRequestId }),
  });
  const body = (await res.json()) as { data?: { id: string; kind: string }; error?: string };
  return res.ok ? { ok: true, id: body.data?.id, kind: body.data?.kind } : { ok: false, error: body.error };
}

export type ReportResponse = { data: unknown; generatedAt: string; params: unknown; error?: string };

/** Run a whitelisted report as the given user. */
export async function runReport(
  userId: string,
  name: string,
  params: Record<string, string | number> = {},
): Promise<ReportResponse> {
  const qs = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)])).toString();
  const url = `${BASE}/api/v1/reports/${encodeURIComponent(name)}${qs ? `?${qs}` : ""}`;
  const res = await fetch(url, { headers: authHeaders(userId) });
  return (await res.json()) as ReportResponse;
}
