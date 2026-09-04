import { describe, it, expect } from "vitest";
import * as THREE from "three";
import {
  createDropShadowShaderMaterial,
  createGlowShaderMaterial,
  createLayerBlurShaderMaterial,
  createBackdropBlurShaderMaterial,
  createLiquidGlassShaderMaterial,
  type LayerGeometryInfo,
} from "./R3FLayerEffectsMaterials";
import type {
  DropShadowLayerEffect,
  GlowLayerEffect,
  LayerBlurLayerEffect,
  BackdropBlurLayerEffect,
  LiquidGlassLayerEffect,
} from "../../store/editor-store";

describe("R3F Layer Effects Shader Materials", () => {
  const baseGeo: LayerGeometryInfo = {
    width: 200,
    height: 100,
    radius: 8,
    isEllipse: false,
    layerOpacity: 1.0,
  };

  describe("Drop Shadow Material", () => {
    it("configures uniforms, mesh expansion padding, and shader properties correctly", () => {
      const effect: DropShadowLayerEffect = {
        id: "lfx-ds-1",
        type: "dropShadow",
        enabled: true,
        visible: true,
        offsetX: 6,
        offsetY: 8,
        blur: 14,
        color: "#112233",
        opacity: 0.75,
      };

      const { material, pad, meshW, meshH } = createDropShadowShaderMaterial(baseGeo, effect);

      expect(pad).toBe(14 * 3.5);
      expect(meshW).toBe(200 + pad * 2);
      expect(meshH).toBe(100 + pad * 2);

      expect(material.transparent).toBe(true);
      expect(material.depthWrite).toBe(false);

      const uniforms = material.uniforms;
      expect(uniforms.uDimensions.value).toEqual(new THREE.Vector2(200, 100));
      expect(uniforms.uMeshDimensions.value).toEqual(new THREE.Vector2(meshW, meshH));
      expect(uniforms.uRadius.value).toBe(8);
      expect(uniforms.uIsEllipse.value).toBe(0.0);
      expect(uniforms.uBlur.value).toBe(14);
      expect(uniforms.uOpacity.value).toBe(0.75);
      expect(uniforms.uLayerOpacity.value).toBe(1.0);

      // Verify fragment shader includes SDF and erf/gaussian falloff
      expect(material.fragmentShader).toContain("sdRoundedBox");
      expect(material.fragmentShader).toContain("exp(-0.5 * (d * d) / (sigma * sigma))");
    });
  });

  describe("Glow Material", () => {
    it("configures edge and additive blend uniforms properly", () => {
      const effect: GlowLayerEffect = {
        id: "lfx-glow-1",
        type: "glow",
        enabled: true,
        visible: true,
        color: "#6e6ef5",
        blur: 16,
        intensity: 1.5,
        angle: 45,
        sheen: 0.6,
        mode: "edge",
        blend: "add",
        rim: 0.4,
        thickness: 0.5,
      };

      const { material, pad, meshW, meshH } = createGlowShaderMaterial(baseGeo, effect);

      expect(pad).toBe(16 * 3.5 + 0.5 * 30);
      expect(meshW).toBe(200 + pad * 2);
      expect(meshH).toBe(100 + pad * 2);

      expect(material.blending).toBe(THREE.AdditiveBlending);
      expect(material.transparent).toBe(true);

      const uniforms = material.uniforms;
      expect(uniforms.uBlur.value).toBe(16);
      expect(uniforms.uIntensity.value).toBe(1.5);
      expect(uniforms.uAngle.value).toBeCloseTo((45 * Math.PI) / 180);
      expect(uniforms.uSheen.value).toBe(0.6);
      expect(uniforms.uMode.value).toBe(0.0); // 0.0 for "edge"
      expect(uniforms.uBlendMode.value).toBe(1.0); // 1.0 for "add"
      expect(uniforms.uRim.value).toBe(0.4);
      expect(uniforms.uThickness.value).toBe(0.5);

      expect(material.fragmentShader).toContain("uRim");
      expect(material.fragmentShader).toContain("uSheen");
    });

    it("configures normal blend mode correctly", () => {
      const effect: GlowLayerEffect = {
        id: "lfx-glow-normal",
        type: "glow",
        enabled: true,
        visible: true,
        color: "#ff0088",
        blur: 10,
        intensity: 1,
        angle: 0,
        sheen: 0,
        mode: "fill",
        blend: "normal",
        rim: 0,
        thickness: 0.3,
      };

      const { material } = createGlowShaderMaterial(baseGeo, effect);
      expect(material.blending).toBe(THREE.NormalBlending);
      expect(material.uniforms.uMode.value).toBe(1.0); // 1.0 for "fill"
    });
  });

  describe("Layer Blur Material (Analytical erf-based box blur)", () => {
    it("configures progressive mode and erf-based analytical shader uniforms", () => {
      const effect: LayerBlurLayerEffect = {
        id: "lfx-lb-1",
        type: "layerBlur",
        enabled: true,
        visible: true,
        blur: 4,
        mode: "progressive",
        endBlur: 20,
        angle: 270,
      };

      const { material, pad, meshW, meshH } = createLayerBlurShaderMaterial(
        baseGeo,
        effect,
        "#38bdf8",
        "#0284c7",
        2,
      );

      expect(pad).toBe(20 * 3.5);
      expect(meshW).toBe(200 + pad * 2);
      expect(meshH).toBe(100 + pad * 2);

      const uniforms = material.uniforms;
      expect(uniforms.uBlur.value).toBe(4);
      expect(uniforms.uMode.value).toBe(1.0); // progressive
      expect(uniforms.uEndBlur.value).toBe(20);
      expect(uniforms.uAngle.value).toBeCloseTo((270 * Math.PI) / 180);
      expect(uniforms.uStrokeWidth.value).toBe(2);

      // Verify the fragment shader includes the Abramowitz & Stegun erf formula and 1D analytical convolution
      expect(material.fragmentShader).toContain("float erfApprox(float x)");
      expect(material.fragmentShader).toContain("float blurredBox1D(float x, float halfExtent, float sigma)");
      expect(material.fragmentShader).toContain("mix(uBlur, uEndBlur, t)");
    });

    it("configures uniform mode correctly", () => {
      const effect: LayerBlurLayerEffect = {
        id: "lfx-lb-2",
        type: "layerBlur",
        enabled: true,
        visible: true,
        blur: 8,
        mode: "uniform",
        endBlur: 16,
        angle: 270,
      };

      const { material } = createLayerBlurShaderMaterial(
        baseGeo,
        effect,
        "#ffffff",
        "transparent",
        0,
      );

      expect(material.uniforms.uBlur.value).toBe(8);
      expect(material.uniforms.uMode.value).toBe(0.0); // uniform
    });
  });

  describe("Backdrop Blur Material", () => {
    it("creates frosted glass backdrop shader with noise and blur uniforms", () => {
      const effect: BackdropBlurLayerEffect = {
        id: "lfx-bb-1",
        type: "backdropBlur",
        enabled: true,
        visible: true,
        blur: 12,
      };

      const { material } = createBackdropBlurShaderMaterial(baseGeo, effect);
      expect(material.transparent).toBe(true);
      expect(material.depthWrite).toBe(false);

      expect(material.uniforms.uBlur.value).toBe(12);
      expect(material.fragmentShader).toContain("hash(vec2 p)");
      expect(material.fragmentShader).toContain("baseFrostedAlpha");
    });
  });

  describe("Liquid Glass Material", () => {
    it("configures refraction, chromatic dispersion, specular highlights, and fresnel", () => {
      const effect: LiquidGlassLayerEffect = {
        id: "lfx-lg-1",
        type: "liquidGlass",
        enabled: true,
        visible: true,
        blur: 8,
        refraction: 0.45,
        dispersion: 0.25,
        highlight: 0.6,
      };

      const { material } = createLiquidGlassShaderMaterial(baseGeo, effect);
      expect(material.transparent).toBe(true);
      expect(material.depthWrite).toBe(false);

      const uniforms = material.uniforms;
      expect(uniforms.uRefraction.value).toBe(0.45);
      expect(uniforms.uDispersion.value).toBe(0.25);
      expect(uniforms.uHighlight.value).toBe(0.6);

      // Verify normal gradient estimation, specular, and fresnel in GLSL
      expect(material.fragmentShader).toContain("evalShapeDistance");
      expect(material.fragmentShader).toContain("grad");
      expect(material.fragmentShader).toContain("fresnel");
      expect(material.fragmentShader).toContain("dispersionColor");
    });
  });
});

