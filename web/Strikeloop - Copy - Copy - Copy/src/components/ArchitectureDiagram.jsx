/**
 * ArchitectureDiagram.jsx
 *
 * Renders an interactive SVG topology diagram of AWS infrastructure.
 *
 * Data pipeline (all done in useMemo, nothing leaves the component):
 *   hcl string  ──► parseIaC()  ──► graph { nodes, edges, groups, meta }
 *                                 ──► computePositions()  → pos map
 *                                 ──► computeGroupBoxes() → group rects
 *                                 ──► computeEdgePaths()  → routed edges
 *                                 ──► computeInetEdge()   → entry arrow
 *
 * Props:
 *   hcl           (string)   Raw Terraform HCL — primary data source.
 *   graphData     (object)   Pre-parsed Pluralith graph JSON — alternative source.
 *                            Pass either hcl or graphData; hcl takes precedence.
 *   totalCost     (number)   Estimated monthly USD shown in the info box.
 *   resourceCount (number)   Total resource count shown in the info box.
 *
 * All visual sub-components (Node, Arrow, GroupBox, StepBadge, InfoBox) are
 * unchanged from the original design; only the main export function is new.
 */

import { useMemo } from 'react'
import { parseIaC }           from '../lib/parseIaC.js'
import {
  computePositions,
  computeGroupBoxes,
  computeEdgePaths,
  computeInetEdge,
  INET_NODE,
  LEGEND_ITEMS,
  VW, VH, NW, NH,
} from '../lib/graphToLayout.js'

// ── Design-system colours ────────────────────────────────────────────────────

const C = {
  alb:     '#22C55E',
  ec2:     '#F59E0B',
  rds:     '#60A5FA',
  cache:   '#F472B6',
  s3:      '#34D399',
  secrets: '#A78BFA',
  inet:    '#71717A',
}

// ── SVG primitive components ─────────────────────────────────────────────────
// These are the same as the original — layout and styling are untouched.

function Markers() {
  return (
    <defs>
      {Object.entries(C).map(([key, color]) => (
        <marker
          key={key}
          id={`am-${key}`}
          markerWidth="6" markerHeight="6"
          refX="5" refY="3"
          orient="auto"
        >
          <polygon points="0,0.5 0,5.5 6,3" fill={color} fillOpacity={0.65} />
        </marker>
      ))}
    </defs>
  )
}

function Arrow({ d, colorKey, dashed = false }) {
  return (
    <path
      d={d}
      fill="none"
      stroke={C[colorKey] || C.ec2}
      strokeWidth={1.3}
      strokeOpacity={0.5}
      strokeDasharray={dashed ? '5,3.5' : undefined}
      markerEnd={`url(#am-${colorKey})`}
    />
  )
}

function StepBadge({ x, y, n, colorKey }) {
  return (
    <g>
      <circle cx={x} cy={y} r={9} fill="#0A0A0A" stroke={C[colorKey]} strokeWidth={0.8} strokeOpacity={0.7} />
      <text
        x={x} y={y + 3.5}
        textAnchor="middle"
        fill={C[colorKey]}
        fontSize={8.5} fontWeight="700"
        fontFamily="'Geist Mono', monospace"
      >
        {n}
      </text>
    </g>
  )
}

function GroupBox({ x, y, w, h, label, colorKey }) {
  const color = C[colorKey] || colorKey
  return (
    <>
      <rect
        x={x} y={y} width={w} height={h} rx={9}
        fill={`${color}07`}
        stroke={color} strokeWidth={0.8} strokeOpacity={0.2}
        strokeDasharray="5,4"
      />
      <text
        x={x + 13} y={y + 17}
        fill={color} fillOpacity={0.38}
        fontSize={9.5} fontFamily="'Geist Mono', monospace"
      >
        {label}
      </text>
    </>
  )
}

function Node({ cx, cy, w = NW, h = NH, label, spec, colorKey, abbr }) {
  const x     = cx - w / 2
  const y     = cy - h / 2
  const color = C[colorKey] || C.ec2

  return (
    <g>
      {/* outer glow */}
      <rect x={x - 1} y={y - 1} width={w + 2} height={h + 2} rx={9}
        fill="none" stroke={color} strokeWidth={1.5} strokeOpacity={0.06} />

      {/* card body */}
      <rect x={x} y={y} width={w} height={h} rx={8}
        fill="#101010" stroke={color} strokeWidth={0.75} strokeOpacity={0.35} />

      {/* colour accent bar */}
      <rect x={x + 1} y={y} width={w - 2} height={2.5} rx={1.2}
        fill={color} fillOpacity={0.65} />

      {/* icon bg */}
      <rect x={x + 8} y={cy - 13} width={26} height={26} rx={6}
        fill={color} fillOpacity={0.1} stroke={color} strokeWidth={0.5} strokeOpacity={0.2} />

      {/* icon abbr */}
      <text x={x + 21} y={cy + 3.5} textAnchor="middle"
        fill={color} fontSize={7.5} fontWeight="700" fontFamily="'Geist Mono', monospace">
        {abbr}
      </text>

      {/* service name */}
      <text x={x + 41} y={cy - 7}
        fill="#EFEFEF" fontSize={11.5} fontWeight="500"
        fontFamily="'Geist', system-ui, sans-serif">
        {label}
      </text>

      {/* spec */}
      {spec && (
        <text x={x + 41} y={cy + 9}
          fill="#484848" fontSize={9} fontFamily="'Geist Mono', monospace">
          {spec}
        </text>
      )}
    </g>
  )
}

function InfoBox({ x, y, resources, cost }) {
  return (
    <g>
      <rect x={x} y={y} width={148} height={68} rx={8}
        fill="#111111" stroke="#1F1F1F" strokeWidth={0.75} />
      <text x={x + 12} y={y + 18} fill="#52525B" fontSize={9}
        fontFamily="'Geist Mono', monospace">GENERATED PLAN</text>
      <line x1={x + 12} y1={y + 26} x2={x + 136} y2={y + 26} stroke="#1F1F1F" strokeWidth={0.5} />
      <text x={x + 12} y={y + 42} fill="#F5F5F5" fontSize={18} fontWeight="500"
        fontFamily="'Geist', system-ui, sans-serif">${cost}/mo</text>
      <text x={x + 12} y={y + 58} fill="#52525B" fontSize={9}
        fontFamily="'Geist Mono', monospace">{resources} resources</text>
    </g>
  )
}

// ── Empty-state placeholder ──────────────────────────────────────────────────

function EmptyState() {
  return (
    <div style={{
      background: '#0A0A0A', border: '1px solid #1F1F1F', borderRadius: 12,
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', padding: '60px 24px', gap: 10,
    }}>
      <div style={{
        width: 40, height: 40, borderRadius: 10,
        background: '#111111', border: '1px solid #1F1F1F',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
          <rect x="3" y="3" width="7" height="7" rx="1" stroke="#3F3F46" strokeWidth="1.5"/>
          <rect x="14" y="3" width="7" height="7" rx="1" stroke="#3F3F46" strokeWidth="1.5"/>
          <rect x="3" y="14" width="7" height="7" rx="1" stroke="#3F3F46" strokeWidth="1.5"/>
          <rect x="14" y="14" width="7" height="7" rx="1" stroke="#3F3F46" strokeWidth="1.5"/>
          <path d="M10 6.5h4M6.5 10v4M17.5 10v4M10 17.5h4" stroke="#3F3F46" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
      </div>
      <p style={{ margin: 0, fontSize: 13, color: '#52525B', textAlign: 'center' }}>
        No IaC loaded — diagram will appear once Terraform is generated.
      </p>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function ArchitectureDiagram({ hcl, graphData, totalCost, resourceCount }) {
  // ── 1. Parse IaC into graph data ─────────────────────────────
  const graph = useMemo(() => {
    // Accept pre-parsed graphData first, then fall back to raw HCL
    return parseIaC(graphData || hcl)
  }, [hcl, graphData])

  // ── 2. Assign pixel positions to nodes ───────────────────────
  const positions = useMemo(() => {
    if (!graph) return {}
    return computePositions(graph)
  }, [graph])

  // ── 3. Compute group (subnet) bounding boxes ─────────────────
  const groupBoxes = useMemo(() => {
    if (!graph) return []
    return computeGroupBoxes(graph.groups, positions)
  }, [graph, positions])

  // ── 4. Route edges as SVG bezier paths ───────────────────────
  const routedEdges = useMemo(() => {
    if (!graph) return []
    return computeEdgePaths(graph.edges, positions, graph.nodes)
  }, [graph, positions])

  // ── 5. Always-present internet → ALB entry edge ──────────────
  const inetEdge = useMemo(() => {
    if (!graph) return null
    return computeInetEdge(positions, graph.nodes)
  }, [graph, positions])

  // ── Cost & resource count ─────────────────────────────────────
  const cost  = Math.round(totalCost  || graph?.meta?.estimatedCost || 145)
  const count = resourceCount         || graph?.meta?.resourceCount  || 0

  // Guard: nothing to render
  if (!graph || graph.nodes.length === 0) return <EmptyState />

  // All edges in display order (inet first, then sorted rest)
  const allEdges = [
    ...(inetEdge ? [{ ...inetEdge, stepN: 1 }] : []),
    ...routedEdges.map((e, i) => ({ ...e, stepN: i + 2 })),
  ]

  return (
    <div style={{ background: '#0A0A0A', border: '1px solid #1F1F1F', borderRadius: 12, overflow: 'hidden' }}>

      {/* ── Source info bar ─── */}
      <div style={{
        padding: '8px 16px',
        borderBottom: '1px solid #141414',
        display: 'flex', alignItems: 'center', gap: 8,
      }}>
        <span style={{
          fontSize: 9, fontWeight: 700, letterSpacing: '0.08em',
          color: '#22C55E', fontFamily: 'Geist Mono, monospace',
          background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.15)',
          borderRadius: 4, padding: '1px 6px',
        }}>LIVE IaC</span>
        <span style={{ fontSize: 11, color: '#52525B', fontFamily: 'Geist Mono, monospace' }}>
          {graph.meta.visibleCount} services · {graph.meta.resourceCount} total resources · {graph.meta.region}
        </span>
        <span style={{ marginLeft: 'auto', fontSize: 10, color: '#3F3F46', fontFamily: 'Geist Mono, monospace' }}>
          parsed from terraform HCL
        </span>
      </div>

      {/* ── SVG canvas ─── */}
      <svg
        viewBox={`0 0 ${VW} ${VH}`}
        style={{ width: '100%', height: 'auto', display: 'block' }}
        aria-label="AWS infrastructure architecture diagram"
      >
        <Markers />

        {/* VPC outer boundary */}
        <rect x={108} y={18} width={852} height={444} rx={14}
          fill="none" stroke="#1E1E1E" strokeWidth={1.2} strokeDasharray="8,5" />
        <text x={125} y={37} fill="#252525" fontSize={10} fontFamily="'Geist Mono', monospace">
          AWS Cloud · {graph.meta.region} · VPC
        </text>

        {/* Dynamic subnet group boxes (drawn first, behind everything) */}
        {groupBoxes.map(gb => (
          <GroupBox key={gb.id} x={gb.x} y={gb.y} w={gb.w} h={gb.h}
            label={gb.label} colorKey={gb.colorKey} />
        ))}

        {/* Connection arrows — drawn before nodes so nodes sit on top */}
        {allEdges.map(edge => (
          <Arrow key={`${edge.from}→${edge.to}`}
            d={edge.d} colorKey={edge.colorKey} dashed={edge.dashed} />
        ))}

        {/* Step badges on each edge midpoint */}
        {allEdges.map(edge => (
          <StepBadge key={`badge-${edge.from}→${edge.to}`}
            x={edge.midX} y={edge.midY}
            n={edge.stepN} colorKey={edge.colorKey} />
        ))}

        {/* Internet / users entry node (virtual — always rendered) */}
        <Node
          cx={INET_NODE.cx} cy={INET_NODE.cy}
          w={INET_NODE.w}  h={INET_NODE.h}
          label={INET_NODE.label} spec={INET_NODE.spec}
          colorKey="inet" abbr={INET_NODE.abbr}
        />

        {/* All parsed service nodes */}
        {graph.nodes.map(node => {
          const p = positions[node.id]
          if (!p) return null
          return (
            <Node
              key={node.id}
              cx={p.cx} cy={p.cy} w={p.w} h={p.h}
              label={node.label} spec={node.spec}
              colorKey={node.category} abbr={node.abbr}
            />
          )
        })}

        {/* Info box — positioned in the bottom-right of the data zone */}
        <InfoBox x={784} y={310} resources={count} cost={cost} />

        {/* Legend strip */}
        <g transform="translate(126, 418)">
          <rect width={388} height={26} rx={6}
            fill="#0E0E0E" stroke="#1A1A1A" strokeWidth={0.5} />
          {LEGEND_ITEMS.map(({ k, l }, i) => (
            <g key={k} transform={`translate(${i * 64 + 10}, 0)`}>
              <rect y={9} width={7} height={7} rx={2} fill={C[k]} fillOpacity={0.7} />
              <text x={11} y={17} fill="#333333" fontSize={7.5}
                fontFamily="'Geist', system-ui, sans-serif">{l}</text>
            </g>
          ))}
        </g>

      </svg>

      {/* Step callout strip */}
      <div style={{
        borderTop: '1px solid #141414',
        padding: '10px 18px',
        display: 'flex', flexWrap: 'wrap', gap: '5px 18px',
      }}>
        {allEdges.map(edge => {
          const fromNode = graph.nodes.find(n => n.id === edge.from) || INET_NODE
          const toNode   = graph.nodes.find(n => n.id === edge.to)
          const color    = C[edge.colorKey] || '#71717A'
          const label    = `${fromNode.label} → ${toNode?.label ?? '?'}`

          return (
            <div key={edge.stepN} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <span style={{
                width: 17, height: 17, borderRadius: '50%',
                border: `1px solid ${color}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                <span style={{ fontSize: 9, fontWeight: 700, color, fontFamily: 'Geist Mono, monospace' }}>
                  {edge.stepN}
                </span>
              </span>
              <span style={{ fontSize: 11, color: '#52525B', fontFamily: 'Geist Mono, monospace' }}>
                {label}
              </span>
            </div>
          )
        })}
      </div>

    </div>
  )
}
