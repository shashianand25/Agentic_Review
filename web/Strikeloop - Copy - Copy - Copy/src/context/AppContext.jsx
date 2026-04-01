import { createContext, useContext, useEffect, useState } from 'react'

const AppContext = createContext(null)
const RUN_HISTORY_KEY = 'infra_ai_run_history'

function readStoredHistory() {
  if (typeof window === 'undefined') return []

  try {
    const raw = window.localStorage.getItem(RUN_HISTORY_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function AppProvider({ children }) {
  const [jobId, setJobId] = useState(null)
  const [githubConnected, setGithubConnected] = useState(false)
  const [awsConnected, setAwsConnected] = useState(false)
  const [githubRepo, setGithubRepo] = useState('')
  const [runHistory, setRunHistory] = useState(readStoredHistory)

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(RUN_HISTORY_KEY, JSON.stringify(runHistory))
  }, [runHistory])

  function addRunRecord(record) {
    setRunHistory(prev => {
      const next = [record, ...prev.filter(item => item.jobId !== record.jobId)]
      return next.slice(0, 25)
    })
  }

  function updateRunRecord(jobIdToUpdate, patch) {
    setRunHistory(prev => prev.map(item => (
      item.jobId === jobIdToUpdate ? { ...item, ...patch } : item
    )))
  }

  return (
    <AppContext.Provider value={{
      jobId, setJobId,
      githubConnected, setGithubConnected,
      awsConnected, setAwsConnected,
      githubRepo, setGithubRepo,
      runHistory,
      addRunRecord,
      updateRunRecord,
    }}>
      {children}
    </AppContext.Provider>
  )
}

export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used within AppProvider')
  return ctx
}
