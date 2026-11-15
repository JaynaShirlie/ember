// Evidence readiness for one habitat atmosphere: five checks, each Measured / Thin / Missing, computed from the
// harvested NASA PSI test records and the FLEX model. Used by the Brief view and by the copilot's readiness tool.
// The thresholds are judgement calls and are shown to the user in the Brief ("How the checks are scored").
// SI disclosure: written with assistance from Claude (Anthropic).
import { zoneStats } from './score.js'

export const TOL = { o2: 4, psi: 2 }
export const WORD = { ok: 'Measured', thin: 'Thin', none: 'Missing' }

export function readiness({ data, hab, assess }) {
  const zone = zoneStats(data.tests, hab, TOL.o2, TOL.psi)
  const measured = zone.tests.filter(t => t.o2Basis === 'measured' && t.pressureBasis === 'measured').reduce((a, t) => a + (t.count || 1), 0)
  const share = zone.total ? measured / zone.total : 0
  const solidMax = Math.max(...data.tests.filter(t => t.fuelClass === 'solid' && t.o2Pct).map(t => t.o2Pct))
  const a = assess({ o2: hab.o2, psi: hab.psi, fuel: 'Heptane' })
  const micro = hab.g <= 0.01
  const checks = [
    { id: 'air', q: 'Tests near this air', state: zone.total === 0 ? 'none' : zone.total < 30 ? 'thin' : 'ok', value: zone.total.toLocaleString(),
      note: `within ±${TOL.o2} points O₂ and ±${TOL.psi} psi`, why: zone.total === 0 ? 'no tests near this air' : 'few tests near this air', to: 'gap' },
    { id: 'solid', q: 'Solid materials burned near this air', state: zone.by.solid === 0 ? 'none' : zone.by.solid < 10 ? 'thin' : 'ok', value: String(zone.by.solid),
      note: zone.by.solid === 0 ? `no solid in PSI was burned above ${solidMax.toFixed(1)}% O₂` : 'fabrics and plastics, the fuels of a cabin fire', why: zone.by.solid === 0 ? 'no solid-material tests' : 'few solid-material tests', to: 'gap' },
    { id: 'basis', q: 'Conditions recorded, not assumed', state: !zone.total ? 'none' : share < 0.8 ? 'thin' : 'ok', value: Math.round(share * 100) + '%',
      note: 'of those tests state both O₂ and pressure in their table', why: zone.total ? 'conditions partly assumed' : 'no recorded conditions', to: 'atlas' },
    { id: 'g', q: micro ? 'Tests in microgravity' : `Tests at ${hab.g.toFixed(2)} g`, state: micro ? 'ok' : 'none', value: micro ? 'All' : '0',
      note: micro ? 'every PSI flight test ran in orbit' : 'PSI holds no partial-gravity combustion data', why: `nothing measured at ${hab.g.toFixed(2)} g`, to: null },
    { id: 'model', q: 'Model backed by nearby tests', state: a.support > 0.5 ? 'ok' : a.support > 0.15 ? 'thin' : 'none', value: Math.round(a.support * 100) + '%',
      note: `droplet burning rate ${a.mean.toFixed(2)} ± ${(1.96 * a.std).toFixed(2)} mm²/s`, why: a.support > 0.15 ? 'model near its edge' : 'model is extrapolating', to: 'landscape' },
  ]
  const pass = checks.filter(c => c.state === 'ok').length
  const open = checks.filter(c => c.state !== 'ok')
  const missing = open.some(c => c.state === 'none')
  const title = pass === checks.length ? 'Evidence in hand for design work.' : missing ? 'Not enough evidence to certify materials here.' : 'Usable, with thin spots.'
  const sub = pass === checks.length ? 'All five checks are met by NASA PSI data.' : 'From PSI evidence alone: ' + open.map(c => c.why).join(', ') + '.'
  return { zone, checks, pass, open, missing, solidMax, title, sub }
}
