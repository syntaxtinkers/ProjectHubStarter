import type { ExportStage, ExportTask } from './exportProjectExcel'

type PdfField = { id: string; name: string; sort_order: number }

const escapeHtml = (value: unknown) => String(value ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;')

const formatStatus = (status: string) => status === 'done' ? 'Completed' : status === 'in_progress' ? 'Ongoing' : 'To be started'
const dateValue = (value: string | null | undefined) => value || '—'

export function exportProjectPdf(projectName: string, stages: ExportStage[], tasks: (ExportTask & {
  id?: string
  assigned_by_name?: string | null
  assigned_to_name?: string | null
  custom_fields?: Record<string, string> | null
})[], fields: PdfField[] = []) {
  const stagePages = stages.map(stage => {
    const stageTasks = tasks.filter(task => task.stage_id === stage.id)
    const completed = stageTasks.filter(task => task.status === 'done').length
    const pct = stageTasks.length ? Math.round(completed / stageTasks.length * 100) : 0
    const taskRows = stageTasks.map(task => {
      const custom = fields.map(field => '<td>' + escapeHtml(task.custom_fields?.[field.id] || '—') + '</td>').join('')
      return '<tr><td class="task-name">' + escapeHtml(task.title) + '</td><td>' + escapeHtml(dateValue(task.start_date)) + '</td><td>' + escapeHtml(dateValue(task.due_date)) + '</td><td>' + escapeHtml(task.assigned_by_name || '—') + '</td><td>' + escapeHtml(task.assigned_to_name || '—') + '</td>' + custom + '<td><span class="status status-' + escapeHtml(task.status) + '">' + escapeHtml(formatStatus(task.status)) + '</span></td><td>' + escapeHtml(task.priority || 'normal') + '</td></tr>'
    }).join('')
    const barRows = stageTasks.map(task => {
      const start = task.start_date ? new Date(task.start_date + 'T00:00:00') : null
      const end = task.due_date ? new Date(task.due_date + 'T00:00:00') : start
      const total = start && end ? Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000) + 1) : 0
      const max = stage.start_date && stage.end_date ? Math.max(1, Math.round((new Date(stage.end_date + 'T00:00:00').getTime() - new Date(stage.start_date + 'T00:00:00').getTime()) / 86400000) + 1) : Math.max(total, 1)
      const left = start && stage.start_date ? Math.max(0, Math.min(100, (start.getTime() - new Date(stage.start_date + 'T00:00:00').getTime()) / 86400000 / max * 100)) : 0
      const width = total ? Math.max(1, Math.min(100 - left, total / max * 100)) : 0
      const tone = task.status === 'done' ? 'done' : task.status === 'in_progress' ? 'progress' : 'todo'
      return '<div class="bar-row"><div class="bar-label">' + escapeHtml(task.title) + '</div><div class="bar-track">' + (width ? '<span class="bar ' + tone + '" style="left:' + left + '%;width:' + width + '%"></span>' : '<span class="bar-empty">Dates not set</span>') + '</div><div class="bar-dates">' + escapeHtml(dateValue(task.start_date)) + ' – ' + escapeHtml(dateValue(task.due_date)) + '</div></div>'
    }).join('')
    const headers = '<th>Task</th><th>Start date</th><th>End date</th><th>Assigner</th><th>Assignee</th>' + fields.map(field => '<th>' + escapeHtml(field.name) + '</th>').join('') + '<th>Status</th><th>Priority</th>'
    return '<section class="stage-page"><div class="stage-header"><div><div class="eyebrow">STAGE</div><h2>' + escapeHtml(stage.name) + '</h2><p>' + escapeHtml(stage.description || 'No stage description') + '</p></div><div class="stage-dates"><b>' + escapeHtml(dateValue(stage.start_date)) + '</b><span>to</span><b>' + escapeHtml(dateValue(stage.end_date)) + '</b></div></div><div class="stats"><div><small>COMPLETION</small><strong>' + pct + '%</strong><span>' + completed + ' of ' + stageTasks.length + ' tasks</span></div><div><small>ONGOING</small><strong>' + stageTasks.filter(task => task.status === 'in_progress').length + '</strong><span>tasks</span></div><div><small>TO BE STARTED</small><strong>' + stageTasks.filter(task => task.status === 'todo').length + '</strong><span>tasks</span></div></div><h3>Task details</h3><table><thead><tr>' + headers + '</tr></thead><tbody>' + (taskRows || '<tr><td colspan="' + (7 + fields.length) + '" class="empty">No tasks in this stage</td></tr>') + '</tbody></table><h3>Task Gantt chart</h3><div class="gantt">' + (barRows || '<p class="empty">No tasks to chart.</p>') + '</div></section>'
  }).join('')
  const totalTasks = tasks.length
  const doneTasks = tasks.filter(task => task.status === 'done').length
  const today = new Date().toLocaleDateString()
  const html = '<!doctype html><html><head><meta charset="utf-8"><title>' + escapeHtml(projectName) + ' — ProjectHub report</title><style>' +
    '@page{size:A4 landscape;margin:12mm}*{box-sizing:border-box}body{font:10px/1.45 Arial,Helvetica,sans-serif;color:#202938;background:#fff;margin:0}h1{font-size:25px;margin:4px 0 8px;color:#1c2534}h2{font-size:18px;margin:2px 0 4px}h3{font-size:13px;margin:18px 0 8px;border-bottom:1px solid #aeb7c5;padding-bottom:5px}.eyebrow{font-size:9px;letter-spacing:1.6px;color:#6254b6;font-weight:bold}.cover{padding:20px 0 14px;border-bottom:2px solid #6254b6;margin-bottom:16px}.muted{color:#647084}.summary{display:flex;gap:10px;margin:15px 0 20px}.summary>div,.stats>div{border:1px solid #cbd2dd;padding:10px 12px;flex:1;border-radius:5px}.summary strong,.stats strong{display:block;font-size:18px;margin:3px 0;color:#1d293b}.summary small,.stats small{display:block;color:#657186;font-size:8px;letter-spacing:1px;font-weight:bold}.stage-page{page-break-before:always;break-before:page}.stage-header{display:flex;justify-content:space-between;gap:18px;border-bottom:1px solid #cbd2dd;padding-bottom:10px}.stage-header p{margin:4px 0;color:#657186}.stage-dates{display:flex;gap:6px;align-items:center;white-space:nowrap}.stage-dates b{border:1px solid #cbd2dd;padding:6px;border-radius:4px}.stats{display:flex;gap:9px;margin:12px 0}.stats>div{padding:8px}.stats strong{font-size:16px}.stats span{color:#647084;font-size:9px}table{width:100%;border-collapse:collapse;table-layout:auto;margin:8px 0 14px}th,td{border:1px solid #c8d0db;padding:5px 6px;text-align:left;vertical-align:top;overflow-wrap:anywhere}th{background:#f1f3f8;color:#293449;font-weight:bold}td{background:#fff}.task-name{font-weight:bold;min-width:110px}.status{display:inline-block;border:1px solid #c5cbd5;border-radius:10px;padding:2px 5px;white-space:nowrap}.status-done{background:#e4f6ee;border-color:#9bd6bc;color:#166744}.status-in_progress{background:#eeeaff;border-color:#c0b5fa;color:#5141a5}.status-todo{background:#fff2dc;border-color:#e9c98f;color:#83560e}.gantt{border:1px solid #cbd2dd;border-radius:5px;padding:6px}.bar-row{display:grid;grid-template-columns:minmax(100px,18%) 1fr 135px;align-items:center;gap:8px;padding:5px 2px;border-bottom:1px solid #e3e6ec}.bar-row:last-child{border-bottom:0}.bar-label{font-weight:bold;overflow-wrap:anywhere}.bar-track{height:13px;background:repeating-linear-gradient(90deg,#f6f7fa 0,#f6f7fa calc(10% - 1px),#dfe4ec calc(10% - 1px),#dfe4ec 10%);border:1px solid #d5dbe5;position:relative;border-radius:3px}.bar{position:absolute;top:1px;bottom:1px;border-radius:2px;min-width:3px}.bar.done{background:#45b88b}.bar.progress{background:#8878ed}.bar.todo{background:#e5ae4f}.bar-empty{font-size:8px;color:#667085;padding-left:4px}.bar-dates{font-size:8px;color:#5f6b7c;text-align:right}.empty{color:#657084;text-align:center;padding:12px}footer{margin-top:18px;border-top:1px solid #d5dbe5;padding-top:7px;color:#657084;font-size:8px}@media print{a{color:inherit}thead{display:table-header-group}tr{break-inside:avoid}.stage-page{break-before:page}}' +
    '</style></head><body><div class="cover"><div class="eyebrow">PROJECTHUB · PROJECT REPORT</div><h1>' + escapeHtml(projectName) + '</h1><div class="muted">Generated ' + escapeHtml(today) + '</div></div><div class="summary"><div><small>STAGES</small><strong>' + stages.length + '</strong></div><div><small>TOTAL TASKS</small><strong>' + totalTasks + '</strong></div><div><small>COMPLETED</small><strong>' + doneTasks + ' / ' + totalTasks + '</strong></div><div><small>PROJECT COMPLETION</small><strong>' + (totalTasks ? Math.round(doneTasks / totalTasks * 100) : 0) + '%</strong></div></div><h3>Stage summary</h3><table><thead><tr><th>Stage</th><th>Start date</th><th>End date</th><th>Completion</th><th>Tasks completed</th><th>Ongoing</th><th>To be started</th></tr></thead><tbody>' + stages.map(stage => { const list=tasks.filter(task=>task.stage_id===stage.id); const done=list.filter(task=>task.status==='done').length; return '<tr><td><b>'+escapeHtml(stage.name)+'</b></td><td>'+escapeHtml(dateValue(stage.start_date))+'</td><td>'+escapeHtml(dateValue(stage.end_date))+'</td><td>'+(list.length?Math.round(done/list.length*100):0)+'%</td><td>'+done+' / '+list.length+'</td><td>'+list.filter(task=>task.status==='in_progress').length+'</td><td>'+list.filter(task=>task.status==='todo').length+'</td></tr>' }).join('') + '</tbody></table>' + (stagePages || '<p class="empty">No stages in this project.</p>') + '<footer>ProjectHub · Printable report · Use the browser print dialog and choose “Save as PDF”.</footer><script>window.addEventListener("load",function(){setTimeout(function(){window.print()},300)})</script></body></html>'
  const printWindow = window.open('', '_blank')
  if (!printWindow) {
    alert('Your browser blocked the report window. Allow pop-ups for ProjectHub and try Export PDF again.')
    return
  }
  printWindow.document.open()
  printWindow.document.write(html)
  printWindow.document.close()
}
