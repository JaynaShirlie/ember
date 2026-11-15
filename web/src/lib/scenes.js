// Procedural scene specs for the 3D explorer. Habitat geometry uses approximate public dimensions (metres);
// experiment apparatus is generated from each PSI test row's recorded values.
// SI disclosure: written with assistance from Claude (Anthropic).

// ---- ISS (approximate dimensions of public module specs; layout simplified) ----
export const ISS = {
  name: 'International Space Station', atmosphereNote: 'Cabin air ≈ 14.7 psi, 21% O₂',
  parts: [
    { id: 'zvezda', name: 'Zvezda service module', kind: 'cyl', len: 13.1, dia: 4.15, pos: [-22.5, 0, 0], axis: 'x', info: 'Russian segment living quarters and life support: Elektron oxygen generator, plus solid-fuel oxygen candles, the same kind of device behind the 1997 Mir fire.' },
    { id: 'zarya', name: 'Zarya (FGB)', kind: 'cyl', len: 12.6, dia: 4.1, pos: [-9.6, 0, 0], axis: 'x', info: 'First ISS module; storage and propulsion.' },
    { id: 'unity', name: 'Unity (Node 1)', kind: 'cyl', len: 5.5, dia: 4.57, pos: [0, 0, 0], axis: 'x', info: 'Connecting node between U.S. and Russian segments.' },
    { id: 'destiny', name: 'Destiny (U.S. Lab)', kind: 'cyl', len: 8.5, dia: 4.3, pos: [7.2, 0, 0], axis: 'x', host: ['CIR', 'MSG'], info: 'U.S. laboratory. Home of the Fluids and Combustion Facility, including the Combustion Integrated Rack (CIR) used by ACME, FLEX and CFI.' },
    { id: 'harmony', name: 'Harmony (Node 2)', kind: 'cyl', len: 7.2, dia: 4.4, pos: [15.1, 0, 0], axis: 'x', info: 'Node connecting Destiny, Columbus and Kibo.' },
    { id: 'columbus', name: 'Columbus (ESA)', kind: 'cyl', len: 6.9, dia: 4.5, pos: [15.1, 0, 6.0], axis: 'z', info: 'European laboratory module.' },
    { id: 'kibo', name: 'Kibo JEM (JAXA)', kind: 'cyl', len: 11.2, dia: 4.4, pos: [15.1, 0, -8.2], axis: 'z', info: 'Japanese Experiment Module, the largest ISS lab.' },
    { id: 'tranquility', name: 'Tranquility (Node 3)', kind: 'cyl', len: 6.7, dia: 4.5, pos: [0, 0, -6.1], axis: 'z', info: 'Life-support node: oxygen generation and air revitalisation.' },
    { id: 'cupola', name: 'Cupola', kind: 'dome', dia: 2.95, pos: [0, -3.0, -6.1], info: 'Observation dome.' },
    { id: 'cygnus', name: 'Cygnus cargo vehicle', kind: 'cyl', len: 6.4, dia: 3.07, pos: [0, -6.0, 0], axis: 'y', host: ['CYGNUS'], info: 'Uncrewed cargo craft. After leaving the ISS, Saffire-I/II/III lit large-scale fires inside it, impossible on a crewed vehicle.' },
    { id: 'truss', name: 'Integrated truss', kind: 'box', size: [3, 2.5, 90], pos: [3.5, 5.2, 0], info: 'Backbone carrying solar arrays and radiators.' },
    { id: 'arrays', name: 'Solar array wings', kind: 'arrays', pos: [3.5, 5.2, 0], info: 'Power for every experiment rack.' },
  ],
}

export const MOON = {
  name: 'Lunar surface habitat (concept)', atmosphereNote: 'Planning case ≈ 8.2 psi, 34% O₂ (challenge: ≥30% O₂ at ≤10.2 psi)',
  parts: [
    { id: 'core', name: 'Core inflatable habitat', kind: 'dome', dia: 9, pos: [0, 0, 0], info: 'Crew living volume at elevated-O₂, reduced-pressure air.' },
    { id: 'lab', name: 'Science lab module', kind: 'cyl', len: 8, dia: 4, pos: [8.5, 1.6, 0], axis: 'x', host: ['CIR', 'MSG', 'CYGNUS'], info: 'Where a material or fire experiment would run on the Moon.' },
    { id: 'galley', name: 'Galley & stowage module', kind: 'cyl', len: 7, dia: 4, pos: [-8, 1.6, 0], axis: 'x', info: 'Fabrics, foams and packaging: the solid fuels PSI never tested at this oxygen level.' },
    { id: 'airlock', name: 'Airlock / suitport', kind: 'cyl', len: 4, dia: 2.6, pos: [0, 1.3, 7.5], axis: 'z', info: 'Spacesuits run 100% O₂ at 4.3 psi.' },
    { id: 'power', name: 'Power & radiator mast', kind: 'box', size: [0.6, 9, 0.6], pos: [0, 4.5, -8], info: 'Vertical solar array tower.' },
  ],
}

export const ROVER = {
  name: 'Pressurized rover (concept)', atmosphereNote: 'Planning case ≈ 10.2 psi, 30% O₂',
  parts: [
    { id: 'cabin', name: 'Pressurized cabin', kind: 'cyl', len: 6, dia: 3, pos: [0, 2.2, 0], axis: 'x', host: ['CIR', 'MSG', 'CYGNUS'], info: 'Small crew volume: a fire here has little room and no quick escape.' },
    { id: 'suitports', name: 'Suitports', kind: 'box', size: [0.4, 1.8, 2.2], pos: [-3.3, 2.2, 0], info: 'Suits docked on the rear bulkhead (100% O₂).' },
    { id: 'chassis', name: 'Chassis & wheels', kind: 'chassis', pos: [0, 0.7, 0], info: 'Mobility system.' },
    { id: 'radiator', name: 'Radiator', kind: 'box', size: [3, 0.15, 2], pos: [0.5, 3.9, 0], info: 'Rejects cabin heat.' },
  ],
}
export const HABITAT_SCENES = { iss: ISS, moon: MOON, rover: ROVER }

// Which ISS facility hosted an investigation (derived from PSI hardware/approach text)
export function hostOf(inv) {
  const t = `${inv.hardware || ''} ${inv.approach || ''} ${inv.title || ''}`.toLowerCase()
  if (/cygnus|saffire/.test(t)) return 'CYGNUS'
  if (/combustion integrated rack|\bcir\b|acme|mdca/.test(t)) return 'CIR'
  if (/glovebox|\bmsg\b|spice|slice|bass|same/.test(t)) return 'MSG'
  return null
}

// Apparatus type from the investigation's tests
export function apparatusOf(inv, tests) {
  const t = tests?.[0] || {}
  if (/saffire/i.test(inv.acronym || '')) return 'saffire'
  if (/^PSI-(25|26)$/.test(inv.accession)) return 'bass'
  if (/^PSI-(101|102)$/.test(inv.accession)) return 'smoke'
  if (/co-flow/.test(t.config || '') || /^PSI-(106|107)$/.test(inv.accession)) return 'coflow'
  if (t.config === 'droplet') return 'droplet'
  if (/spherical|burner/.test(t.config || '') || /ACME/i.test(inv.acronym || '')) return 'burner'
  return 'generic'
}

// parse e.g. "100 micron PMMA film 2 cm wide", "SIBAL 2 cm", ".33 cm", "29 cm"
export function cm(x) { const m = String(x ?? '').match(/(\d*\.?\d+)\s*(mm|cm|micron|µm|m)?/i); if (!m) return null; const v = +m[1], u = (m[2] || 'cm').toLowerCase(); return u === 'mm' ? v / 10 : u === 'm' ? v * 100 : /micron|µm/.test(u) ? v / 1e4 : v }
export function widthFromName(s) { const m = String(s).match(/(\d*\.?\d+)\s*cm\s*wide|(\d*\.?\d+)\s*cm/i); return m ? +(m[1] || m[2]) : null }
