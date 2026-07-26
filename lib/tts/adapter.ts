/**
 * TTS adapter (spec v2 §7.3): a provider-swappable seam so the audiobook
 * pipeline doesn't hard-depend on any one vendor. The default "none" provider
 * returns null (not configured) — the audio-service leaves chapters QUEUED and
 * the page shows "provayder sozlanmagan" instead of failing. A real provider
 * (ElevenLabs, Azure, Google) plugs in here later, keyed by TTS_PROVIDER.
 */

export type SynthInput = { text: string; voice: string; lang: string };
export type SynthResult = { url: string; durationSec: number };

export type TtsProvider = {
  name: string;
  configured: boolean;
  synthesize(input: SynthInput): Promise<SynthResult | null>;
};

const noneProvider: TtsProvider = {
  name: "none",
  configured: false,
  async synthesize() {
    return null; // no provider configured → graceful degradation
  },
};

/** Resolve the active provider from env at call time. Only "none" ships today. */
export function getTtsProvider(): TtsProvider {
  const name = process.env.TTS_PROVIDER ?? "none";
  // Future: case "elevenlabs"/"azure"/"google" → real adapters gated on their keys.
  switch (name) {
    default:
      return noneProvider;
  }
}

export function ttsEnabled(): boolean {
  return getTtsProvider().configured;
}
