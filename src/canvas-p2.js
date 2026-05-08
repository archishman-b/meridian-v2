/**
 * Meridian Bridge v2 — Phase 2 Canvas
 * Adds: (1) drag ops from palette → canvas, (2) port wiring, (3) inspector panel
 *
 * This module is imported at the bottom of main.js and called after init().
 * It reads from the same `state`, `OPERATIONS`, `OP_CATEGORIES`, `showToast`,
 * `buildModalBody`, `bindModalEvents` exports that main.js already has.
 */

import { state } from './state.js'
import { eventBus } from './event-bus.js'
import { buildMeta } from './data/table-store.js'
import { OPERATIONS, OP_CATEGORIES } from './operations/registry.js'
import { showToast } from './ui/toast.js'

// ─────────────────────────────────────────────
// Graph state helpers
// ─────────────────────────────────────────────

function ensureGraph() {
  if (!state.graph) state.graph = { nodes: {}, edges: [] }
  if (!state.canvas.wireDrag) state.canvas.wireDrag = null
  if (!state.canvas.inspectorNode) state.canvas.inspectorNode = null
}

let _nodeCounter = 0
function newNodeId() { return 'n' + (++_nodeCounter) }

// ─────────────────────────────────────────────
// Wire-drag overlay SVG
// ─────────────────────────────────────────────

let _wireSvg = null
let _wireDrag = null // { fromNodeId, x1, y1, fromEl }

function getWireSvg() {
  if (_wireSvg) return _wireSvg
  _wireSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  _wireSvg.id = 'wire-drag-svg'
  _wireSvg.style.cssText = 'position:absolute;inset:0;pointer-events:none;overflow:visible;z-index:50'
  document.getElementById('canvas-transform').appendChild(_wireSvg)
  return _wireSvg
}

function drawWireCursor(x2, y2) {
  if (!_wireDrag) return
  const svg = getWireSvg()
  const { x1, y1 } = _wireDrag
  const cx1 = x1 + 80, cx2 = x2 - 80
  svg.innerHTML = `<defs><marker id="wm" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path d="M0,0 L0,6 L8,3 z" fill="var(--accent)" opacity=".9"/></marker></defs>
    <path d="M${x1},${y1} C${cx1},${y1} ${cx2},${y2} ${x2},${y2}"
      stroke="var(--accent)" stroke-width="2" fill="none" stroke-dasharray="5,3" opacity=".8" marker-end="url(#wm)"/>`
}

function clearWireCursor() {
  if (_wireSvg) _wireSvg.innerHTML = ''
  _wireDrag = null
}

// ─────────────────────────────────────────────
// Port position helpers (canvas-transform coords)
// ─────────────────────────────────────────────

function getPortPos(nodeId, portType) {
  const node = state.graph.nodes[nodeId]
  if (!node) return { x: 0, y: 0 }
  const W = 190, H = 88
  return portType === 'out'
    ? { x: node.x + W, y: node.y + H / 2 }
    : { x: node.x,     y: node.y + H / 2 }
}

// ─────────────────────────────────────────────
// Graph execution
// ─────────────────────────────────────────────

/**
 * Given a nodeId, walk the graph topologically from it downward
 * and execute each node's op against its upstream result.
 * Source nodes (no inputEdge) use the table stored in node.sourceTable.
 */
export function executeGraphFrom(startNodeId) {
  ensureGraph()
  const nodes = state.graph.nodes
  const edges = state.graph.edges

  // Build adjacency: parent → children
  const children = {}
  const parents  = {}
  for (const id of Object.keys(nodes)) { children[id] = []; parents[id] = null }
  for (const e of edges) {
    children[e.from] = children[e.from] || []
    children[e.from].push(e.to)
    parents[e.to] = e.from
  }

  // Topological order from startNodeId downward (BFS)
  const queue = [startNodeId], visited = new Set()
  const order = []
  while (queue.length) {
    const id = queue.shift()
    if (visited.has(id)) continue
    visited.add(id); order.push(id)
    for (const c of (children[id] || [])) queue.push(c)
  }

  // Execute in order
  for (const id of order) {
    const node = nodes[id]
    if (!node) continue

    // Get input data
    let inputData
    const parentId = parents[id]
    if (parentId && nodes[parentId]?.result) {
      inputData = nodes[parentId].result
    } else if (node.sourceTable && state.tables[node.sourceTable]) {
      inputData = state.tables[node.sourceTable]
    } else if (parentId && !nodes[parentId]?.result) {
      // Parent hasn't run yet or has no result — skip
      node.result = null; node.error = 'No upstream data'; continue
    } else {
      node.result = []; node.error = 'No source data'; continue
    }

    if (!node.opId || node.opId === '__source__') {
      node.result = inputData; node.error = null; continue
    }

    const op = OPERATIONS.find(o => o.id === node.opId)
    if (!op) { node.error = 'Unknown op'; continue }

    try {
      let result
      if (['join','antijoin','union','lookup'].includes(node.opId) && node.config?.rightTable) {
        result = op.execute(inputData, node.config, state.tables[node.config.rightTable])
      } else {
        result = op.execute(inputData, node.config || {})
      }
      node.result = result; node.error = null
    } catch(e) {
      node.result = null; node.error = e.message
      console.error('[canvas exec]', id, e)
    }
  }

  // Re-render canvas nodes to show updated row counts
  refreshCanvasNodeEls(order)
}

function refreshCanvasNodeEls(nodeIds) {
  for (const id of nodeIds) {
    const el = document.getElementById('cn2-' + id)
    const node = state.graph.nodes[id]
    if (!el || !node) continue
    const rc = el.querySelector('.cn-rowcount')
    if (rc) {
      if (node.error) {
        rc.textContent = '⚠ ' + node.error
        rc.style.color = 'var(--danger)'
      } else {
        rc.textContent = (node.result?.length ?? 0).toLocaleString() + ' rows'
        rc.style.color = ''
      }
    }
  }
  renderP2Connectors()
}

// ─────────────────────────────────────────────
// Node placement
// ─────────────────────────────────────────────

const snapP2 = v => Math.round(v / 20) * 20

export function placeCanvasNode({ opId, config, label, icon, x, y, sourceTable }) {
  ensureGraph()
  const id = newNodeId()
  const catColor = OP_CATEGORIES.find(c => OPERATIONS.find(o => o.id === opId)?.cat === c.id)?.color || '#22d3b8'
  state.graph.nodes[id] = {
    id, opId, config: config || {}, label, icon, x: snapP2(x), y: snapP2(y),
    color: catColor, sourceTable: sourceTable || null,
    result: null, error: null
  }

  // If source node, populate result immediately
  if (opId === '__source__' && sourceTable) {
    state.graph.nodes[id].result = state.tables[sourceTable] || []
  }

  renderP2Node(id)
  renderP2Connectors()
  return id
}

// ─────────────────────────────────────────────
// Render a single node into the canvas
// ─────────────────────────────────────────────

function renderP2Node(id) {
  const node = state.graph.nodes[id]
  if (!node) return
  const nodesEl = document.getElementById('canvas-nodes')
  if (!nodesEl) return

  // Remove existing element if re-render
  document.getElementById('cn2-' + id)?.remove()

  const el = document.createElement('div')
  el.className = 'cn-node cn2-node'
  el.id = 'cn2-' + id
  el.style.cssText = `left:${node.x}px;top:${node.y}px`
  el.dataset.nodeId = id

  const rowCount = node.result?.length ?? (node.sourceTable ? (state.tables[node.sourceTable]?.length ?? 0) : '—')
  const isSource = node.opId === '__source__'

  el.innerHTML = `
    <div class="cn-port in p2-port-in" data-node="${id}"></div>
    <div class="cn-head">
      <div class="cn-head-icon" style="background:${node.color}22;color:${node.color}">${node.icon}</div>
      <div class="cn-head-label" title="${node.label}">${node.label}</div>
      ${isSource ? '<span style="font-size:9px;padding:1px 4px;border-radius:3px;background:var(--warn-bg);color:var(--warn);border:1px solid var(--warn-border)">src</span>' : ''}
    </div>
    <div class="cn-body p2-node-body" data-node="${id}">
      <div class="cn-summary">${isSource ? (node.sourceTable || 'source') : (node.label)}</div>
    </div>
    <div class="cn-foot">
      <div class="cn-rowcount" style="${node.error ? 'color:var(--danger)' : ''}">${node.error ? '⚠ ' + node.error : rowCount.toLocaleString?.() ?? rowCount + ' rows'}</div>
      ${!isSource ? `<button class="p2-node-del" data-node="${id}" title="Remove node" style="background:none;border:none;cursor:pointer;color:var(--text3);font-size:11px;padding:0 2px">✕</button>` : ''}
    </div>
    <div class="cn-port out p2-port-out" data-node="${id}"></div>
  `

  nodesEl.appendChild(el)
  bindP2NodeEvents(el, id)
}

function bindP2NodeEvents(el, id) {
  // Drag node
  el.addEventListener('mousedown', e => {
    if (e.target.closest('.p2-port-out') || e.target.closest('.p2-port-in') ||
        e.target.closest('.p2-node-body') || e.target.closest('.p2-node-del')) return
    startNodeDragP2(e, id)
  })

  // Click body → inspector
  el.querySelector('.p2-node-body')?.addEventListener('click', e => {
    e.stopPropagation()
    openInspector(id)
  })

  // Output port → start wire
  el.querySelector('.p2-port-out')?.addEventListener('mousedown', e => {
    e.stopPropagation()
    e.preventDefault()
    startWire(e, id)
  })

  // Input port → finish wire (mouseup)
  el.querySelector('.p2-port-in')?.addEventListener('mouseup', e => {
    e.stopPropagation()
    if (_wireDrag && _wireDrag.fromNodeId !== id) {
      finishWire(id)
    }
  })

  // Delete node
  el.querySelector('.p2-node-del')?.addEventListener('click', e => {
    e.stopPropagation()
    deleteP2Node(id)
  })
}

// ─────────────────────────────────────────────
// Node drag
// ─────────────────────────────────────────────

let _nodeDragP2 = null

function startNodeDragP2(e, id) {
  const node = state.graph.nodes[id]
  if (!node) return
  _nodeDragP2 = { id, startX: e.clientX, startY: e.clientY, origX: node.x, origY: node.y }
}

function onMouseMoveP2(e) {
  if (_nodeDragP2) {
    const node = state.graph.nodes[_nodeDragP2.id]
    if (!node) return
    const zoom = state.canvas.zoom || 1
    node.x = snapP2(_nodeDragP2.origX + (e.clientX - _nodeDragP2.startX) / zoom)
    node.y = snapP2(_nodeDragP2.origY + (e.clientY - _nodeDragP2.startY) / zoom)
    const el = document.getElementById('cn2-' + _nodeDragP2.id)
    if (el) { el.style.left = node.x + 'px'; el.style.top = node.y + 'px' }
    renderP2Connectors()
  }
  if (_wireDrag) {
    // Convert viewport coords to canvas-transform coords
    const vp = document.getElementById('canvas-viewport')
    const rect = vp.getBoundingClientRect()
    const zoom = state.canvas.zoom || 1
    const panX = state.canvas.panX || 0, panY = state.canvas.panY || 0
    const cx = (e.clientX - rect.left - panX) / zoom
    const cy = (e.clientY - rect.top  - panY) / zoom
    drawWireCursor(cx, cy)
  }
}

function onMouseUpP2(e) {
  if (_nodeDragP2) { _nodeDragP2 = null }
  if (_wireDrag) {
    // Check if released on an input port
    const target = document.elementFromPoint(e.clientX, e.clientY)
    const portEl = target?.closest('.p2-port-in')
    if (portEl) {
      const toId = portEl.dataset.node
      if (toId && toId !== _wireDrag.fromNodeId) { finishWire(toId); return }
    }
    clearWireCursor()
  }
}

// ─────────────────────────────────────────────
// Wire drag
// ─────────────────────────────────────────────

function startWire(e, fromNodeId) {
  const vp = document.getElementById('canvas-viewport')
  const rect = vp.getBoundingClientRect()
  const zoom = state.canvas.zoom || 1
  const panX = state.canvas.panX || 0, panY = state.canvas.panY || 0
  const pos = getPortPos(fromNodeId, 'out')
  _wireDrag = { fromNodeId, x1: pos.x, y1: pos.y }
}

function finishWire(toNodeId) {
  if (!_wireDrag) return
  const fromId = _wireDrag.fromNodeId
  clearWireCursor()

  // Remove existing edge coming into toNode (one parent only)
  state.graph.edges = state.graph.edges.filter(e => e.to !== toNodeId)

  // Add new edge
  state.graph.edges.push({ from: fromId, to: toNodeId })
  state.graph.nodes[toNodeId].sourceTable = null // now driven by wire

  renderP2Connectors()
  executeGraphFrom(fromId)
  // Force-refresh all node row count displays
  for (const id of Object.keys(state.graph.nodes)) {
    const el = document.getElementById('cn2-' + id)
    const node = state.graph.nodes[id]
    if (!el || !node) continue
    const rc = el.querySelector('.cn-rowcount')
    if (rc) {
      if (node.error) {
        rc.textContent = '⚠ ' + node.error
        rc.style.color = 'var(--danger)'
      } else {
        const count = node.result?.length ?? 0
        rc.textContent = count.toLocaleString() + ' rows'
        rc.style.color = ''
      }
    }
  }
  const resultCount = state.graph.nodes[toNodeId]?.result?.length ?? 0
  showToast('Connected → ' + resultCount.toLocaleString() + ' rows', 'success')
}

function deleteP2Node(id) {
  // Remove node and its edges
  delete state.graph.nodes[id]
  state.graph.edges = state.graph.edges.filter(e => e.from !== id && e.to !== id)
  document.getElementById('cn2-' + id)?.remove()
  if (state.canvas.inspectorNode === id) closeInspector()
  renderP2Connectors()
  showToast('Node removed', 'success')
}

// ─────────────────────────────────────────────
// Connector rendering
// ─────────────────────────────────────────────

function renderP2Connectors() {
  const svg = document.getElementById('canvas-svg')
  if (!svg) return
  ensureGraph()
  const nodes = state.graph.nodes
  const edges = state.graph.edges
  if (!Object.keys(nodes).length) { svg.innerHTML = ''; return }

  const W = 190, H = 88
  const allNodes = Object.values(nodes)
  const maxX = Math.max(...allNodes.map(n => n.x + W)) + 100
  const maxY = Math.max(...allNodes.map(n => n.y + H)) + 100
  svg.setAttribute('width', maxX); svg.setAttribute('height', maxY)

  let p = `<defs>
    <marker id="arr2" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
      <path d="M0,0 L0,6 L8,3 z" fill="var(--accent)" opacity=".8"/>
    </marker>
  </defs>`

  for (const e of edges) {
    const a = nodes[e.from], b = nodes[e.to]
    if (!a || !b) continue
    const x1 = a.x + W, y1 = a.y + H/2, x2 = b.x, y2 = b.y + H/2
    const hasError = b.error
    p += `<path class="cn-connector" d="M${x1},${y1} C${x1+60},${y1} ${x2-60},${y2} ${x2},${y2}"
      stroke="${hasError ? 'var(--danger)' : 'var(--accent)'}" stroke-width="1.5" fill="none" opacity=".7"
      marker-end="url(#arr2)"/>`
  }
  svg.innerHTML = p
}

// ─────────────────────────────────────────────
// Inspector panel
// ─────────────────────────────────────────────

let _inspectorNode = null

export function openInspector(nodeId) {
  ensureGraph()
  const node = state.graph.nodes[nodeId]
  if (!node || node.opId === '__source__') return

  _inspectorNode = nodeId
  state.canvas.inspectorNode = nodeId

  const panel = document.getElementById('p2-inspector')
  if (!panel) return

  // Header
  const op = OPERATIONS.find(o => o.id === node.opId)
  const cat = OP_CATEGORIES.find(c => op && c.id === op.cat)
  panel.querySelector('.p2-insp-title').textContent = node.label
  panel.querySelector('.p2-insp-icon').textContent = node.icon || '⬡'
  panel.querySelector('.p2-insp-icon').style.cssText = `background:${(cat?.color||'#22d3b8')}22;color:${cat?.color||'#22d3b8'};width:28px;height:28px;border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:14px;flex-shrink:0`

  // Config form — reuse buildModalBody from main.js (exposed via window)
  const formEl = panel.querySelector('.p2-insp-form')
  if (window._buildModalBody) {
    formEl.innerHTML = window._buildModalBody(node.opId)
    // Pre-fill with existing config
    prefillForm(node.config, node.opId)
    if (window._bindModalEvents) setTimeout(() => window._bindModalEvents(node.opId), 0)
  }

  // Preview
  renderInspectorPreview(node.result)

  // Show panel
  panel.classList.add('open')
}

export function closeInspector() {
  _inspectorNode = null
  state.canvas.inspectorNode = null
  document.getElementById('p2-inspector')?.classList.remove('open')
}

function renderInspectorPreview(data) {
  const el = document.getElementById('p2-insp-preview')
  if (!el) return
  if (!data?.length) {
    el.innerHTML = '<div style="color:var(--text3);font-size:11px;padding:16px;text-align:center">No output data yet — connect a source and apply config</div>'
    return
  }
  const cols = Object.keys(data[0])
  const rows = data.slice(0, 50)
  el.innerHTML = `
    <div style="font-size:10px;color:var(--text3);padding:4px 8px;border-bottom:1px solid var(--border)">
      Preview · ${Math.min(50, data.length)} of ${data.length.toLocaleString()} rows
    </div>
    <div style="overflow:auto;flex:1">
      <table class="data-table" style="font-size:10px">
        <thead><tr>${cols.map(c => `<th style="font-size:9px;padding:4px 8px">${c}</th>`).join('')}</tr></thead>
        <tbody>${rows.map(row => `<tr>${cols.map(c => {
          const v = row[c]
          if (v == null || v === '') return '<td class="null-val" style="padding:3px 8px">null</td>'
          if (typeof v === 'number') return `<td class="num-val" style="padding:3px 8px">${v.toLocaleString()}</td>`
          return `<td style="padding:3px 8px">${String(v).slice(0, 60)}</td>`
        }).join('')}</tr>`).join('')}</tbody>
      </table>
    </div>`
}

function prefillForm(config, opId) {
  if (!config) return
  // Prefill simple select/input fields where IDs match
  const fieldMap = {
    filter: () => { /* complex — skip prefill */ },
  }
  // Generic: try to set value for known single-field selects/inputs
  for (const [k, v] of Object.entries(config)) {
    const candidates = [
      document.getElementById(opId + '-' + k),
      document.getElementById(k),
    ]
    for (const el of candidates) {
      if (el && (el.tagName === 'INPUT' || el.tagName === 'SELECT')) {
        if (el.type === 'checkbox') el.checked = !!v
        else el.value = v
        break
      }
    }
  }
}

// ─────────────────────────────────────────────
// Drag ops from palette → canvas
// ─────────────────────────────────────────────

function initOpDragToCanvas() {
  // Make op buttons draggable
  const opsList = document.getElementById('ops-list')
  if (!opsList) return

  opsList.addEventListener('dragstart', e => {
    const btn = e.target.closest('.op-btn')
    if (!btn) return
    e.dataTransfer.setData('text/plain', btn.dataset.id)
    e.dataTransfer.effectAllowed = 'copy'
    btn.classList.add('op-dragging')
  })
  opsList.addEventListener('dragend', e => {
    e.target.closest('.op-btn')?.classList.remove('op-dragging')
  })

  // Make op buttons draggable
  document.addEventListener('dragstart', e => {
    const btn = e.target.closest('.op-btn')
    if (btn) btn.setAttribute('draggable', 'true')
  })

  // Also add draggable attr to existing buttons
  refreshOpDraggable()
  // Re-run when ops panel re-renders
  const obs = new MutationObserver(() => refreshOpDraggable())
  if (opsList) obs.observe(opsList, { childList: true, subtree: true })
}

function refreshOpDraggable() {
  document.querySelectorAll('.op-btn').forEach(btn => btn.setAttribute('draggable', 'true'))
}

function initCanvasDrop() {
  const vp = document.getElementById('canvas-viewport')
  if (!vp) return

  vp.addEventListener('dragover', e => {
    if (state.ui.mode !== 'canvas') return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
    vp.classList.add('canvas-drop-active')
  })

  vp.addEventListener('dragleave', e => {
    if (!vp.contains(e.relatedTarget)) vp.classList.remove('canvas-drop-active')
  })

  vp.addEventListener('drop', e => {
    e.preventDefault()
    vp.classList.remove('canvas-drop-active')
    if (state.ui.mode !== 'canvas') return

    const opId = e.dataTransfer.getData('text/plain')
    if (!opId) return

    const op = OPERATIONS.find(o => o.id === opId)
    if (!op) return

    // Convert drop coords to canvas-transform coords
    const rect = vp.getBoundingClientRect()
    const zoom = state.canvas.zoom || 1
    const panX = state.canvas.panX || 0, panY = state.canvas.panY || 0
    const cx = (e.clientX - rect.left - panX) / zoom - 95  // center node
    const cy = (e.clientY - rect.top  - panY) / zoom - 44

    dropOpOnCanvas(opId, cx, cy)
  })
}

function dropOpOnCanvas(opId, x, y) {
  // Check if there's a data source available
  const activeTable = state.ui.activeTable
  if (!activeTable && !Object.keys(state.graph.nodes).length) {
    showToast('Load a dataset first, then drag ops', 'error')
    return
  }

  // Use the existing modal system, but intercept apply
  if (window._openModalForCanvas) {
    window._openModalForCanvas(opId, x, y)
  } else {
    showToast('Modal system not ready', 'error')
  }
}

// ─────────────────────────────────────────────
// Source node: drag table from sidebar → canvas
// ─────────────────────────────────────────────

function initTableDragToCanvas() {
  const tableList = document.getElementById('table-list')
  if (!tableList) return

  tableList.addEventListener('dragstart', e => {
    const item = e.target.closest('.table-item')
    if (!item) return
    e.dataTransfer.setData('text/x-table', item.dataset.name)
    e.dataTransfer.effectAllowed = 'copy'
  })

  // Make table items draggable
  const obs = new MutationObserver(() => {
    document.querySelectorAll('.table-item').forEach(el => el.setAttribute('draggable', 'true'))
  })
  obs.observe(tableList, { childList: true, subtree: true })

  const vp = document.getElementById('canvas-viewport')
  vp?.addEventListener('drop', e => {
    const tableName = e.dataTransfer.getData('text/x-table')
    if (!tableName) return

    const rect = vp.getBoundingClientRect()
    const zoom = state.canvas.zoom || 1
    const panX = state.canvas.panX || 0, panY = state.canvas.panY || 0
    const cx = (e.clientX - rect.left - panX) / zoom - 95
    const cy = (e.clientY - rect.top  - panY) / zoom - 44

    const meta = state.tablesMeta[tableName]
    placeCanvasNode({
      opId: '__source__', config: {}, label: tableName, icon: '📋',
      x: cx, y: cy, sourceTable: tableName
    })
    showToast(`Source: ${tableName} placed on canvas`, 'success')
  })
}

// ─────────────────────────────────────────────
// Inspector panel HTML injection
// ─────────────────────────────────────────────

function injectInspectorPanel() {
  if (document.getElementById('p2-inspector')) return

  const panel = document.createElement('div')
  panel.id = 'p2-inspector'
  panel.innerHTML = `
    <div class="p2-insp-header">
      <div class="p2-insp-icon">⬡</div>
      <div style="flex:1">
        <div class="p2-insp-title" style="font-size:13px;font-weight:600">Node</div>
        <div style="font-size:10px;color:var(--text3)">Click body to inspect · drag to reorder</div>
      </div>
      <button id="p2-insp-apply" class="btn btn-sm btn-primary">Apply</button>
      <button id="p2-insp-close" style="margin-left:6px;background:none;border:none;cursor:pointer;color:var(--text2);font-size:16px;line-height:1" title="Close">✕</button>
    </div>
    <div class="p2-insp-body">
      <div class="p2-insp-form-wrap">
        <div class="p2-insp-form"></div>
      </div>
      <div id="p2-insp-preview" class="p2-insp-preview"></div>
    </div>
  `
  document.getElementById('app')?.appendChild(panel)

  document.getElementById('p2-insp-close')?.addEventListener('click', closeInspector)
  document.getElementById('p2-insp-apply')?.addEventListener('click', applyInspector)

  // Close on Escape
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeInspector()
  })
}

function applyInspector() {
  if (!_inspectorNode) return
  const node = state.graph.nodes[_inspectorNode]
  if (!node) return

  // Build config from form — same logic as applyOp in main.js, but extracted
  if (window._buildConfigFromForm) {
    const result = window._buildConfigFromForm(node.opId)
    if (!result) return  // validation failed
    node.config = result.config
    node.label  = result.label
    // Re-execute from this node
    executeGraphFrom(_inspectorNode)
    // Update node label on canvas
    const el = document.getElementById('cn2-' + _inspectorNode)
    if (el) {
      const labelEl = el.querySelector('.cn-head-label')
      if (labelEl) labelEl.textContent = node.label
    }
    renderInspectorPreview(node.result)
    showToast('✓ ' + node.label + ' → ' + (node.result?.length ?? 0).toLocaleString() + ' rows', 'success')
  } else {
    showToast('Config extraction not ready', 'error')
  }
}

// ─────────────────────────────────────────────
// Canvas empty state update
// ─────────────────────────────────────────────

function updateCanvasEmpty() {
  const empty = document.getElementById('canvas-empty')
  const hasNodes = Object.keys(state.graph?.nodes || {}).length > 0
  if (empty) empty.style.display = hasNodes ? 'none' : 'flex'
}

// ─────────────────────────────────────────────
// Re-render all P2 nodes (called when switching to canvas mode)
// ─────────────────────────────────────────────

export function renderAllP2Nodes() {
  ensureGraph()
  // Clear old cn2 nodes
  document.querySelectorAll('.cn2-node').forEach(el => el.remove())
  // Clear old (read-only) nodes if any
  for (const id of Object.keys(state.graph.nodes)) {
    renderP2Node(id)
  }
  renderP2Connectors()
  updateCanvasEmpty()
}

// ─────────────────────────────────────────────
// CSS injection
// ─────────────────────────────────────────────

function injectP2Styles() {
  if (document.getElementById('p2-styles')) return
  const style = document.createElement('style')
  style.id = 'p2-styles'
  style.textContent = `
    /* Op drag */
    .op-btn[draggable="true"] { cursor: grab; }
    .op-btn.op-dragging { opacity: 0.5; }
    .canvas-drop-active { background: rgba(34,211,184,0.04) !important; }
    .canvas-drop-active::after {
      content: 'Drop operation here';
      position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
      color: var(--accent); font-size: 14px; font-weight: 600; border: 2px dashed var(--accent);
      border-radius: 12px; pointer-events: none; z-index: 100;
    }

    /* Port hover */
    .p2-port-out {
      cursor: crosshair !important;
      transition: all .15s;
    }
    .p2-port-out:hover {
      background: var(--accent) !important;
      border-color: var(--accent) !important;
      transform: translateY(-50%) scale(1.4) !important;
      box-shadow: 0 0 8px var(--accent);
    }
    .p2-port-in:hover {
      background: var(--accent-bg) !important;
      border-color: var(--accent) !important;
      transform: translateY(-50%) scale(1.3) !important;
    }

    /* Inspector panel */
    #p2-inspector {
      position: fixed; bottom: 0; left: 220px; right: 300px;
      height: 0; overflow: hidden;
      background: var(--surface);
      border-top: 1px solid var(--border);
      border-left: 1px solid var(--border);
      border-right: 1px solid var(--border);
      z-index: 30;
      display: flex; flex-direction: column;
      transition: height .25s cubic-bezier(.4,0,.2,1);
      border-radius: 12px 12px 0 0;
    }
    #p2-inspector.open {
      height: 320px;
    }
    .p2-insp-header {
      padding: 10px 16px;
      border-bottom: 1px solid var(--border);
      display: flex; align-items: center; gap: 10px;
      background: var(--surface2);
      flex-shrink: 0;
      border-radius: 12px 12px 0 0;
    }
    .p2-insp-body {
      flex: 1; overflow: hidden;
      display: flex; gap: 0;
    }
    .p2-insp-form-wrap {
      width: 340px; flex-shrink: 0;
      overflow-y: auto;
      border-right: 1px solid var(--border);
      padding: 14px 16px;
    }
    .p2-insp-form-wrap::-webkit-scrollbar { width: 4px; }
    .p2-insp-form-wrap::-webkit-scrollbar-thumb { background: var(--border2); border-radius: 2px; }
    .p2-insp-preview {
      flex: 1; overflow: hidden;
      display: flex; flex-direction: column;
      font-size: 11px;
    }

    /* Node body cursor */
    .p2-node-body {
      cursor: pointer;
      transition: background .1s;
    }
    .p2-node-body:hover {
      background: var(--surface2);
      border-radius: 0 0 4px 4px;
    }
    .p2-node-body:hover::after {
      content: 'inspect';
      font-size: 9px;
      color: var(--accent);
      float: right;
      font-family: var(--font-mono);
    }

    /* Canvas placeholder update */
    #canvas-empty {
      pointer-events: none;
    }
    #canvas-empty .empty-sub {
      max-width: 300px;
    }

    /* Source node badge */
    .cn2-node[data-source="true"] .cn-head {
      border-bottom-color: var(--warn-border);
    }
  `
  document.head.appendChild(style)
}

// ─────────────────────────────────────────────
// Main init — called from main.js after init()
// ─────────────────────────────────────────────

export function initCanvasPhase2() {
  ensureGraph()
  injectP2Styles()
  injectInspectorPanel()
  initOpDragToCanvas()
  initCanvasDrop()
  initTableDragToCanvas()

  // Global mouse handlers
  document.addEventListener('mousemove', onMouseMoveP2)
  document.addEventListener('mouseup', onMouseUpP2)

  // Update canvas empty state when tables load
  eventBus.on('table:loaded', () => {
    if (state.ui.mode === 'canvas') updateCanvasEmpty()
  })

  // When switching to canvas mode, render P2 nodes
  // (main.js calls renderCanvas() on mode switch — we hook into that)
  const origSetMode = window._setMode
  if (origSetMode) {
    window._setMode = (mode) => {
      origSetMode(mode)
      if (mode === 'canvas') { renderAllP2Nodes(); updateCanvasEmpty() }
    }
  }

  console.log('[Bridge P2] Canvas Phase 2 ready')
}
