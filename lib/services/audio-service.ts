import { prisma } from "@/lib/db";
import { runWithAudit } from "@/lib/audit-context";
import { splitIntoChapters, estimateDuration, jobProgress } from "@/lib/audio";
import { getTtsProvider, ttsEnabled } from "@/lib/tts/adapter";

/**
 * Audiobook jobs (spec v2 §7.3). A job is BLOCKED unless the title has an ACTIVE
 * contract carrying AUDIO rights. Text is split into chapters (queued), then a
 * swappable TTS provider synthesizes each; with no provider configured chapters
 * stay QUEUED and the job carries a note (graceful degradation).
 */

export class AudioRightsError extends Error {
  constructor() {
    super("Bu kitob shartnomasida AUDIO huquqi yo'q — audio yaratib bo'lmaydi");
    this.name = "AudioRightsError";
  }
}
export class AudioError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AudioError";
  }
}

export function audioEnabled(): boolean {
  return ttsEnabled();
}

/** True if the title has an ACTIVE contract with AUDIO rights. */
export async function hasAudioRights(titleId: string): Promise<boolean> {
  const c = await prisma.contract.findFirst({
    where: { titleId, status: "ACTIVE", audioRights: true, archivedAt: null },
    select: { id: true },
  });
  return c != null;
}

export type CreateAudioInput = { titleId: string; voice: string; lang?: string; sourceText?: string };

/** Create a job, split its text into queued chapters. Blocks without AUDIO rights. */
export async function createAudioJob(input: CreateAudioInput, userId: string) {
  if (!(await hasAudioRights(input.titleId))) throw new AudioRightsError();

  const title = await prisma.title.findUniqueOrThrow({
    where: { id: input.titleId },
    select: { description: true },
  });
  const text = (input.sourceText ?? title.description ?? "").trim();
  if (text === "") throw new AudioError("Matn yo'q — manba matnini kiriting yoki kitob tavsifini to'ldiring");

  const chapters = splitIntoChapters(text);
  const provider = getTtsProvider();

  return runWithAudit({ userId }, async () =>
    prisma.audioJob.create({
      data: {
        titleId: input.titleId,
        voice: input.voice,
        lang: input.lang ?? "uz",
        provider: provider.name,
        status: "QUEUED",
        note: provider.configured ? null : "TTS provayder sozlanmagan — boblar navbatda kutmoqda",
        createdById: userId,
        chapters: {
          create: chapters.map((c, i) => ({
            idx: i,
            heading: c.heading,
            charCount: c.charCount,
            durationSec: estimateDuration(c.charCount),
            status: "QUEUED",
          })),
        },
      },
      include: { chapters: { orderBy: { idx: "asc" } } },
    }),
  );
}

/** Synthesize every queued chapter of a job via the TTS provider (ai.apply). */
export async function synthesizeJob(jobId: string, userId: string) {
  const job = await prisma.audioJob.findUniqueOrThrow({
    where: { id: jobId },
    include: { chapters: { orderBy: { idx: "asc" } } },
  });
  const provider = getTtsProvider();

  return runWithAudit({ userId }, async () => {
    for (const ch of job.chapters) {
      if (ch.status === "SYNTHESIZED") continue;
      const res = await provider.synthesize({ text: ch.heading, voice: job.voice, lang: job.lang });
      if (res) {
        await prisma.audioChapter.update({
          where: { id: ch.id },
          data: { status: "SYNTHESIZED", previewUrl: res.url, durationSec: res.durationSec },
        });
      }
      // no provider → leave QUEUED (graceful)
    }

    const fresh = await prisma.audioChapter.findMany({ where: { jobId }, select: { status: true } });
    const p = jobProgress(fresh);
    const status = p.total > 0 && p.synthesized === p.total ? "READY" : "QUEUED";
    const note = provider.configured ? null : "TTS provayder sozlanmagan — boblar navbatda kutmoqda";
    return prisma.audioJob.update({
      where: { id: jobId },
      data: { status, note },
      include: { chapters: { orderBy: { idx: "asc" } } },
    });
  });
}

export async function getAudioJob(jobId: string) {
  return prisma.audioJob.findUnique({
    where: { id: jobId },
    include: { chapters: { orderBy: { idx: "asc" } } },
  });
}

/** Titles with their AUDIO-rights flag and latest job, for the /ai/audio picker. */
export async function listAudioTitles(take = 200) {
  const titles = await prisma.title.findMany({
    where: { archivedAt: null, ownerType: "OWN" },
    select: {
      id: true,
      workTitle: true,
      contracts: { where: { status: "ACTIVE", audioRights: true }, select: { id: true }, take: 1 },
      audioJobs: {
        select: { id: true, status: true, _count: { select: { chapters: true } } },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
    orderBy: { updatedAt: "desc" },
    take,
  });
  return titles.map((t) => ({
    id: t.id,
    workTitle: t.workTitle,
    audioRights: t.contracts.length > 0,
    latestJob: t.audioJobs[0]
      ? { id: t.audioJobs[0].id, status: t.audioJobs[0].status, chapters: t.audioJobs[0]._count.chapters }
      : null,
  }));
}
