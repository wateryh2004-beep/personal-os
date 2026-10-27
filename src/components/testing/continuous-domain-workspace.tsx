"use client";
import { BriefingEvents } from "@/components/briefing/briefing-events";
import { fixtureBriefingEvents } from "@/features/testing/continuous-domain-fixture-data";
import { fixtureInboxTransport } from "@/features/testing/continuous-domain-transports";
import { fixtureBriefingEventTransport } from "@/features/testing/continuous-domain-transports";
import { BriefingWorkspaceView } from "@/components/briefing/briefing-workspace-view";
import { ShoppingItemDetail } from "@/components/shopping/shopping-item-detail";
import { fixtureMaterialTransport, fixtureAftercareTransport, fixtureJudgmentTransport, fixtureTravelTransport, fixtureTravelText, fixtureTravelCreation, fixtureLeisureSave, fixtureLeisureRead } from "@/features/testing/continuous-domain-transports";
import { useSearchParams } from "next/navigation";
import { ShoppingWorkspace } from "@/components/shopping/shopping-workspace";
import { TravelWorkspace } from "@/components/travel/travel-workspace";
import { TripDetail } from "@/components/travel/trip-detail";
import { LeisureHome } from "@/components/leisure/leisure-home";
import { LeisureDetail } from "@/components/leisure/leisure-detail";
import { InvestmentWorkspace } from "@/components/investment/investment-workspace";
import { InboxWorkspace } from "@/components/inbox/inbox-workspace";
import { CareerMaterialChecklist } from "@/components/career/material-checklist";
import { fixtureCapture, fixtureAi } from "@/features/testing/continuous-fixture-transports";
import { fixtureShopping, fixtureTrip, fixtureLeisure, fixtureInvestment, fixtureInvestmentDaily, fixtureMaterials, fixtureBriefingView } from "@/features/testing/continuous-domain-fixture-data";
import { deriveHoldings } from "@/features/investment/calculator";
import { fixtureTimestamp } from "@/features/testing/continuous-fixture-data";
/** These are the production parents. No duplicate form or draft controller lives here. */
export function ContinuousDomainWorkspace({ path, inboxItems }: { path: string; inboxItems?:import("react").ComponentProps<typeof InboxWorkspace>["items"] }) {
  const params = useSearchParams();
  if (path === "/briefing/events") return <BriefingEvents {...fixtureBriefingEvents} transport={fixtureBriefingEventTransport} />;
  if (path === "/briefing") return <BriefingWorkspaceView data={fixtureBriefingView} verificationTransport={{ ai: fixtureAi, judgment: fixtureJudgmentTransport }} />;
  if (path === "/shopping") return <ShoppingWorkspace items={fixtureShopping} stats={{ active: 1, ready: 1, purchased: 1 }} initialCreateOpen={false} />;
  if (path === `/shopping/${fixtureShopping[1].id}`) return <ShoppingItemDetail item={{...fixtureShopping[1],necessity_confirmed:false,reason_to_buy:null,existing_alternative:null,source_url:null}} aftercareTransport={fixtureAftercareTransport} />;
  if(path==="/travel") return <TravelWorkspace trips={[{...fixtureTrip.trip,destination_label:null}]} initialCreateOpen={false} creationTransport={fixtureTravelCreation} />;
  if (path === `/travel/${fixtureTrip.trip.id}`) return <TripDetail {...fixtureTrip} transport={fixtureTravelTransport} textTransport={fixtureTravelText} creationTransport={fixtureTravelCreation} />;
  if (path === "/leisure") return <LeisureHome experiences={fixtureLeisure} />;
  const experience = fixtureLeisure.find(row => path === `/leisure/${row.id}`);
  if (experience) return <LeisureDetail onSave={fixtureLeisureSave} onRead={fixtureLeisureRead} experience={experience} now={Date.parse(fixtureTimestamp)} neighbors={fixtureLeisure} from={params.get("from") ?? undefined} backHref={`/leisure${params.get("from") ? `?${params.get("from")}` : ""}`} />;
  if (path === "/investments") {
    const mode = params.get("mode") === "paper" ? "paper" : "real", tab = params.get("tab") === "strategies" ? "strategies" : params.get("tab") === "research" ? "research" : "holdings";
    return <InvestmentWorkspace data={fixtureInvestment} holdings={deriveHoldings(fixtureInvestment.accounts, fixtureInvestment.entries, mode)} dailyData={fixtureInvestmentDaily} mode={mode} tab={tab} importExample="" selectedItem={params.get("item") ?? undefined} />;
  }
  if (path === "/inbox") return <InboxWorkspace conversionTransport={fixtureInboxTransport} items={inboxItems??[]} archivedItems={[]} lists={[{id:"e5000000-0000-4000-8000-000000000002",display_name:"合成清单",is_default:true}]} captureTransport={fixtureCapture} aiTransport={fixtureAi} />;
  if (path === `/career/opportunities/${fixtureMaterials.opportunityId}/materials`) return <CareerMaterialChecklist transport={fixtureMaterialTransport} {...fixtureMaterials} />;
  return null;
}
