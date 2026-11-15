// EMBER machine pages: shared pieces (flame shader, CIR chamber, bridge, picking, embed CSS, gas physics).
// SI disclosure: written with assistance from Claude (Anthropic). Built on the Machine Skill kit (MIT).
const K = () => window.LabKit

// ---------------------------------------------------------------- embed CSS + click info box
export function chrome() {
  const st = document.createElement('style')
  st.textContent = `
  .ember-pick { position:fixed; left:4.2vw; bottom:4.4vh; max-width:34vw; font:13px/1.45 Inter, sans-serif; color:#d9e6f2;
    background:rgba(10,16,24,0.78); border:1px solid rgba(127,211,247,0.35); border-radius:10px; padding:10px 14px; display:none; z-index:20 }
  .ember-pick b { color:#7fd3f7; display:block; font-weight:600; margin-bottom:2px }
  .lab-embed .ember-pick { display:none !important }
  .ember-flag { color:#f2a541 }
  .lab-embed .lab-prompt, .lab-embed .lab-pills, .lab-embed .lab-no { display:none }
  .lab-embed .lab-title { font-size:clamp(22px, 2.6vw, 40px) }
  .lab-embed .lab-big { font-size:clamp(40px, 6vw, 88px) }
  @media (max-width: 760px) { .lab-embed .lab-title { display:none } .lab-embed .lab-side { bottom:64px; background:rgba(8,10,14,.74); padding:10px 14px; border-radius:10px } .lab-embed .lab-big { font-size:40px } .lab-embed .lab-ctl .ends { display:none } }`
  document.head.appendChild(st)
}

// the EMBER app (same origin parent) when embedded; null when the page is opened on its own
export const app = (() => { try { return window.parent !== window && window.parent.EMBER ? window.parent.EMBER : null } catch { return null } })()

// ---------------------------------------------------------------- EMBER's limb-brightened microgravity flame
const glowTex = () => {
  const { THREE } = K()
  const c = document.createElement('canvas'); c.width = c.height = 128
  const g = c.getContext('2d'); const r = g.createRadialGradient(64, 64, 0, 64, 64, 64)
  r.addColorStop(0, 'rgba(255,255,255,0.9)'); r.addColorStop(0.35, 'rgba(255,255,255,0.45)'); r.addColorStop(0.6, 'rgba(255,255,255,0.12)'); r.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = r; g.fillRect(0, 0, 128, 128); return new THREE.CanvasTexture(c)
}
/** a flame: unit sphere shell + glow sprite; scale the group (x, y, z) to shape it; set .intensity and .color */
export function makeFlame(color = '#4f8de8') {
  const { THREE, LAYER_FX } = K()
  const mat = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uI: { value: 1.3 } },
    vertexShader: 'varying vec3 vN; varying vec3 vV; void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }',
    fragmentShader: 'uniform vec3 uColor; uniform float uI; varying vec3 vN; varying vec3 vV; void main(){ float f = 1.0 - abs(dot(vN, vV)); float a = pow(f, 2.6) * uI * 0.8 + 0.02 * uI; gl_FragColor = vec4(uColor * (0.55 + 0.7 * f) * 2.4, a); }',
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  })
  const g = new THREE.Group()
  const shell = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 48), mat)
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false }))
  glow.scale.setScalar(2.7)
  for (const m of [shell, glow]) { m.userData.noAO = true; m.castShadow = false; m.renderOrder = 10; m.layers.set(LAYER_FX) }
  g.add(shell, glow)
  g.userData.set = (intensity, col) => { mat.uniforms.uI.value = 1.3 * intensity; glow.material.opacity = 0.22 * Math.min(1, intensity); if (col) { mat.uniforms.uColor.value.set(col); glow.material.color.set(col) } ; g.visible = intensity > 0.01 }
  return g
}

// ---------------------------------------------------------------- geometry helpers
export const X = (g) => g.rotateZ(-Math.PI / 2)
export function bar(p0, p1, r, mat, seg = 20) {
  const { THREE, GEO } = K()
  const a = new THREE.Vector3(...p0), b = new THREE.Vector3(...p1), L = a.distanceTo(b)
  const m = new THREE.Mesh(GEO.lathe([[0, -L / 2], [r, -L / 2], [r, L / 2], [0, L / 2]], seg), mat)
  m.position.copy(a).add(b).multiplyScalar(0.5)
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize())
  return m
}
export const radial = (g, dir) => { const { THREE } = K(); return g.applyMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(...dir).normalize()))) }

// ---------------------------------------------------------------- the CIR combustion chamber (shared by FLEX and ACME)
// about 100 L stainless vessel, ~0.40 m bore x 0.79 m, bolted end caps, four mid-plane sapphire windows, on the CIR optics bench
export function buildCIR(lab) {
  const { THREE, MAT, GEO } = K()
  const CY = 0.43, HL = 0.395, RB = 0.215, RI = 0.2
  const vessel = MAT.stainless({ roughness: 0.42 }), flangeM = MAT.steel({ roughness: 0.22 }), capM = MAT.stainless({ roughness: 0.3, finish: 'turned' })
  const boltM = MAT.steelDark({ roughness: 0.35 }), saddleM = MAT.paint({ color: [0.11, 0.13, 0.16], roughness: 0.45, clearcoat: 0.3 }), brass = MAT.brass({ roughness: 0.28 })
  const camM = MAT.anodised({ color: [0.02, 0.022, 0.026] })
  lab.mesh(GEO.rbox(1.15, 0.03, 0.62, 0.006), MAT.anodised({ color: [0.06, 0.065, 0.075] }), { name: 'CIR optics bench', pos: [0, 0.015, 0] })
  const saddles = new THREE.Group()
  for (const x of [-0.24, 0.24]) {
    const g = GEO.lathe([[RB, -0.03], [RB + 0.035, -0.03], [RB + 0.035, 0.03], [RB, 0.03]], 96, { phi0: Math.PI * 1.2, phiLen: Math.PI * 0.6 })
    const s = new THREE.Mesh(g, saddleM); s.rotation.z = Math.PI / 2; s.position.set(x, CY, 0); saddles.add(s)
    for (const sz of [-1, 1]) { const z = sz * 0.12, h = CY - Math.sqrt((RB + 0.02) ** 2 - z * z) - 0.03; const p = new THREE.Mesh(GEO.rbox(0.05, h, 0.05, 0.006), saddleM); p.position.set(x, 0.03 + h / 2, z); saddles.add(p) }
    const foot = new THREE.Mesh(GEO.rbox(0.09, 0.012, 0.34, 0.004), saddleM); foot.position.set(x, 0.036, 0); saddles.add(foot)
  }
  lab.add(saddles, { name: 'Chamber saddles', count: 6 })
  const vesselG = new THREE.Group()
  const barrel = new THREE.Mesh(X(GEO.tube(RB, RI, HL * 2)), vessel); barrel.position.set(0, CY, 0); vesselG.add(barrel)
  for (const s of [-1, 1]) { const f = new THREE.Mesh(X(GEO.tube(0.265, RI, 0.035, 128, -0.0175)), flangeM); f.position.set(s * (HL - 0.0175), CY, 0); vesselG.add(f) }
  for (const d of [[0, 1, 0], [0, 0, 1], [0, -1, 0], [0, 0, -1]]) {
    const boss = new THREE.Mesh(radial(GEO.tube(0.07, 0.048, 0.07, 64, RI - 0.005), d), flangeM); boss.position.set(0, CY, 0); vesselG.add(boss)
    const win = new THREE.Mesh(radial(GEO.disc(0.05, 0.014, 0.002, 48).translate(0, RI + 0.052, 0), d), MAT.sapphire()); win.position.set(0, CY, 0); vesselG.add(win)
    const bb = new THREE.Mesh(radial(GEO.bolts(8, 0.06, 0.0045, 0.008, { y: RI + 0.065, socket: true }), d), boltM); bb.position.set(0, CY, 0); vesselG.add(bb)
  }
  lab.add(vesselG, { name: 'Pressure vessel', xray: 'shell', count: 42 })
  const capProfile = [[0, 0], [0.265, 0], [0.265, 0.03], [0.24, 0.042], [0.16, 0.066], [0.06, 0.08], [0, 0.082]]
  const mkCap = (s) => {
    const g = new THREE.Group(), r = s > 0 ? -Math.PI / 2 : Math.PI / 2
    g.add(new THREE.Mesh(GEO.lathe(capProfile, 128).rotateZ(r), capM))
    g.add(new THREE.Mesh(GEO.bolts(24, 0.245, 0.0065, 0.012, { y: 0.03, socket: true }).rotateZ(r), boltM))
    g.position.set(s * HL, CY, 0); return g
  }
  lab.add(mkCap(-1), { name: 'Rear end cap', explode: [-0.2, 0, 0], xray: 'shell', count: 25 })
  lab.add(mkCap(1), { name: 'Front end cap', explode: [0.8, 0, 0], xray: 'shell', count: 25 })
  const gas = new THREE.Group(), XC = -HL - 0.05
  for (const z of [0.11, -0.11]) {
    const yc = CY + 0.04
    gas.add(new THREE.Mesh(GEO.pipe([[XC + 0.035, yc, z], [XC - 0.06, yc, z], [XC - 0.1, yc - 0.06, z], [XC - 0.1, 0.12, z], [XC - 0.1, 0.075, z * 1.6]], 0.006), MAT.stainless({ roughness: 0.18 })))
    const fit = new THREE.Mesh(X(GEO.disc(0.012, 0.022, 0.002, 24)), brass); fit.position.set(XC + 0.02, yc, z); gas.add(fit)
  }
  const block = new THREE.Mesh(GEO.rbox(0.09, 0.05, 0.42, 0.006), MAT.aluminium({ roughness: 0.3 })); block.position.set(XC - 0.1, 0.055, 0); gas.add(block)
  lab.add(gas, { name: 'Gas inlet and vent', explode: [-0.25, 0, 0], count: 5 })
  const cam = new THREE.Group()
  const body = new THREE.Mesh(GEO.rbox(0.09, 0.08, 0.11, 0.01), camM); body.position.set(0, CY, -(RI + 0.19)); cam.add(body)
  const lens = new THREE.Mesh(radial(GEO.lathe([[0, 0], [0.032, 0], [0.034, 0.02], [0.03, 0.065], [0, 0.065]], 48), [0, 0, 1]), MAT.steelDark({ roughness: 0.3 })); lens.position.set(0, CY, -(RI + 0.135)); cam.add(lens)
  lab.add(cam, { name: 'Chamber camera', explode: [0, 0, -0.35], count: 2 })
  lab.label(vesselG, 'Combustion chamber', { at: [-0.2, CY + RB, 0], value: () => `${Math.round(Math.PI * RI * RI * HL * 2 * 1000)} L · ${lab.controls.o2?.value.toFixed(1)} % O₂ · ${lab.controls.psi?.value.toFixed(1)} psi` })
  return { CY, HL, RB, RI, vesselG, gas, XC }
}
export const CIR_INFO = {
  'CIR optics bench': 'The Combustion Integrated Rack optics bench in the Destiny lab. Chamber, cameras and diagnostics all mount to it.',
  'Chamber saddles': 'Saddles hold the 100 L chamber on the optics bench.',
  'Pressure vessel': 'CIR combustion chamber: about 100 L, run from about 0.02 to 3 atm and up to about 50 % O₂. Mid-plane windows let cameras see the flame.',
  'Rear end cap': 'Fixed end cap; the gas inlet and vent pass through it.',
  'Front end cap': 'The door. Crew open it to slide the experiment insert in and out.',
  'Gas inlet and vent': 'The rack mixes O₂, N₂ and diluents and fills the chamber to the test pressure; burnt gas is vented afterwards.',
  'Chamber camera': 'Films the flame through a window; flame size and brightness are measured from these images.',
}

// ---------------------------------------------------------------- gas physics shared by the pages
export const R_U = 8.314
/** O2 mass fraction from mole fractions (balance N2) */
export const yO2 = (xO2, xCO2 = 0, xHe = 0) => { const xN2 = Math.max(0, 1 - xO2 - xCO2 - xHe); return (32 * xO2) / (32 * xO2 + 44 * xCO2 + 4 * xHe + 28 * xN2) }
export const psiToPa = (p) => p * 6894.76
/** gas density (kg/m3) of an O2/N2 mix at pressure psi, temperature T */
export const rhoAir = (o2Pct, psi, T = 298) => psiToPa(psi) * ((32 * o2Pct + 28 * (100 - o2Pct)) / 100 / 1000) / (R_U * T)
/** Burke-Schumann diffusion flame temperature with Huggett's 13.1 MJ per kg of O2 consumed (no dissociation, no radiation: an upper bound) */
export const flameT = (o2Pct, nu, T0 = 298, cp = 1200) => { const Y = yO2(o2Pct / 100); return T0 + (Y * 13.1e6) / (cp * (1 + Y / nu)) }

// ---------------------------------------------------------------- picking and bridge
export function picking(lab, INFO, machine) {
  const { THREE } = K()
  const pick = document.createElement('div'); pick.className = 'ember-pick'; document.body.appendChild(pick)
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2()
  let downAt = null
  addEventListener('pointerdown', (e) => (downAt = [e.clientX, e.clientY]))
  addEventListener('pointerup', (e) => {
    if (!downAt || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 5 || e.target.tagName !== 'CANVAS') return
    ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1)
    ray.setFromCamera(ndc, lab.camera)
    for (const h of ray.intersectObject(lab.machine, true)) {
      if (!h.object.visible || h.object.material?.blending === THREE.AdditiveBlending) continue
      let o = h.object, part = null
      while (o && !part) { part = lab.parts.find((p) => p.obj === o); o = o.parent }
      if (!part) continue
      const text = INFO[part.name] ?? ''
      pick.innerHTML = `<b>${part.name}</b>${text}`; pick.style.display = 'block'
      app?.onPart?.({ machine, name: part.name, text })
      return
    }
    pick.style.display = 'none'
  })
}
/** standard bridge: setScenario / setRow / mode / view / state */
export function bridge(lab, id, { setRow, state }) {
  const o2 = lab.controls.o2, psi = lab.controls.psi
  window.EMBER_MACHINE = {
    id,
    setScenario({ o2: a, psi: b, name } = {}) { if (a != null) o2.set(a); if (b != null) psi.set(b); window.EMBER_MACHINE._label = name },
    setRow, mode: (k, on) => lab.toggle(k, on), view: (v) => lab.setView(v), state,
  }
  app?.onReady?.(id)
}
/** the nearest-test line and the worst flag, for the hero sub line */
export function evidenceLine(r) {
  if (!r) return ''
  const n = r.nearestRealTests?.[0]
  const flag = r.flags?.find((f) => /extrapol|outside|untested|far|No solid/i.test(f))
  return `${n ? `nearest real test ${n.fuel}, ${n.o2Pct} % O₂, ${n.psi} psi` : 'no real test with recorded O₂ and pressure'}${flag ? `<br><span class="ember-flag">⚠ ${flag}</span>` : ''}`
}

// ---------------------------------------------------------------- solid samples (BASS, Saffire): material + geometry from the PSI row text
// properties: density kg/m3, cs J/kg K, Tv pyrolysis K, ks W/m K; SIBAL by areal density (approx. 0.18 kg/m2, cotton-fibreglass fabric)
export const SOLIDS = {
  PMMA: { rho: 1190, cs: 1460, Tv: 660, ks: 0.19, nu: 1.92 },
  SIBAL: { areal: 0.18, cs: 1300, Tv: 620, ks: 0.1, nu: 1.185 },
  Nomex: { rho: 1380, cs: 1200, Tv: 700, ks: 0.13, nu: 1.9, areal: 0.2 },
  Silicone: { rho: 1150, cs: 1300, Tv: 750, ks: 0.2, nu: 1.6 },
}
const num = (s, re) => { const m = String(s).match(re); return m ? parseFloat(m[1]) : null }
/** read the sample from a PSI row: material, thickness (m), width and length (m) */
export function parseSample(row) {
  const f = String(row?.fuel ?? ''), o = row?.out ?? {}
  const mat = /pmma|film/i.test(f) ? 'PMMA' : /sibal|cotton/i.test(f) ? 'SIBAL' : /nomex/i.test(f) ? 'Nomex' : /silicone/i.test(f) ? 'Silicone' : null
  let tau = num(f, /(\d*\.?\d+)\s*micron/i) != null ? num(f, /(\d*\.?\d+)\s*micron/i) * 1e-6 : num(f, /(\d*\.?\d+)\s*mm/i) != null ? num(f, /(\d*\.?\d+)\s*mm/i) * 1e-3 : null
  if (tau == null && o.thickness) { const t = String(o.thickness); const v = parseFloat(t.replace(/^\./, '0.')); tau = /cm/.test(t) ? v * 0.01 : v * 1e-3 }
  const w = num(f, /(\d*\.?\d+)\s*cm\s*wide/i) ?? num(f, /^(\d*\.?\d+)\s*cm/i) ?? (o.width ? parseFloat(String(o.width).replace(/^\./, '0.')) : null)
  const L = o.length ? parseFloat(String(o.length).replace(/^\./, '0.')) : null
  return { mat, tau, width: w ? w / 100 : null, length: L ? L / 100 : null, oneSided: /1 sided/i.test(f) }
}
/** de Ris opposed-flow flame spread (thin or thick fuel), m/s. T_f from flameT (upper bound) so this is an upper estimate. */
export function deRis({ mat, tau }, o2Pct, psi, Ucm) {
  const m = SOLIDS[mat]; if (!m) return null
  const Tf = flameT(o2Pct, m.nu), T0 = 298, kg = 0.06
  const areal = m.areal ?? (tau ? m.rho * tau : null); if (!areal) return null
  const thin = m.areal != null || (tau != null && tau < 0.5e-3)
  if (thin) return { V: (Math.PI / 4) * kg * (Tf - m.Tv) / (areal * m.cs * (m.Tv - T0)), Tf, thin, areal }
  const rhoG = rhoAir(o2Pct, psi, 1000), kpcG = kg * rhoG * 1200, kpcS = m.ks * m.rho * m.cs
  return { V: (Ucm / 100) * (kpcG / kpcS) * ((Tf - m.Tv) / (m.Tv - T0)) ** 2, Tf, thin, areal }
}

// ---------------------------------------------------------------- habitat pages (Moon base, rover)
/** a pressurised module: a closed hollow shell around the Y axis with a hatch opening at each end (so the cutaway shows the wall) */
export function hullGeo(L, R, t = 0.09, hatch = 0.62, cone = 0.75, seg = 56) {
  const { GEO } = K()
  return GEO.lathe([[hatch, -L / 2], [R, -L / 2 + cone], [R, L / 2 - cone], [hatch, L / 2],
    [hatch, L / 2 - t], [R - t, L / 2 - cone - t * 0.5], [R - t, -L / 2 + cone + t * 0.5], [hatch, -L / 2 + t]], seg)
}

/**
 * The cabin-air solver shared by the habitat pages: hero, two sliders, break, how, bridge.
 *   ppO2 = x_O2 p                                   what the crew breathes
 *   T_f  = Burke-Schumann flame temperature         13.1 MJ per kg O2, no dissociation or radiation: an upper bound
 *   V    = de Ris thin-fuel opposed-flow spread     cotton-fibreglass fabric (SIBAL, 0.18 kg/m2): an upper estimate
 *   U_b  = (g alpha (T_f - T) / T)^(1/3)            the draft a flame makes for itself under gravity (scale estimate)
 *   dm   = n dx / (1 - x - dx) M                    oxygen that must leak into the sealed cabin to raise it by dx = 5 points
 * volume (m3) is the pressurised volume of the model as drawn; g follows the EMBER scenario.
 */
export function cabinAir(lab, { id, o2 = 34, psi = 8.2, g = 0.165, volume, T = 295, how }) {
  const { fmt } = K()
  const FAB = { mat: 'SIBAL' }
  const sim = { V: 0, V0: deRis(FAB, 21, 14.7, 10).V * 1000, Tf: 0, pp: 0, mO2: 0, Ub: 0, leak: 0, leakPsi: psi, leakWas: 0, g, z: null, key: '', broken: false, saved: null, t: 0, volume }
  lab.hero({ label: 'Flame spread on thin cabin fabric', unit: 'mm/s', max: 3, digits: 2 })
  const o2S = lab.slider({ id: 'o2', label: 'Cabin oxygen', min: 14, max: 50, value: o2, unit: '% O₂', digits: 1, ends: ['14 %', '50 %'] })
  const pS = lab.slider({ id: 'psi', label: 'Cabin pressure', min: 4, max: 30, value: psi, unit: 'psi', digits: 1, ends: ['4 psi', '30 psi'] })
  function solve() {
    const a = o2S.value, p = pS.value, r = deRis(FAB, a, p, 10), x = a / 100
    sim.V = r.V * 1000; sim.Tf = r.Tf
    sim.pp = (x * psiToPa(p)) / 1000
    const n = (psiToPa(p) * volume) / (R_U * T)
    sim.mO2 = x * n * 0.032
    sim.Ub = Math.cbrt(Math.max(0, sim.g) * 9.81 * 2.2e-5 * (14.696 / p) * (sim.Tf - T) / T)
    const room = 1 - x - 0.05
    sim.leak = room > 0 ? ((n * 0.05) / room) * 0.032 : 0
    sim.leakPsi = room > 0 ? p * (1 + 0.05 / room) : p
    const key = a + '|' + p
    if (key !== sim.key) { sim.key = key; try { sim.z = app?.zone ? app.zone({ o2: a, psi: p }) : null } catch { sim.z = null } }
  }
  lab.how(`${how} The physics is the cabin air. Thinner air with more oxygen keeps the oxygen partial pressure, which is what the crew breathes, near sea level, but it removes nitrogen, the gas that cools a flame. Flame temperature is the Burke-Schumann limit with 13.1 MJ released per kilogram of oxygen and no dissociation or radiation, so it is an upper bound. Spread rate is the de Ris thin-fuel formula for the cotton-fibreglass fabric burned in BASS and Saffire: an upper estimate that leaves out radiative quenching. Under gravity a flame makes its own draft; the draft speed is a scale estimate, and no test in NASA PSI was run in partial gravity, so its effect on spread is not modelled. The leak figure is the oxygen that raises this sealed cabin by five points. Test counts come from EMBER's harvest of NASA PSI.`, [
    'ppO₂ = x_O₂ · p',
    'T_f = T₀ + Y_O ΔH_O / (c_p (1 + Y_O / ν))',
    'V = (π/4) k_g (T_f − T_v) / (ρ_s τ c_s (T_v − T₀))',
    'U_b = (g α (T_f − T₀) / T₀)^⅓',
    'Δm_O₂ = n Δx / (1 − x − Δx) · M',
  ])
  lab.onTick((dt) => {
    solve(); sim.t += dt
    const ratio = sim.V / sim.V0, z = sim.z
    const state = sim.broken ? 'oxygen leak' : Math.abs(ratio - 1) < 0.02 ? 'sea-level air' : `${ratio > 1 ? '+' : '−'}${fmt(Math.abs(ratio - 1) * 100)} % vs ISS air`
    const draft = sim.g > 0.005 ? `own draft ≈ ${fmt(sim.Ub * 100)} cm/s at ${fmt(sim.g, 2)} g` : 'no buoyant draft in free fall'
    const ev = z ? `${fmt(z.total)} PSI tests near this air · ${z.solid} on solids${z.solid === 0 ? ` · <span class="ember-flag">none above ${fmt(z.solidMax, 1)} % O₂</span>` : ''}` : 'open in EMBER for the PSI evidence'
    const leak = sim.broken ? `<br><span class="ember-flag">⚠ ${fmt(sim.leakWas, sim.leakWas < 10 ? 1 : 0)} kg of leaked oxygen is enough to do this here</span>` : ''
    lab.setHero(sim.V, { state, sub: `ppO₂ ${fmt(sim.pp, 1)} kPa · flame ≤ ${fmt(sim.Tf)} K · ${draft}<br>${ev}${leak}`, bad: sim.broken || !!(z && z.solid === 0) })
  })
  lab.breakIt({
    label: 'Oxygen leak: +5 points',
    run() { solve(); sim.saved = [o2S.value, pS.value]; sim.leakWas = sim.leak; const p2 = sim.leakPsi; sim.broken = true; o2S.set(Math.min(50, o2S.value + 5)); pS.set(Math.min(30, p2)) },
    reset() { sim.broken = false; if (sim.saved) { o2S.set(sim.saved[0]); pS.set(sim.saved[1]) } },
  })
  bridge(lab, id, {
    setRow() {},
    state: () => ({ spread_mm_s: +sim.V.toFixed(2), ppO2_kPa: +sim.pp.toFixed(1), flameT_K: Math.round(sim.Tf), o2Mass_kg: +sim.mO2.toFixed(1), draft_cm_s: +(sim.Ub * 100).toFixed(1), leak_kg_for_5_points: +sim.leak.toFixed(1), g: sim.g, o2: o2S.value, psi: pS.value, zone: sim.z }),
  })
  const base = window.EMBER_MACHINE.setScenario
  window.EMBER_MACHINE.setScenario = (s = {}) => { if (s.g != null && isFinite(+s.g)) sim.g = +s.g; base(s) }
  return sim
}
