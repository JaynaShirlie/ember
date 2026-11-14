// Transparent relevance scoring. Shown to the user in full, so engineers can audit why something ranks high.
// Score = 100 × Closeness × Material × Evidence
//   Closeness: how near the investigation's measured conditions come to the habitat (O₂ within ~5 points, pressure within ~2.5 psi)
//   Material : cabin fires are mostly solid materials, so solids weigh most
//   Evidence : more tests = more trustworthy (log scale, saturates at 100 tests)

export const MATERIAL_WEIGHT = { solid: 1.0, liquid: 0.6, gas: 0.45, aerosol: 0.3 }
export const SCALE = { o2: 5, psi: 2.5 }
const BASIS_WEIGHT = { measured: 1, 'test-matrix': 0.8, 'assumed-cabin': 0.7 }

export function proximity(t, hab) {
  if (t.o2Pct == null || t.pressurePsi == null || t.o2Basis === 'oxidizer-stream') return 0
  const dO = (t.o2Pct - hab.o2) / SCALE.o2, dP = (t.pressurePsi - hab.psi) / SCALE.psi
  const basis = Math.min(BASIS_WEIGHT[t.o2Basis] ?? 0.5, BASIS_WEIGHT[t.pressureBasis] ?? 0.5)
  return Math.exp(-0.5 * (dO * dO + dP * dP)) * basis
}

export function rankInvestigations(invs, testsByInv, hab) {
  return invs.map(inv => {
    const ts = testsByInv[inv.accession] || []
    let best = 0, bestTest = null
    for (const t of ts) { const p = proximity(t, hab); if (p > best) { best = p; bestTest = t } }
    const material = Math.max(0, ...inv.fuelClasses.map(c => MATERIAL_WEIGHT[c] ?? 0.3))
    const evidence = Math.min(1, Math.log10(1 + inv.nTests) / 2)
    const score = 100 * best * (material || 0.3) * evidence
    return { inv, score, parts: { closeness: best, material: material || 0.3, evidence }, bestTest }
  }).sort((a, b) => b.score - a.score)
}

// Tests inside a habitat's "zone": ±tolO2 points of O₂ and ±tolPsi psi. Ambient O₂ only.
export function zoneStats(tests, hab, tolO2 = 4, tolPsi = 2) {
  const inZone = tests.filter(t => !t.matrix && t.o2Pct != null && t.pressurePsi != null && t.o2Basis !== 'oxidizer-stream'
    && Math.abs(t.o2Pct - hab.o2) <= tolO2 && Math.abs(t.pressurePsi - hab.psi) <= tolPsi)
  const by = { solid: 0, liquid: 0, gas: 0, aerosol: 0 }
  for (const t of inZone) by[t.fuelClass] += t.count || 1
  const invs = [...new Set(inZone.map(t => t.inv))]
  return { total: inZone.reduce((a, t) => a + (t.count || 1), 0), by, invs, tests: inZone }
}
