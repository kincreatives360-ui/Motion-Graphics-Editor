import { useRef, useCallback, useState } from "react";
import type { RefObject } from "react";
import {
  useEditorStore,
  useEditorUIStore,
  type Layer,
  type Transform,
  type ToolId,
} from "../store/editor-store";
import { sampleCamera, type CameraTransform } from "../store/animation-blocks";
import { getScreenTransform } from "../canvas/render-frame";
import {
  getSnapCandidates,
  snapTransform,
  type SnapLine,
  type SnapCandidates,
} from "./snapping";

export type ResizeHandle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";

interface DragOperation {
  type: "move" | "resize" | "rotate" | "pan" | "tilt" | "camera" | "create";
  creationTool?: ToolId;
  startWorldX?: number;
  startWorldY?: number;
  currentWorldX?: number;
  currentWorldY?: number;
  cameraDragMode?: "orbit" | "pan" | "dolly";
  startClientX: number;
  startClientY: number;
  layerId?: string;
  initialTransform?: Transform;
  initialTransforms?: Map<string, Transform>;
  initialPan?: { x: number; y: number };
  initialCamera?: {
    x: number;
    y: number;
    z: number;
    pitch?: number;
    yaw?: number;
    roll?: number;
    fov: number;
    focusDistance: number;
  };
  resizeHandle?: ResizeHandle;
  startAngle?: number;
  groupCenter?: { x: number; y: number };
  screenCenter?: { x: number; y: number };
  candidates?: SnapCandidates;
  otherLayers?: Layer[];
  projectedScale?: number;
  pendingSingleSelectId?: string;
  hasMoved?: boolean;
}

export interface CreateDragPreview {
  tool: ToolId;
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
}

function canvasToWorld(
  canvasX: number,
  canvasY: number,
  camera: { x?: number; y?: number; z?: number; fov?: number },
  canvasWidth: number,
  canvasHeight: number,
  depth = 0,
) {
  const { focalLength } = require("../store/animation-blocks") as typeof import("../store/animation-blocks");
  const f = focalLength(camera.fov ?? 60, canvasHeight);
  const relDepth = depth - (camera.z || 0);
  const distance = Math.max(f * 0.05, f + relDepth);
  const scale = f / distance;
  const cx = canvasWidth / 2;
  const cy = canvasHeight / 2;
  const worldX = (canvasX - cx) / scale + cx + (camera.x || 0);
  const worldY = (canvasY - cy) / scale + cy + (camera.y || 0);
  return { worldX, worldY, scale };
}

function hitTestLayer(layer: Layer, canvasX: number, canvasY: number): boolean {
  if (!layer.visible || layer.locked) return false;
  if (layer.type === "group") return false;
  const { x, y, width, height, rotation } = layer.transform;
  const centerX = x + width / 2;
  const centerY = y + height / 2;
  const rad = (-rotation * Math.PI) / 180;
  const dx = canvasX - centerX;
  const dy = canvasY - centerY;
  const unrotX = dx * Math.cos(rad) - dy * Math.sin(rad);
  const unrotY = dx * Math.sin(rad) + dy * Math.cos(rad);
  const margin = 4;
  return (
    unrotX >= -width / 2 - margin &&
    unrotX <= width / 2 + margin &&
    unrotY >= -height / 2 - margin &&
    unrotY <= height / 2 + margin
  );
}

function generateArrowPath(w: number, h: number): string {
  const shaftT = Math.max(2, Math.min(10, h * 0.28));
  const headLen = Math.min(w * 0.4, Math.max(12, h));
  const headW = Math.max(10, h);
  const cy = h / 2;
  const shaftEnd = Math.max(0, w - headLen);

  return `M 0 ${cy - shaftT / 2} L ${shaftEnd} ${cy - shaftT / 2} L ${shaftEnd} ${cy - headW / 2} L ${w} ${cy} L ${shaftEnd} ${cy + headW / 2} L ${shaftEnd} ${cy + shaftT / 2} L 0 ${cy + shaftT / 2} Z`;
}

export interface UseCanvasPointerHandlersArgs {
  containerRef: RefObject<HTMLDivElement | null>;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  dragOpRef?: React.MutableRefObject<DragOperation | null>;
  spaceDidPanRef: React.MutableRefObject<boolean>;
  isSpacePressed: boolean;
  setIsSpacePressed: (v: boolean) => void;
  scaleFactor: number;
  nativeWidth: number;
  nativeHeight: number;
  aspect: number;
  currentZoom: number;
  activeScene: any;
  editingTextLayerId: string | null;
  setEditingTextLayerId: (id: string | null) => void;
  editingTextValue: string;
  setEditingTextValue: (val: string) => void;
}

export function useCanvasPointerHandlers({
  containerRef,
  canvasRef,
  dragOpRef,
  spaceDidPanRef,
  isSpacePressed,
  setIsSpacePressed,
  scaleFactor,
  nativeWidth,
  nativeHeight,
  aspect,
  currentZoom,
  activeScene,
  editingTextLayerId,
  setEditingTextLayerId,
  editingTextValue,
  setEditingTextValue,
}: UseCanvasPointerHandlersArgs) {
  const [activeGuides, setActiveGuides] = useState<SnapLine[]>([]);
  const [createDragPreview, setCreateDragPreview] =
    useState<CreateDragPreview | null>(null);

  const zoom = useEditorUIStore((s) => s.zoom);
  const setZoom = useEditorUIStore((s) => s.setZoom);
  const pan = useEditorUIStore((s) => s.pan);
  const setPan = useEditorUIStore((s) => s.setPan);
  const activeTool = useEditorUIStore((s) => s.activeTool);
  const setActiveTool = useEditorUIStore((s) => s.setActiveTool);
  const isCameraSelected = useEditorUIStore((s) => s.isCameraSelected);
  const playing = useEditorUIStore((s) => s.playing);
  const currentFrame = useEditorUIStore((s) => s.currentFrame);
  const setCurrentFrame = useEditorUIStore((s) => s.setCurrentFrame);
  const animateMode = useEditorUIStore((s) => s.animateMode);
  const selectedLayerIds = useEditorStore((s) => s.selectedLayerIds);
  const selectLayers = useEditorStore((s) => s.selectLayers);
  const addLayer = useEditorStore((s) => s.addLayer);
  const updateLayer = useEditorStore((s) => s.updateLayer);
  const recordKeyframe = useEditorStore((s) => s.recordKeyframe);
  const updateCamera = useEditorStore((s) => s.updateCamera);

  const getCanvasCoords = useCallback(
    (clientX: number, clientY: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return { x: 0, y: 0 };
      const rect = canvas.getBoundingClientRect();
      return {
        x: (clientX - rect.left) / scaleFactor,
        y: (clientY - rect.top) / scaleFactor,
      };
    },
    [canvasRef, scaleFactor],
  );

  const commitTextEdit = useCallback(() => {
    if (editingTextLayerId) {
      const scene = activeScene;
      if (!scene) return;
      const layer = scene.layers.find((l: any) => l.id === editingTextLayerId);
      if (layer && layer.text) {
        updateLayer(editingTextLayerId, {
          text: {
            ...layer.text,
            content: editingTextValue,
          },
        });
      }
      setEditingTextLayerId(null);
    }
  }, [
    editingTextLayerId,
    editingTextValue,
    activeScene,
    updateLayer,
    setEditingTextLayerId,
  ]);

  const startResize = useCallback(
    (
      e: React.PointerEvent<HTMLDivElement>,
      handle: ResizeHandle,
      layer: Layer,
    ) => {
      e.stopPropagation();
      e.preventDefault();

      const scene = activeScene;
      if (!scene) return;

      const otherLayers = scene.layers.filter((l: any) => l.id !== layer.id);
      const candidates = getSnapCandidates(
        layer,
        otherLayers,
        nativeWidth,
        nativeHeight,
      );

      const initialTransforms = new Map<string, Transform>();
      const childIds = new Set<string>();
      let expanded = true;
      while (expanded) {
        expanded = false;
        for (const l of scene.layers) {
          if (
            l.parentId &&
            (l.parentId === layer.id || childIds.has(l.parentId)) &&
            !childIds.has(l.id)
          ) {
            childIds.add(l.id);
            expanded = true;
          }
        }
      }
      for (const l of scene.layers) {
        if (childIds.has(l.id)) {
          initialTransforms.set(l.id, { ...l.transform });
        }
      }

      const currentCamera = sampleCamera(
        scene?.camera || {
          x: 0,
          y: 0,
          z: 0,
          fov: 60,
          focusDistance: 1000,
        },
        scene?.animationBlocks || [],
        currentFrame,
      );
      const screen = getScreenTransform(
        layer,
        scene?.animationBlocks || [],
        currentFrame,
        currentCamera,
        { width: nativeWidth, height: nativeHeight },
        scene?.layers || [],
      );

      dragOpRef.current = {
        type: "resize",
        startClientX: e.clientX,
        startClientY: e.clientY,
        layerId: layer.id,
        initialTransform: { ...layer.transform },
        initialTransforms,
        resizeHandle: handle,
        candidates,
        otherLayers,
        projectedScale: screen.scale,
      };

      if (containerRef.current) {
        containerRef.current.setPointerCapture(e.pointerId);
      }
    },
    [
      activeScene,
      currentFrame,
      nativeWidth,
      nativeHeight,
      containerRef,
      dragOpRef,
    ],
  );

  const startRotate = useCallback(
    (e: React.PointerEvent<HTMLDivElement>, layer: Layer) => {
      e.stopPropagation();
      e.preventDefault();

      const scene = activeScene;
      if (!scene) return;

      const currentCamera = sampleCamera(
        scene?.camera || {
          x: 0,
          y: 0,
          z: 0,
          fov: 60,
          focusDistance: 1000,
        },
        scene?.animationBlocks || [],
        currentFrame,
      );
      const screen = getScreenTransform(
        layer,
        scene?.animationBlocks || [],
        currentFrame,
        currentCamera,
        { width: nativeWidth, height: nativeHeight },
        scene?.layers || [],
      );

      const screenCenterX = screen.x + screen.width / 2;
      const screenCenterY = screen.y + screen.height / 2;
      const worldCenterX = layer.transform.x + layer.transform.width / 2;
      const worldCenterY = layer.transform.y + layer.transform.height / 2;

      const { x: pointerCanvasX, y: pointerCanvasY } = getCanvasCoords(
        e.clientX,
        e.clientY,
      );

      const startAngle =
        (Math.atan2(
          pointerCanvasY - screenCenterY,
          pointerCanvasX - screenCenterX,
        ) *
          180) /
        Math.PI;

      const initialTransforms = new Map<string, Transform>();
      const childIds = new Set<string>();
      let expanded = true;
      while (expanded) {
        expanded = false;
        for (const l of scene.layers) {
          if (
            l.parentId &&
            (l.parentId === layer.id || childIds.has(l.parentId)) &&
            !childIds.has(l.id)
          ) {
            childIds.add(l.id);
            expanded = true;
          }
        }
      }
      for (const l of scene.layers) {
        if (childIds.has(l.id)) {
          initialTransforms.set(l.id, { ...l.transform });
        }
      }

      dragOpRef.current = {
        type: "rotate",
        startClientX: e.clientX,
        startClientY: e.clientY,
        layerId: layer.id,
        initialTransform: { ...layer.transform },
        initialTransforms,
        startAngle,
        groupCenter: { x: worldCenterX, y: worldCenterY },
        screenCenter: { x: screenCenterX, y: screenCenterY },
      };

      if (containerRef.current) {
        containerRef.current.setPointerCapture(e.pointerId);
      }
    },
    [
      activeScene,
      currentFrame,
      nativeWidth,
      nativeHeight,
      getCanvasCoords,
      containerRef,
      dragOpRef,
    ],
  );

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (editingTextLayerId) {
        commitTextEdit();
      }

      if (activeTool === "hand" || e.button === 1 || isSpacePressed) {
        if (isSpacePressed) {
          spaceDidPanRef.current = true;
        }
        dragOpRef.current = {
          type: "pan",
          startClientX: e.clientX,
          startClientY: e.clientY,
          initialPan: { ...pan },
        };
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        return;
      }

      if (activeTool === "camera") {
        const mode =
          e.shiftKey || e.button === 2
            ? "pan"
            : e.altKey
              ? "dolly"
              : "orbit";
        dragOpRef.current = {
          type: "camera",
          cameraDragMode: mode,
          startClientX: e.clientX,
          startClientY: e.clientY,
          initialCamera: {
            x: activeScene.camera?.x ?? 0,
            y: activeScene.camera?.y ?? 0,
            z: activeScene.camera?.z ?? 0,
            pitch: activeScene.camera?.pitch ?? 0,
            yaw: activeScene.camera?.yaw ?? 0,
            roll: activeScene.camera?.roll ?? 0,
            fov: activeScene.camera?.fov ?? 60,
            focusDistance: activeScene.camera?.focusDistance ?? 1000,
          },
        };
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        return;
      }

      if (activeTool === "tilt") {
        dragOpRef.current = {
          type: "tilt",
          startClientX: e.clientX,
          startClientY: e.clientY,
          initialCamera: {
            x: activeScene.camera?.x ?? 0,
            y: activeScene.camera?.y ?? 0,
            z: activeScene.camera?.z ?? 0,
            pitch: activeScene.camera?.pitch ?? 0,
            yaw: activeScene.camera?.yaw ?? 0,
            roll: activeScene.camera?.roll ?? 0,
            fov: activeScene.camera?.fov ?? 60,
            focusDistance: activeScene.camera?.focusDistance ?? 1000,
          },
        };
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        return;
      }

      const { x: canvasX, y: canvasY } = getCanvasCoords(e.clientX, e.clientY);
      const layers = activeScene.layers || [];
      const animationBlocks = activeScene.animationBlocks || [];
      const currentCamera = sampleCamera(
        activeScene.camera,
        animationBlocks,
        currentFrame,
      );

      const isCreationTool =
        activeTool === "rectangle" ||
        activeTool === "ellipse" ||
        activeTool === "line" ||
        activeTool === "arrow" ||
        activeTool === "shape" ||
        activeTool === "text";

      if (isCreationTool) {
        const { worldX, worldY } = canvasToWorld(
          canvasX,
          canvasY,
          currentCamera,
          nativeWidth,
          nativeHeight,
          0,
        );
        dragOpRef.current = {
          type: "create",
          creationTool: activeTool,
          startClientX: e.clientX,
          startClientY: e.clientY,
          startWorldX: worldX,
          startWorldY: worldY,
          currentWorldX: worldX,
          currentWorldY: worldY,
        };
        if (containerRef.current) {
          containerRef.current.setPointerCapture(e.pointerId);
        }
        return;
      }

      if (
        activeTool === "scene" ||
        activeTool === "move" ||
        activeTool === "scissors"
      ) {
        let hitLayer: Layer | null = null;
        for (let i = layers.length - 1; i >= 0; i--) {
          const layer = layers[i];
          const { effectiveLayer } = getScreenTransform(
            layer,
            animationBlocks,
            currentFrame,
            currentCamera,
            { width: nativeWidth, height: nativeHeight },
            layers,
          );
          if (hitTestLayer(effectiveLayer, canvasX, canvasY)) {
            hitLayer = layer;
            break;
          }
        }

        if (hitLayer) {
          let targetLayer = hitLayer;
          if (!e.metaKey && !e.ctrlKey) {
            let curr = hitLayer;
            while (curr.parentId) {
              const parent = layers.find((l: any) => l.id === curr.parentId);
              if (parent && parent.type === "group") {
                if (selectedLayerIds.includes(parent.id)) {
                  break;
                }
                targetLayer = parent;
                curr = parent;
              } else {
                break;
              }
            }
          }

          let newSelection = selectedLayerIds;
          let pendingSingleSelectId: string | undefined = undefined;

          if (e.metaKey || e.ctrlKey) {
            if (selectedLayerIds.includes(targetLayer.id)) {
              newSelection = selectedLayerIds.filter(
                (id) => id !== targetLayer.id,
              );
            } else {
              newSelection = [...selectedLayerIds, targetLayer.id];
            }
            selectLayers(newSelection);
          } else if (e.shiftKey) {
            if (!selectedLayerIds.includes(targetLayer.id)) {
              newSelection = [...selectedLayerIds, targetLayer.id];
              selectLayers(newSelection);
            }
          } else {
            if (
              selectedLayerIds.includes(targetLayer.id) &&
              selectedLayerIds.length > 1
            ) {
              pendingSingleSelectId = targetLayer.id;
            } else if (!selectedLayerIds.includes(targetLayer.id)) {
              newSelection = [targetLayer.id];
              selectLayers(newSelection);
            }
          }

          const initialTransforms = new Map<string, Transform>();
          const allSelectedAndChildren = new Set(newSelection);
          let expanded = true;
          while (expanded) {
            expanded = false;
            for (const l of layers) {
              if (
                l.parentId &&
                allSelectedAndChildren.has(l.parentId) &&
                !allSelectedAndChildren.has(l.id)
              ) {
                allSelectedAndChildren.add(l.id);
                expanded = true;
              }
            }
          }
          for (const layer of layers) {
            if (allSelectedAndChildren.has(layer.id)) {
              initialTransforms.set(layer.id, { ...layer.transform });
            }
          }

          const otherLayers = activeScene.layers.filter(
            (l: any) => !newSelection.includes(l.id),
          );
          const candidates = getSnapCandidates(
            targetLayer,
            otherLayers,
            nativeWidth,
            nativeHeight,
          );

          const screen = getScreenTransform(
            targetLayer,
            animationBlocks,
            currentFrame,
            currentCamera,
            { width: nativeWidth, height: nativeHeight },
            layers,
          );

          dragOpRef.current = {
            type: "move",
            startClientX: e.clientX,
            startClientY: e.clientY,
            layerId: targetLayer.id,
            initialTransform: { ...targetLayer.transform },
            initialTransforms,
            candidates,
            otherLayers,
            projectedScale: screen.scale,
            pendingSingleSelectId,
            hasMoved: false,
          };

          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        } else {
          selectLayers([]);
        }
      }
    },
    [
      editingTextLayerId,
      commitTextEdit,
      activeTool,
      isSpacePressed,
      spaceDidPanRef,
      pan,
      activeScene,
      getCanvasCoords,
      nativeWidth,
      nativeHeight,
      containerRef,
      dragOpRef,
      currentFrame,
      selectedLayerIds,
      selectLayers,
    ],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const op = dragOpRef.current;
      if (!op) return;

      if (
        op.type === "create" &&
        op.startWorldX !== undefined &&
        op.startWorldY !== undefined
      ) {
        const { x: curCanvasX, y: curCanvasY } = getCanvasCoords(
          e.clientX,
          e.clientY,
        );
        const animationBlocks = activeScene.animationBlocks || [];
        const currentCamera = sampleCamera(
          activeScene.camera,
          animationBlocks,
          currentFrame,
        );
        const { worldX, worldY } = canvasToWorld(
          curCanvasX,
          curCanvasY,
          currentCamera,
          nativeWidth,
          nativeHeight,
          0,
        );
        op.currentWorldX = worldX;
        op.currentWorldY = worldY;
        op.hasMoved = true;
        setCreateDragPreview({
          tool: op.creationTool || "rectangle",
          startX: op.startWorldX,
          startY: op.startWorldY,
          currentX: worldX,
          currentY: worldY,
        });
        return;
      }

      if (op.type === "pan" && op.initialPan) {
        const dx = e.clientX - op.startClientX;
        const dy = e.clientY - op.startClientY;
        setPan({
          x: Math.round(op.initialPan.x + dx),
          y: Math.round(op.initialPan.y + dy),
        });
        return;
      }

      if (op.type === "camera" && op.initialCamera) {
        const dx = e.clientX - op.startClientX;
        const dy = e.clientY - op.startClientY;

        if (op.cameraDragMode === "pan") {
          const panSensitivity = 1.0;
          updateCamera(
            {
              x: Math.round(op.initialCamera.x - dx * panSensitivity),
              y: Math.round(op.initialCamera.y - dy * panSensitivity),
            },
            activeScene.id,
          );
        } else if (op.cameraDragMode === "dolly") {
          const dollySensitivity = 2.5;
          updateCamera(
            {
              z: Math.round(op.initialCamera.z - dy * dollySensitivity),
            },
            activeScene.id,
          );
        } else {
          const orbitSensitivity = 0.35;
          const newYaw = (op.initialCamera.yaw ?? 0) + dx * orbitSensitivity;
          const newPitch = Math.max(
            -85,
            Math.min(
              85,
              (op.initialCamera.pitch ?? 0) - dy * orbitSensitivity,
            ),
          );
          updateCamera(
            {
              yaw: Math.round(newYaw * 10) / 10,
              pitch: Math.round(newPitch * 10) / 10,
            },
            activeScene.id,
          );
        }
        return;
      }

      if (op.type === "tilt" && op.initialCamera) {
        const dx = e.clientX - op.startClientX;
        const dy = e.clientY - op.startClientY;
        const orbitSensitivity = 0.35;
        const newYaw = (op.initialCamera.yaw ?? 0) + dx * orbitSensitivity;
        const newPitch = Math.max(
          -85,
          Math.min(
            85,
            (op.initialCamera.pitch ?? 0) - dy * orbitSensitivity,
          ),
        );
        updateCamera(
          {
            yaw: Math.round(newYaw * 10) / 10,
            pitch: Math.round(newPitch * 10) / 10,
          },
          activeScene.id,
        );
        return;
      }

      if (op.type === "move" && op.layerId && op.initialTransform) {
        const dist = Math.hypot(
          e.clientX - op.startClientX,
          e.clientY - op.startClientY,
        );
        if (dist > 3) {
          op.hasMoved = true;
        }

        const moveScale =
          op.projectedScale && op.projectedScale > 0 ? op.projectedScale : 1.0;
        const deltaCanvasX = (e.clientX - op.startClientX) / scaleFactor;
        const deltaCanvasY = (e.clientY - op.startClientY) / scaleFactor;
        const deltaWorldX = deltaCanvasX / moveScale;
        const deltaWorldY = deltaCanvasY / moveScale;

        const tentative: Transform = {
          ...op.initialTransform,
          x: Math.round(op.initialTransform.x + deltaWorldX),
          y: Math.round(op.initialTransform.y + deltaWorldY),
        };

        const snapThreshold = Math.max(4, 6 / (currentZoom / 100));
        const snapped = snapTransform(
          tentative,
          op.candidates || { x: [], y: [] },
          op.otherLayers || [],
          snapThreshold,
        );

        setActiveGuides(snapped.guides);

        const finalDx = snapped.x - op.initialTransform.x;
        const finalDy = snapped.y - op.initialTransform.y;

        if (op.initialTransforms && op.initialTransforms.size > 1) {
          op.initialTransforms.forEach((initT, lId) => {
            updateLayer(lId, {
              transform: {
                ...initT,
                x: Math.round(initT.x + finalDx),
                y: Math.round(initT.y + finalDy),
              },
            });
          });
        } else {
          updateLayer(op.layerId, {
            transform: {
              ...op.initialTransform,
              x: Math.round(snapped.x),
              y: Math.round(snapped.y),
            },
          });
        }
        return;
      }

      if (
        op.type === "rotate" &&
        op.layerId &&
        op.initialTransform &&
        op.groupCenter &&
        typeof op.startAngle === "number"
      ) {
        const { x: pointerCanvasX, y: pointerCanvasY } = getCanvasCoords(
          e.clientX,
          e.clientY,
        );
        const center = op.screenCenter || op.groupCenter;
        const currentAngle =
          (Math.atan2(
            pointerCanvasY - center.y,
            pointerCanvasX - center.x,
          ) *
            180) /
          Math.PI;
        let deltaAngle = currentAngle - op.startAngle;

        let newRotation = op.initialTransform.rotation + deltaAngle;
        if (e.shiftKey) {
          newRotation = Math.round(newRotation / 15) * 15;
          deltaAngle = newRotation - op.initialTransform.rotation;
        }

        updateLayer(op.layerId, {
          transform: {
            ...op.initialTransform,
            rotation: Math.round(newRotation),
          },
        });

        if (op.initialTransforms && op.initialTransforms.size > 0) {
          const rad = (deltaAngle * Math.PI) / 180;
          const cosRad = Math.cos(rad);
          const sinRad = Math.sin(rad);

          op.initialTransforms.forEach((childInit, childId) => {
            const childCX = childInit.x + childInit.width / 2;
            const childCY = childInit.y + childInit.height / 2;
            const relX = childCX - op.groupCenter!.x;
            const relY = childCY - op.groupCenter!.y;

            const rotRelX = relX * cosRad - relY * sinRad;
            const rotRelY = relX * sinRad + relY * cosRad;

            const newChildCX = op.groupCenter!.x + rotRelX;
            const newChildCY = op.groupCenter!.y + rotRelY;

            updateLayer(childId, {
              transform: {
                ...childInit,
                x: Math.round(newChildCX - childInit.width / 2),
                y: Math.round(newChildCY - childInit.height / 2),
                rotation: Math.round(
                  (childInit.rotation + deltaAngle) % 360,
                ),
              },
            });
          });
        }
        return;
      }

      if (
        op.type === "resize" &&
        op.layerId &&
        op.initialTransform &&
        op.resizeHandle
      ) {
        const handle = op.resizeHandle;
        const init = op.initialTransform;
        const moveScale =
          op.projectedScale && op.projectedScale > 0 ? op.projectedScale : 1.0;
        const deltaScreenX =
          (e.clientX - op.startClientX) / (scaleFactor * moveScale);
        const deltaScreenY =
          (e.clientY - op.startClientY) / (scaleFactor * moveScale);

        const rad = (-init.rotation * Math.PI) / 180;
        const localDx =
          deltaScreenX * Math.cos(rad) - deltaScreenY * Math.sin(rad);
        const localDy =
          deltaScreenX * Math.sin(rad) + deltaScreenY * Math.cos(rad);

        let newWidth = init.width;
        let newHeight = init.height;
        let localOffsetX = 0;
        let localOffsetY = 0;

        if (handle.includes("e")) newWidth = init.width + localDx;
        if (handle.includes("w")) {
          newWidth = init.width - localDx;
          localOffsetX = localDx;
        }
        if (handle.includes("s")) newHeight = init.height + localDy;
        if (handle.includes("n")) {
          newHeight = init.height - localDy;
          localOffsetY = localDy;
        }

        if (e.shiftKey && init.height > 0) {
          const aspectRatio = init.width / init.height;
          if (Math.abs(localDx) > Math.abs(localDy)) {
            newHeight = newWidth / aspectRatio;
          } else {
            newWidth = newHeight * aspectRatio;
          }
        }

        const minSize = 12;
        if (newWidth < minSize) {
          newWidth = minSize;
          if (handle.includes("w")) localOffsetX = init.width - minSize;
        }
        if (newHeight < minSize) {
          newHeight = minSize;
          if (handle.includes("n")) localOffsetY = init.height - minSize;
        }

        const unrad = (init.rotation * Math.PI) / 180;
        const canvasOffsetX =
          localOffsetX * Math.cos(unrad) - localOffsetY * Math.sin(unrad);
        const canvasOffsetY =
          localOffsetX * Math.sin(unrad) + localOffsetY * Math.cos(unrad);

        const nextGroupTransform = {
          ...init,
          x: Math.round(init.x + canvasOffsetX),
          y: Math.round(init.y + canvasOffsetY),
          width: Math.round(newWidth),
          height: Math.round(newHeight),
        };

        updateLayer(op.layerId, {
          transform: nextGroupTransform,
        });

        if (op.initialTransforms && op.initialTransforms.size > 0) {
          const initW = Math.max(1, init.width);
          const initH = Math.max(1, init.height);
          op.initialTransforms.forEach((childInit, childId) => {
            const uX = (childInit.x - init.x) / initW;
            const uY = (childInit.y - init.y) / initH;
            const uW = childInit.width / initW;
            const uH = childInit.height / initH;

            const newChildX = Math.round(
              nextGroupTransform.x + uX * nextGroupTransform.width,
            );
            const newChildY = Math.round(
              nextGroupTransform.y + uY * nextGroupTransform.height,
            );
            const newChildW = Math.max(
              1,
              Math.round(uW * nextGroupTransform.width),
            );
            const newChildH = Math.max(
              1,
              Math.round(uH * nextGroupTransform.height),
            );

            updateLayer(childId, {
              transform: {
                ...childInit,
                x: newChildX,
                y: newChildY,
                width: newChildW,
                height: newChildH,
              },
            });
          });
        }
      }
    },
    [
      dragOpRef,
      activeScene,
      getCanvasCoords,
      nativeWidth,
      nativeHeight,
      scaleFactor,
      currentZoom,
      setPan,
      updateCamera,
      updateLayer,
      setActiveGuides,
      setCreateDragPreview,
      currentFrame,
    ],
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (dragOpRef.current) {
        const op = dragOpRef.current;

        if (
          op.type === "create" &&
          op.startWorldX !== undefined &&
          op.startWorldY !== undefined
        ) {
          setCreateDragPreview(null);
          const startX = op.startWorldX;
          const startY = op.startWorldY;
          const endX = op.currentWorldX ?? startX;
          const endY = op.currentWorldY ?? startY;

          const dx = Math.abs(endX - startX);
          const dy = Math.abs(endY - startY);
          const isDrag = dx > 5 || dy > 5;

          const tool = op.creationTool || "rectangle";
          let layerX = 0;
          let layerY = 0;
          let layerW = 0;
          let layerH = 0;

          if (isDrag) {
            layerX = Math.round(Math.min(startX, endX));
            layerY = Math.round(Math.min(startY, endY));
            layerW = Math.round(Math.max(10, dx));
            if (tool === "line") {
              layerH = Math.round(Math.max(2, dy < 5 ? 4 : dy));
            } else if (tool === "arrow") {
              layerH = Math.round(Math.max(8, dy < 5 ? 24 : dy));
            } else if (tool === "text") {
              layerH = Math.round(Math.max(24, dy));
            } else {
              layerH = Math.round(Math.max(10, dy));
            }
          } else {
            if (tool === "text") {
              layerW = 260;
              layerH = 52;
              layerX = Math.round(startX);
              layerY = Math.round(startY - 24);
            } else if (tool === "line") {
              layerW = 200;
              layerH = 4;
              layerX = Math.round(startX - 100);
              layerY = Math.round(startY - 2);
            } else if (tool === "arrow") {
              layerW = 200;
              layerH = 24;
              layerX = Math.round(startX - 100);
              layerY = Math.round(startY - 12);
            } else {
              layerW = 200;
              layerH = 200;
              layerX = Math.round(startX - 100);
              layerY = Math.round(startY - 100);
            }
          }

          let layerPayload: Partial<Layer>;
          const layerCount = (activeScene.layers.length || 0) + 1;

          if (tool === "text") {
            layerPayload = {
              type: "text",
              name: `Text ${layerCount}`,
              transform: {
                x: layerX,
                y: layerY,
                width: layerW,
                height: layerH,
                rotation: 0,
                depth: 0,
              },
              text: {
                content: "Heading Text",
                fontSize: 32,
                fontFamily: "Inter",
                color: "#ffffff",
                align: "left",
              },
            };
          } else if (tool === "ellipse") {
            layerPayload = {
              type: "shape",
              name: `Ellipse ${layerCount}`,
              transform: {
                x: layerX,
                y: layerY,
                width: layerW,
                height: layerH,
                rotation: 0,
                depth: 0,
              },
              shape: {
                kind: "ellipse",
                fill: "#38bdf8",
                stroke: "#0284c7",
                strokeWidth: 2,
              },
            };
          } else if (tool === "line") {
            layerPayload = {
              type: "shape",
              name: `Line ${layerCount}`,
              transform: {
                x: layerX,
                y: layerY,
                width: layerW,
                height: layerH,
                rotation: 0,
                depth: 0,
              },
              shape: {
                kind: "rect",
                fill: "#38bdf8",
                stroke: "transparent",
                strokeWidth: 0,
              },
            };
          } else if (tool === "arrow") {
            layerPayload = {
              type: "shape",
              name: `Arrow ${layerCount}`,
              transform: {
                x: layerX,
                y: layerY,
                width: layerW,
                height: layerH,
                rotation: 0,
                depth: 0,
              },
              shape: {
                kind: "path",
                path: generateArrowPath(layerW, layerH),
                fill: "#38bdf8",
                stroke: "#0284c7",
                strokeWidth: 2,
              },
            };
          } else {
            layerPayload = {
              type: "shape",
              name: `Rectangle ${layerCount}`,
              transform: {
                x: layerX,
                y: layerY,
                width: layerW,
                height: layerH,
                rotation: 0,
                depth: 0,
              },
              shape: {
                kind: "rect",
                fill: "#38bdf8",
                stroke: "#0284c7",
                strokeWidth: 2,
                radius: 0,
              },
            };
          }

          const newId = addLayer(activeScene.id, layerPayload);
          selectLayers([newId]);
          if (tool === "text" && !isDrag) {
            setEditingTextLayerId(newId);
            setEditingTextValue("Heading Text");
          }
          setActiveTool("scene");
          dragOpRef.current = null;
          try {
            if (containerRef.current) {
              containerRef.current.releasePointerCapture(e.pointerId);
            }
          } catch {
            // Capture release safety
          }
          return;
        }

        if (animateMode && op.hasMoved) {
          if (op.type === "move") {
            if (op.initialTransforms && op.initialTransforms.size > 0) {
              op.initialTransforms.forEach((_, lId) => {
                const currentL = activeScene.layers.find(
                  (l: any) => l.id === lId,
                );
                if (currentL) {
                  recordKeyframe(
                    lId,
                    "x",
                    currentL.transform.x,
                    currentFrame,
                    activeScene.id,
                  );
                  recordKeyframe(
                    lId,
                    "y",
                    currentL.transform.y,
                    currentFrame,
                    activeScene.id,
                  );
                }
              });
            } else if (op.layerId) {
              const currentL = activeScene.layers.find(
                (l: any) => l.id === op.layerId,
              );
              if (currentL) {
                recordKeyframe(
                  op.layerId,
                  "x",
                  currentL.transform.x,
                  currentFrame,
                  activeScene.id,
                );
                recordKeyframe(
                  op.layerId,
                  "y",
                  currentL.transform.y,
                  currentFrame,
                  activeScene.id,
                );
              }
            }
          } else if (op.type === "rotate" && op.layerId) {
            const currentL = activeScene.layers.find(
              (l: any) => l.id === op.layerId,
            );
            if (currentL) {
              recordKeyframe(
                op.layerId,
                "rotation",
                currentL.transform.rotation,
                currentFrame,
                activeScene.id,
              );
            }
          } else if (op.type === "resize" && op.layerId) {
            const currentL = activeScene.layers.find(
              (l: any) => l.id === op.layerId,
            );
            if (currentL) {
              recordKeyframe(
                op.layerId,
                "x",
                currentL.transform.x,
                currentFrame,
                activeScene.id,
              );
              recordKeyframe(
                op.layerId,
                "y",
                currentL.transform.y,
                currentFrame,
                activeScene.id,
              );
              recordKeyframe(
                op.layerId,
                "width",
                currentL.transform.width,
                currentFrame,
                activeScene.id,
              );
              recordKeyframe(
                op.layerId,
                "height",
                currentL.transform.height,
                currentFrame,
                activeScene.id,
              );
            }
          }
        }

        if (!op.hasMoved && op.pendingSingleSelectId) {
          selectLayers([op.pendingSingleSelectId]);
        }
        dragOpRef.current = null;
        setActiveGuides([]);
        try {
          if (containerRef.current) {
            containerRef.current.releasePointerCapture(e.pointerId);
          }
        } catch {
          // Capture release safety
        }
      }
    },
    [
      dragOpRef,
      activeScene,
      currentFrame,
      animateMode,
      recordKeyframe,
      addLayer,
      selectLayers,
      setActiveTool,
      setEditingTextLayerId,
      setEditingTextValue,
      setActiveGuides,
      setCreateDragPreview,
      containerRef,
    ],
  );

  return {
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    activeGuides,
    createDragPreview,
    startResize,
    startRotate,
    dragOpRef,
  };
}
