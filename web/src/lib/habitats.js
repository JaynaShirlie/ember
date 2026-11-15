// Habitat atmospheres. These are design inputs (not measurements) from the challenge statement
// and NASA exploration-atmosphere planning values. Users can also set a custom atmosphere.
export const HABITATS = [
  { id: 'iss', name: 'ISS', short: 'ISS', o2: 21, psi: 14.7, g: 0, gLabel: '0 g', note: 'Sea-level air, microgravity' },
  { id: 'transit', name: 'Gateway / transit', short: 'Gateway', o2: 26.5, psi: 10.2, g: 0, gLabel: '0 g', note: 'Exploration atmosphere 10.2 psi, 26.5% O₂' },
  { id: 'moon', name: 'Moon base', short: 'Moon base', o2: 34, psi: 8.2, g: 0.165, gLabel: '0.16 g', note: 'Challenge: ≥30% O₂ at ≤10.2 psi; 8.2 psi / 34% planning case' },
  { id: 'rover', name: 'Pressurized rover', short: 'Rover', o2: 30, psi: 10.2, g: 0.165, gLabel: '0.16 g', note: 'Challenge: ≥30% O₂ at ≤10.2 psi' },
  { id: 'mars', name: 'Mars habitat', short: 'Mars', o2: 26.5, psi: 10.2, g: 0.38, gLabel: '0.38 g', note: 'Planning assumption (exploration atmosphere)' },
  { id: 'suit', name: 'Spacesuit', short: 'Spacesuit', o2: 100, psi: 4.3, g: 0, gLabel: 'any g', note: '100% O₂ at 4.3 psi' },
]

// Monochrome data marks for the white interface: solids (what burns in a cabin) carry the black highlight.
export const FUEL_COLORS = { solid: '#1d1d1f', liquid: '#8e8e93', gas: '#c7c7cc', aerosol: '#aeaeb2' }
export const FUEL_LABEL = { solid: 'Solid materials', liquid: 'Liquid droplets', gas: 'Gaseous fuels', aerosol: 'Aerosol / dust' }
export const PILLAR_COLORS = { prevention: '#48484a', detection: '#48484a', suppression: '#48484a', fundamental: '#6e6e73' }
