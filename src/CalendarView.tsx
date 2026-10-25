import { CalendarDays, ChevronLeft, ChevronRight, AlertCircle } from 'lucide-react'

export type CalendarStage = { id: string; name: string; start_date: string | null; end_date: string | null }
export type CalendarTask = { id: string; stage_id: string; title: string; due_date: string | null; status: 'todo' | 'in_progress' | 'done' }

function key(d: Date) { return [d.getFullYear(), String(d.getMonth()+1).padStart(2,'0'), String(d.getDate()).padStart(2,'0')].join('-') }

export default function CalendarView({ stages, tasks, month, setMonth, onOpenStage }: {
  stages: CalendarStage[]; tasks: CalendarTask[]; month: Date; setMonth: (date: Date) => void; onOpenStage: (id: string) => void
}) {
  const first = new Date(month.getFullYear(), month.getMonth(), 1)
  const offset = (first.getDay()+6)%7
  const start = new Date(first); start.setDate(first.getDate()-offset)
  const days = Array.from({length:42},(_,i)=>{const d=new Date(start);d.setDate(start.getDate()+i);return d})
  const today = key(new Date())
  return <section className="panel calendar-panel">
    <div className="panel-heading"><div><h2><CalendarDays size={19} style={{verticalAlign:'middle',marginRight:8}}/>Task deadline calendar</h2><p>Red dates indicate deadlines. Overdue unfinished tasks are flagged.</p></div><span className="count-pill">{tasks.filter(t=>t.due_date).length} deadlines</span></div>
    <div className="calendar-toolbar"><button className="outline-button" onClick={()=>setMonth(new Date(month.getFullYear(),month.getMonth()-1,1))}><ChevronLeft size={15}/> Previous</button><h3>{month.toLocaleDateString(undefined,{month:'long',year:'numeric'})}</h3><div><button className="outline-button" onClick={()=>setMonth(new Date())}>Today</button> <button className="outline-button" onClick={()=>setMonth(new Date(month.getFullYear(),month.getMonth()+1,1))}>Next <ChevronRight size={15}/></button></div></div>
    <div className="calendar-grid">{['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(w=><div className="calendar-weekday" key={w}>{w}</div>)}{days.map(day=>{
      const date=key(day), due=tasks.filter(t=>t.due_date===date), overdue=due.filter(t=>t.status!=='done'&&date<today)
      return <div key={date} className={'calendar-day'+(day.getMonth()!==month.getMonth()?' outside-month':'')+(date===today?' today':'')+(due.length?' has-deadline':'')}>
        <span className="calendar-day-number">{day.getDate()}</span>
        {due.map(task=>{const stage=stages.find(s=>s.id===task.stage_id);return <button key={task.id} className={'calendar-event '+(task.status==='done'?' event-done':' event-deadline')+(task.status!=='done'&&date<today?' event-overdue':'')} title={stage?.name+' · '+task.title} onClick={()=>stage&&onOpenStage(stage.id)}>{task.status!=='done'&&date<today&&<AlertCircle size={11}/>}<span>{(stage?.name ? stage.name + ': ' : '') + task.title}</span></button>})}
        {overdue.length>0&&<span className="calendar-overdue-count">{overdue.length} missed</span>}
      </div>
    })}</div>
    <div className="calendar-legend"><span><i className="calendar-legend-red"/> Deadline</span><span><i className="calendar-legend-green"/> Completed</span><span><AlertCircle size={13}/> Missed deadline</span></div>
  </section>
}
