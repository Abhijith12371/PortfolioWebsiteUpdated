import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Bvh, Sparkles, Stars, useGLTF } from '@react-three/drei'
import { RigidBody, CuboidCollider, TrimeshCollider } from '@react-three/rapier'
import * as THREE from 'three'
import Fire from './Fire'
import { groundAt, useArena, world } from './arena'
import { useGame } from './store'
import { guardian } from './content'
import { Label, fadeLabel, useRuneTexture } from './Zones'
if (import.meta.env.DEV) window.__groundAt = groundAt

const FLAME = new THREE.Color(7, 3.4, 1.1)

/* ───────────────────────── arena ───────────────────────── */

/** World-space triangle soup of the arena, for an exact physics collider.
 *  (Built by hand because the compressed/quantized mesh carries its own node scale.) */
function useArenaTrimesh(scene) {
  return useMemo(() => {
    scene.updateMatrixWorld(true)
    const verts = []
    const idx = []
    const v = new THREE.Vector3()
    scene.traverse((o) => {
      if (!o.isMesh) return
      const pos = o.geometry.attributes.position
      const base = verts.length / 3
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld)
        verts.push(v.x, v.y, v.z)
      }
      const index = o.geometry.index
      if (index) for (let i = 0; i < index.count; i++) idx.push(base + index.getX(i))
      else for (let i = 0; i < pos.count; i++) idx.push(base + i)
    })
    return [new Float32Array(verts), new Uint32Array(idx)]
  }, [scene])
}

function Arena() {
  const scene = useArena()
  const [vertices, indices] = useArenaTrimesh(scene)
  return (
    <>
      <Bvh firstHitOnly>
        <primitive object={scene} />
      </Bvh>
      <RigidBody type="fixed" colliders={false}>
        <TrimeshCollider args={[vertices, indices]} />
      </RigidBody>
    </>
  )
}

/* ───────────────────── pillars with torches ───────────────────── */

const PILLAR_SCALE = 5      // ~4.9 m tall, ~2.2 m wide
const TORCH_SCALE = 1.5
// angles measured from +Z (the arena entrance) — the open front is left clear
const PILLAR_ANGLES = [62, 96, 130, 230, 264, 298].map((d) => THREE.MathUtils.degToRad(d))
const PILLAR_RADIUS = 14

function TorchLight({ position, phase }) {
  const light = useRef()
  useFrame(({ clock }) => {
    const t = clock.elapsedTime * 9 + phase
    if (light.current) light.current.intensity = 42 * (0.84 + 0.1 * Math.sin(t) + 0.08 * Math.sin(t * 2.3 + 1.7))
  })
  return <pointLight ref={light} position={position} color="#ff9a45" intensity={42} distance={22} decay={2} />
}

function PillarWithTorch({ angle, index }) {
  const pillar = useGLTF('/models/pillar.glb').scene
  const torch = useGLTF('/models/torch.glb').scene
  const p = useMemo(() => pillar.clone(), [pillar])
  const t = useMemo(() => torch.clone(), [torch])
  useMemo(() => {
    for (const o of [p, t]) o.traverse((m) => m.isMesh && (m.castShadow = m.receiveShadow = true))
  }, [p, t])

  const x = Math.sin(angle) * PILLAR_RADIUS
  const z = Math.cos(angle) * PILLAR_RADIUS
  const y = groundAt(x, z)
  // torch hangs on the face of the pillar that looks at the arena centre;
  // the torch model's wall plate is on its +X side, so +X must point outward
  const half = 0.217 * PILLAR_SCALE
  const torchDist = PILLAR_RADIUS - half - 0.45 * TORCH_SCALE + 0.05
  const tx = Math.sin(angle) * torchDist
  const tz = Math.cos(angle) * torchDist
  const ty = y + 2.2
  const rotY = angle - Math.PI / 2
  // the fire bowl sits at about (-0.18, 0.93, 0.09) in torch model space
  const bowl = new THREE.Vector3(-0.18, 0.93, 0.09).multiplyScalar(TORCH_SCALE).applyAxisAngle(new THREE.Vector3(0, 1, 0), rotY)

  return (
    <>
      <RigidBody type="fixed" colliders={false} position={[x, y, z]} rotation={[0, angle, 0]}>
        <primitive object={p} scale={PILLAR_SCALE} />
        <CuboidCollider args={[half, 2.45, half]} position={[0, 2.45, 0]} />
      </RigidBody>
      <group position={[tx, ty, tz]} rotation={[0, rotY, 0]}>
        <primitive object={t} scale={TORCH_SCALE} />
      </group>
      <Fire position={[tx + bowl.x, ty + bowl.y - 0.05, tz + bowl.z]} scale={1.3} />
      <TorchLight position={[tx + bowl.x * 1.6, ty + bowl.y + 0.6, tz + bowl.z * 1.6]} phase={index * 1.7} />
    </>
  )
}

/* ───────────────────────── characters & props ───────────────────────── */

function DarkWizard() {
  const high = useGame((s) => s.quality === 'high')
  const near = useGame((s) => s.near === guardian.id)
  const { scene } = useGLTF('/models/dark_wizard.glb')
  const runes = useRuneTexture()
  const ref = useRef()
  const shieldRef = useRef()
  const circleRef = useRef()
  const labelRef = useRef()
  const floorY = useMemo(() => groundAt(0, -12), [])
  const base = useMemo(() => {
    scene.traverse((m) => m.isMesh && (m.castShadow = true))
    return new THREE.Vector3(0, floorY + 0.7, -12)
  }, [scene, floorY])

  useFrame(({ clock, camera }, dt) => {
    if (!ref.current) return
    const t = clock.elapsedTime
    ref.current.position.y = base.y + Math.sin(t * 0.8) * 0.18
    // slowly turn to watch the player
    const target = Math.atan2(camera.position.x - base.x, camera.position.z - base.z)
    let d = target - ref.current.rotation.y
    d = Math.atan2(Math.sin(d), Math.cos(d))
    ref.current.rotation.y += d * 0.02

    fadeLabel(labelRef.current, camera, base)

    if (circleRef.current) {
      circleRef.current.rotation.z -= dt * (near ? 0.55 : 0.18)
    }

    if (shieldRef.current) {
      if (world.darkShieldPulse > 0) {
        world.darkShieldPulse = Math.max(0, world.darkShieldPulse - dt * 2.2)
      }
      const p = world.darkShieldPulse
      shieldRef.current.visible = p > 0.01
      const s = 1.9 + p * 0.45
      shieldRef.current.scale.setScalar(s)
      shieldRef.current.material.opacity = p * 0.45
    }
  })

  const spotTarget = useMemo(() => {
    const o = new THREE.Object3D()
    o.position.set(base.x, base.y + 1.2, base.z)
    return o
  }, [base])

  return (
    <group>
      {/* Crimson Rune Seal beneath the Dark Archmage */}
      <mesh ref={circleRef} rotation={[-Math.PI / 2, 0, 0]} position={[base.x, floorY + 0.05, base.z]}>
        <planeGeometry args={[5.4, 5.4]} />
        <meshBasicMaterial
          map={runes}
          color={new THREE.Color('#ff2a4b').multiplyScalar(2.4)}
          transparent
          toneMapped={false}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>

      <group ref={ref} position={base}>
        <primitive object={scene} scale={2.6} />
      </group>

      {/* Reactive Arcane Shield Sphere when struck by spells */}
      <mesh ref={shieldRef} position={[base.x, base.y + 1.1, base.z]} visible={false}>
        <icosahedronGeometry args={[1, 2]} />
        <meshBasicMaterial
          color={new THREE.Color('#ff3355').multiplyScalar(3.2)}
          wireframe
          transparent
          opacity={0}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </mesh>

      <group position={[base.x, base.y + 3.2, base.z]}>
        <Label item={guardian} near={near} discovered={false} labelRef={labelRef} y={0} />
      </group>

      {/* cold key light from above-front so he reads clearly in the dark */}
      <primitive object={spotTarget} />
      <spotLight
        position={[base.x, base.y + 11, base.z + 6]}
        target={spotTarget}
        color="#9fb0ff"
        intensity={260}
        angle={0.32}
        penumbra={0.7}
        distance={22}
        decay={2}
        castShadow={high}
        shadow-mapSize={[1024, 1024]}
      />
      {/* red under-glow in front, violet rim behind */}
      <pointLight position={[base.x, base.y + 0.6, base.z + 1.6]} color="#ff2a3c" intensity={24} distance={9} decay={2} />
      <pointLight position={[base.x, base.y + 3.5, base.z - 1.6]} color="#7a4cff" intensity={45} distance={9} decay={2} />
      <Sparkles count={70} scale={[3.5, 4, 3.5]} position={[base.x, base.y + 1.8, base.z]} size={5} speed={0.35} color="#ff3355" opacity={0.7} />
    </group>
  )
}

const BROOM_ITEM = {
  id: 'broom',
  subtitle: 'Flight Mount',
  title: 'Nimbus Broomstick',
  color: '#ffd54a',
}

function Broom() {
  const { scene } = useGLTF('/models/broom.glb')
  const mounted = useGame((s) => s.mounted)
  const near = useGame((s) => s.near === 'broom')
  const ref = useRef()
  const labelRef = useRef()
  const base = useMemo(() => {
    scene.traverse((m) => m.isMesh && (m.castShadow = true))
    return new THREE.Vector3(-5, groundAt(-5, 10) + 0.9, 10)
  }, [scene])
  useFrame(({ clock, camera }) => {
    if (!ref.current) return
    const t = clock.elapsedTime
    ref.current.position.y = base.y + Math.sin(t * 1.4) * 0.14
    ref.current.rotation.z = Math.sin(t * 1.1) * 0.06
    ref.current.rotation.x = Math.sin(t * 0.9) * 0.04
    world.broom.copy(ref.current.position)
    fadeLabel(labelRef.current, camera, ref.current.position)
  })
  if (mounted) return null
  return (
    <group ref={ref} position={base} rotation-y={0.6}>
      <primitive object={scene} scale={1.7} position={[0, -0.25, 0]} />
      <pointLight color="#ffd54a" intensity={near ? 14 : 5} distance={5} decay={2} />
      <Sparkles count={18} scale={[1.8, 0.8, 0.8]} size={3} speed={0.5} color="#ffe6a8" />
      <Label item={BROOM_ITEM} near={near} discovered={false} labelRef={labelRef} y={1.1} />
    </group>
  )
}

function FloatingCandles({ count = 110 }) {
  const candles = useRef()
  const flames = useRef()
  const data = useMemo(() => {
    const out = []
    while (out.length < count) {
      const r = 3 + Math.random() * 11
      const a = Math.random() * Math.PI * 2
      out.push({ x: Math.sin(a) * r, z: Math.cos(a) * r, y: 9 + Math.random() * 7, s: 0.5 + Math.random(), p: Math.random() * 6.28 })
    }
    return out
  }, [count])
  const dummy = useMemo(() => new THREE.Object3D(), [])
  useFrame(({ clock }) => {
    if (!candles.current || !flames.current) return
    const t = clock.elapsedTime
    data.forEach((d, i) => {
      const y = d.y + Math.sin(t * d.s + d.p) * 0.3
      dummy.position.set(d.x, y, d.z)
      dummy.scale.setScalar(1)
      dummy.updateMatrix()
      candles.current.setMatrixAt(i, dummy.matrix)
      dummy.position.y = y + 0.27
      const f = 0.85 + Math.sin(t * 13 + d.p * 7) * 0.15
      dummy.scale.set(f, f * 1.4, f)
      dummy.updateMatrix()
      flames.current.setMatrixAt(i, dummy.matrix)
    })
    candles.current.instanceMatrix.needsUpdate = true
    flames.current.instanceMatrix.needsUpdate = true
  })
  return (
    <>
      <instancedMesh ref={candles} args={[null, null, count]} frustumCulled={false}>
        <cylinderGeometry args={[0.05, 0.055, 0.42, 8]} />
        <meshStandardMaterial color="#efe4c8" roughness={0.6} emissive="#ffcf8a" emissiveIntensity={0.2} />
      </instancedMesh>
      <instancedMesh ref={flames} args={[null, null, count]} frustumCulled={false}>
        <sphereGeometry args={[0.055, 8, 8]} />
        <meshBasicMaterial color={FLAME} toneMapped={false} />
      </instancedMesh>
    </>
  )
}

function Mountains() {
  const peaks = useMemo(() => {
    const out = []
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * Math.PI * 2 + Math.random() * 0.2
      const r = 160 + Math.random() * 60
      out.push({ pos: [Math.sin(a) * r, 0, Math.cos(a) * r], h: 45 + Math.random() * 60, w: 35 + Math.random() * 30 })
    }
    return out
  }, [])
  return peaks.map((p, i) => (
    <mesh key={i} position={[p.pos[0], p.h / 2 - 3, p.pos[2]]}>
      <coneGeometry args={[p.w, p.h, 7]} />
      <meshStandardMaterial color="#121826" roughness={1} flatShading />
    </mesh>
  ))
}

/* ───────────────────────── world ───────────────────────── */

export default function World() {
  const high = useGame((s) => s.quality === 'high')
  return (
    <>
      <color attach="background" args={['#060915']} />
      <fogExp2 attach="fog" args={['#0a1022', 0.012]} />
      <Stars radius={260} depth={60} count={high ? 7000 : 2500} factor={6} saturation={0} fade speed={0.4} />
      <mesh position={[-70, 110, -150]}>
        <sphereGeometry args={[8, 32, 32]} />
        <meshBasicMaterial color={new THREE.Color(2.6, 2.6, 2.3)} toneMapped={false} fog={false} />
      </mesh>

      <Arena />
      {/* ground outside the arena opening */}
      <mesh rotation-x={-Math.PI / 2} position={[0, -0.6, 0]} receiveShadow>
        <planeGeometry args={[700, 700]} />
        <meshStandardMaterial color="#0e140f" roughness={1} />
      </mesh>
      <RigidBody type="fixed" colliders={false}>
        <CuboidCollider args={[200, 0.5, 200]} position={[0, -1.1, 0]} />
      </RigidBody>

      {PILLAR_ANGLES.map((a, i) => (
        <PillarWithTorch key={i} angle={a} index={i} />
      ))}
      <DarkWizard />
      <Broom />
      <FloatingCandles count={high ? 110 : 60} />
      <Sparkles count={160} scale={[30, 10, 30]} position={[0, 5, 0]} size={2.5} speed={0.25} color="#ffd9a0" opacity={0.55} />
      <Mountains />
    </>
  )
}
