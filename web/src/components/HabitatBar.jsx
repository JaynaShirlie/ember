import React, { useState } from 'react'
import { HABITATS } from '../lib/habitats.js'

// One compact scenario row: pick a habitat, read its air, open the sliders only when a custom atmosphere is needed.
export default function HabitatBar({ hab, setHab }) {
  const [open, setOpen] = useState(false)
  const custom = k => e => setHab({ ...hab, id: 'custom', name: 'Custom air', [k]: +e.target.value, ...(k === 'g' && { gLabel: (+e.target.value).toFixed(2) + ' g' }) })
  return (
    <div className="scenario">
      <div className="seg" role="group" aria-label="Habitat">
        {HABITATS.map(h => (
          <button key={h.id} className={hab.id === h.id ? 'on' : ''} aria-pressed={hab.id === h.id} onClick={() => setHab({ ...h })} title={`${h.o2}% O₂ · ${h.psi} psi · ${h.gLabel}. ${h.note}`}>{h.short}</button>
        ))}
        {hab.id === 'custom' && <button className="on" aria-pressed="true">Custom</button>}
      </div>
      <div className="readout"><b>{hab.o2.toFixed(1)}%</b> O₂<b>{hab.psi.toFixed(1)}</b> psi<b>{hab.g.toFixed(2)}</b> g</div>
      <button className="btn small" aria-expanded={open} onClick={() => setOpen(o => !o)}>{open ? 'Done' : 'Adjust'}</button>
      {open && <div className="sliders">
        <label className="slider"><span>Oxygen <b>{hab.o2.toFixed(1)}%</b></span>
          <input type="range" min="10" max="100" step="0.5" value={hab.o2} onChange={custom('o2')} /></label>
        <label className="slider"><span>Pressure <b>{hab.psi.toFixed(1)} psi</b></span>
          <input type="range" min="3" max="30" step="0.1" value={hab.psi} onChange={custom('psi')} /></label>
        <label className="slider"><span>Gravity <b>{hab.g.toFixed(2)} g</b></span>
          <input type="range" min="0" max="1" step="0.01" value={hab.g} onChange={custom('g')} /></label>
      </div>}
    </div>
  )
}
