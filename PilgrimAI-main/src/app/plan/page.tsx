import { AppShell } from "../../components/layout/AppShell"
import { loadTemples } from "../../lib/temples"
import { PlanClient } from "./PlanClient"

/** v19.7: "Choose Your Temple" — illustrated trail + chat, inside the app shell. */
export default function Page() {
  return (
    <AppShell>
      <PlanClient temples={loadTemples()} />
    </AppShell>
  )
}
