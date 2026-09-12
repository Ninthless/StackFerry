import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"
import { startOnboardingTour, type OnboardingNavigate } from "./start-onboarding-tour"

type OnboardingSession = {
  completed: boolean | null
  running: boolean
  startTour: () => void
  bindNavigator: (navigate: OnboardingNavigate | null) => void
}

const OnboardingContext = createContext<OnboardingSession | null>(null)

export function OnboardingProvider({ children }: { children: ReactNode }) {
  const [completed, setCompleted] = useState<boolean | null>(null)
  const [running, setRunning] = useState(false)
  const [navigatorReady, setNavigatorReady] = useState(false)
  const navigateRef = useRef<OnboardingNavigate | null>(null)
  const tourRef = useRef<{ destroy: () => void } | null>(null)
  const skipCompleteRef = useRef(false)
  const autoStartedRef = useRef(false)

  const bindNavigator = useCallback((navigate: OnboardingNavigate | null) => {
    navigateRef.current = navigate
    setNavigatorReady(Boolean(navigate))
  }, [])

  const persistCompleted = useCallback(async () => {
    setCompleted(true)
    setRunning(false)
    try {
      await window.stackferry?.setOnboardingCompleted(true)
    } catch {
      // 指引已经关掉；写入失败时下次启动仍可能再弹出。
    }
  }, [])

  const startTour = useCallback(() => {
    const navigate = navigateRef.current
    if (!navigate) return
    skipCompleteRef.current = true
    tourRef.current?.destroy()
    skipCompleteRef.current = false
    setRunning(true)
    tourRef.current = startOnboardingTour({
      navigate,
      onDestroyed() {
        tourRef.current = null
        if (skipCompleteRef.current) return
        void persistCompleted()
      },
    })
  }, [persistCompleted])

  useEffect(() => {
    const api = window.stackferry
    if (!api) {
      setCompleted(true)
      return
    }
    void api
      .getOnboardingCompleted()
      .then(setCompleted)
      .catch(() => setCompleted(true))
  }, [])

  useEffect(() => {
    if (completed !== false || !navigatorReady || autoStartedRef.current) return
    autoStartedRef.current = true
    startTour()
  }, [completed, navigatorReady, startTour])

  useEffect(() => {
    // contextBridge 会冻住 window.stackferry，控制台重放只能挂到页面 window。
    window.startOnboardingTour = startTour
    return () => {
      delete window.startOnboardingTour
    }
  }, [startTour])

  useEffect(() => {
    return () => {
      skipCompleteRef.current = true
      tourRef.current?.destroy()
    }
  }, [])

  const value = useMemo<OnboardingSession>(
    () => ({ completed, running, startTour, bindNavigator }),
    [bindNavigator, completed, running, startTour],
  )

  return <OnboardingContext.Provider value={value}>{children}</OnboardingContext.Provider>
}

export function useOnboarding(): OnboardingSession {
  const session = useContext(OnboardingContext)
  if (!session) {
    throw new Error("useOnboarding requires OnboardingProvider")
  }
  return session
}
