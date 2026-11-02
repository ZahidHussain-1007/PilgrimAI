import { PlanningJobPage } from "../../../components/planning/PlanningJobPage";
import { loadTemples } from "../../../lib/temples";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <PlanningJobPage id={id} temples={loadTemples()} />;
}
