import type { AudioTrack } from "../editor-store";

export type AudioSlice = {
  setAudioTrack: (sceneId: string | undefined, track: AudioTrack | null) => void;
  updateAudioTrack: (sceneId: string | undefined, partial: Partial<AudioTrack>) => void;
  removeAudioTrack: (sceneId: string | undefined) => void;
};

type SetState = <T>(partial: T | ((state: T) => T)) => void;
type GetState = () => any;

export const createAudioSlice = (set: SetState, get: GetState): AudioSlice => ({
  setAudioTrack: (sceneId, track) => {
    const targetSceneId = sceneId || get().activeSceneId;
    set((state: any) => ({
      scenes: state.scenes.map((scene: any) => {
        if (scene.id !== targetSceneId) return scene;
        return {
          ...scene,
          audioTrack: track,
        };
      }),
    }));
  },

  updateAudioTrack: (sceneId, partial) => {
    const targetSceneId = sceneId || get().activeSceneId;
    set((state: any) => ({
      scenes: state.scenes.map((scene: any) => {
        if (scene.id !== targetSceneId || !scene.audioTrack) return scene;
        return {
          ...scene,
          audioTrack: {
            ...scene.audioTrack,
            ...partial,
          },
        };
      }),
    }));
  },

  removeAudioTrack: (sceneId) => {
    const targetSceneId = sceneId || get().activeSceneId;
    set((state: any) => ({
      scenes: state.scenes.map((scene: any) => {
        if (scene.id !== targetSceneId) return scene;
        return {
          ...scene,
          audioTrack: null,
        };
      }),
    }));
  },
});
