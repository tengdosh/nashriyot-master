import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import OpenAI from "openai";
import { estimateDuration } from "@/lib/audio";

/**
 * TTS adapter (spec v2 §7.3): a provider-swappable seam so the audiobook
 * pipeline doesn't hard-depend on any one vendor. The default "none" provider
 * returns null (not configured) → chapters stay QUEUED. When OPENAI_API_KEY is
 * set, the "openai" provider synthesizes speech, writes the mp3 to AUDIO_DIR and
 * returns a URL served by /api/audio/[id].
 */

export type SynthInput = { id: string; text: string; voice: string; lang: string };
export type SynthResult = { url: string; durationSec: number };

export type TtsProvider = {
  name: string;
  configured: boolean;
  synthesize(input: SynthInput): Promise<SynthResult | null>;
};

/** Where synthesized mp3 files live (served by the /api/audio/[id] route). */
export function audioDir(): string {
  return process.env.AUDIO_DIR ?? join(process.cwd(), "audio-files");
}

const OPENAI_VOICES = new Set(["alloy", "ash", "ballad", "coral", "echo", "fable", "nova", "onyx", "sage", "shimmer"]);
const mapVoice = (v: string) => (OPENAI_VOICES.has(v.toLowerCase()) ? v.toLowerCase() : "alloy");

const noneProvider: TtsProvider = {
  name: "none",
  configured: false,
  async synthesize() {
    return null;
  },
};

function openaiProvider(): TtsProvider {
  return {
    name: "openai",
    configured: true,
    async synthesize({ id, text, voice }: SynthInput): Promise<SynthResult | null> {
      try {
        const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 60_000 });
        const resp = await client.audio.speech.create({
          model: process.env.OPENAI_TTS_MODEL ?? "tts-1",
          voice: mapVoice(voice) as OpenAI.Audio.SpeechCreateParams["voice"],
          input: text.slice(0, 4000), // API input cap
        });
        const buf = Buffer.from(await resp.arrayBuffer());
        const dir = audioDir();
        await mkdir(dir, { recursive: true });
        const safe = id.replace(/[^a-zA-Z0-9_-]/g, "");
        await writeFile(join(dir, `${safe}.mp3`), buf);
        return { url: `/api/audio/${safe}`, durationSec: estimateDuration(text.length) };
      } catch {
        return null;
      }
    },
  };
}

/** Resolve the active provider from env at call time. */
export function getTtsProvider(): TtsProvider {
  const explicit = process.env.TTS_PROVIDER;
  if (explicit === "none") return noneProvider;
  if (explicit === "openai" || (!explicit && process.env.OPENAI_API_KEY)) return openaiProvider();
  return noneProvider;
}

export function ttsEnabled(): boolean {
  return getTtsProvider().configured;
}
