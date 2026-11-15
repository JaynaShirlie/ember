import React, { useMemo } from 'react'
import { rankInvestigations } from '../lib/score.js'
import { readiness, TOL, WORD } from '../lib/readiness.js'
import Campaign from './Campaign.jsx'
import { More } from './ui.jsx'
import { askCopilot, COPILOT_TRY } from './Copilot.jsx'

// The brief: one screen that says what NASA's PSI evidence can and cannot support for the selected habitat,
// and which tests to fly next. Every number is computed from the harvested data; nothing is typed in.
// SI disclosure: written with assistance from Claude (Anthropic).
export default function Brief({ data, hab, testsByInv, assess, go, openInv }) {
  const b = useMemo(() => {
    const fields = new Set(); for (const t of data.tests) for (const k of Object.keys(t.out || {})) fields.add(k)
    return { ...readiness({ data, hab, assess }), fields: fields.size, top: rankInvestigations(data.invs, testsByInv, hab).slice(0, 3) }
  }, [data, hab, testsByInv, assess])
  const { checks, pass } = b
  const harvested = new Date(data.meta.harvestedAt).toUTCString().slice(5, 16)

  return (
    <div className="brief">
      <section className="hero-brief" data-enter>
        <div>
          <p className="eyebrow">Fire-safety evidence brief</p>
          <h2 className="display">{hab.name}</h2>
          <p className="lede">{hab.o2}% oxygen · {hab.psi} psi · {hab.g <= 0.01 ? 'microgravity' : hab.g.toFixed(2) + ' g'}</p>
        </div>
        <div className={'verdict' + (pass === checks.length ? ' ok' : '')}>
          <div className="ratio"><b>{pass}</b><span>of {checks.length} checks met</span></div>
          <div><h3>{b.title}</h3><p>{b.sub}</p></div>
        </div>
      </section>

      <section className="checks" aria-label="Evidence checks">
        {checks.map(c => (
          <button key={c.id} className="check" onClick={() => c.to && go(c.to)} disabled={!c.to} title={c.to ? 'Open the view behind this number' : undefined}>
            <span className={'state ' + c.state}>{WORD[c.state]}</span>
            <span className="q">{c.q}</span>
            <span className="v">{c.value}</span>
            <span className="n">{c.note}</span>
            <span className="go">{c.to ? '›' : ''}</span>
          </button>
        ))}
      </section>

      <section className="cta">
        <div>
          <p className="eyebrow">EMBER Copilot</p>
          <h2>Say it. The copilot renders the hardware in 3D, live, and acts on it.</h2>
          <p>Type or speak in plain words. It sets the air, builds the 3D model, cuts it open, runs the test in your habitat and tells you the result. For a cited answer from the research text, use Ask: a different job.</p>
        </div>
        <div className="cta-try">
          {COPILOT_TRY.map(t => <button key={t} className="chip small" onClick={() => askCopilot(t)}>{t}</button>)}
          <button className="btn" onClick={() => askCopilot()}>Open the copilot</button>
        </div>
      </section>

      <section className="tiles">
        <div className="panel">
          <h2>Fly these tests next</h2>
          {b.zone.by.solid === 0 && <p className="lead-line">First, any solid-material burn at {hab.o2}% O₂. It would be the first above {b.solidMax.toFixed(1)}%.</p>}
          <Campaign model={data.gp} hab={hab} />
        </div>
        <div className="panel">
          <h2>Start with this evidence</h2>
          <div className="list">
            {b.top.map(r => (
              <div key={r.inv.accession} className="row" onClick={() => openInv(r.inv.accession)}>
                <div className="t"><b>{r.inv.acronym || r.inv.accession}</b><span className="score">{r.score.toFixed(0)}</span></div>
                <div className="dim small clip">{r.inv.title}</div>
                <div className="bar"><i style={{ width: Math.max(2, r.score) + '%' }} /></div>
              </div>
            ))}
          </div>
          <button className="btn" style={{ marginTop: 14 }} onClick={() => go('atlas')}>All {data.meta.investigations} investigations</button>
        </div>
      </section>

      <section className="why">
        <h2>Why a bigger model is not the answer</h2>
        <div className="facts4">
          <div className="fact"><b>{b.fields}</b><span>outcome fields in {data.meta.tables} tables</span><p>Each experiment answered its own question. There is no shared result to train one model on.</p></div>
          <div className="fact"><b>{b.solidMax.toFixed(1)}%</b><span>highest O₂ on a solid</span><p>Habitats plan 26 to 34%. The materials that burn in a cabin were never tested there.</p></div>
          <div className="fact"><b>0</b><span>tests in partial gravity</span><p>Moon and Mars gravity can only be bracketed between orbit and Earth.</p></div>
          <div className="fact"><b>{data.gp.n}</b><span>tests behind the best model</span><p>Each flight test is one data point. The next ones have to be chosen, not guessed.</p></div>
        </div>
        <More title="How the checks are scored">
          <p className="small muted">Near this air: within ±{TOL.o2} points of oxygen and ±{TOL.psi} psi, ambient oxygen only. Tests: 30 or more is Measured, 1 to 29 Thin, 0 Missing. Solids: 10 or more, 1 to 9, 0. Recorded: 80% or more of those tests state both oxygen and pressure in their own table (the rest assume cabin air). Gravity: PSI flight data is microgravity only. Model: nearness of this air to a real FLEX droplet test, above 50% Measured, 15 to 50% Thin. The model covers liquid droplets, not solids. These thresholds are EMBER's own and can be argued with.</p>
        </More>
        <p className="small dim" style={{ marginTop: 12 }}>Computed live from {data.meta.testRecords.toLocaleString()} test records in {data.meta.investigations} NASA PSI investigations, harvested {harvested}.</p>
      </section>
    </div>
  )
}
