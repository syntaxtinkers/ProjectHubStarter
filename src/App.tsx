import { useEffect, useMemo, useState } from 'react'
import type { FormEvent, CSSProperties } from 'react'
import {
  Activity, ArrowLeft, CalendarDays, Check, ChevronDown, CircleHelp, Command, FolderKanban,
  LayoutDashboard, LogOut, MessageCircle, Plus, Search, Settings2, ShieldCheck, Users, X,
  LockKeyhole, Eye, Pencil, LoaderCircle, ListTodo, GanttChartSquare, Palette, Trash2,
  CircleCheck, Clock3, AlertCircle, RefreshCw, UserPlus, SlidersHorizontal, Filter
} from 'lucide-react'
import { isConfigured, supabase } from './lib/supabase'

type Project = { id: string; name: string; description: string | null; created_at: string; role?: Role }
type Comment = { id: string; body: string; created_at: string; user_id: string }
type Role = 'owner' | 'editor' | 'commenter' | 'viewer'
type TaskStatus = 'todo' | 'in_progress' | 'done'
type Task = { id: string; project_id: string; title: string; description: string | null; status: TaskStatus; priority: string; start_date: string | null; due_date: string | null; assigned_to: string | null; created_by: string; created_at: string }
type Member = { user_id: string; role: Role; joined_at: string; email?: string }
type Tab = 'overview' | 'tasks' | 'gantt' | 'team' | 'discussion' | 'settings'

const roleLabels: Record<Role, string> = { owner: 'Owner / Main editor', editor: 'Editor', commenter: 'Commenter', viewer: 'Viewer' }
const colors = ['violet', 'blue', 'mint', 'orange']
const canEdit = (r?: Role) => r === 'owner' || r === 'editor'
const canComment = (r?: Role) => r === 'owner' || r === 'editor' || r === 'commenter'
const initialPrefs = { bg: '#0b1020', panel: '#11182b', text: '#e9edf7', accent: '#9a8cff', fontSize: '14', mode: 'dark' }

export default function App() {
  const [session, setSession] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin')
  const [authMessage, setAuthMessage] = useState('')
  const [projects, setProjects] = useState<Project[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [comments, setComments] = useState<Comment[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [members, setMembers] = useState<Member[]>([])
  const [commentText, setCommentText] = useState('')
  const [search, setSearch] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [showTask, setShowTask] = useState(false)
  const [projectName, setProjectName] = useState('')
  const [projectDescription, setProjectDescription] = useState('')
  const [taskTitle, setTaskTitle] = useState('')
  const [taskDescription, setTaskDescription] = useState('')
  const [taskPriority, setTaskPriority] = useState('normal')
  const [taskStatus, setTaskStatus] = useState<TaskStatus>('todo')
  const [taskStart, setTaskStart] = useState('')
  const [taskDue, setTaskDue] = useState('')
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<Role>('editor')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [tab, setTab] = useState<Tab>('overview')
  const [taskFilter, setTaskFilter] = useState<'all' | TaskStatus>('all')
  const [prefs, setPrefs] = useState(initialPrefs)
  const [profileName, setProfileName] = useState('')

  const selected = projects.find(p => p.id === selectedId) ?? null
  const filteredProjects = useMemo(() => projects.filter(p =>
    `${p.name} ${p.description ?? ''}`.toLowerCase().includes(search.toLowerCase())
  ), [projects, search])
  const themeStyle = { '--bg': prefs.bg, '--panel': prefs.panel, '--text': prefs.text, '--purple': prefs.accent, fontSize: `${prefs.fontSize}px` } as CSSProperties

  useEffect(() => {
    try {
      const saved = localStorage.getItem('projecthub-preferences')
      if (saved) setPrefs({ ...initialPrefs, ...JSON.parse(saved) })
    } catch { /* ignore invalid local preference cache */ }
  }, [])
  useEffect(() => {
    try { setProfileName(localStorage.getItem('projecthub-display-name') ?? '') } catch { /* ignore */ }
  }, [])
  useEffect(() => {
    try { localStorage.setItem('projecthub-display-name', profileName) } catch { /* ignore */ }
  }, [profileName])
  useEffect(() => {
    if (!supabase) { setLoading(false); return }
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setLoading(false) })
    const { data: listener } = supabase.auth.onAuthStateChange((_event, next) => setSession(next))
    return () => listener.subscription.unsubscribe()
  }, [])
  useEffect(() => {
    if (session?.user) void loadProjects()
    else { setProjects([]); setSelectedId(null) }
  }, [session?.user?.id])
  useEffect(() => {
    if (selectedId && session?.user) void loadProjectData(selectedId)
    else { setComments([]); setTasks([]); setMembers([]) }
  }, [selectedId, session?.user?.id])

  async function loadProjects() {
    if (!supabase || !session?.user) return
    const { data, error } = await supabase.from('project_members')
      .select('role, projects(id,name,description,created_at)')
      .eq('user_id', session.user.id)
    if (error) { setNotice(`Could not load projects: ${error.message}`); return }
    const rows = (data ?? []).map((row: any) => ({ ...row.projects, role: row.role })).filter((p: any) => p.id) as Project[]
    rows.sort((a,b) => b.created_at.localeCompare(a.created_at))
    setProjects(rows)
    setSelectedId(current => current && rows.some(p => p.id === current) ? current : rows[0]?.id ?? null)
  }
  async function loadProjectData(projectId: string) {
    if (!supabase) return
    const [c, t, m] = await Promise.all([
      supabase.from('project_comments').select('id,body,created_at,user_id').eq('project_id', projectId).order('created_at', { ascending: true }),
      supabase.from('project_tasks').select('*').eq('project_id', projectId).order('created_at', { ascending: false }),
      supabase.from('project_members').select('user_id,role,joined_at').eq('project_id', projectId).order('joined_at', { ascending: true })
    ])
    if (c.error) setNotice(`Comments: ${c.error.message}`); else setComments(c.data ?? [])
    if (t.error) { if (!t.error.message.toLowerCase().includes('does not exist')) setNotice(`Tasks: ${t.error.message}`) } else setTasks(t.data ?? [])
    if (m.error) setNotice(`Members: ${m.error.message}`); else setMembers(m.data ?? [])
  }
  async function handleAuth(e: FormEvent) {
    e.preventDefault(); if (!supabase) return
    setBusy(true); setAuthMessage('')
    const result = authMode === 'signin' ? await supabase.auth.signInWithPassword({ email, password }) : await supabase.auth.signUp({ email, password })
    if (result.error) setAuthMessage(result.error.message)
    else if (authMode === 'signup' && !result.data.session) setAuthMessage('Account created. Check your email to confirm it, then sign in.')
    setBusy(false)
  }
  async function createProject(e: FormEvent) {
    e.preventDefault(); if (!supabase || !session?.user || !projectName.trim()) return
    setBusy(true); setNotice('')
    const { data, error } = await supabase.rpc('create_project', { project_name: projectName.trim(), project_description: projectDescription.trim() || null })
    if (error) setNotice(error.message)
    else { setProjectName(''); setProjectDescription(''); setShowCreate(false); await loadProjects(); if (data) setSelectedId(data); setTab('overview'); setNotice('Project created.') }
    setBusy(false)
  }
  async function addComment(e: FormEvent) {
    e.preventDefault(); if (!supabase || !session?.user || !selected || !commentText.trim()) return
    setBusy(true)
    const { error } = await supabase.from('project_comments').insert({ project_id: selected.id, user_id: session.user.id, body: commentText.trim() })
    if (error) setNotice(error.message); else { setCommentText(''); await loadProjectData(selected.id) }
    setBusy(false)
  }
  async function createTask(e: FormEvent) {
    e.preventDefault(); if (!supabase || !session?.user || !selected || !taskTitle.trim()) return
    setBusy(true)
    const { error } = await supabase.from('project_tasks').insert({
      project_id: selected.id, title: taskTitle.trim(), description: taskDescription.trim() || null,
      status: taskStatus, priority: taskPriority, start_date: taskStart || null, due_date: taskDue || null, created_by: session.user.id
    })
    if (error) setNotice(`Could not create task. Run the new SQL migration first. Details: ${error.message}`)
    else { setTaskTitle(''); setTaskDescription(''); setTaskStart(''); setTaskDue(''); setShowTask(false); await loadProjectData(selected.id); setNotice('Task created.') }
    setBusy(false)
  }
  async function updateTask(task: Task, patch: Partial<Task>) {
    if (!supabase || !selected || !canEdit(selected.role)) return
    const { error } = await supabase.from('project_tasks').update(patch).eq('id', task.id)
    if (error) setNotice(error.message); else await loadProjectData(selected.id)
  }
  async function deleteTask(task: Task) {
    if (!supabase || !selected || !canEdit(selected.role) || !confirm(`Delete "${task.title}"?`)) return
    const { error } = await supabase.from('project_tasks').delete().eq('id', task.id)
    if (error) setNotice(error.message); else { await loadProjectData(selected.id); setNotice('Task deleted.') }
  }
  async function inviteMember(e: FormEvent) {
    e.preventDefault(); if (!supabase || !selected || selected.role !== 'owner') return
    setBusy(true)
    const { error } = await supabase.rpc('add_project_member_by_email', { target_project: selected.id, target_email: inviteEmail.trim().toLowerCase(), target_role: inviteRole })
    if (error) setNotice(error.message)
    else { setInviteEmail(''); await loadProjectData(selected.id); setNotice('Existing account added to this project. They can now sign in to access it.') }
    setBusy(false)
  }
  async function changeMemberRole(member: Member, role: Role) {
    if (!supabase || !selected || selected.role !== 'owner' || member.user_id === session.user.id || role === 'owner') return
    const { error } = await supabase.from('project_members').update({ role }).eq('project_id', selected.id).eq('user_id', member.user_id)
    if (error) setNotice(error.message); else { await loadProjectData(selected.id); setNotice('Member role updated.') }
  }
  async function removeMember(member: Member) {
    if (!supabase || !selected || selected.role !== 'owner' || member.user_id === session.user.id || !confirm('Remove this member from the project?')) return
    const { error } = await supabase.from('project_members').delete().eq('project_id', selected.id).eq('user_id', member.user_id)
    if (error) setNotice(error.message); else { await loadProjectData(selected.id); setNotice('Member removed.') }
  }
  function savePrefs(next: typeof prefs) {
    setPrefs(next)
    try { localStorage.setItem('projecthub-preferences', JSON.stringify(next)) } catch { setNotice('Theme applied for this session, but browser storage is unavailable.') }
  }
  async function signOut() { if (supabase) await supabase.auth.signOut() }

  if (!isConfigured || !supabase) return <SetupScreen />
  if (loading) return <div className="loading-screen"><LoaderCircle className="spin" size={28}/><span>Opening your workspace…</span></div>
  if (!session) return (
    <main className="auth-shell">
      <div className="auth-decoration"><div className="glow glow-a"/><div className="glow glow-b"/><div className="auth-brand"><div className="brand-mark"><Command size={21}/></div><span>project<span className="accent">hub</span></span></div><div className="auth-pitch"><span className="eyebrow">ONE SPACE. EVERY PROJECT.</span><h1>Good work happens<br/><span>together.</span></h1><p>A calmer workspace for your team's projects, conversations, and ideas.</p><div className="feature-pills"><span><ShieldCheck size={14}/> Permission-aware</span><span><Users size={14}/> Made for teams</span></div></div><div className="auth-foot">YOUR TEAM'S WORKSPACE, REIMAGINED</div></div>
      <section className="auth-panel"><div className="mobile-brand"><div className="brand-mark"><Command size={20}/></div><b>project<span className="accent">hub</span></b></div><div className="auth-card"><span className="eyebrow">{authMode === 'signin' ? 'WELCOME BACK' : 'GET STARTED'}</span><h2>{authMode === 'signin' ? 'Sign in to your workspace' : 'Create your account'}</h2><p className="muted">{authMode === 'signin' ? 'Pick up where your team left off.' : 'Set up your account to create your first project.'}</p><form onSubmit={handleAuth} className="form-stack"><label>Email address<input type="email" autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@company.com" required/></label><label>Password<input type="password" autoComplete={authMode === 'signin' ? 'current-password' : 'new-password'} value={password} onChange={e=>setPassword(e.target.value)} placeholder="At least 6 characters" minLength={6} required/></label><button className="primary full" disabled={busy}>{busy ? 'Please wait…' : authMode === 'signin' ? 'Sign in' : 'Create account'} <span>→</span></button></form>{authMessage && <p className="notice">{authMessage}</p>}<p className="switch-auth">{authMode === 'signin' ? 'New to ProjectHub?' : 'Already have an account?'} <button className="text-button" onClick={()=>{setAuthMode(authMode === 'signin' ? 'signup' : 'signin');setAuthMessage('')}}>{authMode === 'signin' ? 'Create an account' : 'Sign in'}</button></p><div className="secure-note"><LockKeyhole size={14}/> Your projects are private by default.</div></div></section>
    </main>
  )

  return <div className={`app-shell ${prefs.mode === 'light' ? 'light-mode' : ''}`} style={themeStyle}>
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark"><Command size={19}/></div><span>project<span className="accent">hub</span></span><button className="icon-button collapse" title="Workspace menu"><ChevronDown size={15}/></button></div>
      <button className="workspace-switch"><div className="workspace-avatar">{(session.user.email ?? 'U').slice(0,1).toUpperCase()}</div><div><b>{profileName || session.user.email?.split('@')[0] || 'My workspace'}</b><small>Free workspace</small></div><ChevronDown size={15}/></button>
      <div className="nav-label">WORKSPACE</div>
      <button className={`nav-item ${tab==='overview'?'active':''}`} onClick={()=>setTab('overview')}><LayoutDashboard size={17}/> Overview</button>
      <button className={`nav-item ${tab==='tasks'?'active':''}`} onClick={()=>setTab('tasks')}><ListTodo size={17}/> Tasks <span className="nav-count">{tasks.filter(t=>t.status!=='done').length}</span></button>
      <button className={`nav-item ${tab==='gantt'?'active':''}`} onClick={()=>setTab('gantt')}><GanttChartSquare size={17}/> Gantt chart</button>
      <button className={`nav-item ${tab==='team'?'active':''}`} onClick={()=>setTab('team')}><Users size={17}/> Team & access</button>
      <button className={`nav-item ${tab==='discussion'?'active':''}`} onClick={()=>setTab('discussion')}><MessageCircle size={17}/> Discussion <span className="nav-count">{comments.length}</span></button>
      <button className={`nav-item ${tab==='settings'?'active':''}`} onClick={()=>setTab('settings')}><Settings2 size={17}/> Personalise</button>
      <div className="project-list-head"><span className="nav-label">YOUR PROJECTS</span><button className="icon-button small" onClick={()=>setShowCreate(true)} title="Create project"><Plus size={16}/></button></div>
      <div className="sidebar-projects">{filteredProjects.slice(0,10).map((p,i)=><button key={p.id} className={`project-nav ${selectedId===p.id?'chosen':''}`} onClick={()=>{setSelectedId(p.id);setTab('overview')}}><span className={`project-dot ${colors[i%colors.length]}`}/><span className="truncate">{p.name}</span></button>)}{filteredProjects.length===0&&<p className="sidebar-empty">No matching projects.</p>}</div>
      <div className="sidebar-bottom"><div className="help-card"><div className="help-icon"><CircleHelp size={17}/></div><b>ProjectHub workspace</b><p>Plan work, coordinate people, and keep updates together.</p></div><div className="profile"><div className="profile-avatar">{(session.user.email ?? 'U').slice(0,1).toUpperCase()}</div><div className="profile-meta"><b>{profileName || session.user.email}</b><small>Signed in</small></div><button className="icon-button" title="Sign out" onClick={signOut}><LogOut size={16}/></button></div></div>
    </aside>
    <main className="main-panel">
      <header className="topbar"><div className="breadcrumbs"><span>Workspace</span><span className="crumb-slash">/</span><b>{selected?.name ?? 'Overview'}</b></div><div className="top-actions"><div className="searchbox"><Search size={16}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search projects…"/><kbd>Ctrl K</kbd></div><div className="top-avatar">{(session.user.email ?? 'U').slice(0,1).toUpperCase()}</div></div></header>
      <div className="page-content">
        {notice && <div className="notice-banner"><span>{notice}</span><button className="icon-button" onClick={()=>setNotice('')}><X size={15}/></button></div>}
        {!selected ? <section className="welcome-block"><div className="welcome-icon"><FolderKanban size={24}/></div><span className="eyebrow">YOUR WORKSPACE</span><h1>Make room for <span>great work.</span></h1><p>Create a project to bring your team, updates, and ideas into one focused space.</p><button className="primary" onClick={()=>setShowCreate(true)}><Plus size={17}/> Create your first project</button><div className="empty-note"><LockKeyhole size={15}/> Projects are private until you add teammates.</div></section> :
        <>
          <div className="page-heading"><div><div className="eyebrow"><span className="live-dot"/> PROJECT WORKSPACE</div><h1>{selected.name}</h1><p>{selected.description || 'A shared space for your team to plan, discuss, and get things done.'}</p></div><div className="heading-actions"><span className={`role-badge ${selected.role==='owner'?'role-owner':''}`}><ShieldCheck size={13}/> {roleLabels[selected.role ?? 'viewer']}</span>{canEdit(selected.role)&&<button className="primary" onClick={()=>setShowTask(true)}><Plus size={16}/> New task</button>}</div></div>
          {tab==='overview' && <>
            <div className="stats-grid">
              <Stat icon={<ListTodo size={17}/>} label="OPEN TASKS" value={tasks.filter(t=>t.status!=='done').length.toString()} foot={`${tasks.filter(t=>t.status==='done').length} completed`} tone="purple"/>
              <Stat icon={<MessageCircle size={17}/>} label="DISCUSSION" value={comments.length.toString()} foot="Comments in this project" tone="blue"/>
              <Stat icon={<Users size={17}/>} label="TEAM MEMBERS" value={members.length.toString()} foot="People with project access" tone="green"/>
            </div>
            <div className="content-grid">
              <section className="panel">
                <div className="panel-heading"><div><h2>Task progress</h2><p>Track work across the project.</p></div><button className="text-button" onClick={()=>setTab('tasks')}>View tasks →</button></div>
                <div className="overview-progress">{(['todo','in_progress','done'] as TaskStatus[]).map(s=><div className="progress-row" key={s}><span>{statusLabel(s)}</span><div className="progress-track"><div className={`progress-fill ${s}`} style={{width:`${tasks.length ? tasks.filter(t=>t.status===s).length/tasks.length*100 : 0}%`}}/></div><b>{tasks.filter(t=>t.status===s).length}</b></div>)}</div>
                <div className="panel-heading"><div><h2>Upcoming tasks</h2><p>Nearest deadlines first.</p></div><CalendarDays size={18}/></div>
                <div className="task-list">{tasks.filter(t=>t.status!=='done').sort((a,b)=>(a.due_date??'9999').localeCompare(b.due_date??'9999')).slice(0,5).map(t=><TaskRow key={t.id} task={t} canEdit={canEdit(selected.role)} onStatus={s=>updateTask(t,{status:s})} onDelete={()=>deleteTask(t)}/>)}{tasks.filter(t=>t.status!=='done').length===0&&<Empty icon={<CircleCheck/>} title="No open tasks" body="Create a task to start planning this project."/>}</div>
              </section>
              <aside className="right-column"><section className="panel details-panel"><div className="panel-heading"><div><h2>Project details</h2><p>Workspace summary.</p></div><FolderKanban size={17}/></div><div className="detail-row"><span>Project name</span><b>{selected.name}</b></div><div className="detail-row"><span>Description</span><p>{selected.description || 'No description added yet.'}</p></div><div className="detail-row"><span>Your role</span><b className="access-label"><LockKeyhole size={13}/>{roleLabels[selected.role ?? 'viewer']}</b></div><div className="detail-row"><span>Created</span><b>{new Date(selected.created_at).toLocaleDateString()}</b></div></section><section className="permissions-card"><div className="permission-symbol"><ShieldCheck size={19}/></div><div><b>Role-based access</b><p>Database policies protect project data according to each member's role.</p><button className="text-button" onClick={()=>setTab('team')}>Manage team →</button></div></section></aside>
            </div>
            <Analytics tasks={tasks}/>
          </>}
          {tab==='tasks' && <section className="panel"><div className="panel-heading"><div><h2>Tasks</h2><p>Create and track the work needed to complete this project.</p></div><div className="inline-actions"><select value={taskFilter} onChange={e=>setTaskFilter(e.target.value as any)}><option value="all">All statuses</option><option value="todo">To do</option><option value="in_progress">In progress</option><option value="done">Done</option></select>{canEdit(selected.role)&&<button className="primary compact" onClick={()=>setShowTask(true)}><Plus size={15}/> Add task</button>}</div></div><div className="kanban">{(['todo','in_progress','done'] as TaskStatus[]).map(status=><div className="kanban-column" key={status}><div className="kanban-title"><span className={`status-dot ${status}`}/><b>{statusLabel(status)}</b><span className="count-pill">{tasks.filter(t=>t.status===status && (taskFilter==='all'||taskFilter===status)).length}</span></div>{tasks.filter(t=>t.status===status && (taskFilter==='all'||taskFilter===status)).map(t=><article className="task-card" key={t.id}><div className="task-card-top"><span className={`priority ${t.priority}`}>{t.priority}</span>{canEdit(selected.role)&&<button className="icon-button small" title="Delete task" onClick={()=>deleteTask(t)}><Trash2 size={14}/></button>}</div><b>{t.title}</b>{t.description&&<p>{t.description}</p>}<div className="task-card-foot">{t.due_date&&<span><CalendarDays size={13}/>{t.due_date}</span>}<select aria-label="Task status" disabled={!canEdit(selected.role)} value={t.status} onChange={e=>updateTask(t,{status:e.target.value as TaskStatus})}><option value="todo">To do</option><option value="in_progress">In progress</option><option value="done">Done</option></select></div></article>)}{canEdit(selected.role)&&<button className="add-task-ghost" onClick={()=>{setTaskStatus(status);setShowTask(true)}}><Plus size={14}/> Add task</button>}</div>)}</div></section>}
          {tab==='gantt' && <Gantt tasks={tasks} canEdit={canEdit(selected.role)} onStatus={updateTask}/>}
          {tab==='team' && <section className="panel"><div className="panel-heading"><div><h2>Team & access</h2><p>Manage people and permissions for this project.</p></div><span className="count-pill">{members.length} members</span></div>{selected.role==='owner'&&<form className="invite-form" onSubmit={inviteMember}><div className="form-grid"><label>Existing user's email<input type="email" value={inviteEmail} onChange={e=>setInviteEmail(e.target.value)} placeholder="teammate@example.com" required/></label><label>Project role<select value={inviteRole} onChange={e=>setInviteRole(e.target.value as Role)}><option value="editor">Editor</option><option value="commenter">Commenter</option><option value="viewer">Viewer</option></select></label></div><p className="muted tiny">This adds an account that has already registered in this Supabase project. Email invitations to new accounts need a server-side email invitation function.</p><button className="primary compact" disabled={busy}><UserPlus size={15}/>{busy?'Adding…':'Add existing user'}</button></form>}{members.map(m=><div className="member-row" key={m.user_id}><div className="member-avatar">{m.user_id===session.user.id?(session.user.email??'U').slice(0,1).toUpperCase():'U'}</div><div className="member-info"><b>{m.user_id===session.user.id?'You':`Member ${m.user_id.slice(0,8)}`}</b><small>{m.user_id===session.user.id?session.user.email:m.user_id}</small></div>{m.user_id===session.user.id?<span className="role-badge role-owner">{roleLabels[m.role]}</span>:selected.role==='owner'?<><select aria-label="Member role" value={m.role} disabled={m.role==='owner'} onChange={e=>changeMemberRole(m,e.target.value as Role)}><option value="editor">Editor</option><option value="commenter">Commenter</option><option value="viewer">Viewer</option><option value="owner" disabled>Owner</option></select><button className="icon-button" title="Remove member" onClick={()=>removeMember(m)}><Trash2 size={15}/></button></>:<span className="role-badge">{roleLabels[m.role]}</span>}</div>)}{members.length===0&&<Empty icon={<Users/>} title="No team members yet" body="Project members will appear here."/>}</section>}
          {tab==='discussion' && <section className="panel discussion-panel"><div className="panel-heading"><div><h2>Project discussion</h2><p>Share updates and keep everyone in the loop.</p></div><span className="count-pill">{comments.length}</span></div><div className="discussion-list">{comments.length===0?<Empty icon={<MessageCircle/>} title="Start the conversation" body="Share a thought, ask a question, or post an update."/>:comments.map(c=><article className="comment" key={c.id}><div className="comment-avatar">{c.user_id===session.user.id?(session.user.email??'U').slice(0,1).toUpperCase():'M'}</div><div className="comment-body"><div className="comment-meta"><b>{c.user_id===session.user.id?'You':`Member ${c.user_id.slice(0,8)}`}</b><time>{new Date(c.created_at).toLocaleString()}</time></div><p>{c.body}</p></div></article>)}</div>{canComment(selected.role)?<form className="comment-form" onSubmit={addComment}><div className="comment-avatar self">{(session.user.email??'U').slice(0,1).toUpperCase()}</div><div className="comment-compose"><textarea value={commentText} onChange={e=>setCommentText(e.target.value)} placeholder="Write a comment…" rows={2}/><div className="compose-footer"><span>Be kind. Keep it constructive.</span><button className="primary compact" disabled={busy||!commentText.trim()}>Post comment <ArrowLeft size={14} className="send-icon"/></button></div></div></form>:<div className="viewer-note"><Eye size={15}/> You have view-only access.</div>}</section>}
          {tab==='settings' && <Personalise prefs={prefs} save={savePrefs} profileName={profileName} setProfileName={setProfileName} email={session.user.email ?? ''}/>}
        </>
        }
        <div className="page-footer"><span>© 2026 ProjectHub</span><span><LockKeyhole size={12}/> Built for focused collaboration</span></div>
      </div>
    </main>
    {showCreate&&<div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setShowCreate(false)}}><section className="modal"><div className="modal-head"><div><span className="eyebrow">NEW WORKSPACE</span><h2>Create a project</h2><p>Give your team a dedicated place to work together.</p></div><button className="icon-button" onClick={()=>setShowCreate(false)}><X size={18}/></button></div><form onSubmit={createProject} className="form-stack"><label>Project name<input autoFocus value={projectName} onChange={e=>setProjectName(e.target.value)} placeholder="e.g. Website redesign" maxLength={80} required/></label><label>Description <span className="optional">(optional)</span><textarea value={projectDescription} onChange={e=>setProjectDescription(e.target.value)} placeholder="What is this project about?" rows={3} maxLength={500}/></label><div className="modal-note"><LockKeyhole size={15}/> Your new project starts private.</div><div className="modal-actions"><button type="button" className="outline-button" onClick={()=>setShowCreate(false)}>Cancel</button><button className="primary" disabled={busy||!projectName.trim()}><Plus size={16}/>{busy?'Creating…':'Create project'}</button></div></form></section></div>}
    {showTask&&selected&&<div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setShowTask(false)}}><section className="modal"><div className="modal-head"><div><span className="eyebrow">PROJECT TASK</span><h2>Create a task</h2><p>Add a clear action and optional dates to the project timeline.</p></div><button className="icon-button" onClick={()=>setShowTask(false)}><X size={18}/></button></div><form onSubmit={createTask} className="form-stack"><label>Task title<input autoFocus value={taskTitle} onChange={e=>setTaskTitle(e.target.value)} placeholder="e.g. Prepare homepage wireframes" maxLength={160} required/></label><label>Description<textarea value={taskDescription} onChange={e=>setTaskDescription(e.target.value)} rows={2} placeholder="What needs to be done?"/></label><div className="form-grid"><label>Status<select value={taskStatus} onChange={e=>setTaskStatus(e.target.value as TaskStatus)}><option value="todo">To do</option><option value="in_progress">In progress</option><option value="done">Done</option></select></label><label>Priority<select value={taskPriority} onChange={e=>setTaskPriority(e.target.value)}><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option></select></label><label>Start date<input type="date" value={taskStart} onChange={e=>setTaskStart(e.target.value)}/></label><label>Due date<input type="date" value={taskDue} min={taskStart || undefined} onChange={e=>setTaskDue(e.target.value)}/></label></div><div className="modal-actions"><button type="button" className="outline-button" onClick={()=>setShowTask(false)}>Cancel</button><button className="primary" disabled={busy||!taskTitle.trim()}><Plus size={16}/>{busy?'Saving…':'Create task'}</button></div></form></section></div>}
  </div>
}

function statusLabel(status: TaskStatus) { return status === 'todo' ? 'To do' : status === 'in_progress' ? 'In progress' : 'Done' }
function Stat({ icon, label, value, foot, tone }: { icon: any; label: string; value: string; foot: string; tone: string }) {
  return <div className="stat-card"><div className="stat-top"><span>{label}</span><div className={`stat-icon ${tone}`}>{icon}</div></div><div className="stat-value">{value}</div><div className="stat-foot">{foot}</div></div>
}
function Empty({ icon, title, body }: { icon: any; title: string; body: string }) {
  return <div className="empty-discussion"><div className="empty-bubble">{icon}</div><b>{title}</b><p>{body}</p></div>
}
function TaskRow({ task, canEdit, onStatus, onDelete }: { task: Task; canEdit: boolean; onStatus: (s: TaskStatus)=>void; onDelete: ()=>void }) {
  return <div className="task-row"><span className={`status-dot ${task.status}`}/><div className="task-row-main"><b>{task.title}</b><small>{task.due_date ? `Due ${task.due_date}` : 'No due date'} · <span className={`priority ${task.priority}`}>{task.priority}</span></small></div><select disabled={!canEdit} value={task.status} onChange={e=>onStatus(e.target.value as TaskStatus)}><option value="todo">To do</option><option value="in_progress">In progress</option><option value="done">Done</option></select>{canEdit&&<button className="icon-button small" title="Delete task" onClick={onDelete}><Trash2 size={14}/></button>}</div>
}
function parseLocalDate(value: string | null): Date | null {
  if (!value) return null
  const parts = value.split('-').map(Number)
  if (parts.length !== 3 || parts.some(n => !Number.isFinite(n))) return null
  return new Date(parts[0], parts[1] - 1, parts[2])
}
function dateKey(date: Date) {
  const y = date.getFullYear(), m = String(date.getMonth() + 1).padStart(2, '0'), d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}
function addDays(date: Date, days: number) { const d = new Date(date); d.setDate(d.getDate() + days); return d }
function Gantt({ tasks, canEdit, onStatus }: { tasks: Task[]; canEdit: boolean; onStatus: (t: Task, p: Partial<Task>)=>void }) {
  const [rangeDays, setRangeDays] = useState(30)
  const [shift, setShift] = useState(0)
  const datedValues = tasks.flatMap(t => [parseLocalDate(t.start_date), parseLocalDate(t.due_date)]).filter((d): d is Date => Boolean(d))
  const today = new Date(); today.setHours(0,0,0,0)
  const earliest = datedValues.length ? new Date(Math.min(...datedValues.map(d=>d.getTime()))) : today
  const anchor = earliest < today ? earliest : today
  const rangeStart = addDays(anchor, shift * rangeDays)
  const rangeEnd = addDays(rangeStart, rangeDays - 1)
  const dayOffset = (d: Date) => Math.round((d.getTime() - rangeStart.getTime()) / 86400000)
  const ticks: { date: Date; label: string; sub: string }[] = []
  if (rangeDays <= 30) {
    for (let i=0; i<rangeDays; i++) { const d=addDays(rangeStart,i); ticks.push({date:d,label:String(d.getDate()),sub:d.toLocaleDateString(undefined,{month:'short'})}) }
  } else if (rangeDays <= 183) {
    for (let i=0; i<rangeDays; i+=7) { const d=addDays(rangeStart,i); ticks.push({date:d,label:d.toLocaleDateString(undefined,{day:'numeric',month:'short'}),sub:'Week'}) }
  } else {
    const d = new Date(rangeStart.getFullYear(), rangeStart.getMonth(), 1)
    while (d <= rangeEnd) { const clipped = d < rangeStart ? rangeStart : d; ticks.push({date:clipped,label:clipped.toLocaleDateString(undefined,{month:'short'}),sub:String(clipped.getFullYear())}); d.setMonth(d.getMonth()+1) }
  }
  const tickCount = Math.max(1, ticks.length)
  const visibleTasks = tasks
  return <section className="panel gantt-panel">
    <div className="panel-heading gantt-heading"><div><h2>Gantt timeline</h2><p>Choose a planning window, then scroll horizontally to inspect the schedule. Task bars use their actual start and due dates.</p></div><GanttChartSquare size={19}/></div>
    <div className="gantt-toolbar"><div className="gantt-range-buttons" role="group" aria-label="Timeline preview range">{[{label:'1 week',days:7},{label:'1 month',days:30},{label:'6 months',days:183},{label:'1 year',days:365}].map(r=><button key={r.days} className={`outline-button ${rangeDays===r.days?'selected-range':''}`} onClick={()=>{setRangeDays(r.days);setShift(0)}}>{r.label}</button>)}</div><div className="gantt-nav"><button className="outline-button" onClick={()=>setShift(v=>v-1)} aria-label="Previous timeline window">← Previous</button><button className="outline-button" onClick={()=>setShift(0)}>Reset window</button><button className="outline-button" onClick={()=>setShift(v=>v+1)}>Next →</button></div></div>
    <div className="gantt-range-caption">{rangeStart.toLocaleDateString(undefined,{day:'numeric',month:'short',year:'numeric'})} – {rangeEnd.toLocaleDateString(undefined,{day:'numeric',month:'short',year:'numeric'})} · {tasks.length} tasks</div>
    {tasks.length===0 ? <Empty icon={<GanttChartSquare/>} title="Your timeline is empty" body="Create tasks with start and due dates to build your Gantt chart."/> : <div className="gantt-scroll"><div className="gantt-canvas" style={{minWidth:`${Math.max(900, tickCount * (rangeDays<=30 ? 42 : rangeDays<=183 ? 76 : 110))}px`}}>
      <div className="gantt-head"><div className="gantt-task-name gantt-sticky-name">Task / schedule</div><div className="gantt-days">{ticks.map((tick,i)=><div key={`${dateKey(tick.date)}-${i}`} className="gantt-day" style={{left:`${Math.max(0,dayOffset(tick.date)/rangeDays*100)}%`}}><b>{tick.label}</b><small>{tick.sub}</small></div>)}</div></div>
      {visibleTasks.map(t=>{
        const rawStart=parseLocalDate(t.start_date) ?? parseLocalDate(t.due_date)
        const rawEnd=parseLocalDate(t.due_date) ?? rawStart
        let bar: {left:number;width:number}|null=null
        if (rawStart && rawEnd && rawEnd >= rangeStart && rawStart <= rangeEnd) {
          const start=Math.max(0,dayOffset(rawStart)), end=Math.min(rangeDays-1,dayOffset(rawEnd))
          bar={left:start/rangeDays*100,width:Math.max(0.7,(end-start+1)/rangeDays*100)}
        }
        return <div className="gantt-row" key={t.id}><div className="gantt-task-name gantt-sticky-name"><b>{t.title}</b><small>{t.start_date ?? 'Start not set'} → {t.due_date ?? 'Due date not set'}</small></div><div className="gantt-track" style={{backgroundSize:`${100/tickCount}% 100%`}}>{bar&&<div className={`gantt-bar ${t.status}`} title={`${t.title}: ${t.start_date ?? t.due_date ?? 'unscheduled'} → ${t.due_date ?? t.start_date ?? 'unscheduled'}`} style={{left:`${bar.left}%`,width:`${bar.width}%`}}/>}{!bar&&<span className="gantt-outside-label">{rawStart ? (rawStart > rangeEnd ? 'After this window' : 'Before this window') : 'Add dates to schedule'}</span>}</div></div>
      })}
    </div></div>}
    {tasks.length>0&&<div className="gantt-legend"><span><i className="todo-key"/> To do</span><span><i className="progress-key"/> In progress</span><span><i className="done-key"/> Done</span><span className="muted">Bars outside the selected date window are labelled; use Previous / Next to navigate.</span></div>}
  </section>
}
function Analytics({ tasks }: { tasks: Task[] }) {
  const total=tasks.length
  const counts: {key:TaskStatus;label:string;color:string}[]=[{key:'todo',label:'To do',color:'todo'},{key:'in_progress',label:'In progress',color:'in_progress'},{key:'done',label:'Completed',color:'done'}]
  const priorities=['urgent','high','normal','low'].map(priority=>({priority,count:tasks.filter(t=>t.priority===priority).length}))
  const today=new Date(); today.setHours(0,0,0,0)
  const inSeven=addDays(today,7)
  const overdue=tasks.filter(t=>t.status!=='done'&&t.due_date&&parseLocalDate(t.due_date)!==null&&parseLocalDate(t.due_date)! < today).length
  const dueSoon=tasks.filter(t=>t.status!=='done'&&t.due_date&&parseLocalDate(t.due_date)!==null&&parseLocalDate(t.due_date)! >= today&&parseLocalDate(t.due_date)! <= inSeven).length
  const undated=tasks.filter(t=>!t.start_date&&!t.due_date).length
  const completion=total?Math.round(tasks.filter(t=>t.status==='done').length/total*100):0
  return <section className="analytics-section"><div className="analytics-title"><div><span className="eyebrow">PROJECT INTELLIGENCE</span><h2>Tracking & logistics</h2><p>Operational signals to help plan sequencing, capacity and delivery risk.</p></div><span className="analytics-completion">{completion}% complete</span></div>
    <div className="analytics-grid">
      <article className="panel analytics-card"><div className="panel-heading"><div><h2>Work status</h2><p>Distribution of all tasks</p></div></div><div className="analytics-bars">{counts.map(c=>{const n=tasks.filter(t=>t.status===c.key).length;return <div className="analytics-bar-row" key={c.key}><div><span>{c.label}</span><b>{n}</b></div><div className="analytics-track"><div className={`analytics-fill ${c.color}`} style={{width:`${total?n/total*100:0}%`}}/></div></div>})}</div><div className="analytics-foot">{tasks.filter(t=>t.status==='done').length} of {total} tasks completed</div></article>
      <article className="panel analytics-card"><div className="panel-heading"><div><h2>Priority mix</h2><p>Where attention is needed</p></div></div><div className="analytics-bars">{priorities.map(p=><div className="analytics-bar-row" key={p.priority}><div><span className={`priority ${p.priority}`}>{p.priority}</span><b>{p.count}</b></div><div className="analytics-track"><div className={`analytics-fill priority-${p.priority}`} style={{width:`${total?p.count/total*100:0}%`}}/></div></div>)}</div><div className="analytics-foot">{tasks.filter(t=>t.priority==='urgent'||t.priority==='high').length} high / urgent priority tasks</div></article>
      <article className="panel analytics-card delivery-card"><div className="panel-heading"><div><h2>Schedule health</h2><p>Deadlines and planning gaps</p></div></div><div className="health-metrics"><div className="health-metric risk"><span>Overdue</span><b>{overdue}</b><small>Open tasks past due</small></div><div className="health-metric soon"><span>Due in 7 days</span><b>{dueSoon}</b><small>Upcoming deadlines</small></div><div className="health-metric neutral"><span>Unscheduled</span><b>{undated}</b><small>Tasks missing both dates</small></div></div><div className="analytics-foot">Add start and due dates to improve timeline accuracy.</div></article>
    </div>
  </section>
}
function Personalise({ prefs, save, profileName, setProfileName, email }: { prefs: typeof initialPrefs; save: (p: typeof initialPrefs)=>void; profileName: string; setProfileName: (s:string)=>void; email: string }) {
  const [draft, setDraft] = useState(prefs)
  useEffect(()=>setDraft(prefs),[prefs])
  const update = (key: keyof typeof initialPrefs, value: string) => setDraft(current=>({ ...current, [key]: value }))
  const reset = () => { setDraft(initialPrefs); save(initialPrefs); setProfileName('') }
  return <section className="panel settings-panel"><div className="panel-heading"><div><h2>Personalise your workspace</h2><p>Choose your colours and theme, preview them, then apply your changes.</p></div><Palette size={19}/></div><div className="settings-body"><h3>Profile</h3><div className="form-grid"><label>Display name<input value={profileName} onChange={e=>setProfileName(e.target.value)} placeholder={email.split('@')[0]} /></label><label>Email address<input value={email} readOnly /></label></div><h3>Appearance</h3><div className="settings-controls"><label>Background colour<input type="color" value={draft.bg} onChange={e=>update('bg',e.target.value)}/></label><label>Panel colour<input type="color" value={draft.panel} onChange={e=>update('panel',e.target.value)}/></label><label>Text colour<input type="color" value={draft.text} onChange={e=>update('text',e.target.value)}/></label><label>Accent colour<input type="color" value={draft.accent} onChange={e=>update('accent',e.target.value)}/></label><label>Text size<select value={draft.fontSize} onChange={e=>update('fontSize',e.target.value)}><option value="12">Small</option><option value="14">Default</option><option value="16">Large</option><option value="18">Extra large</option></select></label><label>Theme<select value={draft.mode} onChange={e=>update('mode',e.target.value)}><option value="dark">Dark</option><option value="light">Light</option></select></label></div><div className="preview-card" style={{background:draft.bg,color:draft.text,borderColor:draft.accent}}><div className="preview-heading"><span className="preview-dot" style={{background:draft.accent}}/> Live preview · not applied yet</div><div className="preview-surface" style={{background:draft.panel}}><b style={{color:draft.text}}>Your workspace, your style</b><p style={{color:draft.text}}>This is how panels and text will look.</p><button className="primary" style={{background:draft.accent,borderColor:draft.accent}}>Accent button</button></div></div><div className="settings-actions"><button className="outline-button" onClick={reset}><RefreshCw size={14}/> Reset appearance</button><button className="primary" onClick={()=>save(draft)}><Check size={15}/> Apply theme</button></div><p className="settings-save-note">Your theme is saved in this browser and will be restored when you return on this device.</p></div></section>
}
function SetupScreen() {
  return <main className="setup-shell"><div className="setup-card"><div className="brand-mark"><Command size={21}/></div><span className="eyebrow">ALMOST THERE</span><h1>Connect your workspace</h1><p>ProjectHub is ready to run. Add your free Supabase project credentials to connect sign-in, projects, and secure team data.</p><ol><li>Create a project at <a href="https://supabase.com" target="_blank" rel="noreferrer">supabase.com</a>.</li><li>Run the SQL in <code>supabase/schema.sql</code> using the Supabase SQL Editor.</li><li>Copy <code>.env.example</code> to <code>.env.local</code> and fill in your Project URL and publishable/anon key.</li><li>Run <code>npm install</code> and <code>npm run dev</code>.</li></ol><div className="setup-warning"><LockKeyhole size={16}/> Never put your Supabase service-role key in frontend code.</div><p className="muted tiny">After configuring the environment, refresh this page.</p></div></main>
}
