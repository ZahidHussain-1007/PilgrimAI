import { useCallback, useEffect, useState } from "react"
export function useResource<T>(load: () => Promise<T>) {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const [revision, setRevision] = useState(0)
  const retry = useCallback(() => setRevision((value) => value + 1), [])
  useEffect(() => {
    let active = true
    setLoading(true)
    setError(null)
    load()
      .then((value) => {
        if (active) setData(value)
      })
      .catch((reason: unknown) => {
        if (active)
          setError(
            reason instanceof Error
              ? reason
              : new Error("Unable to load data."),
          )
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [load, revision])
  return { data, loading, error, retry }
}
