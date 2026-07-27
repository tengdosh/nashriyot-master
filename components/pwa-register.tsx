"use client";

import { useEffect } from "react";
import { flush } from "@/lib/offline-queue";

/**
 * Service Worker ni ro'yxatdan o'tkazadi va online bo'lganda
 * IndexedDB navbatini flush qiladi.
 * app/(app)/layout.tsx ga qo'shilishi kerak.
 */
export function PwaRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(console.error);
    }

    // SW dan flush signal kelganda offline navbatni yuborish
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.addEventListener("message", (e) => {
        if (e.data?.type === "FLUSH_QUEUE") {
          flush().catch(console.error);
        }
      });
    }

    // Online bo'lganda offline navbatni flush qilish
    const handleOnline = () => {
      flush().catch(console.error);
    };
    window.addEventListener("online", handleOnline);
    return () => window.removeEventListener("online", handleOnline);
  }, []);

  return null;
}
