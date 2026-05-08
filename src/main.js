import './style.css'
import { state } from './state.js'
import { eventBus } from './event-bus.js'
import { initSession } from './data/session.js'
import { initFileLoader, handleFiles } from './data/file-loader.js'
import { registerTable, deleteTable, activateTable, buildMeta } from './data/table-store.js'
import { showToast } from './ui/toast.js'
import { OPERATIONS, OP_CATEGORIES } from './operations/registry.js'

async function init() {
  await initSession()
  initToolbar()
  initFileLoader()
  document.getElementById('file-input')?.addEventListener('change', e => handleFiles(e.target.files))
  document.getElementById('demo-btn')?.addEventListener('click', loadDemoData)
  const savedTheme = localStorage.getItem('bridge_theme') || 'dark'
  state.ui.theme = savedTheme
  document.documentElement.setAttribute('data-theme', savedTheme)
  const tb = document.getElementById('theme-btn')
  if (tb) tb.textContent = savedTheme === 'dark' ? '☾' : '☀'
  eventBus.on('table:loaded',    () => { renderTableList(); renderPreview() })
  eventBus.on('table:deleted',   () => { renderTableList(); renderPreview() })
  eventBus.on('table:activated', () => { renderTableList(); renderPreview() })
  initOpsPanel()
  initModal()
  initCanvas()
  renderTableList()
  renderPreview()
  renderPipelineBar()
  console.log('[Meridian Bridge v2] Ready')
}

function initToolbar() {
  const nav = document.getElementById('topbar-nav')
  if (!nav) return
  nav.innerHTML = `
    <div class="mode-switch">
      <button class="mode-btn active" id="mode-table-btn">&#9638; Table</button>
      <button class="mode-btn" id="mode-canvas-btn">&#9671; Canvas <span class="new-badge">NEW</span></button>
    </div>
    <button class="btn btn-sm btn-secondary" id="audit-btn">&#128203; Audit</button>
    <button class="btn btn-sm btn-primary" id="export-btn">&#8595; Export</button>
    <button class="theme-toggle" id="theme-btn" title="Toggle theme">&#9728;</button>
  `
  document.getElementById('mode-table-btn').addEventListener('click', () => setMode('table'))
  document.getElementById('mode-canvas-btn').addEventListener('click', () => setMode('canvas'))
  document.getElementById('theme-btn').addEventListener('click', toggleTheme)
  document.getElementById('export-btn').addEventListener('click', exportData)
  document.getElementById('audit-btn').addEventListener('click', () => {
    document.getElementById('audit-panel').classList.toggle('open')
  })
  document.getElementById('audit-close')?.addEventListener('click', () => {
    document.getElementById('audit-panel').classList.remove('open')
  })
}

function setMode(mode) {
  state.ui.mode = mode
  document.getElementById('table-mode-view').style.display  = mode === 'table' ? 'flex' : 'none'
  document.getElementById('canvas-mode-view').style.display = mode === 'canvas' ? 'flex' : 'none'
  document.getElementById('mode-table-btn').classList.toggle('active', mode === 'table')
  document.getElementById('mode-canvas-btn').classList.toggle('active', mode === 'canvas')
  if (mode === 'canvas') renderCanvas()
}

function toggleTheme() {
  state.ui.theme = state.ui.theme === 'dark' ? 'light' : 'dark'
  document.documentElement.setAttribute('data-theme', state.ui.theme)
  document.getElementById('theme-btn').textContent = state.ui.theme === 'dark' ? '☾' : '☀'
  localStorage.setItem('bridge_theme', state.ui.theme)
}

function renderTableList() {
  const list  = document.getElementById('table-list')
  const count = document.getElementById('table-count')
  if (!list) return
  const names = Object.keys(state.tables)
  if (count) count.textContent = names.length
  if (!names.length) { list.innerHTML = ''; return }
  list.innerHTML = names.map(n => {
    const m = state.tablesMeta[n] || {}
    return `<div class="table-item ${n === state.ui.activeTable ? 'active' : ''}" data-name="${n}">
      <div class="table-icon">${m.isResult ? '\u229e' : '\ud83d\udccb'}</div>
      <div class="table-info">
        <div class="table-name" title="${n}">${n}</div>
        <div class="table-meta">${(m.rows||0).toLocaleString()} rows &middot; ${m.cols||0} cols</div>
        ${m.isResult ? '<span class="result-badge">result</span>' : ''}
        ${m.isDemo   ? '<span class="demo-tag">demo</span>'       : ''}
      </div>
      <button class="del-btn" data-del="${n}">&#x2715;</button>
    </div>`
  }).join('')
  list.querySelectorAll('.table-item').forEach(el => {
    el.addEventListener('click', e => {
      if (e.target.closest('.del-btn')) return
      activateTable(el.dataset.name)
      state.pipeline = []; state.history = []
      renderPipelineBar()
    })
  })
  list.querySelectorAll('.del-btn').forEach(btn => {
    btn.addEventListener('click', e => { e.stopPropagation(); deleteTable(btn.dataset.del) })
  })
}

let sortCol = null, sortDir = 1, searchQuery = '', displayPage = 0
const PAGE = 500

function renderPreview() {
  const area = document.getElementById('preview-area')
  if (!area) return
  const data = state.ui.activeTable ? (state.tables[state.ui.activeTable] || []) : []
  if (!data.length) {
    area.innerHTML = `<div class="empty-state">
      <div class="empty-icon">&#x2b21;</div>
      <div class="empty-title">No data loaded</div>
      <div class="empty-sub">Load a CSV, TSV, or Excel file from the left panel, or click Load demo data.</div>
    </div>`
    document.getElementById('stats-bar').style.display = 'none'
    return
  }
  const meta = state.tablesMeta[state.ui.activeTable] || {}
  const cols = Object.keys(data[0])
  let filtered = data
  if (searchQuery) {
    const q = searchQuery.toLowerCase()
    filtered = data.filter(row => Object.values(row).some(v => v != null && String(v).toLowerCase().includes(q)))
  }
  if (sortCol) {
    filtered = [...filtered].sort((a, b) => {
      const av = a[sortCol], bv = b[sortCol]
      return (av < bv ? -1 : av > bv ? 1 : 0) * sortDir
    })
  }
  const pageData = filtered.slice(0, PAGE * (displayPage + 1))
  const types = meta.types || {}
  area.innerHTML = `
    <div class="preview-toolbar">
      <div class="preview-info">
        <strong>${filtered.length.toLocaleString()}</strong> rows &middot;
        <strong>${cols.length}</strong> cols &middot;
        <span style="font-family:var(--font-mono);font-size:10px;color:var(--text3)">${state.ui.activeTable}</span>
      </div>
      <div class="search-box">
        <span style="color:var(--text3)">&#128269;</span>
        <input id="search-input" type="text" placeholder="Search..." value="${searchQuery}" />
      </div>
      ${filtered.length > PAGE * (displayPage + 1) ? '<button class="btn btn-xs btn-secondary" id="load-more">Load more</button>' : ''}
    </div>
    <div class="table-wrap">
      <table class="data-table">
        <thead><tr>${cols.map(c => `
          <th data-col="${c}">${c} ${sortCol === c ? (sortDir === 1 ? '&#8593;' : '&#8595;') : ''}
            <span class="type-pill type-${types[c]||'str'}">${types[c]==='num'?'#':types[c]==='date'?'&#9751;':'Aa'}</span>
          </th>`).join('')}</tr></thead>
        <tbody>${pageData.map(row => `<tr>${cols.map(c => {
          const v = row[c]
          if (v == null || v === '') return '<td class="null-val">null</td>'
          if (types[c] === 'num' || typeof v === 'number') return `<td class="num-val">${(+v).toLocaleString()}</td>`
          return `<td>${String(v).slice(0, 120)}</td>`
        }).join('')}</tr>`).join('')}</tbody>
      </table>
    </div>`
  document.getElementById('stats-bar').style.display = 'flex'
  document.getElementById('stat-rows').textContent  = Math.min(filtered.length, PAGE * (displayPage+1)).toLocaleString()
  document.getElementById('stat-total').textContent = data.length.toLocaleString()
  document.getElementById('stat-cols').textContent  = cols.length
  const aggEl = document.getElementById('stat-aggregates')
  if (aggEl) {
    const nc = cols.filter(c => types[c] === 'num')
    const prio = [...nc.filter(c => /revenue|sales|amount|total|price|margin/i.test(c)), ...nc.filter(c => !/revenue|sales|amount|total|price|margin/i.test(c))].slice(0,3)
    aggEl.innerHTML = prio.map(c => {
      const vals = data.map(r => +r[c]).filter(v => !isNaN(v))
      const sum  = vals.reduce((s,v) => s+v, 0)
      const isMean = /margin|pct|rate|%/i.test(c)
      const val  = isMean ? sum/vals.length : sum
      const fmt  = Math.abs(val)>=1e6 ? '$'+(val/1e6).toFixed(1)+'M' : Math.abs(val)>=1e3 ? '$'+(val/1e3).toFixed(1)+'K' : val.toFixed(isMean?1:0)
      return `<span style="font-size:10px;color:var(--text3)">${isMean?'&#956;':'&#931;'} <strong style="color:var(--text2);font-family:var(--font-mono)">${fmt}</strong></span>`
    }).join('<span style="color:var(--border2)"> | </span>')
  }
  document.getElementById('search-input')?.addEventListener('input', e => { searchQuery = e.target.value; displayPage = 0; renderPreview() })
  document.getElementById('load-more')?.addEventListener('click', () => { displayPage++; renderPreview() })
  area.querySelectorAll('th[data-col]').forEach(th => {
    th.addEventListener('click', () => {
      if (sortCol === th.dataset.col) sortDir *= -1
      else { sortCol = th.dataset.col; sortDir = 1 }
      renderPreview()
    })
  })
}

function renderPipelineBar() {
  const bar = document.getElementById('pipeline-bar')
  if (!bar) return
  if (!state.pipeline.length) {
    bar.innerHTML = '<span style="font-size:11px;color:var(--text3);font-style:italic">No operations applied yet</span>'
    return
  }
  bar.innerHTML = state.pipeline.map((s,i) => `
    <div class="step-chip ${i===state.pipeline.length-1?'active':''}">
      <span>${s.icon}</span> ${s.label}
      <span class="remove-step" data-idx="${i}" style="width:14px;height:14px;border-radius:50%;background:var(--border2);display:inline-flex;align-items:center;justify-content:center;font-size:9px;cursor:pointer;margin-left:2px">&#x2715;</span>
    </div>
    ${i < state.pipeline.length-1 ? '<span style="color:var(--text3);font-size:12px">&#8250;</span>' : ''}`
  ).join('')
  bar.querySelectorAll('.remove-step').forEach(btn => {
    btn.addEventListener('click', () => { state.pipeline.splice(+btn.dataset.idx); rebuildFromPipeline() })
  })
}

function rebuildFromPipeline() {
  if (!state.ui.activeTable) return
  let data = [...(state.tables[state.ui.activeTable] || [])]
  state.pipeline.forEach(step => { try { data = step.fn(data) } catch(e) { console.error(e) } })
  renderPipelineBar(); renderPreview()
  if (state.ui.mode === 'canvas') renderCanvas()
}

function initOpsPanel() {
  const catsEl = document.getElementById('ops-cats')
  if (catsEl) {
    catsEl.innerHTML = '<button class="cat-btn active" data-cat="all">All</button>' +
      OP_CATEGORIES.map(c => `<button class="cat-btn" data-cat="${c.id}">${c.label}</button>`).join('')
    catsEl.querySelectorAll('.cat-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        catsEl.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('active'))
        btn.classList.add('active'); renderOps(btn.dataset.cat)
      })
    })
  }
  renderOps('all')
}

function renderOps(cat='all') {
  const list = document.getElementById('ops-list')
  if (!list) return
  const ops = cat === 'all' ? OPERATIONS : OPERATIONS.filter(o => o.cat === cat)
  if (cat === 'all') {
    list.innerHTML = OP_CATEGORIES.map(c => {
      const group = ops.filter(o => o.cat === c.id)
      if (!group.length) return ''
      return `<div class="section-label" style="color:${c.color}">${c.label}</div>` + group.map(o => opBtn(o, c.color)).join('')
    }).join('')
  } else {
    const c = OP_CATEGORIES.find(c => c.id === cat)
    list.innerHTML = ops.map(o => opBtn(o, c?.color || '#22d3b8')).join('')
  }
  list.querySelectorAll('.op-btn').forEach(btn => {
    btn.addEventListener('click', () => openModal(btn.dataset.id))
  })
}

function opBtn(op, color) {
  return `<button class="op-btn" data-id="${op.id}">
    <span class="op-icon" style="background:${color}22;color:${color};border-color:${color}44">${op.icon}</span>
    <span class="op-text">
      <span class="op-name">${op.name}</span>
      <span class="op-desc">${op.desc}</span>
    </span>
  </button>`
}

let currentOpId = null

function initModal() {
  document.getElementById('modal-overlay')?.addEventListener('click', e => {
    if (e.target.id === 'modal-overlay') closeModal()
  })
  document.getElementById('modal-cancel')?.addEventListener('click', closeModal)
  document.getElementById('modal-apply')?.addEventListener('click', applyOp)
}


function closeModal() {
  document.getElementById('modal-overlay').classList.remove('open')
  currentOpId = null
}

function getV(id) { return document.getElementById(id)?.value || '' }
function getChecked(name) { return [...document.querySelectorAll('input[name="' + name + '"]:checked')].map(el => el.value) }

function buildModalBody(opId) {
  const data = state.ui.activeTable ? (state.tables[state.ui.activeTable] || []) : []
  const c = data.length ? Object.keys(data[0]) : []
  const colSel = (id, label) => `<div class="field"><label>${label}</label>
    <select id="${id}"><option value="">-- select --</option>${c.map(x => '<option>' + x + '</option>').join('')}</select></div>`
  const colMulti = (id, label) => `<div class="field"><label>${label}</label>
    <div class="cols-checkboxes">${c.map(x => '<label class="col-check"><input type="checkbox" name="' + id + '" value="' + x + '"> ' + x + '</label>').join('')}</div></div>`
  const tblSel = (id, label) => { const names = Object.keys(state.tables).filter(n => n !== state.ui.activeTable)
    return '<div class="field"><label>' + label + '</label><select id="' + id + '"><option value="">-- select table --</option>' + names.map(n => '<option>' + n + '</option>').join('') + '</select></div>' }

  switch(opId) {
    case 'filter': return `<div class="field"><label>Logic</label><select id="filter-logic"><option value="AND">AND</option><option value="OR">OR</option></select></div><div id="filter-rules"></div><button class="add-rule-btn" id="add-rule-btn">+ Add condition</button>`
    case 'selectcols': return `<div class="field"><label>Action</label><select id="sc-action"><option value="keep">Keep selected</option><option value="drop">Drop selected</option></select></div>${colMulti('sc-cols','Columns')}`
    case 'groupby': return `${colMulti('gb-cols','Group by columns')}<div class="field"><label>Aggregations</label><div id="agg-rows"></div><button class="add-rule-btn" id="add-agg-btn">+ Add aggregation</button></div>`
    case 'join': return `${tblSel('join-table','Join with table')}${colSel('join-left','Left key (this table)')}<div class="field"><label>Right key</label><select id="join-right"><option>-- select table first --</option></select></div><div class="field"><label>Join type</label><select id="join-type"><option value="inner">Inner</option><option value="left">Left</option><option value="right">Right</option><option value="full">Full outer</option></select></div>`
    case 'calcol': return `<div class="field"><label>New column name</label><input id="cc-name" placeholder="e.g. Revenue_per_Unit"/></div>${colSel('cc-col-a','Column A')}<div class="field"><label>Operator</label><select id="cc-op"><option value="/">Divide</option><option value="*">Multiply</option><option value="+">Add</option><option value="-">Subtract</option></select></div><div class="field"><label>Column B</label><select id="cc-col-b"><option value="">-- select --</option>${c.map(x=>'<option>'+x+'</option>').join('')}<option value="__const__">-- constant --</option></select></div><div class="field" id="cc-const-wrap" style="display:none"><label>Constant value</label><input id="cc-const-val" type="number" value="1"/></div>`
    case 'rename': return `<div class="field"><label>Rename columns</label><div style="display:flex;flex-direction:column;gap:5px;max-height:240px;overflow-y:auto">${c.map(x=>'<div style="display:flex;align-items:center;gap:8px;padding:5px 0;border-bottom:1px solid var(--border)"><span style="flex:1;font-family:var(--font-mono);font-size:11px;color:var(--text2)">'+x+'</span><span style="color:var(--text3)">&#8594;</span><input class="rename-new" data-old="'+x+'" value="'+x+'" style="flex:1;border:1px solid var(--border);border-radius:5px;padding:4px 8px;background:var(--surface2);font-family:var(--font-mono);font-size:11px;color:var(--text)"/></div>').join('')}</div></div>`
    case 'dedup': return `<div class="field"><label>Mode</label><select id="dedup-mode"><option value="all">All columns</option><option value="key">Key columns</option></select></div>${colMulti('dedup-cols','Key columns')}<div class="field"><label>Keep</label><select id="dedup-keep"><option value="first">First</option><option value="last">Last</option></select></div>`
    case 'topn': return `${colSel('topn-col','Sort by')}<div class="field-row"><div class="field"><label>Direction</label><select id="topn-dir"><option value="top">Top N</option><option value="bottom">Bottom N</option></select></div><div class="field"><label>N rows</label><input id="topn-n" type="number" value="10" min="1"/></div></div>`
    case 'datepart': return `${colSel('dp-col','Date column')}<div class="field"><label>Parts to extract</label><div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:4px">${['Year','Quarter','Month','Month_Name','Week','Day','Weekday'].map(p=>'<label style="display:flex;align-items:center;gap:4px;font-size:12px"><input type="checkbox" name="dp-part" value="'+p+'" checked> '+p+'</label>').join('')}</div></div>`
    case 'freqdist': return `${colSel('fd-col','Column')}<div class="field"><label>Top N</label><input id="fd-n" type="number" value="20" min="1"/></div>`
    case 'nullaudit': return '<p style="font-size:12px;color:var(--text2);line-height:1.6">Shows null count and % for every column. Click Apply.</p>'
    case 'summary': return '<p style="font-size:12px;color:var(--text2);line-height:1.6">Generates min, max, mean, median, distinct, null % for all columns. Click Apply.</p>'
    case 'condtag': return `<div class="field"><label>Output column</label><input id="ctag-name" value="Segment"/></div><div id="ctag-rules"></div><button class="add-rule-btn" id="add-ctag-btn">+ Add rule</button><div class="field" style="margin-top:8px"><label>Default label</label><input id="ctag-default" value="Other"/></div>`
    case 'percentile': return `${colSel('pct-col','Value column')}<div class="field"><label>Type</label><select id="pct-type"><option value="quartile">Quartile (Q1-Q4)</option><option value="decile">Decile (D1-D10)</option></select></div><div class="field"><label>Output column</label><input id="pct-name" value="Bucket"/></div>`
    case 'periodcomp': return `${colSel('pc-date','Date column')}${colSel('pc-val','Value column')}<div class="field"><label>Period</label><select id="pc-period"><option value="yoy">Year-over-Year</option><option value="mom">Month-over-Month</option><option value="qoq">Quarter-over-Quarter</option></select></div>`
    case 'rolling': return `${colSel('roll-val','Value column')}${colSel('roll-sort','Sort by')}<div class="field-row"><div class="field"><label>Window</label><input id="roll-n" type="number" value="3" min="1"/></div><div class="field"><label>Function</label><select id="roll-fn"><option>AVG</option><option>SUM</option><option>MIN</option><option>MAX</option></select></div></div><div class="field"><label>Output column</label><input id="roll-name" value="Rolling_Avg"/></div>`
    case 'bin': return `${colSel('bin-col','Numeric column')}<div class="field"><label>Method</label><select id="bin-method"><option value="equal">Equal width</option><option value="quantile">Quantile</option></select></div><div class="field"><label>Number of bins</label><input id="bin-n" type="number" value="5" min="2"/></div><div class="field"><label>Output column</label><input id="bin-name" value="Bin"/></div>`
    case 'rank': return `${colSel('rank-col','Rank by')}<div class="field"><label>Type</label><select id="rank-type"><option value="rank">Rank</option><option value="dense">Dense rank</option><option value="row">Row number</option></select></div><div class="field"><label>Direction</label><select id="rank-dir"><option value="desc">Desc (1=highest)</option><option value="asc">Asc (1=lowest)</option></select></div><div class="field"><label>Output column</label><input id="rank-name" value="Rank"/></div>`
    case 'pctotal': return `${colSel('pct2-val','Value column')}<div class="field"><label>% of</label><select id="pct2-scope"><option value="total">Grand total</option><option value="group">Group total</option></select></div>${colSel('pct2-group','Group column')}<div class="field"><label>Output column</label><input id="pct2-name" value="Pct_of_Total"/></div>`
    case 'sample': return `<div class="field"><label>Method</label><select id="samp-method"><option value="pct">Percentage</option><option value="n">Fixed rows</option></select></div><div class="field"><label>Value</label><input id="samp-val" type="number" value="10" min="1"/></div>`
    case 'fillnull': return `${colSel('fn-col','Column')}<div class="field"><label>Fill with</label><select id="fn-method"><option value="const">Constant</option><option value="mean">Mean</option><option value="median">Median</option><option value="mode">Mode</option><option value="forward">Forward fill</option><option value="backward">Backward fill</option></select></div><div class="field"><label>Constant value</label><input id="fn-val" placeholder="0 or N/A"/></div>`
    case 'changetype': return `${colSel('ct-col','Column')}<div class="field"><label>Convert to</label><select id="ct-type"><option value="num">Number</option><option value="str">Text</option><option value="date">Date</option></select></div>`
    case 'findreplace': return `${colSel('fr-col','Column')}<div class="field-row"><div class="field"><label>Find</label><input id="fr-find" placeholder="text or /regex/"/></div><div class="field"><label>Replace with</label><input id="fr-rep" placeholder="replacement"/></div></div>`
    case 'datediff': return `${colSel('dd-start','Start date')}${colSel('dd-end','End date')}<div class="field"><label>Unit</label><select id="dd-unit"><option value="days">Days</option><option value="months">Months</option><option value="years">Years</option></select></div><div class="field"><label>Output column</label><input id="dd-name" value="Date_Diff"/></div>`
    case 'laglead': return `${colSel('ll-val','Value column')}${colSel('ll-sort','Sort by')}<div class="field-row"><div class="field"><label>Type</label><select id="ll-type"><option value="lag">Lag (prev)</option><option value="lead">Lead (next)</option></select></div><div class="field"><label>Offset</label><input id="ll-n" type="number" value="1" min="1"/></div></div><div class="field"><label>Output column</label><input id="ll-name" value="Prev_Value"/></div>`
    case 'textops': return `${colSel('txt-col','Column')}<div class="field"><label>Operation</label><select id="txt-op"><option value="trim">Trim</option><option value="upper">UPPER</option><option value="lower">lower</option><option value="title">Title Case</option><option value="left">Left N chars</option><option value="right">Right N chars</option><option value="extract_num">Extract numbers</option><option value="remove_special">Remove special chars</option></select></div><div class="field"><label>Output column (blank = overwrite)</label><input id="txt-out" placeholder=""/></div>`
    case 'runningtot': return `${colSel('rt-val','Value column')}${colSel('rt-sort','Sort by')}${colSel('rt-group','Group by (optional)')}<div class="field"><label>Output column</label><input id="rt-name" value="Running_Total"/></div>`
    case 'unpivot': return `${colMulti('upiv-id','ID columns to keep')}<div class="field"><label>Variable column name</label><input id="upiv-var" value="variable"/></div><div class="field"><label>Value column name</label><input id="upiv-val" value="value"/></div>`
    case 'pivot': return `${colSel('piv-rows','Row column')}${colSel('piv-cols','Pivot column')}${colSel('piv-vals','Value column')}<div class="field"><label>Aggregation</label><select id="piv-agg"><option>SUM</option><option>COUNT</option><option>AVG</option><option>MIN</option><option>MAX</option></select></div>`
    case 'dupfinder': return `<div class="field"><label>Check on</label><select id="df-mode"><option value="all">All columns</option><option value="key">Key columns</option></select></div>${colMulti('df-cols','Key columns')}`
    case 'crosstab': return `${colSel('ct2-row','Row variable')}${colSel('ct2-col','Column variable')}<div class="field"><label>Values</label><select id="ct2-vals"><option value="count">Count</option><option value="pct_row">% of row</option><option value="pct_col">% of column</option></select></div>`
    case 'pareto': return `${colSel('par-cat','Category column')}${colSel('par-val','Value column')}`
    case 'firstlast': return `${colSel('fl-group','Group by')}${colSel('fl-sort','Sort by')}<div class="field"><label>Flag</label><select id="fl-type"><option value="first">First</option><option value="last">Last</option><option value="both">Both</option></select></div><div class="field"><label>Output column</label><input id="fl-name" value="Is_First"/></div>`
    case 'fiscal': return `${colSel('fisc-col','Date column')}<div class="field"><label>Fiscal year starts</label><select id="fisc-month">${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'].map((m,i)=>'<option value="'+(i+1)+'"'+(i===3?' selected':'')+'>'+m+'</option>').join('')}</select></div>`
    case 'antijoin': return `${tblSel('aj-table','Find rows NOT in table')}${colSel('aj-left','Key (this table)')}<div class="field"><label>Key (other table)</label><select id="aj-right"><option>-- select table first --</option></select></div>`
    case 'union': return `${tblSel('union-table','Append table')}<div class="field"><label>Mismatch</label><select id="union-mis"><option value="nullfill">Fill missing with null</option><option value="common">Keep common columns only</option></select></div>`
    case 'lookup': return `${tblSel('lkp-table','Lookup from table')}${colSel('lkp-left','Match key (this table)')}<div class="field"><label>Match key (other table)</label><select id="lkp-right"><option>-- select table first --</option></select></div><div class="field"><label>Column to bring in</label><select id="lkp-col"><option>-- select table first --</option></select></div><div class="field"><label>Output column name</label><input id="lkp-name" placeholder="e.g. Product_Name"/></div>`
    case 'corr': return `${colMulti('corr-cols','Numeric columns')}`
    default: return '<p style="color:var(--text2);font-size:12px">Configure "' + opId + '" — click Apply.</p>'
  }
}

function bindModalEvents(opId) {
  if (opId === 'filter') {
    document.getElementById('add-rule-btn')?.addEventListener('click', () => addFilterRule('filter-rules'))
  }
  if (opId === 'groupby') {
    document.getElementById('add-agg-btn')?.addEventListener('click', addAggRow)
  }
  if (opId === 'condtag') {
    document.getElementById('add-ctag-btn')?.addEventListener('click', () => addTagRule('ctag-rules'))
  }
  if (opId === 'calcol') {
    document.getElementById('cc-col-b')?.addEventListener('change', e => {
      document.getElementById('cc-const-wrap').style.display = e.target.value === '__const__' ? '' : 'none'
    })
  }
  const joinTableSels = { join: ['join-table','join-right'], antijoin: ['aj-table','aj-right'], union: ['union-table',null], lookup: ['lkp-table','lkp-right','lkp-col'] }
  if (joinTableSels[opId]) {
    const [tblId, ...rightIds] = joinTableSels[opId]
    document.getElementById(tblId)?.addEventListener('change', e => {
      const tbl = state.tables[e.target.value]
      if (!tbl?.length) return
      const cc = Object.keys(tbl[0])
      rightIds.filter(Boolean).forEach(id => {
        const el = document.getElementById(id)
        if (el) el.innerHTML = cc.map(c => '<option>' + c + '</option>').join('')
      })
    })
  }
}

const _origOpenModal = openModal
window._openModal = openModal

function openModal(opId) {
  if (!state.ui.activeTable) { showToast('Load a dataset first', 'error'); return }
  currentOpId = opId
  const op = OPERATIONS.find(o => o.id === opId)
  const hdr = document.getElementById('modal-header')
  hdr.innerHTML = `<div class="modal-icon">${op.icon}</div><div><div class="modal-title">${op.name}</div><div class="modal-subtitle">${op.desc}</div></div><button class="modal-close" id="modal-x">&#x2715;</button>`
  document.getElementById('modal-x')?.addEventListener('click', closeModal)
  document.getElementById('modal-body').innerHTML = buildModalBody(opId)
  document.getElementById('modal-overlay').classList.add('open')
  setTimeout(() => bindModalEvents(opId), 0)
}

function addFilterRule(containerId) {
  const data = state.ui.activeTable ? (state.tables[state.ui.activeTable] || []) : []
  const c = data.length ? Object.keys(data[0]) : []
  const r = document.createElement('div'); r.className = 'rule-row'
  r.innerHTML = '<select class="r-col"><option value="">-- col --</option>' + c.map(x=>'<option>'+x+'</option>').join('') + '</select>' +
    '<select class="r-op"><option value="==">=</option><option value="!=">!=</option><option value=">">&gt;</option><option value=">=">&gt;=</option><option value="<">&lt;</option><option value="<=">&lt;=</option><option value="contains">contains</option><option value="is empty">is empty</option><option value="is not empty">is not empty</option></select>' +
    '<input class="r-val" placeholder="value" style="flex:2"/>' +
    '<button onclick="this.closest(\'.rule-row\').remove()" style="border:none;background:none;cursor:pointer;color:var(--danger);font-size:14px">&#x2715;</button>'
  document.getElementById(containerId).appendChild(r)
}

function addAggRow() {
  const data = state.ui.activeTable ? (state.tables[state.ui.activeTable] || []) : []
  const c = data.length ? Object.keys(data[0]) : []
  const r = document.createElement('div'); r.className = 'agg-row'
  r.innerHTML = '<select class="ag-col" style="flex:2"><option value="">-- col --</option>' + c.map(x=>'<option>'+x+'</option>').join('') + '</select>' +
    '<select class="ag-fn" style="flex:1.5"><option>SUM</option><option>COUNT</option><option>COUNT_DISTINCT</option><option>AVG</option><option>MIN</option><option>MAX</option><option>MEDIAN</option></select>' +
    '<input class="ag-name" placeholder="output name" style="flex:2;border:1px solid var(--border);border-radius:5px;padding:4px 7px;background:var(--surface);font-family:var(--font-sans);font-size:11px;color:var(--text)"/>' +
    '<button onclick="this.closest(\'.agg-row\').remove()" style="border:none;background:none;cursor:pointer;color:var(--danger);font-size:14px">&#x2715;</button>'
  document.getElementById('agg-rows').appendChild(r)
}

function addTagRule(containerId) {
  const data = state.ui.activeTable ? (state.tables[state.ui.activeTable] || []) : []
  const c = data.length ? Object.keys(data[0]) : []
  const r = document.createElement('div'); r.className = 'rule-row'
  r.innerHTML = '<select class="r-col"><option value="">-- col --</option>' + c.map(x=>'<option>'+x+'</option>').join('') + '</select>' +
    '<select class="r-op"><option value="==">=</option><option value="!=">!=</option><option value=">">&gt;</option><option value="<">&lt;</option><option value="contains">contains</option></select>' +
    '<input class="r-val" placeholder="value" style="flex:1.5"/>' +
    '<span style="color:var(--text3);flex-shrink:0">&#8594;</span>' +
    '<input class="lbl-inp" placeholder="Label" style="flex:1.5;border:1px solid var(--border);border-radius:5px;padding:4px 7px;background:var(--surface);font-family:var(--font-sans);font-size:11px;color:var(--text)"/>' +
    '<button onclick="this.closest(\'.rule-row\').remove()" style="border:none;background:none;cursor:pointer;color:var(--danger);font-size:14px">&#x2715;</button>'
  document.getElementById(containerId).appendChild(r)
}

function applyOp() {
  if (!currentOpId || !state.ui.activeTable) return
  const op   = OPERATIONS.find(o => o.id === currentOpId)
  const data = state.tables[state.ui.activeTable] || []
  let config = {}, label = op.name, fn

  try {
    switch(currentOpId) {
      case 'filter': {
        const logic = getV('filter-logic')
        const rules = [...document.querySelectorAll('#filter-rules .rule-row')].map(r => ({ col: r.querySelector('.r-col')?.value, op: r.querySelector('.r-op')?.value, val: r.querySelector('.r-val')?.value })).filter(r => r.col)
        if (!rules.length) { showToast('Add at least one condition', 'error'); return }
        config = { logic, rules }; label = 'Filter (' + rules.length + ' rule' + (rules.length>1?'s':'') + ')'
        fn = d => op.execute(d, config); break
      }
      case 'selectcols': {
        const action = getV('sc-action'); const columns = getChecked('sc-cols')
        if (!columns.length) { showToast('Select at least one column', 'error'); return }
        config = { action, columns }; label = (action==='keep'?'Keep ':'Drop ') + columns.length + ' col(s)'
        fn = d => op.execute(d, config); break
      }
      case 'groupby': {
        const groupCols = getChecked('gb-cols')
        const aggregations = [...document.querySelectorAll('#agg-rows .agg-row')].map(r => ({ col: r.querySelector('.ag-col')?.value, fn: r.querySelector('.ag-fn')?.value, name: r.querySelector('.ag-name')?.value || (r.querySelector('.ag-col')?.value + '_' + r.querySelector('.ag-fn')?.value) })).filter(a => a.col && a.fn)
        if (!groupCols.length || !aggregations.length) { showToast('Select group columns and add aggregations', 'error'); return }
        config = { groupCols, aggregations }; label = 'Group by ' + groupCols.join(', ')
        fn = d => op.execute(d, config); break
      }
      case 'join': {
        const rightTable = getV('join-table'); const leftKey = getV('join-left'); const rightKey = getV('join-right'); const joinType = getV('join-type')
        if (!rightTable || !leftKey || !rightKey) { showToast('Fill all join fields', 'error'); return }
        config = { leftKey, rightKey, joinType }; label = joinType + ' join with ' + rightTable
        fn = d => op.execute(d, config, state.tables[rightTable]); break
      }
      case 'calcol': {
        const outputName = getV('cc-name'); const colA = getV('cc-col-a'); const operator = getV('cc-op'); const colB = getV('cc-col-b'); const constVal = getV('cc-const-val')
        if (!outputName || !colA) { showToast('Enter column name and select Column A', 'error'); return }
        config = { outputName, formulaType: 'arith', colA, operator, colB, constVal: +constVal }; label = 'Calc: ' + outputName
        fn = d => op.execute(d, config); break
      }
      case 'rename': {
        const map = {}; document.querySelectorAll('.rename-new').forEach(el => { if (el.value.trim() && el.value.trim() !== el.dataset.old) map[el.dataset.old] = el.value.trim() })
        if (!Object.keys(map).length) { showToast('No columns renamed', 'error'); return }
        config = { map }; label = 'Rename ' + Object.keys(map).length + ' col(s)'; fn = d => op.execute(d, config); break
      }
      case 'dedup': { config = { mode: getV('dedup-mode'), keyCols: getChecked('dedup-cols'), keep: getV('dedup-keep') }; label = 'Deduplicate'; fn = d => op.execute(d, config); break }
      case 'topn': { const sc = getV('topn-col'); if (!sc) { showToast('Select sort column', 'error'); return }; config = { sortCol: sc, direction: getV('topn-dir'), n: +getV('topn-n')||10 }; label = (config.direction==='top'?'Top ':'Bottom ') + config.n + ' by ' + sc; fn = d => op.execute(d, config); break }
      case 'datepart': { const dc = getV('dp-col'); if (!dc) { showToast('Select date column', 'error'); return }; config = { dateCol: dc, parts: getChecked('dp-part') }; label = 'Date parts: ' + dc; fn = d => op.execute(d, config); break }
      case 'freqdist': { const col = getV('fd-col'); if (!col) { showToast('Select column', 'error'); return }; config = { col, topN: +getV('fd-n')||20 }; label = 'Freq: ' + col; fn = d => op.execute(d, config); break }
      case 'nullaudit': { label = 'Null audit'; fn = d => op.execute(d); break }
      case 'summary':   { label = 'Column summary'; fn = d => op.execute(d); break }
      case 'condtag': { const rules = [...document.querySelectorAll('#ctag-rules .rule-row')].map(r => ({ col: r.querySelector('.r-col')?.value, op: r.querySelector('.r-op')?.value, val: r.querySelector('.r-val')?.value, label: r.querySelector('.lbl-inp')?.value })).filter(r => r.col && r.label); config = { outputName: getV('ctag-name')||'Segment', defaultLabel: getV('ctag-default')||'Other', rules }; label = 'Tag: ' + config.outputName; fn = d => op.execute(d, config); break }
      case 'percentile': { const col = getV('pct-col'); if (!col) { showToast('Select column', 'error'); return }; config = { col, bucketType: getV('pct-type'), outputName: getV('pct-name')||'Bucket' }; label = config.bucketType + ': ' + col; fn = d => op.execute(d, config); break }
      case 'periodcomp': { const dc = getV('pc-date'), vc = getV('pc-val'); if (!dc||!vc) { showToast('Select date and value columns', 'error'); return }; config = { dateCol: dc, valueCol: vc, period: getV('pc-period') }; label = config.period.toUpperCase() + ': ' + vc; fn = d => op.execute(d, config); break }
      case 'rolling': { const vc = getV('roll-val'), sc = getV('roll-sort'); if (!vc||!sc) { showToast('Select value and sort columns', 'error'); return }; config = { valueCol: vc, sortCol: sc, windowSize: +getV('roll-n')||3, aggregation: getV('roll-fn'), outputName: getV('roll-name')||'Rolling' }; label = 'Rolling ' + config.aggregation + '(' + config.windowSize + '): ' + vc; fn = d => op.execute(d, config); break }
      case 'bin': { const col = getV('bin-col'); if (!col) { showToast('Select column', 'error'); return }; config = { col, method: getV('bin-method'), nBins: +getV('bin-n')||5, outputName: getV('bin-name')||'Bin' }; label = 'Bin: ' + col; fn = d => op.execute(d, config); break }
      case 'rank': { const col = getV('rank-col'); if (!col) { showToast('Select column', 'error'); return }; config = { sortCol: col, rankType: getV('rank-type'), direction: getV('rank-dir'), outputName: getV('rank-name')||'Rank' }; label = 'Rank by: ' + col; fn = d => op.execute(d, config); break }
      case 'pctotal': { const vc = getV('pct2-val'); if (!vc) { showToast('Select value column', 'error'); return }; config = { valueCol: vc, scope: getV('pct2-scope'), groupCol: getV('pct2-group'), outputName: getV('pct2-name')||'Pct_of_Total' }; label = '% of total: ' + vc; fn = d => op.execute(d, config); break }
      case 'sample': { config = { method: getV('samp-method'), value: +getV('samp-val')||10 }; label = 'Sample ' + config.value + (config.method==='pct'?'%':' rows'); fn = d => op.execute(d, config); break }
      case 'fillnull': { const col = getV('fn-col'); if (!col) { showToast('Select column', 'error'); return }; config = { col, method: getV('fn-method'), constVal: getV('fn-val') }; label = 'Fill nulls: ' + col; fn = d => op.execute(d, config); break }
      case 'changetype': { const col = getV('ct-col'); if (!col) { showToast('Select column', 'error'); return }; config = { col, targetType: getV('ct-type') }; label = 'Cast ' + col; fn = d => op.execute(d, config); break }
      case 'findreplace': { const col = getV('fr-col'); if (!col) { showToast('Select column', 'error'); return }; config = { col, find: getV('fr-find'), replace: getV('fr-rep') }; label = 'Replace in: ' + col; fn = d => op.execute(d, config); break }
      case 'datediff': { const s = getV('dd-start'), e = getV('dd-end'); if (!s||!e) { showToast('Select both date columns', 'error'); return }; config = { startCol: s, endCol: e, unit: getV('dd-unit'), outputName: getV('dd-name')||'Date_Diff' }; label = 'Date diff: ' + s + ' to ' + e; fn = d => op.execute(d, config); break }
      case 'laglead': { const vc = getV('ll-val'), sc = getV('ll-sort'); if (!vc||!sc) { showToast('Select value and sort columns', 'error'); return }; config = { valueCol: vc, sortCol: sc, lagType: getV('ll-type'), offset: +getV('ll-n')||1, outputName: getV('ll-name')||'Prev_Value' }; label = getV('ll-type') + ': ' + vc; fn = d => op.execute(d, config); break }
      case 'textops': { const col = getV('txt-col'); if (!col) { showToast('Select column', 'error'); return }; config = { col, operation: getV('txt-op'), outputName: getV('txt-out')||col }; label = getV('txt-op') + ': ' + col; fn = d => op.execute(d, config); break }
      case 'runningtot': { const vc = getV('rt-val'), sc = getV('rt-sort'); if (!vc||!sc) { showToast('Select value and sort columns', 'error'); return }; config = { valueCol: vc, sortCol: sc, groupCol: getV('rt-group'), outputName: getV('rt-name')||'Running_Total' }; label = 'Running total: ' + vc; fn = d => op.execute(d, config); break }
      case 'unpivot': { config = { idCols: getChecked('upiv-id'), varName: getV('upiv-var')||'variable', valName: getV('upiv-val')||'value' }; label = 'Unpivot'; fn = d => op.execute(d, config); break }
      case 'pivot': { const rk = getV('piv-rows'), ck = getV('piv-cols'), vk = getV('piv-vals'); if (!rk||!ck||!vk) { showToast('Select all three columns', 'error'); return }; config = { rowKey: rk, colKey: ck, valueKey: vk, agg: getV('piv-agg') }; label = 'Pivot: ' + vk + ' by ' + ck; fn = d => op.execute(d, config); break }
      case 'dupfinder': { config = { mode: getV('df-mode'), keyCols: getChecked('df-cols') }; label = 'Duplicate finder'; fn = d => op.execute(d, config); break }
      case 'crosstab': { const rc = getV('ct2-row'), cc = getV('ct2-col'); if (!rc||!cc) { showToast('Select row and column variables', 'error'); return }; config = { rowCol: rc, colCol: cc, valueType: getV('ct2-vals') }; label = 'Crosstab: ' + rc + ' x ' + cc; fn = d => op.execute(d, config); break }
      case 'pareto': { const pc = getV('par-cat'), pv = getV('par-val'); if (!pc||!pv) { showToast('Select category and value columns', 'error'); return }; config = { catCol: pc, valueCol: pv }; label = 'Pareto: ' + pv; fn = d => op.execute(d, config); break }
      case 'firstlast': { const fg = getV('fl-group'), fs = getV('fl-sort'); if (!fg||!fs) { showToast('Select group and sort columns', 'error'); return }; config = { groupCol: fg, sortCol: fs, flagType: getV('fl-type'), outputName: getV('fl-name')||'Is_First' }; label = 'Flag ' + config.flagType; fn = d => op.execute(d, config); break }
      case 'fiscal': { const dc = getV('fisc-col'); if (!dc) { showToast('Select date column', 'error'); return }; config = { dateCol: dc, fiscalStartMonth: +getV('fisc-month')||4, parts: ['Fiscal_Year','Fiscal_Quarter','Fiscal_Month'] }; label = 'Fiscal calendar: ' + dc; fn = d => op.execute(d, config); break }
      case 'antijoin': { const rt = getV('aj-table'), lk = getV('aj-left'), rk = getV('aj-right'); if (!rt||!lk||!rk) { showToast('Fill all fields', 'error'); return }; config = { leftKey: lk, rightKey: rk }; label = 'Anti-join vs ' + rt; fn = d => op.execute(d, config, state.tables[rt]); break }
      case 'union': { const rt = getV('union-table'); if (!rt) { showToast('Select a table', 'error'); return }; config = { mismatch: getV('union-mis') }; label = 'Union with ' + rt; fn = d => op.execute(d, config, state.tables[rt]); break }
      case 'lookup': { const rt = getV('lkp-table'), lk = getV('lkp-left'), rk = getV('lkp-right'), vc = getV('lkp-col'); if (!rt||!lk||!rk||!vc) { showToast('Fill all fields', 'error'); return }; config = { leftKey: lk, rightKey: rk, valueCol: vc, outputName: getV('lkp-name')||vc }; label = 'Lookup ' + vc + ' from ' + rt; fn = d => op.execute(d, config, state.tables[rt]); break }
      case 'corr': { const cols = getChecked('corr-cols'); if (!cols.length) { showToast('Select columns', 'error'); return }; config = { columns: cols }; label = 'Correlation matrix'; fn = d => op.execute(d, config); break }
      default: showToast(currentOpId + ' not yet wired', 'error'); return
    }

    const newData = fn(data)
    if (!newData?.length) { showToast('Operation returned 0 rows', 'error'); return }

    let rName = state.ui.activeTable + '_result'; let i = 2
    while (state.tables[rName]) rName = state.ui.activeTable + '_result_' + i++
    state.tables[rName] = newData
    state.tablesMeta[rName] = { ...buildMeta(newData), isResult: true, filename: 'Result of ' + label }
    state.pipeline.push({ id: currentOpId, fn, label, icon: op.icon })
    state.ui.activeTable = rName

    closeModal(); renderTableList(); renderPipelineBar(); renderPreview()
    if (state.ui.mode === 'canvas') renderCanvas()
    showToast('\u2713 ' + label + ' \u2192 ' + newData.length.toLocaleString() + ' rows', 'success')
    state.auditLog.push({ op: label, detail: data.length.toLocaleString() + ' \u2192 ' + newData.length.toLocaleString() + ' rows', time: new Date().toLocaleTimeString() })
    renderAudit()
  } catch(e) { showToast('Error: ' + e.message, 'error'); console.error(e) }
}

function renderAudit() {
  const el = document.getElementById('audit-entries')
  if (!el) return
  el.innerHTML = [...state.auditLog].reverse().map(e => `<div style="padding:6px 12px;border-bottom:1px solid var(--border);font-size:11px"><span style="float:right;color:var(--text3);font-size:10px">${e.time}</span><div style="font-weight:500;color:var(--accent)">${e.op}</div><div style="color:var(--text2);font-family:var(--font-mono);font-size:10px">${e.detail}</div></div>`).join('')
}

function exportData() {
  const data = state.ui.activeTable ? state.tables[state.ui.activeTable] : null
  if (!data?.length) { showToast('No data to export', 'error'); return }
  const csv = window.Papa.unparse(data)
  const blob = new Blob([csv], { type: 'text/csv' })
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob)
  a.download = (state.ui.activeTable || 'export') + '.csv'; a.click()
  showToast('Exported as CSV', 'success')
}

let _canvasNodes = []
const snap = v => Math.round(v / 20) * 20

function initCanvas() {
  const vp = document.getElementById('canvas-viewport')
  if (!vp) return
  let panning = false, panStart = null, dragging = null
  vp.addEventListener('mousedown', e => { if (e.target.closest('.cn-node')) return; panning = true; panStart = { x: e.clientX - state.canvas.panX, y: e.clientY - state.canvas.panY } })
  vp.addEventListener('mousemove', e => {
    if (dragging) {
      const node = _canvasNodes.find(n => n.id === dragging.id)
      if (node) { node.x = snap(dragging.origX + (e.clientX - dragging.startX) / state.canvas.zoom); node.y = snap(dragging.origY + (e.clientY - dragging.startY) / state.canvas.zoom); const el = document.getElementById('cn-' + dragging.id); if (el) { el.style.left = node.x + 'px'; el.style.top = node.y + 'px' }; renderConnectors() }
    } else if (panning && panStart) { state.canvas.panX = e.clientX - panStart.x; state.canvas.panY = e.clientY - panStart.y; applyTransform() }
  })
  vp.addEventListener('mouseup', () => { panning = false; panStart = null; dragging = null })
  vp.addEventListener('wheel', e => { e.preventDefault(); state.canvas.zoom = Math.max(0.2, Math.min(3, state.canvas.zoom + (e.deltaY > 0 ? -0.08 : 0.08))); applyTransform() }, { passive: false })
  document.getElementById('zoom-in')?.addEventListener('click',  () => { state.canvas.zoom = Math.min(3, state.canvas.zoom + 0.1); applyTransform() })
  document.getElementById('zoom-out')?.addEventListener('click', () => { state.canvas.zoom = Math.max(0.2, state.canvas.zoom - 0.1); applyTransform() })
  document.getElementById('zoom-fit')?.addEventListener('click', canvasFit)
  window._startNodeDrag = (e, id) => { const node = _canvasNodes.find(n => n.id === id); if (!node) return; dragging = { id, startX: e.clientX, startY: e.clientY, origX: node.x, origY: node.y } }
}

function buildCanvasNodes() {
  if (!state.ui.activeTable) return []
  const nodes = []; const src = state.tables[state.ui.activeTable]
  nodes.push({ id: '__src__', x: 40, y: 60, label: state.ui.activeTable, icon: '\ud83d\udccb', color: '#5b8ef5', rowCount: src?.length || 0, summary: 'Source dataset' })
  let prevData = [...(src || [])]
  state.pipeline.forEach((step, i) => {
    let out = prevData; try { out = step.fn(prevData) } catch(e) {}
    const cat = OP_CATEGORIES.find(c => OPERATIONS.find(o => o.id === step.id)?.cat === c.id)
    const saved = _canvasNodes.find(n => n.id === 'step_' + i)
    nodes.push({ id: 'step_' + i, x: saved?.x ?? snap(40 + (i+1)*220), y: saved?.y ?? 60, label: step.label, icon: step.icon, color: cat?.color || '#22d3b8', rowCount: out?.length ?? 0, rowIn: prevData.length, summary: step.label })
    prevData = out || prevData
  })
  nodes.forEach(n => { const s = _canvasNodes.find(x => x.id === n.id); if (s) { n.x = s.x; n.y = s.y } })
  return nodes
}

function renderCanvas() {
  _canvasNodes = buildCanvasNodes()
  const empty = document.getElementById('canvas-empty'); const nodesEl = document.getElementById('canvas-nodes')
  if (!nodesEl) return
  if (!_canvasNodes.length) { if (empty) empty.style.display = 'flex'; nodesEl.innerHTML = ''; return }
  if (empty) empty.style.display = 'none'
  applyTransform()
  nodesEl.innerHTML = _canvasNodes.map(n => `<div class="cn-node" id="cn-${n.id}" style="left:${n.x}px;top:${n.y}px" onmousedown="window._startNodeDrag(event,'${n.id}')">
    <div class="cn-port in"></div>
    <div class="cn-head"><div class="cn-head-icon" style="background:${n.color}22;color:${n.color}">${n.icon}</div><div class="cn-head-label" title="${n.label}">${n.label}</div></div>
    <div class="cn-body"><div class="cn-summary">${n.summary}</div></div>
    <div class="cn-foot"><div class="cn-rowcount">${n.rowIn != null ? n.rowIn.toLocaleString() + ' \u2192 ' : ''}${n.rowCount.toLocaleString()} rows</div></div>
    <div class="cn-port out"></div>
  </div>`).join('')
  renderConnectors()
}

function renderConnectors() {
  const svg = document.getElementById('canvas-svg'); if (!svg || _canvasNodes.length < 2) { if (svg) svg.innerHTML = ''; return }
  const W = 180, H = 88
  const maxX = Math.max(..._canvasNodes.map(n => n.x + W)) + 100; const maxY = Math.max(..._canvasNodes.map(n => n.y + H)) + 100
  svg.setAttribute('width', maxX); svg.setAttribute('height', maxY)
  let p = '<defs><marker id="arr" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path d="M0,0 L0,6 L8,3 z" fill="var(--accent)" opacity=".7"/></marker></defs>'
  for (let i = 0; i < _canvasNodes.length-1; i++) {
    const a = _canvasNodes[i], b = _canvasNodes[i+1]; const x1=a.x+W,y1=a.y+H/2,x2=b.x,y2=b.y+H/2
    p += '<path class="cn-connector" d="M'+x1+','+y1+' C'+(x1+60)+','+y1+' '+(x2-60)+','+y2+' '+x2+','+y2+'" marker-end="url(#arr)"/>'
  }
  svg.innerHTML = p
}

function applyTransform() {
  const t = document.getElementById('canvas-transform'); if (t) t.style.transform = 'translate('+state.canvas.panX+'px,'+state.canvas.panY+'px) scale('+state.canvas.zoom+')'
  const l = document.getElementById('canvas-zoom-label'); if (l) l.textContent = Math.round(state.canvas.zoom*100)+'%'
}

function canvasFit() {
  if (!_canvasNodes.length) return
  const vp = document.getElementById('canvas-viewport'); const W=vp.clientWidth,H=vp.clientHeight
  const minX=Math.min(..._canvasNodes.map(n=>n.x)),minY=Math.min(..._canvasNodes.map(n=>n.y))
  const maxX=Math.max(..._canvasNodes.map(n=>n.x+180)),maxY=Math.max(..._canvasNodes.map(n=>n.y+88))
  state.canvas.zoom=Math.min(1,W/(maxX-minX+80),H/(maxY-minY+80))
  state.canvas.panX=(W-(maxX-minX)*state.canvas.zoom)/2; state.canvas.panY=(H-(maxY-minY)*state.canvas.zoom)/2
  applyTransform()
}

function loadDemoData() {
  if (!window.Papa) { showToast('PapaParse not loaded yet', 'error'); return }
  const parse = csv => window.Papa.parse(csv.trim(), { header: true, skipEmptyLines: true, dynamicTyping: true }).data
  const txn = parse(`transaction_id,date,customer_id,customer_name,region,category,product,units,list_price,discount_pct,pocket_price,revenue,unit_cost,margin_pct,status,sales_rep,customer_tier
T0001,2023-01-03,C003,Meridian Health,North,Software,CRM Platform,5,8500,4.23,8140.45,40702.25,600,92.63,Won,Sarah Chen,Enterprise
T0002,2023-01-06,C004,Solaris Energy,West,Hardware,Network Switch,3,950,7.62,877.61,2632.83,540,38.47,Lost,Tom Walsh,Mid-Market
T0003,2023-02-01,C002,Horizon Tech,East,Software,ERP Module,2,12000,3.91,11530.8,23061.6,1200,89.59,Won,Priya Sharma,Enterprise
T0004,2023-02-07,C013,Harbor Insurance,East,Hardware,Network Switch,1,950,4.77,904.69,904.69,540,40.31,Won,Aisha Patel,Enterprise
T0005,2023-02-09,C014,Quantum Devices,North,Software,BI Dashboard,2,5500,7.26,5100.7,10201.4,500,90.2,Won,Sarah Chen,Enterprise
T0006,2023-03-08,C002,Horizon Tech,East,Software,CRM Platform,10,8500,5.98,7991.7,79917.0,600,92.49,Won,Priya Sharma,Enterprise
T0007,2023-03-12,C001,Apex Industries,North,Software,Analytics Suite,3,4500,8.08,4136.4,12409.2,500,87.91,Won,Sarah Chen,Enterprise
T0008,2023-04-12,C010,Stratos Media,North,Software,Mobile Device Mgmt,5,2800,31.17,1927.24,9636.2,250,87.03,Won,Emily Foster,SMB
T0009,2023-05-05,C006,Nimbus Financial,East,Software,BI Dashboard,3,5500,3.07,5331.15,15993.45,500,90.62,Won,Priya Sharma,Enterprise
T0010,2023-05-30,C007,Vertex Logistics,South,Software,ERP Module,3,12000,3.59,11569.2,34707.6,1200,89.63,Won,Marco Ruiz,Mid-Market
T0011,2023-06-26,C020,Polar Biotech,East,Software,CRM Platform,10,8500,8.67,7763.05,77630.5,600,92.27,Won,Aisha Patel,Enterprise
T0012,2023-07-20,C001,Apex Industries,North,Software,CRM Platform,5,8500,10.65,7594.75,37973.75,600,92.1,Won,Sarah Chen,Enterprise
T0013,2023-08-08,C002,Horizon Tech,East,Software,Mobile Device Mgmt,3,2800,10.66,2501.52,7504.56,250,90.01,Won,Priya Sharma,Enterprise
T0014,2023-09-10,C009,BlueRock Mining,West,Software,Security Suite,10,3200,6.08,3005.44,30054.4,280,90.68,Won,Tom Walsh,Mid-Market
T0015,2023-09-20,C005,Cascade Retail,South,Software,BI Dashboard,10,5500,7.61,5081.45,50814.5,500,90.16,Won,James Okafor,Mid-Market
T0016,2023-10-30,C002,Horizon Tech,East,Software,CRM Platform,10,8500,11.73,7502.95,75029.5,600,92.0,Won,Priya Sharma,Enterprise
T0017,2023-11-07,C020,Polar Biotech,East,Software,ERP Module,3,12000,8.88,10934.4,32803.2,1200,89.03,Won,Aisha Patel,Enterprise
T0018,2023-12-19,C019,Coastline Hotels,West,Software,ERP Module,10,12000,9.56,10852.8,108528.0,1200,88.94,Won,Tom Walsh,Mid-Market
T0019,2024-01-15,C019,Coastline Hotels,West,Software,Analytics Suite,1,4500,10.85,4011.75,4011.75,500,87.54,Won,Tom Walsh,Mid-Market
T0020,2024-02-12,C005,Cascade Retail,South,Hardware,Laptop Pro,10,1200,8.62,1096.56,10965.6,800,27.04,Won,James Okafor,Mid-Market`)
  const cust = parse(`customer_id,customer_name,industry,tier,account_manager,annual_contract_value,segment
C001,Apex Industries,Manufacturing,Enterprise,Sarah Chen,78000,Strategic
C002,Horizon Tech,Technology,Enterprise,Priya Sharma,92000,Strategic
C003,Meridian Health,Healthcare,Enterprise,Sarah Chen,55000,Growth
C004,Solaris Energy,Energy,Mid-Market,Tom Walsh,28000,Emerging
C005,Cascade Retail,Retail,Mid-Market,James Okafor,22000,Emerging
C006,Nimbus Financial,Financial Services,Enterprise,Priya Sharma,65000,Growth
C007,Vertex Logistics,Logistics,Mid-Market,Marco Ruiz,19000,Emerging
C009,BlueRock Mining,Mining,Mid-Market,Tom Walsh,24000,Emerging
C010,Stratos Media,Media,SMB,Emily Foster,9500,Emerging
C013,Harbor Insurance,Financial Services,Enterprise,Aisha Patel,58000,Growth
C014,Quantum Devices,Technology,Enterprise,Sarah Chen,83000,Strategic
C019,Coastline Hotels,Hospitality,Mid-Market,Tom Walsh,26000,Emerging
C020,Polar Biotech,Healthcare,Enterprise,Aisha Patel,61000,Growth`)
  registerTable('transactions', txn, 'transactions.csv')
  registerTable('customers', cust, 'customers.csv')
  Object.keys(state.tablesMeta).forEach(n => { if (['transactions','customers'].includes(n)) state.tablesMeta[n].isDemo = true })
  showToast('Demo data loaded — 2 tables ready', 'success')
}

init().catch(console.error)