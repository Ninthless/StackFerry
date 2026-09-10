import { useEffect, useState } from 'react'

export function missingText(value: string | undefined): boolean {
  return !(value ?? '').trim()
}

export function nonHttpUrl(value: string | undefined): boolean {
  const trimmed = (value ?? '').trim()
  if (!trimmed) return false
  try {
    const url = new URL(trimmed)
    return url.protocol !== 'http:' && url.protocol !== 'https:'
  } catch {
    return true
  }
}

export function useEditorSubmit(open: boolean): {
  submitted: boolean
  markSubmitted: () => void
} {
  const [submitted, setSubmitted] = useState(false)
  useEffect(() => {
    if (!open) return
    setSubmitted(false)
  }, [open])
  return {
    submitted,
    markSubmitted() {
      setSubmitted(true)
    },
  }
}
