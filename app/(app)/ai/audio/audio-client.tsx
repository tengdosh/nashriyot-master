"use client";

import * as React from "react";
import { toast } from "sonner";
import { Scissors, AudioLines, Lock, CheckCircle2, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StatusBadge } from "@/components/shared/status-badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createAudioAction, synthesizeAudioAction, loadAudioJobAction } from "./actions";

export type AudioTitleRow = {
  id: string;
  workTitle: string;
  audioRights: boolean;
  latestJob: { id: string; status: string; chapters: number } | null;
};

type Job = Awaited<ReturnType<typeof loadAudioJobAction>>;

const fmtDur = (s: number) => {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return m > 0 ? `${m}m ${sec}s` : `${sec}s`;
};

export function AudioClient({ titles, canSynth }: { titles: AudioTitleRow[]; canSynth: boolean }) {
  const [busy, startTransition] = React.useTransition();
  const [titleId, setTitleId] = React.useState("");
  const [voice, setVoice] = React.useState("Dilnoza");
  const [lang, setLang] = React.useState("uz");
  const [sourceText, setSourceText] = React.useState("");
  const [job, setJob] = React.useState<Job | null>(null);

  const selected = titles.find((t) => t.id === titleId) ?? null;

  function loadJob(id: string) {
    startTransition(async () => {
      try {
        setJob(await loadAudioJobAction(id));
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Xatolik");
      }
    });
  }

  function create() {
    startTransition(async () => {
      try {
        const r = await createAudioAction({ titleId, voice, lang, sourceText: sourceText || undefined });
        if (!r.ok) {
          toast.error(r.error ?? "Xatolik");
          return;
        }
        setJob(await loadAudioJobAction(r.jobId));
        toast.success("Boblarga boʻlindi");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Xatolik");
      }
    });
  }

  function synth() {
    if (!job) return;
    const id = job.id;
    startTransition(async () => {
      try {
        await synthesizeAudioAction(id);
        setJob(await loadAudioJobAction(id));
        toast.success("Sintez soʻrovi bajarildi");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Xatolik");
      }
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 lg:grid-cols-[320px_1fr]">
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label>Kitob</Label>
            <Select value={titleId} onValueChange={(v) => { setTitleId(v ?? ""); setJob(null); }}>
              <SelectTrigger><SelectValue placeholder="Tanlang" /></SelectTrigger>
              <SelectContent>
                {titles.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.audioRights ? "🎧 " : "🔒 "}{t.workTitle}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selected && !selected.audioRights && (
            <div className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              <Lock className="size-4" /> Shartnomada AUDIO huquqi yoʻq
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-1.5">
              <Label>Ovoz</Label>
              <Input value={voice} onChange={(e) => setVoice(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Til</Label>
              <Input value={lang} onChange={(e) => setLang(e.target.value)} />
            </div>
          </div>

          {selected?.latestJob && !job && (
            <Button variant="outline" size="sm" onClick={() => loadJob(selected.latestJob!.id)} disabled={busy}>
              Oxirgi ishni koʻrish ({selected.latestJob.chapters} bob)
            </Button>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label>Manba matni (ixtiyoriy — boʻsh boʻlsa kitob tavsifi ishlatiladi)</Label>
          <textarea
            value={sourceText}
            onChange={(e) => setSourceText(e.target.value)}
            placeholder={"# 1-bob\nMatn...\n\n# 2-bob\nMatn..."}
            className="h-40 w-full resize-y rounded-md border bg-background p-3 font-mono text-xs"
          />
          <div>
            <Button onClick={create} disabled={busy || !titleId || (selected != null && !selected.audioRights)}>
              <Scissors className="size-4" /> Boblarga boʻlish
            </Button>
          </div>
        </div>
      </div>

      {job && (
        <div className="rounded-lg border">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <AudioLines className="size-4 text-muted-foreground" />
              {job.chapters.length} bob · ovoz: {job.voice} · {job.lang}
              <StatusBadge status={job.status} tone={job.status === "READY" ? "success" : job.status === "BLOCKED" ? "danger" : "warning"} />
            </div>
            {canSynth && (
              <Button size="sm" onClick={synth} disabled={busy}>
                <AudioLines className="size-4" /> Sintez qilish
              </Button>
            )}
          </div>
          {job.note && <div className="border-b bg-muted/40 px-4 py-2 text-xs text-muted-foreground">{job.note}</div>}
          <div className="divide-y">
            {job.chapters.map((c) => (
              <div key={c.id} className="flex items-center justify-between px-4 py-2 text-sm">
                <span className="flex items-center gap-2">
                  <span className="w-8 tabular-nums text-muted-foreground">{c.idx + 1}.</span>
                  {c.heading}
                </span>
                <span className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1"><Clock className="size-3.5" /> {fmtDur(c.durationSec)}</span>
                  {c.status === "SYNTHESIZED" ? (
                    <span className="inline-flex items-center gap-1 text-success"><CheckCircle2 className="size-3.5" /> tayyor</span>
                  ) : (
                    <StatusBadge status={c.status} tone={c.status === "FAILED" ? "danger" : "muted"} label={c.status === "QUEUED" ? "Navbatda" : c.status} />
                  )}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
