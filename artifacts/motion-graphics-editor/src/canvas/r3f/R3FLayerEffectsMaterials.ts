import * as THREE from "three";
import type {
  DropShadowLayerEffect,
  GlowLayerEffect,
  LayerBlurLayerEffect,
  BackdropBlurLayerEffect,
  LiquidGlassLayerEffect,
} from "../../store/editor-store";

export interface LayerGeometryInfo {
  width: number;
  height: number;
  radius: number;
  isEllipse: boolean;
  layerOpacity: number;
}

/**
 * Common 2D SDF GLSL snippet shared by layer effect shaders.
 */
const SDF_COMMON_GLSL = `
float sdRoundedBox(vec2 p, vec2 b, float r) {
  vec2 q = abs(p) - b + r;
  return min(max(q.x, q.y), 0.0) + length(max(q, 0.0)) - r;
}

float evalShapeDistance(vec2 p, vec2 halfSize, float radius, float isEllipse) {
  if (isEllipse > 0.5) {
    vec2 normP = p / halfSize;
    return (length(normP) - 1.0) * min(halfSize.x, halfSize.y);
  }
  float r = clamp(radius, 0.0, min(halfSize.x, halfSize.y));
  return sdRoundedBox(p, halfSize, r);
}
`;

/**
 * 1. Drop Shadow Shader Material
 * Renders an analytical Gaussian/SDF falloff shadow mesh behind the layer.
 */
export function createDropShadowShaderMaterial(
  geo: LayerGeometryInfo,
  effect: DropShadowLayerEffect,
) {
  const pad = Math.max(8, effect.blur * 3.5);
  const meshW = geo.width + pad * 2;
  const meshH = geo.height + pad * 2;

  const colorObj = new THREE.Color(effect.color || "#000000");

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uDimensions: { value: new THREE.Vector2(geo.width, geo.height) },
      uMeshDimensions: { value: new THREE.Vector2(meshW, meshH) },
      uRadius: { value: geo.radius },
      uIsEllipse: { value: geo.isEllipse ? 1.0 : 0.0 },
      uColor: { value: new THREE.Vector4(colorObj.r, colorObj.g, colorObj.b, 1.0) },
      uBlur: { value: Math.max(0.1, effect.blur) },
      uOpacity: { value: Math.max(0, Math.min(1, effect.opacity)) },
      uLayerOpacity: { value: geo.layerOpacity },
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec2 uDimensions;
      uniform vec2 uMeshDimensions;
      uniform float uRadius;
      uniform float uIsEllipse;
      uniform vec4 uColor;
      uniform float uBlur;
      uniform float uOpacity;
      uniform float uLayerOpacity;
      varying vec2 vUv;

      ${SDF_COMMON_GLSL}

      void main() {
        vec2 halfSize = uDimensions * 0.5;
        vec2 p = (vUv - 0.5) * uMeshDimensions;
        float d = evalShapeDistance(p, halfSize, uRadius, uIsEllipse);

        float sigma = max(0.5, uBlur * 0.5);
        float alpha;
        if (d <= 0.0) {
          alpha = 1.0;
        } else {
          alpha = exp(-0.5 * (d * d) / (sigma * sigma));
        }

        float finalAlpha = alpha * uOpacity * uLayerOpacity;
        if (finalAlpha <= 0.001) discard;

        gl_FragColor = vec4(uColor.rgb, finalAlpha);
      }
    `,
    transparent: true,
    depthWrite: false,
  });

  return { material, pad, meshW, meshH };
}

/**
 * 2. Glow Shader Material
 * Renders edge or fill glow with angular sheen, blend mode, and rim highlights.
 */
export function createGlowShaderMaterial(
  geo: LayerGeometryInfo,
  effect: GlowLayerEffect,
) {
  const pad = Math.max(16, effect.blur * 3.5 + effect.thickness * 30);
  const meshW = geo.width + pad * 2;
  const meshH = geo.height + pad * 2;

  const colorObj = new THREE.Color(effect.color || "#6e6ef5");
  const angleRad = (effect.angle * Math.PI) / 180;
  const isAddBlend = effect.blend === "add";

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uDimensions: { value: new THREE.Vector2(geo.width, geo.height) },
      uMeshDimensions: { value: new THREE.Vector2(meshW, meshH) },
      uRadius: { value: geo.radius },
      uIsEllipse: { value: geo.isEllipse ? 1.0 : 0.0 },
      uGlowColor: { value: new THREE.Vector4(colorObj.r, colorObj.g, colorObj.b, 1.0) },
      uBlur: { value: Math.max(0.5, effect.blur) },
      uIntensity: { value: Math.max(0, effect.intensity) },
      uAngle: { value: angleRad },
      uSheen: { value: Math.max(0, Math.min(1, effect.sheen)) },
      uMode: { value: effect.mode === "fill" ? 1.0 : 0.0 },
      uBlendMode: { value: isAddBlend ? 1.0 : 0.0 },
      uRim: { value: Math.max(0, Math.min(1, effect.rim)) },
      uThickness: { value: Math.max(0, Math.min(1, effect.thickness)) },
      uLayerOpacity: { value: geo.layerOpacity },
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec2 uDimensions;
      uniform vec2 uMeshDimensions;
      uniform float uRadius;
      uniform float uIsEllipse;
      uniform vec4 uGlowColor;
      uniform float uBlur;
      uniform float uIntensity;
      uniform float uAngle;
      uniform float uSheen;
      uniform float uMode;
      uniform float uBlendMode;
      uniform float uRim;
      uniform float uThickness;
      uniform float uLayerOpacity;
      varying vec2 vUv;

      ${SDF_COMMON_GLSL}

      void main() {
        vec2 halfSize = uDimensions * 0.5;
        vec2 p = (vUv - 0.5) * uMeshDimensions;
        float d = evalShapeDistance(p, halfSize, uRadius, uIsEllipse);

        float sigma = max(1.0, uBlur * 0.75);
        float outerGlow = exp(-max(0.0, d) / sigma) * uIntensity;

        float innerGlow = 0.0;
        if (d <= 0.0) {
          if (uMode > 0.5) {
            innerGlow = uIntensity;
          } else {
            float edgeWidth = uThickness * 25.0 + 2.0;
            innerGlow = smoothstep(-edgeWidth, 0.0, d) * uIntensity;
          }
        }

        float baseAlpha = (d > 0.0) ? outerGlow : innerGlow;

        // Directional sheen factor
        if (uSheen > 0.0) {
          vec2 dir = vec2(cos(uAngle), sin(uAngle));
          float lenP = length(p);
          float proj = lenP > 0.001 ? dot(p / lenP, dir) * 0.5 + 0.5 : 0.5;
          baseAlpha *= (1.0 + uSheen * proj * 1.5);
        }

        // Razor-sharp rim highlight
        if (uRim > 0.0) {
          float rimFactor = smoothstep(2.5, 0.0, abs(d));
          baseAlpha += rimFactor * uRim * 1.8;
        }

        float finalAlpha = clamp(baseAlpha, 0.0, 1.0) * uLayerOpacity;
        if (finalAlpha <= 0.001) discard;

        vec3 rgb = uGlowColor.rgb;
        gl_FragColor = vec4(rgb, finalAlpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: isAddBlend ? THREE.AdditiveBlending : THREE.NormalBlending,
  });

  return { material, pad, meshW, meshH };
}

/**
 * 3. Layer Blur Shader Material
 * Analytical erf-based convolution for progressive and uniform box/SDF blur.
 */
export function createLayerBlurShaderMaterial(
  geo: LayerGeometryInfo,
  effect: LayerBlurLayerEffect,
  fillColor: string,
  strokeColor: string,
  strokeWidth: number,
) {
  const maxB = effect.mode === "progressive" ? Math.max(effect.blur, effect.endBlur) : effect.blur;
  const pad = Math.max(16, maxB * 3.5);
  const meshW = geo.width + pad * 2;
  const meshH = geo.height + pad * 2;

  const fillObj = new THREE.Color(fillColor === "transparent" ? "#000000" : fillColor);
  const fillAlpha = fillColor === "transparent" ? 0.0 : 1.0;

  const strokeObj = new THREE.Color(strokeColor === "transparent" ? "#000000" : strokeColor);
  const strokeAlpha = strokeColor === "transparent" ? 0.0 : 1.0;

  const angleRad = (effect.angle * Math.PI) / 180;

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uDimensions: { value: new THREE.Vector2(geo.width, geo.height) },
      uMeshDimensions: { value: new THREE.Vector2(meshW, meshH) },
      uRadius: { value: geo.radius },
      uIsEllipse: { value: geo.isEllipse ? 1.0 : 0.0 },
      uFillColor: { value: new THREE.Vector4(fillObj.r, fillObj.g, fillObj.b, fillAlpha) },
      uStrokeColor: { value: new THREE.Vector4(strokeObj.r, strokeObj.g, strokeObj.b, strokeAlpha) },
      uStrokeWidth: { value: strokeWidth },
      uBlur: { value: Math.max(0.1, effect.blur) },
      uMode: { value: effect.mode === "progressive" ? 1.0 : 0.0 },
      uEndBlur: { value: Math.max(0.1, effect.endBlur) },
      uAngle: { value: angleRad },
      uLayerOpacity: { value: geo.layerOpacity },
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec2 uDimensions;
      uniform vec2 uMeshDimensions;
      uniform float uRadius;
      uniform float uIsEllipse;
      uniform vec4 uFillColor;
      uniform vec4 uStrokeColor;
      uniform float uStrokeWidth;
      uniform float uBlur;
      uniform float uMode;
      uniform float uEndBlur;
      uniform float uAngle;
      uniform float uLayerOpacity;
      varying vec2 vUv;

      ${SDF_COMMON_GLSL}

      // Abramowitz and Stegun erf approximation formula 7.1.26 (max error < 1.5e-7)
      float erfApprox(float x) {
        float s = sign(x);
        float a = abs(x);
        float t = 1.0 / (1.0 + 0.3275911 * a);
        float y = 1.0 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * exp(-a * a);
        return s * y;
      }

      // 1D analytical Gaussian-blurred box integral
      float blurredBox1D(float x, float halfExtent, float sigma) {
        if (sigma <= 0.001) {
          return (abs(x) <= halfExtent) ? 1.0 : 0.0;
        }
        float invSqrt2Sigma = 0.70710678 / sigma;
        return 0.5 * (erfApprox((halfExtent - x) * invSqrt2Sigma) + erfApprox((halfExtent + x) * invSqrt2Sigma));
      }

      void main() {
        vec2 halfSize = uDimensions * 0.5;
        vec2 p = (vUv - 0.5) * uMeshDimensions;

        // Calculate local blur amount along the progressive gradient angle
        float currentBlur = uBlur;
        if (uMode > 0.5) {
          vec2 dir = vec2(cos(uAngle), sin(uAngle));
          vec2 normP = p / halfSize;
          float t = clamp(dot(normP, dir) * 0.5 + 0.5, 0.0, 1.0);
          currentBlur = mix(uBlur, uEndBlur, t);
        }

        float sigma = max(0.001, currentBlur * 0.5);

        // Analytical erf box blur
        float covX = blurredBox1D(p.x, halfSize.x, sigma);
        float covY = blurredBox1D(p.y, halfSize.y, sigma);
        float boxAlpha = covX * covY;

        // SDF distance evaluation for rounded box & ellipse curvature
        float d = evalShapeDistance(p, halfSize, uRadius, uIsEllipse);
        float sdfAlpha = 0.5 * (1.0 - erfApprox(d / (1.41421356 * sigma)));

        float roundness = clamp(uRadius / max(halfSize.x, halfSize.y), 0.0, 1.0);
        float alpha = (uIsEllipse > 0.5 || roundness > 0.01) ? sdfAlpha : boxAlpha;

        float finalAlpha = clamp(alpha, 0.0, 1.0) * uFillColor.a * uLayerOpacity;
        if (finalAlpha <= 0.001) discard;

        vec4 col = uFillColor;
        if (uStrokeWidth > 0.0 && uStrokeColor.a > 0.0) {
          float strokeD = abs(d + uStrokeWidth * 0.5) - uStrokeWidth * 0.5;
          float strokeAlpha = 0.5 * (1.0 - erfApprox(strokeD / (1.41421356 * sigma)));
          col = mix(col, uStrokeColor, clamp(strokeAlpha * uStrokeColor.a, 0.0, 1.0));
        }

        gl_FragColor = vec4(col.rgb, finalAlpha);
      }
    `,
    transparent: true,
    depthWrite: false,
  });

  return { material, pad, meshW, meshH };
}

/**
 * 4. Backdrop Blur Shader Material
 * Frosted backdrop mesh placed behind the layer fill.
 */
export function createBackdropBlurShaderMaterial(
  geo: LayerGeometryInfo,
  effect: BackdropBlurLayerEffect,
) {
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uDimensions: { value: new THREE.Vector2(geo.width, geo.height) },
      uRadius: { value: geo.radius },
      uIsEllipse: { value: geo.isEllipse ? 1.0 : 0.0 },
      uBlur: { value: Math.max(0.1, effect.blur) },
      uLayerOpacity: { value: geo.layerOpacity },
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec2 uDimensions;
      uniform float uRadius;
      uniform float uIsEllipse;
      uniform float uBlur;
      uniform float uLayerOpacity;
      varying vec2 vUv;

      ${SDF_COMMON_GLSL}

      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
      }

      void main() {
        vec2 halfSize = uDimensions * 0.5;
        vec2 p = (vUv - 0.5) * uDimensions;
        float d = evalShapeDistance(p, halfSize, uRadius, uIsEllipse);

        if (d > 0.0) discard;

        float grain = (hash(p * 0.5) - 0.5) * 0.05;
        float edgeBevel = smoothstep(-4.0, 0.0, d) * 0.15;
        float baseFrostedAlpha = clamp(0.25 + (uBlur / 32.0) * 0.35 + grain + edgeBevel, 0.0, 0.85);

        vec3 frostedColor = vec3(0.92, 0.95, 1.0) + grain;
        gl_FragColor = vec4(frostedColor, baseFrostedAlpha * uLayerOpacity);
      }
    `,
    transparent: true,
    depthWrite: false,
  });

  return { material };
}

/**
 * 5. Liquid Glass Shader Material
 * Renders refraction, chromatic dispersion, specular caustics, and fresnel.
 */
export function createLiquidGlassShaderMaterial(
  geo: LayerGeometryInfo,
  effect: LiquidGlassLayerEffect,
) {
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uDimensions: { value: new THREE.Vector2(geo.width, geo.height) },
      uRadius: { value: geo.radius },
      uIsEllipse: { value: geo.isEllipse ? 1.0 : 0.0 },
      uBlur: { value: Math.max(0.1, effect.blur) },
      uRefraction: { value: Math.max(0, Math.min(1, effect.refraction)) },
      uDispersion: { value: Math.max(0, Math.min(1, effect.dispersion)) },
      uHighlight: { value: Math.max(0, Math.min(1, effect.highlight)) },
      uLayerOpacity: { value: geo.layerOpacity },
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec2 uDimensions;
      uniform float uRadius;
      uniform float uIsEllipse;
      uniform float uBlur;
      uniform float uRefraction;
      uniform float uDispersion;
      uniform float uHighlight;
      uniform float uLayerOpacity;
      varying vec2 vUv;

      ${SDF_COMMON_GLSL}

      void main() {
        vec2 halfSize = uDimensions * 0.5;
        vec2 p = (vUv - 0.5) * uDimensions;
        float r = clamp(uRadius, 0.0, min(halfSize.x, halfSize.y));
        float d = evalShapeDistance(p, halfSize, r, uIsEllipse);

        if (d > 0.0) discard;

        // Numerical normal gradient using finite difference
        vec2 eps = vec2(1.0, 0.0);
        float dX = evalShapeDistance(p + eps.xy, halfSize, r, uIsEllipse) - evalShapeDistance(p - eps.xy, halfSize, r, uIsEllipse);
        float dY = evalShapeDistance(p + eps.yx, halfSize, r, uIsEllipse) - evalShapeDistance(p - eps.yx, halfSize, r, uIsEllipse);
        vec2 grad = (length(vec2(dX, dY)) > 0.001) ? normalize(vec2(dX, dY)) : vec2(0.0);

        // Curvature falloff near boundary
        float edgeDist = clamp(-d / max(1.0, uRefraction * 35.0), 0.0, 1.0);
        float curvature = 1.0 - edgeDist * edgeDist;
        vec3 normal = normalize(vec3(grad * curvature * uRefraction * 2.0, 1.0));

        // Primary specular highlight
        vec3 lightDir = normalize(vec3(-0.35, 0.65, 0.68));
        vec3 viewDir = vec3(0.0, 0.0, 1.0);
        vec3 halfDir = normalize(lightDir + viewDir);
        float spec = pow(max(0.0, dot(normal, halfDir)), 28.0) * uHighlight * 2.0;

        // Secondary specular highlight
        vec3 lightDir2 = normalize(vec3(0.4, -0.5, 0.77));
        float spec2 = pow(max(0.0, dot(normal, normalize(lightDir2 + viewDir))), 16.0) * uHighlight * 0.5;

        // Fresnel reflection
        float fresnel = pow(1.0 - max(0.0, normal.z), 2.5) * 0.6;

        // Chromatic dispersion tint
        vec3 dispersionColor = vec3(
          1.0 + uDispersion * 0.9,
          1.0,
          1.0 - uDispersion * 0.9
        );

        vec3 glassHighlight = (spec + spec2) * vec3(1.0) + fresnel * vec3(0.85, 0.92, 1.0) * dispersionColor;
        float alpha = clamp(spec * 1.5 + fresnel * 0.7 + uRefraction * 0.1, 0.0, 0.9) * uLayerOpacity;

        gl_FragColor = vec4(glassHighlight, alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
  });

  return { material };
}

