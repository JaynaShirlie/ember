// Gaussian-process prediction in the browser, using the model trained in pipeline/build.py
// on NASA PSI-69 FLEX data. Kernel: C * RBF(ARD) + White (noise is already inside L).
// SI disclosure: written with assistance from Claude (Anthropic).

export function makeGP(m) {
  const n = m.Xtrain.length, d = m.features.length
  const L = m.L, X = m.Xtrain, alpha = m.alpha, ls = m.lengthScales
  const kstar = new Float64Array(n), v = new Float64Array(n)

  function scale(x) { return x.map((xi, i) => (xi - m.xMean[i]) / m.xStd[i]) }

  function predict(raw) {
    const x = scale(raw)
    let mean = 0
    for (let i = 0; i < n; i++) {
      let s = 0
      const xi = X[i]
      for (let j = 0; j < d; j++) { const t = (x[j] - xi[j]) / ls[j]; s += t * t }
      kstar[i] = m.constant * Math.exp(-0.5 * s)
      mean += kstar[i] * alpha[i]
    }
    // forward substitution: L v = k*
    let vv = 0
    for (let i = 0; i < n; i++) {
      let s = kstar[i]
      const Li = L[i]
      for (let j = 0; j < i; j++) s -= Li[j] * v[j]
      v[i] = s / Li[i]
      vv += v[i] * v[i]
    }
    const varZ = Math.max(m.constant - vv, 1e-12)
    return { mean: mean * m.yStd + m.yMean, std: Math.sqrt(varZ) * m.yStd }
  }

  // Is the query inside the range of the training data? (outside = extrapolation, shown as fog)
  function inRange(raw) {
    return m.features.every((f, i) => raw[i] >= m.trainRanges[f][0] - 1e-9 && raw[i] <= m.trainRanges[f][1] + 1e-9)
  }

  return { predict, inRange }
}

// Prediction + applicability domain: uncertainty grows with GP variance AND distance from tested conditions.
export const DOMAIN = { o2: 3, psi: 2.5, co2: 0.08, he: 0.08 }
export function makeAssessor(gp, m, points) {
  const prior = Math.sqrt(m.constant) * m.yStd
  return function assess({ o2, psi, co2 = 0, he = 0, fuel = 'Heptane' }) {
    const pts = (points || m.points).filter(p => p.fuel === fuel)
    const r = gp.predict([o2 / 100, psi / 14.696, co2, he, fuel === 'Heptane' ? 1 : 0])
    let d2 = Infinity, nearest = null
    for (const p of pts) {
      const a = (o2 - p.o2) / DOMAIN.o2, b = (psi - p.p) / DOMAIN.psi, c = (co2 - p.co2) / DOMAIN.co2, e = (he - p.he) / DOMAIN.he
      const v = a * a + b * b + c * c + e * e; if (v < d2) { d2 = v; nearest = p }
    }
    const support = Math.exp(-0.5 * d2), uGP = Math.min(1, r.std / prior)
    return { ...r, support, uGP, nearest, u: Math.min(1, Math.sqrt(uGP * uGP + (1 - support) * (1 - support))), inRange: gp.inRange([o2 / 100, psi / 14.696, co2, he, fuel === 'Heptane' ? 1 : 0]) }
  }
}

// Rank grid cells by predictive uncertainty: where a new test would teach the model the most.
export function nextBestExperiments(gp, { fuel, co2, he, o2Range, pRange, steps = 28, top = 3, minSepO2 = 4, minSepP = 2.5 }) {
  const cells = []
  for (let i = 0; i < steps; i++) for (let j = 0; j < steps; j++) {
    const o2 = o2Range[0] + (o2Range[1] - o2Range[0]) * i / (steps - 1)
    const psi = pRange[0] + (pRange[1] - pRange[0]) * j / (steps - 1)
    if (o2 / 100 + co2 + he > 1) continue
    const r = gp.predict([o2 / 100, psi / 14.696, co2, he, fuel === 'Heptane' ? 1 : 0])
    cells.push({ o2, psi, ...r })
  }
  cells.sort((a, b) => b.std - a.std)
  const picks = []
  for (const c of cells) {
    if (picks.every(p => Math.abs(p.o2 - c.o2) > minSepO2 || Math.abs(p.psi - c.psi) > minSepP)) picks.push(c)
    if (picks.length >= top) break
  }
  return picks
}
