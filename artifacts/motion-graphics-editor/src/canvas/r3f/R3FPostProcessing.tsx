import React from "react";
import {
  EffectComposer,
  Bloom,
  Vignette,
  ChromaticAberration,
  Noise,
} from "@react-three/postprocessing";
import * as THREE from "three";
import type { BloomSettings, OpticsSettings, SceneEffect, BloomEffect, VignetteEffect, FilmGrainEffect, ChromaticAberrationEffect } from "../../store/editor-store";

export interface R3FPostProcessingProps {
  bloom?: BloomSettings;
  optics?: OpticsSettings;
  effects?: SceneEffect[];
}

export function R3FPostProcessing({ bloom: legacyBloom, optics: legacyOptics, effects }: R3FPostProcessingProps) {
  // Resolve effects from effects array or fallback to legacy props
  const bloomFx = effects?.find((e): e is BloomEffect => e.type === "bloom" && e.enabled && e.visible);
  const vignetteFx = effects?.find((e): e is VignetteEffect => e.type === "vignette" && e.enabled && e.visible);
  const grainFx = effects?.find((e): e is FilmGrainEffect => e.type === "filmGrain" && e.enabled && e.visible);
  const chromaFx = effects?.find((e): e is ChromaticAberrationEffect => e.type === "chromaticAberration" && e.enabled && e.visible);

  const bloom = bloomFx ? {
    enabled: true,
    intensity: bloomFx.intensity,
    threshold: bloomFx.threshold * 255,
    blurPx: 16,
  } : legacyBloom;

  const optics = (vignetteFx || grainFx || chromaFx) ? {
    vignette: vignetteFx?.intensity ?? 0,
    filmGrain: grainFx?.intensity ?? 0,
    chromaticAberration: chromaFx ? chromaFx.offset / 20 : 0,
  } : legacyOptics;

  const hasBloom = Boolean(bloom?.enabled && (bloom.intensity ?? 0) > 0);
  const hasVignette = Boolean((optics?.vignette ?? 0) > 0.01);
  const hasChroma = Boolean((optics?.chromaticAberration ?? 0) > 0.01);
  const hasGrain = Boolean((optics?.filmGrain ?? 0) > 0.01);

  if (!hasBloom && !hasVignette && !hasChroma && !hasGrain) {
    return null;
  }

  const chromaOffset = new THREE.Vector2(
    (optics?.chromaticAberration ?? 0) * 0.006,
    (optics?.chromaticAberration ?? 0) * 0.006,
  );

  return (
    <EffectComposer>
      {hasBloom && (
        <Bloom
          intensity={(bloom?.intensity ?? 0.6) * 1.5}
          luminanceThreshold={(bloom?.threshold ?? 180) / 255}
          luminanceSmoothing={0.2}
          mipmapBlur
        />
      )}

      {hasVignette && (
        <Vignette
          eskil={false}
          offset={0.1}
          darkness={(optics?.vignette ?? 0.4) * 1.4}
        />
      )}

      {hasChroma && (
        <ChromaticAberration
          offset={chromaOffset}
          radialModulation={false}
          modulationOffset={0}
        />
      )}

      {hasGrain && (
        <Noise
          opacity={(optics?.filmGrain ?? 0.2) * 0.5}
        />
      )}
    </EffectComposer>
  );
}

