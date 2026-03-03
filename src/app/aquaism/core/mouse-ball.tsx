"use client";

import { useThree, useFrame } from "@react-three/fiber";
import { RapierRigidBody, RigidBody, BallCollider } from "@react-three/rapier";
import React, { useRef, useState, useMemo } from "react";
import * as THREE from "three";

const MouseBall: React.FC = () => {
  const ref = useRef<RapierRigidBody>(null);
  const meshRef = useRef<THREE.Mesh>(null);
  const mouseSize = 0.25;
  const { camera, pointer } = useThree();
  const [mousePos] = useState(() => new THREE.Vector3(0, 0, 0));
  const [raycaster] = useState(() => new THREE.Raycaster());
  const mousePlaneRef = useRef<THREE.Mesh>(null);
  
  useFrame(() => {
    if (ref.current && meshRef.current && mousePlaneRef.current) {
      const cameraDirection = new THREE.Vector3();
      camera.getWorldDirection(cameraDirection);
      cameraDirection.multiplyScalar(-1);
      mousePlaneRef.current.lookAt(cameraDirection);
      mousePlaneRef.current.position.set(0, 0, 0.2);

      raycaster.setFromCamera(pointer, camera);
      const intersects = raycaster.intersectObject(mousePlaneRef.current, false);
      
      if (intersects.length > 0) {
        mousePos.copy(intersects[0].point);
        ref.current.setTranslation({ x: mousePos.x, y: mousePos.y, z: mousePos.z }, true);
        meshRef.current.position.copy(mousePos);
      }
    }
  });

  const mouseGeometry = useMemo(() => 
    new THREE.IcosahedronGeometry(mouseSize, 3),
    [mouseSize]
  );

  return (
    <>
      <mesh ref={mousePlaneRef} visible={false}>
        <planeGeometry args={[48, 48, 1, 1]} />
        <meshBasicMaterial transparent opacity={0} />
      </mesh>
      
      <RigidBody 
        ref={ref} 
        type="kinematicPosition"
        colliders={false}
        position={[0, 0, 0]}
      >
        <BallCollider args={[mouseSize * 6.0]} />
      </RigidBody>
      
      <mesh ref={meshRef} geometry={mouseGeometry} visible={false}>
        <meshStandardMaterial 
          color={0xffffff} 
          emissive={0xffffff}
          emissiveIntensity={1}
        />
      </mesh>
    </>
  );
};

export default MouseBall;