import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import {
  createAudioJob,
  synthesizeJob,
  hasAudioRights,
  listAudioTitles,
  audioEnabled,
  AudioRightsError,
  AudioError,
} from "@/lib/services/audio-service";

const USER = "user-director";
let withRightsId = "";
let noRightsId = "";
let contributorId = "";
const jobIds: string[] = [];

beforeAll(async () => {
  const contrib = await prisma.contributor.create({ data: { fullName: "AUDIOTEST muallif", role: "AUTHOR" } });
  contributorId = contrib.id;

  const t1 = await prisma.title.create({
    data: { workTitle: "AUDIOTEST huquqli", ownerType: "OWN", entityId: "ent-tasnim", language: "uz", keywords: [], themaCodes: [], bisacCodes: [] },
  });
  withRightsId = t1.id;
  await prisma.contract.create({
    data: { contributorId, titleId: t1.id, type: "ROYALTY", audioRights: true, status: "ACTIVE" },
  });

  const t2 = await prisma.title.create({
    data: { workTitle: "AUDIOTEST huquqsiz", ownerType: "OWN", entityId: "ent-tasnim", language: "uz", keywords: [], themaCodes: [], bisacCodes: [] },
  });
  noRightsId = t2.id;
});

afterAll(async () => {
  await prisma.audioChapter.deleteMany({ where: { jobId: { in: jobIds } } });
  await prisma.audioJob.deleteMany({ where: { id: { in: jobIds } } });
  await prisma.contract.deleteMany({ where: { contributorId } });
  await prisma.title.deleteMany({ where: { id: { in: [withRightsId, noRightsId] } } });
  await prisma.contributor.deleteMany({ where: { id: contributorId } });
});

describe("M18 — audio (TTS)", () => {
  it("reports AUDIO rights per title", async () => {
    expect(await hasAudioRights(withRightsId)).toBe(true);
    expect(await hasAudioRights(noRightsId)).toBe(false);
  });

  it("blocks a title without AUDIO rights", async () => {
    await expect(
      createAudioJob({ titleId: noRightsId, voice: "Dilnoza", sourceText: "matn" }, USER),
    ).rejects.toThrow(AudioRightsError);
  });

  it("refuses an empty manuscript", async () => {
    await expect(
      createAudioJob({ titleId: withRightsId, voice: "Dilnoza" }, USER),
    ).rejects.toThrow(AudioError); // no sourceText and no description
  });

  it("splits a manuscript into queued chapters", async () => {
    const job = await createAudioJob(
      { titleId: withRightsId, voice: "Dilnoza", sourceText: "# 1-bob\nBirinchi bob matni.\n# 2-bob\nIkkinchi bob matni." },
      USER,
    );
    jobIds.push(job.id);
    expect(job.chapters.length).toBe(2);
    expect(job.chapters.every((c) => c.status === "QUEUED")).toBe(true);
    expect(job.chapters[0].durationSec).toBeGreaterThan(0);
    expect(job.provider).toBe("none");
  });

  it("degrades on synthesis when no provider is configured", async () => {
    expect(audioEnabled()).toBe(false);
    const job = await createAudioJob({ titleId: withRightsId, voice: "Dilnoza", sourceText: "# Bob\nMatn." }, USER);
    jobIds.push(job.id);

    const after = await synthesizeJob(job.id, USER);
    expect(after.status).toBe("QUEUED"); // nothing synthesized
    expect(after.chapters.every((c) => c.status === "QUEUED")).toBe(true);
    expect(after.note).toContain("provayder");
  });

  it("lists titles with the AUDIO-rights flag", async () => {
    const rows = await listAudioTitles();
    expect(rows.find((r) => r.id === withRightsId)?.audioRights).toBe(true);
    expect(rows.find((r) => r.id === noRightsId)?.audioRights).toBe(false);
  });
});
