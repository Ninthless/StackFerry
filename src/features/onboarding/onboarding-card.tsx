import { BookOpen } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardHeader, CardTitle } from "@/components/ui/card"
import { HintTitle } from "@/features/settings/settings-hint"
import * as m from "@/paraglide/messages.js"
import { useOnboarding } from "./onboarding-session"

export function OnboardingCard() {
  const { startTour, running } = useOnboarding()

  return (
    <Card data-onboarding="about">
      <CardHeader>
        <HintTitle hint={m.onboarding_replay_description()}>
          <CardTitle>{m.onboarding_replay_title()}</CardTitle>
        </HintTitle>
        <CardAction>
          <Button type="button" variant="outline" size="sm" disabled={running} onClick={startTour}>
            <BookOpen data-icon="inline-start" />
            {m.onboarding_replay()}
          </Button>
        </CardAction>
      </CardHeader>
    </Card>
  )
}
