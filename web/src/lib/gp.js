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

// Retrain in the browser with a scientist's extra tests (same kernel hyperparameters as the NASA-trained model).
// extra: [{ fuel:'Heptane'|'Methanol', o2 (%), p (psi), co2 (0-1), he (0-1), K (mm²/s) }]
export function retrainGP(m, extra) {
  const rows = [...m.points.map(p => ({ ...p, user: false })), ...extra.map(p => ({ ...p, user: true, end: p.end || 'user', id: p.id || 'user' }))]
  const X = rows.map(r => [r.o2 / 100, r.p / 14.696, r.co2 || 0, r.he || 0, /hept/i.test(r.fuel) ? 1 : 0].map((v, i) => (v - m.xMean[i]) / m.xStd[i]))
  const y = rows.map(r => (r.K - m.yMean) / m.yStd), n = X.length, d = X[0].length, ls = m.lengthScales
  const K = Array.from({ length: n }, (_, i) => new Float64Array(n))
  for (let i = 0; i < n; i++) for (let j = 0; j <= i; j++) {
    let s = 0; for (let k = 0; k < d; k++) { const t = (X[i][k] - X[j][k]) / ls[k]; s += t * t }
    K[i][j] = K[j][i] = m.constant * Math.exp(-0.5 * s) + (i === j ? m.noise + 1e-10 : 0)
  }
  const L = Array.from({ length: n }, () => new Float64Array(n)) // Cholesky
  for (let i = 0; i < n; i++) for (let j = 0; j <= i; j++) {
    let s = K[i][j]; for (let k = 0; k < j; k++) s -= L[i][k] * L[j][k]
    L[i][j] = i === j ? Math.sqrt(Math.max(s, 1e-12)) : s / L[j][j]
  }
  const z = new Float64Array(n); for (let i = 0; i < n; i++) { let s = y[i]; for (let k = 0; k < i; k++) s -= L[i][k] * z[k]; z[i] = s / L[i][i] }
  const alpha = new Float64Array(n); for (let i = n - 1; i >= 0; i--) { let s = z[i]; for (let k = i + 1; k < n; k++) s -= L[k][i] * alpha[k]; alpha[i] = s / L[i][i] }
  const tr = { ...m.trainRanges }
  ;['o2', 'p_atm', 'co2', 'he'].forEach((f, i) => { const vals = rows.map(r => [r.o2 / 100, r.p / 14.696, r.co2 || 0, r.he || 0][i]); tr[f] = [Math.min(...vals), Math.max(...vals)] })
  return { ...m, n, Xtrain: X, alpha: Array.from(alpha), L: L.map(r => Array.from(r)), points: rows, trainRanges: tr, userPoints: extra.length }
}

export function parseTestsCSV(text) {
  const lines = String(text).trim().split(/\r?\n/).filter(Boolean)
  const head = lines.shift().toLowerCase().split(',').map(s => s.trim())
  const idx = k => head.findIndex(h => h.startsWith(k))
  const c = { fuel: idx('fuel'), o2: idx('o2'), p: idx('pressure'), co2: idx('co2'), he: idx('he'), K: idx('k') }
  if (c.o2 < 0 || c.p < 0 || c.K < 0) throw new Error('CSV needs columns: fuel, o2_pct, pressure_psi, co2, he, K_mm2s')
  return lines.map((l, i) => { const v = l.split(',').map(s => s.trim())
    const r = { fuel: /meth/i.test(v[c.fuel] || '') ? 'Methanol' : 'Heptane', o2: +v[c.o2], p: +v[c.p], co2: c.co2 >= 0 ? +v[c.co2] || 0 : 0, he: c.he >= 0 ? +v[c.he] || 0 : 0, K: +v[c.K], id: 'user-' + (i + 1) }
    if (![r.o2, r.p, r.K].every(Number.isFinite) || r.o2 <= 0 || r.p <= 0 || r.K <= 0) throw new Error(`Row ${i + 2} has an invalid value`)
    return r })
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
