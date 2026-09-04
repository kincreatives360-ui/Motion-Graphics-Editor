import { type AudioTrack } from "../store/editor-store";

let audioContext: AudioContext | null = null;

function getAudioContext(): AudioContext {
  if (!audioContext) {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    audioContext = new AudioCtx();
  }
  if (audioContext.state === "suspended") {
    audioContext.resume().catch(() => {});
  }
  return audioContext;
}

/**
 * Decodes an uploaded audio file into waveform peak data and duration.
 */
export async function decodeAudioFile(
  file: File,
  targetPeaksCount = 200,
): Promise<{ url: string; duration: number; waveformData: number[] }> {
  const arrayBuffer = await file.arrayBuffer();
  const ctx = getAudioContext();
  const audioBuffer = await ctx.decodeAudioData(arrayBuffer);

  const duration = audioBuffer.duration;
  const rawData = audioBuffer.getChannelData(0); // Left channel or mono
  const totalSamples = rawData.length;
  const blockSize = Math.floor(totalSamples / targetPeaksCount);
  const waveformData: number[] = [];

  let maxPeak = 0;
  for (let i = 0; i < targetPeaksCount; i++) {
    const start = i * blockSize;
    let sum = 0;
    for (let j = 0; j < blockSize; j++) {
      const sample = Math.abs(rawData[start + j] || 0);
      sum += sample * sample;
    }
    const rms = Math.sqrt(sum / blockSize);
    if (rms > maxPeak) maxPeak = rms;
    waveformData.push(rms);
  }

  // Normalize between 0.05 and 1.0 for aesthetic display
  const normFactor = maxPeak > 0 ? 1 / maxPeak : 1;
  const normalizedPeaks = waveformData.map((val) =>
    Math.min(1, Math.max(0.06, val * normFactor)),
  );

  const url = URL.createObjectURL(file);

  return {
    url,
    duration,
    waveformData: normalizedPeaks,
  };
}

// Global active audio playback element for timeline synchronization
let activeAudioElement: HTMLAudioElement | null = null;
let currentTrackUrl: string | null = null;

export function getOrCreateAudioElement(track: AudioTrack): HTMLAudioElement {
  if (!activeAudioElement || currentTrackUrl !== track.url) {
    if (activeAudioElement) {
      activeAudioElement.pause();
      activeAudioElement.src = "";
    }
    activeAudioElement = new Audio(track.url);
    activeAudioElement.preload = "auto";
    currentTrackUrl = track.url;
  }
  activeAudioElement.volume = track.muted ? 0 : Math.max(0, Math.min(1, track.volume ?? 1));
  return activeAudioElement;
}

export function syncAudioPlayback(
  track: AudioTrack | null | undefined,
  isPlaying: boolean,
  currentFrame: number,
  fps = 30,
) {
  if (!track || !track.url) {
    if (activeAudioElement) {
      activeAudioElement.pause();
    }
    return;
  }

  const audio = getOrCreateAudioElement(track);
  audio.volume = track.muted ? 0 : Math.max(0, Math.min(1, track.volume ?? 1));

  const startFrame = track.offsetFrames || 0;
  const targetSeconds = (currentFrame - startFrame) / fps;

  if (targetSeconds < 0 || targetSeconds > track.duration) {
    if (!audio.paused) {
      audio.pause();
    }
    return;
  }

  // Drift correction: if out of sync by > 0.15s, re-seek
  if (Math.abs(audio.currentTime - targetSeconds) > 0.15) {
    try {
      audio.currentTime = Math.max(0, targetSeconds);
    } catch {
      // ignore
    }
  }

  if (isPlaying) {
    if (audio.paused) {
      audio.play().catch(() => {
        // user interaction guard
      });
    }
  } else {
    if (!audio.paused) {
      audio.pause();
    }
  }
}

export function stopAudioPlayback() {
  if (activeAudioElement && !activeAudioElement.paused) {
    activeAudioElement.pause();
  }
}
