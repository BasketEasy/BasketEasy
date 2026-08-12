import { useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Sphere, MeshDistortMaterial } from '@react-three/drei';
import type { Mesh } from 'three';

function Basketball() {
  const meshRef = useRef<Mesh>(null);

  useFrame((state) => {
    if (!meshRef.current) {
      return;
    }
    meshRef.current.rotation.y += 0.002 + Math.abs(state.pointer.x) * 0.01;
    meshRef.current.rotation.x += 0.001 + Math.abs(state.pointer.y) * 0.01;
  });

  return (
    <Sphere ref={meshRef} args={[1.4, 64, 64]}>
      <MeshDistortMaterial color="#D4622A" distort={0.15} speed={1.5} roughness={0.4} />
    </Sphere>
  );
}

export function HeroCanvas() {
  return (
    <Canvas camera={{ position: [0, 0, 5], fov: 45 }} dpr={[1, 1.5]}>
      <ambientLight intensity={0.6} />
      <pointLight position={[5, 5, 5]} intensity={1.2} color="#E8743B" />
      <Basketball />
    </Canvas>
  );
}
