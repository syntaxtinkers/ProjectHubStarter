import { useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent, CSSProperties } from 'react'
import {
  Activity, ArrowLeft, CalendarDays, Check, ChevronDown, CircleHelp, Command, FolderKanban,
  LayoutDashboard, LogOut, MessageCircle, Plus, Search, Settings2, ShieldCheck, Users, X,
  LockKeyhole, Eye, Pencil, LoaderCircle, ListTodo, GanttChartSquare, Palette, Trash2,
  CircleCheck, Clock3, AlertCircle, RefreshCw, UserPlus, SlidersHorizontal, Filter, FileDown, ChevronUp,
  Building2, Mail, Upload, Save, Link2, Unlink, UserCheck, CalendarRange, ArrowUpRight
} from 'lucide-react'
import { isConfigured, supabase } from './lib/supabase'
import CalendarView from './CalendarView'
import { exportProjectExcel } from './exportProjectExcel'
import { exportProjectPdf } from './exportProjectPdf'

type Project = { id: string; name: string; description: string | null; created_at: string; role?: Role }
type Comment = { id: string; body: string; created_at: string; user_id: string }
type Role = 'owner' | 'editor' | 'commenter' | 'viewer'
type TaskStatus = 'todo' | 'in_progress' | 'done'
type Stage = { id: string; project_id: string; name: string; description: string | null; start_date: string | null; end_date: string | null; assigned_to_user_id?: string | null; assigned_by_user_id?: string | null; sort_order?: number; created_by: string; created_at: string }
type Task = { id: string; project_id: string; stage_id: string; title: string; description: string | null; status: TaskStatus; priority: string; start_date: string | null; due_date: string | null; sort_order?: number; assigned_to: string | null; assigned_by_name?: string | null; assigned_to_name?: string | null; assigned_to_user_id?: string | null; assigned_by_user_id?: string | null; custom_fields?: Record<string, string> | null; created_by: string; created_at: string }
type TaskCustomField = { id: string; project_id: string; name: string; sort_order: number; created_by: string; created_at: string }
type Member = { user_id: string; role: Role; joined_at: string; email?: string }
type CompanyRole = 'admin' | 'employee'
type CompanyTheme = { preset: string; bg: string; panel: string; panel2: string; text: string; muted: string; border: string; accent: string; accent2: string }
type Company = { id: string; name: string; slug: string; logo_url: string | null; theme: CompanyTheme; created_by: string; role?: CompanyRole }
type CompanyMember = { user_id: string; email: string; full_name: string; role: CompanyRole; job_title: string | null; phone_e164?: string | null; whatsapp_opted_in?: boolean; joined_at: string }
type CompanyProjectRow = { project_id: string; project_name: string; project_description: string | null; stage_id: string | null; stage_name: string | null; stage_start: string | null; stage_end: string | null; stage_order: number; assigned_employees: string[] }
type CompanyAssignment = { company_id: string; project_id: string; user_id: string; assigned_by: string; assigned_at: string }
type AttendanceRecord = { id: string; company_id: string; user_id: string; attendance_date: string; work_mode: 'office' | 'work_from_home'; work_location?: 'office'|'site'|'home'; started_at: string; editable_until: string; frozen_at: string | null; ended_at?: string|null; paused_at?: string|null; paused_seconds?: number; work_state?: 'working'|'paused'|'ended' }
type CompanyLeaveRecord = { id: string; company_id: string; user_id: string; start_date: string; end_date: string; reason: string | null; status: 'active' | 'cancelled'; approval_status?: 'pending'|'approved'|'rejected'; approved_by?: string|null; decision_at?: string|null; approval_note?: string|null; created_at: string; updated_at: string }
type AttendanceScheduleRow = { user_id: string; employee_name: string; employee_email: string; attendance_date: string; attendance_status: 'working' | 'on_leave' | 'not_signed_in'; work_mode: string | null; started_at: string | null; editable_until: string | null; is_frozen: boolean; leave_start: string | null; leave_end: string | null; leave_reason: string | null }
type CompanyWhatsAppSettings = { company_id: string; group_name: string; group_id: string; enabled: boolean; timezone: string; updated_by: string | null; updated_at: string }
type CompanyWeeklyMetric = { user_id:string; employee_name:string; role:string; total_work:number; completed_work:number; completion_percent:number }
type Tab = 'home' | 'overview' | 'stages' | 'stage_detail' | 'calendar' | 'team' | 'discussion' | 'company' | 'attendance' | 'settings'

const roleLabels: Record<Role, string> = { owner: 'Owner / Main editor', editor: 'Editor', commenter: 'Commenter', viewer: 'Viewer' }
const colors = ['violet', 'blue', 'mint', 'orange']
const canEdit = (r?: Role) => r === 'owner' || r === 'editor'
const canComment = (r?: Role) => r === 'owner' || r === 'editor' || r === 'commenter'
const initialPrefs = { bg: '#0b1020', panel: '#11182b', text: '#e9edf7', accent: '#9a8cff', fontSize: '14', mode: 'dark' }
const themePresets: Record<string, CompanyTheme> = {
  'blue-night': { preset: 'blue-night', bg: '#0b1020', panel: '#11182b', panel2: '#151e33', text: '#e9edf7', muted: '#8792ad', border: '#252f46', accent: '#9a8cff', accent2: '#7766f7' },
  'orange-light': { preset: 'orange-light', bg: '#f4f6f9', panel: '#ffffff', panel2: '#edf1f6', text: '#202b3d', muted: '#677489', border: '#d8dfeb', accent: '#e77727', accent2: '#bd5515' },
  'orange-noir': { preset: 'orange-noir', bg: '#111315', panel: '#1a1d20', panel2: '#24282c', text: '#f3f2ef', muted: '#a3a5a7', border: '#373c40', accent: '#ff8a30', accent2: '#d96617' },
  'crimson-graphite': { preset: 'crimson-graphite', bg: '#111315', panel: '#1b1d21', panel2: '#25282d', text: '#f3f1f2', muted: '#aaa4ac', border: '#3a353d', accent: '#e34b5f', accent2: '#b82d43' },
  'emerald-slate': { preset: 'emerald-slate', bg: '#0c1717', panel: '#132323', panel2: '#1b3030', text: '#e8f4f0', muted: '#90aaa1', border: '#29423d', accent: '#3dc49b', accent2: '#208d75' },
  'violet-neon': { preset: 'violet-neon', bg: '#100d1e', panel: '#1a1630', panel2: '#282044', text: '#f0edff', muted: '#a19abf', border: '#3a315a', accent: '#c084fc', accent2: '#8b5cf6' }
}
const defaultCompanyTheme = themePresets['blue-night']

export default function App() {
  const [session, setSession] = useState<any>(null)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [loading, setLoading] = useState(true)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [authMode, setAuthMode] = useState<'signin' | 'signup' | 'forgot' | 'reset' | 'google'>(() => new URLSearchParams(window.location.search).get('reset') === '1' ? 'reset' : 'signin')
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
  const [stageAssigneeId, setStageAssigneeId] = useState('')
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
  const [taskAssigneeId, setTaskAssigneeId] = useState('')
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<Role>('editor')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [tab, setTab] = useState<Tab>('home')
  const [taskFilter, setTaskFilter] = useState<'all' | TaskStatus>('all')
  const [prefs, setPrefs] = useState(initialPrefs)
  const [profileName, setProfileName] = useState('')
  const [companies, setCompanies] = useState<Company[]>([])
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(null)
  const [companyMembers, setCompanyMembers] = useState<CompanyMember[]>([])
  const [companyRows, setCompanyRows] = useState<CompanyProjectRow[]>([])
  const [companyAssignments, setCompanyAssignments] = useState<CompanyAssignment[]>([])
  const [companySlug, setCompanySlug] = useState(() => new URLSearchParams(window.location.search).get('company') ?? '')
  const [invitedBrand, setInvitedBrand] = useState<Company | null>(null)
  const [companyCreateName, setCompanyCreateName] = useState('')
  const [companyCreateSlug, setCompanyCreateSlug] = useState('')
  const [companyCreateLogo, setCompanyCreateLogo] = useState<File | null>(null)
  const [companyInviteEmail, setCompanyInviteEmail] = useState('')
  const [companyInviteRole, setCompanyInviteRole] = useState<CompanyRole>('employee')
  const [linkProjectId, setLinkProjectId] = useState('')
  const [assignProjectId, setAssignProjectId] = useState('')
  const [assignEmployeeId, setAssignEmployeeId] = useState('')

  const selectedCompany = companies.find(company => company.id === selectedCompanyId) ?? null
  const displayCompany = session?.user ? selectedCompany : invitedBrand
  const isCompanyAdmin = selectedCompany?.role === 'admin'
  const selected = projects.find(p => p.id === selectedId) ?? null
  const selectedStage = stages.find(s => s.id === selectedStageId) ?? null
  const selectedStageTasks = tasks.filter(t => t.stage_id === selectedStageId)
  const filteredProjects = useMemo(() => projects.filter(p =>
    `${p.name} ${p.description ?? ''}`.toLowerCase().includes(search.toLowerCase())
  ), [projects, search])
  const activeTheme = (displayCompany?.theme ? { ...defaultCompanyTheme, ...displayCompany.theme } : {
    ...defaultCompanyTheme, bg: prefs.bg, panel: prefs.panel, panel2: prefs.panel, text: prefs.text, accent: prefs.accent,
    accent2: prefs.accent, muted: '#8792ad', border: '#252f46'
  }) as CompanyTheme
  const themeStyle = {
    '--bg': activeTheme.bg, '--panel': activeTheme.panel, '--panel2': activeTheme.panel2, '--line': activeTheme.border,
    '--muted': activeTheme.muted, '--text': activeTheme.text, '--purple': activeTheme.accent, '--purple2': activeTheme.accent2,
    '--company-bg': activeTheme.bg, '--company-panel': activeTheme.panel, '--company-panel2': activeTheme.panel2,
    '--company-text': activeTheme.text, '--company-muted': activeTheme.muted, '--company-border': activeTheme.border,
    '--company-accent': activeTheme.accent, '--company-accent2': activeTheme.accent2, fontSize: `${prefs.fontSize}px`
  } as CSSProperties

  useEffect(() => {
    const brandName = displayCompany?.name?.trim()
    document.title = brandName ? `${brandName} · Project Hub` : 'CKPC Project Hub'
    let icon = document.querySelector<HTMLLinkElement>('link[rel~="icon"]')
    if (!icon) {
      icon = document.createElement('link')
      icon.rel = 'icon'
      document.head.appendChild(icon)
    }
    icon.href = displayCompany?.logo_url || 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"%3E%3Crect width="64" height="64" rx="14" fill="%239a8cff"/%3E%3Cpath d="M18 18h28v7H25v14h21v7H18z" fill="white"/%3E%3C/svg%3E'
  }, [displayCompany?.name, displayCompany?.logo_url])

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
    const { data: listener } = supabase.auth.onAuthStateChange((event, next) => { setSession(next); if (event === 'PASSWORD_RECOVERY') setAuthMode('reset') })
    return () => listener.subscription.unsubscribe()
  }, [])
  useEffect(() => {
    if (session?.user) { void loadProjects(); void loadCompanies() }
    else {
      setProjects([]); setStages([]); setTasks([]); setTaskFields([]); setSelectedStageId(null); setSelectedId(null)
      setCompanies([]); setCompanyMembers([]); setCompanyRows([]); setCompanyAssignments([]); setSelectedCompanyId(null)
    }
  }, [session?.user?.id])
  useEffect(() => {
    if (selectedCompany?.slug) setCompanySlug(selectedCompany.slug)
  }, [selectedCompany?.id])
  useEffect(() => {
    if (!session?.user && !new URLSearchParams(window.location.search).get('company')) {
      setCompanySlug('')
      setInvitedBrand(null)
    }
  }, [session?.user?.id])
  useEffect(() => {
    if (!supabase || !companySlug) { setInvitedBrand(null); return }
    let alive = true
    supabase.rpc('get_company_branding', { p_slug: companySlug }).then(({ data, error }) => {
      if (!alive) return
      if (error) { setAuthMessage(error.message); return }
      const row = Array.isArray(data) ? data[0] : data
      if (row) setInvitedBrand({ ...row, theme: { ...defaultCompanyTheme, ...(row.theme ?? {}) } } as Company)
      else setInvitedBrand(null)
    })
    return () => { alive = false }
  }, [companySlug])
  useEffect(() => {
    if (selectedCompanyId && session?.user) void loadCompanyData(selectedCompanyId)
    else { setCompanyMembers([]); setCompanyRows([]); setCompanyAssignments([]) }
  }, [selectedCompanyId, session?.user?.id])
  useEffect(() => {
    if (selectedId && session?.user) void loadProjectData(selectedId)
    else { setComments([]); setStages([]); setTasks([]); setMembers([]); setSelectedStageId(null); setStageComments([]); setTaskComments([]) }
  }, [selectedId, session?.user?.id])

  async function loadCompanies() {
    if (!supabase || !session?.user) return
    const { error: acceptError } = await supabase.rpc('accept_company_invitations')
    if (acceptError && !acceptError.message.toLowerCase().includes('does not exist')) setNotice('Company invitations: ' + acceptError.message)
    const { data: memberships, error: membershipError } = await supabase.from('company_members').select('company_id,role').eq('user_id', session.user.id)
    if (membershipError) { setNotice('Could not load company memberships: ' + membershipError.message); return }
    const ids = (memberships ?? []).map((m: any) => m.company_id as string)
    if (!ids.length) { setCompanies([]); setSelectedCompanyId(null); return }
    const { data, error } = await supabase.from('companies').select('id,name,slug,logo_url,theme,created_by,created_at,updated_at').in('id', ids).order('created_at', { ascending: true })
    if (error) { setNotice('Could not load companies: ' + error.message); return }
    const rows = (data ?? []).map((company: any) => ({
      ...company, role: (memberships ?? []).find((m: any) => m.company_id === company.id)?.role,
      theme: { ...defaultCompanyTheme, ...(company.theme ?? {}) }
    })) as Company[]
    setCompanies(rows)
    setSelectedCompanyId(current => {
      if (current && rows.some(company => company.id === current)) return current
      const fromInvite = rows.find(company => company.slug === companySlug)
      let storedWorkspace = ''
      try { storedWorkspace = localStorage.getItem('projecthub-selected-workspace-id') ?? '' } catch { /* ignore storage */ }
      const fromStored = rows.find(company => company.id === storedWorkspace)
      if (fromInvite) return fromInvite.id
      if (storedWorkspace === 'personal') return null
      return fromStored?.id ?? rows[0]?.id ?? null
    })
  }
  async function loadCompanyData(companyId: string) {
    if (!supabase || !session?.user) return
    const [membersResult, projectsResult, assignmentResult] = await Promise.all([
      supabase.rpc('get_company_members', { p_company_id: companyId }),
      supabase.rpc('get_company_profile_projects', { p_company_id: companyId }),
      supabase.from('company_project_assignments').select('*').eq('company_id', companyId)
    ])
    if (membersResult.error) setNotice('Could not load employee details: ' + membersResult.error.message)
    else {
      let contacts: {user_id:string;phone_e164:string;whatsapp_opted_in:boolean}[]=[]
      if (companies.find(company=>company.id===companyId)?.role==='admin') {
        const {data:contactRows,error:contactError}=await supabase.from('company_member_contacts').select('user_id,phone_e164,whatsapp_opted_in').eq('company_id',companyId)
        if (contactError) setNotice('Employee WhatsApp numbers need the weekly_work_dashboard.sql migration: '+contactError.message)
        else contacts=(contactRows??[]) as {user_id:string;phone_e164:string;whatsapp_opted_in:boolean}[]
      }
      setCompanyMembers(((membersResult.data ?? []) as CompanyMember[]).map(member=>({...member,phone_e164:contacts.find(contact=>contact.user_id===member.user_id)?.phone_e164??null,whatsapp_opted_in:contacts.find(contact=>contact.user_id===member.user_id)?.whatsapp_opted_in??false})))
    }
    if (projectsResult.error) setNotice('Could not load company deadlines: ' + projectsResult.error.message)
    else setCompanyRows((projectsResult.data ?? []) as CompanyProjectRow[])
    if (assignmentResult.error) setNotice('Could not load assignments: ' + assignmentResult.error.message)
    else setCompanyAssignments((assignmentResult.data ?? []) as CompanyAssignment[])
  }
  async function createCompany(e: FormEvent) {
    e.preventDefault()
    if (!supabase || !session?.user || !companyCreateName.trim() || !companyCreateSlug.trim()) return
    if (companyCreateLogo && (!companyCreateLogo.type.startsWith('image/') || companyCreateLogo.size > 3 * 1024 * 1024)) {
      setNotice('Choose an image file no larger than 3 MB for the company logo.')
      return
    }
    setBusy(true); setNotice('')
    const { data, error } = await supabase.rpc('create_company', { p_name: companyCreateName.trim(), p_slug: companyCreateSlug.trim().toLowerCase(), p_logo_url: null })
    if (error) setNotice('Could not create company: ' + error.message)
    else {
      let logoWarning = ''
      const newCompanyId = data as string
      if (companyCreateLogo && newCompanyId) {
        const safeName = companyCreateLogo.name.replace(/[^a-zA-Z0-9._-]/g, '-')
        const path = `${newCompanyId}/${Date.now()}-${safeName}`
        const { error: uploadError } = await supabase.storage.from('company-logos').upload(path, companyCreateLogo, { upsert: true, contentType: companyCreateLogo.type })
        if (uploadError) logoWarning = ' Company was created, but logo upload failed: ' + uploadError.message
        else {
          const { data: publicLogo } = supabase.storage.from('company-logos').getPublicUrl(path)
          const { error: logoError } = await supabase.from('companies').update({ logo_url: publicLogo.publicUrl, updated_at: new Date().toISOString() }).eq('id', newCompanyId)
          if (logoError) logoWarning = ' Company was created, but logo saving failed: ' + logoError.message
        }
      }
      setCompanyCreateName(''); setCompanyCreateSlug(''); setCompanyCreateLogo(null)
      await loadCompanies()
      if (data) {
        setSelectedCompanyId(data as string)
        try { localStorage.setItem('projecthub-selected-workspace-id', data as string) } catch { /* ignore storage */ }
      }
      setTab('company')
      setNotice('Company created. You are its first admin. Your existing projects remain personal until you link them.' + logoWarning)
    }
    setBusy(false)
  }
  async function saveCompanyProfile(patch: Partial<Pick<Company, 'name' | 'logo_url' | 'theme'>>) {
    if (!supabase || !selectedCompany || !isCompanyAdmin) return
    setBusy(true); setNotice('')
    const { error } = await supabase.from('companies').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', selectedCompany.id)
    if (error) setNotice('Could not update company profile: ' + error.message)
    else { await loadCompanies(); await loadCompanyData(selectedCompany.id); setNotice('Company profile saved for all company members.') }
    setBusy(false)
  }
  async function uploadCompanyLogo(file: File) {
    if (!supabase || !selectedCompany || !isCompanyAdmin) return
    if (!file.type.startsWith('image/')) { setNotice('Choose an image file for the company logo.'); return }
    if (file.size > 3 * 1024 * 1024) { setNotice('Logo must be 3 MB or smaller.'); return }
    setBusy(true)
    const path = `${selectedCompany.id}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '-')}`
    const { error } = await supabase.storage.from('company-logos').upload(path, file, { upsert: true, contentType: file.type })
    if (error) { setNotice('Could not upload logo: ' + error.message); setBusy(false); return }
    const { data } = supabase.storage.from('company-logos').getPublicUrl(path)
    await saveCompanyProfile({ logo_url: data.publicUrl })
    setBusy(false)
  }
  async function inviteCompanyMember(e: FormEvent) {
    e.preventDefault()
    if (!supabase || !selectedCompany || !isCompanyAdmin || !companyInviteEmail.trim()) return
    setBusy(true); setNotice('')
    const { data, error } = await supabase.functions.invoke('invite-company-member', {
      body: { company_id: selectedCompany.id, email: companyInviteEmail.trim().toLowerCase(), role: companyInviteRole, redirect_to: `${window.location.origin}${window.location.pathname}?company=${encodeURIComponent(selectedCompany.slug)}` }
    })
    if (error) setNotice('Could not send company invitation: ' + error.message + '. The invite function and email provider must be deployed/configured.')
    else if (data?.error) setNotice('Could not send company invitation: ' + data.error)
    else { setCompanyInviteEmail(''); await loadCompanyData(selectedCompany.id); setNotice(data?.message ?? 'Company invitation email sent.') }
    setBusy(false)
  }
  async function linkProjectToCompany() {
    if (!supabase || !selectedCompany || !isCompanyAdmin || !linkProjectId) return
    setBusy(true); setNotice('')
    const { error } = await supabase.rpc('link_company_project', { p_company_id: selectedCompany.id, p_project_id: linkProjectId })
    if (error) setNotice('Could not link project: ' + error.message)
    else { setLinkProjectId(''); await loadCompanyData(selectedCompany.id); setNotice('Project linked to the company. Its saved data has not been moved or changed.') }
    setBusy(false)
  }
  async function unlinkProjectFromCompany(projectId: string) {
    if (!supabase || !selectedCompany || !isCompanyAdmin) return
    const name = companyRows.find(row => row.project_id === projectId)?.project_name ?? 'this project'
    if (!confirm(`Remove ${name} from the company profile? This only removes the company link; the personal project and its data remain intact.`)) return
    const { error } = await supabase.rpc('unlink_company_project', { p_company_id: selectedCompany.id, p_project_id: projectId })
    if (error) setNotice('Could not unlink project: ' + error.message)
    else { await loadCompanyData(selectedCompany.id); setNotice('Project unlinked from this company; project data remains unchanged.') }
  }
  async function assignCompanyProject() {
    if (!supabase || !selectedCompany || !isCompanyAdmin || !assignProjectId || !assignEmployeeId) return
    setBusy(true); setNotice('')
    const { error } = await supabase.from('company_project_assignments').upsert({
      company_id: selectedCompany.id, project_id: assignProjectId, user_id: assignEmployeeId, assigned_by: session.user.id
    }, { onConflict: 'company_id,project_id,user_id' })
    if (error) setNotice('Could not assign employee: ' + error.message)
    else { await loadCompanyData(selectedCompany.id); setNotice('Employee assigned to the project.') }
    setBusy(false)
  }
  async function updateCompanyMember(member: CompanyMember, patch: Partial<Pick<CompanyMember, 'role' | 'full_name' | 'job_title' | 'phone_e164' | 'whatsapp_opted_in'>>) {
    if (!supabase || !selectedCompany || !isCompanyAdmin) return
    const { phone_e164, whatsapp_opted_in, ...profilePatch } = patch
    if (member.user_id === session.user.id && Object.keys(profilePatch).length) return
    if (Object.keys(profilePatch).length) {
      const { error } = await supabase.from('company_members').update(profilePatch).eq('company_id', selectedCompany.id).eq('user_id', member.user_id)
      if (error) { setNotice('Could not update employee: ' + error.message); return }
    }
    if (phone_e164 !== undefined || whatsapp_opted_in !== undefined) {
      const phone = (phone_e164 !== undefined ? (phone_e164 ?? '') : (member.phone_e164 ?? '')).trim()
      if (phone && !/^\+[1-9][0-9]{7,14}$/.test(phone)) { setNotice('Enter the WhatsApp number in international E.164 format, e.g. +919876543210.'); return }
      const result = phone
        ? await supabase.from('company_member_contacts').upsert({company_id:selectedCompany.id,user_id:member.user_id,phone_e164:phone,whatsapp_opted_in:whatsapp_opted_in ?? member.whatsapp_opted_in ?? false,updated_by:session.user.id,updated_at:new Date().toISOString()},{onConflict:'company_id,user_id'})
        : await supabase.from('company_member_contacts').delete().eq('company_id',selectedCompany.id).eq('user_id',member.user_id)
      if (result.error) { setNotice('Could not save WhatsApp number: '+result.error.message); return }
    }
    await loadCompanyData(selectedCompany.id); setNotice('Employee details updated.')
  }
  async function removeCompanyMember(member: CompanyMember) {
    if (!supabase || !selectedCompany || !isCompanyAdmin || member.user_id === session.user.id) return
    if (!confirm(`Remove ${member.full_name} from ${selectedCompany.name}? Project records and deadlines will remain intact.`)) return
    const { error } = await supabase.from('company_members').delete().eq('company_id', selectedCompany.id).eq('user_id', member.user_id)
    if (error) setNotice('Could not remove employee: ' + error.message)
    else { await loadCompanyData(selectedCompany.id); setNotice('Company membership removed. Project data was not deleted.') }
  }
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
    if (authMode === 'forgot') {
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}${window.location.pathname}${companySlug ? `?company=${encodeURIComponent(companySlug)}&reset=1` : '?reset=1'}` })
      setAuthMessage(error ? error.message : 'If an account exists for this email, a password-reset link has been sent. Check your email inbox.')
    } else if (authMode === 'reset') {
      const { error } = await supabase.auth.updateUser({ password })
      if (error) setAuthMessage(error.message)
      else { await supabase.auth.signOut(); setPassword(''); setAuthMode('signin'); setAuthMessage('Password updated. You can now sign in with your new password.') }
    } else if (authMode === 'google') {
      const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.href } })
      if (error) setAuthMessage(error.message)
    } else {
      const result = authMode === 'signin' ? await supabase.auth.signInWithPassword({ email, password }) : await supabase.auth.signUp({ email, password, options: { emailRedirectTo: window.location.href } })
      if (result.error) setAuthMessage(result.error.message)
      else if (authMode === 'signup' && !result.data.session) setAuthMessage('Account created. Check your email to confirm it, then sign in.')
    }
    setBusy(false)
  }
  async function startGoogleSignIn() {
    if (!supabase) return
    setBusy(true); setAuthMessage('')
    const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.href } })
    if (error) { setAuthMessage(error.message); setBusy(false) }
  }
  async function createProject(e: FormEvent) {
    e.preventDefault(); if (!supabase || !session?.user || !projectName.trim()) return
    setBusy(true); setNotice('')
    const { data, error } = await supabase.rpc('create_project', { project_name: projectName.trim(), project_description: projectDescription.trim() || null })
    if (error) setNotice(error.message)
    else { setProjectName(''); setProjectDescription(''); setShowCreate(false); await loadProjects(); if (data) setSelectedId(data); setTab('stages'); setNotice('Project created.') }
    setBusy(false)
  }
  async function duplicateProject() {
    if (!supabase || !session?.user || !selected || !canEdit(selected.role)) return
    const proposed = prompt('Name for the duplicated project', selected.name + ' (Copy)')
    if (proposed === null || !proposed.trim()) return
    setBusy(true); setNotice('')
    try {
      const { data: newProjectId, error: projectError } = await supabase.rpc('create_project', { project_name: proposed.trim(), project_description: selected.description })
      if (projectError || !newProjectId) throw projectError ?? new Error('Could not create the duplicate project.')
      const stageMap = new Map<string,string>()
      for (const stage of stages) {
        const { data, error } = await supabase.from('project_stages').insert({ project_id:newProjectId, name:stage.name, description:stage.description, start_date:stage.start_date, end_date:stage.end_date, sort_order:stage.sort_order ?? 0, created_by:session.user.id }).select('id').single()
        if (error) throw error
        stageMap.set(stage.id,data.id)
      }
      if (tasks.length) {
        const rows=tasks.map(task=>({ project_id:newProjectId, stage_id:stageMap.get(task.stage_id), title:task.title, description:task.description, status:task.status, priority:task.priority, start_date:task.start_date, due_date:task.due_date, assigned_to:task.assigned_to, assigned_by_name:task.assigned_by_name ?? null, assigned_to_name:task.assigned_to_name ?? null, custom_fields:task.custom_fields ?? {}, sort_order:task.sort_order ?? 0, created_by:session.user.id }))
        const { error } = await supabase.from('project_tasks').insert(rows)
        if (error) throw error
      }
      if (taskFields.length) {
        const { error } = await supabase.from('project_task_custom_fields').insert(taskFields.map(field=>({project_id:newProjectId,name:field.name,sort_order:field.sort_order,created_by:session.user.id})))
        if (error) throw error
      }
      await loadProjects()
      setSelectedId(newProjectId); await loadProjectData(newProjectId); setTab('stages')
      setNotice('Project duplicated with its stages, tasks, dates, assignment fields, and custom columns. Existing project data was not changed.')
    } catch (error:any) {
      setNotice('Project duplication stopped: '+(error?.message ?? 'Unknown error')+'. The original project has not been changed. Check whether a partially created copy needs removing.')
    } finally { setBusy(false) }
  }
  async function removeProjectFromWorkspace() {
    if (!supabase || !session?.user || !selected || !canEdit(selected.role)) return
    const projectNameToRemove = selected.name
    if (!confirm(`WARNING 1 OF 3: Remove “${projectNameToRemove}” from your project list? This will remove only your access. The project, stages, tasks, comments, custom columns, and all saved input data will remain in the database and other members' access will not be changed.`)) return
    if (!confirm(`WARNING 2 OF 3: You will no longer see “${projectNameToRemove}” in this workspace after removal. This action does NOT delete project data, but restoring your access may require another project member or database administrator.`)) return
    const typedName = prompt(`FINAL WARNING 3 OF 3: To confirm removal, type the project name exactly:\n\n${projectNameToRemove}`)
    if (typedName !== projectNameToRemove) { setNotice('Project removal cancelled: the name did not match.'); return }
    setBusy(true)
    const { error } = await supabase.from('project_members').delete().eq('project_id', selected.id).eq('user_id', session.user.id)
    if (error) {
      setNotice('Could not remove project from your workspace: ' + error.message)
    } else {
      setSelectedId(null)
      setSelectedStageId(null)
      setTab('home')
      await loadProjects()
      setNotice(`“${projectNameToRemove}” was removed from your project list. No project, task, stage, comment, or custom-field data was deleted.`)
    }
    setBusy(false)
  }
  async function addComment(e: FormEvent) {
    e.preventDefault(); if (!supabase || !session?.user || !selected || !commentText.trim()) return
    setBusy(true)
    const { error } = await supabase.from('project_comments').insert({ project_id: selected.id, user_id: session.user.id, body: commentText.trim() })
    if (error) setNotice(error.message); else { setCommentText(''); await loadProjectData(selected.id) }
    setBusy(false)
  }
  function openNewStage() { setEditingStage(null); setStageName(''); setStageDescription(''); setStageStart(''); setStageEnd(''); setStageAssigneeId(session?.user?.id ?? ''); setShowStage(true) }
  function openEditStage(stage: Stage) { setEditingStage(stage); setStageName(stage.name); setStageDescription(stage.description ?? ''); setStageStart(stage.start_date ?? ''); setStageEnd(stage.end_date ?? ''); setStageAssigneeId(stage.assigned_to_user_id ?? ''); setShowStage(true) }
  async function renameStageOnly(stage: Stage) {
    if (!supabase || !selected || !canEdit(selected.role)) return
    const nextName = prompt('Edit stage name', stage.name)
    if (nextName === null || !nextName.trim() || nextName.trim() === stage.name) return
    const { error } = await supabase.from('project_stages').update({ name: nextName.trim() }).eq('id', stage.id).eq('project_id', selected.id)
    if (error) setNotice('Could not rename stage: ' + error.message)
    else { setStages(current => current.map(item => item.id === stage.id ? { ...item, name: nextName.trim() } : item)); setNotice('Stage name updated.') }
  }
  async function saveStage(e: FormEvent) {
    e.preventDefault(); if (!supabase || !selected || !session?.user || !canEdit(selected.role) || !stageName.trim()) return
    setBusy(true); setNotice('')
    if (stageStart && stageEnd && stageEnd < stageStart) { setNotice('Stage end date cannot be earlier than its start date.'); setBusy(false); return }
    if (editingStage) {
      const outside = tasks.filter(task => task.stage_id === editingStage.id && ((stageStart && ((task.start_date && task.start_date < stageStart) || (task.due_date && task.due_date < stageStart))) || (stageEnd && ((task.start_date && task.start_date > stageEnd) || (task.due_date && task.due_date > stageEnd)))))
      if (outside.length) { setNotice('Adjust existing task dates before narrowing this stage range.'); setBusy(false); return }
    }
    const payload = { name: stageName.trim(), description: stageDescription.trim() || null, start_date: stageStart || null, end_date: stageEnd || null, assigned_to_user_id: stageAssigneeId || session.user.id, assigned_by_user_id: editingStage && editingStage.assigned_to_user_id === (stageAssigneeId || session.user.id) ? (editingStage.assigned_by_user_id ?? session.user.id) : session.user.id, sort_order: editingStage?.sort_order ?? (stages.length ? Math.max(...stages.map(s => s.sort_order ?? -1)) + 1 : 0) }
    const result = editingStage ? await supabase.from('project_stages').update(payload).eq('id', editingStage.id).select('id').single() : await supabase.from('project_stages').insert({ ...payload, project_id: selected.id, created_by: session.user.id }).select('id').single()
    if (result.error) setNotice(`Could not save stage: ${result.error.message}`)
    else { setShowStage(false); setEditingStage(null); await loadProjectData(selected.id); setNotice(editingStage ? 'Stage updated.' : 'Stage created.') }
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
  function openCreateTask(stageId: string) { setEditingTask(null); setTaskStageId(stageId); setTaskTitle(''); setTaskDescription(''); setTaskPriority('normal'); setTaskStatus('todo'); setTaskStart(''); setTaskDue(''); setTaskAssigneeId(session?.user?.id ?? ''); setTaskCommentText(''); setShowTask(true) }
  function openEditTask(task: Task) { setEditingTask(task); setTaskStageId(task.stage_id); setTaskTitle(task.title); setTaskDescription(task.description ?? ''); setTaskPriority(task.priority); setTaskStatus(task.status); setTaskStart(task.start_date ?? ''); setTaskDue(task.due_date ?? ''); setTaskAssigneeId(task.assigned_to_user_id ?? session?.user?.id ?? ''); setTaskCommentText(''); setShowTask(true) }
  async function saveTask(e: FormEvent) {
    e.preventDefault(); if (!supabase || !session?.user || !selected || !canEdit(selected.role) || !taskTitle.trim()) return
    if (!taskStageId || !stages.some(stage => stage.id === taskStageId)) { setNotice('Create or select a stage before adding tasks.'); return }
    if (taskStart && taskDue && taskDue < taskStart) { setNotice('End date cannot be earlier than start date.'); return }
    const parentStage = stages.find(stage => stage.id === taskStageId)
    if (parentStage?.start_date && ((taskStart && taskStart < parentStage.start_date) || (taskDue && taskDue < parentStage.start_date))) { setNotice('Task dates cannot be before the stage start date (' + parentStage.start_date + ').'); return }
    if (parentStage?.end_date && ((taskStart && taskStart > parentStage.end_date) || (taskDue && taskDue > parentStage.end_date))) { setNotice('Task dates cannot be after the stage end date (' + parentStage.end_date + ').'); return }
    setBusy(true); setNotice('')
    const assigneeId = taskAssigneeId || session.user.id
    const assigneeMember = members.find(member => member.user_id === assigneeId)
    const assigneeCompanyMember = companyMembers.find(member => member.user_id === assigneeId)
    const currentDisplayName = profileName.trim() || session.user.email?.split('@')[0] || session.user.email || 'You'
    const assigneeDisplayName = assigneeCompanyMember?.full_name || assigneeCompanyMember?.email || (assigneeId === session.user.id ? currentDisplayName : assigneeMember?.email || 'Member ' + assigneeId.slice(0,8))
    const sameAssignment = Boolean(editingTask && editingTask.assigned_to_user_id === assigneeId)
    const payload = { stage_id: taskStageId, project_id: selected.id, title: taskTitle.trim(), description: taskDescription.trim() || null, status: taskStatus, priority: taskPriority, start_date: taskStart || null, due_date: taskDue || null, assigned_to_user_id: assigneeId, assigned_by_user_id: sameAssignment ? (editingTask?.assigned_by_user_id ?? session.user.id) : session.user.id, assigned_to: assigneeDisplayName, assigned_to_name: assigneeDisplayName, assigned_by_name: sameAssignment ? (editingTask?.assigned_by_name ?? currentDisplayName) : currentDisplayName, sort_order: editingTask?.sort_order ?? (tasks.filter(t => t.stage_id === taskStageId).length ? Math.max(...tasks.filter(t => t.stage_id === taskStageId).map(t => t.sort_order ?? -1)) + 1 : 0) }
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
  async function createStageInline(draft:{name:string;start_date:string;end_date:string;description:string;assigned_to_user_id?:string;week_offset?:number}) {
    if(!supabase||!selected||!session?.user||!canEdit(selected.role))return false
    const name=draft.name.trim();if(!name){setNotice('Enter a stage name before saving.');return false}
    if(draft.start_date&&draft.end_date&&draft.end_date<draft.start_date){setNotice('Stage end date cannot be earlier than its start date.');return false}
    const order=stages.length?Math.max(...stages.map(s=>s.sort_order??-1))+1:0
    const dates = draft.week_offset !== undefined && draft.week_offset >= 0 ? getStageWeekDates(draft.week_offset) : {start:draft.start_date,end:draft.end_date}
    const {error}=await supabase.from('project_stages').insert({project_id:selected.id,name,description:draft.description.trim()||null,start_date:dates.start||null,end_date:dates.end||null,assigned_to_user_id:draft.assigned_to_user_id||session.user.id,assigned_by_user_id:session.user.id,sort_order:order,created_by:session.user.id})
    if(error){setNotice('Could not create stage: '+error.message);return false}
    await loadProjectData(selected.id);setNotice('Stage created.');return true
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
    const currentDisplayName=profileName.trim()||session.user.email?.split('@')[0]||session.user.email||'You'
    const toName=draft.assigned_to_name.trim()||currentDisplayName
    const byName=draft.assigned_by_name.trim()||currentDisplayName
    const explicitlyNamedAssignee=Boolean(draft.assigned_to_name.trim())
    const {error}=await supabase.from('project_tasks').insert({project_id:selected.id,stage_id:stageId,title,description:null,start_date:draft.start_date||null,due_date:draft.due_date||null,assigned_by_name:byName,assigned_to_name:toName,assigned_by_user_id:session.user.id,assigned_to_user_id:explicitlyNamedAssignee?null:session.user.id,assigned_to:toName,status:draft.status,priority:draft.priority,custom_fields:draft.custom_fields,sort_order:siblings.length?Math.max(...siblings.map(t=>t.sort_order??-1))+1:0,created_by:session.user.id})
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
    <main className="auth-shell" style={themeStyle}>
      <div className="auth-decoration"><div className="glow glow-a"/><div className="glow glow-b"/><div className="auth-brand">{displayCompany?.logo_url ? <img className="company-logo-mark" src={displayCompany.logo_url} alt="" /> : <div className="brand-mark"><Command size={21}/></div>}<span>{displayCompany?.name ?? 'CKPC'} <span className="accent">Project Hub</span></span></div><div className="auth-pitch"><span className="eyebrow">ONE SPACE. EVERY PROJECT.</span><h1>Good work happens<br/><span>together.</span></h1><p>{displayCompany ? `The shared workspace for ${displayCompany.name}'s projects, people, and deadlines.` : "A calmer workspace for your team's projects, conversations, and ideas."}</p><div className="feature-pills"><span><ShieldCheck size={14}/> Permission-aware</span><span><Users size={14}/> Made for teams</span></div></div><div className="auth-foot">YOUR TEAM'S WORKSPACE, REIMAGINED</div></div>
      <section className="auth-panel"><div className="mobile-brand">{displayCompany?.logo_url ? <img className="company-logo-mark" src={displayCompany.logo_url} alt="" /> : <div className="brand-mark"><Command size={20}/></div>}<b>{displayCompany?.name ?? 'CKPC'} <span className="accent">Project Hub</span></b></div><div className="auth-card"><span className="eyebrow">{authMode === 'signin' ? 'WELCOME BACK' : authMode === 'signup' ? 'GET STARTED' : authMode === 'forgot' ? 'ACCOUNT RECOVERY' : authMode === 'reset' ? 'CHOOSE A NEW PASSWORD' : 'SECURE SIGN IN'}</span><h2>{authMode === 'signin' ? 'Sign in to your workspace' : authMode === 'signup' ? 'Create your account' : authMode === 'forgot' ? 'Reset your password' : authMode === 'reset' ? 'Set a new password' : 'Continue with Google'}</h2><p className="muted">{authMode === 'signin' ? 'Pick up where your team left off.' : authMode === 'signup' ? 'Set up your account to create your first project.' : authMode === 'forgot' ? 'We will email you a secure password-reset link.' : authMode === 'reset' ? 'Choose a strong new password for your account.' : 'Use your Google account to sign in.'}</p>
      {authMode !== 'google' && <form onSubmit={handleAuth} className="form-stack">{authMode !== 'reset' && <label>Email address<input type="email" name="email" autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@company.com" required disabled={authMode==='forgot'&&busy}/></label>}{(authMode === 'signin' || authMode === 'signup' || authMode === 'reset') && <label>{authMode==='reset'?'New password':'Password'}<input type="password" name="password" autoComplete={authMode === 'signin' ? 'current-password' : 'new-password'} value={password} onChange={e=>setPassword(e.target.value)} placeholder={authMode==='reset'?'At least 8 characters':'At least 8 characters'} minLength={8} required/></label>}<button className="primary full" disabled={busy}>{busy ? 'Please wait…' : authMode === 'signin' ? 'Sign in' : authMode === 'signup' ? 'Create account' : authMode === 'forgot' ? 'Email reset link' : 'Save new password'} <span>→</span></button></form>}
      {authMode === 'signin' && <><button className="outline-button auth-google" onClick={()=>void startGoogleSignIn()} disabled={busy}><span className="google-g">G</span> Continue with Google</button><button className="text-button forgot-link" onClick={()=>{setAuthMode('forgot');setAuthMessage('')}}>Forgot password?</button></>}
      {authMode === 'google' && <button className="primary full" onClick={()=>void startGoogleSignIn()} disabled={busy}>Continue with Google <ArrowUpRight size={15}/></button>}
      {authMessage && <p className="notice">{authMessage}</p>}
      {authMode!=='reset' && <p className="switch-auth">{authMode === 'signup' ? 'Already have an account?' : 'New to ProjectHub?'} <button className="text-button" onClick={()=>{setAuthMode(authMode === 'signup' || authMode==='forgot' || authMode==='google' ? 'signin' : 'signup');setAuthMessage('')}}>{authMode === 'signup' ? 'Sign in' : authMode==='forgot' || authMode==='google' ? 'Sign in' : 'Create an account'}</button></p>}
      {authMode==='reset' && <p className="switch-auth"><button className="text-button" onClick={()=>{setAuthMode('signin');setAuthMessage('')}}>Back to sign in</button></p>}
      <div className="secure-note"><LockKeyhole size={14}/> Your workspace access is protected.</div></div></section>
    </main>
  )

  return <div className={`app-shell ${prefs.mode === 'light' && !displayCompany ? 'light-mode' : ''} ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`} style={themeStyle}>
    <aside className="sidebar">
      <div className="brand">{displayCompany?.logo_url ? <img className="company-logo-mark" src={displayCompany.logo_url} alt="" /> : <div className="brand-mark"><Command size={19}/></div>}<span>{displayCompany?.name ?? 'CKPC'} <span className="accent">Project Hub</span></span><button type="button" className="icon-button collapse" title={sidebarCollapsed?"Expand workspace menu":"Collapse workspace menu"} aria-label={sidebarCollapsed?"Expand workspace menu":"Collapse workspace menu"} onClick={()=>setSidebarCollapsed(v=>!v)}><ChevronDown size={15}/></button></div>
      <div className="workspace-switch"><div className="workspace-avatar">{selectedCompany?.logo_url ? <img className="workspace-company-logo" src={selectedCompany.logo_url} alt="" /> : (session.user.email ?? 'U').slice(0,1).toUpperCase()}</div><div className="workspace-switch-meta"><b>{(selectedCompany?.name ?? profileName) || session.user.email?.split('@')[0] || 'Personal workspace'}</b><small>{selectedCompany ? (selectedCompany.role === 'admin' ? 'Company admin' : 'Company employee') : 'Personal workspace'}</small></div>{companies.length>0&&<select aria-label="Switch workspace" value={selectedCompanyId ?? ''} onChange={e=>{const value=e.target.value||null;setSelectedCompanyId(value);try{localStorage.setItem('projecthub-selected-workspace-id',value??'personal')}catch{/* ignore storage */}}}><option value="">Personal workspace</option>{companies.map(company=><option value={company.id} key={company.id}>{company.name}</option>)}</select>}</div>
      <div className="nav-label">WORKSPACE</div>
      <button className={`nav-item ${tab==='home'?'active':''}`} title="Dashboard — all projects and latest progress" onClick={()=>setTab('home')}><LayoutDashboard size={17}/><span className="nav-item-copy"><b>My dashboard</b><small>Your work and deadlines</small></span></button>
      <button className={`nav-item ${tab==='overview'?'active':''}`} title="Project statistics — completion, task status, and project health" onClick={()=>setTab('overview')}><Activity size={17}/><span className="nav-item-copy"><b>Project statistics</b><small>Progress and performance</small></span></button>
      <button className={`nav-item ${tab==='stages'||tab==='stage_detail'?'active':''}`} title="Project dashboard — edit stages, dates, assignees, and tasks" onClick={()=>setTab('stages')}><ListTodo size={17}/><span className="nav-item-copy"><b>Project dashboard</b><small>Stages, dates, and tasks</small></span><span className="nav-count">{stages.length}</span></button>
      <button className={`nav-item ${tab==='calendar'?'active':''}`} title="Calendar — stage and task deadlines" onClick={()=>setTab('calendar')}><CalendarDays size={17}/><span className="nav-item-copy"><b>Calendar</b><small>Stage and task deadlines</small></span></button>
      <button className={`nav-item ${tab==='team'?'active':''}`} title="Team, access and discussions — people, permissions, comments, and updates" onClick={()=>setTab('team')}><Users size={17}/><span className="nav-item-copy"><b>Teams, access & discussions</b><small>People, permissions, and updates</small></span></button>
      {selectedCompany && <button className={`nav-item ${tab==='company'?'active':''}`} title="Company dashboard — combined project, employee completion, leave, and attendance summary" onClick={()=>setTab('company')}><Building2 size={17}/><span className="nav-item-copy"><b>Company dashboard</b><small>Company-wide projects and people</small></span></button>}
      {selectedCompany && <button className={`nav-item ${tab==='attendance'?'active':''}`} title="Attendance and leave records" onClick={()=>setTab('attendance')}><Clock3 size={17}/><span className="nav-item-copy"><b>{isCompanyAdmin?'Attendance schedule':'My attendance'}</b><small>{isCompanyAdmin?'Team attendance and leave':'Your attendance and leave'}</small></span></button>}
      <button className={`nav-item ${tab==='settings'?'active':''}`} title="Settings — preferences and workspace options" onClick={()=>setTab('settings')}><Settings2 size={17}/><span className="nav-item-copy"><b>Settings</b><small>Preferences and workspace options</small></span></button>
      <div className="project-list-head"><span className="nav-label">YOUR PROJECTS</span><button className="icon-button small" onClick={()=>setShowCreate(true)} title="Create project"><Plus size={16}/></button></div>
      <div className="sidebar-projects">{filteredProjects.slice(0,10).map((p,i)=><button key={p.id} className={`project-nav ${selectedId===p.id?'chosen':''}`} onClick={()=>{setSelectedId(p.id);setTab('stages')}}><span className={`project-dot ${colors[i%colors.length]}`}/><span className="truncate">{p.name}</span></button>)}{filteredProjects.length===0&&<p className="sidebar-empty">No matching projects.</p>}</div>
      <div className="sidebar-bottom"><div className="help-card"><div className="help-icon"><CircleHelp size={17}/></div><b>ProjectHub workspace</b><p>Plan work, coordinate people, and keep updates together.</p></div><div className="profile"><div className="profile-avatar">{(session.user.email ?? 'U').slice(0,1).toUpperCase()}</div><div className="profile-meta"><b>{profileName || session.user.email}</b><small>Signed in</small></div><button className="icon-button" title="Sign out" onClick={signOut}><LogOut size={16}/></button></div></div>
    </aside>
    <main className="main-panel">
      <header className="topbar"><div className="breadcrumbs">{displayCompany?.logo_url && <img className="topbar-company-logo" src={displayCompany.logo_url} alt="" />}<span>{displayCompany?.name ?? 'CKPC'} Project Hub</span><span className="crumb-slash">/</span><b>{tab==='home'?'My dashboard':tab==='company'?'Company dashboard':tab==='attendance'?'Attendance schedule':tab==='settings'?'Settings':tab==='overview'?'Project statistics':tab==='stages'?'Project dashboard':tab==='team'||tab==='discussion'?'Teams, access & discussions':selected?.name ?? 'Dashboard'}</b></div><div className="top-actions">{projects.length>0&&<label className="top-project-picker"><span>Project</span><select aria-label="Select project" value={selectedId??""} onChange={e=>{setSelectedId(e.target.value||null);if(e.target.value)setTab("stages")}}><option value="">Choose project…</option>{projects.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>}<div className="searchbox"><Search size={16}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search projects…"/><kbd>Ctrl K</kbd></div><div className="top-avatar">{(session.user.email ?? 'U').slice(0,1).toUpperCase()}</div></div></header>
      <div className="page-content">
        {notice && <div className="notice-banner"><span>{notice}</span><button className="icon-button" onClick={()=>setNotice('')}><X size={15}/></button></div>}
        {tab==='home' ? <GlobalDashboard projects={projects} currentUserId={session.user.id} currentUserEmail={session.user.email ?? ''} companyMembers={companyMembers} onOpenProject={id=>{setSelectedId(id);setTab('stages')}} onCreateProject={()=>setShowCreate(true)}/> :
        tab==='company' ? (selectedCompany ? <><CompanyDashboardMetrics company={selectedCompany} members={companyMembers} rows={companyRows} isAdmin={isCompanyAdmin}/><CompanyProfile company={selectedCompany} isAdmin={isCompanyAdmin} members={companyMembers} rows={companyRows} assignments={companyAssignments} availableProjects={projects} busy={busy} onSave={saveCompanyProfile} onLogoUpload={uploadCompanyLogo} onInvite={inviteCompanyMember} onLinkProject={linkProjectToCompany} onUnlinkProject={unlinkProjectFromCompany} onAssign={assignCompanyProject} onMemberUpdate={updateCompanyMember} onRemoveMember={removeCompanyMember} linkProjectId={linkProjectId} setLinkProjectId={setLinkProjectId} inviteEmail={companyInviteEmail} setInviteEmail={setCompanyInviteEmail} inviteRole={companyInviteRole} setInviteRole={setCompanyInviteRole} assignProjectId={assignProjectId} setAssignProjectId={setAssignProjectId} assignEmployeeId={assignEmployeeId} setAssignEmployeeId={setAssignEmployeeId}/></> : <section className="panel"><h2>No company selected</h2><p>Create a company from Settings, or accept a company invitation from your email.</p><button className="primary" onClick={()=>setTab('settings')}>Open Settings</button></section>) :
        tab==='attendance' ? (selectedCompany ? <AttendancePage company={selectedCompany} currentUser={session.user} isAdmin={isCompanyAdmin}/> : <section className="panel"><h2>No company selected</h2><p>Select a company first.</p></section>) :
        tab==='settings' ? <><CompanySettings companies={companies} selectedCompanyId={selectedCompanyId} onSelect={setSelectedCompanyId} companyName={companyCreateName} setCompanyName={setCompanyCreateName} companySlug={companyCreateSlug} setCompanySlug={setCompanyCreateSlug} logoFile={companyCreateLogo} setLogoFile={setCompanyCreateLogo} onCreate={createCompany} busy={busy}/><Personalise prefs={prefs} save={savePrefs} profileName={profileName} setProfileName={setProfileName} email={session.user.email ?? ''} companyThemeLocked={Boolean(selectedCompany)} onOpenCompany={()=>setTab('company')}/></> :
        !selected ? <section className="welcome-block"><div className="welcome-icon"><FolderKanban size={24}/></div><span className="eyebrow">YOUR WORKSPACE</span><h1>Make room for <span>great work.</span></h1><p>Create a project to bring your team, updates, and ideas into one focused space.</p><button className="primary" onClick={()=>setShowCreate(true)}><Plus size={17}/> Create your first project</button><div className="empty-note"><LockKeyhole size={15}/> Projects are private until you add teammates.</div></section> :
        <>
          <div className="page-heading"><div><div className="eyebrow"><span className="live-dot"/> PROJECT WORKSPACE</div><h1>{selected.name}</h1><p>{selected.description || 'A shared space for your team to plan, discuss, and get things done.'}</p></div><div className="heading-actions"><span className={`role-badge ${selected.role==='owner'?'role-owner':''}`}><ShieldCheck size={13}/> {roleLabels[selected.role ?? 'viewer']}</span>{canEdit(selected.role)&&tab==='stages'&&<button className="primary" onClick={openNewStage}><Plus size={16}/> New stage</button>}{canEdit(selected.role)&&tab==='stage_detail'&&selectedStage&&<button className="primary" onClick={()=>openCreateTask(selectedStage.id)}><Plus size={16}/> New task</button>}<button className="outline-button" onClick={()=>exportProjectExcel(selected.name,stages,tasks)} title="Export this project to Excel"><FolderKanban size={14}/> Export Excel</button><button className="outline-button" onClick={()=>exportProjectPdf(selected.name,stages,tasks,taskFields)} title="Print or save this project as a PDF"><FileDown size={14}/> Export PDF</button>{canEdit(selected.role)&&<button className="outline-button" onClick={()=>void duplicateProject()} title="Duplicate this project with all stages and tasks"><FolderKanban size={14}/> Duplicate project</button>}{canEdit(selected.role)&&<button className="outline-button" onClick={openProjectEdit}><Pencil size={14}/> Edit project</button>}{canEdit(selected.role)&&<button className="outline-button danger-outline" disabled={busy} onClick={()=>void removeProjectFromWorkspace()} title="Remove this project from your list without deleting its data"><Trash2 size={14}/> Remove project</button>}</div></div>
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
          {tab==='stages' && <StageOverview stages={stages} tasks={tasks} members={members} currentUserId={session.user.id} canManage={canEdit(selected.role)} onOpen={id=>{setSelectedStageId(id);setTab('stage_detail')}} onEdit={openEditStage} onDelete={deleteStage} onAddStage={openNewStage} onReorder={reorderStages} onCreateStageInline={createStageInline} onUpdateStage={async(stage,patch)=>{if(!supabase||!selected||!canEdit(selected.role))return false;const {error}=await supabase.from('project_stages').update(patch).eq('id',stage.id).eq('project_id',selected.id);if(error){setNotice('Could not update stage: '+error.message);return false}await loadProjectData(selected.id);setNotice('Stage updated.');return true}} onRename={async(stage,name)=>{if(!supabase||!selected||!canEdit(selected.role)||!name.trim())return false;const result=await supabase.from('project_stages').update({name:name.trim()}).eq('id',stage.id);if(result.error){setNotice(`Could not rename stage: ${result.error.message}`);return false}await loadProjectData(selected.id);setNotice('Stage name updated.');return true}} />}
          {tab==='calendar' && <CalendarView stages={stages} tasks={tasks} month={calendarMonth} setMonth={setCalendarMonth} onOpenStage={id=>{setSelectedStageId(id);setTab('stage_detail')}} />}
          {tab==='stage_detail' && selectedStage && <StageDetail stage={selectedStage} tasks={selectedStageTasks} allProjectTasks={tasks} taskFields={taskFields} canManage={canEdit(selected.role)} canComment={canComment(selected.role)} currentUserId={session.user.id} comments={stageComments} commentText={stageCommentText} setCommentText={setStageCommentText} busy={busy} onBack={()=>setTab('stages')} onEdit={()=>openEditStage(selectedStage)} onDelete={()=>deleteStage(selectedStage)} onAddTask={()=>openCreateTask(selectedStage.id)} onTaskClick={openEditTask} onStatus={updateTask} onSaveTask={updateTask} onAddTaskField={addTaskField} onDeleteTaskField={deleteTaskField} onReorderTasks={reorderTasks} onCreateTaskInline={createTaskInline} onComment={addStageComment} onEditComment={comment=>editThreadComment('stage',comment)} onDeleteComment={comment=>deleteThreadComment('stage',comment)} />}
          {(tab==='team'||tab==='discussion') && <section className="panel"><div className="panel-heading"><div><h2>Team & access</h2><p>Manage people and permissions for this project.</p></div><span className="count-pill">{members.length} members</span></div>{selected.role==='owner'&&<form className="invite-form" onSubmit={inviteMember}><div className="form-grid"><label>Existing user's email<input type="email" value={inviteEmail} onChange={e=>setInviteEmail(e.target.value)} placeholder="teammate@example.com" required/></label><label>Project role<select value={inviteRole} onChange={e=>setInviteRole(e.target.value as Role)}><option value="editor">Editor</option><option value="commenter">Commenter</option><option value="viewer">Viewer</option></select></label></div><p className="muted tiny">This adds an account that has already registered in this Supabase project. Email invitations to new accounts need a server-side email invitation function.</p><button className="primary compact" disabled={busy}><UserPlus size={15}/>{busy?'Adding…':'Add existing user'}</button></form>}{members.map(m=><div className="member-row" key={m.user_id}><div className="member-avatar">{m.user_id===session.user.id?(session.user.email??'U').slice(0,1).toUpperCase():'U'}</div><div className="member-info"><b>{m.user_id===session.user.id?'You':`Member ${m.user_id.slice(0,8)}`}</b><small>{m.user_id===session.user.id?session.user.email:m.user_id}</small></div>{m.user_id===session.user.id?<span className="role-badge role-owner">{roleLabels[m.role]}</span>:selected.role==='owner'?<><select aria-label="Member role" value={m.role} disabled={m.role==='owner'} onChange={e=>changeMemberRole(m,e.target.value as Role)}><option value="editor">Editor</option><option value="commenter">Commenter</option><option value="viewer">Viewer</option><option value="owner" disabled>Owner</option></select><button className="icon-button" title="Remove member" onClick={()=>removeMember(m)}><Trash2 size={15}/></button></>:<span className="role-badge">{roleLabels[m.role]}</span>}</div>)}{members.length===0&&<Empty icon={<Users/>} title="No team members yet" body="Project members will appear here."/>}</section>}
          {(tab==='discussion'||tab==='team') && <section className="panel discussion-panel"><div className="panel-heading"><div><h2>Project discussion</h2><p>Share updates and keep everyone in the loop.</p></div><span className="count-pill">{comments.length}</span></div><div className="discussion-list">{comments.length===0?<Empty icon={<MessageCircle/>} title="Start the conversation" body="Share a thought, ask a question, or post an update."/>:comments.map(c=><article className="comment" key={c.id}><div className="comment-avatar">{c.user_id===session.user.id?(session.user.email??'U').slice(0,1).toUpperCase():'M'}</div><div className="comment-body"><div className="comment-meta"><b>{c.user_id===session.user.id?'You':`Member ${c.user_id.slice(0,8)}`}</b><time>{new Date(c.created_at).toLocaleString()}</time></div><p>{c.body}</p></div></article>)}</div>{canComment(selected.role)?<form className="comment-form" onSubmit={addComment}><div className="comment-avatar self">{(session.user.email??'U').slice(0,1).toUpperCase()}</div><div className="comment-compose"><textarea value={commentText} onChange={e=>setCommentText(e.target.value)} placeholder="Write a comment…" rows={2}/><div className="compose-footer"><span>Be kind. Keep it constructive.</span><button className="primary compact" disabled={busy||!commentText.trim()}>Post comment <ArrowLeft size={14} className="send-icon"/></button></div></div></form>:<div className="viewer-note"><Eye size={15}/> You have view-only access.</div>}</section>}
        </>
        }
        <div className="page-footer"><span>© 2026 Project Hub</span><span><LockKeyhole size={12}/> Built for focused collaboration</span></div>
      </div>
    </main>
    {showCreate&&<div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setShowCreate(false)}}><section className="modal"><div className="modal-head"><div><span className="eyebrow">NEW WORKSPACE</span><h2>Create a project</h2><p>Give your team a dedicated place to work together.</p></div><button className="icon-button" onClick={()=>setShowCreate(false)}><X size={18}/></button></div><form onSubmit={createProject} className="form-stack"><label>Project name<input autoFocus value={projectName} onChange={e=>setProjectName(e.target.value)} placeholder="e.g. Website redesign" maxLength={80} required/></label><label>Description <span className="optional">(optional)</span><textarea value={projectDescription} onChange={e=>setProjectDescription(e.target.value)} placeholder="What is this project about?" rows={3} maxLength={500}/></label><div className="modal-note"><LockKeyhole size={15}/> Your new project starts private.</div><div className="modal-actions"><button type="button" className="outline-button" onClick={()=>setShowCreate(false)}>Cancel</button><button className="primary" disabled={busy||!projectName.trim()}><Plus size={16}/>{busy?'Creating…':'Create project'}</button></div></form></section></div>}
    {showProjectEdit&&selected&&<div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setShowProjectEdit(false)}}><section className="modal"><div className="modal-head"><div><span className="eyebrow">PROJECT SETTINGS</span><h2>Edit project</h2><p>Rename this project or update its description.</p></div><button type="button" className="icon-button" onClick={()=>setShowProjectEdit(false)}><X size={18}/></button></div><form onSubmit={updateProject} className="form-stack"><label>Project name<input autoFocus value={editProjectName} onChange={e=>setEditProjectName(e.target.value)} maxLength={80} required/></label><label>Description<textarea value={editProjectDescription} onChange={e=>setEditProjectDescription(e.target.value)} rows={3} maxLength={500}/></label><div className="modal-actions"><button type="button" className="outline-button" onClick={()=>setShowProjectEdit(false)}>Cancel</button><button className="primary" disabled={busy||!editProjectName.trim()}><Check size={15}/> Save project</button></div></form></section></div>}
    {showStage&&selected&&<div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setShowStage(false)}}><section className="modal"><div className="modal-head"><div><span className="eyebrow">PROJECT STAGE</span><h2>{editingStage?'Edit stage':'Create a stage'}</h2><p>Stages group related tasks and summarize their progress.</p></div><button type="button" className="icon-button" onClick={()=>setShowStage(false)}><X size={18}/></button></div><form onSubmit={saveStage} className="form-stack"><label>Stage name<input autoFocus value={stageName} onChange={e=>setStageName(e.target.value)} placeholder="e.g. Flooring" maxLength={160} required/></label><label>Assigned to<select value={stageAssigneeId||session.user.id} onChange={e=>setStageAssigneeId(e.target.value||session.user.id)}>{members.map(m=><option key={m.user_id} value={m.user_id}>{m.email||(m.user_id===session.user.id?'You':'Member '+m.user_id.slice(0,8))}</option>)}</select><small className="muted">Defaults to you if no other member is selected.</small></label><label>Description<textarea value={stageDescription} onChange={e=>setStageDescription(e.target.value)} rows={3} maxLength={5000} placeholder="Describe the purpose or scope of this stage."/></label><label>Quick schedule<select defaultValue="custom" onChange={e=>{if(e.target.value!=='custom'){const dates=getStageWeekDates(Number(e.target.value));setStageStart(dates.start);setStageEnd(dates.end)}}}><option value="custom">Choose dates manually</option><option value="0">This week (Mon–Sat)</option><option value="1">Next week (Mon–Sat)</option><option value="2">Week after next (Mon–Sat)</option></select></label><div className="form-grid"><label>Stage start date<input type="date" value={stageStart} max={stageEnd||undefined} onChange={e=>setStageStart(e.target.value)}/></label><label>Stage end date<input type="date" value={stageEnd} min={stageStart||undefined} onChange={e=>setStageEnd(e.target.value)}/></label></div><p className="muted tiny">Tasks must stay within the stage date range. Leave a boundary blank if it is not defined.</p><div className="modal-actions"><button type="button" className="outline-button" onClick={()=>setShowStage(false)}>Cancel</button><button className="primary" disabled={busy||!stageName.trim()}><Check size={15}/>{busy?'Saving…':editingStage?'Save changes':'Create stage'}</button></div></form></section></div>}
    {showTask&&selected&&<div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setShowTask(false)}}><section className="modal task-edit-modal"><div className="modal-head"><div><span className="eyebrow">STAGE TASK</span><h2>{editingTask?'Edit task':'Add a task'}</h2><p>{selectedStage?.name ?? stages.find(s=>s.id===taskStageId)?.name ?? 'Stage'} · update dates, details, status and comments any time.</p></div><button type="button" className="icon-button" onClick={()=>setShowTask(false)}><X size={18}/></button></div><form onSubmit={saveTask} className="form-stack"><label>Task name<input autoFocus disabled={!canEdit(selected.role)} value={taskTitle} onChange={e=>setTaskTitle(e.target.value)} placeholder="e.g. Lay tiles" maxLength={160} required/></label><label>Description<textarea disabled={!canEdit(selected.role)} value={taskDescription} onChange={e=>setTaskDescription(e.target.value)} rows={3} maxLength={5000} placeholder="What needs to be done?"/></label><div className="form-grid"><label>Assigned to<select disabled={!canEdit(selected.role)} value={taskAssigneeId||session.user.id} onChange={e=>setTaskAssigneeId(e.target.value||session.user.id)}>{members.map(member=><option key={member.user_id} value={member.user_id}>{companyMembers.find(cm=>cm.user_id===member.user_id)?.full_name || companyMembers.find(cm=>cm.user_id===member.user_id)?.email || (member.user_id===session.user.id?'You':'Member '+member.user_id.slice(0,8))}</option>)}</select><small className="muted">Defaults to you if no other member is selected.</small></label><label>Status<select disabled={!canEdit(selected.role)} value={taskStatus} onChange={e=>setTaskStatus(e.target.value as TaskStatus)}><option value="todo">To be started</option><option value="in_progress">Ongoing</option><option value="done">Completed</option></select></label><label>Priority<select disabled={!canEdit(selected.role)} value={taskPriority} onChange={e=>setTaskPriority(e.target.value)}><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option></select></label><label>Start date<input disabled={!canEdit(selected.role)} type="date" value={taskStart} min={stages.find(s=>s.id===taskStageId)?.start_date||undefined} max={stages.find(s=>s.id===taskStageId)?.end_date||undefined} onChange={e=>setTaskStart(e.target.value)}/></label><label>End date<input disabled={!canEdit(selected.role)} type="date" value={taskDue} min={[taskStart,stages.find(s=>s.id===taskStageId)?.start_date].filter(Boolean).sort().slice(-1)[0]||undefined} max={stages.find(s=>s.id===taskStageId)?.end_date||undefined} onChange={e=>setTaskDue(e.target.value)}/></label></div><div className="modal-actions"><button type="button" className="outline-button" onClick={()=>setShowTask(false)}>Close</button>{canEdit(selected.role)&&<button className="primary" disabled={busy||!taskTitle.trim()}><Check size={15}/>{busy?'Saving…':editingTask?'Save task':'Create task'}</button>}{editingTask&&canEdit(selected.role)&&<button type="button" className="outline-button danger-button" onClick={()=>deleteTask(editingTask)}><Trash2 size={14}/> Delete task</button>}</div></form>{editingTask&&<div className="task-modal-comments"><CommentThread title="Task comments" comments={taskComments} canComment={canComment(selected.role)} canManage={canEdit(selected.role)} currentUserId={session.user.id} commentText={taskCommentText} setCommentText={setTaskCommentText} busy={busy} onSubmit={addTaskComment} onEdit={comment=>editThreadComment('task',comment)} onDelete={comment=>deleteThreadComment('task',comment)} placeholder="Comment on this task…"/></div>}</section></div>}
  </div>
}



function indiaDate(date = new Date()) {
 const parts = new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date)
 const part=(key:string)=>parts.find(x=>x.type===key)?.value??''
 return `${part('year')}-${part('month')}-${part('day')}`
}
function indiaTime(value:string|null|undefined) {
 if(!value)return '—'
 return new Intl.DateTimeFormat('en-IN',{timeZone:'Asia/Kolkata',hour:'2-digit',minute:'2-digit',hour12:true}).format(new Date(value))
}
function shortDate(value:string|null|undefined) {
 if(!value)return '—'
 return new Date(value+'T00:00:00').toLocaleDateString(undefined,{day:'2-digit',month:'short',year:'numeric'})
}
function AttendancePage({company,currentUser,isAdmin}:{company:Company;currentUser:{id:string;email?:string};isAdmin:boolean}) {
 const [scheduleDate,setScheduleDate]=useState(indiaDate())
 const [myAttendance,setMyAttendance]=useState<AttendanceRecord[]>([])
 const [myLeaves,setMyLeaves]=useState<CompanyLeaveRecord[]>([])
 const [pendingLeaves,setPendingLeaves]=useState<CompanyLeaveRecord[]>([])
 const [schedule,setSchedule]=useState<AttendanceScheduleRow[]>([])
 const [workMode,setWorkMode]=useState<'office'|'site'|'home'>('office')
 const [clockNow,setClockNow]=useState(Date.now())
 const [showLeaveForm,setShowLeaveForm]=useState(false)
 const [leaveStart,setLeaveStart]=useState(indiaDate())
 const [leaveEnd,setLeaveEnd]=useState(indiaDate())
 const [leaveReason,setLeaveReason]=useState('')
 const [loading,setLoading]=useState(true)
 const [busy,setBusy]=useState(false)
 const [message,setMessage]=useState('')
 const [waGroupName,setWaGroupName]=useState('Brickmen group')
 const [waGroupId,setWaGroupId]=useState('')
 const [waEnabled,setWaEnabled]=useState(false)
 const today=indiaDate()
 const todayRecord=myAttendance.find(record=>record.attendance_date===today)
 const workElapsedSeconds=todayRecord?Math.max(0,Math.floor(((todayRecord.ended_at?new Date(todayRecord.ended_at).getTime():todayRecord.paused_at?new Date(todayRecord.paused_at).getTime():clockNow)-new Date(todayRecord.started_at).getTime())/1000)-(todayRecord.paused_seconds??0)):0
 const timerSeconds=Math.max(0,workElapsedSeconds)
 const editable=Boolean(todayRecord&&!todayRecord.frozen_at&&new Date(todayRecord.editable_until).getTime()>Date.now())
 const onLeaveToday=myLeaves.some(leave=>leave.status==='active'&&(leave.approval_status??'approved')==='approved'&&leave.start_date<=today&&leave.end_date>=today)

 useEffect(()=>{const timer=window.setInterval(()=>setClockNow(Date.now()),1000);return()=>window.clearInterval(timer)},[])
 useEffect(()=>{
  let alive=true
  async function load(){
   if(!supabase){setLoading(false);return}
   setLoading(true)
   const [attendanceResult,leaveResult]=await Promise.all([
    supabase.from('company_attendance').select('id,company_id,user_id,attendance_date,work_mode,work_location,started_at,editable_until,frozen_at,ended_at,paused_at,paused_seconds,work_state').eq('company_id',company.id).eq('user_id',currentUser.id).order('attendance_date',{ascending:false}).limit(60),
    supabase.from('company_leave').select('id,company_id,user_id,start_date,end_date,reason,status,approval_status,approved_by,decision_at,approval_note,created_at,updated_at').eq('company_id',company.id).eq('user_id',currentUser.id).order('start_date',{ascending:false}).limit(60)
   ])
   if(!alive)return
   if(attendanceResult.error)setMessage('Could not load your attendance: '+attendanceResult.error.message)
   else {
    const loadedAttendance=(attendanceResult.data??[]) as AttendanceRecord[]
    setMyAttendance(loadedAttendance)
    const todayEntry=loadedAttendance.find(record=>record.attendance_date===indiaDate())
    setWorkMode(todayEntry?.work_location??(todayEntry?.work_mode==='work_from_home'?'home':'office'))
   }
   if(leaveResult.error)setMessage('Could not load your leave history: '+leaveResult.error.message)
   else setMyLeaves((leaveResult.data??[]) as CompanyLeaveRecord[])
   if(isAdmin){const pendingResult=await supabase.from('company_leave').select('id,company_id,user_id,start_date,end_date,reason,status,approval_status,approved_by,decision_at,approval_note,created_at,updated_at').eq('company_id',company.id).eq('approval_status','pending').order('created_at',{ascending:false});if(alive&&!pendingResult.error)setPendingLeaves((pendingResult.data??[]) as CompanyLeaveRecord[])}else setPendingLeaves([])
   if(isAdmin){
    const [scheduleResult,settingsResult]=await Promise.all([
     supabase.rpc('get_company_attendance_schedule',{p_company_id:company.id,p_date:scheduleDate}),
     supabase.from('company_whatsapp_settings').select('company_id,group_name,group_id,enabled,timezone,updated_by,updated_at').eq('company_id',company.id).maybeSingle()
    ])
    if(!alive)return
    if(scheduleResult.error)setMessage('Could not load the employee attendance schedule: '+scheduleResult.error.message)
    else setSchedule((scheduleResult.data??[]) as AttendanceScheduleRow[])
    if(settingsResult.error)setMessage('WhatsApp settings could not load: '+settingsResult.error.message)
    else if(settingsResult.data){setWaGroupName(settingsResult.data.group_name??'Brickmen group');setWaGroupId(settingsResult.data.group_id==='NOT_CONFIGURED'?'':settingsResult.data.group_id??'');setWaEnabled(Boolean(settingsResult.data.enabled))}
    else {setWaGroupName('Brickmen group');setWaGroupId('');setWaEnabled(false)}
   } else setSchedule([])
   setLoading(false)
  }
  void load()
  return ()=>{alive=false}
 },[company.id,currentUser.id,isAdmin,scheduleDate])

 async function startOrUpdateWork(){
  if(!supabase)return
  if(onLeaveToday){setMessage('You have an active leave record for today. Cancel it first if you are returning to work.');return}
  setBusy(true);setMessage('')
  if(todayRecord){
   if(!editable){setMessage('This attendance entry is frozen. Work location can only be changed within the first hour after check-in.');setBusy(false);return}
   const {data,error}=await supabase.from('company_attendance').update({work_mode:workMode==='home'?'work_from_home':'office',work_location:workMode}).eq('id',todayRecord.id).select('id,company_id,user_id,attendance_date,work_mode,work_location,started_at,editable_until,frozen_at,ended_at,paused_at,paused_seconds,work_state').single()
   if(error)setMessage('Could not update attendance: '+error.message)
   else {setMyAttendance(current=>current.map(row=>row.id===data.id?data as AttendanceRecord:row));setMessage('Work location updated. Your original check-in time has not changed.')}
  }else{
   const {data,error}=await supabase.from('company_attendance').insert({company_id:company.id,user_id:currentUser.id,attendance_date:today,work_mode:workMode==='home'?'work_from_home':'office',work_location:workMode}).select('id,company_id,user_id,attendance_date,work_mode,work_location,started_at,editable_until,frozen_at,ended_at,paused_at,paused_seconds,work_state').single()
   if(error)setMessage('Could not start work mode: '+error.message)
   else {setMyAttendance(current=>[data as AttendanceRecord,...current.filter(row=>row.attendance_date!==today)]);setMessage('Work mode started. You have one hour to correct the work location; the entry time will remain fixed.')}
  }
  setBusy(false)
 }
 async function changeWorkState(action:'pause'|'resume'|'end'){
  if(!supabase||!todayRecord)return
  if(todayRecord.ended_at||todayRecord.work_state==='ended'){setMessage('Today’s work session has already ended.');return}
  setBusy(true);setMessage('');const now=new Date().toISOString();const patch:Record<string,unknown>={}
  if(action==='pause'){if(todayRecord.work_state==='paused'){setBusy(false);return}patch.work_state='paused';patch.paused_at=now}
  else if(action==='resume'){if(!todayRecord.paused_at){setBusy(false);return}patch.work_state='working';patch.paused_seconds=(todayRecord.paused_seconds??0)+Math.max(0,Math.floor((Date.now()-new Date(todayRecord.paused_at).getTime())/1000));patch.paused_at=null}
  else {patch.work_state='ended';patch.ended_at=now;if(todayRecord.paused_at){patch.paused_seconds=(todayRecord.paused_seconds??0)+Math.max(0,Math.floor((Date.now()-new Date(todayRecord.paused_at).getTime())/1000));patch.paused_at=null}}
  const {data,error}=await supabase.from('company_attendance').update(patch).eq('id',todayRecord.id).select('id,company_id,user_id,attendance_date,work_mode,work_location,started_at,editable_until,frozen_at,ended_at,paused_at,paused_seconds,work_state').single()
  if(error)setMessage('Could not update work timer: '+error.message);else{setMyAttendance(current=>current.map(row=>row.id===data.id?data as AttendanceRecord:row));setMessage(action==='pause'?'Work timer paused.':action==='resume'?'Work timer resumed.':'Work session ended.')}
  setBusy(false)
 }
 async function decideLeave(leave:CompanyLeaveRecord,decision:'approved'|'rejected'){
  if(!supabase||!isAdmin)return;setBusy(true);setMessage('')
  const {data,error}=await supabase.from('company_leave').update({approval_status:decision,approved_by:currentUser.id,decision_at:new Date().toISOString(),status:decision==='approved'?'active':'cancelled'}).eq('id',leave.id).select('id,company_id,user_id,start_date,end_date,reason,status,approval_status,approved_by,decision_at,approval_note,created_at,updated_at').single()
  if(error)setMessage('Could not update leave request: '+error.message);else{setPendingLeaves(current=>current.filter(row=>row.id!==leave.id));if(leave.user_id===currentUser.id)setMyLeaves(current=>current.map(row=>row.id===leave.id?data as CompanyLeaveRecord:row));setMessage(decision==='approved'?'Leave approved. WhatsApp confirmation requires the leave notification function and approved template to be configured.':'Leave request rejected.')}
  setBusy(false)
 }
 async function submitLeave(e:FormEvent){
  e.preventDefault()
  if(!supabase||leaveEnd<leaveStart||leaveStart<today){setMessage('Choose a valid leave period starting today or later.');return}
  setBusy(true);setMessage('')
  const {data,error}=await supabase.from('company_leave').insert({company_id:company.id,user_id:currentUser.id,start_date:leaveStart,end_date:leaveEnd,reason:leaveReason.trim()||null,approval_status:'pending'}).select('id,company_id,user_id,start_date,end_date,reason,status,created_at,updated_at').single()
  if(error)setMessage('Could not submit leave: '+error.message)
  else {setMyLeaves(current=>[data as CompanyLeaveRecord,...current]);setLeaveReason('');setShowLeaveForm(false);setMessage('Leave request submitted for admin approval.')}
  setBusy(false)
 }
 async function cancelLeave(leave:CompanyLeaveRecord){
  if(!supabase||leave.status!=='active'||leave.start_date<today)return
  if(!confirm(`Cancel leave from ${shortDate(leave.start_date)} to ${shortDate(leave.end_date)}?`))return
  const {data,error}=await supabase.from('company_leave').update({status:'cancelled'}).eq('id',leave.id).select('id,company_id,user_id,start_date,end_date,reason,status,created_at,updated_at').single()
  if(error)setMessage('Could not cancel leave: '+error.message)
  else {setMyLeaves(current=>current.map(row=>row.id===leave.id?data as CompanyLeaveRecord:row));setMessage('Upcoming leave cancelled.')}
 }
 async function saveWhatsAppSettings(e:FormEvent){
  e.preventDefault()
  if(!supabase||!isAdmin)return
  if(waEnabled&&!waGroupId.trim()){setMessage('Enter the WhatsApp Groups API group ID before enabling daily messages.');return}
  setBusy(true);setMessage('')
  const {error}=await supabase.from('company_whatsapp_settings').upsert({
   company_id:company.id,group_name:waGroupName.trim()||'Company attendance group',group_id:waGroupId.trim()||'NOT_CONFIGURED',
   enabled:waEnabled,timezone:'Asia/Kolkata',updated_by:currentUser.id,updated_at:new Date().toISOString()
  },{onConflict:'company_id'})
  if(error)setMessage('Could not save WhatsApp settings: '+error.message)
  else setMessage(waEnabled?'WhatsApp delivery is enabled in the workspace settings. It will send only after Meta credentials and the 10 AM cron job are configured.':'WhatsApp attendance delivery is disabled.')
  setBusy(false)
 }
 const statusText=(row:AttendanceScheduleRow)=>row.attendance_status==='working'?'Working':row.attendance_status==='on_leave'?'On leave':'Not signed in'
 const statusClass=(status:string)=>status==='working'?'working':status==='on_leave'?'on-leave':'not-signed-in'
 return <section className="attendance-page">
  <div className="page-heading"><div><div className="eyebrow"><span className="live-dot"/> COMPANY ATTENDANCE</div><h1>{isAdmin?'Attendance schedule':'My attendance'}</h1><p>{isAdmin?'Company-wide employee attendance is visible only to admins.':'Submit your own work mode and leave dates. You cannot see other employees’ attendance.'}</p></div><div className="heading-actions"><span className="role-badge"><ShieldCheck size={13}/>{isAdmin?'Company admin':'Employee'}</span></div></div>
  {message&&<div className="notice-banner"><span>{message}</span><button className="icon-button" onClick={()=>setMessage('')}><X size={15}/></button></div>}
  <section className="panel my-attendance-panel">
   <div className="panel-heading"><div><h2>My daily work mode</h2><p>Today's date in India: {shortDate(today)} · Check-in time is recorded by the server.</p></div><Clock3 size={19}/></div>
   {onLeaveToday&&<div className="attendance-alert"><CalendarDays size={16}/> You are marked on leave today.</div>}
   <div className="attendance-checkin-row"><div className="attendance-checkin-details"><span className="eyebrow">{todayRecord?'TODAY’S ENTRY':'START WORK'}</span><b>{todayRecord?'Entered work mode at '+indiaTime(todayRecord.started_at):'Choose how you are working today'}</b><small>{todayRecord?(editable?'Editable until '+indiaTime(todayRecord.editable_until):'Frozen · corrections closed at '+indiaTime(todayRecord.editable_until)):'Your entry becomes immutable one hour after you check in.'}</small></div>
    <label>Work location<select value={workMode} onChange={e=>setWorkMode(e.target.value as 'office'|'site'|'home')} disabled={Boolean(todayRecord&&!editable)||onLeaveToday}><option value="office">Office</option><option value="site">Site</option><option value="home">Home</option></select></label>
    <button className="primary" onClick={()=>void startOrUpdateWork()} disabled={busy||onLeaveToday||Boolean(todayRecord&&!editable)}>{busy?'Saving…':todayRecord?'Update location':'Start work'}</button>
    {todayRecord&&<div className="work-timer-controls"><strong className="work-timer-display">{String(Math.floor(timerSeconds/3600)).padStart(2,'0')}:{String(Math.floor(timerSeconds%3600/60)).padStart(2,'0')}:{String(timerSeconds%60).padStart(2,'0')}</strong>{!todayRecord.ended_at&&todayRecord.work_state!=='ended'&&<>{todayRecord.work_state==='paused'?<button className="primary compact" onClick={()=>void changeWorkState('resume')} disabled={busy}>Resume work</button>:<button className="outline-button compact" onClick={()=>void changeWorkState('pause')} disabled={busy}>Pause work</button>}<button className="outline-button compact" onClick={()=>void changeWorkState('end')} disabled={busy}>End work</button></>}</div>}
   </div>
  </section>
  <section className="panel">
   <div className="panel-heading"><div><h2>Leave requests</h2><p>Submit a request for admin approval and track its decision here.</p></div><button type="button" className="primary compact" onClick={()=>setShowLeaveForm(true)}><CalendarDays size={14}/> Request leave</button></div>
   {showLeaveForm&&<form className="form-stack attendance-leave-form" onSubmit={submitLeave}><div className="form-grid"><label>Leave starts<input type="date" min={today} value={leaveStart} onChange={e=>{setLeaveStart(e.target.value);if(leaveEnd<e.target.value)setLeaveEnd(e.target.value)}} required/></label><label>Leave ends<input type="date" min={leaveStart||today} value={leaveEnd} onChange={e=>setLeaveEnd(e.target.value)} required/></label></div><label>Reason (optional)<textarea rows={2} maxLength={1000} value={leaveReason} onChange={e=>setLeaveReason(e.target.value)} placeholder="Optional note for the admin schedule"/></label><div className="attendance-form-actions"><button type="button" className="outline-button compact" onClick={()=>setShowLeaveForm(false)}>Cancel</button><button className="primary compact" disabled={busy||leaveStart<today||leaveEnd<leaveStart}><CalendarDays size={14}/> Submit request</button></div></form>}
   <div className="compact-table-wrap attendance-history-wrap"><table className="compact-table attendance-history-table"><thead><tr><th>Leave dates</th><th>Reason</th><th>Status</th><th>Action</th></tr></thead><tbody>
    {myLeaves.map(leave=><tr key={leave.id}><td>{shortDate(leave.start_date)} – {shortDate(leave.end_date)}</td><td>{leave.reason||'—'}</td><td><span className={'company-role-pill '+(leave.status==='active'?'admin':'employee')}>{leave.status==='cancelled'?'Cancelled':(leave.approval_status??'approved')==='pending'?'Pending approval':(leave.approval_status??'approved')==='rejected'?'Rejected':'Approved'}</span></td><td>{leave.status==='active'&&leave.start_date>=today?<button className="outline-button compact" onClick={()=>void cancelLeave(leave)}>Cancel</button>:'—'}</td></tr>)}
    {myLeaves.length===0&&<tr><td colSpan={4}>No leave entries yet.</td></tr>}
   </tbody></table></div>
   {isAdmin&&<div className="leave-approval-queue"><div className="panel-heading"><div><h3>Pending approvals</h3><p>Approve or reject employee leave requests.</p></div><span className="count-pill">{pendingLeaves.length}</span></div><div className="compact-table-wrap"><table className="compact-table"><thead><tr><th>Employee</th><th>Dates</th><th>Reason</th><th>Decision</th></tr></thead><tbody>{pendingLeaves.map(leave=><tr key={leave.id}><td>{company.id===leave.company_id?(leave.user_id===currentUser.id?'You':leave.user_id.slice(0,8)):leave.user_id.slice(0,8)}</td><td>{shortDate(leave.start_date)} – {shortDate(leave.end_date)}</td><td>{leave.reason||'—'}</td><td><div className="sheet-actions"><button className="primary compact" disabled={busy} onClick={()=>void decideLeave(leave,'approved')}>Approve</button><button className="outline-button compact" disabled={busy} onClick={()=>void decideLeave(leave,'rejected')}>Reject</button></div></td></tr>)}{pendingLeaves.length===0&&<tr><td colSpan={4}>No pending leave requests.</td></tr>}</tbody></table></div></div>}
  </section>
  <section className="panel">
   <div className="panel-heading"><div><h2>My attendance history</h2><p>Your own entries only. Records become immutable after the first hour.</p></div><Clock3 size={18}/></div>
   <div className="compact-table-wrap attendance-history-wrap"><table className="compact-table attendance-history-table"><thead><tr><th>Date</th><th>Work mode</th><th>Entry time</th><th>Correction window</th><th>Status</th></tr></thead><tbody>
    {myAttendance.map(record=><tr key={record.id}><td>{shortDate(record.attendance_date)}</td><td>{record.work_mode==='work_from_home'?'Work from home':'Office'}</td><td>{indiaTime(record.started_at)}</td><td>{indiaTime(record.editable_until)}</td><td><span className={'company-role-pill '+(record.frozen_at||new Date(record.editable_until).getTime()<=Date.now()?'employee':'admin')}>{record.frozen_at||new Date(record.editable_until).getTime()<=Date.now()?'Frozen':'Editable'}</span></td></tr>)}
    {myAttendance.length===0&&<tr><td colSpan={5}>No attendance records yet.</td></tr>}
   </tbody></table></div>
  </section>
  {isAdmin&&<section className="panel attendance-admin-panel">
   <div className="panel-heading"><div><h2>Employee attendance schedule</h2><p>This table is admin-only. Choose a date to see working, leave, and not-signed-in statuses.</p></div><Users size={19}/></div>
   <div className="attendance-admin-toolbar"><label>Schedule date<input type="date" value={scheduleDate} onChange={e=>setScheduleDate(e.target.value)} max={new Date(Date.now()+365*86400000).toISOString().slice(0,10)}/></label><span>{schedule.filter(row=>row.attendance_status==='working').length} working · {schedule.filter(row=>row.attendance_status==='on_leave').length} on leave · {schedule.filter(row=>row.attendance_status==='not_signed_in').length} not signed in</span></div>
   {loading?<div className="dashboard-loading"><LoaderCircle className="spin"/>Loading attendance…</div>:<div className="compact-table-wrap attendance-history-wrap"><table className="compact-table company-deadline-table attendance-schedule-table"><thead><tr><th>Employee</th><th>Status</th><th>Work location</th><th>Entered work mode</th><th>Correction cutoff</th><th>Leave dates</th></tr></thead><tbody>
   {schedule.map(row=><tr key={row.user_id}><td><b>{row.employee_name}</b><small className="attendance-email">{row.employee_email}</small></td><td><span className={'attendance-status-pill '+statusClass(row.attendance_status)}>{statusText(row)}</span></td><td>{row.work_mode==='work_from_home'?'Work from home':row.work_mode==='office'?'Office':'—'}</td><td>{indiaTime(row.started_at)}</td><td>{row.editable_until?(row.is_frozen?'Frozen · ':'Editable until ')+indiaTime(row.editable_until):'—'}</td><td>{row.leave_start?shortDate(row.leave_start)+' – '+shortDate(row.leave_end):'—'}</td></tr>)}
   {schedule.length===0&&<tr><td colSpan={6}>No employees found in this company.</td></tr>}
   </tbody></table></div>}
  </section>
  }
  {isAdmin&&<section className="panel attendance-whatsapp-panel">
   <div className="panel-heading"><div><h2>10 AM WhatsApp attendance message</h2><p>Configure the destination for daily employee status messages.</p></div><Mail size={19}/></div>
   <form className="form-stack attendance-wa-form" onSubmit={saveWhatsAppSettings}><div className="form-grid"><label>WhatsApp group name<input value={waGroupName} onChange={e=>setWaGroupName(e.target.value)} maxLength={120} placeholder="Brickmen group" required/></label><label>WhatsApp Groups API group ID<input value={waGroupId} onChange={e=>setWaGroupId(e.target.value)} placeholder="Paste the group ID from Meta's Groups API" /></label></div><label className="attendance-toggle"><input type="checkbox" checked={waEnabled} onChange={e=>setWaEnabled(e.target.checked)}/> Enable daily 10:00 AM IST employee status messages</label><div className="attendance-whatsapp-warning"><AlertCircle size={17}/><p>The official WhatsApp Groups API only supports eligible WhatsApp Business accounts and API-enabled groups. A normal existing WhatsApp group may not be addressable. The Edge Function, WhatsApp credentials, and cron schedule must also be configured before a message can actually be sent.</p></div><button className="primary compact" disabled={busy}><Save size={14}/> Save WhatsApp settings</button></form>
  </section>}
 </section>
}

function CompanySettings({companies,selectedCompanyId,onSelect,companyName,setCompanyName,companySlug,setCompanySlug,logoFile,setLogoFile,onCreate,busy}:{companies:Company[];selectedCompanyId:string|null;onSelect:(id:string|null)=>void;companyName:string;setCompanyName:(value:string)=>void;companySlug:string;setCompanySlug:(value:string)=>void;logoFile:File|null;setLogoFile:(file:File|null)=>void;onCreate:(e:FormEvent)=>void;busy:boolean}) {
  const slugify=(value:string)=>value.toLowerCase().trim().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,64)
  return <section className="panel company-settings-panel">
    <div className="panel-heading"><div><h2>Companies & workspaces</h2><p>Create separate company spaces. Existing projects remain personal until an admin links them.</p></div><Building2 size={20}/></div>
    {companies.length>0&&<div className="company-switch-row"><label>Active workspace<select value={selectedCompanyId??''} onChange={e=>{const value=e.target.value||null;onSelect(value);try{localStorage.setItem('projecthub-selected-workspace-id',value??'personal')}catch{/* ignore storage */}}}><option value="">Personal workspace</option>{companies.map(company=><option key={company.id} value={company.id}>{company.name} · {company.role==='admin'?'Admin':'Employee'}</option>)}</select></label></div>}
    <form className="form-stack company-create-form" onSubmit={onCreate}>
      <h3>Create a company</h3>
      <div className="form-grid"><label>Company name<input value={companyName} onChange={e=>{setCompanyName(e.target.value);setCompanySlug(slugify(e.target.value))}} placeholder="e.g. Brickmen" maxLength={120} required/></label><label>Company login/invitation URL name<input value={companySlug} onChange={e=>setCompanySlug(slugify(e.target.value))} placeholder="brickmen" pattern="[a-z0-9][a-z0-9-]{1,62}[a-z0-9]" minLength={3} maxLength={64} required/><small className="muted">Used to show the right branding on company invitation and login links.</small></label></div>
      <label className="company-logo-input-label">Company logo (optional)<input type="file" accept="image/*" onChange={e=>setLogoFile(e.target.files?.[0]??null)}/>{logoFile&&<small className="muted">Selected: {logoFile.name}</small>}<small className="muted">Image file up to 3 MB. You can change it later in Company profile.</small></label>
      <div className="modal-note"><ShieldCheck size={15}/> You become the first company admin. Admins can invite partners as admins and staff as employees.</div>
      <div><button className="primary" disabled={busy||!companyName.trim()||companySlug.trim().length<3}><Plus size={15}/>{busy?'Creating…':'Create company'}</button></div>
    </form>
    {companies.length>0&&<div className="company-choice-list"><h3>Your companies</h3>{companies.map(company=><button type="button" key={company.id} className={selectedCompanyId===company.id?'company-choice selected':'company-choice'} onClick={()=>onSelect(company.id)}>{company.logo_url?<img src={company.logo_url} alt="" />:<span className="company-choice-mark"><Building2 size={16}/></span>}<span><b>{company.name} Project Hub</b><small>{company.role==='admin'?'Admin access':'Employee access'} · /?company={company.slug}</small></span>{selectedCompanyId===company.id&&<Check size={16}/>}</button>)}</div>}
  </section>
}

function CompanyDashboardMetrics({company,members,rows,isAdmin}:{company:Company;members:CompanyMember[];rows:CompanyProjectRow[];isAdmin:boolean}) {
 const [taskRows,setTaskRows]=useState<Array<{project_id:string;status:string;assigned_to_user_id:string|null;stage_id:string|null}>>([])
 const [attendanceRows,setAttendanceRows]=useState<Array<{user_id:string;attendance_date:string}>>([])
 const [leaveRows,setLeaveRows]=useState<Array<{user_id:string;start_date:string;end_date:string;approval_status?:string;status:string}>>([])
 const [loadMessage,setLoadMessage]=useState('')
 const projectIds=Array.from(new Set(rows.map(row=>row.project_id).filter(Boolean)))
 const projectKey=projectIds.join(',')
 useEffect(()=>{let alive=true;async function load(){if(!supabase||!isAdmin||!projectIds.length){setTaskRows([]);setAttendanceRows([]);setLeaveRows([]);return}
 const monthStart=indiaDate().slice(0,7)+'-01';const today=indiaDate()
 const [t,at,l]=await Promise.all([
 supabase.from('project_tasks').select('project_id,status,assigned_to_user_id,stage_id').in('project_id',projectIds),
 supabase.from('company_attendance').select('user_id,attendance_date').eq('company_id',company.id).gte('attendance_date',monthStart).lte('attendance_date',today),
 supabase.from('company_leave').select('user_id,start_date,end_date,approval_status,status').eq('company_id',company.id).eq('status','active').lte('start_date',today).gte('end_date',monthStart)
 ])
 if(!alive)return
 if(t.error)setLoadMessage('Some project task totals are unavailable until the company admin has access to each linked project.')
 else setTaskRows((t.data??[]) as Array<{project_id:string;status:string;assigned_to_user_id:string|null;stage_id:string|null}>)
 if(!at.error)setAttendanceRows((at.data??[]) as Array<{user_id:string;attendance_date:string}>)
 if(!l.error)setLeaveRows((l.data??[]) as Array<{user_id:string;start_date:string;end_date:string;approval_status?:string;status:string}>)
 }
 void load();return()=>{alive=false}
 },[company.id,isAdmin,projectKey])
 const today=indiaDate();const monthStart=today.slice(0,7)+'-01';const workdaysElapsed=(()=>{let n=0;const d=new Date(monthStart+'T12:00:00');const end=new Date(today+'T12:00:00');while(d<=end){if(d.getDay()!==0)n++;d.setDate(d.getDate()+1)}return n||1})()
 const leaveDays=(userId:string)=>leaveRows.filter(l=>l.user_id===userId&&(l.approval_status??'approved')==='approved').reduce((sum,l)=>{const start=l.start_date>monthStart?l.start_date:monthStart;const end=l.end_date<today?l.end_date:today;if(end<start)return sum;let n=0;const d=new Date(start+'T12:00:00'),last=new Date(end+'T12:00:00');while(d<=last){if(d.getDay()!==0)n++;d.setDate(d.getDate()+1)}return sum+n},0)
 return <section className="panel company-metrics-panel"><div className="panel-heading"><div><h2>Company performance</h2><p>Employee task completion, attendance, and leave for {today.slice(0,7)}.</p></div><Activity size={19}/></div>
 {!isAdmin?<p className="muted">Employee-wide completion and attendance details are visible to company admins.</p>:<><div className="company-metric-cards"><div><small>Linked projects</small><b>{projectIds.length}</b></div><div><small>Company tasks</small><b>{taskRows.length}</b></div><div><small>Completed</small><b>{taskRows.filter(t=>t.status==='done').length}</b></div><div><small>Remaining</small><b>{taskRows.filter(t=>t.status!=='done').length}</b></div></div><div className="compact-table-wrap"><table className="compact-table company-employee-metrics"><thead><tr><th>Employee</th><th>Task / stage completion</th><th>Leave days this month</th><th>Attendance</th><th>Tasks completed</th><th>Tasks remaining</th></tr></thead><tbody>{members.map(member=>{const assigned=taskRows.filter(t=>t.assigned_to_user_id===member.user_id);const completed=assigned.filter(t=>t.status==='done').length;const attendanceDays=new Set(attendanceRows.filter(r=>r.user_id===member.user_id).map(r=>r.attendance_date)).size;return <tr key={member.user_id}><td><b>{member.full_name||member.email||member.user_id.slice(0,8)}</b><small>{member.job_title||member.role}</small></td><td><b>{assigned.length?Math.round(completed/assigned.length*100):0}%</b><div className="progress-track"><div className="progress-fill done" style={{width:(assigned.length?completed/assigned.length*100:0)+'%'}}/></div></td><td>{leaveDays(member.user_id)}</td><td>{Math.min(100,Math.round(attendanceDays/workdaysElapsed*100))}%</td><td>{completed}</td><td>{assigned.length-completed}</td></tr>})}{members.length===0&&<tr><td colSpan={6}>No company employees found.</td></tr>}</tbody></table></div>{loadMessage&&<p className="muted tiny">{loadMessage}</p>}</>}
 </section>
}

function CompanyProfile({company,isAdmin,members,rows,assignments,availableProjects,busy,onSave,onLogoUpload,onInvite,onLinkProject,onUnlinkProject,onAssign,onMemberUpdate,onRemoveMember,linkProjectId,setLinkProjectId,inviteEmail,setInviteEmail,inviteRole,setInviteRole,assignProjectId,setAssignProjectId,assignEmployeeId,setAssignEmployeeId}:{
 company:Company;isAdmin:boolean;members:CompanyMember[];rows:CompanyProjectRow[];assignments:CompanyAssignment[];availableProjects:Project[];busy:boolean;
 onSave:(patch:Partial<Pick<Company,'name'|'logo_url'|'theme'>>)=>Promise<void>;onLogoUpload:(file:File)=>Promise<void>;
 onInvite:(e:FormEvent)=>void;onLinkProject:()=>Promise<void>;onUnlinkProject:(id:string)=>Promise<void>;onAssign:()=>Promise<void>;
 onMemberUpdate:(member:CompanyMember,patch:Partial<Pick<CompanyMember,'role'|'full_name'|'job_title'|'phone_e164'|'whatsapp_opted_in'>>)=>Promise<void>;onRemoveMember:(member:CompanyMember)=>Promise<void>;
 linkProjectId:string;setLinkProjectId:(id:string)=>void;inviteEmail:string;setInviteEmail:(email:string)=>void;inviteRole:CompanyRole;setInviteRole:(role:CompanyRole)=>void;assignProjectId:string;setAssignProjectId:(id:string)=>void;assignEmployeeId:string;setAssignEmployeeId:(id:string)=>void;
}) {
 const [name,setName]=useState(company.name)
 const [theme,setTheme]=useState<CompanyTheme>({...defaultCompanyTheme,...(company.theme??{})})
 const [editName,setEditName]=useState(false)
 const [weeklyMetrics,setWeeklyMetrics]=useState<CompanyWeeklyMetric[]>([])
 const [weeklyMetricsError,setWeeklyMetricsError]=useState('')
 useEffect(()=>{setName(company.name);setTheme({...defaultCompanyTheme,...(company.theme??{})})},[company.id,company.name,JSON.stringify(company.theme)])
 useEffect(()=>{let alive=true;async function load(){if(!isAdmin||!supabase){setWeeklyMetrics([]);return}const week=localIsoDate(mondayOf(new Date()));const {data,error}=await supabase.rpc('company_weekly_completion',{p_company_id:company.id,p_week_start:week});if(!alive)return;if(error){setWeeklyMetricsError(error.message);setWeeklyMetrics([])}else{setWeeklyMetricsError('');setWeeklyMetrics((data??[]) as CompanyWeeklyMetric[])}}void load();const timer=window.setInterval(()=>void load(),30000);return()=>{alive=false;window.clearInterval(timer)}},[company.id,isAdmin])
 const projectList=Array.from(new Map(rows.map(row=>[row.project_id,{id:row.project_id,name:row.project_name,description:row.project_description}])).values())
 const linkedIds=new Set(projectList.map(p=>p.id))
 const linkable=availableProjects.filter(p=>!linkedIds.has(p.id))
 const dates=rows.flatMap(row=>[row.stage_start,row.stage_end]).filter((d):d is string=>Boolean(d)).sort()
 const start=dates[0]??new Date().toISOString().slice(0,10)
 const end=dates[dates.length-1]??new Date(Date.now()+1000*60*60*24*180).toISOString().slice(0,10)
 const minDate=new Date(start+'T00:00:00'),maxDate=new Date(end+'T00:00:00')
 const span=Math.max(1,maxDate.getTime()-minDate.getTime())
 const uniqueRows=rows.filter(row=>row.stage_id)
 const dateLabel=(value:string|null)=>value?new Date(value+'T00:00:00').toLocaleDateString(undefined,{day:'2-digit',month:'short',year:'numeric'}):'—'
 const setThemeField=(key:keyof CompanyTheme,value:string)=>setTheme(current=>({...current,[key]:value,preset:'custom'}))
 const choosePreset=(preset:string)=>setTheme({...defaultCompanyTheme,...(themePresets[preset]??themePresets['blue-night']),preset})
 const doSaveTheme=()=>void onSave({theme})
 return <section className="company-profile-page">
   <div className="company-profile-hero panel">
    <div className="company-profile-identity">{company.logo_url?<img src={company.logo_url} alt={company.name+' logo'} className="company-profile-logo"/>:<div className="company-profile-logo logo-placeholder"><Building2 size={28}/></div>}<div><span className="eyebrow">COMPANY WORKSPACE</span><h1>{company.name} Project Hub</h1><p>{company.role==='admin'?'Admin access · You can manage this company profile.':'Employee access · Company profile is read-only for you.'}</p></div></div>
    {isAdmin&&<div className="company-profile-actions"><label className="outline-button upload-logo-button"><Upload size={15}/> Upload logo<input type="file" accept="image/*" hidden onChange={e=>{const f=e.target.files?.[0];if(f)void onLogoUpload(f);e.currentTarget.value=''}}/></label><button className="outline-button" onClick={()=>setEditName(v=>!v)}><Pencil size={14}/> Edit company name</button></div>}
   </div>
   {isAdmin&&editName&&<form className="panel form-stack company-name-editor" onSubmit={e=>{e.preventDefault();if(name.trim())void onSave({name:name.trim()}).then(()=>setEditName(false))}}><label>Company name<input value={name} onChange={e=>setName(e.target.value)} maxLength={120} required/></label><div><button className="primary" disabled={busy||!name.trim()}><Save size={14}/> Save company name</button></div></form>}
   {isAdmin&&<section className="panel company-efficiency-panel"><div className="panel-heading"><div><h2>Weekly employee completion</h2><p>Admin-only · completed assignments divided by assigned work for this week, including unfinished carryovers.</p></div><Activity size={19}/></div>{weeklyMetricsError?<p className="muted tiny">Apply supabase/weekly_work_dashboard.sql to enable this report: {weeklyMetricsError}</p>:<div className="compact-table-wrap"><table className="compact-table"><thead><tr><th>Employee / admin</th><th>Role</th><th>Completed</th><th>Assigned this week</th><th>Completion</th></tr></thead><tbody>{weeklyMetrics.map(metric=><tr key={metric.user_id}><td><b>{metric.employee_name}</b></td><td>{metric.role}</td><td>{metric.completed_work}</td><td>{metric.total_work}</td><td><div className="efficiency-cell"><b>{metric.completion_percent}%</b><span><i style={{width:metric.completion_percent+'%'}}/></span></div></td></tr>)}{weeklyMetrics.length===0&&<tr><td colSpan={5}>No assigned work recorded for this week yet.</td></tr>}</tbody></table></div>}</section>}
   <div className="company-metric-row"><div className="company-metric"><span>PROJECTS LINKED</span><b>{projectList.length}</b></div><div className="company-metric"><span>STAGES SHOWN</span><b>{uniqueRows.length}</b></div><div className="company-metric"><span>EMPLOYEES & ADMINS</span><b>{members.length}</b></div><div className="company-metric"><span>UPCOMING STAGE ENDS</span><b>{uniqueRows.filter(r=>r.stage_end&&r.stage_end>=new Date().toISOString().slice(0,10)).length}</b></div></div>
   <section className="panel">
    <div className="panel-heading"><div><h2>Combined project schedule</h2><p>Project and stage dates only. Task-level data is intentionally not shown here.</p></div><CalendarRange size={20}/></div>
    {isAdmin&&<div className="company-inline-actions"><label>Link an existing project<select value={linkProjectId} onChange={e=>setLinkProjectId(e.target.value)}><option value="">Select a personal project…</option>{linkable.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label><button className="primary compact" disabled={busy||!linkProjectId} onClick={()=>void onLinkProject()}><Link2 size={14}/> Add to company</button></div>}
    {projectList.length===0?<div className="company-empty"><FolderKanban size={25}/><h3>No company projects yet</h3><p>Personal projects remain separate. An admin can link an existing project above; its stages and dates will appear here without copying or changing the project.</p></div>:<>
     <div className="compact-table-wrap company-table-wrap"><table className="compact-table company-deadline-table"><thead><tr><th>Project name</th><th>Stage</th><th>Stage starts</th><th>Stage deadline</th><th>Assigned employees</th>{isAdmin&&<th>Actions</th>}</tr></thead><tbody>
      {rows.map((row,i)=><tr key={row.project_id+'-'+(row.stage_id??'no-stage')+'-'+i}><td className="company-project-name">{row.project_name}</td><td>{row.stage_name??'No stages yet'}</td><td>{dateLabel(row.stage_start)}</td><td>{dateLabel(row.stage_end)}</td><td>{row.assigned_employees?.length?row.assigned_employees.join(', '):<span className="muted">Unassigned</span>}</td>{isAdmin&&<td>{!rows.some((other,j)=>j<i&&other.project_id===row.project_id)&&<button className="icon-button small danger-icon" title="Unlink project from company" onClick={()=>void onUnlinkProject(row.project_id)}><Unlink size={14}/></button>}</td>}</tr>)}
     </tbody></table></div>
     <CompanyStageGantt rows={uniqueRows} start={minDate} end={maxDate} span={span}/>
    </>}
   </section>
   {isAdmin&&<section className="panel">
    <div className="panel-heading"><div><h2>Company appearance</h2><p>Changes apply to every member of {company.name}, including company invitation/login links.</p></div><Palette size={19}/></div>
    <div className="theme-preset-grid">{Object.entries(themePresets).map(([key,preset])=><button type="button" key={key} className={theme.preset===key?'theme-preset selected':'theme-preset'} onClick={()=>choosePreset(key)}><span className="theme-swatch-row"><i style={{background:preset.bg}}/><i style={{background:preset.panel}}/><i style={{background:preset.accent}}/><i style={{background:preset.text}}/></span><b>{key==='blue-night'?'Blue Night':key==='orange-light'?'Orange · Light':key==='orange-noir'?'Orange · Noir':key==='crimson-graphite'?'Crimson Graphite':key==='emerald-slate'?'Emerald Slate':'Violet Neon'}</b></button>)}</div>
    <div className="company-theme-colors">{([['bg','Background'],['panel','Panel'],['panel2','Raised panel'],['text','Main text'],['muted','Muted text'],['border','Borders'],['accent','Accent'],['accent2','Accent hover']] as [keyof CompanyTheme,string][]).map(([key,label])=><label key={key}>{label}<input type="color" value={theme[key]} onChange={e=>setThemeField(key,e.target.value)}/></label>)}</div>
    <div className="company-theme-preview" style={{background:theme.bg,color:theme.text,borderColor:theme.border}}><div><b>Live company theme preview</b><small>{company.name} Project Hub</small></div><span className="theme-preview-panel" style={{background:theme.panel,borderColor:theme.border}}>Project · Stage · Deadline</span><button className="primary" style={{background:theme.accent,borderColor:theme.accent}}>Company accent</button></div>
    <div className="settings-actions"><button className="outline-button" onClick={()=>choosePreset('blue-night')}><RefreshCw size={14}/> Reset colours</button><button className="primary" onClick={doSaveTheme} disabled={busy}><Save size={14}/> Save company theme</button></div>
   </section>}
   <section className="panel">
    <div className="panel-heading"><div><h2>Employees & admins</h2><p>Company roster and access. Project assignments do not alter project-level roles.</p></div><Users size={19}/></div>
    {isAdmin&&<form className="invite-form company-invite-form" onSubmit={onInvite}><div className="form-grid"><label>Invite by email<input type="email" autoComplete="email" value={inviteEmail} onChange={e=>setInviteEmail(e.target.value)} placeholder="partner@company.com" required/></label><label>Company role<select value={inviteRole} onChange={e=>setInviteRole(e.target.value as CompanyRole)}><option value="admin">Admin / partner</option><option value="employee">Employee</option></select></label></div><button className="primary compact" disabled={busy||!inviteEmail.trim()}><Mail size={15}/>{busy?'Sending…':'Send invitation email'}</button><p className="muted tiny">Sending requires the invite-company-member Edge Function plus email-provider secrets. Invitations only grant company membership; they do not add the person to individual projects.</p></form>}
    <div className="compact-table-wrap"><table className="compact-table company-members-table"><thead><tr><th>Employee name</th><th>Email</th><th>Job title</th>{isAdmin&&<th>WhatsApp number</th>}<th>Company role</th>{isAdmin&&<th>Actions</th>}</tr></thead><tbody>
     {members.map(member=><CompanyMemberEditor key={member.user_id} member={member} isAdmin={isAdmin} currentMember={member.user_id===company.created_by} onSave={patch=>onMemberUpdate(member,patch)} onRemove={()=>void onRemoveMember(member)}/>)}
     {members.length===0&&<tr><td colSpan={isAdmin?6:4}>No company members found.</td></tr>}
    </tbody></table></div>
   </section>
   {isAdmin&&members.some(m=>m.role==='employee')&&projectList.length>0&&<section className="panel"><div className="panel-heading"><div><h2>Assign employees to projects</h2><p>Set a company-level assignment so the employee appears in the combined deadline table.</p></div><UserCheck size={19}/></div>
    <div className="company-inline-actions"><label>Project<select value={assignProjectId} onChange={e=>setAssignProjectId(e.target.value)}><option value="">Choose project…</option>{projectList.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label><label>Employee<select value={assignEmployeeId} onChange={e=>setAssignEmployeeId(e.target.value)}><option value="">Choose employee…</option>{members.map(m=><option key={m.user_id} value={m.user_id}>{m.full_name} · {m.role}</option>)}</select></label><button className="primary compact" onClick={()=>void onAssign()} disabled={busy||!assignProjectId||!assignEmployeeId}><UserCheck size={14}/> Assign</button></div>
    {assignments.length>0&&<div className="assignment-chips">{assignments.map(a=><span key={a.project_id+'-'+a.user_id}>{projectList.find(p=>p.id===a.project_id)?.name??'Project'} · {members.find(m=>m.user_id===a.user_id)?.full_name??'Member'}</span>)}</div>}
   </section>}
   {!isAdmin&&<p className="muted tiny company-readonly-note"><LockKeyhole size={13}/> Only company admins can edit the company profile, theme, member roles, project links, and assignments.</p>}
 </section>
}

function CompanyMemberEditor({member,isAdmin,currentMember,onSave,onRemove}:{member:CompanyMember;isAdmin:boolean;currentMember:boolean;onSave:(patch:Partial<Pick<CompanyMember,'role'|'full_name'|'job_title'|'phone_e164'|'whatsapp_opted_in'>>)=>Promise<void>;onRemove:()=>void}) {
 const [name,setName]=useState(member.full_name)
 const [job,setJob]=useState(member.job_title??'')
 const [phone,setPhone]=useState(member.phone_e164??'')
 const [optedIn,setOptedIn]=useState(member.whatsapp_opted_in??false)
 useEffect(()=>{setName(member.full_name);setJob(member.job_title??'');setPhone(member.phone_e164??'');setOptedIn(member.whatsapp_opted_in??false)},[member.full_name,member.job_title,member.phone_e164,member.whatsapp_opted_in])
 const changed=name.trim()!==member.full_name||job!==(member.job_title??'')
 const phoneChanged=phone.trim()!==(member.phone_e164??'')
 return <tr><td>{isAdmin&&!currentMember?<input className="company-cell-input" aria-label="Employee name" value={name} onChange={e=>setName(e.target.value)} onBlur={()=>{if(changed&&name.trim())void onSave({full_name:name.trim(),job_title:job.trim()||null})}}/>:<b>{member.full_name}</b>}</td><td>{member.email}</td><td>{isAdmin&&!currentMember?<input className="company-cell-input" aria-label="Job title" value={job} placeholder="Add role/title" onChange={e=>setJob(e.target.value)} onBlur={()=>{if(changed)void onSave({full_name:name.trim()||member.full_name,job_title:job.trim()||null})}}/>:(member.job_title||'—')}</td>{isAdmin&&<td><input className="company-cell-input company-phone-input" aria-label="WhatsApp number in international format" value={phone} placeholder="+919876543210" onChange={e=>setPhone(e.target.value)} onBlur={()=>{if(phoneChanged)void onSave({phone_e164:phone.trim(),whatsapp_opted_in:optedIn})}}/>{<label className="company-whatsapp-optin"><input type="checkbox" checked={optedIn} disabled={!phone.trim()} onChange={e=>{setOptedIn(e.target.checked);void onSave({phone_e164:phone.trim(),whatsapp_opted_in:e.target.checked})}}/> Consent recorded</label>}</td>}<td>{isAdmin&&!currentMember?<select className="company-cell-select" aria-label="Company role" value={member.role} onChange={e=>void onSave({role:e.target.value as CompanyRole})}><option value="admin">Admin</option><option value="employee">Employee</option></select>:<span className={'company-role-pill '+member.role}>{member.role==='admin'?'Admin':'Employee'}</span>}</td>{isAdmin&&<td>{!currentMember&&<button className="icon-button small danger-icon" title="Remove from company" onClick={onRemove}><Trash2 size={14}/></button>}</td>}</tr>
}

function CompanyStageGantt({rows,start,end,span}:{rows:CompanyProjectRow[];start:Date;end:Date;span:number}) {
 const labels:string[]=[]
 const first=new Date(start.getFullYear(),start.getMonth(),1)
 for(let d=new Date(first);d<=end;d.setMonth(d.getMonth()+1))labels.push(d.toLocaleDateString(undefined,{month:'short',year:'2-digit'}))
 const total=Math.max(1,span)
 return <div className="company-gantt-section"><div className="company-gantt-head"><div><h3>Stage Gantt timeline</h3><p>Long-range company schedule, grouped by project and stage.</p></div><span>{start.toLocaleDateString(undefined,{month:'short',year:'numeric'})} — {end.toLocaleDateString(undefined,{month:'short',year:'numeric'})}</span></div>
  <div className="company-gantt-scroll"><div className="company-gantt-canvas" style={{minWidth:Math.max(1000,labels.length*92)+'px'}}><div className="company-gantt-axis"><div className="company-gantt-name">Project / Stage</div><div className="company-gantt-track">{labels.map((label,i)=><span key={label+'-'+i} style={{left:(i/Math.max(1,labels.length))*100+'%'}}>{label}</span>)}</div></div>
  {rows.map((row,index)=>{const a=row.stage_start?new Date(row.stage_start+'T00:00:00'):null,b=row.stage_end?new Date(row.stage_end+'T00:00:00'):a;let bar:{left:number;width:number}|null=null;if(a&&b){const left=(a.getTime()-start.getTime())/total*100,right=(b.getTime()-start.getTime())/total*100;bar={left:Math.max(0,Math.min(100,left)),width:Math.max(0.6,Math.min(100,right)-Math.max(0,left))}}return <div className="company-gantt-row" key={(row.project_id)+(row.stage_id??'')+'-'+index}><div className="company-gantt-name"><b>{row.project_name}</b><small>{row.stage_name??'No stage'}</small></div><div className="company-gantt-track">{bar?<span className="company-gantt-bar" style={{left:bar.left+'%',width:bar.width+'%'}} title={row.stage_name+' · '+(row.stage_start??'No start')+' to '+(row.stage_end??row.stage_start??'No deadline')}/>:<small className="company-gantt-undated">Dates not set</small>}</div></div>})}
  </div></div>
 </div>
}


type DailyWorkStatus = 'not_started' | 'ongoing' | 'completed'
type DailyWorkUpdate = { id:string; task_id:string; user_id:string; work_date:string; week_start:string; status:DailyWorkStatus; updated_at:string; is_automatic?:boolean }
function localIsoDate(date:Date) { return date.getFullYear()+'-'+String(date.getMonth()+1).padStart(2,'0')+'-'+String(date.getDate()).padStart(2,'0') }
function mondayOf(date:Date) { const d=new Date(date.getFullYear(),date.getMonth(),date.getDate());const day=d.getDay()||7;d.setDate(d.getDate()-day+1);return d }
function shiftIsoDate(iso:string,days:number) { const d=new Date(iso+'T12:00:00');d.setDate(d.getDate()+days);return localIsoDate(d) }
function WeeklyWorkDashboard({projects,tasks,stages,currentUserId,companyMembers,onOpenProject,onTaskStatusChanged}:{projects:Project[];tasks:Task[];stages:Stage[];currentUserId:string;companyMembers:CompanyMember[];onOpenProject:(id:string)=>void;onTaskStatusChanged:(taskId:string,status:TaskStatus)=>void}) {
  const today=localIsoDate(new Date()),weekStart=localIsoDate(mondayOf(new Date())),weekEnd=shiftIsoDate(weekStart,5)
  const [view,setView]=useState<'assigned_to_you'|'assigned_by_you'>('assigned_to_you')
  const [updates,setUpdates]=useState<DailyWorkUpdate[]>([]),[saving,setSaving]=useState<string|null>(null),[error,setError]=useState(''),[loaded,setLoaded]=useState(false)
  const projectById=useMemo(()=>new Map(projects.map(p=>[p.id,p])),[projects]),stageById=useMemo(()=>new Map(stages.map(s=>[s.id,s])),[stages])
  const updateKey=(taskId:string,date:string)=>taskId+'|'+date
  const updateMap=useMemo(()=>new Map(updates.map(u=>[updateKey(u.task_id,u.work_date),u.status])),[updates])
  const assignedToMe=useMemo(()=>tasks.filter(t=>t.assigned_to_user_id===currentUserId),[tasks,currentUserId])
  const assignedByMe=useMemo(()=>tasks.filter(t=>t.assigned_by_user_id===currentUserId&&t.assigned_to_user_id&&t.assigned_to_user_id!==currentUserId),[tasks,currentUserId])
  const currentList=view==='assigned_to_you'?assignedToMe:assignedByMe
  const weekTasks=useMemo(()=>currentList.filter(t=>{
    if(!t.start_date&&!t.due_date)return false
    const start=t.start_date??t.due_date??'9999-12-31',end=t.due_date??t.start_date??'0000-01-01'
    if(t.status==='done'&&end<weekStart)return false
    return start<=weekEnd&&(end>=weekStart||(t.status!=='done'&&end<weekStart))
  }),[currentList,weekStart,weekEnd])
  const scheduledDate=(task:Task)=>task.start_date&&task.start_date>=weekStart&&task.start_date<=weekEnd?task.start_date:task.start_date&&task.start_date<weekStart&&(task.due_date==null||task.due_date>=weekStart)?weekStart:task.due_date&&task.due_date>=weekStart&&task.due_date<=weekEnd?weekStart:(task.due_date??task.start_date??'')<weekStart?weekStart:weekStart
  const weekTaskIds=weekTasks.map(t=>t.id)
  useEffect(()=>{
    let alive=true
    async function load(){
      if(!supabase||!weekTaskIds.length){setUpdates([]);setLoaded(true);return}
      setLoaded(false);setError('')
      const {data,error:readError}=await supabase.from('task_daily_updates').select('*').eq('week_start',weekStart).in('task_id',weekTaskIds)
      if(!alive)return
      if(readError){setError(readError.message);setUpdates([])}else setUpdates((data??[]) as DailyWorkUpdate[])
      setLoaded(true)
    }
    void load();return()=>{alive=false}
  },[currentUserId,weekStart,weekTaskIds.join('|')])
  useEffect(()=>{
    if(!loaded||!supabase||view!=='assigned_to_you')return
    let cancelled=false
    async function markPastDays(){
      const missing:{task_id:string;user_id:string;work_date:string;week_start:string;status:DailyWorkStatus;updated_by:string;is_automatic:boolean}[]=[]
      for(const task of weekTasks.filter(t=>t.status!=='done'))for(let offset=0;offset<6;offset++){
        const date=shiftIsoDate(weekStart,offset)
        if(date>=today||date<scheduledDate(task))continue
        if(!updates.some(u=>u.task_id===task.id&&u.work_date===date))missing.push({task_id:task.id,user_id:currentUserId,work_date:date,week_start:weekStart,status:'not_started',updated_by:currentUserId,is_automatic:true})
      }
      if(missing.length&&!cancelled){
        const {data,error:writeError}=await supabase!.from('task_daily_updates').upsert(missing,{onConflict:'task_id,user_id,work_date'}).select('*')
        if(cancelled)return
        if(writeError){setError(writeError.message);return}
        if(data?.length)setUpdates(old=>[...old,...(data as DailyWorkUpdate[]).filter(n=>!old.some(o=>o.id===n.id))])
      }
    }
    void markPastDays();return()=>{cancelled=true}
  },[loaded,view,weekStart,today,weekTasks.map(t=>t.id).join('|'),updates.map(u=>u.task_id+'|'+u.work_date).join(';'),currentUserId])
  const setStatus=async(task:Task,date:string,status:DailyWorkStatus)=>{
    if(!supabase||view!=='assigned_to_you'||date!==today)return
    const key=updateKey(task.id,date);setSaving(key);setError('')
    const {data,error:writeError}=await supabase.rpc('set_task_daily_status',{p_task_id:task.id,p_work_date:date,p_status:status})
    if(writeError)setError(writeError.message);else {setUpdates(old=>[...old.filter(u=>!(u.task_id===task.id&&u.work_date===date)),data as DailyWorkUpdate]);onTaskStatusChanged(task.id,status==='completed'?'done':status==='ongoing'?'in_progress':'todo')}
    setSaving(null)
  }
  const statusAt=(task:Task,date:string):DailyWorkStatus=>updateMap.get(updateKey(task.id,date))??(task.status==='done'?'completed':'not_started')
  const completedDates=(task:Task)=>updates.filter(u=>u.task_id===task.id&&u.status==='completed').map(u=>u.work_date).sort()
  const taskIsOnDay=(task:Task,date:string)=>{
    if(date<scheduledDate(task)||date>weekEnd)return false
    const doneDates=completedDates(task)
    if(doneDates.some(doneDate=>doneDate<date))return false
    if(task.status==='done'&&!doneDates.includes(date))return false
    return true
  }
  const total=weekTasks.length,completed=weekTasks.filter(task=>task.status==='done'||updates.some(u=>u.task_id===task.id&&u.week_start===weekStart&&u.status==='completed')).length
  const efficiency=total?Math.round(completed/total*100):100
  const nameFor=(task:Task)=>{if(task.assigned_to_user_id===currentUserId)return 'You';const member=companyMembers.find(m=>m.user_id===task.assigned_to_user_id);return member?.full_name||member?.email||task.assigned_to_name||('Member '+(task.assigned_to_user_id??'').slice(0,8))}
  const displayFor=(task:Task)=>({project:projectById.get(task.project_id)?.name??'Project',stage:stageById.get(task.stage_id)?.name??'Stage'})
  const days=Array.from({length:6},(_,i)=>shiftIsoDate(weekStart,i)),dayName=(iso:string)=>new Date(iso+'T12:00:00').toLocaleDateString(undefined,{weekday:'long'}),dateShort=(iso:string)=>new Date(iso+'T12:00:00').toLocaleDateString(undefined,{day:'numeric',month:'short'})
  const dayTasks=(date:string)=>weekTasks.filter(task=>taskIsOnDay(task,date)).sort((a,b)=>(a.due_date??a.start_date??'9999').localeCompare(b.due_date??b.start_date??'9999'))
  const projectGroups=Array.from(new Map(weekTasks.map(task=>[task.project_id,{id:task.project_id,name:projectById.get(task.project_id)?.name??'Project'}])).values())
  return <section className="weekly-work panel">
    <div className="weekly-work-heading"><div><span className="eyebrow">THIS WEEK · {dateShort(weekStart)} – {dateShort(weekEnd)}</span><h2>Work planner</h2><p>Only your assignments appear here. Unfinished work carries forward each day.</p></div><div className="weekly-efficiency"><b>{efficiency}%</b><small>Weekly completion</small><span>{completed}/{total} work items</span></div></div>
    <div className="weekly-work-tabs"><button className={view==='assigned_to_you'?'selected':''} onClick={()=>setView('assigned_to_you')}>Work assigned to you</button><button className={view==='assigned_by_you'?'selected':''} onClick={()=>setView('assigned_by_you')}>Work you assigned</button><span className="weekly-work-week">Resets Monday · Mon–Sat</span></div>
    {error&&<p className="weekly-work-error">Weekly tracking needs the latest migration, or access was denied: {error}</p>}
    {projectGroups.length>0&&<div className="weekly-project-grid">{projectGroups.map(group=><article className="weekly-project-card" key={group.id}><button className="weekly-project-title" onClick={()=>onOpenProject(group.id)}>{group.name}<ArrowUpRight size={14}/></button><ul>{weekTasks.filter(t=>t.project_id===group.id).map(task=><li key={task.id}><span className={'weekly-mini-status '+statusAt(task,scheduledDate(task))}/><span>{task.title}<small>{task.due_date?'Due '+dateShort(task.due_date):task.start_date?'Starts '+dateShort(task.start_date):'Carryover'} · {displayFor(task).stage}</small></span><b>{task.status==='done'?'Done':task.due_date&&task.due_date<today?'Overdue':statusAt(task,scheduledDate(task))==='ongoing'?'Ongoing':'Pending'}</b></li>)}</ul></article>)}</div>}
    <div className="weekly-day-list"><div className="weekly-day-heading"><h3>Daily work list</h3><span>Past unmarked days become “Not started” automatically.</span></div><div className="weekly-day-grid">{days.map(date=>{
      const items=dayTasks(date)
      return <section className={'weekly-day-card '+(date===today?'today':'')} key={date}><header><b>{dayName(date)}</b><span>{dateShort(date)}</span></header>
        {items.length===0?<p className="weekly-day-empty">No work scheduled</p>:items.map(task=>{
          const st=statusAt(task,date),info=displayFor(task),key=updateKey(task.id,date),readOnly=view==='assigned_by_you'||date!==today
          return <article className="weekly-day-task" key={task.id}><div className="weekly-task-meta"><b>{info.project}</b><small>{info.stage}{task.due_date?' · Due '+dateShort(task.due_date):''}</small></div><div className="weekly-task-name">{task.title}</div>{view==='assigned_by_you'&&<div className="weekly-assignee">Assigned to: {nameFor(task)}</div>}
            <div className="weekly-task-status"><select aria-label={'Status for '+task.title+' on '+date} disabled={readOnly||saving===key} value={st} onChange={e=>void setStatus(task,date,e.target.value as DailyWorkStatus)}><option value="not_started">Not started</option><option value="ongoing">Ongoing</option><option value="completed">Completed</option></select>{saving===key&&<LoaderCircle size={13} className="spin"/>}</div>
            {date<today&&st==='not_started'&&<small className="weekly-carry-note">Carried forward</small>}
          </article>
        })}
      </section>
    })}</div></div>
    {!weekTasks.length&&<div className="weekly-empty"><CalendarDays size={20}/><span>No assigned work falls within this week yet. Add dates and assign tasks to project members to populate this planner.</span></div>}
    {!loaded&&<small className="muted">Loading daily updates…</small>}
  </section>
}

function GlobalDashboard({projects,currentUserId,currentUserEmail,companyMembers,onOpenProject,onCreateProject}:{projects:Project[];currentUserId:string;currentUserEmail:string;companyMembers:CompanyMember[];onOpenProject:(id:string)=>void;onCreateProject:()=>void}) {
  const [stages,setStages]=useState<Stage[]>([])
  const [tasks,setTasks]=useState<Task[]>([])
  const [loading,setLoading]=useState(true)
  useEffect(()=>{
    let alive=true
    async function load(){
      if(!supabase||!projects.length){setStages([]);setTasks([]);setLoading(false);return}
      setLoading(true)
      const ids=projects.map(p=>p.id)
      const [s,t]=await Promise.all([
        supabase.from('project_stages').select('*').in('project_id',ids).order('sort_order',{ascending:true}),
        supabase.from('project_tasks').select('*').in('project_id',ids).order('sort_order',{ascending:true})
      ])
      if(alive){setStages((s.data??[]) as Stage[]);setTasks((t.data??[]) as Task[]);setLoading(false)}
    }
    void load()
    return ()=>{alive=false}
  },[projects.map(p=>p.id).join('|')])
  return <section className="global-dashboard">
    <div className="dashboard-welcome"><div><span className="eyebrow"><span className="live-dot"/> CKPC PROJECT HUB</span><h1>Your projects, <span>at a glance.</span></h1><p>Track every stage and see ongoing, pending and completed work across your projects.</p></div><button className="primary" onClick={onCreateProject}><Plus size={16}/> New project</button></div>
    <WeeklyWorkDashboard projects={projects} tasks={tasks} stages={stages} currentUserId={currentUserId} companyMembers={companyMembers} onOpenProject={onOpenProject} onTaskStatusChanged={(taskId,status)=>setTasks(current=>current.map(task=>task.id===taskId?{...task,status}:task))}/>
    <div className="dashboard-summary"><div><span>PROJECTS</span><b>{projects.length}</b></div><div><span>ACTIVE TASKS</span><b>{tasks.filter(t=>t.status==='in_progress').length}</b></div><div><span>PENDING TASKS</span><b>{tasks.filter(t=>t.status==='todo').length}</b></div><div><span>COMPLETED</span><b>{tasks.filter(t=>t.status==='done').length}</b></div></div>
    {loading?<div className="panel dashboard-loading"><LoaderCircle className="spin"/> Loading project summaries…</div>:projects.length===0?<div className="panel dashboard-empty"><FolderKanban size={28}/><h2>No projects yet</h2><p>Create your first project to see stages and task progress here.</p><button className="primary" onClick={onCreateProject}><Plus size={16}/> Create project</button></div>:<div className="dashboard-project-grid">{projects.map((project,index)=>{
      const ps=stages.filter(s=>s.project_id===project.id),pt=tasks.filter(t=>t.project_id===project.id),done=pt.filter(t=>t.status==='done').length,pct=pt.length?Math.round(done/pt.length*100):0
      const circumference=2*Math.PI*22
      return <article className="dashboard-project-card" key={project.id}>
        <button type="button" className="dashboard-project-head" onClick={()=>onOpenProject(project.id)}><span className={'project-ring ring-'+(index%4)}><svg viewBox="0 0 54 54" aria-label={pct+'% completed'}><circle className="ring-track" cx="27" cy="27" r="22"/><circle className="ring-value" cx="27" cy="27" r="22" strokeDasharray={circumference} strokeDashoffset={circumference*(1-pct/100)}/><text x="27" y="30">{pct}%</text></svg></span><span className="dashboard-project-title"><b>{project.name}</b><small>{pt.length} tasks · {ps.length} stages</small></span><span className="dashboard-project-arrow">↗</span></button>
        <div className="dashboard-project-bar"><span style={{width:pct+'%'}}/></div>
        <div className="dashboard-stage-list">{ps.map(stage=>{const st=pt.filter(t=>t.stage_id===stage.id);return <button key={stage.id} className="dashboard-stage-row" onClick={()=>onOpenProject(project.id)}><span className="dashboard-stage-name">{stage.name}</span><span className="task-count ongoing"><i/>{st.filter(t=>t.status==='in_progress').length}<small>ongoing</small></span><span className="task-count pending"><i/>{st.filter(t=>t.status==='todo').length}<small>pending</small></span><span className="task-count completed"><i/>{st.filter(t=>t.status==='done').length}<small>done</small></span></button>})}{ps.length===0&&<p className="dashboard-no-stages">No stages added yet.</p>}</div>
      </article>
    })}</div>}
  </section>
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

function StageOverview({stages,tasks,members,currentUserId,canManage,onOpen,onEdit,onDelete,onAddStage,onReorder,onCreateStageInline,onUpdateStage,onRename}:{stages:Stage[];tasks:Task[];members:Member[];currentUserId:string;canManage:boolean;onOpen:(id:string)=>void;onEdit:(stage:Stage)=>void;onDelete:(stage:Stage)=>void;onAddStage:()=>void;onReorder:(stages:Stage[])=>void;onCreateStageInline:(draft:{name:string;start_date:string;end_date:string;description:string;assigned_to_user_id?:string;week_offset?:number})=>Promise<boolean>;onUpdateStage:(stage:Stage,patch:Partial<Pick<Stage,'start_date'|'end_date'|'assigned_to_user_id'|'assigned_by_user_id'|'description'>>) => Promise<boolean>;onRename:(stage:Stage,name:string)=>Promise<boolean>}) {
  const [adding,setAdding]=useState(false),[draft,setDraft]=useState({name:'',start_date:'',end_date:'',description:'',assigned_to_user_id:currentUserId,week_offset:-1})
  const [sort,setSort]=useState('custom')
  const [dragged,setDragged]=useState<string|null>(null),[renamingId,setRenamingId]=useState<string|null>(null),[renamingValue,setRenamingValue]=useState(''),[renameBusy,setRenameBusy]=useState(false),[descriptionDrafts,setDescriptionDrafts]=useState<Record<string,string>>({})
  const lateTasks=stages.flatMap(stage=>getStageProgress(tasks.filter(task=>task.stage_id===stage.id)).late.map(item=>({...item,stage}))).sort((a,b)=>b.days-a.days)
  const ordered=[...stages].sort((a,b)=>sort==='custom'?(a.sort_order??0)-(b.sort_order??0):sort==='name'?a.name.localeCompare(b.name):sort==='start'?((a.start_date??'9999').localeCompare(b.start_date??'9999')):sort==='end'?((a.end_date??'9999').localeCompare(b.end_date??'9999')):sort==='tasks'?tasks.filter(t=>t.stage_id===b.id).length-tasks.filter(t=>t.stage_id===a.id).length:0)
  const move=(target:string)=>{if(!dragged||dragged===target)return;const next=[...ordered],from=next.findIndex(s=>s.id===dragged),to=next.findIndex(s=>s.id===target);if(from<0||to<0)return;const [item]=next.splice(from,1);next.splice(to,0,item);setSort('custom');onReorder(next);setDragged(null)}
  return <div className="stages-overview">
    <section className="panel compact-table-panel"><div className="panel-heading"><div><h2>Stages</h2><p>Compact project stage table. Choose a sort or drag rows to save a custom order.</p></div><div className="panel-heading-actions"><label className="sort-control">Sort <select value={sort} onChange={e=>setSort(e.target.value)}><option value="custom">Custom order</option><option value="name">Stage name</option><option value="start">Start date</option><option value="end">End date</option><option value="tasks">Task count</option></select></label><span className="count-pill">{stages.length} stages</span></div></div>
      <div className="compact-table-wrap"><table className="compact-table stage-sheet"><thead><tr><th>Stage name</th><th>Start date</th><th>End date</th><th>Assigned by</th><th>Assignee</th><th>Tasks</th><th>Completed %</th><th>Ongoing %</th><th>Pending %</th><th>Description</th><th>Actions</th></tr></thead><tbody>
      {ordered.map((stage,index)=>{const list=tasks.filter(t=>t.stage_id===stage.id),p=getStageProgress(list),progressClass=(value:number)=>value===100?'stage-progress-full':value===0?'stage-progress-zero':'stage-progress-partial';return <tr key={stage.id} draggable={canManage&&sort==='custom'} onDragStart={()=>setDragged(stage.id)} onDragOver={e=>{if(sort==='custom')e.preventDefault()}} onDrop={()=>move(stage.id)} onDragEnd={()=>setDragged(null)} className={dragged===stage.id?'dragging-row':''}>
        <td><div className="stage-name-cell">{renamingId===stage.id?<><input autoFocus className="task-grid-editor stage-name-editor" aria-label="Stage name" value={renamingValue} onChange={e=>setRenamingValue(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();void(async()=>{setRenameBusy(true);const ok=await onRename(stage,renamingValue);setRenameBusy(false);if(ok)setRenamingId(null)})()}else if(e.key==='Escape'){setRenamingId(null);setRenamingValue('')}}}/><button type="button" className="icon-button small" title="Save stage name" disabled={renameBusy||!renamingValue.trim()} onClick={()=>{void(async()=>{setRenameBusy(true);const ok=await onRename(stage,renamingValue);setRenameBusy(false);if(ok)setRenamingId(null)})()}}><Check size={13}/></button><button type="button" className="icon-button small" title="Cancel" onClick={()=>{setRenamingId(null);setRenamingValue('')}}><X size={13}/></button></>:<><button className="sheet-name" onDoubleClick={()=>onOpen(stage.id)} title="Double-click to open stage">{sort==='custom'&&canManage?<span className="drag-grip" title="Drag to reorder">⠿ </span>:null}{stage.name}</button>{canManage&&<button type="button" className="icon-button small stage-name-pencil" title="Edit stage name" aria-label={`Edit name for ${stage.name}`} onClick={()=>{setRenamingId(stage.id);setRenamingValue(stage.name)}}><Pencil size={13}/></button>}</>}</div></td>
        <td>{canManage?<input className="task-grid-editor" type="date" aria-label={`${stage.name} start date`} value={stage.start_date||''} max={stage.end_date||undefined} onChange={e=>{void onUpdateStage(stage,{start_date:e.target.value||null})}}/>:(stage.start_date||'—')}</td><td>{canManage?<input className="task-grid-editor" type="date" aria-label={`${stage.name} end date`} value={stage.end_date||''} min={stage.start_date||undefined} onChange={e=>{void onUpdateStage(stage,{end_date:e.target.value||null})}}/>:(stage.end_date||'—')}</td><td>{members.find(m=>m.user_id===(stage.assigned_by_user_id||stage.created_by))?.email||((stage.assigned_by_user_id||stage.created_by)===currentUserId?'You':'—')}</td><td>{canManage?<select className="task-grid-editor" aria-label={`${stage.name} assignee`} value={stage.assigned_to_user_id||currentUserId} onChange={e=>{void onUpdateStage(stage,{assigned_to_user_id:e.target.value||currentUserId,assigned_by_user_id:currentUserId})}}>{members.map(m=><option key={m.user_id} value={m.user_id}>{m.email||(m.user_id===currentUserId?'You':'Member '+m.user_id.slice(0,8))}</option>)}</select>:(members.find(m=>m.user_id===stage.assigned_to_user_id)?.email||(stage.assigned_to_user_id===currentUserId?'You':'—'))}</td><td>{list.length}</td>
        <td className={`stage-progress-cell ${progressClass(p.completed)}`}>{list.length?p.completed+'%':'—'}</td>
        <td className={`stage-progress-cell ${progressClass(p.ongoing)}`}>{list.length?p.ongoing+'%':'—'}</td>
        <td className={`stage-progress-cell ${progressClass(p.toStart)}`}>{list.length?p.toStart+'%':'—'}</td>
        <td className="sheet-description">{canManage?<input className="task-grid-editor" aria-label={`${stage.name} description`} placeholder="Description" value={descriptionDrafts[stage.id]??stage.description??''} onBlur={e=>{if(e.currentTarget.value!==(stage.description||''))void onUpdateStage(stage,{description:e.currentTarget.value||null} as Partial<Pick<Stage,'start_date'|'end_date'|'assigned_to_user_id'|'assigned_by_user_id'|'description'>>)}} onChange={e=>setDescriptionDrafts(current=>({...current,[stage.id]:e.target.value}))}/>:(stage.description||'—')}</td>
        <td><div className="sheet-actions"><button className="icon-button small" title="Double-click the stage name to open it" aria-label="Double-click stage name to open"><Eye size={13}/></button>{canManage&&<button className="icon-button small danger-icon" title="Delete stage" onClick={()=>onDelete(stage)}><Trash2 size={13}/></button>}</div></td>
      </tr>})}
      {canManage&&<>{adding?<tr className="stage-new-row"><td><input autoFocus className="task-grid-editor" placeholder="Stage name" value={draft.name} onChange={e=>setDraft(d=>({...d,name:e.target.value}))}/><select className="task-grid-editor stage-week-select" aria-label="Choose stage week" value={String(draft.week_offset)} onChange={e=>{const offset=Number(e.target.value);const dates=offset>=0?getStageWeekDates(offset):{start:'',end:''};setDraft(d=>({...d,week_offset:offset,start_date:dates.start,end_date:dates.end}))}}><option value="-1">Custom dates</option><option value="0">This week</option><option value="1">Next week</option><option value="2">Week after next</option></select></td><td><input className="task-grid-editor" type="date" max={draft.end_date||undefined} value={draft.start_date} onChange={e=>setDraft(d=>({...d,start_date:e.target.value,week_offset:-1}))}/></td><td><input className="task-grid-editor" type="date" min={draft.start_date||undefined} value={draft.end_date} onChange={e=>setDraft(d=>({...d,end_date:e.target.value,week_offset:-1}))}/></td><td>You</td><td><select className="task-grid-editor" value={draft.assigned_to_user_id||currentUserId} onChange={e=>setDraft(d=>({...d,assigned_to_user_id:e.target.value||currentUserId}))}>{members.map(m=><option key={m.user_id} value={m.user_id}>{m.email||(m.user_id===currentUserId?'You':'Member '+m.user_id.slice(0,8))}</option>)}</select></td><td colSpan={4}>Progress is calculated after saving</td><td><input className="task-grid-editor" placeholder="Description" value={draft.description} onChange={e=>setDraft(d=>({...d,description:e.target.value}))}/></td><td><div className="sheet-actions"><button type="button" className="icon-button small" title="Save stage" onClick={()=>{void(async()=>{const ok=await onCreateStageInline(draft);if(ok){setAdding(false);setDraft({name:'',start_date:'',end_date:'',description:'',assigned_to_user_id:currentUserId,week_offset:-1})}})()}}><Check size={13}/></button><button type="button" className="icon-button small" title="Cancel" onClick={()=>setAdding(false)}><X size={13}/></button></div></td></tr>:<tr className="sheet-add-row"><td colSpan={11}><button type="button" className="sheet-add-button" onClick={()=>setAdding(true)}><Plus size={15}/> Add stage</button></td></tr>}</>}
      </tbody></table></div>
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
    {!stages.length?<Empty icon={<GanttChartSquare/>} title="No stage timeline yet" body="Create stages and schedule their tasks to see the project timeline."/>:<div className="gantt-scroll" title="Scroll to zoom; drag horizontally to pan" onWheel={e=>{e.preventDefault();setRangeDays(v=>Math.max(7,Math.min(3650,Math.round(v*(e.deltaY>0?1.2:0.83)))));setShift(0)}}><div className="gantt-canvas" style={{minWidth:`${Math.max(900,tickCount*(rangeDays<=30?42:rangeDays<=183?76:110))}px`}}>
      <div className="gantt-head"><div className="gantt-task-name gantt-sticky-name">Stage / schedule</div><div className="gantt-days">{ticks.map((tick,i)=><div key={`${dateKey(tick.date)}-${i}`} className="gantt-day" style={{left:`${Math.max(0,dayOffset(tick.date)/rangeDays*100)}%`}}><b>{tick.label}</b><small>{tick.sub}</small></div>)}</div></div>
      {stages.map(stage=>{const childTasks=tasks.filter(task=>task.stage_id===stage.id),p=getStageProgress(childTasks),rawStart=parseLocalDate(stage.start_date)??p.start,rawEnd=parseLocalDate(stage.end_date)??p.end;let bar:{left:number;width:number}|null=null;if(rawStart&&rawEnd&&rawEnd>=rangeStart&&rawStart<=rangeEnd){const start=Math.max(0,dayOffset(rawStart)),end=Math.min(rangeDays-1,dayOffset(rawEnd));bar={left:start/rangeDays*100,width:Math.max(.7,(end-start+1)/rangeDays*100)}}
        return <div className="gantt-row stage-timeline-row" key={stage.id} role="button" tabIndex={0} onDoubleClick={()=>onOpen(stage.id)} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();onOpen(stage.id)}}}><div className="gantt-task-name gantt-sticky-name"><b>{stage.name}</b></div><div className="gantt-track stage-summary-track" style={{backgroundSize:`${100/tickCount}% 100%`}}>{bar&&<div className="gantt-bar stage-summary-bar" title={`${stage.name}: ${p.completed}% complete`} style={{left:`${bar.left}%`,width:`${bar.width}%`,background:`linear-gradient(90deg,#5dd7b0 0% ${p.completed}%,#9a8cff ${p.completed}% 100%)`}}/>}{!bar&&<span className="gantt-outside-label">{childTasks.length?'Dates outside window or incomplete':'Add dated tasks to schedule'}</span>}</div></div>})}
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
function getStageWeekDates(weekOffset:number) { const now=new Date(); const day=(now.getDay()+6)%7; const monday=new Date(now.getFullYear(),now.getMonth(),now.getDate()-day+weekOffset*7); const saturday=new Date(monday); saturday.setDate(monday.getDate()+5); const fmt=(d:Date)=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; return {start:fmt(monday),end:fmt(saturday)} }

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
    {tasks.length===0 ? <Empty icon={<GanttChartSquare/>} title="Your timeline is empty" body="Create tasks with start and due dates to build your Gantt chart."/> : <div className="gantt-scroll" title="Scroll to zoom; drag horizontally to pan" onWheel={e=>{e.preventDefault();setRangeDays(v=>Math.max(7,Math.min(3650,Math.round(v*(e.deltaY>0?1.2:0.83)))));setShift(0)}} onMouseDown={e=>{if(e.button===0){panMoved.current=false;setPan({x:e.clientX,left:e.currentTarget.scrollLeft})}}} onMouseMove={e=>{if(pan){const dx=e.clientX-pan.x;if(Math.abs(dx)>4)panMoved.current=true;e.currentTarget.scrollLeft=pan.left-dx}}} onMouseUp={()=>setPan(null)} onMouseLeave={()=>setPan(null)} onClickCapture={e=>{if(panMoved.current){e.stopPropagation();panMoved.current=false}}}><div className="gantt-canvas" style={{minWidth:`${Math.max(900, tickCount * (rangeDays<=30 ? 30 : rangeDays<=183 ? 38 : 52))}px`}}>
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
function Personalise({ prefs, save, profileName, setProfileName, email, companyThemeLocked = false, onOpenCompany }: { prefs: typeof initialPrefs; save: (p: typeof initialPrefs)=>void; profileName: string; setProfileName: (s:string)=>void; email: string; companyThemeLocked?: boolean; onOpenCompany?: () => void }) {
  const [draft, setDraft] = useState(prefs)
  useEffect(()=>setDraft(prefs),[prefs])
  const update = (key: keyof typeof initialPrefs, value: string) => setDraft(current=>({ ...current, [key]: value }))
  const reset = () => { setDraft(initialPrefs); save(initialPrefs); setProfileName('') }
  return <section className="panel settings-panel"><div className="panel-heading"><div><h2>Personalise your workspace</h2><p>Update your display name and personal preferences.</p></div><Palette size={19}/></div><div className="settings-body"><h3>Profile</h3><div className="form-grid"><label>Display name<input value={profileName} onChange={e=>setProfileName(e.target.value)} placeholder={email.split('@')[0]} /></label><label>Email address<input value={email} readOnly /></label></div>
   {companyThemeLocked ? <div className="company-theme-locked"><h3>Company appearance</h3><p>Your active company controls the shared colors, logo, and preset for all company members. Only admins can change them; individual browser preferences cannot override company branding.</p><button type="button" className="outline-button" onClick={onOpenCompany}><Palette size={14}/> View company appearance</button></div> : <><h3>Appearance</h3><div className="settings-controls"><label>Background colour<input type="color" value={draft.bg} onChange={e=>update('bg',e.target.value)}/></label><label>Panel colour<input type="color" value={draft.panel} onChange={e=>update('panel',e.target.value)}/></label><label>Text colour<input type="color" value={draft.text} onChange={e=>update('text',e.target.value)}/></label><label>Accent colour<input type="color" value={draft.accent} onChange={e=>update('accent',e.target.value)}/></label><label>Text size<select value={draft.fontSize} onChange={e=>update('fontSize',e.target.value)}><option value="12">Small</option><option value="14">Default</option><option value="16">Large</option><option value="18">Extra large</option></select></label><label>Theme<select value={draft.mode} onChange={e=>update('mode',e.target.value)}><option value="dark">Dark</option><option value="light">Light</option></select></label></div><div className="preview-card" style={{background:draft.bg,color:draft.text,borderColor:draft.accent}}><div className="preview-heading"><span className="preview-dot" style={{background:draft.accent}}/> Live preview · not applied yet</div><div className="preview-surface" style={{background:draft.panel}}><b style={{color:draft.text}}>Your workspace, your style</b><p style={{color:draft.text}}>This is how panels and text will look.</p><button className="primary" style={{background:draft.accent,borderColor:draft.accent}}>Accent button</button></div></div><div className="settings-actions"><button className="outline-button" onClick={reset}><RefreshCw size={14}/> Reset appearance</button><button className="primary" onClick={()=>save(draft)}><Check size={15}/> Apply theme</button></div><p className="settings-save-note">Your personal theme is saved in this browser and will be restored when you return on this device.</p></>}
  </div></section>
}

function SetupScreen() {
  return <main className="setup-shell"><div className="setup-card"><div className="brand-mark"><Command size={21}/></div><span className="eyebrow">ALMOST THERE</span><h1>Connect your workspace</h1><p>ProjectHub is ready to run. Add your free Supabase project credentials to connect sign-in, projects, and secure team data.</p><ol><li>Create a project at <a href="https://supabase.com" target="_blank" rel="noreferrer">supabase.com</a>.</li><li>Run the SQL in <code>supabase/schema.sql</code> using the Supabase SQL Editor.</li><li>Copy <code>.env.example</code> to <code>.env.local</code> and fill in your Project URL and publishable/anon key.</li><li>Run <code>npm install</code> and <code>npm run dev</code>.</li></ol><div className="setup-warning"><LockKeyhole size={16}/> Never put your Supabase service-role key in frontend code.</div><p className="muted tiny">After configuring the environment, refresh this page.</p></div></main>
}
