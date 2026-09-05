import React from "react";
import {
  Layers,
  Sparkles,
  Sun,
  Eye,
  Box,
  Droplet,
  Compass,
} from "lucide-react";
import {
  EffectStackPanel,
  type EffectTypeOption,
} from "./EffectStackPanel";
import {
  useEditorStore,
  type Layer,
  type LayerEffect,
  type LayerEffectType,
  type DropShadowLayerEffect,
  type GlowLayerEffect,
  type BackdropBlurLayerEffect,
  type LayerBlurLayerEffect,
  type LiquidGlassLayerEffect,
  isLayerEffectAvailable,
} from "../../store/editor-store";
import { Slider } from "@/components/ui/slider";
import { ScrubbableLabel } from "@/hooks/useScrubbableNumber";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export interface LayerEffectsPanelProps {
  layer: Layer;
}

export function getLayerEffectTypeOptions(layer: Layer): EffectTypeOption<LayerEffectType>[] {
  const isLayerBlurAllowed = isLayerEffectAvailable(layer, "layerBlur");
  const has3DDepth = (layer.transform?.depth ?? 0) > 0;
  const hasMockup = Boolean(layer.mockup && layer.mockup !== "none");
  const layerBlurDisabledTooltip = has3DDepth
    ? "Layer Blur is unavailable on layers with 3D extrusion/depth"
    : hasMockup
    ? "Layer Blur is unavailable on layers with device-frame mockups"
    : undefined;

  return [
    {
      type: "dropShadow",
      name: "Drop Shadow",
      icon: Layers,
    },
    {
      type: "glow",
      name: "Glow",
      icon: Sun,
    },
    {
      type: "backdropBlur",
      name: "Backdrop Blur",
      icon: Box,
    },
    {
      type: "layerBlur",
      name: "Layer Blur",
      icon: Droplet,
      disabled: !isLayerBlurAllowed,
      disabledTooltip: layerBlurDisabledTooltip,
    },
    {
      type: "liquidGlass",
      name: "Liquid Glass",
      icon: Sparkles,
    },
  ];
}

export function LayerEffectsPanel({ layer }: LayerEffectsPanelProps) {
  const addLayerEffect = useEditorStore((state) => state.addLayerEffect);
  const updateLayerEffect = useEditorStore((state) => state.updateLayerEffect);
  const removeLayerEffect = useEditorStore((state) => state.removeLayerEffect);
  const toggleLayerEffectVisible = useEditorStore((state) => state.toggleLayerEffectVisible);
  const reorderLayerEffects = useEditorStore((state) => state.reorderLayerEffects);


  // Canonical add-menu order: Drop Shadow, Glow, Backdrop Blur, Layer Blur, Liquid Glass
  const LAYER_EFFECT_TYPES: EffectTypeOption<LayerEffectType>[] = getLayerEffectTypeOptions(layer);


  /** Reusable slider row with Radix Slider + ScrubbableLabel */
  const renderSliderRow = (
    label: string,
    value: number,
    min: number,
    max: number,
    step: number,
    display: (v: number) => string,
    onChange: (v: number) => void,
    testId?: string,
  ) => (
    <div className="flex flex-col gap-1" key={label}>
      <div className="flex items-center justify-between text-[9px] text-[#999ba0]">
        <ScrubbableLabel
          value={value}
          onChange={onChange}
          min={min}
          max={max}
          step={step}
          className="font-medium hover:text-[#38bdf8] transition-colors cursor-ew-resize select-none"
          title={`Drag horizontal to scrub ${label} (Shift: fast, Alt: precision)`}
        >
          {label}
        </ScrubbableLabel>
        <span className="font-mono text-[#c5c7cc] font-semibold">{display(value)}</span>
      </div>
      <Slider
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={([val]) => onChange(val)}
        className="w-full cursor-pointer py-1"
        data-testid={testId}
      />
    </div>
  );

  /** Color swatch button reusing exact classes from background-color / color-input */
  const renderColorPicker = (
    label: string,
    color: string,
    onChange: (color: string) => void,
    testId?: string,
  ) => (
    <div className="flex items-center justify-between py-1" key={label}>
      <span className="text-[9px] text-[#999ba0] font-medium">{label}</span>
      <div className="relative">
        <label
          className="color-input hover:border-[#4b7991] transition-colors cursor-pointer"
          data-testid={testId}
          title={`Choose ${label.toLowerCase()}`}
        >
          <span className="color-swatch" style={{ backgroundColor: color }} />
          <span>{color.toUpperCase()}</span>
          <Input
            type="color"
            value={color.startsWith("#") ? color : "#000000"}
            onChange={(e) => onChange(e.target.value)}
            className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
          />
        </label>
      </div>
    </div>
  );

  /** Segmented control reusing background-tabs segmented style */
  const renderSegmentedControl = <T extends string>(
    label: string,
    value: T,
    options: { label: string; value: T }[],
    onChange: (val: T) => void,
    testIdPrefix?: string,
  ) => (
    <div className="flex flex-col gap-1" key={label}>
      <span className="text-[9px] text-[#999ba0] font-medium">{label}</span>
      <div className="grid grid-cols-2 bg-[#14161b] border border-[#26282e] p-0.5 rounded h-[24px] w-full">
        {options.map((opt) => (
          <Button
            key={opt.value}
            type="button"
            variant="ghost"
            size="sm"
            className={`text-[8.5px] py-0 h-4.5 rounded font-medium border transition-all cursor-pointer flex items-center justify-center ${
              value === opt.value
                ? "bg-[#25282f] text-white border-[#383c44] shadow-xs"
                : "text-[#8d8f95] border-transparent hover:text-[#c4c6cc]"
            }`}
            onClick={() => onChange(opt.value)}
            data-testid={testIdPrefix ? `${testIdPrefix}-${opt.value}` : undefined}
          >
            {opt.label}
          </Button>
        ))}
      </div>
    </div>
  );

  /** Settings popover contents for each of the 5 layer effect types */
  const renderLayerEffectSettings = (effect: LayerEffect): React.ReactNode => {
    switch (effect.type) {
      case "dropShadow": {
        const ds = effect as DropShadowLayerEffect;
        return (
          <div className="flex flex-col gap-2.5 p-1 text-left" data-testid="settings-dropShadow">
            {/* Offset X/Y 2-column grid matching Edge Fade layout */}
            <div className="grid grid-cols-2 gap-2">
              <div className="flex flex-col gap-1">
                <div className="flex items-center justify-between text-[9px] text-[#999ba0]">
                  <ScrubbableLabel
                    value={ds.offsetX}
                    onChange={(v) => updateLayerEffect(layer.id, ds.id, { offsetX: v })}
                    min={-100}
                    max={100}
                    step={1}
                    className="font-medium hover:text-[#38bdf8] transition-colors cursor-ew-resize select-none"
                    title="Drag horizontal to scrub Offset X (Shift: fast, Alt: precision)"
                  >
                    Offset X
                  </ScrubbableLabel>
                  <span className="font-mono text-[#c5c7cc] font-semibold">{Math.round(ds.offsetX)}px</span>
                </div>
                <Slider
                  value={[ds.offsetX]}
                  min={-100}
                  max={100}
                  step={1}
                  onValueChange={([val]) => updateLayerEffect(layer.id, ds.id, { offsetX: val })}
                  className="w-full cursor-pointer py-1"
                  data-testid="slider-dropShadow-offsetX"
                />
              </div>

              <div className="flex flex-col gap-1">
                <div className="flex items-center justify-between text-[9px] text-[#999ba0]">
                  <ScrubbableLabel
                    value={ds.offsetY}
                    onChange={(v) => updateLayerEffect(layer.id, ds.id, { offsetY: v })}
                    min={-100}
                    max={100}
                    step={1}
                    className="font-medium hover:text-[#38bdf8] transition-colors cursor-ew-resize select-none"
                    title="Drag horizontal to scrub Offset Y (Shift: fast, Alt: precision)"
                  >
                    Offset Y
                  </ScrubbableLabel>
                  <span className="font-mono text-[#c5c7cc] font-semibold">{Math.round(ds.offsetY)}px</span>
                </div>
                <Slider
                  value={[ds.offsetY]}
                  min={-100}
                  max={100}
                  step={1}
                  onValueChange={([val]) => updateLayerEffect(layer.id, ds.id, { offsetY: val })}
                  className="w-full cursor-pointer py-1"
                  data-testid="slider-dropShadow-offsetY"
                />
              </div>
            </div>

            {/* Blur */}
            {renderSliderRow(
              "Blur",
              ds.blur,
              0,
              100,
              1,
              (v) => `${Math.round(v)}px`,
              (v) => updateLayerEffect(layer.id, ds.id, { blur: v }),
              "slider-dropShadow-blur",
            )}

            {/* Color Swatch Button */}
            {renderColorPicker(
              "Color",
              ds.color,
              (color) => updateLayerEffect(layer.id, ds.id, { color }),
              "button-dropShadow-color",
            )}

            {/* Opacity */}
            {renderSliderRow(
              "Opacity",
              ds.opacity,
              0,
              1,
              0.01,
              (v) => `${Math.round(v * 100)}%`,
              (v) => updateLayerEffect(layer.id, ds.id, { opacity: v }),
              "slider-dropShadow-opacity",
            )}
          </div>
        );
      }

      case "glow": {
        const gl = effect as GlowLayerEffect;
        return (
          <div className="flex flex-col gap-2.5 p-1 text-left" data-testid="settings-glow">
            {/* Color Swatch */}
            {renderColorPicker(
              "Color",
              gl.color,
              (color) => updateLayerEffect(layer.id, gl.id, { color }),
              "button-glow-color",
            )}

            {/* Blur */}
            {renderSliderRow(
              "Blur",
              gl.blur,
              0,
              100,
              1,
              (v) => `${Math.round(v)}px`,
              (v) => updateLayerEffect(layer.id, gl.id, { blur: v }),
              "slider-glow-blur",
            )}

            {/* Intensity */}
            {renderSliderRow(
              "Intensity",
              gl.intensity,
              0,
              5,
              0.05,
              (v) => `${v.toFixed(2)}x`,
              (v) => updateLayerEffect(layer.id, gl.id, { intensity: v }),
              "slider-glow-intensity",
            )}

            {/* Angle (0-360) */}
            {renderSliderRow(
              "Angle",
              gl.angle,
              0,
              360,
              1,
              (v) => `${Math.round(v)}°`,
              (v) => updateLayerEffect(layer.id, gl.id, { angle: v }),
              "slider-glow-angle",
            )}

            {/* Sheen */}
            {renderSliderRow(
              "Sheen",
              gl.sheen,
              0,
              1,
              0.01,
              (v) => `${Math.round(v * 100)}%`,
              (v) => updateLayerEffect(layer.id, gl.id, { sheen: v }),
              "slider-glow-sheen",
            )}

            {/* Mode: Edge | Fill */}
            {renderSegmentedControl(
              "Mode",
              gl.mode,
              [
                { label: "Edge", value: "edge" },
                { label: "Fill", value: "fill" },
              ],
              (mode) => updateLayerEffect(layer.id, gl.id, { mode }),
              "tab-glow-mode",
            )}

            {/* Blend: Add | Normal */}
            {renderSegmentedControl(
              "Blend",
              gl.blend,
              [
                { label: "Add", value: "add" },
                { label: "Normal", value: "normal" },
              ],
              (blend) => updateLayerEffect(layer.id, gl.id, { blend }),
              "tab-glow-blend",
            )}

            {/* Rim */}
            {renderSliderRow(
              "Rim",
              gl.rim,
              0,
              1,
              0.01,
              (v) => `${Math.round(v * 100)}%`,
              (v) => updateLayerEffect(layer.id, gl.id, { rim: v }),
              "slider-glow-rim",
            )}

            {/* Thickness */}
            {renderSliderRow(
              "Thickness",
              gl.thickness,
              0,
              1,
              0.01,
              (v) => `${Math.round(v * 100)}%`,
              (v) => updateLayerEffect(layer.id, gl.id, { thickness: v }),
              "slider-glow-thickness",
            )}
          </div>
        );
      }

      case "backdropBlur": {
        const bb = effect as BackdropBlurLayerEffect;
        return (
          <div className="flex flex-col gap-2.5 p-1 text-left" data-testid="settings-backdropBlur">
            {/* Single Blur slider */}
            {renderSliderRow(
              "Blur",
              bb.blur,
              0,
              100,
              1,
              (v) => `${Math.round(v)}px`,
              (v) => updateLayerEffect(layer.id, bb.id, { blur: v }),
              "slider-backdropBlur-blur",
            )}
          </div>
        );
      }

      case "layerBlur": {
        const lb = effect as LayerBlurLayerEffect;
        return (
          <div className="flex flex-col gap-2.5 p-1 text-left" data-testid="settings-layerBlur">
            {/* Blur */}
            {renderSliderRow(
              "Blur",
              lb.blur,
              0,
              100,
              1,
              (v) => `${Math.round(v)}px`,
              (v) => updateLayerEffect(layer.id, lb.id, { blur: v }),
              "slider-layerBlur-blur",
            )}

            {/* Mode: Uniform | Progressive */}
            {renderSegmentedControl(
              "Mode",
              lb.mode,
              [
                { label: "Uniform", value: "uniform" },
                { label: "Progressive", value: "progressive" },
              ],
              (mode) => updateLayerEffect(layer.id, lb.id, { mode }),
              "tab-layerBlur-mode",
            )}

            {/* Conditionally rendered End Blur & Angle when mode === 'progressive' */}
            {lb.mode === "progressive" && (
              <>
                {renderSliderRow(
                  "End Blur",
                  lb.endBlur,
                  0,
                  100,
                  1,
                  (v) => `${Math.round(v)}px`,
                  (v) => updateLayerEffect(layer.id, lb.id, { endBlur: v }),
                  "slider-layerBlur-endBlur",
                )}

                {renderSliderRow(
                  "Angle",
                  lb.angle,
                  0,
                  360,
                  1,
                  (v) => `${Math.round(v)}°`,
                  (v) => updateLayerEffect(layer.id, lb.id, { angle: v }),
                  "slider-layerBlur-angle",
                )}
              </>
            )}
          </div>
        );
      }

      case "liquidGlass": {
        const lg = effect as LiquidGlassLayerEffect;
        return (
          <div className="flex flex-col gap-2.5 p-1 text-left" data-testid="settings-liquidGlass">
            {/* Blur */}
            {renderSliderRow(
              "Blur",
              lg.blur,
              0,
              100,
              1,
              (v) => `${Math.round(v)}px`,
              (v) => updateLayerEffect(layer.id, lg.id, { blur: v }),
              "slider-liquidGlass-blur",
            )}

            {/* Refraction (0-1) */}
            {renderSliderRow(
              "Refraction",
              lg.refraction,
              0,
              1,
              0.01,
              (v) => `${Math.round(v * 100)}%`,
              (v) => updateLayerEffect(layer.id, lg.id, { refraction: v }),
              "slider-liquidGlass-refraction",
            )}

            {/* Dispersion (0-1) */}
            {renderSliderRow(
              "Dispersion",
              lg.dispersion,
              0,
              1,
              0.01,
              (v) => `${Math.round(v * 100)}%`,
              (v) => updateLayerEffect(layer.id, lg.id, { dispersion: v }),
              "slider-liquidGlass-dispersion",
            )}

            {/* Highlight (0-1) */}
            {renderSliderRow(
              "Highlight",
              lg.highlight,
              0,
              1,
              0.01,
              (v) => `${Math.round(v * 100)}%`,
              (v) => updateLayerEffect(layer.id, lg.id, { highlight: v }),
              "slider-liquidGlass-highlight",
            )}
          </div>
        );
      }

      default:
        return null;
    }
  };

  return (
    <div className="max-h-[360px] overflow-y-auto pr-1">
      <EffectStackPanel
        title="Layer effects"
        effects={layer.effects ?? []}
        effectsOrder={layer.effectsOrder}
        availableTypes={LAYER_EFFECT_TYPES}
        onAddEffect={(type) => addLayerEffect(layer.id, type)}
        onRemoveEffect={(id) => removeLayerEffect(layer.id, id)}
        onToggleVisible={(id) => toggleLayerEffectVisible(layer.id, id)}
        onReorder={(newOrder) => reorderLayerEffects(layer.id, newOrder)}
        renderSettings={(effect) => renderLayerEffectSettings(effect as LayerEffect)}
        emptyStateText="No layer effects — click + to add one"
        testIdPrefix="layer-effect"
      />
    </div>
  );
}
