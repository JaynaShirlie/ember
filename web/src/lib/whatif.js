// What-if engine: "put this experiment / material into this habitat atmosphere: what happens?"
// Combines (1) nearest real NASA tests, (2) trained models where they apply, (3) explicit extrapolation flags.
// Never invents a number: everything returned is a data lookup or a model output with its validation stats.
// SI disclosure: written with assistance from Claude (Anthropic).
import { makeClassifier, CARBON } from './models.js'

const LIQUID = new Set(['PSI-69', 'PSI-68', 'PSI-39'])
const GAS = new Set(['PSI-159', 'PSI-10', 'PSI-20', 'PSI-21', 'PSI-22', 'PSI-23', 'PSI-106', 'PSI-107'])

export function makeWhatIf({ data, testsByInv, assess }) {
  const ign = makeClassifier(data.clf.ignition), ext = makeClassifier(data.clf.extinction)
  const byId = Object.fromEntries(data.invs.map(i => [i.accession, i]))
  const solidMax = Math.max(...data.tests.filter(t => t.fuelClass === 'solid' && t.o2Pct).map(t => t.o2Pct))
  const flexD0 = data.tests.filter(t => t.inv === 'PSI-69' && t.out?.d0_mm).map(t => t.out.d0_mm).sort((a, b) => a - b)
  const medianD0 = flexD0[Math.floor(flexD0.length / 2)] || 3

  function nearestTests(inv, s, k = 3) {
    return (testsByInv[inv] || []).filter(t => !t.matrix && t.o2Pct != null && t.pressurePsi != null && t.o2Basis !== 'oxidizer-stream')
      .map(t => ({ t, d: Math.hypot((t.o2Pct - s.o2) / 5, (t.pressurePsi - s.psi) / 2.5) }))
      .sort((a, b) => a.d - b.d).slice(0, k)
      .map(({ t, d }) => ({ id: t.id, fuel: t.fuel, o2Pct: +t.o2Pct.toFixed(1), psi: +t.pressurePsi.toFixed(1), flowCmS: t.flowCmS ?? null,
        basis: t.o2Basis === 'measured' && t.pressureBasis === 'measured' ? 'measured' : 'partly assumed', distance: +d.toFixed(2), outcome: t.out }))
  }

  return function whatIf({ scenario, investigation, fuel, co2 = 0, he = 0, d0 }) {
    const inv = byId[investigation]
    if (!inv) return { error: `Unknown investigation ${investigation}. Use search_psi to find one.` }
    const s = { o2: +scenario.o2, psi: +scenario.psi, g: +(scenario.g || 0), name: scenario.name || 'custom' }
    const near = nearestTests(investigation, s)
    const res = {
      scenario: s, investigation: { id: inv.accession, acronym: inv.acronym, title: inv.title, fuelClasses: inv.fuelClasses, o2Range: inv.o2Range, pressureRange: inv.pressureRange },
      nearestRealTests: near, closestDistance: near[0]?.distance ?? null, models: [], flags: [],
    }
    if (s.g > 0.01) res.flags.push(`All PSI flight data is microgravity; nothing was measured at ${s.g.toFixed(2)} g. Buoyancy changes oxygen supply, and NASA researchers suggest solid flame spread may peak near lunar gravity.`)
    if (!near.length) res.flags.push('This investigation\'s table records no usable O₂ + pressure conditions.')
    else if (near[0].distance > 1.5) res.flags.push(`Closest real ${inv.acronym || inv.accession} test is far from this atmosphere (distance ${near[0].distance}); results are extrapolations.`)

    if (LIQUID.has(investigation)) {
      const f = /meth/i.test(fuel || '') ? 'Methanol' : 'Heptane'
      const dd = d0 || medianD0
      const a = assess({ o2: s.o2, psi: s.psi, co2, he, fuel: f })
      res.models.push({ model: 'Gaussian process (FLEX, PSI-69)', output: 'droplet burning-rate constant K', value: +a.mean.toFixed(3), plusMinus95: +(1.96 * a.std).toFixed(3), units: 'mm²/s',
        testSupport: +a.support.toFixed(2), uncertainty: +a.u.toFixed(2), inTrainingRange: a.inRange, validation: data.gp.cv })
      const e = ext({ o2Pct: s.o2, pressurePsi: s.psi, co2, he, d0_mm: dd, heptane: f === 'Heptane' ? 1 : 0 })
      res.models.push({ model: 'Logistic classifier (FLEX, PSI-69)', output: `P(flame self-extinguishes before burnout), ${f}, d₀=${dd} mm`, value: +e.p.toFixed(2), validation: e.cv, outsideTraining: e.outside })
      res.assumptions = { fuel: f, d0_mm: dd, co2, he }
    } else if (GAS.has(investigation)) {
      const fl = String(fuel || 'propane').toLowerCase()
      const cn = Object.entries(CARBON).find(([k]) => fl.includes(k))?.[1] ?? 3
      const xf = /100%|pure/.test(fl) ? 1 : (parseFloat(fl) / 100 || 0.3)
      const i = ign({ o2Pct: s.o2, pressurePsi: s.psi, fuelFraction: xf, carbonNumber: cn, logFuelFlow: Math.log(2) })
      res.models.push({ model: 'Logistic classifier (ACME CFI-G, PSI-159)', output: `P(hot flame ignites), ${Object.keys(CARBON).find(k => CARBON[k] === cn)} at fuel fraction ${xf}`, value: +i.p.toFixed(2), validation: i.cv, outsideTraining: i.outside })
      res.assumptions = { fuel: fl, fuelFraction: xf, fuelFlow_mg_s: 2 }
    } else {
      res.models.push({ model: 'none', output: 'No trained model: PSI solid-material tables do not record flame-spread rates or ignition outcomes.', value: null })
      res.solidEvidence = { highestO2EverTestedForSolids: solidMax, atmosphereAbove: s.o2 > solidMax }
      if (s.o2 > solidMax) res.flags.push(`No solid material in PSI was ever burned above ${solidMax.toFixed(1)}% O₂; ${s.o2}% is untested territory for solids.`)
      res.flags.push('Related finding (ACME BRE, PSI-20): flames kept burning without air flow in elevated-oxygen atmospheres, where stopping ventilation is a standard fire response.')
    }
    for (const m of res.models) if (m.outsideTraining?.length) res.flags.push(`${m.model}: input outside training range: ${m.outsideTraining.join('; ')}.`)
    return res
  }
}
