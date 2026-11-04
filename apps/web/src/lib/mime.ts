export function pickRecorderMime(): { mimeType: string; extension: string } {
  const candidates: { mimeType: string; extension: string }[] = [
    { mimeType: "audio/webm;codecs=opus", extension: "webm" },
    { mimeType: "audio/webm", extension: "webm" },
    { mimeType: "audio/mp4", extension: "m4a" },
    { mimeType: "audio/ogg;codecs=opus", extension: "ogg" },
  ];
  for (const c of candidates) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(c.mimeType)) {
      return c;
    }
  }
  return { mimeType: "", extension: "webm" };
}
