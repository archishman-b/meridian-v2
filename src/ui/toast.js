let toastTimer
export function initToast() {}
export function showToast(msg, type = '') {
  const t = document.getElementById('toast')
  if (!t) return
  t.textContent = msg
  t.className = 'toast show' + (type ? ' ' + type : '')
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => t.classList.remove('show'), 3000)
}