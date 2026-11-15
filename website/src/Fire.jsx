import { useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

const vertexShader = /* glsl */ `
  attribute vec4 seed;
  uniform float uTime;
  uniform float uScale;
  uniform float uPixel;
  varying float vLife;
  void main() {
    float life = fract(uTime * (0.8 + seed.w * 0.9) + seed.x);
    float spread = 0.22 * (1.0 - life * 0.85);
    vec3 p = vec3(seed.y * spread, life * 0.95, seed.z * spread);
    p.x += sin(uTime * 7.0 + seed.x * 30.0) * 0.05 * life;
    p.z += cos(uTime * 6.0 + seed.y * 30.0) * 0.05 * life;
    p *= uScale;
    vLife = life;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = uScale * uPixel * (240.0 * (1.0 - life * 0.75)) / -mv.z;
  }
`

const fragmentShader = /* glsl */ `
  varying float vLife;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c);
    if (d > 0.5) discard;
    float a = smoothstep(0.5, 0.0, d) * smoothstep(0.0, 0.08, vLife) * (1.0 - vLife) * 0.35;
    vec3 hot = vec3(1.0, 0.85, 0.5);
    vec3 cool = vec3(1.0, 0.22, 0.03);
    vec3 col = mix(hot, cool, smoothstep(0.05, 0.7, vLife));
    gl_FragColor = vec4(col * 1.7 * a, a);
  }
`

/** GPU particle flame. Cheap enough for many torches. */
export default function Fire({ scale = 1, count = 70, ...props }) {
  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry()
    const seeds = new Float32Array(count * 4)
    for (let i = 0; i < count; i++) {
      seeds[i * 4] = Math.random()
      seeds[i * 4 + 1] = Math.random() - 0.5
      seeds[i * 4 + 2] = Math.random() - 0.5
      seeds[i * 4 + 3] = Math.random()
    }
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3))
    g.setAttribute('seed', new THREE.BufferAttribute(seeds, 4))
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.5 * scale, 0), 1.5 * scale)
    return g
  }, [count, scale])

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: { uTime: { value: 0 }, uScale: { value: scale }, uPixel: { value: Math.min(window.devicePixelRatio, 2) } },
        vertexShader,
        fragmentShader,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    [scale],
  )

  useFrame(({ clock }) => (material.uniforms.uTime.value = clock.elapsedTime))
  return <points geometry={geometry} material={material} frustumCulled={false} {...props} />
}
