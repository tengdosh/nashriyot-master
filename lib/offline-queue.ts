/**
 * Offline queue — IndexedDB orqali so'rovlarni saqlaydi.
 * Online bo'lganda qayta jo'natadi, clientRequestId bilan idempotentlik.
 * Server Worker mavjud bo'lmaganda yoki offline rejimda ishlatiladi.
 */

export interface QueuedRequest {
  id: string; // UUID
  type: "sale" | "payment" | "expense" | "transfer";
  payload: unknown;
  createdAt: number;
  attempts: number;
}

const DB_NAME = "nashriyot-offline";
const STORE_NAME = "entry-queue";
const DB_VERSION = 1;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function generateId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // fallback
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** So'rovni navbatga qo'shadi, UUID qaytaradi (clientRequestId sifatida ishlatiladi). */
export function enqueue(type: string, payload: unknown): string {
  const id = generateId();
  const entry: QueuedRequest = {
    id,
    type: type as QueuedRequest["type"],
    payload,
    createdAt: Date.now(),
    attempts: 0,
  };

  // Async, lekin UI bloklamaydi
  openDb()
    .then((db) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).put(entry);
    })
    .catch((err) => {
      console.error("[offline-queue] enqueue failed:", err);
    });

  return id;
}

/** Barcha navbatdagi so'rovlarni serverga qayta yuboradi. */
export async function flush(): Promise<void> {
  if (typeof window === "undefined") return;
  if (!navigator.onLine) return;

  const db = await openDb();
  const items = await getAllItems(db);

  for (const item of items) {
    try {
      const bp = process.env.NEXT_PUBLIC_BASEPATH ?? "";
      const res = await fetch(`${bp}/api/v1/entry/${item.type}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-client-request-id": item.id,
        },
        body: JSON.stringify(item.payload),
      });

      if (res.ok || res.status === 409) {
        // 409 = idempotent duplicate, ham olib tashlash
        await removeItem(db, item.id);
      } else {
        // Urinishlar sonini oshirish
        const updated: QueuedRequest = { ...item, attempts: item.attempts + 1 };
        const tx = db.transaction(STORE_NAME, "readwrite");
        tx.objectStore(STORE_NAME).put(updated);
      }
    } catch {
      // Network xatosi — keyingi flush da qayta urinish
      const updated: QueuedRequest = { ...item, attempts: item.attempts + 1 };
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).put(updated);
    }
  }
}

function getAllItems(db: IDBDatabase): Promise<QueuedRequest[]> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const req = tx.objectStore(STORE_NAME).getAll();
    req.onsuccess = () => resolve(req.result as QueuedRequest[]);
    req.onerror = () => reject(req.error);
  });
}

function removeItem(db: IDBDatabase, id: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const req = tx.objectStore(STORE_NAME).delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

/** Joriy navbat holatini sinxron qaytaradi (async versiyasi uchun getQueueAsync ishlatiladi). */
export function getQueue(): QueuedRequest[] {
  // Sinxron versiya — IndexedDB sinxron API yo'q.
  // Bu funksiya faqat debugging uchun; UI da getQueueAsync ishlatiladi.
  return [];
}

export async function getQueueAsync(): Promise<QueuedRequest[]> {
  if (typeof window === "undefined") return [];
  try {
    const db = await openDb();
    return getAllItems(db);
  } catch {
    return [];
  }
}

/** Online bo'lganda avtomatik flush. */
if (typeof window !== "undefined") {
  window.addEventListener("online", () => {
    flush().catch(console.error);
  });
}
