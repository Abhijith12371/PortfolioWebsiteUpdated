import * as THREE from 'three'
import { useGLTF } from '@react-three/drei'

export const ARENA_SCALE = 45   // arena model is ~1 unit wide → ~45 m across
export const PLAY_RADIUS = 16   // the player is kept inside this circle

// shared, mutable world state (read every frame, so kept out of React state)
export const world = {
  arena: null,                                  // the arena scene, for ground and camera rays
  orb: new THREE.Vector3(0, 3, 0),              // live position of the golden orb
  broom: new THREE.Vector3(-5, 1.5, 10),        // live position of the resting broomstick
  playerPos: new THREE.Vector3(0, 1, 8),        // live position of the player
  camYaw: 0,                                    // live camera yaw for the HUD compass
  facing: Math.PI,                              // live direction the wizard faces
  spells: [],                                   // active wand spell bolts [{ id, pos, vel, age, color, hit }]
  bursts: [],                                   // spell impact bursts [{ id, pos, age, color }]
  darkShieldPulse: 0,                           // intensity of Dark Wizard's deflection shield when hit
  relicPulse: {},                               // per-zone pulse when hit by a spell
}

/** Loads the arena once, scales it, and registers it for ray queries. */
export function useArena() {
  const { scene } = useGLTF('/models/arena.glb')
  if (world.arena !== scene) {
    scene.scale.setScalar(ARENA_SCALE)
    scene.updateMatrixWorld(true)
    scene.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true
        o.receiveShadow = true
        o.material.envMapIntensity = 0.7
      }
    })
    world.arena = scene
  }
  return scene
}

const _ray = new THREE.Raycaster()
const _down = new THREE.Vector3(0, -1, 0)
const _o = new THREE.Vector3()

/** Height of the arena floor at (x, z). */
export function groundAt(x, z, fallback = 0) {
  if (!world.arena) return fallback
  _o.set(x, 40, z)
  _ray.set(_o, _down)
  _ray.far = 80
  const hit = _ray.intersectObject(world.arena, true)[0]
  return hit ? hit.point.y : fallback
}

/** Distance along a ray until it hits the arena (Infinity if clear). */
export function arenaHitDistance(origin, dir, far) {
  if (!world.arena) return Infinity
  _ray.set(origin, dir)
  _ray.far = far
  _ray.firstHitOnly = true
  const hit = _ray.intersectObject(world.arena, true)[0]
  return hit ? hit.distance : Infinity
}

;['arena', 'wizard', 'dark_wizard', 'pillar', 'torch', 'spellbook', 'wand', 'potion', 'hat', 'golden_orb', 'broom'].forEach((m) =>
  useGLTF.preload(`/models/${m}.glb`),
)

if (import.meta.env.DEV) window.__world = world
