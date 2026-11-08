import { AppShell } from "../../../components/layout/AppShell";
import { ItineraryWorkspace } from "../../../components/planning/ItineraryWorkspace";
import { loadTemples } from "../../../lib/temples";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <AppShell>
      <ItineraryWorkspace id={id} temples={loadTemples()} />
    </AppShell>
  );
}
