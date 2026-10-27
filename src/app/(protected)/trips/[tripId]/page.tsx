import { TripDetailsPage } from "../../../../components/pages/TripDetailsPage"

export default async function Page({ params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params
  return <TripDetailsPage tripId={tripId} />
}
