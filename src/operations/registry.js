const mean = arr => arr.reduce((s,v)=>s+v,0)/arr.length
const med = arr => { const s=[...arr].sort((a,b)=>a-b); const m=Math.floor(s.length/2); return s.length%2?s[m]:(s[m-1]+s[m])/2 }
const cols = data => data?.length ? Object.keys(data[0]) : []

export const OP_CATEGORIES = [
  { id:'join',      label:'Join',      color:'#5b8ef5' },
  { id:'filter',    label:'Filter',    color:'#f5a524' },
  { id:'aggregate', label:'Aggregate', color:'#22d3b8' },
  { id:'transform', label:'Transform', color:'#a78bfa' },
  { id:'inspect',   label:'Inspect',   color:'#34c759' },
  { id:'segment',   label:'Segment',   color:'#fb7185' },
  { id:'time',      label:'Time',      color:'#fbbf24' },
]

export const OPERATIONS = [
  { id:'join',       cat:'join',      icon:'⟕', name:'Join tables',           desc:'Inner, left, right, full outer join on a key column',
    execute(left, config, right) {
      const {leftKey,rightKey,joinType='inner'} = config
      if (!leftKey||!rightKey||!right?.length) return left
      const rMap=new Map(right.map(r=>[r[rightKey],r])); const rCols=cols(right).filter(c=>c!==rightKey); const result=[]
      if (joinType==='inner'||joinType==='left') { left.forEach(lr=>{ const rr=rMap.get(lr[leftKey]); if(rr){const row={...lr};rCols.forEach(c=>row[c]=rr[c]);result.push(row)}else if(joinType==='left'){const row={...lr};rCols.forEach(c=>row[c]=null);result.push(row)} }) }
      else if (joinType==='right') { right.forEach(rr=>{ const lr=left.find(r=>r[leftKey]===rr[rightKey]); const row={...(lr||{})};rCols.forEach(c=>row[c]=rr[c]);result.push(row) }) }
      else { const done=new Set(); left.forEach(lr=>{ const rr=rMap.get(lr[leftKey]); const row={...lr};rCols.forEach(c=>row[c]=rr?rr[c]:null);result.push(row);if(rr)done.add(lr[leftKey]) }); right.filter(rr=>!done.has(rr[rightKey])).forEach(rr=>{ const row={};rCols.forEach(c=>row[c]=rr[c]);result.push(row) }) }
      return result
    }
  },
  { id:'antijoin',  cat:'join',      icon:'⊄', name:'Anti-join',              desc:'Rows with no match in another table',
    execute(left, config, right) { const {leftKey,rightKey}=config; if(!right?.length)return left; const keys=new Set(right.map(r=>r[rightKey])); return left.filter(r=>!keys.has(r[leftKey])) }
  },
  { id:'union',     cat:'join',      icon:'∪', name:'Union / Append',         desc:'Stack two tables vertically',
    execute(left, config, right) { if(!right?.length)return left; const allc=[...new Set([...cols(left),...cols(right)])]; return [...left,...right].map(r=>{const o={};allc.forEach(c=>o[c]=r[c]??null);return o}) }
  },
  { id:'lookup',    cat:'join',      icon:'🔍', name:'Lookup / VLOOKUP',       desc:'Bring a single column from another table by key',
    execute(left, config, right) { const {leftKey,rightKey,valueCol,outputName}=config; if(!right?.length)return left; const mp=new Map(right.map(r=>[r[rightKey],r[valueCol]])); const nn=outputName||valueCol; return left.map(r=>({...r,[nn]:mp.get(r[leftKey])??null})) }
  },
  { id:'filter',    cat:'filter',    icon:'⊡', name:'Filter rows',            desc:'Keep rows matching conditions (AND/OR)',
    execute(data, config) {
      const {logic='AND',rules=[]}=config; if(!rules.length)return data
      return data.filter(row=>{ const res=rules.map(r=>{ const v=row[r.col],rv=r.val; switch(r.op){ case'==':return String(v)===String(rv)||+v===+rv; case'!=':return String(v)!==String(rv); case'>':return+v>+rv; case'>=':return+v>=+rv; case'<':return+v<+rv; case'<=':return+v<=+rv; case'contains':return String(v??'').toLowerCase().includes(String(rv).toLowerCase()); case'not contains':return!String(v??'').toLowerCase().includes(String(rv).toLowerCase()); case'is empty':return v==null||v===''; case'is not empty':return v!=null&&v!==''; default:return true } }); return logic==='AND'?res.every(Boolean):res.some(Boolean) })
    }
  },
  { id:'selectcols',cat:'filter',    icon:'⬜', name:'Select / drop columns',  desc:'Choose which columns to keep or remove',
    execute(data, config) { const {action='keep',columns=[]}=config; if(!columns.length)return data; const keep=action==='keep'?columns:cols(data).filter(c=>!columns.includes(c)); return data.map(r=>{const o={};keep.forEach(c=>o[c]=r[c]);return o}) }
  },
  { id:'dedup',     cat:'filter',    icon:'◈', name:'Deduplicate',            desc:'Remove duplicate rows',
    execute(data, config) { const {mode='all',keyCols=[],keep='first'}=config; const getKey=row=>(mode==='key'&&keyCols.length?keyCols:cols(data)).map(c=>row[c]).join('|||'); const seen=new Set(); const result=[]; const arr=keep==='last'?[...data].reverse():data; arr.forEach(r=>{const k=getKey(r);if(!seen.has(k)){seen.add(k);result.push(r)}}); return keep==='last'?result.reverse():result }
  },
  { id:'topn',      cat:'filter',    icon:'↑N', name:'Top / Bottom N',        desc:'Get top or bottom N rows',
    execute(data, config) { const {n=10,sortCol,direction='top',groupCol}=config; if(!sortCol)return data; const sf=(a,b)=>{const av=a[sortCol],bv=b[sortCol];return(av<bv?-1:av>bv?1:0)*(direction==='top'?-1:1)}; if(!groupCol)return[...data].sort(sf).slice(0,n); const groups={};data.forEach(r=>(groups[r[groupCol]]=groups[r[groupCol]]||[]).push(r));return Object.values(groups).flatMap(g=>g.sort(sf).slice(0,n)) }
  },
  { id:'sample',    cat:'filter',    icon:'⊞', name:'Random sample',          desc:'Sample a percentage or fixed number of rows',
    execute(data, config) { const {method='pct',value=10,seed=42}=config; const n=method==='pct'?Math.floor(data.length*value/100):Math.min(value,data.length); const arr=[...data];let s=seed; const rand=()=>{s=(s*1664525+1013904223)&0xFFFFFFFF;return(s>>>0)/0xFFFFFFFF}; for(let i=arr.length-1;i>0;i--){const j=Math.floor(rand()*(i+1));[arr[i],arr[j]]=[arr[j],arr[i]]};return arr.slice(0,n) }
  },
  { id:'groupby',   cat:'aggregate', icon:'Σ', name:'Group by & summarise',   desc:'Sum, count, avg, min, max, median',
    execute(data, config) {
      const {groupCols=[],aggregations=[]}=config; if(!groupCols.length||!aggregations.length)return data
      const groups=new Map(); data.forEach(row=>{ const key=groupCols.map(c=>row[c]).join('|||'); if(!groups.has(key)){const o={};groupCols.forEach(c=>o[c]=row[c]);groups.set(key,{key:o,rows:[]})}; groups.get(key).rows.push(row) })
      return Array.from(groups.values()).map(({key,rows})=>{ const out={...key}; aggregations.forEach(a=>{ const vals=rows.map(r=>r[a.col]).filter(v=>v!=null); const nums=vals.map(Number).filter(v=>!isNaN(v)); switch(a.fn){ case'SUM':out[a.name]=nums.reduce((s,v)=>s+v,0);break; case'COUNT':out[a.name]=rows.length;break; case'COUNT_DISTINCT':out[a.name]=new Set(vals).size;break; case'AVG':out[a.name]=nums.length?mean(nums):null;break; case'MIN':out[a.name]=nums.length?Math.min(...nums):null;break; case'MAX':out[a.name]=nums.length?Math.max(...nums):null;break; case'MEDIAN':out[a.name]=nums.length?med(nums):null;break } }); return out })
    }
  },
  { id:'pivot',     cat:'aggregate', icon:'⊞', name:'Pivot',                  desc:'Turn row values into columns',
    execute(data, config) { const {rowKey,colKey,valueKey,agg='SUM'}=config; if(!rowKey||!colKey||!valueKey)return data; const pivVals=[...new Set(data.map(r=>r[colKey]))].sort(); const groups=new Map(); data.forEach(row=>{ const k=row[rowKey]; if(!groups.has(k))groups.set(k,{[rowKey]:k}); const g=groups.get(k);const c=String(row[colKey]);g[c]=g[c]||[];g[c].push(+row[valueKey]||0) }); return Array.from(groups.values()).map(row=>{ const out={[rowKey]:row[rowKey]}; pivVals.forEach(pv=>{const arr=row[String(pv)]||[];out[pv]=agg==='SUM'?arr.reduce((s,v)=>s+v,0):agg==='COUNT'?arr.length:agg==='AVG'?(arr.length?arr.reduce((s,v)=>s+v,0)/arr.length:0):agg==='MIN'?Math.min(...arr):Math.max(...arr)});return out }) }
  },
  { id:'unpivot',   cat:'aggregate', icon:'⊟', name:'Unpivot / Melt',         desc:'Turn columns into rows',
    execute(data, config) { const {idCols=[],varName='variable',valName='value'}=config; const valCols=cols(data).filter(c=>!idCols.includes(c)); return data.flatMap(row=>valCols.map(vc=>{const o={};idCols.forEach(c=>o[c]=row[c]);o[varName]=vc;o[valName]=row[vc];return o})) }
  },
  { id:'runningtot',cat:'aggregate', icon:'∫', name:'Running total',           desc:'Cumulative sum within a group',
    execute(data, config) { const {valueCol,sortCol,groupCol,outputName='Running_Total'}=config; if(!valueCol||!sortCol)return data; const sorted=[...data].sort((a,b)=>{const av=a[sortCol],bv=b[sortCol];return av<bv?-1:av>bv?1:0}); const acc=new Map(); return sorted.map(row=>{const k=groupCol?row[groupCol]:'__all__';acc.set(k,(acc.get(k)||0)+(+row[valueCol]||0));return{...row,[outputName]:acc.get(k)}}) }
  },
  { id:'pctotal',   cat:'aggregate', icon:'%', name:'Percent of total',        desc:'Each row as % of total',
    execute(data, config) { const {valueCol,scope='total',groupCol,outputName='Pct_of_Total'}=config; if(!valueCol)return data; const totals=new Map(); if(scope==='group'&&groupCol)data.forEach(r=>totals.set(r[groupCol],(totals.get(r[groupCol])||0)+(+r[valueCol]||0)));else totals.set('__all__',data.reduce((s,r)=>s+(+r[valueCol]||0),0)); return data.map(r=>{const k=scope==='group'&&groupCol?r[groupCol]:'__all__';return{...r,[outputName]:Math.round((+r[valueCol]||0)/(totals.get(k)||1)*10000)/100}}) }
  },
  { id:'calcol',    cat:'transform', icon:'ƒ', name:'Calculated column',       desc:'Add a column using arithmetic or IF/THEN',
    execute(data, config) { const {outputName,formulaType='arith',colA,operator='/',colB,constVal,ifCol,ifOp,ifVal,thenVal,elseVal,constOnly}=config; if(!outputName)return data; return data.map(row=>{ let val=null; if(formulaType==='arith'){const a=+row[colA],b=colB==='__const__'?+constVal:+row[colB];val=operator==='/'?a/b:operator==='*'?a*b:operator==='+'?a+b:a-b}else if(formulaType==='if'){const v=row[ifCol],rv=ifVal;let m=false;switch(ifOp){case'==':m=String(v)===String(rv);break;case'!=':m=String(v)!==String(rv);break;case'>':m=+v>+rv;break;case'>=':m=+v>=+rv;break;case'<':m=+v<+rv;break;case'<=':m=+v<=+rv;break};val=m?thenVal:(elseVal??null)}else{val=constOnly};return{...row,[outputName]:val}}) }
  },
  { id:'datepart',  cat:'transform', icon:'📅', name:'Date parts',             desc:'Extract year, month, quarter, week, day',
    execute(data, config) { const {dateCol,parts=['Year','Month','Quarter']}=config; return data.map(row=>{const out={...row};const d=new Date(row[dateCol]);if(isNaN(d))return out;const p=dateCol+'_';if(parts.includes('Year'))out[p+'Year']=d.getFullYear();if(parts.includes('Quarter'))out[p+'Quarter']='Q'+(Math.floor(d.getMonth()/3)+1);if(parts.includes('Month'))out[p+'Month']=d.getMonth()+1;if(parts.includes('Month_Name'))out[p+'Month_Name']=d.toLocaleString('default',{month:'long'});if(parts.includes('Week'))out[p+'Week']=Math.ceil((d-new Date(d.getFullYear(),0,1))/(7*86400000));if(parts.includes('Day'))out[p+'Day']=d.getDate();if(parts.includes('Weekday'))out[p+'Weekday']=d.getDay();return out}) }
  },
  { id:'datediff',  cat:'transform', icon:'Δt', name:'Date difference',        desc:'Days, months, or years between two dates',
    execute(data, config) { const {startCol,endCol,unit='days',outputName='Date_Diff'}=config; return data.map(row=>{const sd=new Date(row[startCol]),ed=new Date(row[endCol]);if(isNaN(sd)||isNaN(ed))return{...row,[outputName]:null};const ms=ed-sd;const val=unit==='days'?Math.round(ms/86400000):unit==='months'?Math.round(ms/(86400000*30.44)):Math.round(ms/(86400000*365.25));return{...row,[outputName]:val}}) }
  },
  { id:'textops',   cat:'transform', icon:'Aa', name:'Text operations',        desc:'Trim, upper/lower, concat, split, extract',
    execute(data, config) { const {col,operation='trim',outputName,col2,separator=' ',delimiter=',',nChars=3,startPos=0,strLen=5}=config;const nn=outputName||col;return data.map(row=>{const v=String(row[col]??'');let res;switch(operation){case'trim':res=v.trim();break;case'upper':res=v.toUpperCase();break;case'lower':res=v.toLowerCase();break;case'title':res=v.replace(/\b\w/g,c=>c.toUpperCase());break;case'concat':res=v+separator+String(row[col2]??'');break;case'left':res=v.slice(0,nChars);break;case'right':res=v.slice(-nChars);break;case'mid':res=v.slice(startPos,startPos+strLen);break;case'extract_num':res=parseFloat(v.replace(/[^\d.]/g,''))||null;break;case'remove_special':res=v.replace(/[^a-zA-Z0-9\s]/g,'');break;default:res=v};return{...row,[nn]:res}}) }
  },
  { id:'findreplace',cat:'transform',icon:'↔', name:'Find & replace',          desc:'Replace values in a column',
    execute(data, config) { const {col,find='',replace='',useRegex=false,caseSensitive=true}=config;return data.map(row=>{const v=String(row[col]??'');let rx;if(useRegex){try{rx=new RegExp(find,caseSensitive?'g':'gi')}catch{return row}}else rx=new RegExp(find.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),caseSensitive?'g':'gi');return{...row,[col]:v.replace(rx,replace)}}) }
  },
  { id:'bin',       cat:'transform', icon:'⊟', name:'Bin / bucket',            desc:'Turn a numeric column into range buckets',
    execute(data, config) { const {col,method='equal',nBins=5,outputName='Bin'}=config;const vals=data.map(r=>+r[col]).filter(v=>!isNaN(v)).sort((a,b)=>a-b);let breaks;if(method==='quantile'){breaks=[];for(let i=0;i<=nBins;i++)breaks.push(vals[Math.floor(i*(vals.length-1)/nBins)])}else{const mn=Math.min(...vals),mx=Math.max(...vals);breaks=[];for(let i=0;i<=nBins;i++)breaks.push(mn+i*(mx-mn)/nBins)};return data.map(row=>{const v=+row[col];let bin='Other';for(let i=0;i<breaks.length-1;i++){if(v>=breaks[i]&&(v<breaks[i+1]||i===breaks.length-2)){bin=breaks[i].toLocaleString()+'\u2013'+breaks[i+1].toLocaleString();break}};return{...row,[outputName]:bin}}) }
  },
  { id:'rank',      cat:'transform', icon:'#', name:'Rank',                    desc:'Rank, dense rank, or row number',
    execute(data, config) { const {sortCol,rankType='rank',direction='desc',groupCol,outputName='Rank'}=config;const rankGroup=rows=>{const sorted=[...rows].sort((a,b)=>{const av=+a[sortCol],bv=+b[sortCol];return direction==='desc'?bv-av:av-bv});const rankMap=new Map();if(rankType==='row')sorted.forEach((r,i)=>rankMap.set(r,i+1));else if(rankType==='dense'){const uv=[...new Set(sorted.map(r=>r[sortCol]))];rows.forEach(r=>rankMap.set(r,uv.indexOf(r[sortCol])+1))}else{const vr=new Map();let i=0;while(i<sorted.length){let j=i;while(j<sorted.length&&sorted[j][sortCol]===sorted[i][sortCol])j++;const avg=(i+j+1)/2;for(let k=i;k<j;k++)vr.set(sorted[k][sortCol],avg);i=j};rows.forEach(r=>rankMap.set(r,vr.get(r[sortCol])))};return rows.map(r=>({...r,[outputName]:rankMap.get(r)}))};if(!groupCol)return rankGroup(data);const groups={};data.forEach(r=>(groups[r[groupCol]]=groups[r[groupCol]]||[]).push(r));return Object.values(groups).flatMap(rankGroup) }
  },
  { id:'laglead',   cat:'transform', icon:'↕', name:'Lag / Lead',              desc:'Previous or next row value',
    execute(data, config) { const {valueCol,sortCol,groupCol,lagType='lag',offset=1,outputName='Prev_Value'}=config;const doLL=rows=>{const s=[...rows].sort((a,b)=>{const av=a[sortCol],bv=b[sortCol];return av<bv?-1:av>bv?1:0});return s.map((row,i)=>{const oi=lagType==='lag'?i-offset:i+offset;return{...row,[outputName]:oi>=0&&oi<s.length?s[oi][valueCol]:null}})};if(!groupCol)return doLL(data);const groups={};data.forEach(r=>(groups[r[groupCol]]=groups[r[groupCol]]||[]).push(r));return Object.values(groups).flatMap(doLL) }
  },
  { id:'fillnull',  cat:'transform', icon:'∅', name:'Fill nulls',              desc:'Replace missing values',
    execute(data, config) { const {col,method='const',constVal=''}=config;let fv=constVal;if(method==='mean'){const n=data.map(r=>+r[col]).filter(v=>!isNaN(v));fv=mean(n)}else if(method==='median'){const n=data.map(r=>+r[col]).filter(v=>!isNaN(v));fv=med(n)}else if(method==='mode'){const cnt={};data.forEach(r=>{if(r[col]!=null)cnt[r[col]]=(cnt[r[col]]||0)+1});fv=Object.entries(cnt).sort((a,b)=>b[1]-a[1])[0]?.[0]};if(method==='forward'){let last=null;return data.map(r=>{if(r[col]!=null)last=r[col];return{...r,[col]:r[col]??last}})}if(method==='backward'){let last=null;return[...data].reverse().map(r=>{if(r[col]!=null)last=r[col];return{...r,[col]:r[col]??last}}).reverse()};return data.map(r=>({...r,[col]:r[col]??fv})) }
  },
  { id:'rename',    cat:'transform', icon:'✏', name:'Rename columns',          desc:'Rename one or more columns',
    execute(data, config) { const {map={}}=config;return data.map(row=>{const o={};Object.entries(row).forEach(([k,v])=>o[map[k]||k]=v);return o}) }
  },
  { id:'changetype',cat:'transform', icon:'⇄', name:'Change data type',        desc:'Cast a column to number, text, or date',
    execute(data, config) { const {col,targetType='num'}=config;return data.map(row=>{let v=row[col];if(targetType==='num')v=+v||null;else if(targetType==='str')v=v!=null?String(v):null;else if(targetType==='date')v=new Date(v).toISOString().split('T')[0];return{...row,[col]:v}}) }
  },
  { id:'summary',   cat:'inspect',   icon:'≡', name:'Column summary',          desc:'Min, max, mean, median, distinct, null %',
    execute(data) { return(data.length?Object.keys(data[0]):[]).map(col=>{const vals=data.map(r=>r[col]).filter(v=>v!=null);const nums=vals.map(Number).filter(v=>!isNaN(v));const nulls=data.length-vals.length;return{Column:col,Count:data.length,'Null %':Math.round(nulls/data.length*100)+'%',Distinct:new Set(vals).size,Min:nums.length?Math.min(...nums):null,Max:nums.length?Math.max(...nums):null,Mean:nums.length?Math.round(mean(nums)*100)/100:null,Median:nums.length?Math.round(med(nums)*100)/100:null}}) }
  },
  { id:'nullaudit', cat:'inspect',   icon:'∅', name:'Null audit',              desc:'Count and % of missing values per column',
    execute(data) { return(data.length?Object.keys(data[0]):[]).map(col=>{const nulls=data.filter(r=>r[col]==null||r[col]==='').length;return{Column:col,'Null Count':nulls,'Null %':Math.round(nulls/data.length*100)+'%','Non-null':data.length-nulls}}) }
  },
  { id:'dupfinder', cat:'inspect',   icon:'◈', name:'Duplicate finder',        desc:'Show which rows are duplicates',
    execute(data, config) { const {mode='all',keyCols=[]}=config;const getKey=row=>(mode==='key'&&keyCols.length?keyCols:(data.length?Object.keys(data[0]):[])).map(c=>row[c]).join('|||');const cnt=new Map();data.forEach(r=>cnt.set(getKey(r),(cnt.get(getKey(r))||0)+1));return data.filter(r=>cnt.get(getKey(r))>1).map(r=>({...r,duplicate_count:cnt.get(getKey(r))})) }
  },
  { id:'freqdist',  cat:'inspect',   icon:'≈', name:'Value frequencies',       desc:'Top N most common values',
    execute(data, config) { const {col,topN=20}=config;if(!col)return data;const cnt=new Map();data.forEach(r=>cnt.set(r[col],(cnt.get(r[col])||0)+1));return[...cnt.entries()].sort((a,b)=>b[1]-a[1]).slice(0,topN).map(([val,count])=>({Value:val,Count:count,'% Total':Math.round(count/data.length*10000)/100})) }
  },
  { id:'crosstab',  cat:'inspect',   icon:'⊞', name:'Crosstab',                desc:'Two-way frequency table',
    execute(data, config) { const {rowCol,colCol,valueType='count'}=config;if(!rowCol||!colCol)return data;const rv=[...new Set(data.map(r=>r[rowCol]))].sort();const cv=[...new Set(data.map(r=>r[colCol]))].sort();const cnt=new Map();data.forEach(r=>{const k=r[rowCol]+'|||'+r[colCol];cnt.set(k,(cnt.get(k)||0)+1)});const rt=new Map();rv.forEach(r=>rt.set(r,cv.reduce((s,c)=>s+(cnt.get(r+'|||'+c)||0),0)));const ct=new Map();cv.forEach(c=>ct.set(c,rv.reduce((s,r)=>s+(cnt.get(r+'|||'+c)||0),0)));const total=data.length;return rv.map(r=>{const row={[rowCol]:r};cv.forEach(c=>{const n=cnt.get(r+'|||'+c)||0;row[c]=valueType==='count'?n:valueType==='pct_row'?Math.round(n/(rt.get(r)||1)*10000)/100:valueType==='pct_col'?Math.round(n/(ct.get(c)||1)*10000)/100:Math.round(n/total*10000)/100});return row}) }
  },
  { id:'pareto',    cat:'inspect',   icon:'⌇', name:'Pareto / 80-20',          desc:'Cumulative % of total sorted descending',
    execute(data, config) { const {catCol,valueCol,sortDir='desc'}=config;if(!catCol||!valueCol)return data;const agg=new Map();data.forEach(r=>agg.set(r[catCol],(agg.get(r[catCol])||0)+(+r[valueCol]||0)));const sorted=[...agg.entries()].sort((a,b)=>sortDir==='desc'?b[1]-a[1]:a[1]-b[1]);const total=sorted.reduce((s,[,v])=>s+v,0);let cum=0;return sorted.map(([cat,val])=>{cum+=val;return{[catCol]:cat,[valueCol]:Math.round(val*100)/100,'Cumulative %':Math.round(cum/total*10000)/100}}) }
  },
  { id:'condtag',   cat:'segment',   icon:'🏷', name:'Conditional tagging',     desc:'Assign segment labels based on rules',
    execute(data, config) { const {outputName='Segment',rules=[],defaultLabel='Other'}=config;return data.map(row=>{for(const rule of rules){const v=row[rule.col],rv=rule.val;let m=false;switch(rule.op){case'==':m=String(v)===String(rv)||+v===+rv;break;case'!=':m=String(v)!==String(rv);break;case'>':m=+v>+rv;break;case'>=':m=+v>=+rv;break;case'<':m=+v<+rv;break;case'<=':m=+v<=+rv;break;case'contains':m=String(v??'').toLowerCase().includes(rv.toLowerCase());break;case'is empty':m=v==null||v==='';break;case'is not empty':m=v!=null&&v!=='';break};if(m)return{...row,[outputName]:rule.label}};return{...row,[outputName]:defaultLabel}}) }
  },
  { id:'percentile',cat:'segment',   icon:'⊠', name:'Percentile / decile',     desc:'Assign quartile or decile buckets',
    execute(data, config) { const {col,bucketType='quartile',outputName='Bucket'}=config;const vals=data.map(r=>+r[col]).filter(v=>!isNaN(v)).sort((a,b)=>a-b);const n=bucketType==='quartile'?4:10;const pfx=bucketType==='quartile'?'Q':'D';const getQ=v=>Math.min(n,Math.ceil(vals.filter(vv=>vv<=v).length/vals.length*n));return data.map(row=>({...row,[outputName]:pfx+getQ(+row[col])})) }
  },
  { id:'firstlast', cat:'segment',   icon:'⊣', name:'Flag first / last',       desc:'Flag first or last occurrence per group',
    execute(data, config) { const {groupCol,sortCol,flagType='first',outputName='Is_First'}=config;const groups=new Map();data.forEach(r=>(groups.get(r[groupCol])||groups.set(r[groupCol],[])&&groups.get(r[groupCol])).push(r));return[...groups.values()].flatMap(rows=>{const s=[...rows].sort((a,b)=>{const av=a[sortCol],bv=b[sortCol];return av<bv?-1:av>bv?1:0});return s.map((row,i)=>{const flag=flagType==='first'?i===0:flagType==='last'?i===s.length-1:i===0||i===s.length-1;return{...row,[outputName]:flag?'Yes':'No'}})}) }
  },
  { id:'periodcomp',cat:'time',      icon:'⟳', name:'Period comparison',        desc:'YoY, MoM, WoW, QoQ',
    execute(data, config) { const {dateCol,valueCol,period='yoy',groupCol}=config;const getKey=row=>{const d=new Date(row[dateCol]);const g=groupCol?row[groupCol]:'';switch(period){case'yoy':return d.getFullYear()+'|'+g;case'mom':return d.getFullYear()+'-'+(d.getMonth()+1)+'|'+g;case'qoq':return d.getFullYear()+'-Q'+(Math.floor(d.getMonth()/3)+1)+'|'+g;default:return d.getFullYear()+'-W'+Math.ceil((d-new Date(d.getFullYear(),0,1))/(7*86400000))+'|'+g}};const getPrior=row=>{const d=new Date(row[dateCol]);const g=groupCol?row[groupCol]:'';switch(period){case'yoy':return(d.getFullYear()-1)+'|'+g;case'mom':{const pm=d.getMonth()===0?11:d.getMonth()-1;return(d.getMonth()===0?d.getFullYear()-1:d.getFullYear())+'-'+(pm+1)+'|'+g};case'qoq':{const q=Math.floor(d.getMonth()/3);return q>0?d.getFullYear()+'-Q'+q+'|'+g:(d.getFullYear()-1)+'-Q4|'+g};default:{const wk=Math.ceil((d-new Date(d.getFullYear(),0,1))/(7*86400000));return wk>1?d.getFullYear()+'-W'+(wk-1)+'|'+g:(d.getFullYear()-1)+'-W52|'+g}}};const totals=new Map();data.forEach(r=>totals.set(getKey(r),(totals.get(getKey(r))||0)+(+r[valueCol]||0)));const pfx=period.toUpperCase();return data.map(row=>{const prior=totals.get(getPrior(row))??null;const curr=+row[valueCol]||0;return{...row,Prior_Period_Val:prior,[pfx+'_Delta']:prior!=null?Math.round((curr-prior)*100)/100:null,[pfx+'_Pct_Chg']:prior!=null&&prior!==0?Math.round((curr-prior)/Math.abs(prior)*10000)/100:null}}) }
  },
  { id:'rolling',   cat:'time',      icon:'〜', name:'Rolling average',          desc:'Trailing N-period average or sum',
    execute(data, config) { const {valueCol,sortCol,groupCol,windowSize=3,aggregation='AVG',outputName='Rolling'}=config;const doRoll=rows=>{const s=[...rows].sort((a,b)=>{const av=a[sortCol],bv=b[sortCol];return av<bv?-1:av>bv?1:0});return s.map((row,i)=>{const w=s.slice(Math.max(0,i-windowSize+1),i+1).map(r=>+r[valueCol]).filter(v=>!isNaN(v));let val;switch(aggregation){case'AVG':val=mean(w);break;case'SUM':val=w.reduce((s,v)=>s+v,0);break;case'MIN':val=Math.min(...w);break;case'MAX':val=Math.max(...w);break};return{...row,[outputName]:Math.round(val*100)/100}})};if(!groupCol)return doRoll(data);const groups={};data.forEach(r=>(groups[r[groupCol]]=groups[r[groupCol]]||[]).push(r));return Object.values(groups).flatMap(doRoll) }
  },
  { id:'fiscal',    cat:'time',      icon:'📆', name:'Fiscal calendar',          desc:'Map dates to a fiscal year/quarter',
    execute(data, config) { const {dateCol,fiscalStartMonth=4,parts=['Fiscal_Year','Fiscal_Quarter']}=config;return data.map(row=>{const d=new Date(row[dateCol]);if(isNaN(d))return row;const out={...row};const cm=d.getMonth()+1;const cy=d.getFullYear();const fy=cm>=fiscalStartMonth?cy:cy-1;const fq=Math.floor(((cm-fiscalStartMonth+12)%12)/3)+1;const fp=(cm-fiscalStartMonth+12)%12+1;if(parts.includes('Fiscal_Year'))out['Fiscal_Year']=fy+'-'+(fy+1);if(parts.includes('Fiscal_Quarter'))out['Fiscal_Quarter']='Q'+fq;if(parts.includes('Fiscal_Month'))out['Fiscal_Month']=fp;if(parts.includes('Fiscal_Period_Label'))out['Fiscal_Period_Label']='FY'+fy+'-Q'+fq+'-M'+fp;return out}) }
  },
]

export const OP_BY_ID = Object.fromEntries(OPERATIONS.map(o => [o.id, o]))