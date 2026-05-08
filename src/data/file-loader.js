import { registerTable } from './table-store.js'
import { showToast } from '../ui/toast.js'
export function initFileLoader() {
  window.addEventListener('dragover', e => e.preventDefault())
  window.addEventListener('drop', e => { e.preventDefault(); handleFiles(e.dataTransfer.files) })
}
export function handleFiles(files) { Array.from(files).forEach(loadFile) }
export function loadFile(file) {
  const name = file.name.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 30)
  const ext = file.name.split('.').pop().toLowerCase()
  showToast('Loading ' + file.name + '...')
  if (ext === 'csv' || ext === 'tsv') {
    window.Papa.parse(file, {
      header: true, skipEmptyLines: true, dynamicTyping: true,
      complete: res => { registerTable(name, res.data, file.name); showToast('Loaded ' + res.data.length.toLocaleString() + ' rows', 'success') },
      error: e => showToast('Parse error: ' + e.message, 'error')
    })
  } else if (ext === 'xlsx' || ext === 'xls') {
    const reader = new FileReader()
    reader.onload = e => {
      try {
        const wb = window.XLSX.read(e.target.result, { type: 'array' })
        const data = window.XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: null })
        registerTable(name, data, file.name); showToast('Loaded ' + data.length.toLocaleString() + ' rows', 'success')
      } catch(err) { showToast('Excel error: ' + err.message, 'error') }
    }
    reader.readAsArrayBuffer(file)
  }
}