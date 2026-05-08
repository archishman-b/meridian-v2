import { state } from '../state.js'
import { eventBus } from '../event-bus.js'
export async function initSession() {
  try {
    const raw = sessionStorage.getItem('bridge_session_meta')
    if (!raw) return
    const s = JSON.parse(raw)
    if (s.activeTable) state.ui.activeTable = s.activeTable
    eventBus.emit('session:restored', {})
  } catch(e) { console.warn('[Session]', e.message) }
}
export function loadAllPipelines() {
  try { return JSON.parse(localStorage.getItem('meridian_pipelines') || '[]') } catch { return [] }
}
export function savePipeline(pipeline) {
  const all = loadAllPipelines()
  const idx = all.findIndex(p => p.id === pipeline.id)
  if (idx >= 0) all[idx] = pipeline; else all.unshift(pipeline)
  localStorage.setItem('meridian_pipelines', JSON.stringify(all))
}