/**
 * graphToLayout.js
 *
 * Assigns (cx, cy, w, h) pixel coordinates to every node in the graph and
 * computes the SVG path string for every edge.
 *
 * Design goals:
 *   - Column-based layout that matches the existing visual design
 *   - Multiple nodes per category are stacked vertically within their column
 *   - Edge paths avoid node bodies using a simple orthogonal-then-bezier router
 *   - Group (subnet) boxes are sized dynamically to wrap their column
 *   - The internet entry node is always present (virtual, never in the graph)
 */

// ── Canvas constants (must match ArchitectureDiagram.jsx) ───────────────────

export const VW = 980
export const VH = 490
export const NW = 145   // default node width
export const NH = 60    // default node height

// Vertical padding inside group boxes
const GROUP_PAD_TOP  = 44   // from group box top to first node centre
const GROUP_PAD_BOT  = 30   // from last node centre to group box bottom
const NODE_GAP       = 20   // vertical gap between nodes in the same column

// ── Column definitions ───────────────────────────────────────────────────────
//
// Each column carries one or more categories.
// Categories within the same column share the same cx; nodes are stacked.

const COLUMNS = [
  // id         categories                cx    nodeW
  { id: 'alb',     cats: ['alb'],                  cx: 209, w: NW  },
  { id: 'ec2',     cats: ['ec2'],                  cx: 427, w: NW  },
  { id: 'secrets', cats: ['secrets'],              cx: 427, w: NW  },
  { id: 'rds',     cats: ['rds'],                  cx: 630, w: NW  },
  { id: 'cache',   cats: ['cache'],                cx: 720, w: NW  },
  { id: 's3',      cats: ['s3'],                   cx: 845, w: 120 },
]

// Starting Y for the first node in each column (centre coordinate)
const COL_START_Y = {
  alb:     185,
  ec2:     165,
  secrets: 370,   // below ec2 in the same zone
  rds:     120,
  cache:   260,
  s3:      120,
}

// ── Virtual internet entry node ──────────────────────────────────────────────

export const INET_NODE = {
  id:       '__internet__',
  category: 'inet',
  label:    'Users',
  spec:     'public traffic',
  abbr:     'INT',
  cx:       55,
  cy:       240,
  w:        90,
  h:        50,
}

// ── Layout computation ───────────────────────────────────────────────────────

/**
 * Assign pixel positions to every node.
 *
 * @param {object} graphData  Parsed graph: { nodes, edges, groups, meta }
 * @returns {object}          Map: nodeId → { cx, cy, w, h }
 */
export function computePositions(graphData) {
  const pos = {}

  for (const col of COLUMNS) {
    const nodesInCol = graphData.nodes.filter(n => col.cats.includes(n.category))
    const startY = COL_START_Y[col.id] ?? 185

    nodesInCol.forEach((node, i) => {
      pos[node.id] = {
        cx: col.cx,
        cy: startY + i * (NH + NODE_GAP),
        w:  col.w,
        h:  NH,
      }
    })
  }

  // Virtual internet node is always present
  pos[INET_NODE.id] = { cx: INET_NODE.cx, cy: INET_NODE.cy, w: INET_NODE.w, h: INET_NODE.h }

  return pos
}

// ── Group box geometry ───────────────────────────────────────────────────────

/**
 * Compute bounding-box rectangles for each subnet group so that they
 * dynamically wrap their contained nodes.
 *
 * @param {object[]} groups      Groups from parseIaC output
 * @param {object}   positions   Node positions from computePositions()
 * @returns {object[]}           Array of { id, label, colorKey, x, y, w, h }
 */
export function computeGroupBoxes(groups, positions) {
  // Group columns share a continuous x-range
  const GROUP_X_RANGES = {
    public:  { xMin: 124, xMax: 296  },  // wraps alb column
    compute: { xMin: 310, xMax: 548  },  // wraps ec2 + secrets columns
    data:    { xMin: 558, xMax: 950  },  // wraps rds + cache + s3 columns
  }

  return groups.map(group => {
    const range = GROUP_X_RANGES[group.id] || { xMin: 124, xMax: 950 }

    // Vertical extent: min/max of contained node centres ± h/2 + padding
    let minCy = Infinity
    let maxCy = -Infinity
    for (const nodeId of group.contains) {
      const p = positions[nodeId]
      if (!p) continue
      if (p.cy - p.h / 2 < minCy) minCy = p.cy - p.h / 2
      if (p.cy + p.h / 2 > maxCy) maxCy = p.cy + p.h / 2
    }

    // Fallback if no nodes found (shouldn't happen but be safe)
    if (!isFinite(minCy)) { minCy = 50; maxCy = 430 }

    const boxY = minCy - GROUP_PAD_TOP
    const boxH = maxCy - minCy + GROUP_PAD_TOP + GROUP_PAD_BOT
    const clampedH = Math.max(boxH, 360)  // minimum height keeps boxes tall enough

    return {
      id:       group.id,
      label:    group.label,
      colorKey: group.colorKey,
      x:        range.xMin,
      y:        boxY < 30 ? 30 : boxY,
      w:        range.xMax - range.xMin,
      h:        clampedH,
    }
  })
}

// ── Edge colour selection ────────────────────────────────────────────────────

/**
 * Determine the colour key for an edge based on the categories of the two
 * endpoints.  The colour conveys what kind of dependency the connection is.
 */
function edgeColorKey(fromNode, toNode) {
  // Dashed edges: storage reads and secret fetches
  const dashedPairs = [
    ['ec2', 's3'],
    ['rds', 's3'],
    ['ec2', 'secrets'],
    ['alb', 'secrets'],
  ]
  const cats = [fromNode?.category, toNode?.category]

  for (const [a, b] of dashedPairs) {
    if ((cats[0] === a && cats[1] === b) || (cats[0] === b && cats[1] === a)) {
      return { colorKey: toNode?.category || 's3', dashed: true }
    }
  }

  return { colorKey: toNode?.category || fromNode?.category || 'ec2', dashed: false }
}

// ── SVG path router ──────────────────────────────────────────────────────────

/**
 * Compute an SVG path for a single edge, routing around node bodies using
 * orthogonal exits then a cubic bezier through the whitespace.
 *
 * @param {object} fp  from-node position { cx, cy, w, h }
 * @param {object} tp  to-node position   { cx, cy, w, h }
 * @returns {string}   SVG path "d" attribute value
 */
function routeEdge(fp, tp) {
  const dx = tp.cx - fp.cx
  const dy = tp.cy - fp.cy

  if (Math.abs(dx) >= Math.abs(dy)) {
    // ── Predominantly horizontal ─────────────────────────────────────────
    const fx = dx >= 0 ? fp.cx + fp.w / 2 : fp.cx - fp.w / 2
    const fy = fp.cy
    const tx = dx >= 0 ? tp.cx - tp.w / 2 : tp.cx + tp.w / 2
    const ty = tp.cy

    if (Math.abs(dy) < 12) {
      // Nearly same row → straight line
      return `M${fx} ${fy} L${tx} ${ty}`
    }
    // Different row → cubic bezier with horizontal tangents at both ports
    const midX = fx + (tx - fx) * 0.55
    return `M${fx} ${fy} C${midX} ${fy} ${midX} ${ty} ${tx} ${ty}`
  } else {
    // ── Predominantly vertical (same or adjacent column) ─────────────────
    const fy_exit = dy >= 0 ? fp.cy + fp.h / 2 : fp.cy - fp.h / 2
    const ty_enter = dy >= 0 ? tp.cy - tp.h / 2 : tp.cy + tp.h / 2

    if (Math.abs(dx) < 20) {
      // Same column — straight vertical
      return `M${fp.cx} ${fy_exit} L${tp.cx} ${ty_enter}`
    }
    // Different column with vertical dominance — S-curve
    const midY = fy_exit + (ty_enter - fy_exit) * 0.5
    return `M${fp.cx} ${fy_exit} C${fp.cx} ${midY} ${tp.cx} ${midY} ${tp.cx} ${ty_enter}`
  }
}

/**
 * Compute positioned + routed edges.
 *
 * @param {object[]} edges      Edges from parseIaC output
 * @param {object}   positions  Node positions from computePositions()
 * @param {object[]} nodes      Node list (for category lookup)
 * @returns {object[]}          Edges enriched with { d, colorKey, dashed, midX, midY }
 */
export function computeEdgePaths(edges, positions, nodes) {
  const nodeById = Object.fromEntries(nodes.map(n => [n.id, n]))
  const result = []

  for (const edge of edges) {
    const fp = positions[edge.from]
    const tp = positions[edge.to]
    if (!fp || !tp) continue

    const fromNode = nodeById[edge.from]
    const toNode   = nodeById[edge.to]
    const { colorKey, dashed } = edgeColorKey(fromNode, toNode)

    const d = routeEdge(fp, tp)

    // Approximate midpoint for step badge placement
    const fxMid = fp.cx + (fp.cx < tp.cx ? fp.w / 2 : -fp.w / 2)
    const txMid = tp.cx + (fp.cx < tp.cx ? -tp.w / 2 : tp.w / 2)
    const midX = Math.round((fxMid + txMid) / 2)
    const midY = Math.round((fp.cy + tp.cy) / 2)

    result.push({ ...edge, d, colorKey, dashed, midX, midY })
  }

  return result
}

/**
 * Build the internet → first-ALB edge.
 * Always present so the entry point is visible even without HCL references.
 */
export function computeInetEdge(positions, nodes) {
  const albNode = nodes.find(n => n.category === 'alb')
  if (!albNode) return null

  const inetPos = positions[INET_NODE.id]
  const albPos  = positions[albNode.id]
  if (!inetPos || !albPos) return null

  const d = routeEdge(inetPos, albPos)
  const midX = Math.round((inetPos.cx + albPos.cx) / 2)
  const midY = Math.round((inetPos.cy + albPos.cy) / 2)

  return { from: INET_NODE.id, to: albNode.id, d, colorKey: 'alb', dashed: false, midX, midY }
}

// ── Legend data ──────────────────────────────────────────────────────────────

export const LEGEND_ITEMS = [
  { k: 'alb',     l: 'Network entry' },
  { k: 'ec2',     l: 'Compute'       },
  { k: 'rds',     l: 'Database'      },
  { k: 'cache',   l: 'Cache'         },
  { k: 's3',      l: 'Storage'       },
  { k: 'secrets', l: 'Security'      },
]
