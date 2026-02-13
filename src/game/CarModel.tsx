import { forwardRef, useMemo } from 'react';
import { useGLTF, useTexture } from '@react-three/drei';
import * as THREE from 'three';

interface CarModelProps {
  color: string;
}

export const CarModel = forwardRef<THREE.Group, CarModelProps>(
  function CarModel({ color }, ref) {
    const { scene } = useGLTF('/models/sedan-sports.glb');

    // Load the colormap separately so we can set filters BEFORE the GPU
    // ever sees it. The embedded GLB texture gets uploaded with default
    // (linear) filters, and patching after the fact is unreliable.
    const colormap = useTexture('/models/colormap.png');

    // Configure once — NearestFilter gives crisp palette-style colours
    useMemo(() => {
      colormap.magFilter = THREE.NearestFilter;
      colormap.minFilter = THREE.NearestFilter;
      colormap.generateMipmaps = false;
      colormap.colorSpace = THREE.SRGBColorSpace;
      colormap.flipY = false; // GLB convention: textures are NOT flipped
      colormap.needsUpdate = true;
    }, [colormap]);

    const cloned = useMemo(() => {
      const clone = scene.clone(true);

      clone.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          const mesh = child as THREE.Mesh;
          if (mesh.material) {
            const mat = new THREE.MeshStandardMaterial({
              map: colormap,
              color: new THREE.Color(color),
              metalness: 0.35,
              roughness: 0.5,
            });
            mesh.material = mat;
          }
          mesh.castShadow = true;
          mesh.receiveShadow = true;
        }
      });

      return clone;
    }, [scene, color, colormap]);

    return (
      <group ref={ref}>
        <primitive
          object={cloned}
          scale={[1.6, 1.6, 1.6]}
        />
      </group>
    );
  },
);

useGLTF.preload('/models/sedan-sports.glb');
