// Shared microgravity flame rendering: limb-brightened spherical diffusion flame + soft glow sprite.
import React, { useMemo } from 'react'
import * as THREE from 'three'

export const glowTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 128
  const g = c.getContext('2d'); const r = g.createRadialGradient(64, 64, 0, 64, 64, 64)
  r.addColorStop(0, 'rgba(255,255,255,0.9)'); r.addColorStop(0.35, 'rgba(255,255,255,0.45)'); r.addColorStop(0.6, 'rgba(255,255,255,0.12)'); r.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = r; g.fillRect(0, 0, 128, 128); return new THREE.CanvasTexture(c)
})()

export function FlameShell({ radius, color = '#4f8de8', intensity = 1.3, scale = [1, 1, 1] }) {
  const mat = useMemo(() => new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uI: { value: intensity } },
    vertexShader: 'varying vec3 vN; varying vec3 vV; void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }',
    fragmentShader: 'uniform vec3 uColor; uniform float uI; varying vec3 vN; varying vec3 vV; void main(){ float f = 1.0 - abs(dot(vN, vV)); float a = pow(f, 2.6) * uI * 0.75 + 0.05 * uI; gl_FragColor = vec4(uColor * (0.55 + 0.7 * f), a); }',
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  }), [])
  mat.uniforms.uColor.value.set(color); mat.uniforms.uI.value = intensity
  return <group scale={scale}>
    <mesh material={mat}><sphereGeometry args={[Math.max(0.001, radius), 48, 48]} /></mesh>
    <sprite scale={[radius * 2.7, radius * 2.7, 1]}><spriteMaterial map={glowTex} color={color} transparent opacity={0.22 * Math.min(1, intensity)} blending={THREE.AdditiveBlending} depthWrite={false} /></sprite>
  </group>
}
