// In-browser runtime for EMBER's trained classifiers (pipeline/build.py -> classifiers.json).
// SI disclosure: written with assistance from Claude (Anthropic).
export function makeClassifier(c) {
  return function predict(values) { // values: { featureName: number }
    let z = c.intercept
    const outside = []
    c.features.forEach((f, i) => {
      const v = values[f]
      const [lo, hi] = c.trainRanges[f]
      if (v < lo || v > hi) outside.push(`${f}=${+v.toFixed(3)} (trained ${+lo.toFixed(3)}–${+hi.toFixed(3)})`)
      z += c.coef[i] * (v - c.xMean[i]) / c.xStd[i]
    })
    return { p: 1 / (1 + Math.exp(-z)), outside, cv: c.cv, n: c.n, source: c.source }
  }
}
export const CARBON = { ethane: 2, propane: 3, butane: 4, pentane: 5 }
