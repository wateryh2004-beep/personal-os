"use client";
import {assertContinuousFixtureTransport} from "@/features/testing/continuous-fixture-gate";
import {submitTripStopTextIntent,readTripStopTextIntent} from "@/features/travel/stop-text-intents";
import {SourceLink} from "@/components/workflow-continuity/source-link";
import {IntentDraftForm} from "@/components/workflow-continuity/intent-draft-form";
import {submitTravelCreationIntent,readTravelCreationIntent} from "@/features/travel/create-intents";
import type {TravelCreationTransport} from "./travel-workspace";
import {TravelStopMetadataEditor,TravelDocumentForm} from "./travel-form-drafts";
import {getWorkflowDrafts,getWorkflowDraftsServerSnapshot,subscribeWorkflowDrafts} from "@/features/workflow-continuity/drafts";
import {useDraftResumeOpeners,type DraftResumeTarget} from "@/features/workflow-continuity/draft-resume";
import { useMemo, useRef,useSyncExternalStore, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { announceNavigationIntent } from "@/features/workflow-continuity/navigation-intent";
import { useLifeUndo } from "@/components/life/use-life-undo";
import { Button } from "@/components/ui/button";

import { LifeConfirm, type LifeChange } from "@/components/life/life-confirm";
import { WorkbenchRecord } from "@/components/workbench/workbench-record";
import type { LifeFieldRow } from "@/features/life/contracts";
import {
  addTripStop,
  startTripPlanning,
  updateTripStop,
  readTripState,
} from "@/features/travel/actions";
import { tripTimeOverlaps } from "@/features/travel/timeline";
import { buildTripRoute } from "@/features/travel/route/build-route";
import {useDomainViewAdapter,waitForViewLayout} from "@/features/workbench/domain-adapters/use-domain-view-adapter";
import { TravelMap,type TravelMapController } from "./travel-map";
import { StopGeocode } from "./stop-geocode";
import { TripExport } from "./trip-export";
import styles from "@/components/life/life-field.module.css";

export type TravelStopTextTransport={submit:typeof submitTripStopTextIntent;read:typeof readTripStopTextIntent};
export type TravelDetailTransport={read:typeof readTripState;addStop:typeof addTripStop;updateStop:typeof updateTripStop;startPlanning:typeof startTripPlanning};
type Stop = {
  id: string;
  place_name: string;
  day_number: number | null;
  sort_order: number;
  latitude: number | null;
  longitude: number | null;
  notes: string | null;
  planned_time: string | null;
  duration_minutes: number | null;
  mutation_revision?: number;
  arrived_at?: string | null;
};
type Trip = {
  id: string;
  title: string;
  status: string;
  description: string | null;
  start_date?: string | null;
  end_date?: string | null;
  mutation_revision?: number;
  current_stop_id?: string | null;
  next_stop_id?: string | null;
};
type Document = {
  id: string;
  title: string;
  mime_type: string | null;
  storage_state: string;
};
const emptyDocuments: Document[] = [];
const tripStatus: Record<string, string> = {
  dream: "灵感",
  shortlist: "备选",
  planning: "规划中",
  booked: "已预订",
  completed: "已完成",
  archived: "已归档",
};
const stopTime = (stop: Stop) =>
  `${stop.day_number ? `第 ${stop.day_number} 天` : "天数待定"} · ${stop.planned_time?.slice(0, 5) ?? "时间待定"}${stop.duration_minutes ? ` · ${stop.duration_minutes} 分钟` : ""}`;
export function TripDetail({
  transport,creationTransport,textTransport,
  trip,
  stops,
  documents = emptyDocuments,
  availableDocuments = emptyDocuments,
}: {
  textTransport?:TravelStopTextTransport;transport?:TravelDetailTransport;creationTransport?:TravelCreationTransport;
  trip: Trip;
  stops: Stop[];
  documents?: Document[];
  availableDocuments?: Document[];
}) {
  assertContinuousFixtureTransport(transport);assertContinuousFixtureTransport(creationTransport);assertContinuousFixtureTransport(textTransport);
  const router = useRouter();
  const params = useSearchParams();
  const fieldMode = params.get("mode") === "field";
  const [localTrip, setTrip] = useState(trip);
  const [rows, setRows] = useState(stops);
  const [docs, setDocs] = useState(documents);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<Stop[] | null>(null);
  const [change, setChange] = useState<LifeChange | null>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const tripRevision = useRef(localTrip.mutation_revision ?? 1);
  const readSequence = useRef(0);
  const [source, setSource] = useState({ trip, stops, documents });
  if (
    source.trip !== trip ||
    source.stops !== stops ||
    source.documents !== documents
  ) {
    setSource({ trip, stops, documents });
    setTrip(trip);
    setRows(stops);
    setDocs(documents);
  }
  const ordered = useMemo(
    () =>
      [...rows].sort(
        (left, right) =>
          (left.day_number ?? 999999) - (right.day_number ?? 999999) ||
          left.sort_order - right.sort_order ||
          left.id.localeCompare(right.id),
      ),
    [rows],
  );
  const route = useMemo(
    () =>
      buildTripRoute(
        ordered.map((stop) => ({
          id: stop.id,
          placeName: stop.place_name,
          dayNumber: stop.day_number,
          sortOrder: stop.sort_order,
          latitude: stop.latitude,
          longitude: stop.longitude,
        })),
      ),
    [ordered],
  );
  const dayParam = params.get("day");
  const [day, setDay] = useState<string>(
    dayParam === "unknown" ||
      (dayParam !== null &&
        /^([1-9]|[1-9]\d|[12]\d\d|3[0-5]\d|36[0-6])$/.test(dayParam))
      ? dayParam
      : "all",
  );
  const [activeStop, setActiveStop] = useState<string | null>(
    rows.some((row) => row.id === params.get("stop"))
      ? params.get("stop")
      : null,
  );
  const visibleStops = ordered.filter(
    (stop) => day === "all" || String(stop.day_number ?? "unknown") === day,
  );
  const visibleRoute = route.resolvedStops.filter((stop) =>
    visibleStops.some((row) => row.id === stop.id),
  );
  const overlaps = tripTimeOverlaps(rows);

  const mapController=useRef<TravelMapController|null>(null);
  useDomainViewAdapter({kind:"travel",pathname:`/travel/${trip.id}`,ready:true,capture:()=>({kind:"travel",tripId:trip.id,day:day==="all"||day==="unknown"?day:Number(day),stopId:activeStop,map:mapController.current?.capture()??null}),restore:async(state,context)=>{if(!context.current())return {status:"cancelled"};const stop=state.stopId?rows.find(row=>row.id===state.stopId):null;setDay(String(state.day));setActiveStop(stop?.id??null);await waitForViewLayout(context);if(!context.current())return {status:"cancelled"};if(state.map){const ack=await mapController.current?.restore(state.map,context);if(!ack||ack.status!=="applied")return ack??{status:"partial",reason:"missing-record"};}return state.stopId&&!stop?{status:"partial",reason:"missing-record"}:{status:"applied"};}});

  const selectStop = (id: string, focus = false) => {
    setActiveStop(id);
    const query = new URLSearchParams(params.toString());
    query.set("stop", id);
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}?${query}`,
    );
    const row = rows.find((stop) => stop.id === id);
    if (row && day !== "all") setDay(String(row.day_number ?? "unknown"));
    if (focus)
      requestAnimationFrame(() => {
        const element = document.getElementById(`trip-stop-${id}`);
        element?.scrollIntoView({ block: "nearest", behavior: "instant" });
        element?.focus({ preventScroll: true });
      });
  };
  const current = rows.find((stop) => stop.id === localTrip.current_stop_id);
  const next = rows.find((stop) => stop.id === localTrip.next_stop_id);
  const identity = (stop: Stop) => ({
    id: stop.id,
    expected_revision: stop.mutation_revision ?? 1,
  });
  async function reconcileTrip() {
    const ticket = ++readSequence.current;
    const state = await (transport?.read??readTripState)(trip.id);
    if (ticket !== readSequence.current) return;
    if (!state.ok) throw new Error("travel_read_unconfirmed");
    if (state.trip.mutation_revision < tripRevision.current) return;
    tripRevision.current = state.trip.mutation_revision;
    setTrip(state.trip);
    setRows(state.stops);
    setDocs(state.documents);
  }
  const install = (saved: LifeFieldRow[], close = true) => {
    readSequence.current += 1;
    setRows((before) =>
      before.map((stop) => {
        const patch = saved.find(
          (row) => row.id === stop.id && typeof row.trip_id === "string",
        );
        return patch &&
          Number(patch.mutation_revision ?? 0) >=
            Number(stop.mutation_revision ?? 0)
          ? ({ ...stop, ...patch } as Stop)
          : stop;
      }),
    );
    const parentRevision = saved.find(
      (row) => row.trip_id === trip.id,
    )?.trip_revision;
    if (typeof parentRevision === "number")
      setTrip((before) =>
        parentRevision >= Number(before.mutation_revision ?? 0)
          ? { ...before, mutation_revision: parentRevision }
          : before,
      );
    for (const row of saved)
      if (
        row.id === trip.id &&
        Number(row.mutation_revision ?? 0) >= tripRevision.current &&
        typeof row.document_id === "string"
      ) {
        if (row.linked) {
          const document = availableDocuments.find(
            (doc) => doc.id === row.document_id,
          );
          if (document)
            setDocs((before) =>
              before.some((doc) => doc.id === document.id)
                ? before
                : [...before, document],
            );
        } else
          setDocs((before) =>
            before.filter((doc) => doc.id !== row.document_id),
          );
      }
    const patch = saved.find(
      (row) => row.id === trip.id && row.trip_id === undefined,
    );
    tripRevision.current = Math.max(
      tripRevision.current,
      Number(parentRevision ?? 0),
      Number(patch?.mutation_revision ?? 0),
    );
    if (patch)
      setTrip((before) =>
        Number(patch.mutation_revision ?? 0) >=
        Number(before.mutation_revision ?? 0)
          ? ({ ...before, ...patch } as Trip)
          : before,
      );
    if (close) {
      setChange(null);
      setEditing(null);
      setSelected(new Set());
    }
  };
  useLifeUndo((operation, saved) => {
    if (operation.startsWith("travel_")) install(saved, false);
  });
  const setMode = () => {
    announceNavigationIntent();
    const query = new URLSearchParams(params.toString());
    if (fieldMode) query.delete("mode");
    else query.set("mode", "field");
    router.replace(`/travel/${trip.id}${query.size ? `?${query}` : ""}`, {
      scroll: false,
    });
  };
  const mark = (stop: Stop, kind: "current" | "next") =>
    setChange({
      title: kind === "current" ? "设置当前站" : "设置下一站",
      details: [
        {
          id: stop.id,
          title: stop.place_name,
          change: `${kind === "current" ? "当前站" : "下一站"} → ${stop.place_name}`,
        },
      ],
      input: {
        operation: "travel_next_stop",
        items: [
          {
            id: trip.id,
            expected_revision: localTrip.mutation_revision ?? 1,
            current_stop_id:
              kind === "current"
                ? stop.id
                : (localTrip.current_stop_id ?? null),
            next_stop_id:
              kind === "next"
                ? stop.id
                : localTrip.next_stop_id === stop.id
                  ? null
                  : (localTrip.next_stop_id ?? null),
          },
        ],
      },
    });
  const arrival = (stop: Stop) =>
    setChange({
      title: stop.arrived_at ? "撤回到达标记" : "标记已到达",
      details: [
        {
          id: stop.id,
          title: stop.place_name,
          change: stop.arrived_at ? "已到达 → 未标记" : "未标记 → 已到达",
        },
      ],
      input: {
        operation: "travel_stop_arrival",
        items: [{ ...identity(stop), arrived: !stop.arrived_at }],
      },
    });
  const move = (stop: Stop, direction: -1 | 1) => {
    const sameDay = ordered.filter((row) => row.day_number === stop.day_number);
    const index = sameDay.findIndex((row) => row.id === stop.id);
    const other = sameDay[index + direction];
    if (!other) return;
    setChange({
      title: "调整当天顺序",
      warnings: [
        "仅调整顺序，已填写的时间与停留时长保留；不会猜测交通耗时。",
        ...overlaps.map(
          (pair) =>
            `${rows.find((row) => row.id === pair.first)?.place_name} 与 ${rows.find((row) => row.id === pair.second)?.place_name} 的已知停留时段重叠 ${pair.minutes} 分钟，请另行调整时间。`,
        ),
      ],
      details: [
        {
          id: stop.id,
          title: stop.place_name,
          change: `${direction === -1 ? "移到" : "移到"} ${other.place_name} ${direction === -1 ? "之前" : "之后"}`,
        },
      ],
      input: {
        operation: "travel_stop_order",
        items: [
          { ...identity(stop), sort_order: other.sort_order },
          { ...identity(other), sort_order: stop.sort_order },
        ],
      },
    });
  };

  return (
    <section className={fieldMode ? styles.fieldMode : ""}>
      <TripOrdinaryResume tripId={trip.id} onOpen={target=>{if(target.parentId!==trip.id)return false;if(target.kind==="travel.stop-text"){if(!rows.some(row=>row.id===target.id))return false;setDay("all");setActiveStop(target.id);}else if(target.kind==="travel.stop-metadata"){const selected=(target.itemIds??[target.id]).map(id=>rows.find(row=>row.id===id));if(selected.some(row=>!row))return false;setEditing(selected as Stop[]);setDay("all");setActiveStop(target.id);}else if(target.kind!=="travel.stop-add"&&target.kind!=="travel.document")return false;const url=new URL(window.location.href);url.searchParams.delete("mode");window.history.replaceState(null,"",`${url.pathname}${url.search}`);return true;}}/>
      <header>
        <p className={styles.meta}>
          {tripStatus[localTrip.status] ?? localTrip.status}
        </p>
        <h1 className="page-title">{localTrip.title}</h1>
        {trip.start_date || trip.end_date ? (
          <p className={styles.meta}>
            {trip.start_date ?? "待定"} — {trip.end_date ?? "待定"}
          </p>
        ) : null}
        {trip.description ? (
          <p className={styles.meta}>{trip.description}</p>
        ) : null}
      </header>
      <div className={styles.toolbar} tabIndex={-1} data-life-return-focus>
        <button type="button" onClick={setMode}>
          {fieldMode ? "退出现在用" : "现在用 · 行程"}
        </button>
        {!fieldMode && ["dream", "shortlist"].includes(localTrip.status) ? (
          <button
            disabled={pending}
            onClick={async () => {
              setPending(true);
              try {
                await (transport?.startPlanning??startTripPlanning)(trip.id);
                await reconcileTrip();
              } catch {
                setError("暂时无法确认规划状态，请读取最新行程核对。");
              } finally {
                setPending(false);
              }
            }}
          >
            开始规划
          </button>
        ) : null}
        <span hidden={fieldMode} inert={fieldMode}>
          <TripExport title={trip.title} stops={ordered} />
        </span>
      </div>
      {error ? (
        <p role="alert" className={styles.error}>
          {error}
          <button
            type="button"
            className={styles.action}
            disabled={pending}
            onClick={async () => {
              try {
                await reconcileTrip();
                setError("");
              } catch {
                setError("暂时无法读取最新行程，已显示内容和输入保持不变。");
              }
            }}
          >
            读取最新行程
          </button>
        </p>
      ) : null}
      {fieldMode ? (
        <section className={styles.panel} aria-label="当前行程">
          <p className={styles.meta}>当前站 · 由你选择</p>
          <h2 className={styles.hero}>
            {current?.place_name ?? "尚未选择当前站"}
          </h2>
          {current ? (
            <>
              <p className={styles.meta}>{stopTime(current)}</p>
              <p className={styles.meta}>
                {current.latitude === null || current.longitude === null
                  ? "坐标尚未确认"
                  : `${current.latitude}, ${current.longitude}`}
              </p>
              <button
                className={styles.action}
                onClick={() => arrival(current)}
              >
                {current.arrived_at ? "撤回到达标记" : "我已到达"}
              </button>
            </>
          ) : null}
          <p className={styles.meta}>
            下一站 · {next?.place_name ?? "尚未选择"}
          </p>
          {next ? (
            <>
              <p className={styles.meta}>
                {stopTime(next)}
                {next.notes ? ` · ${next.notes}` : ""}
              </p>
              <button
                className={styles.action}
                onClick={() => mark(next, "current")}
              >
                切换到这一站
              </button>
            </>
          ) : null}
        </section>
      ) : null}
      <label className={styles.field}>
        每天的行程
        <select
          value={day}
          onChange={(event) => {
            setDay(event.target.value);
            const query = new URLSearchParams(params.toString());
            if (event.target.value === "all") query.delete("day");
            else query.set("day", event.target.value);
            window.history.replaceState(
              null,
              "",
              `${window.location.pathname}?${query}`,
            );
          }}
        >
          <option value="all">全部天数</option>
          {[...new Set(ordered.map((stop) => stop.day_number))].map((value) => (
            <option key={value ?? "unknown"} value={String(value ?? "unknown")}>
              {value ? `第 ${value} 天` : "天数待定"}
            </option>
          ))}
        </select>
      </label>
      {overlaps.length ? (
        <div role="status" className={styles.notice}>
          <p>已记录时间存在重叠（不包含交通耗时）：</p>
          {overlaps.map((pair) => (
            <p key={`${pair.first}:${pair.second}`}>
              {rows.find((row) => row.id === pair.first)?.place_name} 与{" "}
              {rows.find((row) => row.id === pair.second)?.place_name} ·{" "}
              {pair.minutes} 分钟
            </p>
          ))}
        </div>
      ) : null}
      <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        <section aria-label="路线地图">
          <h2 className="text-base font-medium">路线地图</h2>
          {route.resolvedStops.length ? (
            <TravelMap controllerRef={mapController}
              stops={visibleRoute}
              selectedStopId={activeStop}
              onSelectStop={(id) => selectStop(id, true)}
            />
          ) : (
            <p className={styles.notice}>确认地点坐标后显示地图。</p>
          )}
          <p className={styles.meta}>
            {route.unresolvedCount
              ? `${route.unresolvedCount} 个地点尚未确认坐标。`
              : "按已保存顺序直线连点；不是导航路线，不估算交通耗时。"}
          </p>
        </section>
        <section aria-labelledby="trip-stops">
          <details open={!fieldMode}>
            <summary
              id="trip-stops"
              className="ui-link min-h-11 cursor-pointer py-3 text-base font-medium"
            >
              {fieldMode ? "选择当前或下一站" : "编辑规划 · 行程"}
            </summary>
            {selected.size && !fieldMode ? (
              <div className={styles.toolbar}>
                <span>已选 {selected.size} 站</span>
                <button
                  disabled={selected.size > 20}
                  onClick={() =>
                    setEditing(ordered.filter((stop) => selected.has(stop.id)))
                  }
                >
                  批量改天数与时间
                </button>
                <button onClick={() => setSelected(new Set())}>取消选择</button>
              </div>
            ) : null}
            <ol className={styles.list}>
              {visibleStops.map((stop) => {
                const sameDay = ordered.filter(
                  (row) => row.day_number === stop.day_number,
                );
                const index = sameDay.findIndex((row) => row.id === stop.id);
                return (
                  <li
                    id={`trip-stop-${stop.id}`}
                    tabIndex={-1}
                    key={stop.id}
                    data-selected={activeStop === stop.id}
                    className={`${styles.row} ${current?.id === stop.id ? styles.current : ""}`}
                  >
                    <div className={styles.rowHead}>
                      <label className="inline-flex min-h-11 items-center gap-2">
                        <input
                          type="checkbox"
                          hidden={fieldMode}
                          aria-label={`选择 ${stop.place_name}`}
                          checked={selected.has(stop.id)}
                          onChange={() =>
                            setSelected((before) => {
                              const value = new Set(before);
                              if (value.has(stop.id)) value.delete(stop.id);
                              else value.add(stop.id);
                              return value;
                            })
                          }
                        />
                        <strong>{stop.place_name}</strong>
                      </label>
                      <button
                        type="button"
                        className={styles.action}
                        aria-pressed={activeStop === stop.id}
                        onClick={() => selectStop(stop.id)}
                      >
                        在地图定位
                      </button>
                      {stop.arrived_at ? (
                        <span className={styles.meta}>已到达</span>
                      ) : null}
                    </div>
                    <p hidden={!fieldMode} className={styles.meta}>
                      {stopTime(stop)}
                    </p>
                    <button
                      hidden={fieldMode}
                      type="button"
                      className={styles.action}
                      onClick={() => setEditing([stop])}
                    >
                      {stopTime(stop)} · 修改
                    </button>
                    {fieldMode ? (
                      <div className={styles.toolbar}>
                        <button onClick={() => mark(stop, "current")}>
                          设为当前站
                        </button>
                        <button onClick={() => mark(stop, "next")}>
                          设为下一站
                        </button>
                        <button onClick={() => arrival(stop)}>
                          {stop.arrived_at ? "撤回到达" : "我已到达"}
                        </button>
                      </div>
                    ) : (
                      <div className={styles.toolbar}>
                        <button
                          disabled={index === 0}
                          aria-label={`上移 ${stop.place_name}`}
                          onClick={() => move(stop, -1)}
                        >
                          上移
                        </button>
                        <button
                          disabled={index === sameDay.length - 1}
                          aria-label={`下移 ${stop.place_name}`}
                          onClick={() => move(stop, 1)}
                        >
                          下移
                        </button>
                      </div>
                    )}
                    <div hidden={fieldMode} inert={fieldMode}>
                      {stop.latitude === null || stop.longitude === null ? (
                        <StopGeocode
                          tripId={trip.id}
                          stopId={stop.id}
                          placeName={stop.place_name}
                          onResolved={async () => {
                            await reconcileTrip();
                          }}
                        />
                      ) : null}
                      {stop.notes ? (
                        <p className={styles.meta}>{stop.notes}</p>
                      ) : null}
                      <details className="mt-3">
                        <summary className="ui-link cursor-pointer">
                          编辑名称和备注
                        </summary>
                        <IntentDraftForm resetOnSaved={false} draft={{operation:"travel.stop-text",id:stop.id,parentId:trip.id,href:`/travel/${trip.id}`,label:"地点名称与备注"}} submit={(intentId,fields)=>(textTransport?.submit??submitTripStopTextIntent)(intentId,trip.id,stop.id,fields)} read={(intentId,fields)=>(textTransport?.read??readTripStopTextIntent)(intentId,trip.id,stop.id,fields)} onSaved={()=>{void reconcileTrip();}}>
                          <input
                            type="hidden"
                            name="expectedRevision"
                            value={stop.mutation_revision ?? 1}
                          />
                          <input
                            type="hidden"
                            name="dayNumber"
                            value={stop.day_number ?? ""}
                          />
                          <input
                            type="hidden"
                            name="plannedTime"
                            value={stop.planned_time?.slice(0, 5) ?? ""}
                          />
                          <input
                            type="hidden"
                            name="durationMinutes"
                            value={stop.duration_minutes ?? ""}
                          />
                          <div className={styles.fields}>
                            <label className={styles.field}>
                              地点名称
                              <input
                                required
                                name="placeName"
                                defaultValue={stop.place_name}
                                maxLength={500}
                              />
                            </label>
                            <label className={styles.field}>
                              备注
                              <input
                                name="notes"
                                defaultValue={stop.notes ?? ""}
                                maxLength={10000}
                              />
                            </label>
                          </div>
                          <Button disabled={pending}>保存名称和备注</Button>
                        </IntentDraftForm>
                      </details>
                    </div>
                  </li>
                );
              })}
            </ol>
            <div hidden={fieldMode} inert={fieldMode}><IntentDraftForm draft={{operation:"travel.stop-add",id:"new",parentId:trip.id,href:`/travel/${trip.id}`,label:"添加旅行地点"}} submit={(intentId,fields)=>(creationTransport?.submit??submitTravelCreationIntent)({kind:"stop",intentId,tripId:trip.id,placeName:String(fields.placeName??""),dayNumber:String(fields.dayNumber??"")})} read={(intentId,fields)=>(creationTransport?.read??readTravelCreationIntent)({kind:"stop",intentId,tripId:trip.id,placeName:String(fields.placeName??""),dayNumber:String(fields.dayNumber??"")})} onSaved={()=>{void reconcileTrip();}}>              <div className={styles.fields}>
                <label className={styles.field}>
                  地点名称
                  <input name="placeName" required maxLength={500} />
                </label>
                <label className={styles.field}>
                  第几天（可留空）
                  <input name="dayNumber" type="number" min="1" max="366" />
                </label>
              </div>
              <Button disabled={pending}>
                {pending ? "保存中…" : "添加地点"}
              </Button>
            </IntentDraftForm></div>
          </details>
        </section>
      </div>
      <section className={styles.panel} aria-labelledby="trip-documents">
        <h2 id="trip-documents" className="text-lg font-medium">
          票据与预订文件
        </h2>
        <ul className={styles.list}>
          {docs.map((doc) => (
            <li key={doc.id} className={styles.row}>
              <WorkbenchRecord
                entity={{ kind: "document", id: doc.id }}
                title={doc.title}
                group={`trip:${trip.id}:documents`}
                selectable={false}
              >
                <SourceLink className="ui-link" href={`/files?file=${doc.id}`}>
                  打开 {doc.title}
                </SourceLink>
              </WorkbenchRecord>
              <button
                hidden={fieldMode}
                className={styles.action}
                onClick={() =>
                  setChange({
                    title: "移除旅行文件关联",
                    details: [
                      {
                        id: doc.id,
                        title: doc.title,
                        change: "从此行程移除关联，Files 原件保留",
                      },
                    ],
                    input: {
                      operation: "travel_document",
                      items: [
                        {
                          id: trip.id,
                          expected_revision: localTrip.mutation_revision ?? 1,
                          document_id: doc.id,
                          linked: false,
                        },
                      ],
                    },
                  })
                }
              >
                移除关联
              </button>
            </li>
          ))}
        </ul>
        {!docs.length ? (
          <p className={styles.notice}>
            尚未关联票据。可从 Files 选择已有私有文件。
          </p>
        ) : null}
        <div hidden={fieldMode} inert={fieldMode}><TravelDocumentForm tripId={trip.id} revision={localTrip.mutation_revision??1} documents={availableDocuments} linkedIds={docs.map(doc=>doc.id)} onSaved={rows=>install(rows,false)}/><Link className="ui-link inline-flex min-h-11 items-center" href="/files">前往 Files</Link></div>
      </section>
      {editing ? (
        <TravelStopMetadataEditor tripId={trip.id} stops={editing} onClose={()=>setEditing(null)} onSaved={(saved,hasNewInput)=>install(saved,!hasNewInput)}/>
      ) : null}
      {change ? (
        <LifeConfirm
          change={change}
          onClose={() => setChange(null)}
          onSaved={install}
        />
      ) : null}
    </section>
  );
}
function TripOrdinaryResume({tripId,onOpen}:{tripId:string;onOpen:(target:DraftResumeTarget)=>boolean}){const summaries=useSyncExternalStore(subscribeWorkflowDrafts,getWorkflowDrafts,getWorkflowDraftsServerSnapshot);const targets=summaries.flatMap(row=>row.resumeTarget&&["travel.stop-add","travel.stop-text","travel.stop-metadata","travel.document"].includes(row.resumeTarget.kind)&&row.resumeTarget.parentId===tripId?[row.resumeTarget]:[]);useDraftResumeOpeners(targets,onOpen);return null;}
