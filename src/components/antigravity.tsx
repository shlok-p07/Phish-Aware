"use client";

/**
 * Static variant of React Bits' "Antigravity" particle field.
 *
 * The original repels particles away from the cursor every frame. This version
 * lays the field out once and never touches it again: no pointer input, no
 * animation loop. The canvas renders on demand (mount + resize) so it costs
 * nothing while it sits in the background.
 */

import { Canvas, useThree } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";

export interface AntigravityProps {
  count?: number;
  color?: string;
  particleSize?: number;
  particleVariance?: number;
  particleShape?: "capsule" | "sphere" | "box" | "tetrahedron";
  /** Depth of the slab particles are scattered through, in world units. */
  depth?: number;
  /** Fraction of the field (0-1) kept empty in the middle, so copy stays readable. */
  clearRadius?: number;
  /** How far past the viewport edges to scatter, so resizing never reveals a hard edge. */
  spread?: number;
  /** Fixed seed keeps the layout identical across re-renders and resizes. */
  seed?: number;
}

// Deterministic PRNG — a resize recomputes the field, and we want it to come
// back the same instead of reshuffling under the user.
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp01 = (t: number) => Math.min(1, Math.max(0, t));
const smoothstep = (t: number) => t * t * (3 - 2 * t);

function ParticleField({
  count = 420,
  color = "#FF9FFC",
  particleSize = 1.4,
  particleVariance = 0.7,
  particleShape = "capsule",
  depth = 22,
  clearRadius = 0.32,
  spread = 1.15,
  seed = 1337,
}: AntigravityProps) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const { viewport, invalidate } = useThree();

  const matrices = useMemo(() => {
    const rand = mulberry32(seed);
    const dummy = new THREE.Object3D();
    const width = (viewport.width || 60) * spread;
    const height = (viewport.height || 40) * spread;
    const halfDiagonal = Math.hypot(width, height) / 2;
    const out: THREE.Matrix4[] = [];

    for (let i = 0; i < count; i++) {
      const x = (rand() - 0.5) * width;
      const y = (rand() - 0.5) * height;
      const z = (rand() - 0.5) * depth;
      const jitter = (rand() - 0.5) * 0.7;
      const variance = 1 - particleVariance / 2 + rand() * particleVariance;

      // Scale up with distance from centre, so the middle fades out instead of
      // being a visible empty hole.
      const radial = Math.hypot(x, y) / halfDiagonal;
      const falloff = smoothstep(clamp01((radial - clearRadius) / (1 - clearRadius)));

      dummy.position.set(x, y, z);
      // Aim each particle at the centre of the field, which reads as a radial
      // burst rather than random confetti; jitter keeps it from looking rigid.
      dummy.lookAt(0, 0, z);
      dummy.rotateX(Math.PI / 2);
      dummy.rotateZ(jitter);
      dummy.scale.setScalar(particleSize * falloff * variance);
      dummy.updateMatrix();

      out.push(dummy.matrix.clone());
    }

    return out;
  }, [
    count,
    particleSize,
    particleVariance,
    depth,
    clearRadius,
    spread,
    seed,
    viewport.width,
    viewport.height,
  ]);

  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;

    matrices.forEach((matrix, i) => mesh.setMatrixAt(i, matrix));
    mesh.instanceMatrix.needsUpdate = true;
    invalidate();
  }, [matrices, invalidate]);

  return (
    <instancedMesh
      ref={meshRef}
      args={[undefined, undefined, count]}
      frustumCulled={false}
    >
      {particleShape === "capsule" && <capsuleGeometry args={[0.1, 0.4, 4, 8]} />}
      {particleShape === "sphere" && <sphereGeometry args={[0.2, 16, 16]} />}
      {particleShape === "box" && <boxGeometry args={[0.3, 0.3, 0.3]} />}
      {particleShape === "tetrahedron" && <tetrahedronGeometry args={[0.3]} />}
      <meshBasicMaterial color={color} />
    </instancedMesh>
  );
}

export default function Antigravity(props: AntigravityProps) {
  return (
    <Canvas
      frameloop="demand"
      camera={{ position: [0, 0, 50], fov: 35 }}
      dpr={[1, 1.5]}
      gl={{ antialias: true }}
    >
      <ParticleField {...props} />
    </Canvas>
  );
}
