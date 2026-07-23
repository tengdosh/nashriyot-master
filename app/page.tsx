export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-8 text-center">
      <div className="flex items-center gap-3">
        <span
          aria-hidden
          className="inline-block h-10 w-10 rounded-lg bg-primary"
        />
        <h1 className="text-3xl font-semibold tracking-tight">Nashriyot-Master</h1>
      </div>
      <p className="max-w-md text-muted-foreground">
        Nashriyot ERP tizimi. Loyiha skeleti tayyor — modullar keyingi
        bosqichlarda quriladi.
      </p>
      <p className="text-sm text-muted-foreground">
        Boshlash uchun{" "}
        <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-foreground">
          docker compose up -d
        </code>{" "}
        va{" "}
        <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-foreground">
          npm run dev
        </code>
        .
      </p>
    </main>
  );
}
