import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import {
  Activity,
  FileText,
  History,
  Monitor,
  ChevronLeft,
  ChevronRight,
  CircuitBoard,
  Bell,
  Search,
  LayoutDashboard,
  Boxes,
  GitBranch,
  Shield,
  DollarSign,
  AlertTriangle,
  ClipboardCheck,
} from 'lucide-react'
import { useApp } from '../context/AppContext.jsx'

// ─── nav items config ─────────────────────────────────────────────────────────

function NavItem({ icon: Icon, label, to, active, disabled, collapsed }) {
  const [hovered, setHovered] = useState(false)

  const content = (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="relative"
    >
      <div
        className={`
          w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium
          transition-all duration-200 relative
          ${active
            ? 'bg-sidebar-accent text-sidebar-foreground'
            : disabled
              ? 'text-muted-foreground opacity-35 cursor-not-allowed'
              : 'text-muted-foreground hover:text-sidebar-foreground hover:bg-sidebar-accent/50 cursor-pointer'
          }
          ${collapsed ? 'justify-center px-2' : ''}
        `}
      >
        {/* Active left indicator bar */}
        <span
          className={`
            absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 rounded-r-full bg-accent
            transition-all duration-300
            ${active ? 'opacity-100' : 'opacity-0'}
          `}
        />

        <Icon
          className={`w-5 h-5 shrink-0 transition-transform duration-200 ${
            active ? 'text-accent' : hovered && !disabled ? 'scale-110' : ''
          }`}
        />

        {!collapsed && (
          <span className="whitespace-nowrap transition-all duration-300">
            {label}
          </span>
        )}
      </div>

      {/* Tooltip when collapsed */}
      {hovered && !disabled && collapsed && (
        <div
          className="absolute left-14 top-1/2 -translate-y-1/2 z-50 pointer-events-none"
          style={{ whiteSpace: 'nowrap' }}
        >
          <div className="bg-card border border-border text-foreground text-xs rounded-lg px-2.5 py-1.5 shadow-lg">
            {label}
          </div>
        </div>
      )}
    </div>
  )

  if (disabled) return content
  return <Link to={to} style={{ textDecoration: 'none' }}>{content}</Link>
}

// ─── Shell ────────────────────────────────────────────────────────────────────

export default function Shell({ children, statusBadge }) {
  const location = useLocation()
  const { jobId, githubRepo } = useApp()
  const [collapsed, setCollapsed] = useState(false)
  const [searchFocused, setSearchFocused] = useState(false)

  const pathMatch = location.pathname.match(/^\/(?:run|overview|services|diagram|security|cost|plan|architecture)\/([^/]+)/)
  const inferredJobId = pathMatch ? pathMatch[1] : null
  const activeJobId = jobId || inferredJobId

  const navItems = []

  if (location.pathname.startsWith('/run/')) {
    navItems.push({
      icon: Activity,
      label: 'Analysis',
      to: location.pathname,
      match: '/run/',
    })
  }

  navItems.push(
    {
      icon: LayoutDashboard,
      label: 'Overview',
      to: activeJobId ? `/overview/${activeJobId}` : '#',
      disabled: !activeJobId,
      match: '/overview/',
    },
    {
      icon: Boxes,
      label: 'Services',
      to: activeJobId ? `/services/${activeJobId}` : '#',
      disabled: !activeJobId,
      match: '/services/',
    },
    {
      icon: GitBranch,
      label: 'Architecture',
      to: activeJobId ? `/diagram/${activeJobId}` : '#',
      disabled: !activeJobId,
      match: '/diagram/',
    },
    {
      icon: Shield,
      label: 'Security',
      to: activeJobId ? `/security/${activeJobId}` : '#',
      disabled: !activeJobId,
      match: '/security/',
    },
    {
      icon: AlertTriangle,
      label: 'Risk Register',
      to: activeJobId ? `/risks/${activeJobId}` : '#',
      disabled: !activeJobId,
      match: '/risks/',
    },
    {
      icon: ClipboardCheck,
      label: 'Compliance',
      to: activeJobId ? `/compliance/${activeJobId}` : '#',
      disabled: !activeJobId,
      match: '/compliance/',
    },
    {
      icon: DollarSign,
      label: 'Cost',
      to: activeJobId ? `/cost/${activeJobId}` : '#',
      disabled: !activeJobId,
      match: '/cost/',
    },
    {
      icon: FileText,
      label: 'Plan',
      to: activeJobId ? `/plan/${activeJobId}` : '#',
      disabled: !activeJobId,
      match: '/plan/',
    },
    {
      icon: Monitor,
      label: 'Monitor',
      to: '/monitor',
      match: '/monitor',
    },
    {
      icon: History,
      label: 'History',
      to: '/history',
      match: '/history',
    }
  )

  // Infer current section title for the header
  const sectionTitles = {
    '/run/': 'Analysis in Progress',
    '/overview/': 'Overview',
    '/services/': 'Services Map',
    '/diagram/': 'Architecture Diagram',
    '/security/': 'Security',
    '/risks/': 'Risk Register',
    '/compliance/': 'Compliance Tracker',
    '/cost/': 'Cost Analysis',
    '/plan/': 'Infrastructure Plan',
    '/monitor': 'Live Monitoring',
    '/history': 'Run History',
  }
  let pageTitle = 'Dashboard'
  for (const [prefix, title] of Object.entries(sectionTitles)) {
    if (location.pathname.startsWith(prefix) || location.pathname === prefix.replace('/', '')) {
      pageTitle = title
      break
    }
  }

  const repoDisplay = githubRepo
    ? githubRepo.replace(/^https?:\/\//, '')
    : 'No repository connected'

  return (
    <div className="flex min-h-screen bg-background">

      {/* ── Sidebar ── */}
      <aside
        className={`
          fixed left-0 top-0 z-40 h-screen bg-sidebar border-r border-sidebar-border
          flex flex-col transition-all duration-300 ease-out
          ${collapsed ? 'w-[72px]' : 'w-[260px]'}
        `}
      >
        {/* Logo */}
        <div className="h-16 flex items-center px-4 border-b border-sidebar-border">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 bg-accent/10 border border-accent/20">
              <CircuitBoard className="w-5 h-5 text-accent" />
            </div>
            <span
              className={`
                font-semibold text-lg text-sidebar-foreground whitespace-nowrap
                transition-all duration-300
                ${collapsed ? 'opacity-0 w-0 overflow-hidden' : 'opacity-100'}
              `}
            >
              Strikeloop
            </span>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-hidden">
          {navItems.map((item) => (
            <NavItem
              key={item.label}
              icon={item.icon}
              label={item.label}
              to={item.to}
              active={location.pathname.startsWith(item.match)}
              disabled={item.disabled || false}
              collapsed={collapsed}
            />
          ))}
        </nav>

        {/* Repo info strip (when expanded) */}
        {!collapsed && githubRepo && (
          <div className="px-4 py-3 border-t border-sidebar-border">
            <p className="text-xs text-muted-foreground font-mono truncate" title={repoDisplay}>
              {repoDisplay}
            </p>
          </div>
        )}

        {/* Collapse button */}
        <div className="p-3 border-t border-sidebar-border">
          <button
            onClick={() => setCollapsed(prev => !prev)}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm text-muted-foreground hover:text-sidebar-foreground hover:bg-sidebar-accent/50 transition-all duration-200"
          >
            {collapsed ? (
              <ChevronRight className="w-5 h-5" />
            ) : (
              <>
                <ChevronLeft className="w-5 h-5" />
                <span>Collapse</span>
              </>
            )}
          </button>
        </div>
      </aside>

      {/* ── Right side ── */}
      <div
        className={`flex-1 flex flex-col transition-all duration-300 ease-out ${
          collapsed ? 'ml-[72px]' : 'ml-[260px]'
        }`}
      >
        {/* Top header */}
        <header className="h-16 border-b border-border bg-background/80 backdrop-blur-sm sticky top-0 z-30 flex items-center justify-between px-6">
          <div className="flex items-center gap-4">
            <h1 className="text-xl font-semibold text-foreground">{pageTitle}</h1>
            {statusBadge && (
              <div className="flex items-center">{statusBadge}</div>
            )}
          </div>

          <div className="flex items-center gap-4">
            {/* Search */}
            <div
              className={`relative flex items-center transition-all duration-300 ${
                searchFocused ? 'w-64' : 'w-48'
              }`}
            >
              <Search className="absolute left-3 w-4 h-4 text-muted-foreground pointer-events-none" />
              <input
                type="text"
                placeholder="Search..."
                onFocus={() => setSearchFocused(true)}
                onBlur={() => setSearchFocused(false)}
                className="w-full h-9 pl-9 pr-4 rounded-lg bg-secondary border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent transition-all duration-200"
              />
            </div>

            {/* Notifications */}
            <button className="relative w-9 h-9 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-all duration-200">
              <Bell className="w-5 h-5" />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-accent rounded-full animate-pulse" />
            </button>

            {/* User avatar */}
            <button className="w-9 h-9 rounded-lg overflow-hidden bg-secondary ring-2 ring-transparent hover:ring-accent/50 transition-all duration-200">
              <div className="w-full h-full bg-gradient-to-br from-accent/80 to-blue-500 flex items-center justify-center text-xs font-semibold text-accent-foreground">
                AI
              </div>
            </button>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 p-6 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  )
}
