import * as THREE from "three";

/**
 * GLSL Signed Distance Field (SDF) Material for rectangles with arbitrary corner radius,
 * smooth anti-aliased edges, and optional stroke borders.
 */
export function createRoundRectShaderMaterial(params?: {
  width?: number;
  height?: number;
  radius?: number;
  fillColor?: string;
  strokeColor?: string;
  strokeWidth?: number;
  opacity?: number;
  isEllipse?: boolean;
  blur?: number;
}) {
  const w = params?.width ?? 100;
  const h = params?.height ?? 100;
  const radius = params?.radius ?? 0;
  const fill = params?.fillColor ?? "#38bdf8";
  const stroke = params?.strokeColor ?? "transparent";
  const strokeW = params?.strokeWidth ?? 0;
  const opacity = params?.opacity ?? 1.0;
  const isEllipse = params?.isEllipse ?? false;
  const blur = params?.blur ?? 0.0;

  const fillThreeColor = new THREE.Color(fill === "transparent" ? "#000000" : fill);
  const fillAlpha = fill === "transparent" ? 0.0 : 1.0;

  const strokeThreeColor = new THREE.Color(stroke === "transparent" ? "#000000" : stroke);
  const strokeAlpha = stroke === "transparent" ? 0.0 : 1.0;

  return new THREE.ShaderMaterial({
    uniforms: {
      uDimensions: { value: new THREE.Vector2(w, h) },
      uRadius: { value: radius },
      uFillColor: { value: new THREE.Vector4(fillThreeColor.r, fillThreeColor.g, fillThreeColor.b, fillAlpha) },
      uStrokeColor: { value: new THREE.Vector4(strokeThreeColor.r, strokeThreeColor.g, strokeThreeColor.b, strokeAlpha) },
      uStrokeWidth: { value: strokeW },
      uOpacity: { value: opacity },
      uIsEllipse: { value: isEllipse ? 1.0 : 0.0 },
      uBlur: { value: blur },
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
      uniform vec4 uFillColor;
      uniform vec4 uStrokeColor;
      uniform float uStrokeWidth;
      uniform float uOpacity;
      uniform float uIsEllipse;
      uniform float uBlur;
      varying vec2 vUv;

      // Inigo Quilez 2D SDF for rounded box
      float sdRoundedBox(vec2 p, vec2 b, float r) {
        vec2 q = abs(p) - b + r;
        return min(max(q.x, q.y), 0.0) + length(max(q, 0.0)) - r;
      }

      void main() {
        vec2 p = (vUv - 0.5) * uDimensions;
        float d;

        if (uIsEllipse > 0.5) {
          // Normalize coordinate for ellipse SDF approximation
          vec2 normP = p / (uDimensions * 0.5);
          d = (length(normP) - 1.0) * min(uDimensions.x, uDimensions.y) * 0.5;
        } else {
          vec2 halfSize = uDimensions * 0.5;
          float r = clamp(uRadius, 0.0, min(halfSize.x, halfSize.y));
          d = sdRoundedBox(p, halfSize, r);
        }

        // Anti-aliased outer mask with optical depth-of-field blur
        float fw = fwidth(d);
        float blurVal = max(fw * 0.5, uBlur);
        float shapeAlpha = 1.0 - smoothstep(-blurVal, blurVal, d);

        if (shapeAlpha <= 0.0) {
          discard;
        }

        vec4 col = uFillColor;

        // Render stroke if active
        if (uStrokeWidth > 0.0 && uStrokeColor.a > 0.0) {
          float strokeD = abs(d + uStrokeWidth * 0.5) - uStrokeWidth * 0.5;
          float strokeAlpha = 1.0 - smoothstep(-blurVal, blurVal, strokeD);
          col = mix(col, uStrokeColor, strokeAlpha * uStrokeColor.a);
        }

        gl_FragColor = vec4(col.rgb, col.a * shapeAlpha * uOpacity);
      }
    `,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
}

