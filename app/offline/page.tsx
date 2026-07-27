import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Offline — Nashriyot Master",
};

export default function OfflinePage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 p-6 text-center">
      <div className="flex h-20 w-20 items-center justify-center rounded-full bg-muted">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="40"
          height="40"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-muted-foreground"
        >
          <line x1="1" y1="1" x2="23" y2="23" />
          <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55" />
          <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39" />
          <path d="M10.71 5.05A16 16 0 0 1 22.56 9" />
          <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88" />
          <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
          <line x1="12" y1="20" x2="12.01" y2="20" />
        </svg>
      </div>
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold">Internetga ulanish yo&apos;q</h1>
        <p className="max-w-sm text-muted-foreground">
          Ma&apos;lumotlar navbatga saqlandi, ulanish tiklanganda avtomatik yuboriladi.
        </p>
      </div>
      <ReloadButton />
    </div>
  );
}

// Client button component
function ReloadButton() {
  return (
    <a
      href="/dashboard"
      className="rounded-md bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
    >
      Dashboardga qaytish
    </a>
  );
}
