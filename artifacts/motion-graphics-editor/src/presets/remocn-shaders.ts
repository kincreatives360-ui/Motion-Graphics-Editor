/**
 * Remocn Shaders Library
 * Production-ready GLSL and Canvas shaders inspired by remocn (shadcn for motion & video).
 * Includes Mesh Gradient, Grain Gradient, Warp, Metaballs, God Rays, Neuro Noise,
 * Voronoi, Dot Orbit, Dithering, Swirl, Water, and Liquid Metal.
 */

export interface RemocnShaderDefinition {
  id: string;
  name: string;
  category: "gradient" | "organic" | "lighting" | "geometric" | "distortion";
  description: string;
  colors: string[];
  speed: number;
  scale: number;
  intensity: number;
  fragmentShader: string;
  vertexShader?: string;
}

export const REMOCN_SHADERS: RemocnShaderDefinition[] = [
  {
    id: "mesh-gradient",
    name: "Mesh Gradient",
    category: "gradient",
    description: "Flowing multi-point organic mesh gradient with fluid domain blending",
    colors: ["#38bdf8", "#818cf8", "#c084fc", "#f472b6"],
    speed: 1.0,
    scale: 1.2,
    intensity: 1.0,
    fragmentShader: `
      precision highp float;
      uniform vec2 u_resolution;
      uniform float u_time;
      uniform vec3 u_color1;
      uniform vec3 u_color2;
      uniform vec3 u_color3;
      uniform vec3 u_color4;

      vec2 hash(vec2 p) {
        p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
        return -1.0 + 2.0 * fract(sin(p) * 43758.5453123);
      }

      float noise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(mix(dot(hash(i + vec2(0.0, 0.0)), f - vec2(0.0, 0.0)),
                       dot(hash(i + vec2(1.0, 0.0)), f - vec2(1.0, 0.0)), u.x),
                   mix(dot(hash(i + vec2(0.0, 1.0)), f - vec2(0.0, 1.0)),
                       dot(hash(i + vec2(1.0, 1.0)), f - vec2(1.0, 1.0)), u.x), u.y);
      }

      void main() {
        vec2 uv = gl_FragCoord.xy / u_resolution.xy;
        float t = u_time * 0.4;
        
        vec2 p1 = vec2(0.2 + 0.3 * sin(t * 0.8), 0.3 + 0.3 * cos(t * 0.9));
        vec2 p2 = vec2(0.8 + 0.2 * cos(t * 0.7), 0.2 + 0.3 * sin(t * 1.1));
        vec2 p3 = vec2(0.3 + 0.3 * cos(t * 1.2), 0.8 + 0.2 * sin(t * 0.6));
        vec2 p4 = vec2(0.7 + 0.3 * sin(t * 0.5), 0.7 + 0.3 * cos(t * 0.8));

        float d1 = length(uv - p1);
        float d2 = length(uv - p2);
        float d3 = length(uv - p3);
        float d4 = length(uv - p4);

        float n = noise(uv * 3.0 + t * 0.2) * 0.15;
        
        float w1 = 1.0 / (d1 + 0.2 + n);
        float w2 = 1.0 / (d2 + 0.2 + n);
        float w3 = 1.0 / (d3 + 0.2 + n);
        float w4 = 1.0 / (d4 + 0.2 + n);
        float total = w1 + w2 + w3 + w4;

        vec3 col = (u_color1 * w1 + u_color2 * w2 + u_color3 * w3 + u_color4 * w4) / total;
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  },
  {
    id: "grain-gradient",
    name: "Grain Gradient",
    category: "gradient",
    description: "Analog textured gradient with micro-dithered film grain",
    colors: ["#090d16", "#1e1b4b", "#4338ca", "#a855f7"],
    speed: 0.8,
    scale: 1.0,
    intensity: 0.85,
    fragmentShader: `
      precision highp float;
      uniform vec2 u_resolution;
      uniform float u_time;
      uniform vec3 u_color1;
      uniform vec3 u_color2;
      uniform vec3 u_color3;

      float random(vec2 p) {
        return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
      }

      void main() {
        vec2 uv = gl_FragCoord.xy / u_resolution.xy;
        float grad = uv.x * 0.5 + uv.y * 0.5 + sin(u_time * 0.5) * 0.1;
        vec3 col = mix(u_color1, u_color2, smoothstep(0.0, 0.6, grad));
        col = mix(col, u_color3, smoothstep(0.5, 1.0, grad));
        
        float grain = (random(uv * 1000.0 + fract(u_time * 10.0)) - 0.5) * 0.12;
        col += grain;
        gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
      }
    `,
  },
  {
    id: "warp-liquid-metal",
    name: "Liquid Metal Warp",
    category: "distortion",
    description: "Fluid chrome domain-warping with dynamic iridescent reflection",
    colors: ["#020617", "#1e293b", "#38bdf8", "#e2e8f0"],
    speed: 1.2,
    scale: 1.5,
    intensity: 1.2,
    fragmentShader: `
      precision highp float;
      uniform vec2 u_resolution;
      uniform float u_time;
      uniform vec3 u_color1;
      uniform vec3 u_color2;
      uniform vec3 u_color3;

      void main() {
        vec2 uv = (gl_FragCoord.xy * 2.0 - u_resolution.xy) / min(u_resolution.x, u_resolution.y);
        float t = u_time * 0.6;
        for (float i = 1.0; i < 4.0; i++) {
          uv.x += 0.3 / i * sin(i * 3.0 * uv.y + t);
          uv.y += 0.3 / i * cos(i * 3.0 * uv.x + t);
        }
        float val = sin(uv.x * 4.0 + uv.y * 4.0);
        vec3 col = mix(u_color1, u_color2, val * 0.5 + 0.5);
        col = mix(col, u_color3, pow(val * 0.5 + 0.5, 3.0));
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  },
  {
    id: "god-rays",
    name: "God Rays",
    category: "lighting",
    description: "Volumetric atmospheric sunbeams radiating from animated focus",
    colors: ["#050811", "#1e3a8a", "#60a5fa", "#fef08a"],
    speed: 1.0,
    scale: 1.0,
    intensity: 1.1,
    fragmentShader: `
      precision highp float;
      uniform vec2 u_resolution;
      uniform float u_time;
      uniform vec3 u_color1;
      uniform vec3 u_color2;
      uniform vec3 u_color3;

      void main() {
        vec2 uv = (gl_FragCoord.xy - u_resolution.xy * 0.5) / u_resolution.y;
        float angle = atan(uv.y, uv.x);
        float dist = length(uv);
        float rays = sin(angle * 12.0 + u_time * 0.8) * 0.5 + 0.5;
        rays += sin(angle * 24.0 - u_time * 1.2) * 0.25;
        float beam = rays / (dist + 0.3);
        vec3 col = mix(u_color1, u_color2, clamp(beam * 0.5, 0.0, 1.0));
        col += u_color3 * pow(clamp(beam * 0.4, 0.0, 1.0), 2.0);
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  },
  {
    id: "neuro-noise",
    name: "Neuro Noise",
    category: "organic",
    description: "Bio-luminescent neural synapses with electrical pulse propagation",
    colors: ["#05050a", "#10b981", "#06b6d4", "#a7f3d0"],
    speed: 1.1,
    scale: 2.0,
    intensity: 1.0,
    fragmentShader: `
      precision highp float;
      uniform vec2 u_resolution;
      uniform float u_time;
      uniform vec3 u_color1;
      uniform vec3 u_color2;

      void main() {
        vec2 uv = (gl_FragCoord.xy * 2.0 - u_resolution.xy) / min(u_resolution.x, u_resolution.y);
        float t = u_time * 0.7;
        float d = length(uv);
        float val = 0.0;
        for (float i = 1.0; i <= 3.0; i++) {
          val += sin(uv.x * 5.0 * i + t) * cos(uv.y * 5.0 * i - t);
        }
        val = abs(val) * 0.5;
        float ring = smoothstep(0.05, 0.0, abs(sin(d * 8.0 - t * 2.0) - val));
        vec3 col = mix(u_color1, u_color2, ring);
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  },
  {
    id: "metaballs",
    name: "Metaballs Fluid",
    category: "organic",
    description: "Liquid organic spheres merging with smooth minimum SDF boundaries",
    colors: ["#0b0d14", "#ec4899", "#8b5cf6", "#38bdf8"],
    speed: 1.0,
    scale: 1.0,
    intensity: 1.0,
    fragmentShader: `
      precision highp float;
      uniform vec2 u_resolution;
      uniform float u_time;
      uniform vec3 u_color1;
      uniform vec3 u_color2;
      uniform vec3 u_color3;

      void main() {
        vec2 uv = gl_FragCoord.xy / u_resolution.xy;
        float t = u_time * 0.8;
        float m = 0.0;
        
        for (int i = 0; i < 5; i++) {
          float fi = float(i);
          vec2 pos = vec2(
            0.5 + 0.3 * sin(t * (0.6 + fi * 0.2) + fi * 1.5),
            0.5 + 0.3 * cos(t * (0.5 + fi * 0.15) + fi * 2.0)
          );
          float d = length(uv - pos);
          m += 0.035 / (d * d + 0.005);
        }
        
        vec3 col = u_color1;
        if (m > 1.0) {
          col = mix(u_color2, u_color3, smoothstep(1.0, 3.5, m));
        } else {
          col = mix(u_color1, u_color2, pow(m, 2.0));
        }
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  },
  {
    id: "voronoi-cells",
    name: "Voronoi Cells",
    category: "geometric",
    description: "Dynamic geometric crystal cell grid with responsive illumination",
    colors: ["#030712", "#1f2937", "#6366f1", "#a5b4fc"],
    speed: 0.9,
    scale: 1.5,
    intensity: 0.9,
    fragmentShader: `
      precision highp float;
      uniform vec2 u_resolution;
      uniform float u_time;
      uniform vec3 u_color1;
      uniform vec3 u_color2;

      vec2 hash2(vec2 p) {
        return fract(sin(vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)))) * 43758.5453);
      }

      void main() {
        vec2 uv = gl_FragCoord.xy / u_resolution.xy * 6.0;
        vec2 i_st = floor(uv);
        vec2 f_st = fract(uv);
        float m_dist = 1.0;

        for (int y = -1; y <= 1; y++) {
          for (int x = -1; x <= 1; x++) {
            vec2 neighbor = vec2(float(x), float(y));
            vec2 point = hash2(i_st + neighbor);
            point = 0.5 + 0.5 * sin(u_time * 0.8 + 6.2831 * point);
            vec2 diff = neighbor + point - f_st;
            float dist = length(diff);
            m_dist = min(m_dist, dist);
          }
        }

        vec3 col = mix(u_color2, u_color1, m_dist);
        col += smoothstep(0.04, 0.0, m_dist) * 0.5;
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  },
  {
    id: "dot-orbit",
    name: "Dot Orbit Particles",
    category: "geometric",
    description: "Mathematical circular particle matrix with harmonic orbit resonance",
    colors: ["#020617", "#0ea5e9", "#38bdf8", "#bae6fd"],
    speed: 1.2,
    scale: 1.8,
    intensity: 1.0,
    fragmentShader: `
      precision highp float;
      uniform vec2 u_resolution;
      uniform float u_time;
      uniform vec3 u_color1;
      uniform vec3 u_color2;

      void main() {
        vec2 uv = (gl_FragCoord.xy * 2.0 - u_resolution.xy) / min(u_resolution.x, u_resolution.y);
        float t = u_time * 0.9;
        float d = length(uv);
        float a = atan(uv.y, uv.x);
        
        float rings = sin(d * 16.0 - t * 2.0 + sin(a * 4.0) * 1.5);
        float dots = smoothstep(0.6, 0.9, rings);
        
        vec3 col = mix(u_color1, u_color2, dots * (1.0 - smoothstep(0.0, 1.2, d)));
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  },
  {
    id: "swirl-vortex",
    name: "Swirl Vortex",
    category: "distortion",
    description: "Hydrodynamic spiral whirlpool vortex with centrifugal flow lines",
    colors: ["#070a14", "#4338ca", "#06b6d4", "#f0abfc"],
    speed: 1.0,
    scale: 1.0,
    intensity: 1.0,
    fragmentShader: `
      precision highp float;
      uniform vec2 u_resolution;
      uniform float u_time;
      uniform vec3 u_color1;
      uniform vec3 u_color2;
      uniform vec3 u_color3;

      void main() {
        vec2 uv = (gl_FragCoord.xy - u_resolution.xy * 0.5) / min(u_resolution.x, u_resolution.y);
        float r = length(uv);
        float a = atan(uv.y, uv.x);
        float t = u_time * 0.7;
        
        float spiral = sin(a * 5.0 + r * 10.0 - t * 3.0);
        float arm = smoothstep(-0.2, 0.8, spiral);
        
        vec3 col = mix(u_color1, u_color2, arm);
        col = mix(col, u_color3, pow(arm, 3.0) * (1.0 - smoothstep(0.0, 0.8, r)));
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  },
  {
    id: "water-caustics",
    name: "Water Caustics",
    category: "organic",
    description: "Sunlight underwater refraction waves with caustic interference patterns",
    colors: ["#022c43", "#053f5e", "#115e59", "#67e8f9"],
    speed: 1.1,
    scale: 1.3,
    intensity: 1.0,
    fragmentShader: `
      precision highp float;
      uniform vec2 u_resolution;
      uniform float u_time;
      uniform vec3 u_color1;
      uniform vec3 u_color2;

      void main() {
        vec2 p = gl_FragCoord.xy / u_resolution.xy * 8.0;
        vec2 i = vec2(p);
        float c = 1.0;
        float inten = 0.005;

        for (int n = 0; n < 4; n++) {
          float t = u_time * (1.0 - (3.5 / float(n + 1)));
          i = p + vec2(cos(t - i.x) + sin(t + i.y), sin(t - i.y) + cos(t + i.x));
          c += 1.0 / length(vec2(p.x / (sin(i.x + t) / inten), p.y / (cos(i.y + t) / inten)));
        }

        c /= 4.0;
        c = 1.17 - pow(c, 1.4);
        vec3 col = mix(u_color1, u_color2, clamp(c, 0.0, 1.0));
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  },
];

/**
 * Pure 2D Canvas fallback renderer for when WebGL is unavailable or during fast preview
 */
export function renderRemocnShaderToCanvas2D(
  ctx: CanvasRenderingContext2D,
  shaderId: string,
  width: number,
  height: number,
  frame: number,
  fps: number = 30,
) {
  const time = frame / fps;
  const shader = REMOCN_SHADERS.find((s) => s.id === shaderId) || REMOCN_SHADERS[0];

  ctx.save();
  ctx.clearRect(0, 0, width, height);

  if (shader.id === "mesh-gradient" || shader.category === "gradient") {
    const c1 = shader.colors[0] || "#38bdf8";
    const c2 = shader.colors[1] || "#818cf8";
    const c3 = shader.colors[2] || "#c084fc";
    const c4 = shader.colors[3] || "#f472b6";

    const p1x = (0.3 + 0.2 * Math.sin(time * 0.8)) * width;
    const p1y = (0.3 + 0.2 * Math.cos(time * 0.9)) * height;
    const p2x = (0.7 + 0.2 * Math.cos(time * 0.7)) * width;
    const p2y = (0.7 + 0.2 * Math.sin(time * 1.1)) * height;

    const g1 = ctx.createRadialGradient(p1x, p1y, 10, p1x, p1y, width * 0.8);
    g1.addColorStop(0, c1);
    g1.addColorStop(0.5, c2);
    g1.addColorStop(1, "transparent");

    const g2 = ctx.createRadialGradient(p2x, p2y, 10, p2x, p2y, width * 0.8);
    g2.addColorStop(0, c3);
    g2.addColorStop(0.5, c4);
    g2.addColorStop(1, "transparent");

    ctx.fillStyle = "#090d16";
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = g1;
    ctx.fillRect(0, 0, width, height);
    ctx.globalCompositeOperation = "screen";
    ctx.fillStyle = g2;
    ctx.fillRect(0, 0, width, height);
  } else if (shader.id === "god-rays") {
    const cx = width * 0.5 + Math.sin(time) * 100;
    const cy = height * 0.3;
    const g = ctx.createRadialGradient(cx, cy, 20, cx, cy, width * 0.9);
    g.addColorStop(0, "#fef08a");
    g.addColorStop(0.3, "#60a5fa");
    g.addColorStop(1, "#050811");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = "rgba(96, 165, 250, 0.08)";
    for (let i = 0; i < 12; i++) {
      const angle = (i / 12) * Math.PI * 2 + time * 0.2;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(angle - 0.1) * width * 1.5, cy + Math.sin(angle - 0.1) * height * 1.5);
      ctx.lineTo(cx + Math.cos(angle + 0.1) * width * 1.5, cy + Math.sin(angle + 0.1) * height * 1.5);
      ctx.closePath();
      ctx.fill();
    }
  } else {
    // Default dynamic procedural fallback
    const grad = ctx.createLinearGradient(
      Math.sin(time * 0.5) * width * 0.5 + width * 0.5,
      0,
      width,
      height,
    );
    shader.colors.forEach((col, idx) => {
      grad.addColorStop(idx / Math.max(1, shader.colors.length - 1), col);
    });
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);
  }

  ctx.restore();
}
