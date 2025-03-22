import { useEffect, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useGLTF, OrbitControls, PerspectiveCamera } from '@react-three/drei';
import * as THREE from 'three';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

function WalkingSteveCanvas({ scrollProgress }) {
  const group = useRef<THREE.Group>(new THREE.Group());
  const { scene, animations } = useGLTF('/models/steve/scene.gltf');
  const { camera } = useThree();
  const mixer = useRef(new THREE.AnimationMixer(scene));
  const [, setAnimation] = useState(null);

  useEffect(() => {
    if (scene) {
      const model = scene.clone();

      model.position.set(0, 0, 0);
      model.scale.set(0.5, 0.5, 0.5);

      group.current.clear();
      group.current.add(model);

      if (animations && animations.length > 0) {
        const walkAnimation = mixer.current.clipAction(animations[0]);
        walkAnimation.play();
        setAnimation(walkAnimation);
      }

      camera.position.set(0, 1, 5);
      camera.lookAt(0, 1, 0);
    }
  }, [scene, animations, camera]);

  useFrame((_, delta) => {
    if (mixer.current) {
      mixer.current.update(delta);
    }

    if (group.current) {
      const xPosition = -10 + scrollProgress * 20;
      group.current.position.x = xPosition;

      if (xPosition > group.current.position.x) {
        group.current.rotation.y = Math.PI / 2;
      } else {
        group.current.rotation.y = -Math.PI / 2;
      }
    }
  });

  return <group ref={group} />;
}

export default function WalkingSteve() {
  const containerRef = useRef(null);
  const [scrollProgress, setScrollProgress] = useState(0);

  useEffect(() => {
    const container = containerRef.current;

    const trigger = ScrollTrigger.create({
      trigger: container,
      start: 'top top',
      end: 'bottom bottom',
      scrub: true,
      onUpdate: (self) => {
        setScrollProgress(self.progress);
      }
    });

    return () => {
      trigger.kill();
    };
  }, []);

  return (
      <div
          ref={containerRef}
          className="h-[300vh] w-full relative"
      >
        <div className="sticky top-0 h-screen w-full">
          <Canvas>
            <ambientLight intensity={0.5} />
            <directionalLight position={[10, 10, 5]} intensity={1} />
            <WalkingSteveCanvas scrollProgress={scrollProgress} />
            <PerspectiveCamera makeDefault position={[0, 1, 5]} />
            <OrbitControls enableZoom={false} enablePan={false} />
          </Canvas>
        </div>
      </div>
  );
}