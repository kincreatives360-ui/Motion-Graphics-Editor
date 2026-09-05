import type { Camera } from "../editor-store";

export type CameraSlice = {
  updateCamera: (partial: Partial<Camera>, sceneId?: string) => void;
  resetCamera: (sceneId?: string) => void;
};

type SetState = <T>(partial: T | ((state: T) => T)) => void;
type GetState = () => any;

export const createCameraSlice = (set: SetState, get: GetState): CameraSlice => ({
  updateCamera: (partial, sceneId) => {
    const targetSceneId = sceneId || get().activeSceneId;
    set((state: any) => ({
      scenes: state.scenes.map((scene: any) =>
        scene.id === targetSceneId
          ? {
              ...scene,
              camera: {
                ...(scene.camera || {
                  x: 0,
                  y: 0,
                  z: 0,
                  pitch: 0,
                  yaw: 0,
                  roll: 0,
                  fov: 60,
                  focalLengthMm: 50,
                  apertureFStop: 2.8,
                  focusDistance: 1000,
                }),
                ...partial,
              },
            }
          : scene,
      ),
    }));
  },

  resetCamera: (sceneId) => {
    const targetSceneId = sceneId || get().activeSceneId;
    set((state: any) => ({
      scenes: state.scenes.map((scene: any) =>
        scene.id === targetSceneId
          ? {
              ...scene,
              camera: {
                x: 0,
                y: 0,
                z: 0,
                pitch: 0,
                yaw: 0,
                roll: 0,
                fov: 60,
                focalLengthMm: 50,
                apertureFStop: 2.8,
                aperture: 2.8,
                focusDistance: 1000,
                target: { x: 960, y: 540, z: 0 },
              },
            }
          : scene,
      ),
    }));
  },
});
