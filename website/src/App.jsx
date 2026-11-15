import { Suspense } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { Environment, KeyboardControls, Lightformer, PerformanceMonitor } from '@react-three/drei'
import { Physics } from '@react-three/rapier'
import { EffectComposer, Bloom, Vignette, SMAA, N8AO } from '@react-three/postprocessing'
import * as THREE from 'three'
import Player from './Player'
import World from './World'
import Zones from './Zones'
import UI from './UI'
import { useGame } from './store'

const keyMap = [
  { name: 'forward', keys: ['KeyW', 'ArrowUp'] },
  { name: 'back', keys: ['KeyS', 'ArrowDown'] },
  { name: 'left', keys: ['KeyA', 'ArrowLeft'] },
  { name: 'right', keys: ['KeyD', 'ArrowRight'] },
  { name: 'run', keys: ['ShiftLeft', 'ShiftRight'] },
  { name: 'jump', keys: ['Space'] },
  { name: 'descend', keys: ['KeyC', 'ControlLeft'] },
]

function Lights() {
  const high = useGame((s) => s.quality === 'high')
  return (
    <>
      <hemisphereLight args={['#4a5f9f', '#1a130c', 0.7]} />
      {/* moonlight */}
      <directionalLight
        position={[-22, 55, -26]}
        color="#a9bcff"
        intensity={1.9}
        castShadow
        shadow-mapSize={high ? [2048, 2048] : [1024, 1024]}
        key={high ? 'hi' : 'lo'}
        shadow-camera-left={-26}
        shadow-camera-right={26}
        shadow-camera-top={26}
        shadow-camera-bottom={-26}
        shadow-camera-far={140}
        shadow-bias={-0.0004}
        shadow-normalBias={0.04}
      />
      {/* soft reflections for the robe and stone, generated locally (no HDR download) */}
      <Environment resolution={128} frames={1}>
        <Lightformer form="ring" intensity={1.2} color="#7f9bff" position={[-6, 8, -10]} scale={6} />
        <Lightformer intensity={1.6} color="#ffb070" position={[0, 3, 8]} scale={[10, 2, 1]} />
        <Lightformer intensity={0.5} color="#2b3a70" position={[0, 12, 0]} rotation-x={Math.PI / 2} scale={[30, 30, 1]} />
      </Environment>
    </>
  )
}

function DevExpose() {
  const state = useThree()
  if (import.meta.env.DEV) window.__r3f = state
  return null
}

function Effects() {
  const high = useGame((s) => s.quality === 'high')
  return high ? (
    <EffectComposer multisampling={0}>
      <N8AO halfRes aoRadius={1.6} intensity={2.2} distanceFalloff={1} />
      <Bloom mipmapBlur intensity={1.15} luminanceThreshold={1} luminanceSmoothing={0.2} radius={0.75} />
      <Vignette offset={0.25} darkness={0.7} />
      <SMAA />
    </EffectComposer>
  ) : (
    <EffectComposer multisampling={0}>
      <Bloom mipmapBlur intensity={1.15} luminanceThreshold={1} luminanceSmoothing={0.2} radius={0.6} levels={5} />
      <Vignette offset={0.25} darkness={0.7} />
    </EffectComposer>
  )
}

export default function App() {
  const quality = useGame((s) => s.quality)
  const setQuality = useGame((s) => s.setQuality)
  const introVideoPlaying = useGame((s) => s.introVideoPlaying)
  return (
    <KeyboardControls map={keyMap}>
      <Canvas
        shadows
        frameloop={introVideoPlaying ? 'demand' : 'always'}
        dpr={quality === 'high' ? [1, 1.75] : 1}
        camera={{ fov: 55, near: 0.1, far: 600, position: [0, 4, 19] }}
        gl={{ antialias: false, powerPreference: 'high-performance', toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.3 }}
      >
        {quality === 'high' && !introVideoPlaying && <PerformanceMonitor onDecline={() => setQuality('low')} />}
        <DevExpose />
        <Suspense fallback={null}>
          <Lights />
          <Physics paused={introVideoPlaying} gravity={[0, -20, 0]}>
            <World />
            <Zones />
            <Player />
          </Physics>
          <Effects />
        </Suspense>
      </Canvas>
      <UI />
    </KeyboardControls>
  )
}
