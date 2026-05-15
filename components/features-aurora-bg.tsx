"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import * as THREE from "three";

// ── Aurora WebGL Shader (dark purple, #0F0A1E base) ──────────────────────────

export function FeaturesAuroraBg() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<{
    scene: THREE.Scene | null;
    camera: THREE.OrthographicCamera | null;
    renderer: THREE.WebGLRenderer | null;
    mesh: THREE.Mesh | null;
    uniforms: any;
    animationId: number | null;
  }>({
    scene: null,
    camera: null,
    renderer: null,
    mesh: null,
    uniforms: null,
    animationId: null,
  });

  useEffect(() => {
    if (!canvasRef.current) return;

    const canvas = canvasRef.current;
    const { current: refs } = sceneRef;

    // Dark purple aurora fragment shader
    const vertexShader = `
      attribute vec3 position;
      void main() {
        gl_Position = vec4(position, 1.0);
      }
    `;

    const fragmentShader = `
      precision highp float;
      uniform vec2 resolution;
      uniform float time;

      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
      }

      float noise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(
          mix(hash(i), hash(i + vec2(1,0)), f.x),
          mix(hash(i + vec2(0,1)), hash(i + vec2(1,1)), f.x),
          f.y
        );
      }

      void main() {
        vec2 uv = gl_FragCoord.xy / resolution.xy;
        
        // Base dark background #0F0A1E
        vec3 base = vec3(0.059, 0.039, 0.118);
        
        // Aurora layers - slow drifting
        float t = time * 0.15;
        
        float n1 = noise(vec2(uv.x * 2.5 + t * 0.3, uv.y * 1.8 + t * 0.1));
        float n2 = noise(vec2(uv.x * 3.2 - t * 0.2, uv.y * 2.4 - t * 0.15));
        float n3 = noise(vec2(uv.x * 1.8 + t * 0.25, uv.y * 3.0 + t * 0.08));
        
        float aurora = n1 * 0.5 + n2 * 0.3 + n3 * 0.2;
        
        // Vertical gradient - aurora concentrated toward center and slightly above
        float vGrad = smoothstep(0.0, 0.5, uv.y) * smoothstep(1.0, 0.4, uv.y);
        aurora *= vGrad * 0.9 + 0.1;
        
        // Purple / violet aurora colors (#7C3AED → #4C1D95 → #2D1B69)
        vec3 auroraColor1 = vec3(0.486, 0.227, 0.929); // #7C3AED
        vec3 auroraColor2 = vec3(0.298, 0.114, 0.584); // #4C1D95
        vec3 auroraColor3 = vec3(0.176, 0.106, 0.412); // #2D1B69
        
        float blend = fract(aurora * 2.0 + t * 0.1);
        vec3 auroraFinal = mix(
          mix(auroraColor3, auroraColor2, blend),
          auroraColor1,
          smoothstep(0.5, 1.0, aurora)
        );
        
        // Subtle glow pulse
        float pulse = 0.85 + 0.15 * sin(time * 0.4 + uv.x * 3.1415);
        float intensity = aurora * 0.35 * pulse;
        
        vec3 color = mix(base, auroraFinal, intensity);
        
        gl_FragColor = vec4(color, 1.0);
      }
    `;

    const initScene = () => {
      refs.scene = new THREE.Scene();
      refs.renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
      refs.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
      refs.renderer.setClearColor(new THREE.Color(0x0f0a1e));

      refs.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, -1);

      refs.uniforms = {
        resolution: { value: [canvas.offsetWidth, canvas.offsetHeight] },
        time: { value: 0.0 },
      };

      const positions = new THREE.BufferAttribute(
        new Float32Array([
          -1.0, -1.0, 0.0,
           1.0, -1.0, 0.0,
          -1.0,  1.0, 0.0,
           1.0, -1.0, 0.0,
          -1.0,  1.0, 0.0,
           1.0,  1.0, 0.0,
        ]),
        3
      );
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", positions);

      const material = new THREE.RawShaderMaterial({
        vertexShader,
        fragmentShader,
        uniforms: refs.uniforms,
        side: THREE.DoubleSide,
      });

      refs.mesh = new THREE.Mesh(geometry, material);
      refs.scene.add(refs.mesh);

      handleResize();
    };

    const animate = () => {
      if (refs.uniforms) refs.uniforms.time.value += 0.01;
      if (refs.renderer && refs.scene && refs.camera) {
        refs.renderer.render(refs.scene, refs.camera);
      }
      refs.animationId = requestAnimationFrame(animate);
    };

    const handleResize = () => {
      if (!refs.renderer || !refs.uniforms || !canvasRef.current) return;
      const parent = canvasRef.current.parentElement;
      const width = parent ? parent.offsetWidth : window.innerWidth;
      const height = parent ? parent.offsetHeight : window.innerHeight;
      refs.renderer.setSize(width, height, false);
      refs.uniforms.resolution.value = [width, height];
    };

    initScene();
    animate();
    window.addEventListener("resize", handleResize);

    return () => {
      if (refs.animationId) cancelAnimationFrame(refs.animationId);
      window.removeEventListener("resize", handleResize);
      if (refs.mesh) {
        refs.scene?.remove(refs.mesh);
        refs.mesh.geometry.dispose();
        if (refs.mesh.material instanceof THREE.Material) {
          refs.mesh.material.dispose();
        }
      }
      refs.renderer?.dispose();
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        display: "block",
        pointerEvents: "none",
      }}
    />
  );
}

// ── Floating Particle Layer (CSS-based, purple/violet) ───────────────────────

interface Particle {
  id: number;
  x: number;      // % from left
  delay: number;  // animation-delay seconds
  duration: number; // animation duration seconds
  size: number;   // px
  drift: number;  // horizontal drift px
}

function generateParticles(count: number): Particle[] {
  return [...new Array(count)].map((_, i) => ({
    id: i,
    x: Math.random() * 100,
    delay: Math.random() * 20,
    duration: 15 + Math.random() * 20,
    size: 1 + Math.random() * 1,
    drift: (Math.random() - 0.5) * 60,
  }));
}

export function FeaturesParticleLayer() {
  const [particles] = useState<Particle[]>(() => generateParticles(60));

  return (
    <>
      <style>{`
        @keyframes float-up {
          0%   { transform: translateY(100%) translateX(0px); opacity: 0; }
          10%  { opacity: 0.4; }
          90%  { opacity: 0.4; }
          100% { transform: translateY(-120px) translateX(var(--drift)); opacity: 0; }
        }
      `}</style>
      <div
        style={{
          position: "absolute",
          inset: 0,
          overflow: "hidden",
          pointerEvents: "none",
          zIndex: 0,
        }}
      >
        {particles.map((p) => (
          <div
            key={p.id}
            style={{
              position: "absolute",
              bottom: 0,
              left: `${p.x}%`,
              width: `${p.size}px`,
              height: `${p.size}px`,
              borderRadius: "50%",
              background: "#7C3AED",
              opacity: 0,
              // @ts-ignore - CSS custom property
              "--drift": `${p.drift}px`,
              animation: `float-up ${p.duration}s ${p.delay}s infinite linear`,
            } as CSSProperties}
          />
        ))}
      </div>
    </>
  );
}
