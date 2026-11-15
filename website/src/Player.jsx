import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Sparkles, useGLTF, useAnimations, useKeyboardControls } from '@react-three/drei'
import { RigidBody, CapsuleCollider } from '@react-three/rapier'
import * as THREE from 'three'
import { useGame } from './store'
import { contact, guardian, zones } from './content'
import { PLAY_RADIUS, arenaHitDistance, groundAt, useArena, world } from './arena'
import { sound } from './sound'

const RUN_SPEED = 4.8      // default movement uses the Run animation
const SPRINT_SPEED = 7.2   // hold Shift
const BROOM_SPEED = 8.6    // flying on the Nimbus broomstick
const BROOM_BOOST = 12.2   // Shift while flying
const MODEL_SCALE = 1.85   // the wizard is ~0.98 units tall → ~1.8 m
const INTERACT_RADIUS = 3.3
const CATCH_RADIUS = 3.1
const SPAWN = [0, 8]

const _dir = new THREE.Vector3()
const _target = new THREE.Vector3()
const _camPos = new THREE.Vector3()
const _camDir = new THREE.Vector3()
const _lookBlend = new THREE.Vector3()
const ENTER_DURATION = 3.2 // seconds for the dive from the title shot to the player

const SPELL_COLORS = ['#7fb2ff', '#ffcf7a', '#5cff9d', '#c48cff', '#ff5e7e']

/** Renders active wand spell bolts and impact bursts in 3D space */
function SpellProjectiles() {
  const boltRefs = useRef([])
  const lightRefs = useRef([])
  const burstRefs = useRef([])
  const maxBolts = 6
  const maxBursts = 4

  useFrame((_, dt) => {
    const step = Math.min(dt, 0.05)

    // Update active spell bolts
    for (let i = world.spells.length - 1; i >= 0; i--) {
      const s = world.spells[i]
      s.age += step
      s.pos.addScaledVector(s.vel, step)

      // Check collision with Pedestal Relics
      for (const z of zones) {
        const dx = s.pos.x - z.position[0]
        const dz = s.pos.z - z.position[2]
        if (Math.hypot(dx, dz) < 1.65 && Math.abs(s.pos.y - 2.0) < 2.2) {
          s.age = 99
          world.relicPulse[z.id] = 1.0
          world.bursts.push({ pos: s.pos.clone(), age: 0, color: z.color })
          sound.playSpellHit(false)
          useGame.getState().showBanner(
            `${z.title.toUpperCase()} RESONATES`,
            `Your spell charges the ${z.subtitle} relic! Press [E] near it to inspect.`,
            z.color,
          )
          break
        }
      }

      // Check collision with the Dark Archmage at [0, y, -12]
      const dwDist = Math.hypot(s.pos.x - 0, s.pos.z - -12)
      if (s.age < 90 && dwDist < 2.1 && s.pos.y > 0.2 && s.pos.y < 4.5) {
        s.age = 99
        world.darkShieldPulse = 1.35
        world.bursts.push({ pos: s.pos.clone(), age: 0, color: '#ff3355' })
        sound.playSpellHit(true)
        useGame.getState().registerDuelHit()
      }

      // Check collision with the flying Golden Orb
      const orbDist = s.pos.distanceTo(world.orb)
      if (s.age < 90 && orbDist < 1.8) {
        s.age = 99
        world.bursts.push({ pos: world.orb.clone(), age: 0, color: '#ffd54a' })
        sound.playSpellHit(false)
        useGame.getState().openZone(contact.id)
        document.exitPointerLock?.()
      }

      // Expire at arena boundary or timeout
      if (s.age > 1.6 || Math.hypot(s.pos.x, s.pos.z) > PLAY_RADIUS + 4) {
        world.spells.splice(i, 1)
      }
    }

    // Update impact bursts
    for (let i = world.bursts.length - 1; i >= 0; i--) {
      world.bursts[i].age += step
      if (world.bursts[i].age > 0.55) world.bursts.splice(i, 1)
    }

    // Sync mesh & light refs
    for (let i = 0; i < maxBolts; i++) {
      const mesh = boltRefs.current[i]
      const light = lightRefs.current[i]
      const s = world.spells[i]
      if (!mesh) continue
      if (s) {
        mesh.visible = true
        mesh.position.copy(s.pos)
        const pulse = 1 + Math.sin(s.age * 45) * 0.25
        mesh.scale.setScalar(pulse)
        mesh.material.color.set(s.color).multiplyScalar(3.5)
        if (light) {
          light.visible = true
          light.position.copy(s.pos)
          light.color.set(s.color)
          light.intensity = 18
        }
      } else {
        mesh.visible = false
        if (light) light.visible = false
      }
    }

    for (let i = 0; i < maxBursts; i++) {
      const bMesh = burstRefs.current[i]
      const b = world.bursts[i]
      if (!bMesh) continue
      if (b) {
        bMesh.visible = true
        bMesh.position.copy(b.pos)
        const k = b.age / 0.55
        bMesh.scale.setScalar(0.4 + k * 3.8)
        bMesh.material.opacity = (1 - k) * 0.75
        bMesh.material.color.set(b.color).multiplyScalar(2.8)
      } else {
        bMesh.visible = false
      }
    }
  })

  return (
    <group>
      {Array.from({ length: maxBolts }, (_, i) => (
        <group key={`bolt-${i}`}>
          <mesh ref={(el) => (boltRefs.current[i] = el)} visible={false}>
            <sphereGeometry args={[0.18, 12, 12]} />
            <meshBasicMaterial toneMapped={false} />
          </mesh>
          <pointLight ref={(el) => (lightRefs.current[i] = el)} visible={false} distance={7} decay={2} />
        </group>
      ))}
      {Array.from({ length: maxBursts }, (_, i) => (
        <mesh key={`burst-${i}`} ref={(el) => (burstRefs.current[i] = el)} visible={false}>
          <sphereGeometry args={[0.45, 16, 16]} />
          <meshBasicMaterial transparent depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
        </mesh>
      ))}
    </group>
  )
}

export default function Player() {
  const body = useRef()
  const model = useRef()
  const wandLight = useRef()
  useArena()
  const { scene, animations } = useGLTF('/models/wizard.glb')
  const broomScene = useGLTF('/models/broom.glb').scene
  const playerBroom = useMemo(() => broomScene.clone(), [broomScene])
  const { actions, mixer } = useAnimations(animations, model)
  const [, getKeys] = useKeyboardControls()
  const { camera, gl } = useThree()
  const spawnY = useMemo(() => groundAt(SPAWN[0], SPAWN[1]) + 1.3, [])
  const mounted = useGame((s) => s.mounted)

  // third-person orbit camera state
  const cam = useRef({ yaw: 0, pitch: 0.3, dist: 6.5, look: new THREE.Vector3(SPAWN[0], spawnY + 0.4, SPAWN[1]) })
  const cinematic = useRef({
    time: 0,
    start: null,
    pos: new THREE.Vector3(),
    look: new THREE.Vector3(),
    fromPos: new THREE.Vector3(),
    fromLook: new THREE.Vector3(),
  })
  const anim = useRef('Idle')
  const facing = useRef(Math.PI) // start facing into the arena (-Z)
  const stepTimer = useRef(0)
  const jumpCooldown = useRef(0)
  const spellCooldown = useRef(0)
  const wandFlash = useRef(0)
  const lastTeleportTs = useRef(0)

  const { bones, baseQuats, basePos } = useMemo(() => {
    const found = {}
    const quats = {}
    const pos = {}
    const idleClip = animations.find((a) => a.name === 'Idle')
    let tempMixer = null
    if (idleClip) {
      tempMixer = new THREE.AnimationMixer(scene)
      tempMixer.clipAction(idleClip).play()
      tempMixer.update(0)
    }
    scene.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true
        o.receiveShadow = true
        if (o.material) o.material.envMapIntensity = 0.8
      }
      if (o.isBone && o.name) {
        const key = o.name.replace(/\./g, '')
        found[key] = o
        quats[key] = o.quaternion.clone()
        pos[key] = o.position.clone()
      }
    })
    if (tempMixer) tempMixer.stopAllAction()
    return { bones: found, baseQuats: quats, basePos: pos }
  }, [scene, animations])

  useEffect(() => {
    if (!useGame.getState().mounted) {
      actions.Idle?.reset().fadeIn(0.3).play()
    }
  }, [actions])

  // Cast an Arcane Spell Bolt from the wizard's wand toward where the camera/wizard aims
  const castSpell = () => {
    const { started, open } = useGame.getState()
    if (!started || open || spellCooldown.current > 0 || !body.current) return
    spellCooldown.current = 0.32
    wandFlash.current = 1.0
    sound.playSpellCast()

    const p = body.current.translation()
    const yaw = cam.current.yaw
    const pitch = THREE.MathUtils.clamp(cam.current.pitch, -0.25, 0.45)

    // Face the camera's aim direction when casting
    facing.current = yaw + Math.PI

    const forwardX = -Math.sin(yaw) * Math.cos(pitch * 0.35)
    const forwardY = -Math.sin(pitch * 0.45) + 0.04
    const forwardZ = -Math.cos(yaw) * Math.cos(pitch * 0.35)

    const startPos = new THREE.Vector3(
      p.x + forwardX * 0.9,
      p.y + 0.55,
      p.z + forwardZ * 0.9,
    )
    const vel = new THREE.Vector3(forwardX, forwardY, forwardZ).normalize().multiplyScalar(24)
    const color = SPELL_COLORS[Math.floor(Math.random() * SPELL_COLORS.length)]

    if (world.spells.length >= 6) world.spells.shift()
    world.spells.push({
      id: Date.now() + Math.random(),
      pos: startPos,
      vel,
      age: 0,
      color,
    })
  }

  useEffect(() => {
    window.__castSpell = castSpell
    const onKey = (e) => {
      if (e.code === 'KeyF') castSpell()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  // mouse look: pointer lock while playing, or click-drag as a fallback
  useEffect(() => {
    const el = gl.domElement
    let dragging = false
    let downPos = { x: 0, y: 0 }
    const onDown = (e) => {
      dragging = true
      downPos = { x: e.clientX, y: e.clientY }
      const { started, open } = useGame.getState()
      if (started && !open) {
        if (document.pointerLockElement === el && e.button === 0) {
          castSpell()
        } else if (document.pointerLockElement !== el) {
          Promise.resolve(el.requestPointerLock?.()).catch(() => {})
        }
      }
    }
    const onUp = (e) => {
      if (dragging && Math.hypot(e.clientX - downPos.x, e.clientY - downPos.y) < 5 && e.button === 2) {
        castSpell()
      }
      dragging = false
    }
    const onMove = (e) => {
      if (document.pointerLockElement !== el && !dragging) return
      if (useGame.getState().open) return
      cam.current.yaw -= e.movementX * 0.0028
      cam.current.pitch = THREE.MathUtils.clamp(cam.current.pitch + e.movementY * 0.0022, -0.15, 1.2)
    }
    const onWheel = (e) => {
      cam.current.dist = THREE.MathUtils.clamp(cam.current.dist + e.deltaY * 0.004, 3, 11)
    }
    el.addEventListener('pointerdown', onDown)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('mousemove', onMove)
    el.addEventListener('wheel', onWheel, { passive: true })
    return () => {
      el.removeEventListener('pointerdown', onDown)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('mousemove', onMove)
      el.removeEventListener('wheel', onWheel)
    }
  }, [gl])

  const play = (name, timeScale) => {
    const next = actions[name]
    if (!next) return
    next.timeScale = timeScale
    if (anim.current === name) return
    const prev = actions[anim.current]
    next.reset().setEffectiveWeight(1).play()
    if (prev) next.crossFadeFrom(prev, 0.25, true)
    anim.current = name
  }

  useFrame((_, delta) => {
    const rb = body.current
    if (!rb) return
    if (import.meta.env.DEV) window.__rb = rb
    const dt = Math.min(delta, 0.05)
    const state = useGame.getState()
    const { started, open, mounted: isMounted, teleportReq } = state
    const keys = getKeys()
    const c = cam.current

    jumpCooldown.current = Math.max(0, jumpCooldown.current - dt)
    spellCooldown.current = Math.max(0, spellCooldown.current - dt)
    wandFlash.current = Math.max(0, wandFlash.current - dt * 4)
    if (wandLight.current) {
      wandLight.current.intensity = 2.5 + wandFlash.current * 24
    }

    // Handle Fast-Travel / Apparate requests
    if (teleportReq && teleportReq.ts !== lastTeleportTs.current) {
      lastTeleportTs.current = teleportReq.ts
      const ty = groundAt(teleportReq.x, teleportReq.z) + (isMounted ? 2.2 : 1.35)
      rb.setTranslation({ x: teleportReq.x, y: ty, z: teleportReq.z }, true)
      rb.setLinvel({ x: 0, y: 0, z: 0 }, true)
      world.bursts.push({ pos: new THREE.Vector3(teleportReq.x, ty, teleportReq.z), age: 0, color: '#e9c27a' })
    }

    // ── movement relative to the camera ──
    const canMove = started && !open
    const fx = canMove ? Number(keys.forward) - Number(keys.back) : 0
    const sx = canMove ? Number(keys.right) - Number(keys.left) : 0
    _dir.set(
      -Math.sin(c.yaw) * fx + Math.cos(c.yaw) * sx,
      0,
      -Math.cos(c.yaw) * fx - Math.sin(c.yaw) * sx,
    )
    const moving = _dir.lengthSq() > 0.01
    const sprinting = moving && keys.run
    const baseSpeed = isMounted ? (sprinting ? BROOM_BOOST : BROOM_SPEED) : sprinting ? SPRINT_SPEED : RUN_SPEED
    const speed = moving ? baseSpeed : 0
    if (moving) _dir.normalize()

    const v = rb.linvel()
    const pos = rb.translation()
    const floorY = groundAt(pos.x, pos.z)
    const k = 1 - Math.exp(-12 * dt)
    let nvx = v.x + (_dir.x * speed - v.x) * k
    let nvz = v.z + (_dir.z * speed - v.z) * k
    let nvy = v.y

    if (isMounted) {
      // Broomstick flight physics: smooth hover + Space to ascend + C/Ctrl to descend
      const wantAscend = canMove ? Number(keys.jump) - Number(keys.descend) : 0
      const minHoverY = floorY + 1.85
      const maxHoverY = floorY + 7.5
      if (wantAscend > 0 && pos.y < maxHoverY) {
        nvy = THREE.MathUtils.lerp(v.y, 4.8, 0.18)
      } else if (wantAscend < 0 && pos.y > minHoverY + 0.3) {
        nvy = THREE.MathUtils.lerp(v.y, -4.2, 0.18)
      } else if (pos.y < minHoverY) {
        nvy = (minHoverY - pos.y) * 6.5
      } else {
        // gentle bob in mid-air
        nvy = Math.sin(performance.now() * 0.003) * 0.45
      }
    } else {
      // On-foot Jump / Arcane Levitate when pressing Space near the floor
      const onGround = pos.y - floorY < 1.35
      if (canMove && keys.jump && onGround && jumpCooldown.current <= 0) {
        nvy = 7.4
        jumpCooldown.current = 0.65
        sound.playJump(false)
      }
    }

    // keep the player inside the arena
    const r = Math.hypot(pos.x, pos.z)
    if (r > PLAY_RADIUS) {
      const rx = pos.x / r
      const rz = pos.z / r
      const outward = nvx * rx + nvz * rz
      if (outward > 0) { nvx -= outward * rx; nvz -= outward * rz }
      if (r > PLAY_RADIUS + 0.6) { nvx -= rx * 2; nvz -= rz * 2 }
    }
    // respawn if we ever fall through the world
    if (pos.y < -10) {
      rb.setTranslation({ x: SPAWN[0], y: spawnY + 1, z: SPAWN[1] }, true)
    }
    rb.setLinvel({ x: nvx, y: nvy, z: nvz }, true)

    // ── face the direction of travel ──
    let turnDiff = 0
    if (moving) {
      const targetAngle = Math.atan2(_dir.x, _dir.z)
      turnDiff = targetAngle - facing.current
      turnDiff = Math.atan2(Math.sin(turnDiff), Math.cos(turnDiff))
      facing.current += turnDiff * (1 - Math.exp(-14 * dt))
    }
    if (model.current) {
      model.current.rotation.y = facing.current
      // Slight forward pitch and turn banking when flying on the broomstick
      const pitchTilt = isMounted && moving ? 0.14 : sprinting ? 0.06 : 0
      const bankRoll = isMounted && moving ? THREE.MathUtils.clamp(-turnDiff * 0.35, -0.28, 0.28) : 0
      model.current.rotation.x = THREE.MathUtils.lerp(model.current.rotation.x, pitchTilt, 0.15)
      model.current.rotation.z = THREE.MathUtils.lerp(model.current.rotation.z, bankRoll, 0.15)
    }

    // ── animation, riding posture & footstep sounds ──
    const hSpeed = Math.hypot(v.x, v.z)
    if (isMounted) {
      mixer.stopAllAction()
      anim.current = 'Mounted'
      stepTimer.current = 0.1
      // Reset bones deterministically to Idle rest pose, then apply seated broom-gripping posture
      for (const k of Object.keys(bones)) {
        bones[k].quaternion.copy(baseQuats[k])
        bones[k].position.copy(basePos[k])
      }
      if (bones.spine) bones.spine.rotateX(0.32)
      if (bones.chest) bones.chest.rotateX(0.22)
      if (bones.neck) bones.neck.rotateX(-0.42)
      if (bones.thighL) { bones.thighL.rotateX(1.25); bones.thighL.rotateZ(-0.18) }
      if (bones.thighR) { bones.thighR.rotateX(1.25); bones.thighR.rotateZ(0.18) }
      if (bones.shinL) bones.shinL.rotateX(-1.85)
      if (bones.shinR) bones.shinR.rotateX(-1.85)
      if (bones.upper_armL) { bones.upper_armL.rotateZ(-0.52); bones.upper_armL.rotateX(-0.28) }
      if (bones.upper_armR) { bones.upper_armR.rotateZ(0.52); bones.upper_armR.rotateX(-0.28) }
      if (bones.forearmL) { bones.forearmL.rotateZ(-0.78); bones.forearmL.rotateX(-0.24) }
      if (bones.forearmR) { bones.forearmR.rotateZ(0.78); bones.forearmR.rotateX(-0.24) }
    } else if (!moving && hSpeed < 0.8) {
      play('Idle', 1)
      stepTimer.current = 0.1
    } else {
      play('Run', THREE.MathUtils.clamp(hSpeed / RUN_SPEED, 0.55, 1.5) * 1.15)
      if (pos.y - floorY < 1.45) {
        stepTimer.current -= dt
        if (stepTimer.current <= 0) {
          sound.playFootstep(sprinting)
          stepTimer.current = sprinting ? 0.27 : 0.39
        }
      }
    }

    // Export live player position & camera yaw for HUD compass
    const p = rb.translation()
    world.playerPos.set(p.x, p.y, p.z)
    world.camYaw = c.yaw
    world.facing = facing.current

    // ── camera follow ──
    _target.set(p.x, p.y + 0.75, p.z)
    c.look.lerp(_target, 1 - Math.exp(-10 * dt))
    _camPos.set(
      c.look.x + Math.sin(c.yaw) * Math.cos(c.pitch) * c.dist,
      c.look.y + Math.sin(c.pitch) * c.dist,
      c.look.z + Math.cos(c.yaw) * Math.cos(c.pitch) * c.dist,
    )
    // don't let the camera go through the arena walls
    _camDir.subVectors(_camPos, c.look)
    const want = _camDir.length()
    _camDir.divideScalar(want)
    const hit = arenaHitDistance(c.look, _camDir, want)
    const blocked = hit < want
    if (blocked) _camPos.copy(c.look).addScaledVector(_camDir, Math.max(0.6, hit - 0.35))
    _camPos.y = Math.max(_camPos.y, p.y - 0.4)

    const phase = state.phase
    const cine = cinematic.current
    cine.time += Math.min(delta, 0.25)
    if (phase === 'title') {
      const a = Math.sin(cine.time * 0.07) * 0.5
      const r = 19 - Math.sin(cine.time * 0.05) * 2
      cine.pos.set(Math.sin(a) * r, 7.5 + Math.sin(cine.time * 0.13) * 1.2, Math.cos(a) * r)
      cine.look.set(0, 3.2, -5)
      camera.position.copy(cine.pos)
      camera.lookAt(cine.look)
    } else if (phase === 'entering') {
      if (cine.start === null) {
        cine.start = cine.time
        cine.fromPos.copy(camera.position)
        cine.fromLook.copy(cine.look)
      }
      const k = Math.min(1, (cine.time - cine.start) / ENTER_DURATION)
      const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2
      camera.position.lerpVectors(cine.fromPos, _camPos, e)
      camera.position.y += Math.sin(e * Math.PI) * 4
      _lookBlend.lerpVectors(cine.fromLook, c.look, e)
      camera.lookAt(_lookBlend)
      if (k >= 1) useGame.getState().play()
    } else {
      camera.position.lerp(_camPos, 1 - Math.exp((blocked ? -30 : -14) * dt))
      camera.lookAt(c.look)
    }

    // ── nearest interactive thing: an artifact, golden orb, dark archmage, or broomstick ──
    let nearest = null
    let best = INTERACT_RADIUS
    for (const z of zones) {
      const d = Math.hypot(p.x - z.position[0], p.z - z.position[2])
      if (d < best) { best = d; nearest = z.id }
    }
    const orbD = Math.hypot(p.x - world.orb.x, p.z - world.orb.z)
    if (orbD < CATCH_RADIUS && Math.abs(world.orb.y - p.y) < 3.6 && orbD < best) {
      best = orbD
      nearest = contact.id
    }
    const guardD = Math.hypot(p.x - guardian.position[0], p.z - guardian.position[2])
    if (guardD < 3.8 && guardD < best) {
      best = guardD
      nearest = guardian.id
    }
    if (!isMounted) {
      const broomD = Math.hypot(p.x - world.broom.x, p.z - world.broom.z)
      if (broomD < 2.8 && broomD < best) {
        best = broomD
        nearest = 'broom'
      }
    }
    if (state.near !== nearest) state.setNear(nearest)
  })

  return (
    <>
      <SpellProjectiles />
      <RigidBody
        ref={body}
        colliders={false}
        enabledRotations={[false, false, false]}
        position={[SPAWN[0], spawnY, SPAWN[1]]}
        canSleep={false}
      >
        <CapsuleCollider args={[0.55, 0.35]} friction={0} />
        <group ref={model} position={[0, -0.9, 0]} scale={MODEL_SCALE}>
          <primitive object={scene} />
          {/* Subtle arcane wand-light and broomstick when mounted */}
          <pointLight ref={wandLight} position={[0.25, 0.65, 0.35]} color="#9fc5ff" intensity={2.5} distance={4.5} decay={2} />
          {mounted && (
            <group position={[0, 0.31, 0.04]} rotation={[0, -Math.PI / 2, 0.22]} scale={1.05}>
              <primitive object={playerBroom} position={[0, -0.195, 0]} />
              <Sparkles count={24} scale={[0.9, 0.35, 0.35]} position={[-0.48, -0.06, 0]} size={3} speed={1.4} color="#ffd54a" />
            </group>
          )}
        </group>
        <Sparkles count={mounted ? 28 : 10} scale={[1.2, 1.4, 1.2]} position={[0, -0.3, 0]} size={mounted ? 3.2 : 1.8} speed={0.8} color={mounted ? '#ffd54a' : '#8ab8ff'} opacity={0.65} />
      </RigidBody>
    </>
  )
}

useGLTF.preload('/models/wizard.glb')
