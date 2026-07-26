import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/rbac";
import { audioDir } from "@/lib/tts/adapter";

/**
 * Streams a synthesized chapter mp3 (M18). Gated on ai.read; the id is sanitized
 * to a bare filename to prevent path traversal.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requirePermission("ai.read");
  } catch {
    return new NextResponse("Avtorizatsiya talab qilinadi", { status: 401 });
  }
  const { id } = await ctx.params;
  const safe = id.replace(/[^a-zA-Z0-9_-]/g, "");
  if (!safe) return new NextResponse("Topilmadi", { status: 404 });
  try {
    const buf = await readFile(join(audioDir(), `${safe}.mp3`));
    return new NextResponse(new Uint8Array(buf), {
      headers: { "content-type": "audio/mpeg", "cache-control": "private, max-age=3600" },
    });
  } catch {
    return new NextResponse("Audio topilmadi", { status: 404 });
  }
}
