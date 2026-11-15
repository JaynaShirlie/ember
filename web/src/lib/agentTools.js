// Browser-side executors for the copilot's tools. Every result is computed from EMBER's real data.
// SI disclosure: written with assistance from Claude (Anthropic).
import { HABITATS } from './habitats.js'
import { rankInvestigations, zoneStats } from './score.js'

export function makeExecutors(ctx) {
  // ctx: { data, testsByInv, search, assess, whatIf, getHab, setHab, setTab, setCompare, setExplorer, setFocusInv }
  const byId = Object.fromEntries(ctx.data.invs.map(i => [i.accession, i]))
  const norm = id => { const m = String(id || '').toUpperCase().match(/PSI-?(\d+)/); if (m) return 'PSI-' + m[1]
    const hit = ctx.data.invs.find(i => (i.acronym || '').toLowerCase().replace(/[^a-z0-9]/g, '') === String(id).toLowerCase().replace(/[^a-z0-9]/g, '')); return hit?.accession || id }
  const brief = i => ({ id: i.accession, acronym: i.acronym, title: i.title, pillars: i.pillars, fuelClasses: i.fuelClasses, tests: i.nTests,
    o2Range: i.o2Range?.map(v => +v.toFixed(1)), pressureRangePsi: i.pressureRange?.map(v => +v.toFixed(1)), doi: i.doi })

  return {
    set_scenario({ preset, o2, psi, g }) {
      const base = HABITATS.find(h => h.id === preset) || ctx.getHab()
      const h = { ...base, ...(o2 != null && { o2: +o2 }), ...(psi != null && { psi: +psi }), ...(g != null && { g: +g }) }
      if (o2 != null || psi != null || g != null) { h.id = 'custom'; h.name = preset ? `${base.name} (modified)` : 'Custom'; h.gLabel = h.g.toFixed(2) + ' g' }
      ctx.setHab(h)
      return { scenario: { name: h.name, o2: h.o2, psi: h.psi, g: h.g } }
    },
    navigate({ view }) { ctx.setTab(view); return { opened: view } },
    explore_3d({ target, module, explode, experiment }) {
      ctx.setExplorer(e => ({ ...e, target: target === 'experiment' ? e.target : target, module: module || null, explode: explode ?? e.explode, experiment: experiment ? norm(experiment) : e.experiment, focus: experiment || target === 'experiment' ? 'apparatus' : 'habitat' }))
      ctx.setTab('explorer')
      return { opened: '3D explorer', target, module: module || null, experiment: experiment ? norm(experiment) : null }
    },
    what_if(a) {
      const h = ctx.getHab()
      const scenario = { name: h.name, o2: a.o2 ?? h.o2, psi: a.psi ?? h.psi, g: a.g ?? h.g }
      return ctx.whatIf({ scenario, investigation: norm(a.investigation), fuel: a.fuel, co2: a.co2 || 0, he: a.he || 0, d0: a.d0_mm })
    },
    search_psi({ query }) {
      return { results: ctx.search(query, 5).map(r => { const i = byId[r.id]; return { ...brief(i), excerpt: (i.objective || '').slice(0, 400), impacts: (i.impacts || '').slice(0, 300) } }) }
    },
    get_investigation({ id }) {
      const i = byId[norm(id)]; if (!i) return { error: 'not found' }
      const outs = new Set(); for (const t of ctx.testsByInv[i.accession] || []) for (const [k, v] of Object.entries(t.out || {})) if (v != null && v !== '') outs.add(k)
      ctx.setFocusInv(i.accession)
      return { ...brief(i), objective: (i.objective || '').slice(0, 900), approach: (i.approach || '').slice(0, 700), hardware: i.hardware, fuels: i.fuels.slice(0, 12), measured: [...outs], publications: (i.publications || []).slice(0, 4).map(p => p.title) }
    },
    gap_stats({ tol_o2 = 4, tol_psi = 2 } = {}) {
      const h = ctx.getHab(), z = zoneStats(ctx.data.tests, h, tol_o2, tol_psi)
      let firstSolid = null
      for (let m = 1; m <= 6; m += 0.25) { const zz = zoneStats(ctx.data.tests, h, 4 * m, 2 * m); if (zz.by.solid > 0) { firstSolid = { tol_o2: 4 * m, tol_psi: 2 * m, solidTests: zz.by.solid }; break } }
      const solidMax = Math.max(...ctx.data.tests.filter(t => t.fuelClass === 'solid' && t.o2Pct).map(t => t.o2Pct))
      return { scenario: { name: h.name, o2: h.o2, psi: h.psi }, window: { tol_o2, tol_psi }, testsByClass: z.by, total: z.total, investigations: z.invs, highestO2EverForSolids: solidMax, firstSolidAppearsAt: firstSolid }
    },
    rank_for_scenario({ top = 5 } = {}) {
      return { ranked: rankInvestigations(ctx.data.invs, ctx.testsByInv, ctx.getHab()).slice(0, top).map(r => ({ id: r.inv.accession, acronym: r.inv.acronym, score: +r.score.toFixed(1), closeness: +r.parts.closeness.toFixed(2) })) }
    },
    next_best_experiments({ fuel = 'Heptane', co2 = 0, he = 0 } = {}) {
      const h = ctx.getHab(), cells = []
      for (let o2 = 14; o2 <= 40; o2 += 1) for (let psi = 4; psi <= 22; psi += 0.75) {
        if (o2 / 100 + co2 + he > 1) continue
        const a = ctx.assess({ o2, psi, co2, he, fuel })
        cells.push({ o2, psi: +psi.toFixed(2), predictedK: +a.mean.toFixed(3), uncertainty: a.u, score: a.u * (0.6 + 0.4 * Math.exp(-0.5 * (((o2 - h.o2) / 8) ** 2 + ((psi - h.psi) / 6) ** 2))) })
      }
      cells.sort((a, b) => b.score - a.score)
      const picks = []; for (const c of cells) { if (picks.every(p => Math.abs(p.o2 - c.o2) > 5 || Math.abs(p.psi - c.psi) > 3)) picks.push(c); if (picks.length === 3) break }
      return { fuel, co2, he, recommendations: picks.map(p => ({ o2Pct: p.o2, psi: p.psi, predictedK: p.predictedK, uncertaintyPct: Math.round(p.uncertainty * 100) })) }
    },
    compare({ ids }) {
      const list = (ids || []).map(norm).filter(id => byId[id]).slice(0, 3)
      ctx.setCompare(list); ctx.setTab('atlas')
      return { comparing: list.map(id => brief(byId[id])) }
    },
  }
}
