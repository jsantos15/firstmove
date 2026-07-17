// Synthesized wooden move-click sound, shared by every board surface (Openings
// practice, Analysis). Module-level so the AudioContext/buffer are created once
// and reused across boards/remounts instead of per-component.

let moveSoundCtx: AudioContext | null = null;
let moveSoundBuffer: AudioBuffer | null = null;
let moveSoundGain: GainNode | null = null;
let moveSoundWakeSource: OscillatorNode | null = null;
let moveSoundWakeGain: GainNode | null = null;
let moveSoundWakeTimer: ReturnType<typeof setTimeout> | null = null;

function getMoveSoundCtx() {
  if (!moveSoundCtx || moveSoundCtx.state === 'closed') {
    moveSoundCtx = new AudioContext({ latencyHint: 'interactive' });
    moveSoundBuffer = null;
    moveSoundGain = moveSoundCtx.createGain();
    moveSoundGain.gain.value = 0.5;
    moveSoundGain.connect(moveSoundCtx.destination);
  }

  return moveSoundCtx;
}

function getMoveSoundBuffer(ctx: AudioContext) {
  if (moveSoundBuffer && moveSoundBuffer.sampleRate === ctx.sampleRate) {
    return moveSoundBuffer;
  }

  const sampleCount = Math.floor(ctx.sampleRate * 0.055);
  const buffer = ctx.createBuffer(1, sampleCount, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  let seed = 0x2f6e2b1;

  for (let i = 0; i < sampleCount; i += 1) {
    const t = i / ctx.sampleRate;
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const noise = (seed / 0xffffffff) * 2 - 1;
    const envelope = Math.exp(-i / (sampleCount * 0.12));
    const wood = Math.sin(2 * Math.PI * 240 * t) * 0.12;
    data[i] = (noise * 0.82 + wood) * envelope;
  }

  moveSoundBuffer = buffer;
  return buffer;
}

function startMoveSound(ctx: AudioContext) {
  const destination = moveSoundGain;
  if (!destination) return;

  const source = ctx.createBufferSource();
  const filter = ctx.createBiquadFilter();
  source.buffer = getMoveSoundBuffer(ctx);
  filter.type = 'lowpass';
  filter.frequency.value = 720;
  source.connect(filter);
  filter.connect(destination);
  source.start(ctx.currentTime + 0.001);
  source.onended = () => {
    source.disconnect();
    filter.disconnect();
  };
}

export function unlockMoveSound(enabled: boolean) {
  if (!enabled) return;

  try {
    const ctx = getMoveSoundCtx();
    getMoveSoundBuffer(ctx);
    if (ctx.state === 'suspended') {
      void ctx.resume().catch(() => {});
    }
  } catch {}
}

export function stopMoveSoundWake() {
  if (moveSoundWakeTimer) {
    clearTimeout(moveSoundWakeTimer);
    moveSoundWakeTimer = null;
  }

  if (!moveSoundWakeSource) return;

  try {
    moveSoundWakeSource.stop();
    moveSoundWakeSource.disconnect();
    moveSoundWakeGain?.disconnect();
  } catch {}

  moveSoundWakeSource = null;
  moveSoundWakeGain = null;
}

export function keepMoveSoundAwake(enabled: boolean) {
  if (!enabled) return;

  try {
    const ctx = getMoveSoundCtx();
    getMoveSoundBuffer(ctx);
    if (ctx.state === 'suspended') {
      void ctx.resume().catch(() => {});
    }

    if (!moveSoundWakeSource) {
      const source = ctx.createOscillator();
      const gain = ctx.createGain();
      source.frequency.value = 20;
      gain.gain.value = 0.00001;
      source.connect(gain);
      gain.connect(ctx.destination);
      source.start();
      moveSoundWakeSource = source;
      moveSoundWakeGain = gain;
    }

    if (moveSoundWakeTimer) clearTimeout(moveSoundWakeTimer);
    moveSoundWakeTimer = setTimeout(stopMoveSoundWake, 8000);
  } catch {}
}

export function playMoveSound(enabled: boolean) {
  if (!enabled) return;

  try {
    const ctx = getMoveSoundCtx();
    getMoveSoundBuffer(ctx);

    if (ctx.state === 'running') {
      startMoveSound(ctx);
      return;
    }

    void ctx
      .resume()
      .then(() => {
        if (ctx.state === 'running') startMoveSound(ctx);
      })
      .catch(() => {});
  } catch {}
}
