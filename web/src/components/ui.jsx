import React from 'react'

// One disclosure recipe: detail stays one click away instead of on screen.
export function More({ title, children, open, panel }) {
  return <details className={(panel ? 'panel ' : '') + 'more'} open={open}><summary>{title}</summary><div className="more-body">{children}</div></details>
}
