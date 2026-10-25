import { useMemo, useState } from 'react'
import { CalendarDays, ChevronLeft, ChevronRight, AlertCircle } from 'lucide-react'

export type CalendarStage = { id: string; name: string; start_date: string | null; end_date: string | null }
export type CalendarTask = { id: string; stage_id: string; title: string; due_date: string | null; status: 'todo' | 'in_progress' | 'done' }
function key(d: Date) { return [d.getFullYear(), String(d.getMonth()+1).padStart(2,'0'), String(d.getDate()).padStart(2,'0')].join('-') }
function monthStart(d: Date) { return new Date(d.getFullYear(), d.getMonth(), 1) }
function MonthGrid({month,stages,tasks,onOpenStage}:{month:Date;stages:CalendarStage[];tasks:CalendarTask[];onOpenStage:(id:string)=>void}) {
  const first=monthStart(month), offset=(first.getDay()+6)%7, start=new Date(first);start.setDate(first.getDate()-offset)
  const days=Array.from({length:42},(_,i)=>{const d=new Date(start);d.setDate(start.getDate()+i);return d})
  const today=key(new Date())
  return <div className="mini-month"><h3>{month.toLocaleDateString(undefined,{month:'long',year:'numeric'})}</h3><div className="mini-calendar-grid">{['M','T','W','T','F','S','S'].map((w,i)=><div className="mini-weekday" key={w+i}>{w}</div>)}{days.map(day=>{const date=key(day),due=tasks.filter(t=>t.due_date===date),overdue=due.some(t=>t.status!=='done'&&date<today);return <div key={date} title={due.map(t=>t.title).join(', ')} className={'mini-day'+(day.getMonth()!==month.getMonth()?' outside':'')+(date===today?' today':'')+(due.length?' deadline':'')+(overdue?' overdue':'')}><span>{day.getDate()}</span>{due.length>0&&<i>{due.length>1?due.length:''}</i>}{due.length>0&&<div className="mini-day-popover">{due.slice(0,5).map(task=>{const stage=stages.find(s=>s.id===task.stage_id);return <button key={task.id} onClick={()=>stage&&onOpenStage(stage.id)}>{task.status!=='done'&&date<today&&<AlertCircle size={10}/>} {stage?.name?stage.name+': ':''}{task.title}</button>})}</div>}</div>})}</div></div>
}
export default function CalendarView({stages,tasks,month,setMonth,onOpenStage}:{stages:CalendarStage[];tasks:CalendarTask[];month:Date;setMonth:(date:Date)=>void;onOpenStage:(id:string)=>void}) {
 const [viewCount,setViewCount]=useState<1|4|12>(1)
 const months=useMemo(()=>Array.from({length:viewCount},(_,i)=>new Date(month.getFullYear(),month.getMonth()+i,1)),[month,viewCount])
 return <section className="panel calendar-panel compact-calendar-panel">
  <div className="panel-heading"><div><h2><CalendarDays size={17} style={{verticalAlign:'middle',marginRight:6}}/>Deadline calendar</h2><p>Red marks indicate deadlines; darker red marks overdue work. Select an event to open its stage.</p></div><span className="count-pill">{tasks.filter(t=>t.due_date).length} deadlines</span></div>
  <div className="calendar-toolbar compact-calendar-toolbar"><div className="calendar-view-buttons">{([{n:1,label:'1 month'},{n:4,label:'4 months'},{n:12,label:'12 months'}] as const).map(v=><button key={v.n} className={'outline-button '+(viewCount===v.n?'selected-range':'')} onClick={()=>setViewCount(v.n)}>{v.label}</button>)}</div><h3>{viewCount===1?months[0].toLocaleDateString(undefined,{month:'long',year:'numeric'}):months[0].toLocaleDateString(undefined,{month:'short',year:'numeric'})+' – '+months[months.length-1].toLocaleDateString(undefined,{month:'short',year:'numeric'})}</h3><div><button className="outline-button" onClick={()=>setMonth(new Date(month.getFullYear(),month.getMonth()-viewCount,1))}><ChevronLeft size={13}/></button><button className="outline-button" onClick={()=>setMonth(monthStart(new Date()))}>Today</button><button className="outline-button" onClick={()=>setMonth(new Date(month.getFullYear(),month.getMonth()+viewCount,1))}><ChevronRight size={13}/></button></div></div>
  <div className={'calendar-months months-'+viewCount}>{months.map(m=><MonthGrid key={key(m)} month={m} stages={stages} tasks={tasks} onOpenStage={onOpenStage}/>)}</div>
  <div className="calendar-legend"><span><i className="calendar-legend-red"/> Deadline</span><span><i className="calendar-legend-green"/> Completed task</span><span><AlertCircle size={12}/> Overdue</span></div>
 </section>
}
