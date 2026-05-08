export const state = {
  tables: {}, tablesMeta: {},
  graph: { nodes: {}, edges: [] },
  nodeCache: {},
  ui: { mode: 'table', theme: 'dark', activeTable: null, selectedNodeId: null },
  pipeline: [], history: [],
  canvas: { zoom: 1, panX: 60, panY: 60, grid: 20 },
  qualityScore: 1, schemaMap: {}, activePipelineId: null,
  engine: null, auditLog: [], sessionId: null,
}
export const getActiveData = () => state.ui.activeTable ? (state.tables[state.ui.activeTable] || []) : []
export const getActiveMeta = () => state.ui.activeTable ? (state.tablesMeta[state.ui.activeTable] || null) : null
export const getActiveCols = () => { const d = getActiveData(); return d.length ? Object.keys(d[0]) : [] }