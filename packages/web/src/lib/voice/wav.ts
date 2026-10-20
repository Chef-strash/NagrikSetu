// 16-bit PCM WAV encoding, kept free of DOM types so it can be unit-tested.
//
// MediaRecorder only produces WebM/Opus (or MP4/AAC on Safari), and Sarvam's
// speech-to-text accepts neither, so every recording is decoded and re-emitted
// as PCM WAV before it is uploaded.

/** Rate speech-to-text models expect, and a fraction of a 48 kHz capture. */
export const WAV_SAMPLE_RATE = 16_000;

/** Bytes of RIFF/WAVE/fmt/data header in front of the samples. */
export const WAV_HEADER_BYTES = 44;

/**
 * Wrap mono float samples in a PCM16 WAV container.
 *
 * `sampleRate` is written as given, so a caller that ends up with a buffer at
 * the source rate still produces a valid file rather than a mislabelled one.
 */
export function encodeWavPcm16(samples: Float32Array, sampleRate: number): ArrayBuffer {
  const dataBytes = samples.length * 2;
  const view = new DataView(new ArrayBuffer(WAV_HEADER_BYTES + dataBytes));
  const ascii = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i += 1) view.setUint8(offset + i, text.charCodeAt(i));
  };

  ascii(0, "RIFF");
  view.setUint32(4, 36 + dataBytes, true); // chunk size: everything after this field
  ascii(8, "WAVE");
  ascii(12, "fmt ");
  view.setUint32(16, 16, true); // fmt chunk size for PCM
  view.setUint16(20, 1, true); // format 1 = uncompressed PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // byte rate: rate * channels * blockAlign
  view.setUint16(32, 2, true); // block align: channels * bytes per sample
  view.setUint16(34, 16, true); // bits per sample
  ascii(36, "data");
  view.setUint32(40, dataBytes, true);

  for (let i = 0; i < samples.length; i += 1) {
    const sample = Math.max(-1, Math.min(1, samples[i] ?? 0));
    // The two halves scale by their own full-scale magnitude so -1 lands on
    // -32768 and +1 on 32767 without wrapping past the signed range.
    view.setInt16(WAV_HEADER_BYTES + i * 2, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
  }
  return view.buffer;
}

/**
 * Decode whatever MediaRecorder produced and re-emit it as 16 kHz mono PCM WAV.
 *
 * Browsers record WebM/Opus (or MP4/AAC on Safari), and Sarvam's speech-to-text
 * accepts neither. `decodeAudioData` resamples to the context's own rate, so
 * decoding through an offline context already set to 16 kHz yields a buffer at
 * that rate. The rate is read back off the decoded buffer regardless, so a
 * browser that decodes at the source rate still produces a correctly labelled
 * file instead of a mislabelled one.
 */
export async function toWav(blob: Blob): Promise<Blob> {
  const scope = globalThis as unknown as {
    OfflineAudioContext?: typeof OfflineAudioContext;
    webkitOfflineAudioContext?: typeof OfflineAudioContext;
  };
  const OfflineCtx = scope.OfflineAudioContext ?? scope.webkitOfflineAudioContext;
  if (!OfflineCtx) throw new Error("This browser cannot convert the recording.");
  // A length-1 offline context is used purely as a decoder; nothing is rendered
  // through it, and decoding needs no user gesture.
  const ctx = new OfflineCtx(1, 1, WAV_SAMPLE_RATE);
  const decoded = await ctx.decodeAudioData(await blob.arrayBuffer());
  return new Blob([encodeWavPcm16(decoded.getChannelData(0), decoded.sampleRate)], {
    type: "audio/wav"
  });
}
