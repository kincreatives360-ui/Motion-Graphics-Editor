import type { AudioEffectsSettings, AudioEffectKey } from "../store/editor-store";

let audioCtx: AudioContext | null = null;

export function getAudioContext(): AudioContext {
  if (!audioCtx) {
    const AudioContextClass =
      window.AudioContext || (window as any).webkitAudioContext;
    audioCtx = new AudioContextClass();
  }
  if (audioCtx.state === "suspended") {
    audioCtx.resume();
  }
  return audioCtx;
}

// Generate distortion transfer curves for tape, tube, console, fuzz
function makeDistortionCurve(style: "tape" | "tube" | "console" | "fuzz", drive = 0.3): Float32Array {
  const n_samples = 44100;
  const curve = new Float32Array(n_samples);
  const k = Math.max(0.1, drive * 50);

  for (let i = 0; i < n_samples; ++i) {
    const x = (i * 2) / n_samples - 1;
    if (style === "fuzz") {
      curve[i] = Math.sign(x) * (1 - Math.exp(-Math.abs(x * k)));
    } else if (style === "tube") {
      curve[i] = x < 0 ? Math.tanh(x * k) : Math.sin(x * (Math.PI / 2));
    } else if (style === "console") {
      curve[i] = ((3 + k) * x * 20 * (Math.PI / 180)) / (Math.PI + k * Math.abs(x));
    } else {
      // Tape saturation
      curve[i] = (2 / Math.PI) * Math.atan(x * k * 1.5);
    }
  }
  return curve;
}

// Generate synthetic impulse response buffer for room, hall, plate, cavern reverb
function createReverbImpulse(
  ctx: AudioContext,
  preset: "room" | "hall" | "plate" | "cavern" = "hall",
): AudioBuffer {
  const presetConfig = {
    room: { duration: 0.9, decay: 4.5 },
    hall: { duration: 2.6, decay: 3.2 },
    plate: { duration: 1.8, decay: 2.6 },
    cavern: { duration: 6.0, decay: 2.4 },
  }[preset] || { duration: 2.6, decay: 3.2 };

  const rate = ctx.sampleRate;
  const length = rate * presetConfig.duration;
  const impulse = ctx.createBuffer(2, length, rate);
  const left = impulse.getChannelData(0);
  const right = impulse.getChannelData(1);

  for (let i = 0; i < length; i++) {
    const decay = Math.exp(-i / (rate * (presetConfig.decay / 5)));
    left[i] = (Math.random() * 2 - 1) * decay;
    right[i] = (Math.random() * 2 - 1) * decay;
  }
  return impulse;
}

// Convert sync division to delay time in seconds (assuming 120 bpm default)
export function calculateSyncDelayTime(
  sync: "quarter" | "dottedEighth" | "eighth" | "tripletEighth" | "sixteenth",
  bpm = 120,
): number {
  const quarterSec = 60 / bpm;
  const mult = {
    quarter: 1.0,
    dottedEighth: 0.75,
    eighth: 0.5,
    tripletEighth: 1 / 3,
    sixteenth: 0.25,
  }[sync] || 0.5;
  return quarterSec * mult;
}

export interface AudioPipelineNodeGraph {
  source: MediaElementAudioSourceNode;
  analyser: AnalyserNode;
  output: GainNode;
  cleanup: () => void;
}

/**
 * Builds and connects Web Audio API processing nodes according to audioEffects settings:
 * EQ -> Filter -> Compressor -> Distortion -> Delay -> Reverb
 */
export function applyAudioEffectsPipeline(
  audioElement: HTMLAudioElement,
  effects?: AudioEffectsSettings,
): AudioPipelineNodeGraph | null {
  if (typeof window === "undefined" || !audioElement) return null;
  const ctx = getAudioContext();

  try {
    const source = ctx.createMediaElementSource(audioElement);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;

    let currentOutput: AudioNode = source;
    const activeNodes: AudioNode[] = [];

    const order: AudioEffectKey[] = effects?.effectsOrder || [
      "eq",
      "filter",
      "compressor",
      "distortion",
      "delay",
      "reverb",
    ];

    for (const key of order) {
      if (key === "eq" && effects?.eq?.enabled && effects.eq.bands) {
        for (const band of effects.eq.bands) {
          const eqNode = ctx.createBiquadFilter();
          eqNode.type = band.type as BiquadFilterType;
          eqNode.frequency.setValueAtTime(band.freqHz, ctx.currentTime);
          eqNode.gain.setValueAtTime(band.gainDb, ctx.currentTime);
          eqNode.Q.setValueAtTime(band.q, ctx.currentTime);

          currentOutput.connect(eqNode);
          currentOutput = eqNode;
          activeNodes.push(eqNode);
        }
      }

      if (key === "filter" && effects?.filter?.enabled) {
        if (effects.filter.highpassHz && effects.filter.highpassHz > 20) {
          const hp = ctx.createBiquadFilter();
          hp.type = "highpass";
          hp.frequency.setValueAtTime(effects.filter.highpassHz, ctx.currentTime);
          currentOutput.connect(hp);
          currentOutput = hp;
          activeNodes.push(hp);
        }
        if (effects.filter.lowpassHz && effects.filter.lowpassHz < 20000) {
          const lp = ctx.createBiquadFilter();
          lp.type = "lowpass";
          lp.frequency.setValueAtTime(effects.filter.lowpassHz, ctx.currentTime);
          currentOutput.connect(lp);
          currentOutput = lp;
          activeNodes.push(lp);
        }
      }

      if (key === "compressor" && effects?.compressor?.enabled) {
        const comp = ctx.createDynamicsCompressor();
        comp.threshold.setValueAtTime(effects.compressor.thresholdDb ?? -18, ctx.currentTime);
        comp.ratio.setValueAtTime(effects.compressor.ratio ?? 4, ctx.currentTime);
        comp.attack.setValueAtTime((effects.compressor.attackMs ?? 10) / 1000, ctx.currentTime);
        comp.release.setValueAtTime((effects.compressor.releaseMs ?? 100) / 1000, ctx.currentTime);

        currentOutput.connect(comp);
        currentOutput = comp;
        activeNodes.push(comp);
      }

      if (key === "distortion" && effects?.distortion?.enabled) {
        const shaper = ctx.createWaveShaper();
        shaper.curve = makeDistortionCurve(
          effects.distortion.style || "tube",
          effects.distortion.drive ?? 0.3,
        ) as any;
        shaper.oversample = "4x";

        currentOutput.connect(shaper);
        currentOutput = shaper;
        activeNodes.push(shaper);
      }

      if (key === "delay" && effects?.delay?.enabled) {
        const delayTimeSec = effects.delay.sync
          ? calculateSyncDelayTime(effects.delay.sync)
          : (effects.delay.timeMs ?? 250) / 1000;

        const delay = ctx.createDelay(2.0);
        delay.delayTime.setValueAtTime(delayTimeSec, ctx.currentTime);

        const feedback = ctx.createGain();
        feedback.gain.setValueAtTime(effects.delay.feedback ?? 0.3, ctx.currentTime);

        delay.connect(feedback);
        feedback.connect(delay);

        currentOutput.connect(delay);
        currentOutput = delay;
        activeNodes.push(delay, feedback);
      }

      if (key === "reverb" && effects?.reverb?.enabled) {
        const convolver = ctx.createConvolver();
        convolver.buffer = createReverbImpulse(ctx, effects.reverb.preset || "hall");

        const dry = ctx.createGain();
        const wet = ctx.createGain();
        const mix = effects.reverb.mix ?? 0.3;

        dry.gain.setValueAtTime(1 - mix, ctx.currentTime);
        wet.gain.setValueAtTime(mix, ctx.currentTime);

        currentOutput.connect(dry);
        currentOutput.connect(convolver);
        convolver.connect(wet);

        const merger = ctx.createGain();
        dry.connect(merger);
        wet.connect(merger);

        currentOutput = merger;
        activeNodes.push(convolver, dry, wet, merger);
      }
    }

    const output = ctx.createGain();
    currentOutput.connect(analyser);
    analyser.connect(output);
    output.connect(ctx.destination);

    return {
      source,
      analyser,
      output,
      cleanup: () => {
        try {
          source.disconnect();
          activeNodes.forEach((node) => node.disconnect());
          analyser.disconnect();
          output.disconnect();
        } catch {
          // Ignore cleanup disconnect errors
        }
      },
    };
  } catch (err) {
    console.warn("Audio processing pipeline initialization skipped:", err);
    return null;
  }
}
