// Campaign design: which N flight tests shrink the model's uncertainty most across a set of target atmospheres?
// This is exact for a Gaussian process: the posterior covariance does not depend on the values a test will return,
// so the effect of a planned test is known before it flies. Greedy choice on the total variance removed over the
// targets; every planned test carries the same test-to-test scatter (noise) the model learned from NASA FLEX (PSI-69).
// Returns 95% half-widths of the predicted burning-rate constant, in mm²/s.
// SI disclosure: written with assistance from Claude (Anthropic).
import { HABITATS } from './habitats.js'

export function planCampaign(m, { targets, fuel = 'Heptane', co2 = 0, he = 0, n = 5, o2Range = [14, 40], pRange = [4, 22], stepO2 = 2, stepP = 1.5 }) {
  const N = m.Xtrain.length, d = m.features.length, L = m.L, X = m.Xtrain, ls = m.lengthScales
  const enc = (o2, psi) => [o2 / 100, psi / 14.696, co2, he, fuel === 'Heptane' ? 1 : 0].map((v, i) => (v - m.xMean[i]) / m.xStd[i])
  const kern = (a, b) => { let s = 0; for (let j = 0; j < d; j++) { const t = (a[j] - b[j]) / ls[j]; s += t * t } return m.constant * Math.exp(-0.5 * s) }
  const half = x => { const v = new Float64Array(N); for (let i = 0; i < N; i++) { let s = kern(x, X[i]); const Li = L[i]; for (let j = 0; j < i; j++) s -= Li[j] * v[j]; v[i] = s / Li[i] } return v }
  const dot = (a, b) => { let s = 0; for (let i = 0; i < N; i++) s += a[i] * b[i]; return s }
  const T = targets.length
  const pts = targets.map(t => ({ o2: t.o2, psi: t.psi, target: t.name }))        // 0..T-1: where we want to know
  for (const t of targets) pts.push({ o2: t.o2, psi: t.psi, target: t.name })      // candidates: the targets themselves
  for (let o2 = o2Range[0]; o2 <= o2Range[1] + 1e-9; o2 += stepO2) for (let psi = pRange[0]; psi <= pRange[1] + 1e-9; psi += stepP) if (o2 / 100 + co2 + he <= 1) pts.push({ o2, psi, target: null })
  const M = pts.length, xs = pts.map(p => enc(p.o2, p.psi)), vs = xs.map(half)
  const C = Array.from({ length: M }, () => new Float64Array(M))                     // posterior covariance (standardised units)
  for (let i = 0; i < M; i++) for (let j = 0; j <= i; j++) C[i][j] = C[j][i] = kern(xs[i], xs[j]) - dot(vs[i], vs[j])
  const each = () => targets.map((t, i) => 1.96 * m.yStd * Math.sqrt(Math.max(C[i][i], 1e-12)))
  const mean = a => a.reduce((s, v) => s + v, 0) / a.length
  const beforeEach = each(), picks = []
  for (let k = 0; k < n; k++) {
    let best = -1, gain = -1
    for (let c = T; c < M; c++) {
      const den = Math.max(C[c][c], 0) + m.noise
      let g = 0; for (let t = 0; t < T; t++) g += C[t][c] * C[t][c] / den
      if (g > gain + 1e-15) { gain = g; best = c }
    }
    const den = Math.max(C[best][best], 0) + m.noise, col = Float64Array.from(C[best])
    for (let i = 0; i < M; i++) { const f = col[i] / den; if (f) for (let j = 0; j < M; j++) C[i][j] -= f * col[j] }
    picks.push({ o2: pts[best].o2, psi: pts[best].psi, target: pts[best].target, band: mean(each()) })
  }
  const afterEach = each()
  return { before: mean(beforeEach), after: mean(afterEach), beforeEach, afterEach, picks, noiseStd: Math.sqrt(m.noise) * m.yStd }
}

// The atmospheres a campaign should serve: every habitat preset inside the model's oxygen range, plus a custom one.
export function campaignTargets(hab) {
  const seen = new Set(), out = []
  for (const h of HABITATS) { const k = h.o2 + '|' + h.psi; if (h.o2 <= 40 && !seen.has(k)) { seen.add(k); out.push({ name: h.short, o2: h.o2, psi: h.psi }) } }
  if (hab && hab.o2 <= 40 && !seen.has(hab.o2 + '|' + hab.psi)) out.push({ name: hab.name, o2: hab.o2, psi: hab.psi })
  return out
}

// Same picks grouped: "3 × 34% O₂ · 8.2 psi"
export function groupPicks(picks) {
  const groups = []
  for (const p of picks) { const g = groups.find(g => g.o2 === p.o2 && g.psi === p.psi); if (g) g.n++; else groups.push({ o2: p.o2, psi: p.psi, target: p.target, n: 1 }) }
  return groups
}
