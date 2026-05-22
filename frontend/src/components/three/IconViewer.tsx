import { Suspense, useMemo, useRef } from 'react';
import { Canvas } from '@react-three/fiber';
import { Bounds, Center, Environment, OrbitControls, useGLTF } from '@react-three/drei';
import * as THREE from 'three';

const MODEL_SRC = '/3Dicon.optimized.glb';

useGLTF.preload(MODEL_SRC);

/** Slight 3-quarter angle that shows depth without hiding the front. */
const INITIAL_ROTATION: [number, number, number] = [0.18, -0.45, 0];

function FuryModel(): JSX.Element {
  const group = useRef<THREE.Group>(null);
  const { scene } = useGLTF(MODEL_SRC, true, true);

  const cloned = useMemo(() => {
    const c = scene.clone(true);
    c.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const m of mats) {
        const mat = m as THREE.MeshStandardMaterial;
        if ('metalness' in mat) mat.metalness = Math.min(1, (mat.metalness ?? 0.25) + 0.3);
        if ('roughness' in mat) mat.roughness = Math.max(0.15, (mat.roughness ?? 0.5) - 0.22);
        if ('envMapIntensity' in mat) (mat as unknown as { envMapIntensity: number }).envMapIntensity = 1.5;
        if (mat.emissiveIntensity !== undefined && mat.emissiveIntensity > 0) {
          mat.emissiveIntensity *= 1.6;
        }
        mat.needsUpdate = true;
      }
    });
    return c;
  }, [scene]);

  return (
    <group ref={group} rotation={INITIAL_ROTATION}>
      <primitive object={cloned} />
    </group>
  );
}

type Props = {
  className?: string;
};

export default function IconViewer({ className }: Props): JSX.Element {
  return (
    <div className={className}>
      <Canvas
        dpr={[1, 2]}
        camera={{ position: [0, 0, 4], fov: 35 }}
        gl={{
          alpha: true,
          premultipliedAlpha: false,
          antialias: true,
          powerPreference: 'high-performance',
        }}
        onCreated={({ gl, scene }) => {
          gl.setClearColor(0x000000, 0);
          gl.setClearAlpha(0);
          scene.background = null;
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = 1.35;
          gl.outputColorSpace = THREE.SRGBColorSpace;
        }}
      >
        <ambientLight intensity={0.3} color="#3a1a14" />
        <directionalLight position={[4, 5, 4]} intensity={1.8} color="#ffb070" />
        <directionalLight position={[-4, 2, 1]} intensity={0.8} color="#ff5a30" />
        <directionalLight position={[0, 1.5, -4]} intensity={1.2} color="#ff7a18" />
        <pointLight position={[0, -2, 2]} intensity={0.6} color="#ff3d2e" />

        <Suspense fallback={null}>
          <Environment preset="warehouse" background={false} environmentIntensity={0.85} />
          <Bounds fit clip observe margin={1.15}>
            <Center>
              <FuryModel />
            </Center>
          </Bounds>
        </Suspense>

        <OrbitControls
          enablePan={false}
          enableZoom={false}
          enableDamping
          dampingFactor={0.08}
          rotateSpeed={0.6}
          /* Slight inertia, but no auto-spin */
          autoRotate={false}
        />
      </Canvas>
    </div>
  );
}
