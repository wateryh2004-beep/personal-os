"use client";
import {assertContinuousFixtureTransport} from "@/features/testing/continuous-fixture-gate";
import { draftResumeKey, focusDraftForm, useDraftResumeConsumer } from "@/features/workflow-continuity/draft-resume";
import { DraftRecoveryStatus } from "@/components/workflow-continuity/draft-recovery-status";

import { SourceLink as Link } from "@/components/workflow-continuity/provider";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { z } from "zod";
import {
  readPurchaseAftercare,
  savePurchaseAftercare,
} from "@/features/shopping/aftercare";
import { useWorkflowDraft } from "@/features/workflow-continuity/drafts";
import {
  captureWorkspaceScope,
  registerWorkspaceScopeCleanup,
} from "@/lib/workspace-resource-cache";
import { getDateKeyInTimeZone } from "@/lib/date-keys";
import {
  RevisionRecovery,
  useRevisionRecovery,
} from "@/components/shared/revision-recovery";
import { Button } from "@/components/ui/button";
export type PurchaseAftercareTransport={read:typeof readPurchaseAftercare;save:typeof savePurchaseAftercare};
type Data = Awaited<ReturnType<typeof readPurchaseAftercare>>;
export function PurchaseAftercare({
  transport,
  id,
  onSaved,
}: {
  transport?:PurchaseAftercareTransport;
  id: string;
  onSaved: (item: Data["item"]) => void;
}) {
  assertContinuousFixtureTransport(transport);
  // Switch the request controller immediately, before the next record is read.
  // Draft payloads stay in their record-scoped registry when this instance exits.
  return <PurchaseAftercareRecord transport={transport} key={id} id={id} onSaved={onSaved} />;
}
function PurchaseAftercareRecord({
  transport,
  id,
  onSaved,
}: {
  transport?:PurchaseAftercareTransport;
  id: string;
  onSaved: (item: Data["item"]) => void;
}) {
  const [data, setData] = useState<Data | null>(null),
    [error, setError] = useState(""),
    [attempt, setAttempt] = useState(0);
  const [ownerLease, setOwnerLease] = useState(() => captureWorkspaceScope());
  const lifecycle = useRef({ mounted: false, generation: 0 });
  const requests = useRef(0);
  useLayoutEffect(() => {
    const current = lifecycle.current;
    current.mounted = true;
    current.generation += 1;
    return () => {
      current.mounted = false;
      current.generation += 1;
    };
  }, [ownerLease]);
  const captureLease = useCallback(() => {
    const generation = lifecycle.current.generation;
    return () =>
      lifecycle.current.mounted &&
      lifecycle.current.generation === generation &&
      ownerLease();
  }, [ownerLease]);
  useEffect(
    () =>
      registerWorkspaceScopeCleanup(() => {
        requests.current += 1;
        setData(null);
        setError("");
        setOwnerLease(() => captureWorkspaceScope());
      }),
    [],
  );
  useEffect(() => {
    let active = true;
    const current = captureLease(),
      request = ++requests.current;
    void (transport?.read??readPurchaseAftercare)(id)
      .then((value) => {
        if (active && current() && request === requests.current) {
          if (value.item.id !== id)
            throw new Error("aftercare_record_mismatch");
          setData(value);
          setError("");
        }
      })
      .catch(() => {
        if (active && current() && request === requests.current)
          setError("购后档案暂时无法读取，已保存资料保留。");
      });
    return () => {
      active = false;
    };
  }, [id, attempt, captureLease,transport]);
  return (
    <section className="space-y-3 rounded-xl border border-[var(--separator)] p-4">
      <h2 className="text-lg font-medium">买后也有着落</h2>
      {error ? (
        <p role="alert">
          {error}
          <Button
            variant="ghost"
            onClick={() => setAttempt((value) => value + 1)}
          >
            重新读取
          </Button>
        </p>
      ) : data && data.item.id === id && ownerLease() ? (
        <AftercareForm transport={transport}
          data={data}
          recordId={id}
          captureLease={captureLease}
          onSaved={(item) => {
            if (item.id !== id || !captureLease()()) return;
            onSaved(item);
            setAttempt((value) => value + 1);
          }}
        />
      ) : (
        <p role="status">正在读取购后档案…</p>
      )}
    </section>
  );
}
function AftercareForm({
  transport,
  data,
  recordId,
  captureLease,
  onSaved,
}: {
  transport?:PurchaseAftercareTransport;
  data: Data;
  recordId: string;
  captureLease: () => () => boolean;
  onSaved: (item: Data["item"]) => void;
}) {
  const schema = z.object({
    revision: z.number(),
    purchasedOn: z.string(),
    returnUntil: z.string(),
    warrantyUntil: z.string(),
    orderReference: z.string(),
    note: z.string(),
    documentId: z.string(),
    documentKind: z.enum(["receipt", "invoice", "warranty", "other"]),
  });
  const { item } = data;
  const { value, setValue, commit, restored, recoveryUnavailable,isCurrent,uncertain,markUncertain,resolveUncertain } = useWorkflowDraft({
    kind: "shopping",
    id: `aftercare:${item.id}`,
    label: "购后档案",
    resumeHref: `/shopping/${item.id}`,
    resumeTarget: {kind:"shopping.aftercare",id:item.id},
    initialValue: {
      revision: item.mutation_revision,
      purchasedOn: item.purchased_on ?? "",
      returnUntil: item.return_until ?? "",
      warrantyUntil: item.warranty_until ?? "",
      orderReference: item.order_reference,
      note: item.aftercare_note,
      documentId: "",
      documentKind: "receipt" as const,
    },
    parse: (input) => {
      const result = schema.safeParse(input);
      return result.success ? result.data : null;
    },
  });
  const [pending, setPending] = useState(false),
    [message, setMessage] = useState("");
  const recovery = useRevisionRecovery<Data>();
  useDraftResumeConsumer({kind:"shopping.aftercare",identity:{id:item.id},ready:()=>true,open:focusDraftForm});
  const today = getDateKeyInTimeZone(new Date(), data.timezone)!;
  const deadline = (date: string | null) => {
    if (!date) return "未记录";
    const days = Math.round(
      (Date.parse(`${date}T00:00Z`) - Date.parse(`${today}T00:00Z`)) / 86400000,
    );
    return days < 0
      ? `记录截止日已过 ${-days} 天`
      : days === 0
        ? "记录截止日为今天"
        : `距记录截止日 ${days} 天`;
  };
  return (
    <>
      <p className="text-sm">
        退换：{deadline(item.return_until)} · 保修：
        {deadline(item.warranty_until)} · {data.timezone}
      </p>
      <p className="text-xs text-[var(--text-secondary)]">
        日期来自你的记录，不推断商家规则；截止日经过不会自动退货或完成任何操作。
      </p>
      <ul>
        {data.links.map((link) => {
          const doc = data.documents.find((doc) => doc.id === link.document_id);
          return (
            <li key={link.id} className="py-2">
              {doc ? (
                <Link className="ui-link" href={`/files?file=${doc.id}`}>
                  {doc.title} · {link.kind}
                </Link>
              ) : (
                "原件暂不可用，关联保留"
              )}
            </li>
          );
        })}
      </ul>
      <form
        data-workflow-draft-key={draftResumeKey({kind:"shopping.aftercare",id:item.id})}
        className="grid gap-3"
        onSubmit={async (event) => {
          event.preventDefault();
          if (!isCurrent() || pending || recovery.reading ||uncertain|| item.id !== recordId) return;
          const current = captureLease();
          if (!current()) return;
          setPending(true);
          const snapshot = value;
          try {
            const saved = await (transport?.save??savePurchaseAftercare)({
              ...snapshot,
              id: item.id,
              purchasedOn: snapshot.purchasedOn || null,
              returnUntil: snapshot.returnUntil || null,
              warrantyUntil: snapshot.warrantyUntil || null,
              documentId: snapshot.documentId || null,
            });
            if (current()) {
              if (saved.id !== recordId)
                throw new Error(
                  "保存结果与当前商品不一致，输入已保留，请重新读取核对。",
                );
              commit(snapshot, (before) => ({
                ...before,
                revision: saved.mutation_revision,
                documentId:
                  before.documentId === snapshot.documentId
                    ? ""
                    : before.documentId,
              }));
              onSaved(saved);
              setMessage("购后档案已保存");
            }
          } catch (error) {
            if (current()){markUncertain();
              setMessage(
                error instanceof Error ? error.message : "保存失败，输入保留",
              );}
          } finally {
            if (current()) setPending(false);
          }
        }}
      >
        {(
          [
            ["purchasedOn", "实际购买日"],
            ["returnUntil", "退换截止日"],
            ["warrantyUntil", "保修截止日"],
          ] as const
        ).map(([key, label]) => (
          <label key={key}>
            {label}（可留空）
            <input
              className="ui-field min-h-11 w-full text-base"
              type="date"
              value={value[key]}
              onChange={(event) =>
                setValue((before) => ({ ...before, [key]: event.target.value }))
              }
            />
          </label>
        ))}
        <label>
          订单参考
          <input
            className="ui-field min-h-11 w-full text-base"
            maxLength={500}
            value={value.orderReference}
            onChange={(event) =>
              setValue((before) => ({
                ...before,
                orderReference: event.target.value,
              }))
            }
          />
        </label>
        <label>
          售后说明
          <textarea
            className="ui-field w-full text-base"
            maxLength={8000}
            value={value.note}
            onChange={(event) =>
              setValue((before) => ({ ...before, note: event.target.value }))
            }
          />
        </label>
        <label>
          添加票据原件（最近200份）
          <select
            className="ui-field min-h-11 w-full text-base"
            value={value.documentId}
            onChange={(event) =>
              setValue((before) => ({
                ...before,
                documentId: event.target.value,
              }))
            }
          >
            <option value="">本次不添加</option>
            {data.documents
              .filter((doc) => doc.storage_state === "available")
              .map((doc) => (
                <option key={doc.id} value={doc.id}>
                  {doc.title}
                </option>
              ))}
          </select>
        </label>
        <label>
          原件用途
          <select
            className="ui-field min-h-11 w-full text-base"
            value={value.documentKind}
            onChange={(event) => {
              const parsed = schema.shape.documentKind.safeParse(
                event.target.value,
              );
              if (parsed.success)
                setValue((before) => ({
                  ...before,
                  documentKind: parsed.data,
                }));
            }}
          >
            <option value="receipt">订单票据</option>
            <option value="invoice">发票</option>
            <option value="warranty">保修文件</option>
            <option value="other">其他</option>
          </select>
        </label>
        <div>
          <Button disabled={pending || recovery.reading||uncertain}>保存购后档案</Button>
          <Link className="ui-link ml-3" href="/files">
            去上传原件
          </Link>
        </div>
        {message ? <p role="status">{message}</p> : null}
        {uncertain?<p role="status">原保存结果尚未确认，当前输入保留。请先读取最新记录并明确比较；不会重复发送原保存。</p>:null}<DraftRecoveryStatus restored={restored} recoveryUnavailable={recoveryUnavailable} />
      </form>
      <RevisionRecovery
        label="购后档案"
        recovery={recovery}
        disabled={pending}
        onRead={() => {
          const current = captureLease();
          if (!current() || item.id !== recordId) return;
          void recovery.read(async () => {
            const latest = await (transport?.read??readPurchaseAftercare)(recordId);
            if (!current() || latest.item.id !== recordId)
              throw new Error("购后档案已切换，请读取当前商品；原输入保留。");
            return latest;
          });
        }}
        current={
          <>
            <p>
              购买：{value.purchasedOn || "未记录"} · 退换：
              {value.returnUntil || "未记录"} · 保修：
              {value.warrantyUntil || "未记录"}
            </p>
            <p>订单：{value.orderReference || "未填写"}</p>
            <p className="whitespace-pre-wrap">
              说明：{value.note || "未填写"}
            </p>
            <p>编辑基于版本 {value.revision}</p>
            {value.documentId ? (
              <p>另有本次待关联文件，保留输入会继续保留此选择。</p>
            ) : null}
          </>
        }
        renderLatest={(latest) => (
          <>
            <p>
              购买：{latest.item.purchased_on || "未记录"} · 退换：
              {latest.item.return_until || "未记录"} · 保修：
              {latest.item.warranty_until || "未记录"}
            </p>
            <p>订单：{latest.item.order_reference || "未填写"}</p>
            <p className="whitespace-pre-wrap">
              说明：{latest.item.aftercare_note || "未填写"}
            </p>
            <p>
              已保存版本 {latest.item.mutation_revision} · {latest.links.length}
              份可见关联文件
            </p>
          </>
        )}
        onKeep={(latest) => {
          if (
            !captureLease()() ||
            latest.item.id !== recordId ||
            item.id !== recordId
          )
            return;
          if (latest.item.status !== "purchased") {
            setMessage(
              "商品目前不再标记为已购买，输入已保留；请先核对商品状态。",
            );
            return;
          }
          resolveUncertain();setValue((before) => ({
            ...before,
            revision: latest.item.mutation_revision,
          }));
          setMessage(
            "当前购后输入与待关联文件保留，基于刚读取的版本；尚未保存。",
          );
        }}
        onAdopt={(latest) => {
          if (
            !captureLease()() ||
            latest.item.id !== recordId ||
            item.id !== recordId
          )
            return;
          resolveUncertain();onSaved(latest.item);
          commit(value, () => ({
            revision: latest.item.mutation_revision,
            purchasedOn: latest.item.purchased_on ?? "",
            returnUntil: latest.item.return_until ?? "",
            warrantyUntil: latest.item.warranty_until ?? "",
            orderReference: latest.item.order_reference,
            note: latest.item.aftercare_note,
            documentId: "",
            documentKind: "receipt" as const,
          }));
          setMessage("已采用刚读取的购后档案，清除本次未提交的附件选择。");
        }}
      />
      {data.truncated ? <p>仅显示前200份关联。</p> : null}
    </>
  );
}
