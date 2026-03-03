"use client";

import { useFrame } from "@react-three/fiber";
import { RapierRigidBody, RigidBody, BallCollider } from "@react-three/rapier";
import React, { useRef } from "react";
import * as THREE from "three";

const META_OFFSET = new THREE.Vector3(0.5, 0.5, 0.5);
const SCENE_MIDDLE = new THREE.Vector3(0, 0, 0);

const PhysicsBody: React.FC<{ 
  initialPosition: [number, number, number];
  updatePosition: (pos: THREE.Vector3) => void;
}> = ({ initialPosition, updatePosition }) => {
  const ref = useRef<RapierRigidBody>(null);
  const size = 0.2;
  const density = 0.5;

  useFrame(() => {
    if (ref.current) {
      const pos = ref.current.translation();
      const position = new THREE.Vector3(pos.x, pos.y, pos.z);
      
      ref.current.resetForces(true);
      const dir = position.clone().sub(SCENE_MIDDLE).normalize();
      ref.current.addForce(dir.multiplyScalar(-0.5), true);
      
      const metaballPos = position.clone().multiplyScalar(0.1).add(META_OFFSET);
      updatePosition(metaballPos);
    }
  });

  return (
    <RigidBody 
      ref={ref} 
      position={initialPosition}
      colliders={false}
      linearDamping={2.0}
      angularDamping={1.0}
      ccd={false}
    >
      <BallCollider args={[size]} density={density} restitution={0.1} friction={1.0} />
    </RigidBody>
  );
};

export default PhysicsBody;