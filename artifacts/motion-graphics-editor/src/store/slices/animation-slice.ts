import type {
  AnimationBlock,
  BlockPreset,
  AnimatableProperty,
  Keyframe,
  KeyframeTrackBlock,
} from "../animation-blocks";
import { isKeyframeTrack, sampleKeyframeTrack } from "../animation-blocks";
import type { DistributiveOmit } from "../editor-store";
import { useEditorUIStore } from "../editor-store";

export type AnimationSlice = {
  addAnimationBlock: (
    sceneId: string | undefined,
    block: DistributiveOmit<AnimationBlock, "id"> & { id?: string },
  ) => string;
  updateAnimationBlock: (id: string, partial: Partial<AnimationBlock>) => void;
  removeAnimationBlock: (id: string) => void;
  addKeyframeTrack: (
    sceneId: string | undefined,
    layerId: string,
    property: AnimatableProperty,
    initialKeyframes?: Keyframe<number | string>[],
  ) => string;
  addKeyframe: (
    sceneId: string | undefined,
    blockId: string,
    keyframe: Keyframe<number | string>,
  ) => void;
  updateKeyframe: (
    sceneId: string | undefined,
    blockId: string,
    frame: number,
    partial: Partial<Keyframe<number | string>>,
  ) => void;
  removeKeyframe: (
    sceneId: string | undefined,
    blockId: string,
    frame: number,
  ) => void;
  recordKeyframe: (
    layerId: string,
    property: AnimatableProperty,
    value: number | string,
    frame?: number,
    sceneId?: string,
  ) => void;
  splitBlocksAtPlayhead: (frame?: number, sceneId?: string) => void;
  trimInPointAtPlayhead: (frame?: number, sceneId?: string) => void;
  trimOutPointAtPlayhead: (frame?: number, sceneId?: string) => void;
};

type SetState = (partial: any | ((state: any) => any)) => void;
type GetState = () => any;

export const createAnimationSlice = (set: SetState, get: GetState): AnimationSlice => ({
  addAnimationBlock: (sceneId: string | undefined, blockData: any) => {
    const targetSceneId = sceneId || get().activeSceneId;
    const targetScene =
      get().scenes.find((s: any) => s.id === targetSceneId) || get().scenes[0];
    const maxFrames = targetScene ? targetScene.durationFrames : 180;

    const newBlockId =
      blockData.id || `block-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    if (blockData.kind === "keyframe" || (blockData as any).keyframes) {
      const kfBlock = blockData as any;
      const keyframes: any[] = Array.isArray(kfBlock.keyframes)
        ? [...kfBlock.keyframes].sort((a: any, b: any) => a.frame - b.frame)
        : [];
      const startFrame =
        keyframes.length > 0 ? keyframes[0].frame : (blockData.startFrame ?? 0);
      const endFrame =
        keyframes.length > 0
          ? keyframes[keyframes.length - 1].frame
          : Math.max(startFrame + 1, blockData.endFrame ?? startFrame + 30);

      const newBlock: KeyframeTrackBlock = {
        id: newBlockId,
        kind: "keyframe",
        layerId: blockData.layerId!,
        property: kfBlock.property || "x",
        keyframes,
        startFrame,
        endFrame,
        preset: kfBlock.property || "keyframe",
        easing: blockData.easing,
        customCurve: blockData.customCurve,
      };

      set((state: any) => ({
        scenes: state.scenes.map((scene: any) =>
          scene.id === targetSceneId
            ? {
                ...scene,
                animationBlocks: [...(scene.animationBlocks || []), newBlock],
              }
            : scene,
        ),
      }));

      return newBlockId;
    }

    const startFrame = Math.max(0, Math.min(maxFrames - 1, blockData.startFrame ?? 0));
    const defaultDuration = 30;
    const endFrame = Math.max(
      startFrame + 1,
      Math.min(maxFrames, blockData.endFrame ?? startFrame + defaultDuration),
    );

    const presetBlockData = blockData as any;
    const presetVal: BlockPreset =
      typeof presetBlockData.preset === "string"
        ? (presetBlockData.preset as BlockPreset)
        : (presetBlockData.preset as any)?.id || "fade-in";

    const isCameraBlock = presetVal === "camera-move" || blockData.layerId === null;

    const cameraToVal = "cameraTo" in blockData ? (blockData as any).cameraTo : undefined;
    const newBlock: AnimationBlock = {
      id: newBlockId,
      kind: "preset",
      layerId: isCameraBlock ? null : (blockData.layerId !== undefined ? blockData.layerId : null),
      preset: presetVal,
      startFrame,
      endFrame,
      easing: blockData.easing || "ease-in-out",
      customCurve: blockData.customCurve || [0.25, 0.1, 0.25, 1.0],
      cameraTo: isCameraBlock
        ? cameraToVal || { x: 200, y: 0, z: 300, fov: 0 }
        : cameraToVal,
    };

    set((state: any) => ({
      scenes: state.scenes.map((scene: any) =>
        scene.id === targetSceneId
          ? {
              ...scene,
              animationBlocks: [...(scene.animationBlocks || []), newBlock],
            }
          : scene,
      ),
    }));

    return newBlockId;
  },

  updateAnimationBlock: (id: string, partial: Partial<AnimationBlock>) => {
    set((state: any) => ({
      scenes: state.scenes.map((scene: any) => {
        const hasBlock = (scene.animationBlocks || []).some((b: any) => b.id === id);
        if (!hasBlock) return scene;

        return {
          ...scene,
          animationBlocks: (scene.animationBlocks || []).map((b: any) => {
            if (b.id !== id) return b;
            const updated = { ...b, ...partial };

            if (isKeyframeTrack(updated as AnimationBlock)) {
              const kfTrack = updated as KeyframeTrackBlock;
              if ("keyframes" in partial && partial.keyframes) {
                const sorted = [...(partial.keyframes as Keyframe<number | string>[])].sort((k1: any, k2: any) => k1.frame - k2.frame);
                kfTrack.keyframes = sorted;
                if (sorted.length > 0) {
                  kfTrack.startFrame = sorted[0].frame;
                  kfTrack.endFrame = sorted[sorted.length - 1].frame;
                }
              }
              return kfTrack;
            }

            const maxFrames = scene.durationFrames;
            let startFrame =
              updated.startFrame !== undefined
                ? Math.max(0, Math.min(maxFrames - 1, Math.round(updated.startFrame)))
                : b.startFrame;
            let endFrame =
              updated.endFrame !== undefined
                ? Math.max(
                    startFrame + 1,
                    Math.min(maxFrames, Math.round(updated.endFrame)),
                  )
                : b.endFrame;

            if (startFrame >= endFrame) {
              if (partial.startFrame !== undefined && partial.endFrame === undefined) {
                endFrame = Math.min(maxFrames, startFrame + 1);
              } else {
                startFrame = Math.max(0, endFrame - 1);
              }
            }

            return {
              ...updated,
              startFrame,
              endFrame,
            } as AnimationBlock;
          }),
        };
      }),
    }));
  },

  removeAnimationBlock: (id: string) => {
    set((state: any) => ({
      scenes: state.scenes.map((scene: any) => ({
        ...scene,
        animationBlocks: (scene.animationBlocks || []).filter((b: any) => b.id !== id),
      })),
    }));
  },

  addKeyframeTrack: (
    sceneId: string | undefined,
    layerId: string,
    property: AnimatableProperty,
    initialKeyframes?: Keyframe<number | string>[],
  ) => {
    const targetSceneId = sceneId || get().activeSceneId;
    const scene = get().scenes.find((s: any) => s.id === targetSceneId) || get().scenes[0];
    const layer = scene?.layers.find((l: any) => l.id === layerId);

    let keyframes: Keyframe<number | string>[] = [];
    if (initialKeyframes && initialKeyframes.length > 0) {
      keyframes = [...initialKeyframes].sort((a: any, b: any) => a.frame - b.frame);
    } else if (layer) {
      let initialValue: number | string = 0;
      switch (property) {
        case "x":
          initialValue = layer.transform.x;
          break;
        case "y":
          initialValue = layer.transform.y;
          break;
        case "width":
          initialValue = layer.transform.width;
          break;
        case "height":
          initialValue = layer.transform.height;
          break;
        case "rotation":
          initialValue = layer.transform.rotation;
          break;
        case "opacity":
          initialValue = layer.opacity ?? 1;
          break;
        case "fill":
          initialValue = layer.shape?.fill ?? layer.text?.color ?? "#38bdf8";
          break;
        case "stroke":
          initialValue = layer.shape?.stroke ?? "#ffffff";
          break;
        case "fontSize":
          initialValue = layer.text?.fontSize ?? 32;
          break;
      }
      const currentF = useEditorUIStore.getState().currentFrame;
      const maxF = scene?.durationFrames ?? 180;
      const f1 = Math.min(Math.max(0, maxF - 20), currentF);
      const f2 = Math.min(maxF, f1 + 30);
      keyframes = [
        { frame: f1, value: initialValue, easing: "ease-in-out" },
        { frame: f2, value: initialValue, easing: "ease-in-out" },
      ];
    }

    const trackId = `kf-track-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const startFrame = keyframes.length > 0 ? keyframes[0].frame : 0;
    const endFrame = keyframes.length > 0 ? keyframes[keyframes.length - 1].frame : 30;

    const trackBlock: KeyframeTrackBlock = {
      id: trackId,
      kind: "keyframe",
      layerId,
      property,
      keyframes,
      startFrame,
      endFrame,
      preset: property,
    };

    set((state: any) => ({
      scenes: state.scenes.map((sc: any) =>
        sc.id === targetSceneId
          ? {
              ...sc,
              animationBlocks: [...(sc.animationBlocks || []), trackBlock],
            }
          : sc,
      ),
    }));

    return trackId;
  },

  addKeyframe: (
    sceneId: string | undefined,
    blockId: string,
    keyframe: Keyframe<number | string>,
  ) => {
    set((state: any) => ({
      scenes: state.scenes.map((scene: any) => ({
        ...scene,
        animationBlocks: (scene.animationBlocks || []).map((b: any) => {
          if (b.id !== blockId || !isKeyframeTrack(b)) return b;
          const filtered = b.keyframes.filter((k: any) => k.frame !== keyframe.frame);
          const sorted = [...filtered, keyframe].sort((k1: any, k2: any) => k1.frame - k2.frame);
          return {
            ...b,
            keyframes: sorted,
            startFrame: sorted[0]?.frame ?? b.startFrame,
            endFrame: sorted[sorted.length - 1]?.frame ?? b.endFrame,
          };
        }),
      })),
    }));
  },

  updateKeyframe: (
    sceneId: string | undefined,
    blockId: string,
    frame: number,
    partial: Partial<Keyframe<number | string>>,
  ) => {
    set((state: any) => ({
      scenes: state.scenes.map((scene: any) => ({
        ...scene,
        animationBlocks: (scene.animationBlocks || []).map((b: any) => {
          if (b.id !== blockId || !isKeyframeTrack(b)) return b;
          const keyframes = b.keyframes
            .map((k: any) => (k.frame === frame ? { ...k, ...partial } : k))
            .sort((k1: any, k2: any) => k1.frame - k2.frame);
          return {
            ...b,
            keyframes,
            startFrame: keyframes[0]?.frame ?? b.startFrame,
            endFrame: keyframes[keyframes.length - 1]?.frame ?? b.endFrame,
          };
        }),
      })),
    }));
  },

  removeKeyframe: (
    sceneId: string | undefined,
    blockId: string,
    frame: number,
  ) => {
    set((state: any) => ({
      scenes: state.scenes.map((scene: any) => ({
        ...scene,
        animationBlocks: (scene.animationBlocks || []).map((b: any) => {
          if (b.id !== blockId || !isKeyframeTrack(b)) return b;
          const keyframes = b.keyframes.filter((k: any) => k.frame !== frame);
          return {
            ...b,
            keyframes,
            startFrame: keyframes.length > 0 ? keyframes[0].frame : b.startFrame,
            endFrame:
              keyframes.length > 0
                ? keyframes[keyframes.length - 1].frame
                : b.endFrame,
          };
        }),
      })),
    }));
  },

  recordKeyframe: (
    layerId: string,
    property: AnimatableProperty,
    value: number | string,
    frame?: number,
    sceneId?: string,
  ) => {
    const targetSceneId = sceneId || get().activeSceneId;
    const targetFrame =
      frame !== undefined ? frame : useEditorUIStore.getState().currentFrame;
    const scene = get().scenes.find((s: any) => s.id === targetSceneId);
    if (!scene) return;
    const layer = scene.layers.find((l: any) => l.id === layerId);
    if (!layer) return;

    const existingBlockIdx = scene.animationBlocks.findIndex(
      (b: any) => isKeyframeTrack(b) && b.layerId === layerId && b.property === property,
    );

    if (existingBlockIdx !== -1) {
      const block = scene.animationBlocks[existingBlockIdx] as KeyframeTrackBlock;
      const existingKfIdx = block.keyframes.findIndex((k: any) => k.frame === targetFrame);
      let updatedKeyframes: Keyframe<number | string>[];

      if (existingKfIdx !== -1) {
        updatedKeyframes = block.keyframes.map((k: any, idx: any) =>
          idx === existingKfIdx ? { ...k, value } : k,
        );
      } else {
        updatedKeyframes = [
          ...block.keyframes,
          {
            frame: targetFrame,
            value,
            easing: "ease-in-out" as const,
          },
        ].sort((a: any, b: any) => a.frame - b.frame);
      }

      const startFrame = updatedKeyframes[0].frame;
      const endFrame = Math.max(startFrame + 1, updatedKeyframes[updatedKeyframes.length - 1].frame);

      const updatedBlock: KeyframeTrackBlock = {
        ...block,
        keyframes: updatedKeyframes,
        startFrame,
        endFrame,
      };

      set((state: any) => ({
        scenes: state.scenes.map((s: any) =>
          s.id === targetSceneId
            ? {
                ...s,
                animationBlocks: s.animationBlocks.map((b: any, idx: any) =>
                  idx === existingBlockIdx ? updatedBlock : b,
                ),
              }
            : s,
        ),
      }));
    } else {
      let baselineValue: number | string = 0;
      switch (property) {
        case "x":
          baselineValue = layer.transform.x;
          break;
        case "y":
          baselineValue = layer.transform.y;
          break;
        case "width":
          baselineValue = layer.transform.width;
          break;
        case "height":
          baselineValue = layer.transform.height;
          break;
        case "rotation":
          baselineValue = layer.transform.rotation || 0;
          break;
        case "depth":
          baselineValue = layer.transform.depth || 0;
          break;
        case "rotateX":
          baselineValue = layer.transform.rotateX || 0;
          break;
        case "rotateY":
          baselineValue = layer.transform.rotateY || 0;
          break;
        case "opacity":
          baselineValue = layer.opacity ?? 1;
          break;
        case "fill":
          baselineValue = layer.shape?.fill ?? layer.text?.color ?? "#38bdf8";
          break;
        case "stroke":
          baselineValue = layer.shape?.stroke ?? "#ffffff";
          break;
        case "fontSize":
          baselineValue = layer.text?.fontSize ?? 32;
          break;
      }

      let initialKeyframes: Keyframe<number | string>[];
      let startFrame = 0;
      let endFrame = 1;

      if (targetFrame > 0) {
        startFrame = Math.max(0, targetFrame - 30);
        endFrame = targetFrame;
        initialKeyframes = [
          { frame: startFrame, value: baselineValue, easing: "ease-in-out" },
          { frame: targetFrame, value, easing: "ease-in-out" },
        ];
      } else {
        initialKeyframes = [{ frame: 0, value, easing: "ease-in-out" }];
        endFrame = 1;
      }

      const newBlock: KeyframeTrackBlock = {
        id: `kf-track-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        kind: "keyframe",
        layerId,
        property,
        keyframes: initialKeyframes,
        startFrame,
        endFrame,
        preset: property,
      };

      set((state: any) => ({
        scenes: state.scenes.map((s: any) =>
          s.id === targetSceneId
            ? {
                ...s,
                animationBlocks: [...s.animationBlocks, newBlock],
              }
            : s,
        ),
      }));
    }
  },

  splitBlocksAtPlayhead: (frame?: number, sceneId?: string) => {
    const state = get();
    const scId = sceneId || state.activeSceneId;
    const scene = state.scenes.find((s: any) => s.id === scId);
    if (!scene) return;
    const targetFrame = frame ?? useEditorUIStore.getState().currentFrame;
    const selLayerIds = state.selectedLayerIds;
    const isCamera = useEditorUIStore.getState().isCameraSelected;

    const candidateBlocks = (scene.animationBlocks || []).filter((b: any) => {
      if (selLayerIds.length > 0) {
        return b.layerId && selLayerIds.includes(b.layerId);
      }
      if (isCamera) {
        return b.layerId === null;
      }
      return true;
    });

    const blocksToSplit = candidateBlocks.filter(
      (b: any) => b.startFrame < targetFrame && b.endFrame > targetFrame,
    );
    if (blocksToSplit.length === 0) return;

    const updatedBlocks = (scene.animationBlocks || []).flatMap((b: any) => {
      if (!blocksToSplit.some((splitB: any) => splitB.id === b.id)) {
        return [b];
      }

      if (isKeyframeTrack(b)) {
        const kfTrack = b as KeyframeTrackBlock;
        const sampledVal =
          sampleKeyframeTrack(kfTrack, targetFrame) ?? (kfTrack.keyframes[0]?.value ?? 0);
        const leftKeyframes = kfTrack.keyframes.filter((k: any) => k.frame < targetFrame);
        const rightKeyframes = kfTrack.keyframes.filter((k: any) => k.frame > targetFrame);

        const splitKf: Keyframe<number | string> = {
          frame: targetFrame,
          value: sampledVal,
          easing: "ease-in-out",
        };

        const leftBlock: KeyframeTrackBlock = {
          ...kfTrack,
          id: kfTrack.id,
          startFrame: kfTrack.startFrame,
          endFrame: targetFrame,
          keyframes: [...leftKeyframes, splitKf].sort((a: any, b: any) => a.frame - b.frame),
        };

        const rightBlock: KeyframeTrackBlock = {
          ...kfTrack,
          id: `block-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          startFrame: targetFrame,
          endFrame: kfTrack.endFrame,
          keyframes: [splitKf, ...rightKeyframes].sort((a: any, b: any) => a.frame - b.frame),
        };

        return [leftBlock, rightBlock];
      } else {
        const leftBlock: AnimationBlock = {
          ...b,
          endFrame: targetFrame,
        };
        const rightBlock: AnimationBlock = {
          ...b,
          id: `block-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          startFrame: targetFrame,
        };
        return [leftBlock, rightBlock];
      }
    });

    set((s: any) => ({
      scenes: s.scenes.map((sc: any) =>
        sc.id === scId ? { ...sc, animationBlocks: updatedBlocks } : sc,
      ),
    }));
  },

  trimInPointAtPlayhead: (frame?: number, sceneId?: string) => {
    const state = get();
    const scId = sceneId || state.activeSceneId;
    const scene = state.scenes.find((s: any) => s.id === scId);
    if (!scene) return;
    const targetFrame = frame ?? useEditorUIStore.getState().currentFrame;
    const selLayerIds = state.selectedLayerIds;
    const isCamera = useEditorUIStore.getState().isCameraSelected;

    const updatedBlocks = (scene.animationBlocks || []).map((b: any) => {
      const isTarget =
        selLayerIds.length > 0
          ? b.layerId && selLayerIds.includes(b.layerId)
          : isCamera
          ? b.layerId === null
          : true;

      if (!isTarget) return b;
      if (b.startFrame < targetFrame && targetFrame < b.endFrame) {
        if (isKeyframeTrack(b)) {
          const kfTrack = b as KeyframeTrackBlock;
          const sampledVal =
            sampleKeyframeTrack(kfTrack, targetFrame) ?? (kfTrack.keyframes[0]?.value ?? 0);
          const remainingKfs = kfTrack.keyframes.filter((k: any) => k.frame >= targetFrame);
          const hasExact = remainingKfs.some((k: any) => k.frame === targetFrame);
          const finalKfs = hasExact
            ? remainingKfs
            : [{ frame: targetFrame, value: sampledVal, easing: "ease-in-out" as const }, ...remainingKfs];
          return {
            ...kfTrack,
            startFrame: targetFrame,
            keyframes: finalKfs.sort((a: any, b: any) => a.frame - b.frame),
          };
        } else {
          return {
            ...b,
            startFrame: targetFrame,
          };
        }
      }
      return b;
    });

    set((s: any) => ({
      scenes: s.scenes.map((sc: any) =>
        sc.id === scId ? { ...sc, animationBlocks: updatedBlocks } : sc,
      ),
    }));
  },

  trimOutPointAtPlayhead: (frame?: number, sceneId?: string) => {
    const state = get();
    const scId = sceneId || state.activeSceneId;
    const scene = state.scenes.find((s: any) => s.id === scId);
    if (!scene) return;
    const targetFrame = frame ?? useEditorUIStore.getState().currentFrame;
    const selLayerIds = state.selectedLayerIds;
    const isCamera = useEditorUIStore.getState().isCameraSelected;

    const updatedBlocks = (scene.animationBlocks || []).map((b: any) => {
      const isTarget =
        selLayerIds.length > 0
          ? b.layerId && selLayerIds.includes(b.layerId)
          : isCamera
          ? b.layerId === null
          : true;

      if (!isTarget) return b;
      if (b.startFrame < targetFrame && targetFrame < b.endFrame) {
        if (isKeyframeTrack(b)) {
          const kfTrack = b as KeyframeTrackBlock;
          const sampledVal =
            sampleKeyframeTrack(kfTrack, targetFrame) ?? (kfTrack.keyframes[0]?.value ?? 0);
          const remainingKfs = kfTrack.keyframes.filter((k: any) => k.frame <= targetFrame);
          const hasExact = remainingKfs.some((k: any) => k.frame === targetFrame);
          const finalKfs = hasExact
            ? remainingKfs
            : [...remainingKfs, { frame: targetFrame, value: sampledVal, easing: "ease-in-out" as const }];
          return {
            ...kfTrack,
            endFrame: targetFrame,
            keyframes: finalKfs.sort((a: any, b: any) => a.frame - b.frame),
          };
        } else {
          return {
            ...b,
            endFrame: targetFrame,
          };
        }
      }
      return b;
    });

    set((s: any) => ({
      scenes: s.scenes.map((sc: any) =>
        sc.id === scId ? { ...sc, animationBlocks: updatedBlocks } : sc,
      ),
    }));
  },
});
