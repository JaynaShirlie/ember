// Habitat atmospheres. These are design inputs (not measurements) from the challenge statement
// and NASA exploration-atmosphere planning values. Users can also set a custom atmosphere.
export const HABITATS = [
  { id: 'iss', name: 'ISS', o2: 21, psi: 14.7, g: 0, gLabel: '0 g', note: 'Sea-level air, microgravity' },
  { id: 'transit', name: 'Gateway / transit', o2: 26.5, psi: 10.2, g: 0, gLabel: '0 g', note: 'Exploration atmosphere 10.2 psi, 26.5% O₂' },
  { id: 'moon', name: 'Moon base', o2: 34, psi: 8.2, g: 0.165, gLabel: '0.16 g', note: 'Challenge: ≥30% O₂ at ≤10.2 psi; 8.2 psi / 34% planning case' },
  { id: 'rover', name: 'Pressurized rover', o2: 30, psi: 10.2, g: 0.165, gLabel: '0.16 g', note: 'Challenge: ≥30% O₂ at ≤10.2 psi' },
  { id: 'mars', name: 'Mars habitat', o2: 26.5, psi: 10.2, g: 0.38, gLabel: '0.38 g', note: 'Planning assumption (exploration atmosphere)' },
  { id: 'suit', name: 'Spacesuit', o2: 100, psi: 4.3, g: 0, gLabel: 'any', note: '100% O₂ at 4.3 psi' },
]

export const FUEL_COLORS = { solid: '#F2A541', liquid: '#7FD3F7', gas: '#4F8DE8', aerosol: '#B48CF2' }
export const FUEL_LABEL = { solid: 'Solid materials', liquid: 'Liquid droplets', gas: 'Gaseous fuels', aerosol: 'Aerosol / dust' }
export const PILLAR_COLORS = { prevention: '#F2A541', detection: '#4F8DE8', suppression: '#7FD3F7', fundamental: '#AEB9CF' }
