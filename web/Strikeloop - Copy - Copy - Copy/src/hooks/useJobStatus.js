import { useState, useEffect, useRef } from 'react'
import { getJobStatus } from '../lib/api.js'

export function useJobStatus(jobId) {
  const [data, setData] = useState(null)
  const [stageMessages, setStageMessages] = useState({})
  const [error, setError] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const intervalRef = useRef(null)

  useEffect(() => {
    if (!jobId) return

    let cancelled = false

    async function poll() {
      try {
        const result = await getJobStatus(jobId)
        if (cancelled) return

        setData(result)
        setIsLoading(false)

        // Persist the message for each stage so completed steps keep their log line
        if (result.stage && result.message) {
          setStageMessages(prev => ({ ...prev, [result.stage]: result.message }))
        }

        if (result.status === 'done' || result.status === 'error') {
          clearInterval(intervalRef.current)
        }
      } catch (err) {
        if (cancelled) return
        setError(err.message || 'Unknown error')
        setIsLoading(false)
        clearInterval(intervalRef.current)
      }
    }

    poll()
    intervalRef.current = setInterval(poll, 2000)

    return () => {
      cancelled = true
      clearInterval(intervalRef.current)
    }
  }, [jobId])

  return {
    status: data?.status ?? null,
    stage: data?.stage ?? 0,
    stageName: data?.stage_name ?? '',
    message: data?.message ?? '',
    stageMessages,
    elapsedSeconds: data?.elapsed_seconds ?? 0,
    error,
    isLoading,
  }
}
