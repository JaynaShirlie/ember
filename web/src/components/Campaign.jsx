import React, { useMemo, useState } from 'react'
import { planCampaign, campaignTargets, groupPicks } from '../lib/campaign.js'

// Test-campaign optimizer: given N flight test slots, which atmospheres to burn at so the model's uncertainty
// falls the most across the habitat atmospheres. Computed from the Gaussian process (lib/campaign.js).
// SI disclosure: written with assistance from Claude (Anthropic).
export default function Campaign({ model, hab, fuel = 'Heptane', co2 = 0, he = 0 }) {
  const [n, setN] = useState(5)
  const targets = useMemo(() => campaignTargets(hab), [hab.o2, hab.psi, hab.name])
  const plan = useMemo(() => planCampaign(model, { targets, fuel, co2, he, n }), [model, targets, fuel, co2, he, n])
  const groups = groupPicks(plan.picks)
  const cut = Math.round(100 * (1 - plan.after / plan.before))
  return <div className="campaign">
    <div className="stepper">
      <span>Flight test slots</span>
      <button className="btn small" onClick={() => setN(v => Math.max(1, v - 1))} aria-label="Fewer tests" disabled={n <= 1}>−</button>
      <b aria-live="polite">{n}</b>
      <button className="btn small" onClick={() => setN(v => Math.min(12, v + 1))} aria-label="More tests" disabled={n >= 12}>+</button>
    </div>
    <div className="shrink"><span>±{plan.before.toFixed(3)}</span><i>→</i><span>±{plan.after.toFixed(3)}</span><small>mm²/s · {cut}% tighter</small></div>
    <ol className="picks">{groups.map((g, i) => <li key={i}><b>{g.n} ×</b> {g.o2}% O₂ · {g.psi} psi{g.target && <span className="dim"> · {g.target}</span>}</li>)}</ol>
    <div className="small dim">Mean 95% band on {fuel.toLowerCase()} droplet burning rate across {targets.length} habitat atmospheres. The optimizer favours the edges of the envelope, where one test pins the trend for every habitat at once. Each test carries the scatter seen in NASA FLEX (±{(1.96 * plan.noiseStd).toFixed(2)} mm²/s). Assumes the model stays smooth out there. Microgravity, liquid fuel only.</div>
  </div>
}
