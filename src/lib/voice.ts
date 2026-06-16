// Henry's voice — Web Speech API text-to-speech. Lets Henry narrate his
// thoughts and trades out loud. No dependencies; degrades silently where
// speechSynthesis is unavailable.

export const voiceSupported =
  typeof window !== "undefined" && "speechSynthesis" in window;

let preferred: SpeechSynthesisVoice | null = null;

function pickVoice(): SpeechSynthesisVoice | null {
  if (!voiceSupported) return null;
  const vs = window.speechSynthesis.getVoices();
  if (!vs.length) return null;
  preferred =
    vs.find(
      (v) =>
        /^en(-|_)?(GB|US)/i.test(v.lang) &&
        /(Google|Natural|Neural|Daniel|Samantha|Aria|Jenny)/i.test(v.name)
    ) ||
    vs.find((v) => /^en/i.test(v.lang)) ||
    vs[0];
  return preferred;
}

if (voiceSupported) {
  try {
    window.speechSynthesis.onvoiceschanged = pickVoice;
    pickVoice();
  } catch {
    /* ignore */
  }
}

/** Speak a line as Henry. Cancels any in-flight utterance first. */
export function speak(text: string) {
  if (!voiceSupported || !text) return;
  try {
    const synth = window.speechSynthesis;
    synth.cancel();
    const u = new SpeechSynthesisUtterance(text.replace(/[“”"]/g, ""));
    const v = preferred || pickVoice();
    if (v) u.voice = v;
    u.rate = 1.03;
    u.pitch = 0.9; // calm, slightly low — an AI mind
    u.volume = 1;
    synth.speak(u);
  } catch {
    /* ignore */
  }
}

export function stopSpeaking() {
  if (!voiceSupported) return;
  try {
    window.speechSynthesis.cancel();
  } catch {
    /* ignore */
  }
}
