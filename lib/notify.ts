/**
 * Pure notification helpers for Telegram push (playbook §5.2). Decides whether a
 * platform notification should be pushed to a given chat (opted-in event AND the
 * user is permitted to see that data), and renders it to an Uzbek message. Pure
 * and 100% unit-tested; the service supplies the rows.
 */

export type NotifType =
  | "ROP"
  | "DEAD_STOCK"
  | "BREAK_EVEN"
  | "CREDIT_LIMIT"
  | "AR_OVERDUE"
  | "VARIANCE"
  | "ROYALTY_APPROVAL"
  | "RECON_MISMATCH"
  | "GENERAL";

export type Severity = "INFO" | "WARNING" | "CRITICAL";

/** A push only goes to users who may see that kind of data (spec §5.3). */
export const NOTIF_PERMISSION: Record<NotifType, string> = {
  ROP: "inventory.read",
  DEAD_STOCK: "inventory.read",
  BREAK_EVEN: "costing.read",
  CREDIT_LIMIT: "finance.read",
  AR_OVERDUE: "finance.read",
  VARIANCE: "reports.read",
  ROYALTY_APPROVAL: "royalty.read",
  RECON_MISMATCH: "finance.read",
  GENERAL: "reports.read",
};

const SEVERITY_ICON: Record<Severity, string> = { INFO: "ℹ️", WARNING: "⚠️", CRITICAL: "🔴" };

export type Subscription = { daily?: boolean; events?: string[] } | null | undefined;

/**
 * Should this notification type reach a chat? True when the chat subscribed to
 * the event AND the linked user holds the type's required permission. `reports.read`
 * is the base gate for any push (the bot's own scope).
 */
export function matchesSubscription(type: string, subscription: Subscription, permissions: string[]): boolean {
  const events = subscription?.events;
  if (!Array.isArray(events) || !events.includes(type)) return false;
  const perms = new Set(permissions);
  if (!perms.has("reports.read")) return false;
  const required = NOTIF_PERMISSION[type as NotifType];
  // Unknown types require only the base gate; known types need their permission.
  return required == null ? true : perms.has(required);
}

export type NotificationLike = {
  type: string;
  severity: string;
  title: string;
  body?: string | null;
  linkUrl?: string | null;
};

/** Render a notification into an Uzbek push message. */
export function renderNotification(n: NotificationLike): string {
  const icon = SEVERITY_ICON[n.severity as Severity] ?? "ℹ️";
  const lines = [`${icon} *${n.title}*`];
  if (n.body) lines.push(n.body);
  if (n.linkUrl) lines.push(`🔗 ${n.linkUrl}`);
  return lines.join("\n");
}
