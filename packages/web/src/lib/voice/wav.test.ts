import test from "node:test";
import assert from "node:assert/strict";
import { encodeWavPcm16, toWav, WAV_HEADER_BYTES, WAV_SAMPLE_RATE } from "./wav.ts";

function ascii(view: DataView, offset: number, length: number): string {
  let out = "";
  for (let i = 0; i < length; i += 1) out += String.fromCharCode(view.getUint8(offset + i));
  return out;
}

test("writes a RIFF/WAVE header with the PCM fmt chunk", () => {
  const wav = encodeWavPcm16(new Float32Array(4), WAV_SAMPLE_RATE);
  const view = new DataView(wav);
  assert.equal(ascii(view, 0, 4), "RIFF");
  assert.equal(ascii(view, 8, 4), "WAVE");
  assert.equal(ascii(view, 12, 4), "fmt ");
  assert.equal(view.getUint32(16, true), 16, "fmt chunk size");
  assert.equal(view.getUint16(20, true), 1, "uncompressed PCM");
  assert.equal(view.getUint16(22, true), 1, "mono");
  assert.equal(view.getUint32(24, true), WAV_SAMPLE_RATE);
  assert.equal(view.getUint16(34, true), 16, "16 bits per sample");
  assert.equal(ascii(view, 36, 4), "data");
});

test("sizes the container and the data chunk from the sample count", () => {
  const samples = new Float32Array(1000);
  const wav = encodeWavPcm16(samples, WAV_SAMPLE_RATE);
  const view = new DataView(wav);
  assert.equal(wav.byteLength, WAV_HEADER_BYTES + samples.length * 2);
  assert.equal(view.getUint32(40, true), samples.length * 2, "data chunk size");
  assert.equal(view.getUint32(4, true), 36 + samples.length * 2, "RIFF chunk size");
});

test("derives byte rate and block align from the sample rate", () => {
  const view = new DataView(encodeWavPcm16(new Float32Array(2), 8000));
  assert.equal(view.getUint32(28, true), 8000 * 2, "byte rate");
  assert.equal(view.getUint16(32, true), 2, "block align");
});

test("scales the extremes to the full signed 16-bit range", () => {
  const view = new DataView(encodeWavPcm16(new Float32Array([1, -1, 0]), WAV_SAMPLE_RATE));
  assert.equal(view.getInt16(44, true), 32767, "+1 saturates to 32767");
  assert.equal(view.getInt16(46, true), -32768, "-1 saturates to -32768");
  assert.equal(view.getInt16(48, true), 0, "silence stays zero");
});

test("clamps samples that overshoot the float range", () => {
  const view = new DataView(encodeWavPcm16(new Float32Array([2, -2]), WAV_SAMPLE_RATE));
  assert.equal(view.getInt16(44, true), 32767);
  assert.equal(view.getInt16(46, true), -32768);
});

test("an empty recording still produces a valid header", () => {
  const wav = encodeWavPcm16(new Float32Array(0), WAV_SAMPLE_RATE);
  const view = new DataView(wav);
  assert.equal(wav.byteLength, WAV_HEADER_BYTES);
  assert.equal(view.getUint32(40, true), 0);
  assert.equal(ascii(view, 0, 4), "RIFF");
});

// --- toWav: the decoder/encoder glue the recorder depends on ------------------

test("toWav decodes the recording and re-encodes it as 16 kHz mono PCM WAV", async () => {
  const seen: { rate?: number; bytes?: number } = {};
  const samples = new Float32Array([0.5, -0.5]);
  const scope = globalThis as unknown as Record<string, unknown>;
  const original = scope.OfflineAudioContext;
  scope.OfflineAudioContext = class {
    sampleRate: number;
    constructor(...args: number[]) {
      // toWav constructs the context with (channels, length, sampleRate).
      this.sampleRate = args[2] ?? 0;
    }
    async decodeAudioData(bytes: ArrayBuffer) {
      seen.rate = this.sampleRate;
      seen.bytes = bytes.byteLength;
      return { sampleRate: this.sampleRate, getChannelData: () => samples };
    }
  };

  try {
    const recorded = new Blob([new Uint8Array([1, 2, 3, 4])], { type: "audio/webm;codecs=opus" });
    const wav = await toWav(recorded);
    assert.equal(wav.type, "audio/wav", "the part is uploaded as WAV");
    assert.equal(seen.rate, WAV_SAMPLE_RATE, "decoding goes through a 16 kHz context");
    assert.equal(seen.bytes, 4, "the recorded bytes reach the decoder");
    const view = new DataView(await wav.arrayBuffer());
    assert.equal(ascii(view, 0, 4), "RIFF");
    assert.equal(view.getUint32(24, true), WAV_SAMPLE_RATE);
    assert.equal(view.getUint16(22, true), 1, "mono");
    assert.equal(view.getInt16(44, true), 16383);
    assert.equal(view.getInt16(46, true), -16384);
  } finally {
    scope.OfflineAudioContext = original;
  }
});

test("toWav labels the file with the rate the browser actually decoded at", async () => {
  const scope = globalThis as unknown as Record<string, unknown>;
  const original = scope.OfflineAudioContext;
  scope.OfflineAudioContext = class {
    async decodeAudioData() {
      return { sampleRate: 48000, getChannelData: () => new Float32Array(2) };
    }
  };

  try {
    const wav = await toWav(new Blob([new Uint8Array([0])]));
    assert.equal(new DataView(await wav.arrayBuffer()).getUint32(24, true), 48000);
  } finally {
    scope.OfflineAudioContext = original;
  }
});

test("toWav falls back to webkitOfflineAudioContext", async () => {
  const scope = globalThis as unknown as Record<string, unknown>;
  const original = scope.webkitOfflineAudioContext;
  scope.webkitOfflineAudioContext = class {
    async decodeAudioData() {
      return { sampleRate: WAV_SAMPLE_RATE, getChannelData: () => new Float32Array(2) };
    }
  };

  try {
    const wav = await toWav(new Blob([new Uint8Array([0])]));
    assert.equal(wav.type, "audio/wav");
  } finally {
    scope.webkitOfflineAudioContext = original;
  }
});

test("toWav reports a clear error when the browser has no decoder", async () => {
  const scope = globalThis as unknown as Record<string, unknown>;
  delete scope.OfflineAudioContext;
  delete scope.webkitOfflineAudioContext;
  await assert.rejects(() => toWav(new Blob([new Uint8Array([0])])), /cannot convert the recording/);
});
