import { useCallback, useEffect, useRef, useState } from 'react'
import { getLiveMetrics } from '../lib/api.js'

export function useLiveMetrics() {
  const [data, setData] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(null)
  const [lastUpdated, setLastUpdated] = useState(null)
  const intervalRef = useRef(null)
  const inFlightRef = useRef(false)

  const poll = useCallback(async () => {
    if (inFlightRef.current) return

    inFlightRef.current = true
    try {
      const result = await getLiveMetrics()
      setData(result)
      setError(null)
      setLastUpdated(new Date())
    } catch (err) {
      setError(err.message || 'Failed to fetch live metrics')
    } finally {
      setIsLoading(false)
      inFlightRef.current = false
    }
  }, [])

  useEffect(() => {
    poll()
    intervalRef.current = setInterval(poll, 30000)

    return () => {
      clearInterval(intervalRef.current)
    }
  }, [poll])

  return {
    data,
    isLoading,
    error,
    lastUpdated,
    refresh: poll,
  }
}
