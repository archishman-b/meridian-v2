class EventBus {
  constructor() { this._listeners = {} }
  on(event, handler) {
    if (!this._listeners[event]) this._listeners[event] = []
    this._listeners[event].push(handler)
    return () => this.off(event, handler)
  }
  off(event, handler) {
    if (!this._listeners[event]) return
    this._listeners[event] = this._listeners[event].filter(h => h !== handler)
  }
  emit(event, data = {}) {
    const handlers = this._listeners[event] || []
    handlers.forEach(h => { try { h(data) } catch(e) { console.error(e) } })
  }
}
export const eventBus = new EventBus()