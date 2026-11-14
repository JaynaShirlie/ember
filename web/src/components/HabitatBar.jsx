import React from 'react'
import { HABITATS } from '../lib/habitats.js'

export default function HabitatBar({ hab, setHab }) {
  return (
    <div className="habitat">
      <div>
        <div className="label">HABITAT</div>
        <div className="chips" style={{ marginTop: 6 }}>
          {HABITATS.map(h => (
            <button key={h.id} className={'chip' + (hab.id === h.id ? ' on' : '')} onClick={() => setHab({ ...h })} title={h.note}>
              {h.name}<small>{h.o2}% O₂ · {h.psi} psi · {h.gLabel}</small>
            </button>
          ))}
        </div>
      </div>
      <div className="sliders">
        <label className="slider"><span>Oxygen <b>{hab.o2.toFixed(1)}%</b></span>
          <input type="range" min="10" max="100" step="0.5" value={hab.o2} onChange={e => setHab({ ...hab, id: 'custom', name: 'Custom', o2: +e.target.value })} /></label>
        <label className="slider"><span>Pressure <b>{hab.psi.toFixed(1)} psi</b></span>
          <input type="range" min="3" max="30" step="0.1" value={hab.psi} onChange={e => setHab({ ...hab, id: 'custom', name: 'Custom', psi: +e.target.value })} /></label>
        <label className="slider"><span>Gravity <b>{hab.g.toFixed(2)} g</b></span>
          <input type="range" min="0" max="1" step="0.01" value={hab.g} onChange={e => setHab({ ...hab, id: 'custom', name: 'Custom', g: +e.target.value, gLabel: (+e.target.value).toFixed(2) + ' g' })} /></label>
      </div>
    </div>
  )
}
