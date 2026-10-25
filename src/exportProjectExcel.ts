export type ExportStage = { id: string; name: string; description: string | null; start_date: string | null; end_date: string | null }
export type ExportTask = { stage_id: string; title: string; description: string | null; status: 'todo' | 'in_progress' | 'done'; priority: string; start_date: string | null; due_date: string | null }

const parseDate = (v: string | null) => v ? new Date(v+'T00:00:00') : null
const key = (d: Date) => d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')
const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate()+n); return x }
const status = (s: string) => s === 'done' ? 'Completed' : s === 'in_progress' ? 'Ongoing' : 'To be started'
type Cell = { v: unknown; style?: string }
type Sheet = { name: string; rows: Cell[][] }
const c = (v: unknown, style = ''): Cell => ({v,style})

export function exportProjectExcel(projectName: string, stages: ExportStage[], tasks: ExportTask[]) {
  const used = new Set<string>()
  const sheetName = (name: string) => {
    const base = name.replace(/[\\/?*\[\]:]/g,' ').trim().slice(0,31) || 'Stage'
    let out = base, i = 2
    while (used.has(out.toLowerCase())) { const suffix = ' '+i++; out = base.slice(0,31-suffix.length)+suffix }
    used.add(out.toLowerCase()); return out
  }
  const all = [...stages.flatMap(s=>[parseDate(s.start_date),parseDate(s.end_date)]),...tasks.flatMap(t=>[parseDate(t.start_date),parseDate(t.due_date)])].filter((d): d is Date=>!!d)
  const today = new Date(); today.setHours(0,0,0,0)
  const min = all.length ? new Date(Math.min(...all.map(d=>d.getTime()))) : new Date(today.getFullYear(),today.getMonth(),1)
  let max = all.length ? new Date(Math.max(...all.map(d=>d.getTime()))) : addDays(min,29)
  if ((max.getTime()-min.getTime())/86400000 > 364) max=addDays(min,364)
  const days = Array.from({length:Math.max(1,Math.floor((max.getTime()-min.getTime())/86400000)+1)},(_,i)=>addDays(min,i))
  const summary: Cell[][] = [[c(projectName,'Title')],[c('Stage summary · exported '+today.toLocaleDateString(),'Subtitle')],[c('Stage','Header'),c('Start date','Header'),c('End date','Header'),c('Completed %','Header'),c('Tasks completed','Header'),c('Total tasks','Header'),c('Ongoing','Header'),c('To be started','Header'),c('Overdue','Header')]]
  stages.forEach(s=>{
    const ts=tasks.filter(t=>t.stage_id===s.id), done=ts.filter(t=>t.status==='done').length, pct=ts.length?Math.round(done/ts.length*100):0
    summary.push([c(s.name),c(s.start_date||'Not set'),c(s.end_date||'Not set'),c(pct+'%'),c(done+' / '+ts.length),c(ts.length),c(ts.filter(t=>t.status==='in_progress').length),c(ts.filter(t=>t.status==='todo').length),c(ts.filter(t=>t.status!=='done'&&t.due_date&&t.due_date<key(today)).length)])
  })
  summary.push([c('')],[c('Stage Gantt chart','Title')],[c('Stage','Header'),c('Start','Header'),c('End','Header'),...days.map(d=>c(key(d),'Header'))])
  stages.forEach(s=>{
    const ts=tasks.filter(t=>t.stage_id===s.id), dates=ts.flatMap(t=>[parseDate(t.start_date),parseDate(t.due_date)]).filter((d):d is Date=>!!d)
    const start=parseDate(s.start_date)||(dates.length?new Date(Math.min(...dates.map(d=>d.getTime()))):null)
    const end=parseDate(s.end_date)||(dates.length?new Date(Math.max(...dates.map(d=>d.getTime()))):null)
    summary.push([c(s.name),c(s.start_date|| (start?key(start):'')),c(s.end_date||(end?key(end):'')),...days.map(d=>c(start&&end&&d>=start&&d<=end?'■':'',start&&end&&d>=start&&d<=end?'StageBar':''))])
  })
  const sheets: Sheet[]=[{name:sheetName('Stage Summary'),rows:summary}]
  stages.forEach(s=>{
    const ts=tasks.filter(t=>t.stage_id===s.id), dated=ts.flatMap(t=>[parseDate(t.start_date),parseDate(t.due_date)]).filter((d):d is Date=>!!d)
    const start=dated.length?new Date(Math.min(...dated.map(d=>d.getTime()))):parseDate(s.start_date)||today
    let end=dated.length?new Date(Math.max(...dated.map(d=>d.getTime()))):parseDate(s.end_date)||addDays(start,14)
    if ((end.getTime()-start.getTime())/86400000>179) end=addDays(start,179)
    const timeline=Array.from({length:Math.max(1,Math.floor((end.getTime()-start.getTime())/86400000)+1)},(_,i)=>addDays(start,i))
    const rows: Cell[][]=[[c(s.name,'Title')],[c('Stage dates: '+(s.start_date||'Not set')+' to '+(s.end_date||'Not set'),'Subtitle')],[c('Task','Header'),c('Description','Header'),c('Start date','Header'),c('End date','Header'),c('Status','Header'),c('Priority','Header')]]
    ts.forEach(t=>rows.push([c(t.title),c(t.description||''),c(t.start_date||''),c(t.due_date||''),c(status(t.status)),c(t.priority)]))
    rows.push([c('')],[c('Task Gantt chart','Title')],[c('Task','Header'),...timeline.map(d=>c(key(d),'Header'))])
    ts.forEach(t=>{const a=parseDate(t.start_date),b=parseDate(t.due_date)||a;rows.push([c(t.title),...timeline.map(d=>c(a&&b&&d>=a&&d<=b?'■':'',a&&b&&d>=a&&d<=b?(t.status==='done'?'TaskDone':t.status==='in_progress'?'TaskProgress':'TaskTodo'):''))])})
    sheets.push({name:sheetName(s.name),rows})
  })
  const esc=(v: unknown)=>String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
  const styles='<Styles><Style ss:ID="Default" ss:Name="Normal"><Alignment ss:Vertical="Center"/><Font ss:FontName="Aptos" ss:Size="10" ss:Color="#243047"/></Style><Style ss:ID="Title"><Font ss:Bold="1" ss:Size="16" ss:Color="#5B45C6"/></Style><Style ss:ID="Subtitle"><Font ss:Italic="1" ss:Color="#65708A"/></Style><Style ss:ID="Header"><Font ss:Bold="1" ss:Color="#FFFFFF"/><Interior ss:Color="#5141A5" ss:Pattern="Solid"/><Alignment ss:WrapText="1"/></Style><Style ss:ID="StageBar"><Interior ss:Color="#9A8CFF" ss:Pattern="Solid"/></Style><Style ss:ID="TaskDone"><Interior ss:Color="#39B88A" ss:Pattern="Solid"/></Style><Style ss:ID="TaskProgress"><Interior ss:Color="#9A8CFF" ss:Pattern="Solid"/></Style><Style ss:ID="TaskTodo"><Interior ss:Color="#E6A23C" ss:Pattern="Solid"/></Style></Styles>'
  const xml='<?xml version="1.0"?><?mso-application progid="Excel.Sheet"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">'+styles+sheets.map(s=>'<Worksheet ss:Name="'+esc(s.name)+'"><Table>'+s.rows.map(row=>'<Row>'+row.map(item=>'<Cell'+(item.style?' ss:StyleID="'+esc(item.style)+'"':'')+'><Data ss:Type="String">'+esc(item.v)+'</Data></Cell>').join('')+'</Row>').join('')+'</Table><WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel"><FreezePanes/><FrozenNoSplit/><SplitHorizontal>3</SplitHorizontal><TopRowBottomPane>3</TopRowBottomPane><ActivePane>2</ActivePane></WorksheetOptions></Worksheet>').join('')+'</Workbook>'
  const blob=new Blob([xml],{type:'application/vnd.ms-excel;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a')
  a.href=url;a.download=projectName.replace(/[^a-z0-9-_]+/gi,'_')+'_ProjectHub_Report.xls';document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url)
}
