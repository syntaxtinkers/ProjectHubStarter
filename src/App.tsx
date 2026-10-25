import { useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent, CSSProperties } from 'react'
import {
  Activity, ArrowLeft, CalendarDays, Check, ChevronDown, CircleHelp, Command, FolderKanban,
  LayoutDashboard, LogOut, MessageCircle, Plus, Search, Settings2, ShieldCheck, Users, X,
  LockKeyhole, Eye, Pencil, LoaderCircle, ListTodo, GanttChartSquare, Palette, Trash2,
  CircleCheck, Clock3, AlertCircle, RefreshCw, UserPlus, SlidersHorizontal, Filter, FileDown, ChevronUp
} from 'lucide-react'
import { isConfigured, supabase } from './lib/supabase'
import CalendarView from './CalendarView'
import { exportProjectExcel } from './exportProjectExcel'
import { exportProjectPdf } from './exportProjectPdf'

type Project = { id: string; name: string; description: string | null; created_at: string; role?: Role }
type Comment = { id: string; body: string; created_at: string; user_id: string }
type Role = 'owner' | 'editor' | 'commenter' | 'viewer'
type TaskStatus = 'todo' | 'in_progress' | 'done'
type Stage = { id: string; project_id: string; name: string; description: string | null; start_date: string | null; end_date: string | null; sort_order?: number; created_by: string; created_at: string }
type Task = { id: string; project_id: string; stage_id: string; title: string; description: string | null; status: TaskStatus; priority: string; start_date: string | null; due_date: string | null; sort_order?: number; assigned_to: string | null; assigned_by_name?: string | null; assigned_to_name?: string | null; custom_fields?: Record<string, string> | null; created_by: string; created_at: string }
type TaskCustomField = { id: string; project_id: string; name: string; sort_order: number; created_by: string; created_at: string }
type Member = { user_id: string; role: Role; joined_at: string; email?: string }
type Tab = 'overview' | 'stages' | 'stage_detail' | 'calendar' | 'team' | 'discussion' | 'settings'

const roleLabels: Record<Role, string> = { owner: 'Owner / Main editor', editor: 'Editor', commenter: 'Commenter', viewer: 'Viewer' }
const colors = ['violet', 'blue', 'mint', 'orange']
const canEdit = (r?: Role) => r === 'owner' || r === 'editor'
const canComment = (r?: Role) => r === 'owner' || r === 'editor' || r === 'commenter'
const initialPrefs = { bg: '#0b1020', panel: '#11182b', text: '#e9edf7', accent: '#9a8cff', fontSize: '14', mode: 'dark' }

export default function App() {
  const [session, setSession] = useState<any>(null)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [loading, setLoading] = useState(true)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin')
  const [authMessage, setAuthMessage] = useState('')
  const [projects, setProjects] = useState<Project[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [comments, setComments] = useState<Comment[]>([])
  const [stages, setStages] = useState<Stage[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [taskFields, setTaskFields] = useState<TaskCustomField[]>([])
  const [stageComments, setStageComments] = useState<Comment[]>([])
  const [taskComments, setTaskComments] = useState<Comment[]>([])
  const [stageCommentText, setStageCommentText] = useState('')
  const [taskCommentText, setTaskCommentText] = useState('')
  const [members, setMembers] = useState<Member[]>([])
  const [commentText, setCommentText] = useState('')
  const [search, setSearch] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [showTask, setShowTask] = useState(false)
  const [showStage, setShowStage] = useState(false)
  const [showProjectEdit, setShowProjectEdit] = useState(false)
  const [editingStage, setEditingStage] = useState<Stage | null>(null)
  const [editingTask, setEditingTask] = useState<Task | null>(null)
  const [selectedStageId, setSelectedStageId] = useState<string | null>(null)
  const [taskStageId, setTaskStageId] = useState<string | null>(null)
  const [stageName, setStageName] = useState('')
  const [stageDescription, setStageDescription] = useState('')
  const [stageStart, setStageStart] = useState('')
  const [stageEnd, setStageEnd] = useState('')
  const [calendarMonth, setCalendarMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1))
  const [editProjectName, setEditProjectName] = useState('')
  const [editProjectDescription, setEditProjectDescription] = useState('')
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
  const [tab, setTab] = useState<Tab>('stages')
  const [taskFilter, setTaskFilter] = useState<'all' | TaskStatus>('all')
  const [prefs, setPrefs] = useState(initialPrefs)
  const [profileName, setProfileName] = useState('')

  const selected = projects.find(p => p.id === selectedId) ?? null
  const selectedStage = stages.find(s => s.id === selectedStageId) ?? null
  const selectedStageTasks = tasks.filter(t => t.stage_id === selectedStageId)
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
    else { setProjects([]); setStages([]); setTasks([]); setTaskFields([]); setSelectedStageId(null); setSelectedId(null) }
  }, [session?.user?.id])
  useEffect(() => {
    if (selectedId && session?.user) void loadProjectData(selectedId)
    else { setComments([]); setStages([]); setTasks([]); setMembers([]); setSelectedStageId(null); setStageComments([]); setTaskComments([]) }
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
    const [c, t, m, s, f] = await Promise.all([
      supabase.from('project_comments').select('id,body,created_at,user_id').eq('project_id', projectId).order('created_at', { ascending: true }),
      supabase.from('project_tasks').select('*').eq('project_id', projectId).order('sort_order', { ascending: true }).order('created_at', { ascending: true }),
      supabase.from('project_members').select('user_id,role,joined_at').eq('project_id', projectId).order('joined_at', { ascending: true }),
      supabase.from('project_stages').select('*').eq('project_id', projectId).order('sort_order', { ascending: true }).order('created_at', { ascending: true }),
      supabase.from('project_task_custom_fields').select('*').eq('project_id', projectId).order('sort_order', { ascending: true }).order('created_at', { ascending: true })
    ])
    if (c.error) setNotice(`Comments: ${c.error.message}`); else setComments(c.data ?? [])
    if (t.error) { if (!t.error.message.toLowerCase().includes('does not exist')) setNotice(`Tasks: ${t.error.message}`) } else setTasks(t.data ?? [])
    if (m.error) setNotice(`Members: ${m.error.message}`); else setMembers(m.data ?? [])
    if (s.error) setNotice(`Stages could not load. Apply supabase/rebuild_stages.sql first: ${s.error.message}`)
    else { const rows = (s.data ?? []) as Stage[]; setStages(rows); setSelectedStageId(current => current && rows.some(stage => stage.id === current) ? current : rows[0]?.id ?? null) }
    if (f.error) { if (!f.error.message.toLowerCase().includes('does not exist')) setNotice('Custom task columns could not load: ' + f.error.message); setTaskFields([]) }
    else setTaskFields((f.data ?? []) as TaskCustomField[])
  }
  async function loadStageComments(stageId: string) {
    if (!supabase) return
    const { data, error } = await supabase.from('stage_comments').select('id,body,created_at,user_id').eq('stage_id', stageId).order('created_at', { ascending: true })
    if (error) setNotice(`Stage comments: ${error.message}`); else setStageComments(data ?? [])
  }
  async function loadTaskComments(taskId: string) {
    if (!supabase) return
    const { data, error } = await supabase.from('task_comments').select('id,body,created_at,user_id').eq('task_id', taskId).order('created_at', { ascending: true })
    if (error) setNotice(`Task comments: ${error.message}`); else setTaskComments(data ?? [])
  }
  useEffect(() => { if (selectedStageId && selectedId) void loadStageComments(selectedStageId); else setStageComments([]) }, [selectedStageId, selectedId])
  useEffect(() => { if (showTask && editingTask?.id) void loadTaskComments(editingTask.id); else setTaskComments([]) }, [showTask, editingTask?.id])
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
    else { setProjectName(''); setProjectDescription(''); setShowCreate(false); await loadProjects(); if (data) setSelectedId(data); setTab('stages'); setNotice('Project created.') }
    setBusy(false)
  }
  async function addComment(e: FormEvent) {
    e.preventDefault(); if (!supabase || !session?.user || !selected || !commentText.trim()) return
    setBusy(true)
    const { error } = await supabase.from('project_comments').insert({ project_id: selected.id, user_id: session.user.id, body: commentText.trim() })
    if (error) setNotice(error.message); else { setCommentText(''); await loadProjectData(selected.id) }
    setBusy(false)
  }
  function openNewStage() { setEditingStage(null); setStageName(''); setStageDescription(''); setStageStart(''); setStageEnd(''); setShowStage(true) }
  function openEditStage(stage: Stage) { setEditingStage(stage); setStageName(stage.name); setStageDescription(stage.description ?? ''); setStageStart(stage.start_date ?? ''); setStageEnd(stage.end_date ?? ''); setShowStage(true) }
  async function saveStage(e: FormEvent) {
    e.preventDefault(); if (!supabase || !selected || !session?.user || !canEdit(selected.role) || !stageName.trim()) return
    setBusy(true); setNotice('')
    if (stageStart && stageEnd && stageEnd < stageStart) { setNotice('Stage end date cannot be earlier than its start date.'); setBusy(false); return }
    if (editingStage) {
      const outside = tasks.filter(task => task.stage_id === editingStage.id && ((stageStart && ((task.start_date && task.start_date < stageStart) || (task.due_date && task.due_date < stageStart))) || (stageEnd && ((task.start_date && task.start_date > stageEnd) || (task.due_date && task.due_date > stageEnd)))))
      if (outside.length) { setNotice('Adjust existing task dates before narrowing this stage range.'); setBusy(false); return }
    }
    const payload = { name: stageName.trim(), description: stageDescription.trim() || null, start_date: stageStart || null, end_date: stageEnd || null, sort_order: editingStage?.sort_order ?? (stages.length ? Math.max(...stages.map(s => s.sort_order ?? -1)) + 1 : 0) }
    const result = editingStage ? await supabase.from('project_stages').update(payload).eq('id', editingStage.id).select('id').single() : await supabase.from('project_stages').insert({ ...payload, project_id: selected.id, created_by: session.user.id }).select('id').single()
    if (result.error) setNotice(`Could not save stage: ${result.error.message}`)
    else { setShowStage(false); setEditingStage(null); await loadProjectData(selected.id); if (!editingStage && result.data?.id) { setSelectedStageId(result.data.id); setTab('stage_detail') } setNotice(editingStage ? 'Stage updated.' : 'Stage created.') }
    setBusy(false)
  }
  async function deleteStage(stage: Stage) {
    if (!supabase || !selected || !canEdit(selected.role)) return
    const children = tasks.filter(task => task.stage_id === stage.id)
    if (!confirm(`WARNING 1 OF 2: Delete stage "${stage.name}"?${children.length ? ` It currently contains ${children.length} task(s).` : ''}`)) return
    if (!confirm(`FINAL WARNING 2 OF 2: Permanently delete stage "${stage.name}"${children.length ? `, all ${children.length} tasks in it, and their task comments` : ''}? This cannot be undone.`)) return
    const { error } = await supabase.from('project_stages').delete().eq('id', stage.id)
    if (error) setNotice(error.message); else { await loadProjectData(selected.id); setTab('stages'); setNotice(`Stage "${stage.name}" deleted.`) }
  }
  function openCreateTask(stageId: string) { setEditingTask(null); setTaskStageId(stageId); setTaskTitle(''); setTaskDescription(''); setTaskPriority('normal'); setTaskStatus('todo'); setTaskStart(''); setTaskDue(''); setTaskCommentText(''); setShowTask(true) }
  function openEditTask(task: Task) { setEditingTask(task); setTaskStageId(task.stage_id); setTaskTitle(task.title); setTaskDescription(task.description ?? ''); setTaskPriority(task.priority); setTaskStatus(task.status); setTaskStart(task.start_date ?? ''); setTaskDue(task.due_date ?? ''); setTaskCommentText(''); setShowTask(true) }
  async function saveTask(e: FormEvent) {
    e.preventDefault(); if (!supabase || !session?.user || !selected || !canEdit(selected.role) || !taskTitle.trim()) return
    if (!taskStageId || !stages.some(stage => stage.id === taskStageId)) { setNotice('Create or select a stage before adding tasks.'); return }
    if (taskStart && taskDue && taskDue < taskStart) { setNotice('End date cannot be earlier than start date.'); return }
    const parentStage = stages.find(stage => stage.id === taskStageId)
    if (parentStage?.start_date && ((taskStart && taskStart < parentStage.start_date) || (taskDue && taskDue < parentStage.start_date))) { setNotice('Task dates cannot be before the stage start date (' + parentStage.start_date + ').'); return }
    if (parentStage?.end_date && ((taskStart && taskStart > parentStage.end_date) || (taskDue && taskDue > parentStage.end_date))) { setNotice('Task dates cannot be after the stage end date (' + parentStage.end_date + ').'); return }
    setBusy(true); setNotice('')
    const payload = { stage_id: taskStageId, project_id: selected.id, title: taskTitle.trim(), description: taskDescription.trim() || null, status: taskStatus, priority: taskPriority, start_date: taskStart || null, due_date: taskDue || null, sort_order: editingTask?.sort_order ?? (tasks.filter(t => t.stage_id === taskStageId).length ? Math.max(...tasks.filter(t => t.stage_id === taskStageId).map(t => t.sort_order ?? -1)) + 1 : 0) }
    const result = editingTask ? await supabase.from('project_tasks').update(payload).eq('id', editingTask.id) : await supabase.from('project_tasks').insert({ ...payload, created_by: session.user.id })
    if (result.error) setNotice(`Could not save task: ${result.error.message}. Check that supabase/rebuild_stages.sql has been applied.`)
    else { setShowTask(false); setEditingTask(null); await loadProjectData(selected.id); setNotice(editingTask ? 'Task updated.' : 'Task created.') }
    setBusy(false)
  }
  async function updateProject(e: FormEvent) {
    e.preventDefault(); if (!supabase || !selected || !canEdit(selected.role) || !editProjectName.trim()) return
    setBusy(true)
    const { error } = await supabase.from('projects').update({ name: editProjectName.trim(), description: editProjectDescription.trim() || null }).eq('id', selected.id)
    if (error) setNotice(error.message); else { setShowProjectEdit(false); await loadProjects(); setNotice('Project details updated.') }
    setBusy(false)
  }
  function openProjectEdit() { if (!selected) return; setEditProjectName(selected.name); setEditProjectDescription(selected.description ?? ''); setShowProjectEdit(true) }
  async function addStageComment(e: FormEvent) {
    e.preventDefault(); if (!supabase || !session?.user || !selected || !selectedStage || !canComment(selected.role) || !stageCommentText.trim()) return
    setBusy(true)
    const { error } = await supabase.from('stage_comments').insert({ stage_id: selectedStage.id, user_id: session.user.id, body: stageCommentText.trim() })
    if (error) setNotice(error.message); else { setStageCommentText(''); await loadStageComments(selectedStage.id) }
    setBusy(false)
  }
  async function addTaskComment(e: FormEvent) {
    e.preventDefault(); if (!supabase || !session?.user || !editingTask || !selected || !canComment(selected.role) || !taskCommentText.trim()) return
    setBusy(true)
    const { error } = await supabase.from('task_comments').insert({ task_id: editingTask.id, user_id: session.user.id, body: taskCommentText.trim() })
    if (error) setNotice(error.message); else { setTaskCommentText(''); await loadTaskComments(editingTask.id) }
    setBusy(false)
  }
  async function editThreadComment(target: 'stage' | 'task', comment: Comment) {
    if (!supabase || !selected) return
    const updated = prompt('Edit comment', comment.body)
    if (updated === null || !updated.trim()) return
    const table = target === 'stage' ? 'stage_comments' : 'task_comments'
    const { error } = await supabase.from(table).update({ body: updated.trim() }).eq('id', comment.id)
    if (error) setNotice(error.message); else if (target === 'stage' && selectedStage) await loadStageComments(selectedStage.id); else if (target === 'task' && editingTask) await loadTaskComments(editingTask.id)
  }
  async function deleteThreadComment(target: 'stage' | 'task', comment: Comment) {
    if (!supabase || !selected || !confirm('Delete this comment? This cannot be undone.')) return
    const table = target === 'stage' ? 'stage_comments' : 'task_comments'
    const { error } = await supabase.from(table).delete().eq('id', comment.id)
    if (error) setNotice(error.message); else if (target === 'stage' && selectedStage) await loadStageComments(selectedStage.id); else if (target === 'task' && editingTask) await loadTaskComments(editingTask.id)
  }
  async function createStageInline(draft:{name:string;start_date:string;end_date:string;description:string}) {
    if(!supabase||!selected||!session?.user||!canEdit(selected.role))return false
    const name=draft.name.trim();if(!name){setNotice('Enter a stage name before saving.');return false}
    if(draft.start_date&&draft.end_date&&draft.end_date<draft.start_date){setNotice('Stage end date cannot be earlier than its start date.');return false}
    const order=stages.length?Math.max(...stages.map(s=>s.sort_order??-1))+1:0
    const {data,error}=await supabase.from('project_stages').insert({project_id:selected.id,name,description:draft.description.trim()||null,start_date:draft.start_date||null,end_date:draft.end_date||null,sort_order:order,created_by:session.user.id}).select('id').single()
    if(error){setNotice('Could not create stage: '+error.message);return false}
    await loadProjectData(selected.id);if(data?.id){setSelectedStageId(data.id);setTab('stage_detail')}setNotice('Stage created.');return true
  }
  async function createTaskInline(stageId: string, draft: {title:string;start_date:string;due_date:string;assigned_by_name:string;assigned_to_name:string;status:TaskStatus;priority:string;custom_fields:Record<string,string>}) {
    if (!supabase || !selected || !session?.user || !canEdit(selected.role)) return false
    const title=draft.title.trim()
    if(!title){setNotice('Enter a task name before saving.');return false}
    const parentStage=stages.find(s=>s.id===stageId)
    if(!parentStage){setNotice('Choose a valid stage first.');return false}
    if(draft.start_date&&draft.due_date&&draft.due_date<draft.start_date){setNotice('Task end date cannot be earlier than start date.');return false}
    if(parentStage.start_date&&[draft.start_date,draft.due_date].some(d=>d&&d<parentStage.start_date!)){setNotice('Task dates cannot be before the stage start date ('+parentStage.start_date+').');return false}
    if(parentStage.end_date&&[draft.start_date,draft.due_date].some(d=>d&&d>parentStage.end_date!)){setNotice('Task dates cannot be after the stage end date ('+parentStage.end_date+').');return false}
    const siblings=tasks.filter(t=>t.stage_id===stageId)
    const {error}=await supabase.from('project_tasks').insert({project_id:selected.id,stage_id:stageId,title,description:null,start_date:draft.start_date||null,due_date:draft.due_date||null,assigned_by_name:draft.assigned_by_name.trim()||null,assigned_to_name:draft.assigned_to_name.trim()||null,status:draft.status,priority:draft.priority,custom_fields:draft.custom_fields,sort_order:siblings.length?Math.max(...siblings.map(t=>t.sort_order??-1))+1:0,created_by:session.user.id})
    if(error){setNotice('Could not create task: '+error.message);return false}
    await loadProjectData(selected.id);setNotice('Task created.');return true
  }
  async function reorderTasks(stageId: string, ordered: Task[]) {
    if (!supabase || !selected || !canEdit(selected.role)) return
    const results = await Promise.all(ordered.map((task, index) => supabase!.from('project_tasks').update({ sort_order: index }).eq('id', task.id)))
    const failed = results.find(result => result.error)
    if (failed?.error) setNotice('Could not save custom task order: ' + failed.error.message)
    else await loadProjectData(selected.id)
  }
  async function reorderStages(ordered: Stage[]) {
    if (!supabase || !selected || !canEdit(selected.role)) return
    const results = await Promise.all(ordered.map((stage, index) => supabase!.from('project_stages').update({ sort_order: index }).eq('id', stage.id)))
    const failed = results.find(result => result.error)
    if (failed?.error) setNotice('Could not save custom stage order: ' + failed.error.message)
    else await loadProjectData(selected.id)
  }
  async function updateTask(task: Task, patch: Partial<Task>) {
    if (!supabase || !selected || !canEdit(selected.role)) return
    const { error } = await supabase.from('project_tasks').update(patch).eq('id', task.id)
    if (error) setNotice(error.message); else await loadProjectData(selected.id)
  }
  async function addTaskField(rawName: string) {
    if (!supabase || !selected || !session?.user || !canEdit(selected.role)) return
    const name = rawName.trim()
    if (!name) return
    if (taskFields.some(field => field.name.toLowerCase() === name.toLowerCase())) { setNotice('A column with that name already exists.'); return }
    const { data, error } = await supabase.from('project_task_custom_fields').insert({ project_id: selected.id, name, sort_order: taskFields.length, created_by: session.user.id }).select('*').single()
    if (error) setNotice('Could not add custom column: ' + error.message + '. If the table or policy is missing, apply the latest additive Supabase migration.')
    else { setTaskFields(current => [...current, data as TaskCustomField]); setNotice('Added the “' + name + '” column to this project.') }
  }
  async function deleteTaskField(field: TaskCustomField) {
    if (!supabase || !selected || !canEdit(selected.role)) return
    if (!confirm('Delete the “' + field.name + '” column from this project? Values stored in this custom column will be removed from task data and this cannot be undone.')) return
    const nextTasks = tasks.filter(task => Object.prototype.hasOwnProperty.call(task.custom_fields ?? {}, field.id))
    for (const task of nextTasks) {
      const custom = { ...(task.custom_fields ?? {}) }; delete custom[field.id]
      const { error } = await supabase.from('project_tasks').update({ custom_fields: custom }).eq('id', task.id)
      if (error) { setNotice('Could not remove column values: ' + error.message + '. The column has not been deleted.'); return }
    }
    const { error } = await supabase.from('project_task_custom_fields').delete().eq('id', field.id).eq('project_id', selected.id)
    if (error) setNotice('Could not delete custom column: ' + error.message)
    else { setTaskFields(current => current.filter(item => item.id !== field.id)); await loadProjectData(selected.id); setNotice('Deleted the “' + field.name + '” column.') }
  }
  async function deleteTask(task: Task) {
    if (!supabase || !selected || !canEdit(selected.role) || !confirm(`Delete "${task.title}"? This also deletes its task comments.`)) return
    const { error } = await supabase.from('project_tasks').delete().eq('id', task.id)
    if (error) setNotice(error.message)
    else {
      if (editingTask?.id === task.id) { setShowTask(false); setEditingTask(null); setTaskComments([]) }
      await loadProjectData(selected.id)
      setNotice('Task deleted.')
    }
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

  return <div className={`app-shell ${prefs.mode === 'light' ? 'light-mode' : ''} ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`} style={themeStyle}>
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark"><Command size={19}/></div><span>project<span className="accent">hub</span></span><button type="button" className="icon-button collapse" title={sidebarCollapsed?"Expand workspace menu":"Collapse workspace menu"} aria-label={sidebarCollapsed?"Expand workspace menu":"Collapse workspace menu"} onClick={()=>setSidebarCollapsed(v=>!v)}><ChevronDown size={15}/></button></div>
      <button className="workspace-switch"><div className="workspace-avatar">{(session.user.email ?? 'U').slice(0,1).toUpperCase()}</div><div><b>{profileName || session.user.email?.split('@')[0] || 'My workspace'}</b><small>Free workspace</small></div><ChevronDown size={15}/></button>
      <div className="nav-label">WORKSPACE</div>
      <button className={`nav-item ${tab==='overview'?'active':''}`} onClick={()=>setTab('overview')}><LayoutDashboard size={17}/> Overview</button>
      <button className={`nav-item ${tab==='stages'||tab==='stage_detail'?'active':''}`} onClick={()=>setTab('stages')}><ListTodo size={17}/> Stages <span className="nav-count">{stages.length}</span></button>
      <button className={`nav-item ${tab==='calendar'?'active':''}`} onClick={()=>setTab('calendar')}><CalendarDays size={17}/> Calendar</button>
      <button className={`nav-item ${tab==='team'?'active':''}`} onClick={()=>setTab('team')}><Users size={17}/> Team & access</button>
      <button className={`nav-item ${tab==='discussion'?'active':''}`} onClick={()=>setTab('discussion')}><MessageCircle size={17}/> Discussion <span className="nav-count">{comments.length}</span></button>
      <button className={`nav-item ${tab==='settings'?'active':''}`} onClick={()=>setTab('settings')}><Settings2 size={17}/> Personalise</button>
      <div className="project-list-head"><span className="nav-label">YOUR PROJECTS</span><button className="icon-button small" onClick={()=>setShowCreate(true)} title="Create project"><Plus size={16}/></button></div>
      <div className="sidebar-projects">{filteredProjects.slice(0,10).map((p,i)=><button key={p.id} className={`project-nav ${selectedId===p.id?'chosen':''}`} onClick={()=>{setSelectedId(p.id);setTab('stages')}}><span className={`project-dot ${colors[i%colors.length]}`}/><span className="truncate">{p.name}</span></button>)}{filteredProjects.length===0&&<p className="sidebar-empty">No matching projects.</p>}</div>
      <div className="sidebar-bottom"><div className="help-card"><div className="help-icon"><CircleHelp size={17}/></div><b>ProjectHub workspace</b><p>Plan work, coordinate people, and keep updates together.</p></div><div className="profile"><div className="profile-avatar">{(session.user.email ?? 'U').slice(0,1).toUpperCase()}</div><div className="profile-meta"><b>{profileName || session.user.email}</b><small>Signed in</small></div><button className="icon-button" title="Sign out" onClick={signOut}><LogOut size={16}/></button></div></div>
    </aside>
    <main className="main-panel">
      <header className="topbar"><div className="breadcrumbs"><span>Workspace</span><span className="crumb-slash">/</span><b>{selected?.name ?? 'Overview'}</b></div><div className="top-actions"><div className="searchbox"><Search size={16}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search projects…"/><kbd>Ctrl K</kbd></div><div className="top-avatar">{(session.user.email ?? 'U').slice(0,1).toUpperCase()}</div></div></header>
      <div className="page-content">
        {notice && <div className="notice-banner"><span>{notice}</span><button className="icon-button" onClick={()=>setNotice('')}><X size={15}/></button></div>}
        {!selected ? <section className="welcome-block"><div className="welcome-icon"><FolderKanban size={24}/></div><span className="eyebrow">YOUR WORKSPACE</span><h1>Make room for <span>great work.</span></h1><p>Create a project to bring your team, updates, and ideas into one focused space.</p><button className="primary" onClick={()=>setShowCreate(true)}><Plus size={17}/> Create your first project</button><div className="empty-note"><LockKeyhole size={15}/> Projects are private until you add teammates.</div></section> :
        <>
          <div className="page-heading"><div><div className="eyebrow"><span className="live-dot"/> PROJECT WORKSPACE</div><h1>{selected.name}</h1><p>{selected.description || 'A shared space for your team to plan, discuss, and get things done.'}</p></div><div className="heading-actions"><span className={`role-badge ${selected.role==='owner'?'role-owner':''}`}><ShieldCheck size={13}/> {roleLabels[selected.role ?? 'viewer']}</span>{canEdit(selected.role)&&tab==='stages'&&<button className="primary" onClick={openNewStage}><Plus size={16}/> New stage</button>}{canEdit(selected.role)&&tab==='stage_detail'&&selectedStage&&<button className="primary" onClick={()=>openCreateTask(selectedStage.id)}><Plus size={16}/> New task</button>}<button className="outline-button" onClick={()=>exportProjectExcel(selected.name,stages,tasks)} title="Export this project to Excel"><FolderKanban size={14}/> Export Excel</button><button className="outline-button" onClick={()=>exportProjectPdf(selected.name,stages,tasks,taskFields)} title="Print or save this project as a PDF"><FileDown size={14}/> Export PDF</button>{canEdit(selected.role)&&<button className="outline-button" onClick={openProjectEdit}><Pencil size={14}/> Edit project</button>}</div></div>
          {tab==='overview' && <>
            <div className="stats-grid">
              <Stat icon={<ListTodo size={17}/>} label="OPEN TASKS" value={tasks.filter(t=>t.status!=='done').length.toString()} foot={`${tasks.filter(t=>t.status==='done').length} completed`} tone="purple"/>
              <Stat icon={<MessageCircle size={17}/>} label="DISCUSSION" value={comments.length.toString()} foot="Comments in this project" tone="blue"/>
              <Stat icon={<Users size={17}/>} label="TEAM MEMBERS" value={members.length.toString()} foot="People with project access" tone="green"/>
            </div>
            <div className="content-grid">
              <section className="panel">
                <div className="panel-heading"><div><h2>Task progress</h2><p>Track work across the project.</p></div><button className="text-button" onClick={()=>setTab('stages')}>View stages →</button></div>
                <div className="overview-progress">{(['todo','in_progress','done'] as TaskStatus[]).map(s=><div className="progress-row" key={s}><span>{statusLabel(s)}</span><div className="progress-track"><div className={`progress-fill ${s}`} style={{width:`${tasks.length ? tasks.filter(t=>t.status===s).length/tasks.length*100 : 0}%`}}/></div><b>{tasks.filter(t=>t.status===s).length}</b></div>)}</div>
                <div className="panel-heading"><div><h2>Upcoming tasks</h2><p>Nearest deadlines first.</p></div><CalendarDays size={18}/></div>
                <div className="task-list">{tasks.filter(t=>t.status!=='done').sort((a,b)=>(a.due_date??'9999').localeCompare(b.due_date??'9999')).slice(0,5).map(t=><TaskRow key={t.id} task={t} canEdit={canEdit(selected.role)} onStatus={s=>updateTask(t,{status:s})} onDelete={()=>deleteTask(t)}/>)}{tasks.filter(t=>t.status!=='done').length===0&&<Empty icon={<CircleCheck/>} title="No open tasks" body="Create a task to start planning this project."/>}</div>
              </section>
              <aside className="right-column"><section className="panel details-panel"><div className="panel-heading"><div><h2>Project details</h2><p>Workspace summary.</p></div><FolderKanban size={17}/></div><div className="detail-row"><span>Project name</span><b>{selected.name}</b></div><div className="detail-row"><span>Description</span><p>{selected.description || 'No description added yet.'}</p></div><div className="detail-row"><span>Your role</span><b className="access-label"><LockKeyhole size={13}/>{roleLabels[selected.role ?? 'viewer']}</b></div><div className="detail-row"><span>Created</span><b>{new Date(selected.created_at).toLocaleDateString()}</b></div></section><section className="permissions-card"><div className="permission-symbol"><ShieldCheck size={19}/></div><div><b>Role-based access</b><p>Database policies protect project data according to each member's role.</p><button className="text-button" onClick={()=>setTab('team')}>Manage team →</button></div></section></aside>
            </div>
            <Analytics tasks={tasks}/>
          </>}
          {tab==='stages' && <StageOverview stages={stages} tasks={tasks} canManage={canEdit(selected.role)} onOpen={id=>{setSelectedStageId(id);setTab('stage_detail')}} onEdit={openEditStage} onDelete={deleteStage} onAddStage={openNewStage} onReorder={reorderStages} onCreateStageInline={createStageInline} />}
          {tab==='calendar' && <CalendarView stages={stages} tasks={tasks} month={calendarMonth} setMonth={setCalendarMonth} onOpenStage={id=>{setSelectedStageId(id);setTab('stage_detail')}} />}
          {tab==='stage_detail' && selectedStage && <StageDetail stage={selectedStage} tasks={selectedStageTasks} allProjectTasks={tasks} taskFields={taskFields} canManage={canEdit(selected.role)} canComment={canComment(selected.role)} currentUserId={session.user.id} comments={stageComments} commentText={stageCommentText} setCommentText={setStageCommentText} busy={busy} onBack={()=>setTab('stages')} onEdit={()=>openEditStage(selectedStage)} onDelete={()=>deleteStage(selectedStage)} onAddTask={()=>openCreateTask(selectedStage.id)} onTaskClick={openEditTask} onStatus={updateTask} onSaveTask={updateTask} onAddTaskField={addTaskField} onDeleteTaskField={deleteTaskField} onReorderTasks={reorderTasks} onCreateTaskInline={createTaskInline} onComment={addStageComment} onEditComment={comment=>editThreadComment('stage',comment)} onDeleteComment={comment=>deleteThreadComment('stage',comment)} />}
          {tab==='team' && <section className="panel"><div className="panel-heading"><div><h2>Team & access</h2><p>Manage people and permissions for this project.</p></div><span className="count-pill">{members.length} members</span></div>{selected.role==='owner'&&<form className="invite-form" onSubmit={inviteMember}><div className="form-grid"><label>Existing user's email<input type="email" value={inviteEmail} onChange={e=>setInviteEmail(e.target.value)} placeholder="teammate@example.com" required/></label><label>Project role<select value={inviteRole} onChange={e=>setInviteRole(e.target.value as Role)}><option value="editor">Editor</option><option value="commenter">Commenter</option><option value="viewer">Viewer</option></select></label></div><p className="muted tiny">This adds an account that has already registered in this Supabase project. Email invitations to new accounts need a server-side email invitation function.</p><button className="primary compact" disabled={busy}><UserPlus size={15}/>{busy?'Adding…':'Add existing user'}</button></form>}{members.map(m=><div className="member-row" key={m.user_id}><div className="member-avatar">{m.user_id===session.user.id?(session.user.email??'U').slice(0,1).toUpperCase():'U'}</div><div className="member-info"><b>{m.user_id===session.user.id?'You':`Member ${m.user_id.slice(0,8)}`}</b><small>{m.user_id===session.user.id?session.user.email:m.user_id}</small></div>{m.user_id===session.user.id?<span className="role-badge role-owner">{roleLabels[m.role]}</span>:selected.role==='owner'?<><select aria-label="Member role" value={m.role} disabled={m.role==='owner'} onChange={e=>changeMemberRole(m,e.target.value as Role)}><option value="editor">Editor</option><option value="commenter">Commenter</option><option value="viewer">Viewer</option><option value="owner" disabled>Owner</option></select><button className="icon-button" title="Remove member" onClick={()=>removeMember(m)}><Trash2 size={15}/></button></>:<span className="role-badge">{roleLabels[m.role]}</span>}</div>)}{members.length===0&&<Empty icon={<Users/>} title="No team members yet" body="Project members will appear here."/>}</section>}
          {tab==='discussion' && <section className="panel discussion-panel"><div className="panel-heading"><div><h2>Project discussion</h2><p>Share updates and keep everyone in the loop.</p></div><span className="count-pill">{comments.length}</span></div><div className="discussion-list">{comments.length===0?<Empty icon={<MessageCircle/>} title="Start the conversation" body="Share a thought, ask a question, or post an update."/>:comments.map(c=><article className="comment" key={c.id}><div className="comment-avatar">{c.user_id===session.user.id?(session.user.email??'U').slice(0,1).toUpperCase():'M'}</div><div className="comment-body"><div className="comment-meta"><b>{c.user_id===session.user.id?'You':`Member ${c.user_id.slice(0,8)}`}</b><time>{new Date(c.created_at).toLocaleString()}</time></div><p>{c.body}</p></div></article>)}</div>{canComment(selected.role)?<form className="comment-form" onSubmit={addComment}><div className="comment-avatar self">{(session.user.email??'U').slice(0,1).toUpperCase()}</div><div className="comment-compose"><textarea value={commentText} onChange={e=>setCommentText(e.target.value)} placeholder="Write a comment…" rows={2}/><div className="compose-footer"><span>Be kind. Keep it constructive.</span><button className="primary compact" disabled={busy||!commentText.trim()}>Post comment <ArrowLeft size={14} className="send-icon"/></button></div></div></form>:<div className="viewer-note"><Eye size={15}/> You have view-only access.</div>}</section>}
          {tab==='settings' && <Personalise prefs={prefs} save={savePrefs} profileName={profileName} setProfileName={setProfileName} email={session.user.email ?? ''}/>}
        </>
        }
        <div className="page-footer"><span>© 2026 ProjectHub</span><span><LockKeyhole size={12}/> Built for focused collaboration</span></div>
      </div>
    </main>
    {showCreate&&<div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setShowCreate(false)}}><section className="modal"><div className="modal-head"><div><span className="eyebrow">NEW WORKSPACE</span><h2>Create a project</h2><p>Give your team a dedicated place to work together.</p></div><button className="icon-button" onClick={()=>setShowCreate(false)}><X size={18}/></button></div><form onSubmit={createProject} className="form-stack"><label>Project name<input autoFocus value={projectName} onChange={e=>setProjectName(e.target.value)} placeholder="e.g. Website redesign" maxLength={80} required/></label><label>Description <span className="optional">(optional)</span><textarea value={projectDescription} onChange={e=>setProjectDescription(e.target.value)} placeholder="What is this project about?" rows={3} maxLength={500}/></label><div className="modal-note"><LockKeyhole size={15}/> Your new project starts private.</div><div className="modal-actions"><button type="button" className="outline-button" onClick={()=>setShowCreate(false)}>Cancel</button><button className="primary" disabled={busy||!projectName.trim()}><Plus size={16}/>{busy?'Creating…':'Create project'}</button></div></form></section></div>}
    {showProjectEdit&&selected&&<div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setShowProjectEdit(false)}}><section className="modal"><div className="modal-head"><div><span className="eyebrow">PROJECT SETTINGS</span><h2>Edit project</h2><p>Rename this project or update its description.</p></div><button type="button" className="icon-button" onClick={()=>setShowProjectEdit(false)}><X size={18}/></button></div><form onSubmit={updateProject} className="form-stack"><label>Project name<input autoFocus value={editProjectName} onChange={e=>setEditProjectName(e.target.value)} maxLength={80} required/></label><label>Description<textarea value={editProjectDescription} onChange={e=>setEditProjectDescription(e.target.value)} rows={3} maxLength={500}/></label><div className="modal-actions"><button type="button" className="outline-button" onClick={()=>setShowProjectEdit(false)}>Cancel</button><button className="primary" disabled={busy||!editProjectName.trim()}><Check size={15}/> Save project</button></div></form></section></div>}
    {showStage&&selected&&<div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setShowStage(false)}}><section className="modal"><div className="modal-head"><div><span className="eyebrow">PROJECT STAGE</span><h2>{editingStage?'Edit stage':'Create a stage'}</h2><p>Stages group related tasks and summarize their progress.</p></div><button type="button" className="icon-button" onClick={()=>setShowStage(false)}><X size={18}/></button></div><form onSubmit={saveStage} className="form-stack"><label>Stage name<input autoFocus value={stageName} onChange={e=>setStageName(e.target.value)} placeholder="e.g. Flooring" maxLength={160} required/></label><label>Description<textarea value={stageDescription} onChange={e=>setStageDescription(e.target.value)} rows={3} maxLength={5000} placeholder="Describe the purpose or scope of this stage."/></label><div className="form-grid"><label>Stage start date<input type="date" value={stageStart} max={stageEnd||undefined} onChange={e=>setStageStart(e.target.value)}/></label><label>Stage end date<input type="date" value={stageEnd} min={stageStart||undefined} onChange={e=>setStageEnd(e.target.value)}/></label></div><p className="muted tiny">Tasks must stay within the stage date range. Leave a boundary blank if it is not defined.</p><div className="modal-actions"><button type="button" className="outline-button" onClick={()=>setShowStage(false)}>Cancel</button><button className="primary" disabled={busy||!stageName.trim()}><Check size={15}/>{busy?'Saving…':editingStage?'Save changes':'Create stage'}</button></div></form></section></div>}
    {showTask&&selected&&<div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setShowTask(false)}}><section className="modal task-edit-modal"><div className="modal-head"><div><span className="eyebrow">STAGE TASK</span><h2>{editingTask?'Edit task':'Add a task'}</h2><p>{selectedStage?.name ?? stages.find(s=>s.id===taskStageId)?.name ?? 'Stage'} · update dates, details, status and comments any time.</p></div><button type="button" className="icon-button" onClick={()=>setShowTask(false)}><X size={18}/></button></div><form onSubmit={saveTask} className="form-stack"><label>Task name<input autoFocus disabled={!canEdit(selected.role)} value={taskTitle} onChange={e=>setTaskTitle(e.target.value)} placeholder="e.g. Lay tiles" maxLength={160} required/></label><label>Description<textarea disabled={!canEdit(selected.role)} value={taskDescription} onChange={e=>setTaskDescription(e.target.value)} rows={3} maxLength={5000} placeholder="What needs to be done?"/></label><div className="form-grid"><label>Status<select disabled={!canEdit(selected.role)} value={taskStatus} onChange={e=>setTaskStatus(e.target.value as TaskStatus)}><option value="todo">To be started</option><option value="in_progress">Ongoing</option><option value="done">Completed</option></select></label><label>Priority<select disabled={!canEdit(selected.role)} value={taskPriority} onChange={e=>setTaskPriority(e.target.value)}><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option></select></label><label>Start date<input disabled={!canEdit(selected.role)} type="date" value={taskStart} min={stages.find(s=>s.id===taskStageId)?.start_date||undefined} max={stages.find(s=>s.id===taskStageId)?.end_date||undefined} onChange={e=>setTaskStart(e.target.value)}/></label><label>End date<input disabled={!canEdit(selected.role)} type="date" value={taskDue} min={[taskStart,stages.find(s=>s.id===taskStageId)?.start_date].filter(Boolean).sort().slice(-1)[0]||undefined} max={stages.find(s=>s.id===taskStageId)?.end_date||undefined} onChange={e=>setTaskDue(e.target.value)}/></label></div><div className="modal-actions"><button type="button" className="outline-button" onClick={()=>setShowTask(false)}>Close</button>{canEdit(selected.role)&&<button className="primary" disabled={busy||!taskTitle.trim()}><Check size={15}/>{busy?'Saving…':editingTask?'Save task':'Create task'}</button>}{editingTask&&canEdit(selected.role)&&<button type="button" className="outline-button danger-button" onClick={()=>deleteTask(editingTask)}><Trash2 size={14}/> Delete task</button>}</div></form>{editingTask&&<div className="task-modal-comments"><CommentThread title="Task comments" comments={taskComments} canComment={canComment(selected.role)} canManage={canEdit(selected.role)} currentUserId={session.user.id} commentText={taskCommentText} setCommentText={setTaskCommentText} busy={busy} onSubmit={addTaskComment} onEdit={comment=>editThreadComment('task',comment)} onDelete={comment=>deleteThreadComment('task',comment)} placeholder="Comment on this task…"/></div>}</section></div>}
  </div>
}

function getStageProgress(stageTasks: Task[]) {
  const today = new Date(); today.setHours(0,0,0,0)
  const byDay = new Map<string,{todo:number;in_progress:number;done:number;total:number}>()
  const undated = stageTasks.filter(task=>!task.start_date&&!task.due_date)
  for (const task of stageTasks.filter(task=>task.start_date||task.due_date)) {
    const start=parseLocalDate(task.start_date)??parseLocalDate(task.due_date), end=parseLocalDate(task.due_date)??parseLocalDate(task.start_date)
    if(!start||!end||end<start)continue
    for(let d=new Date(start);d<=end;d=addDays(d,1)){const key=dateKey(d),point=byDay.get(key)??{todo:0,in_progress:0,done:0,total:0};point[task.status]+=1;point.total+=1;byDay.set(key,point)}
  }
  let done=0,inProgress=0,todo=0
  for(const day of byDay.values()){done+=day.done/day.total;inProgress+=day.in_progress/day.total;todo+=day.todo/day.total}
  for(const task of undated){if(task.status==='done')done+=1;else if(task.status==='in_progress')inProgress+=1;else todo+=1}
  const total=done+inProgress+todo,pct=(value:number)=>total?Math.round(value/total*100):0
  const dated=stageTasks.flatMap(task=>[parseLocalDate(task.start_date),parseLocalDate(task.due_date)]).filter((d):d is Date=>Boolean(d))
  const start=dated.length?new Date(Math.min(...dated.map(d=>d.getTime()))):null,end=dated.length?new Date(Math.max(...dated.map(d=>d.getTime()))):null
  const late=stageTasks.filter(task=>task.status!=='done'&&task.due_date&&parseLocalDate(task.due_date)&&parseLocalDate(task.due_date)!<today).map(task=>({task,days:Math.floor((today.getTime()-parseLocalDate(task.due_date)!.getTime())/86400000)})).sort((a,b)=>b.days-a.days)
  return {completed:pct(done),ongoing:pct(inProgress),toStart:total?100-pct(done)-pct(inProgress):0,total,start,end,late}
}

function StageOverview({stages,tasks,canManage,onOpen,onEdit,onDelete,onAddStage,onReorder,onCreateStageInline}:{stages:Stage[];tasks:Task[];canManage:boolean;onOpen:(id:string)=>void;onEdit:(stage:Stage)=>void;onDelete:(stage:Stage)=>void;onAddStage:()=>void;onReorder:(stages:Stage[])=>void;onCreateStageInline:(draft:{name:string;start_date:string;end_date:string;description:string})=>Promise<boolean>}) {
  const [adding,setAdding]=useState(false),[draft,setDraft]=useState({name:'',start_date:'',end_date:'',description:''})
  const [sort,setSort]=useState('custom')
  const [dragged,setDragged]=useState<string|null>(null)
  const lateTasks=stages.flatMap(stage=>getStageProgress(tasks.filter(task=>task.stage_id===stage.id)).late.map(item=>({...item,stage}))).sort((a,b)=>b.days-a.days)
  const ordered=[...stages].sort((a,b)=>sort==='custom'?(a.sort_order??0)-(b.sort_order??0):sort==='name'?a.name.localeCompare(b.name):sort==='start'?((a.start_date??'9999').localeCompare(b.start_date??'9999')):sort==='end'?((a.end_date??'9999').localeCompare(b.end_date??'9999')):sort==='tasks'?tasks.filter(t=>t.stage_id===b.id).length-tasks.filter(t=>t.stage_id===a.id).length:0)
  const move=(target:string)=>{if(!dragged||dragged===target)return;const next=[...ordered],from=next.findIndex(s=>s.id===dragged),to=next.findIndex(s=>s.id===target);if(from<0||to<0)return;const [item]=next.splice(from,1);next.splice(to,0,item);setSort('custom');onReorder(next);setDragged(null)}
  return <div className="stages-overview">
    <section className="panel compact-table-panel"><div className="panel-heading"><div><h2>Stages</h2><p>Compact project stage table. Choose a sort or drag rows to save a custom order.</p></div><div className="panel-heading-actions"><label className="sort-control">Sort <select value={sort} onChange={e=>setSort(e.target.value)}><option value="custom">Custom order</option><option value="name">Stage name</option><option value="start">Start date</option><option value="end">End date</option><option value="tasks">Task count</option></select></label><span className="count-pill">{stages.length} stages</span></div></div>
      <div className="compact-table-wrap"><table className="compact-table stage-sheet"><thead><tr><th>Stage name</th><th>Start date</th><th>End date</th><th>Tasks</th><th>Completed</th><th>Description</th><th>Actions</th></tr></thead><tbody>
      {ordered.map((stage,index)=>{const list=tasks.filter(t=>t.stage_id===stage.id),p=getStageProgress(list);return <tr key={stage.id} draggable={canManage&&sort==='custom'} onDragStart={()=>setDragged(stage.id)} onDragOver={e=>{if(sort==='custom')e.preventDefault()}} onDrop={()=>move(stage.id)} onDragEnd={()=>setDragged(null)} className={dragged===stage.id?'dragging-row':''}>
        <td><button className="sheet-name" onClick={()=>onOpen(stage.id)}>{sort==='custom'&&canManage?<span className="drag-grip" title="Drag to reorder">⠿ </span>:null}{stage.name}</button></td>
        <td>{stage.start_date||'—'}</td><td>{stage.end_date||'—'}</td><td>{list.length}</td><td><span className="sheet-progress">{list.filter(t=>t.status==='done').length}/{list.length} · {p.completed}%</span></td><td className="sheet-description">{stage.description||'—'}</td>
        <td><div className="sheet-actions"><button className="icon-button small" title="Edit stage" onClick={()=>onEdit(stage)}><Pencil size={13}/></button><button className="icon-button small" title="Open stage" onClick={()=>onOpen(stage.id)}><Eye size={13}/></button>{canManage&&<button className="icon-button small danger-icon" title="Delete stage" onClick={()=>onDelete(stage)}><Trash2 size={13}/></button>}</div></td>
      </tr>})}
      {canManage&&<>{adding?<tr className="stage-new-row"><td><input autoFocus className="task-grid-editor" placeholder="Stage name" value={draft.name} onChange={e=>setDraft(d=>({...d,name:e.target.value}))}/></td><td><input className="task-grid-editor" type="date" max={draft.end_date||undefined} value={draft.start_date} onChange={e=>setDraft(d=>({...d,start_date:e.target.value}))}/></td><td><input className="task-grid-editor" type="date" min={draft.start_date||undefined} value={draft.end_date} onChange={e=>setDraft(d=>({...d,end_date:e.target.value}))}/></td><td>—</td><td>—</td><td><input className="task-grid-editor" placeholder="Description" value={draft.description} onChange={e=>setDraft(d=>({...d,description:e.target.value}))}/></td><td><div className="sheet-actions"><button type="button" className="icon-button small" title="Save stage" onClick={()=>{void(async()=>{const ok=await onCreateStageInline(draft);if(ok){setAdding(false);setDraft({name:'',start_date:'',end_date:'',description:''})}})()}}><Check size={13}/></button><button type="button" className="icon-button small" title="Cancel" onClick={()=>setAdding(false)}><X size={13}/></button></div></td></tr>:<tr className="sheet-add-row"><td colSpan={7}><button type="button" className="sheet-add-button" onClick={()=>setAdding(true)}><Plus size={15}/> Add stage</button></td></tr>}</>}
      </tbody></table></div>
    </section>
    <section className="panel stage-analytics-panel"><div className="panel-heading"><div><h2>Stage completion chart</h2><p>Completion and schedule status by stage.</p></div></div>
      {stages.length===0?<Empty icon={<ListTodo/>} title="No stages yet" body="Add a stage using the plus row above."/>:<div className="stage-progress-list">{ordered.map(stage=>{const childTasks=tasks.filter(task=>task.stage_id===stage.id),p=getStageProgress(childTasks);return <article key={stage.id} className="stage-progress-card"><button className="stage-progress-open" onClick={()=>onOpen(stage.id)}><div className="stage-progress-title"><span className="stage-index">{String(ordered.findIndex(s=>s.id===stage.id)+1).padStart(2,'0')}</span><span className="stage-name-block"><b>{stage.name}</b><small>{stage.start_date||'Start not set'} → {stage.end_date||'End not set'} · {childTasks.filter(t=>t.status==='done').length} of {childTasks.length} tasks completed</small></span><span className="stage-open-link">Open stage →</span></div><div className="stage-percent-grid"><span><b>{p.completed}%</b><small>Completed</small></span><span><b>{p.ongoing}%</b><small>Ongoing</small></span><span><b>{p.toStart}%</b><small>To be started</small></span></div><div className="stage-stacked-progress"><span className="stage-segment completed" style={{width:p.completed+'%'}}/><span className="stage-segment ongoing" style={{width:p.ongoing+'%'}}/><span className="stage-segment to-start" style={{width:p.toStart+'%'}}/></div></button></article>})}</div>}
    </section>
    <section className="panel stage-lag-panel"><div className="panel-heading"><div><h2>Schedule watch</h2><p>Incomplete tasks that have passed their planned end date.</p></div><span className={'count-pill '+(lateTasks.length?'late-count':'')}>{lateTasks.length} late</span></div>{lateTasks.length?<div className="stage-lag-list">{lateTasks.map(({stage,task,days})=><button type="button" key={task.id} className="stage-lag-row" onClick={()=>onOpen(stage.id)}><span className="lag-indicator"><AlertCircle size={15}/></span><span><b>{task.title}</b><small>{stage.name} · due {task.due_date}</small></span><strong>{days} {days===1?'day':'days'} late</strong></button>)}</div>:<div className="stage-on-track-empty"><Check size={16}/> No overdue tasks across your stages.</div>}</section>
    <StageTimeline stages={stages} tasks={tasks} onOpen={onOpen}/></div>
}

function StageTimeline({stages,tasks,onOpen}:{stages:Stage[];tasks:Task[];onOpen:(id:string)=>void}) {
  const [rangeDays,setRangeDays]=useState(30),[shift,setShift]=useState(0),[collapsed,setCollapsed]=useState(false)
  const dated=[...stages.flatMap(stage=>[parseLocalDate(stage.start_date),parseLocalDate(stage.end_date)]),...tasks.flatMap(task=>[parseLocalDate(task.start_date),parseLocalDate(task.due_date)])].filter((d):d is Date=>Boolean(d)),today=new Date()
  today.setHours(0,0,0,0)
  const earliest=dated.length?new Date(Math.min(...dated.map(d=>d.getTime()))):today,anchor=earliest<today?earliest:today
  const rangeStart=addDays(anchor,shift*rangeDays),rangeEnd=addDays(rangeStart,rangeDays-1),dayOffset=(d:Date)=>Math.round((d.getTime()-rangeStart.getTime())/86400000)
  const ticks:{date:Date;label:string;sub:string}[]=[]
  if(rangeDays<=30)for(let i=0;i<rangeDays;i++){const d=addDays(rangeStart,i);ticks.push({date:d,label:String(d.getDate()),sub:d.toLocaleDateString(undefined,{month:'short'})})}
  else if(rangeDays<=183)for(let i=0;i<rangeDays;i+=7){const d=addDays(rangeStart,i);ticks.push({date:d,label:d.toLocaleDateString(undefined,{day:'numeric',month:'short'}),sub:'Week'})}
  else{const d=new Date(rangeStart.getFullYear(),rangeStart.getMonth(),1);while(d<=rangeEnd){const clipped=d<rangeStart?rangeStart:d;ticks.push({date:clipped,label:clipped.toLocaleDateString(undefined,{month:'short'}),sub:String(clipped.getFullYear())});d.setMonth(d.getMonth()+1)}}
  const tickCount=Math.max(1,ticks.length)
  return <section className={"panel gantt-panel stage-timeline-panel "+(collapsed?"section-collapsed":"")}><div className="panel-heading gantt-heading"><div><h2>Stage Gantt chart</h2><p>Each bar spans the earliest task start to latest task end in that stage. Select a row to open its task timeline.</p></div><GanttChartSquare size={19}/><button type="button" className="icon-button" aria-label={collapsed?"Show Stage Gantt chart":"Hide Stage Gantt chart"} onClick={()=>setCollapsed(v=>!v)}>{collapsed?<ChevronDown size={17}/>:<ChevronUp size={17}/>}</button></div>
    <div className="gantt-toolbar"><div className="gantt-range-buttons">{[{label:'1 week',days:7},{label:'1 month',days:30},{label:'6 months',days:183},{label:'1 year',days:365}].map(r=><button key={r.days} className={`outline-button ${rangeDays===r.days?'selected-range':''}`} onClick={()=>{setRangeDays(r.days);setShift(0)}}>{r.label}</button>)}</div><div className="gantt-nav"><button className="outline-button" onClick={()=>setShift(v=>v-1)}>← Previous</button><button className="outline-button" onClick={()=>setShift(0)}>Reset window</button><button className="outline-button" onClick={()=>setShift(v=>v+1)}>Next →</button></div></div>
    <div className="gantt-range-caption">{rangeStart.toLocaleDateString(undefined,{day:'numeric',month:'short',year:'numeric'})} – {rangeEnd.toLocaleDateString(undefined,{day:'numeric',month:'short',year:'numeric'})} · {stages.length} stages</div>
    {!stages.length?<Empty icon={<GanttChartSquare/>} title="No stage timeline yet" body="Create stages and schedule their tasks to see the project timeline."/>:<div className="gantt-scroll"><div className="gantt-canvas" style={{minWidth:`${Math.max(900,tickCount*(rangeDays<=30?42:rangeDays<=183?76:110))}px`}}>
      <div className="gantt-head"><div className="gantt-task-name gantt-sticky-name">Stage / schedule</div><div className="gantt-days">{ticks.map((tick,i)=><div key={`${dateKey(tick.date)}-${i}`} className="gantt-day" style={{left:`${Math.max(0,dayOffset(tick.date)/rangeDays*100)}%`}}><b>{tick.label}</b><small>{tick.sub}</small></div>)}</div></div>
      {stages.map(stage=>{const childTasks=tasks.filter(task=>task.stage_id===stage.id),p=getStageProgress(childTasks),rawStart=parseLocalDate(stage.start_date)??p.start,rawEnd=parseLocalDate(stage.end_date)??p.end;let bar:{left:number;width:number}|null=null;if(rawStart&&rawEnd&&rawEnd>=rangeStart&&rawStart<=rangeEnd){const start=Math.max(0,dayOffset(rawStart)),end=Math.min(rangeDays-1,dayOffset(rawEnd));bar={left:start/rangeDays*100,width:Math.max(.7,(end-start+1)/rangeDays*100)}}
        return <div className="gantt-row stage-timeline-row" key={stage.id} role="button" tabIndex={0} onClick={()=>onOpen(stage.id)} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();onOpen(stage.id)}}}><div className="gantt-task-name gantt-sticky-name"><b>{stage.name}</b><small>{rawStart?dateKey(rawStart):'Start not set'} → {rawEnd?dateKey(rawEnd):'End not set'}</small><small>{p.completed}% completed · {childTasks.length} tasks</small></div><div className="gantt-track stage-summary-track" style={{backgroundSize:`${100/tickCount}% 100%`}}>{bar&&<div className="gantt-bar stage-summary-bar" title={`${stage.name}: ${p.completed}% complete`} style={{left:`${bar.left}%`,width:`${bar.width}%`,background:`linear-gradient(90deg,#5dd7b0 0% ${p.completed}%,#9a8cff ${p.completed}% 100%)`}}/>}{!bar&&<span className="gantt-outside-label">{childTasks.length?'Dates outside window or incomplete':'Add dated tasks to schedule'}</span>}</div></div>})}
    </div></div>}</section>
}

function StageDetail({stage,tasks,allProjectTasks,taskFields,canManage,canComment,currentUserId,comments,commentText,setCommentText,busy,onBack,onEdit,onDelete,onAddTask,onTaskClick,onStatus,onSaveTask,onAddTaskField,onDeleteTaskField,onReorderTasks,onCreateTaskInline,onComment,onEditComment,onDeleteComment}:{stage:Stage;tasks:Task[];allProjectTasks:Task[];taskFields:TaskCustomField[];canManage:boolean;canComment:boolean;currentUserId:string;comments:Comment[];commentText:string;setCommentText:(value:string)=>void;busy:boolean;onBack:()=>void;onEdit:()=>void;onDelete:()=>void;onAddTask:()=>void;onTaskClick:(task:Task)=>void;onStatus:(task:Task,patch:Partial<Task>)=>void;onSaveTask:(task:Task,patch:Partial<Task>)=>void;onAddTaskField:(name:string)=>void;onDeleteTaskField:(field:TaskCustomField)=>void;onReorderTasks:(stageId:string,tasks:Task[])=>void;onCreateTaskInline:(stageId:string,draft:{title:string;start_date:string;due_date:string;assigned_by_name:string;assigned_to_name:string;status:TaskStatus;priority:string;custom_fields:Record<string,string>})=>Promise<boolean>;onComment:(event:FormEvent)=>void;onEditComment:(comment:Comment)=>void;onDeleteComment:(comment:Comment)=>void}) {
  const p=getStageProgress(tasks)
  const [statsCollapsed,setStatsCollapsed]=useState(false)
  const [detailsCollapsed,setDetailsCollapsed]=useState(false)
  return <div className="stage-detail-page">
    <div className="stage-detail-heading"><button type="button" className="outline-button" onClick={onBack}><ArrowLeft size={14}/> All stages</button><div className="stage-detail-title"><span className="eyebrow">STAGE DETAILS</span><h2>{stage.name}</h2><p>{stage.description||'No stage description added yet.'}</p></div><div className="stage-detail-actions">{canManage&&<><button type="button" className="outline-button" onClick={onEdit}><Pencil size={14}/> Edit stage</button><button type="button" className="outline-button danger-button" onClick={onDelete}><Trash2 size={14}/> Delete stage</button></>}</div></div>
    <section className={'panel stage-detail-stats-panel '+(statsCollapsed?'section-collapsed':'')}>
      <div className="panel-heading"><div><h2>Stage progress</h2><p>Completion, ongoing work and tasks not yet started.</p></div><button type="button" className="icon-button" aria-label={statsCollapsed?'Show stage progress':'Hide stage progress'} onClick={()=>setStatsCollapsed(v=>!v)}>{statsCollapsed?<ChevronDown size={17}/>:<ChevronUp size={17}/>}</button></div>
      {!statsCollapsed&&<div className="stage-detail-stats"><div className="stage-detail-stat"><small>COMPLETED</small><b>{p.completed}%</b><div className="stage-mini-track"><i className="completed" style={{width:p.completed+'%'}}/></div></div><div className="stage-detail-stat"><small>ONGOING</small><b>{p.ongoing}%</b><div className="stage-mini-track"><i className="ongoing" style={{width:p.ongoing+'%'}}/></div></div><div className="stage-detail-stat"><small>TO BE STARTED</small><b>{p.toStart}%</b><div className="stage-mini-track"><i className="to-start" style={{width:p.toStart+'%'}}/></div></div></div>}
    </section>
    <Gantt tasks={tasks} canEdit={canManage} onStatus={onStatus} onTaskClick={onTaskClick}/>
    <section className={'panel stage-task-list-panel '+(detailsCollapsed?'section-collapsed':'')}>
      <div className="panel-heading"><div><h2>Task details</h2><p>Edit task values directly in the grid. Changes are saved to the project.</p></div><div className="panel-heading-actions">{canManage&&<button className="primary compact" onClick={onAddTask}><Plus size={14}/> Add task</button>}<button type="button" className="icon-button" aria-label={detailsCollapsed?'Show task details':'Hide task details'} onClick={()=>setDetailsCollapsed(v=>!v)}>{detailsCollapsed?<ChevronDown size={17}/>:<ChevronUp size={17}/>}</button></div></div>
      {!detailsCollapsed&&(!tasks.length?<Empty icon={<ListTodo/>} title="No tasks in this stage" body="Add your first task with start and end dates."/>:<TaskGrid stage={stage} tasks={tasks} allProjectTasks={allProjectTasks} fields={taskFields} canEdit={canManage} onTaskClick={onTaskClick} onSaveTask={onSaveTask} onAddField={onAddTaskField} onDeleteField={onDeleteTaskField} onAddTask={onAddTask} onReorderTasks={onReorderTasks} onCreateTaskInline={onCreateTaskInline}/>)}
    </section>
    <CommentThread title="Stage comments" comments={comments} canComment={canComment} canManage={canManage} currentUserId={currentUserId} commentText={commentText} setCommentText={setCommentText} busy={busy} onSubmit={onComment} onEdit={onEditComment} onDelete={onDeleteComment} placeholder="Add an update or comment about this stage…"/>
  </div>
}

function TaskGrid({stage,tasks,allProjectTasks,fields,canEdit,onTaskClick,onSaveTask,onAddField,onDeleteField,onAddTask,onReorderTasks,onCreateTaskInline}:{stage:Stage;tasks:Task[];allProjectTasks:Task[];fields:TaskCustomField[];canEdit:boolean;onTaskClick:(task:Task)=>void;onSaveTask:(task:Task,patch:Partial<Task>)=>void;onAddField:(name:string)=>void;onDeleteField:(field:TaskCustomField)=>void;onAddTask:()=>void;onReorderTasks:(stageId:string,tasks:Task[])=>void;onCreateTaskInline:(stageId:string,draft:{title:string;start_date:string;due_date:string;assigned_by_name:string;assigned_to_name:string;status:TaskStatus;priority:string;custom_fields:Record<string,string>})=>Promise<boolean>}) {
  const [sort,setSort]=useState('custom'),[dragged,setDragged]=useState<string|null>(null),[adding,setAdding]=useState(false),[draft,setDraft]=useState({title:'',start_date:'',due_date:'',assigned_by_name:'',assigned_to_name:'',status:'todo' as TaskStatus,priority:'normal',custom_fields:{} as Record<string,string>})
  const assigners=[...new Set(allProjectTasks.map(t=>t.assigned_by_name?.trim()).filter((v):v is string=>Boolean(v)))]
  const assignees=[...new Set(allProjectTasks.map(t=>t.assigned_to_name?.trim()).filter((v):v is string=>Boolean(v)))]
  const addField=()=>{const name=prompt('Name this new column. It will be available for every task in this project.');if(name?.trim())onAddField(name)}
  const ordered=[...tasks].sort((a,b)=>sort==='custom'?(a.sort_order??0)-(b.sort_order??0):sort==='name'?a.title.localeCompare(b.title):sort==='start'?((a.start_date??'9999').localeCompare(b.start_date??'9999')):sort==='end'?((a.due_date??'9999').localeCompare(b.due_date??'9999')):sort==='assigner'?((a.assigned_by_name??'').localeCompare(b.assigned_by_name??'')):sort==='assignee'?((a.assigned_to_name??'').localeCompare(b.assigned_to_name??'')):sort==='status'?a.status.localeCompare(b.status):sort.startsWith('field:')?String(a.custom_fields?.[sort.slice(6)]??'').localeCompare(String(b.custom_fields?.[sort.slice(6)]??'')):0)
  const move=(target:string)=>{if(!dragged||dragged===target)return;const next=[...ordered],from=next.findIndex(t=>t.id===dragged),to=next.findIndex(t=>t.id===target);if(from<0||to<0)return;const [item]=next.splice(from,1);next.splice(to,0,item);setSort('custom');onReorderTasks(stage.id,next);setDragged(null)}
  return <div className="task-grid-shell"><div className="task-grid-toolbar"><label className="sort-control">Sort tasks <select value={sort} onChange={e=>setSort(e.target.value)}><option value="custom">Custom order</option><option value="name">Task name</option><option value="start">Start date</option><option value="end">End date</option><option value="assigner">Assigner</option><option value="assignee">Assignee</option><option value="status">Status</option>{fields.map(field=><option key={field.id} value={'field:'+field.id}>{field.name}</option>)}</select></label><span className="sheet-hint">{ordered.length} tasks · drag rows in custom order</span></div>
  <div className="task-grid-wrap"><table className="task-grid-table"><thead><tr><th className="task-grid-name-col">Task name</th><th>Start date</th><th>End date</th><th>Assigner</th><th>Assignee</th><th>Status</th><th>Priority</th>{fields.map(field=><th key={field.id} className="task-grid-custom-header"><span>{field.name}</span>{canEdit&&<button className="task-grid-delete-field" type="button" title={'Delete '+field.name+' column'} aria-label={'Delete '+field.name+' column'} onClick={()=>onDeleteField(field)}><Trash2 size={12}/></button>}</th>)}<th className="task-grid-add-col">{canEdit&&<button type="button" className="task-grid-add-field" onClick={addField} aria-label="Add a custom task column" title="Add a column"><Plus size={15}/></button>}</th></tr></thead>
  <tbody>{ordered.map(task=><tr key={task.id} draggable={canEdit&&sort==='custom'} onDragStart={()=>setDragged(task.id)} onDragOver={e=>{if(sort==='custom')e.preventDefault()}} onDrop={()=>move(task.id)} onDragEnd={()=>setDragged(null)} className={dragged===task.id?'dragging-row':''}>
    <th scope="row" className="task-grid-name-col"><div className="task-grid-title-cell">{sort==='custom'&&canEdit&&<span className="drag-grip" title="Drag to reorder">⠿</span>}<EditableTaskCell value={task.title} type="text" canEdit={canEdit} label={task.title+' task name'} onSave={value=>onSaveTask(task,{title:value})}/><button type="button" className="task-grid-open-task" title="Task details" onClick={()=>onTaskClick(task)}><Pencil size={11}/></button></div></th>
    <td><EditableTaskCell value={task.start_date} type="date" canEdit={canEdit} label={task.title+' start date'} min={stage.start_date||undefined} max={stage.end_date||undefined} onSave={value=>onSaveTask(task,{start_date:value||null})}/></td>
    <td><EditableTaskCell value={task.due_date} type="date" canEdit={canEdit} label={task.title+' end date'} min={[task.start_date,stage.start_date].filter(Boolean).sort().slice(-1)[0]||undefined} max={stage.end_date||undefined} onSave={value=>onSaveTask(task,{due_date:value||null})}/></td>
    <td><EditableTaskCell value={task.assigned_by_name} type="text" canEdit={canEdit} label={task.title+' assigner'} suggestions={assigners} onSave={value=>onSaveTask(task,{assigned_by_name:value||null})}/></td>
    <td><EditableTaskCell value={task.assigned_to_name} type="text" canEdit={canEdit} label={task.title+' assignee'} suggestions={assignees} onSave={value=>onSaveTask(task,{assigned_to_name:value||null})}/></td>
    <td><select className="task-grid-select" disabled={!canEdit} value={task.status} onChange={e=>onSaveTask(task,{status:e.target.value as TaskStatus})}><option value="todo">To start</option><option value="in_progress">Ongoing</option><option value="done">Done</option></select></td>
    <td><select className="task-grid-select" disabled={!canEdit} value={task.priority} onChange={e=>onSaveTask(task,{priority:e.target.value})}><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option></select></td>
    {fields.map(field=><td key={field.id}><EditableTaskCell value={task.custom_fields?.[field.id]} type="text" canEdit={canEdit} label={task.title+' '+field.name} onSave={value=>onSaveTask(task,{custom_fields:{...(task.custom_fields??{}),[field.id]:value}})}/></td>)}<td className="task-grid-add-col"></td>
  </tr>)}
  {canEdit&&<>{adding?<tr className="task-grid-new-row"><th className="task-grid-name-col"><input autoFocus className="task-grid-editor" placeholder="Task name" value={draft.title} onChange={e=>setDraft(d=>({...d,title:e.target.value}))}/></th><td><input className="task-grid-editor" type="date" min={stage.start_date||undefined} max={stage.end_date||undefined} value={draft.start_date} onChange={e=>setDraft(d=>({...d,start_date:e.target.value}))}/></td><td><input className="task-grid-editor" type="date" min={draft.start_date||stage.start_date||undefined} max={stage.end_date||undefined} value={draft.due_date} onChange={e=>setDraft(d=>({...d,due_date:e.target.value}))}/></td><td><input className="task-grid-editor" list="new-task-assigners" placeholder="Assigner" value={draft.assigned_by_name} onChange={e=>setDraft(d=>({...d,assigned_by_name:e.target.value}))}/><datalist id="new-task-assigners">{assigners.map(n=><option key={n} value={n}/>)}</datalist></td><td><input className="task-grid-editor" list="new-task-assignees" placeholder="Assignee" value={draft.assigned_to_name} onChange={e=>setDraft(d=>({...d,assigned_to_name:e.target.value}))}/><datalist id="new-task-assignees">{assignees.map(n=><option key={n} value={n}/>)}</datalist></td><td><select className="task-grid-select" value={draft.status} onChange={e=>setDraft(d=>({...d,status:e.target.value as TaskStatus}))}><option value="todo">To start</option><option value="in_progress">Ongoing</option><option value="done">Done</option></select></td><td><select className="task-grid-select" value={draft.priority} onChange={e=>setDraft(d=>({...d,priority:e.target.value}))}><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option></select></td>{fields.map(field=><td key={field.id}><input className="task-grid-editor" placeholder={field.name} value={draft.custom_fields[field.id]||''} onChange={e=>setDraft(d=>({...d,custom_fields:{...d.custom_fields,[field.id]:e.target.value}}))}/></td>)}<td className="task-grid-add-col"><button type="button" className="task-grid-add-field" title="Save task" onClick={()=>{void (async()=>{const ok=await onCreateTaskInline(stage.id,draft);if(ok){setAdding(false);setDraft({title:'',start_date:'',due_date:'',assigned_by_name:'',assigned_to_name:'',status:'todo',priority:'normal',custom_fields:{}})}})()}}><Check size={13}/></button><button type="button" className="task-grid-add-field" title="Cancel" onClick={()=>setAdding(false)}><X size={13}/></button></td></tr>:<tr className="sheet-add-row"><td colSpan={8+fields.length}><button type="button" className="sheet-add-button" onClick={()=>setAdding(true)}><Plus size={15}/> Add task</button></td></tr>}</>}</tbody></table></div></div>
}

function EditableTaskCell({value,type,canEdit,label,suggestions=[],min,max,onSave}:{value:string|null|undefined;type:'text'|'date';canEdit:boolean;label:string;suggestions?:string[];min?:string;max?:string;onSave:(value:string)=>void}) {
  const [editing,setEditing]=useState(false)
  const [draft,setDraft]=useState(value??'')
  const listId='suggest-'+label.replace(/[^a-z0-9]+/gi,'-')
  useEffect(()=>{if(!editing)setDraft(value??'')},[value,editing])
  const commit=()=>{setEditing(false);if(draft!==(value??''))onSave(draft)}
  return <div className="task-grid-cell-wrap">
    {editing&&canEdit?<input className="task-grid-editor" autoFocus type={type} aria-label={label} value={draft} min={min} max={max} list={type==='text'&&suggestions.length?listId:undefined} onChange={e=>setDraft(e.target.value)} onBlur={commit} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();e.currentTarget.blur()}}}/>:<button type="button" className="task-grid-cell" disabled={!canEdit} aria-label={label} onClick={()=>canEdit&&setEditing(true)}>{value||<span className="task-grid-empty">—</span>}</button>}
    {editing&&type==='text'&&suggestions.length>0&&<datalist id={listId}>{suggestions.map(name=><option key={name} value={name}/>)}</datalist>}
  </div>
}
function CommentThread({title,comments,canComment,canManage,currentUserId,commentText,setCommentText,busy,onSubmit,onEdit,onDelete,placeholder}:{title:string;comments:Comment[];canComment:boolean;canManage:boolean;currentUserId:string;commentText:string;setCommentText:(value:string)=>void;busy:boolean;onSubmit:(event:FormEvent)=>void;onEdit:(comment:Comment)=>void;onDelete:(comment:Comment)=>void;placeholder:string}) {
  const [collapsed,setCollapsed]=useState(false)
  return <section className={'panel thread-panel '+(collapsed?'section-collapsed':'')}><div className="panel-heading"><div><h2>{title}</h2><p>Comments are saved with the stage or task and visible to project members.</p></div><div className="panel-heading-actions"><span className="count-pill">{comments.length}</span><button type="button" className="icon-button" aria-label={(collapsed?'Show ':'Hide ')+title} onClick={()=>setCollapsed(v=>!v)}>{collapsed?<ChevronDown size={17}/>:<ChevronUp size={17}/>}</button></div></div>
    <div className="discussion-list">{comments.length===0?<Empty icon={<MessageCircle/>} title="No comments yet" body="Start the conversation with a stage or task update."/>:comments.map(comment=><article className="comment" key={comment.id}><div className="comment-avatar">{comment.user_id===currentUserId?'Y':'M'}</div><div className="comment-body"><div className="comment-meta"><b>{comment.user_id===currentUserId?'You':'Member '+comment.user_id.slice(0,8)}</b><time>{new Date(comment.created_at).toLocaleString()}</time><span className="thread-actions">{(comment.user_id===currentUserId||canManage)&&<button type="button" className="icon-button small" title="Edit comment" onClick={()=>onEdit(comment)}><Pencil size={12}/></button>}{(comment.user_id===currentUserId||canManage)&&<button type="button" className="icon-button small danger-icon" title="Delete comment" onClick={()=>onDelete(comment)}><Trash2 size={12}/></button>}</span></div><p>{comment.body}</p></div></article>)}</div>
    {canComment?<form className="comment-form" onSubmit={onSubmit}><div className="comment-avatar self">Y</div><div className="comment-compose"><textarea value={commentText} onChange={e=>setCommentText(e.target.value)} placeholder={placeholder} rows={2} maxLength={5000}/><div className="compose-footer"><span>Keep the project team informed.</span><button className="primary compact" disabled={busy||!commentText.trim()}>Post comment <ArrowLeft size={13} className="send-icon"/></button></div></div></form>:<div className="viewer-note"><Eye size={15}/> You have view-only access.</div>}
  </section>
}
function statusLabel(status: TaskStatus) { return status === 'todo' ? 'To be started' : status === 'in_progress' ? 'Ongoing' : 'Completed' }
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
function Gantt({ tasks, canEdit, onStatus, onTaskClick }: { tasks: Task[]; canEdit: boolean; onStatus: (t: Task, p: Partial<Task>)=>void; onTaskClick?: (task: Task)=>void }) {
  const [rangeDays, setRangeDays] = useState(() => { const ds=tasks.flatMap(t=>[parseLocalDate(t.start_date),parseLocalDate(t.due_date)]).filter((d):d is Date=>Boolean(d)); return ds.length>1?Math.min(3650,Math.max(7,Math.ceil((Math.max(...ds.map(d=>d.getTime()))-Math.min(...ds.map(d=>d.getTime())))/86400000)+1)):30 })
  const [shift, setShift] = useState(0)
  const [collapsed,setCollapsed]=useState(false)
  const [pan,setPan]=useState<{x:number;left:number}|null>(null)
  const panMoved=useRef(false)
  const datedValues = tasks.flatMap(t => [parseLocalDate(t.start_date), parseLocalDate(t.due_date)]).filter((d): d is Date => Boolean(d))
  const today = new Date(); today.setHours(0,0,0,0)
  const earliest = datedValues.length ? new Date(Math.min(...datedValues.map(d=>d.getTime()))) : today
  const anchor = earliest
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
  return <section className={"panel gantt-panel "+(collapsed?"section-collapsed":"")}>
    <div className="panel-heading gantt-heading"><div><h2>Task Gantt chart</h2><p>The full schedule fits the initial view. Scroll over the timeline to zoom in or out; use Previous/Next to pan dates.</p></div><GanttChartSquare size={19}/><button type="button" className="icon-button" aria-label={collapsed?"Show Task Gantt chart":"Hide Task Gantt chart"} onClick={()=>setCollapsed(v=>!v)}>{collapsed?<ChevronDown size={17}/>:<ChevronUp size={17}/>}</button></div>
    <div className="gantt-toolbar"><div className="gantt-range-buttons" role="group" aria-label="Timeline preview range">{[{label:'1 week',days:7},{label:'1 month',days:30},{label:'6 months',days:183},{label:'1 year',days:365}].map(r=><button key={r.days} className={`outline-button ${rangeDays===r.days?'selected-range':''}`} onClick={()=>{setRangeDays(r.days);setShift(0)}}>{r.label}</button>)}</div><div className="gantt-nav"><button className="outline-button" onClick={()=>setShift(v=>v-1)} aria-label="Previous timeline window">← Previous</button><button className="outline-button" onClick={()=>{setRangeDays(datedValues.length>1?Math.min(3650,Math.max(7,Math.ceil((Math.max(...datedValues.map(d=>d.getTime()))-Math.min(...datedValues.map(d=>d.getTime())))/86400000)+1)):30);setShift(0)}}>Fit all</button><button className="outline-button" onClick={()=>setShift(v=>v+1)}>Next →</button></div></div>
    <div className="gantt-range-caption">{rangeStart.toLocaleDateString(undefined,{day:'numeric',month:'short',year:'numeric'})} – {rangeEnd.toLocaleDateString(undefined,{day:'numeric',month:'short',year:'numeric'})} · {tasks.length} tasks</div>
    {tasks.length===0 ? <Empty icon={<GanttChartSquare/>} title="Your timeline is empty" body="Create tasks with start and due dates to build your Gantt chart."/> : <div className="gantt-scroll" title="Scroll to zoom; drag horizontally to pan" onMouseDown={e=>{if(e.button===0){panMoved.current=false;setPan({x:e.clientX,left:e.currentTarget.scrollLeft})}}} onMouseMove={e=>{if(pan){const dx=e.clientX-pan.x;if(Math.abs(dx)>4)panMoved.current=true;e.currentTarget.scrollLeft=pan.left-dx}}} onMouseUp={()=>setPan(null)} onMouseLeave={()=>setPan(null)} onClickCapture={e=>{if(panMoved.current){e.stopPropagation();panMoved.current=false}}}><div className="gantt-canvas" onWheel={e=>{e.preventDefault();setRangeDays(v=>Math.max(7,Math.min(3650,Math.round(v*(e.deltaY>0?1.2:0.83)))));setShift(0)}} style={{minWidth:`${Math.max(900, tickCount * (rangeDays<=30 ? 30 : rangeDays<=183 ? 38 : 52))}px`}}>
      <div className="gantt-head"><div className="gantt-task-name gantt-sticky-name">Task / schedule</div><div className="gantt-days">{ticks.map((tick,i)=><div key={`${dateKey(tick.date)}-${i}`} className="gantt-day" style={{left:`${Math.max(0,dayOffset(tick.date)/rangeDays*100)}%`}}><b>{tick.label}</b><small>{tick.sub}</small></div>)}</div></div>
      {visibleTasks.map(t=>{
        const rawStart=parseLocalDate(t.start_date) ?? parseLocalDate(t.due_date)
        const rawEnd=parseLocalDate(t.due_date) ?? rawStart
        let bar: {left:number;width:number}|null=null
        if (rawStart && rawEnd && rawEnd >= rangeStart && rawStart <= rangeEnd) {
          const start=Math.max(0,dayOffset(rawStart)), end=Math.min(rangeDays-1,dayOffset(rawEnd))
          bar={left:start/rangeDays*100,width:Math.max(0.7,(end-start+1)/rangeDays*100)}
        }
        return <div className="gantt-row task-gantt-row" key={t.id} role={onTaskClick?'button':undefined} tabIndex={onTaskClick?0:undefined} onClick={()=>onTaskClick?.(t)} onKeyDown={e=>{if(onTaskClick&&(e.key==='Enter'||e.key===' ')){e.preventDefault();onTaskClick(t)}}}><div className="gantt-task-name gantt-sticky-name"><b>{t.title}</b><small>{t.start_date ?? 'Start not set'} → {t.due_date ?? 'Due date not set'}</small></div><div className="gantt-track" style={{backgroundSize:`${100/tickCount}% 100%`}}>{bar&&<div className={`gantt-bar ${t.status}`} title={`${t.title}: ${t.start_date ?? t.due_date ?? 'unscheduled'} → ${t.due_date ?? t.start_date ?? 'unscheduled'}`} style={{left:`${bar.left}%`,width:`${bar.width}%`}}/>}{!bar&&<span className="gantt-outside-label">{rawStart ? (rawStart > rangeEnd ? 'After this window' : 'Before this window') : 'Add dates to schedule'}</span>}</div></div>
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
