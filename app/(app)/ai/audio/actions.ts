"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/rbac";
import {
  createAudioJob,
  synthesizeJob,
  getAudioJob,
  AudioRightsError,
  AudioError,
} from "@/lib/services/audio-service";

export async function createAudioAction(input: { titleId: string; voice: string; lang?: string; sourceText?: string }) {
  const user = await requirePermission("ai.read");
  try {
    const job = await createAudioJob(input, user.id);
    revalidatePath("/ai/audio");
    return { ok: true as const, jobId: job.id };
  } catch (e) {
    if (e instanceof AudioRightsError) return { ok: false as const, blocked: true, error: e.message };
    if (e instanceof AudioError) return { ok: false as const, blocked: false, error: e.message };
    throw e;
  }
}

export async function synthesizeAudioAction(jobId: string) {
  const user = await requirePermission("ai.apply");
  await synthesizeJob(jobId, user.id);
  revalidatePath("/ai/audio");
  return { ok: true };
}

export async function loadAudioJobAction(jobId: string) {
  await requirePermission("ai.read");
  return getAudioJob(jobId);
}
