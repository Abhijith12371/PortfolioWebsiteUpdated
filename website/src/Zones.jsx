import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Center, Html, Sparkles, useGLTF } from '@react-three/drei'
import { RigidBody, CuboidCollider } from '@react-three/rapier'
import * as THREE from 'three'
import { contact, zones } from './content'
import { useGame } from './store'
import { groundAt, world } from './arena'

const PEDESTAL_SCALE = 1.4 // the stone pillar model, scaled down to a ~1.4 m pedestal
const _ndc = new THREE.Vector3()

/** Glowing rune circle drawn on a canvas */
export function useRuneTexture() {
  return useMemo(() => {
    const size = 512
    const c = document.createElement('canvas')
    c.width = c.height = size
    const ctx = c.getContext('2d')
    const mid = size / 2
    ctx.strokeStyle = '#fff'
    ctx.fillStyle = '#fff'
    ctx.lineWidth = 6
    for (const r of [240, 215, 120]) {
      ctx.beginPath(); ctx.arc(mid, mid, r, 0, Math.PI * 2); ctx.stroke()
    }
    ctx.lineWidth = 3
    ctx.beginPath()
    for (let i = 0; i <= 7; i++) {
      const a = (i * 3 * Math.PI * 2) / 7 - Math.PI / 2
      const x = mid + Math.cos(a) * 205
      const y = mid + Math.sin(a) * 205
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)
    }
    ctx.stroke()
    ctx.font = 'bold 22px serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    const glyphs = 'ᚠᚢᚦᚨᚱᚲᚷᚹᚺᚾᛁᛃᛇᛈᛉᛊᛏᛒᛖᛗᛚᛜᛞᛟ'
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2
      ctx.save()
      ctx.translate(mid + Math.cos(a) * 228, mid + Math.sin(a) * 228)
      ctx.rotate(a + Math.PI / 2)
      ctx.fillText(glyphs[i % glyphs.length], 0, 0)
      ctx.restore()
    }
    const tex = new THREE.CanvasTexture(c)
    tex.colorSpace = THREE.SRGBColorSpace
    return tex
  }, [])
}

export function Label({ item, near, discovered, labelRef, y }) {
  return (
    <Html position={[0, y, 0]} center distanceFactor={8} zIndexRange={[10, 0]} style={{ pointerEvents: 'none' }}>
      <div
        ref={labelRef}
        className={`zone-label ${near ? 'is-near' : ''} ${discovered ? 'is-discovered' : ''}`}
        style={{ '--c': item.color, opacity: 0 }}
      >
        <div className="zone-label__meta">
          {item.numeral && <span className="zone-label__num">RELIC {item.numeral}</span>}
          {discovered && <span className="zone-label__check">✦ AWAKENED</span>}
        </div>
        <div className="zone-label__sub">{item.subtitle}</div>
        <div className="zone-label__title">{item.title}</div>
      </div>
    </Html>
  )
}

export function fadeLabel(label, camera, pos) {
  if (!label) return
  if (useGame.getState().phase !== 'playing') { label.style.opacity = '0'; return }
  const d = camera.position.distanceTo(pos)
  const far = THREE.MathUtils.clamp((22 - d) / 6, 0, 1)
  const close = THREE.MathUtils.clamp((d - 3.6) / 2.2, 0, 1)
  label.style.opacity = String(far * close)
}

function Zone({ zone, runes }) {
  const circle = useRef()
  const artifact = useRef()
  const glow = useRef()
  const spot = useRef()
  const label = useRef()
  const dismissedAfterClose = useRef(false)
  const wasOpen = useRef(false)

  const near = useGame((s) => s.near === zone.id)
  const isOpen = useGame((s) => s.open === zone.id)
  const discovered = useGame((s) => s.discovered.includes(zone.id))
  const high = useGame((s) => s.quality === 'high')
  const color = useMemo(() => new THREE.Color(zone.color), [zone.color])
  const hot = useMemo(() => color.clone().multiplyScalar(2.6), [color])

  useEffect(() => {
    if (isOpen) {
      wasOpen.current = true
      dismissedAfterClose.current = false
    } else if (wasOpen.current) {
      wasOpen.current = false
      dismissedAfterClose.current = true
    }
  }, [isOpen])

  useEffect(() => {
    if (!near) dismissedAfterClose.current = false
  }, [near])

  const pillar = useGLTF('/models/pillar.glb').scene
  const model = useGLTF(`/models/${zone.model}.glb`).scene
  const pedestal = useMemo(() => pillar.clone(), [pillar])
  useMemo(() => {
    pedestal.traverse((m) => m.isMesh && (m.castShadow = m.receiveShadow = true))
    model.traverse((m) => m.isMesh && (m.castShadow = true))
  }, [pedestal, model])

  const [x, , z] = zone.position
  const y = useMemo(() => groundAt(x, z), [x, z])
  const top = 0.978 * PEDESTAL_SCALE
  const pos = useMemo(() => new THREE.Vector3(x, y, z), [x, y, z])
  const spotTarget = useMemo(() => {
    const o = new THREE.Object3D()
    o.position.set(0, top + 0.6, 0)
    return o
  }, [top])

  useFrame(({ clock, camera }, dt) => {
    const t = clock.elapsedTime
    fadeLabel(label.current, camera, pos)

    const spellBoost = world.relicPulse[zone.id] || 0
    if (spellBoost > 0) {
      world.relicPulse[zone.id] = Math.max(0, spellBoost - dt * 1.6)
    }

    const highlighted = (near && !dismissedAfterClose.current) || isOpen

    if (circle.current) {
      circle.current.rotation.z += dt * (highlighted ? 0.55 : 0.16) + spellBoost * dt * 2
      const m = circle.current.material
      const targetK = (highlighted ? 2.8 : discovered ? 1.85 : 1.45) + spellBoost * 2.5
      m.userData.k = THREE.MathUtils.lerp(m.userData.k ?? 1.45, targetK, 0.1)
      m.color.copy(color).multiplyScalar(m.userData.k)
    }
    if (artifact.current) {
      artifact.current.position.y = top + 1.0 + Math.sin(t * 1.5) * 0.11
      artifact.current.rotation.y += dt * (highlighted ? 1.05 : 0.42) + spellBoost * dt * 2.5
    }
    if (glow.current) {
      const targetGlow = (highlighted ? 22 : discovered ? 14 : 11) + Math.sin(t * 2.6) * 1.5 + spellBoost * 24
      glow.current.intensity = THREE.MathUtils.lerp(glow.current.intensity, targetGlow, 0.1)
    }
    if (spot.current) {
      const targetSpot = (highlighted ? 36 : 0) + spellBoost * 45
      spot.current.intensity = THREE.MathUtils.lerp(spot.current.intensity, targetSpot, 0.12)
    }
  })

  return (
    <group position={pos}>
      <mesh ref={circle} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.04, 0]}>
        <planeGeometry args={[4.8, 4.8]} />
        <meshBasicMaterial map={runes} color={hot} transparent toneMapped={false} depthWrite={false} blending={THREE.AdditiveBlending} />
      </mesh>

      <RigidBody type="fixed" colliders={false}>
        <primitive object={pedestal} scale={PEDESTAL_SCALE} />
        <CuboidCollider args={[0.3, top / 2, 0.3]} position={[0, top / 2, 0]} />
      </RigidBody>

      <group ref={artifact} position={[0, top + 1, 0]}>
        <group rotation={zone.tilt}>
          <Center>
            <primitive object={model} scale={zone.scale} />
          </Center>
        </group>
      </group>

      <primitive object={spotTarget} />
      {/* Always keep the warm artifact pointLight active so pedestals illuminate the stone floor */}
      <pointLight ref={glow} position={[0, top + 1.45, 0.35]} color={zone.color} intensity={11} distance={8.5} decay={2} />
      {high && (
        <spotLight
          ref={spot}
          position={[0, top + 4.8, 0.6]}
          target={spotTarget}
          color={zone.color}
          intensity={0}
          angle={0.48}
          penumbra={1}
          distance={8.5}
          decay={2}
        />
      )}
      <Sparkles count={32} scale={[2.6, 3.0, 2.6]} position={[0, top + 0.9, 0]} size={3.4} speed={0.45} color={zone.color} opacity={0.8} />
      <Label item={zone} near={near} discovered={discovered} labelRef={label} y={top + 2.35} />
    </group>
  )
}

/** The golden orb: flies loops around the arena; catch it to open Contact. */
function GoldenOrb() {
  const { scene } = useGLTF('/models/golden_orb.glb')
  const ref = useRef()
  const body = useRef()
  const label = useRef()
  const near = useGame((s) => s.near === contact.id)
  const caught = useGame((s) => s.open === contact.id)
  const discovered = useGame((s) => s.discovered.includes(contact.id))
  const base = useMemo(() => groundAt(0, 0) + 2.1, [])
  const clock = useRef(0)
  const prev = useMemo(() => new THREE.Vector3(), [])

  useMemo(() => scene.traverse((m) => m.isMesh && (m.castShadow = true)), [scene])

  useFrame(({ camera }, dt) => {
    if (!ref.current) return
    clock.current += dt * (caught ? 0 : near ? 0.2 : 1)
    const t = clock.current
    const x = Math.sin(t * 0.32) * 8.5
    const z = 1.5 + Math.sin(t * 0.64) * 6
    const y = base + Math.sin(t * 1.3) * 0.5 + Math.max(0, Math.sin(t * 0.21)) * 1.2
    prev.copy(ref.current.position)
    ref.current.position.set(x, y, z)
    world.orb.set(x, y, z)
    const vx = x - prev.x
    const vz = z - prev.z
    if (Math.abs(vx) + Math.abs(vz) > 1e-4) ref.current.rotation.y = Math.atan2(vx, vz)
    if (body.current) {
      body.current.rotation.z = Math.sin(performance.now() * 0.03) * 0.12
      body.current.position.y = Math.sin(performance.now() * 0.015) * 0.05
    }
    fadeLabel(label.current, camera, ref.current.position)
  })

  return (
    <group ref={ref}>
      <group ref={body}>
        <Center>
          <primitive object={scene} scale={0.55} />
        </Center>
      </group>
      <pointLight color="#ffcc55" intensity={near ? 18 : 10} distance={7} decay={2} />
      <Sparkles count={26} scale={[1.6, 1, 1.6]} size={3.2} speed={1.2} color="#ffd86b" />
      <Label item={contact} near={near} discovered={discovered} labelRef={label} y={1.1} />
    </group>
  )
}

export default function Zones() {
  const runes = useRuneTexture()
  return (
    <>
      {zones.map((z) => <Zone key={z.id} zone={z} runes={runes} />)}
      <GoldenOrb />
    </>
  )
}
