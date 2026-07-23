import type { Metadata } from "next";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Kirish" };

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/40 p-6">
      <div className="w-full max-w-sm rounded-xl border bg-card p-8 shadow-sm">
        <div className="mb-6 flex items-center gap-2.5">
          <span aria-hidden className="inline-block h-8 w-8 rounded-md bg-primary" />
          <div>
            <h1 className="text-lg font-semibold leading-tight">Nashriyot-Master</h1>
            <p className="text-xs text-muted-foreground">Nashriyot ERP tizimi</p>
          </div>
        </div>
        <LoginForm />
      </div>
    </main>
  );
}
