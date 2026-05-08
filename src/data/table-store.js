import { state } from '../state.js'
import { eventBus } from '../event-bus.js'
export function registerTable(name, data, filename = '') {
  let finalName = name; let i = 2
  while (state.tables[finalName]) finalName = name + '_' + i++
  state.tables[finalName] = data
  state.tablesMeta[finalName] = buildMeta(data, filename)
  if (!state.ui.activeTable) state.ui.activeTable = finalName
  eventBus.emit('table:loaded', { name: finalName, data, meta: state.tablesMeta[finalName] })
  return finalName
}
export function deleteTable(name) {
  delete state.tables[name]; delete state.tablesMeta[name]
  if (state.ui.activeTable === name) {
    const r = Object.keys(state.tables)
    state.ui.activeTable = r.length ? r[r.length - 1] : null
  }
  eventBus.emit('table:deleted', { name })
}
export function activateTable(name) {
  if (!state.tables[name]) return
  state.ui.activeTable = name
  eventBus.emit('table:activated', { name })
}
export function buildMeta(data, filename = '') {
  if (!data?.length) return { rows: 0, cols: 0, types: {}, filename }
  const colNames = Object.keys(data[0]); const types = {}
  colNames.forEach(c => {
    const s = data.slice(0, 200).map(r => r[c]).filter(v => v != null)
    const n = s.filter(v => typeof v === 'number' || (typeof v === 'string' && !isNaN(+v) && v.trim() !== ''))
    const d = s.filter(v => typeof v === 'string' && !isNaN(Date.parse(v)) && v.length >= 8)
    types[c] = n.length > s.length * 0.8 ? 'num' : d.length > s.length * 0.7 ? 'date' : 'str'
  })
  return { rows: data.length, cols: colNames.length, types, filename }
}