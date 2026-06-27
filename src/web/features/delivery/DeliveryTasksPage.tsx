import { type FormEvent, useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { useAuth } from "../../app/auth.js";
import { canPerform } from "../../app/permissions.js";
import { Button } from "../../components/Button.js";
import { DataTable } from "../../components/DataTable.js";
import { Dialog } from "../../components/Dialog.js";
import { ErrorState } from "../../components/ErrorState.js";
import { FormField } from "../../components/FormField.js";
import { Input } from "../../components/Input.js";
import { Select } from "../../components/Select.js";
import { StatusBadge } from "../../components/StatusBadge.js";
import { Textarea } from "../../components/Textarea.js";
import { Toast } from "../../components/Toast.js";
import { formatApiError, type FormattedApiError } from "../../lib/form-errors.js";
import { zodIssuesToFieldErrors } from "../../lib/form-errors.js";
import {
  confirmDelivery,
  confirmShipment,
  flagSalesActionRequired,
  listDeliveryTasks,
  listShipmentSuggestions,
  scheduleDeliveryTask,
  type DeliveryTask,
  type ShipmentSuggestion
} from "./api/delivery.api.js";
import {
  confirmDeliveryFormSchema,
  confirmShipmentFormSchema,
  flagSalesActionFormSchema,
  scheduleDeliveryFormSchema
} from "./delivery-schema.js";
import { DELIVERY_STATUSES, deliveryStatusTone, formatShipmentSuggestion, parseDeliveryStatus } from "./delivery-presenters.js";

type DeliveryRow = DeliveryTask & { actions: string };
type DeliveryField = "plannedDeliveryDate" | "orderItemId" | "inventoryBatchId" | "quantity" | "releaseReason" | "deliveredAt" | "reason";

export function DeliveryTasksPage() {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [statusFilter, setStatusFilter] = useState(searchParams.get("status") ?? "");
  const [plannedDateFilter, setPlannedDateFilter] = useState(searchParams.get("planned_delivery_date") ?? "");
  const [geoAreaFilter, setGeoAreaFilter] = useState(searchParams.get("geo_area") ?? "");
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [commandError, setCommandError] = useState<FormattedApiError | null>(null);
  const [commandFieldErrors, setCommandFieldErrors] = useState<Partial<Record<DeliveryField, string>>>({});
  const [scheduleTarget, setScheduleTarget] = useState<DeliveryTask | null>(null);
  const [shipmentTarget, setShipmentTarget] = useState<DeliveryTask | null>(null);
  const [deliveryTarget, setDeliveryTarget] = useState<DeliveryTask | null>(null);
  const [flagTarget, setFlagTarget] = useState<DeliveryTask | null>(null);
  const [plannedDeliveryDate, setPlannedDeliveryDate] = useState("");
  const [vehicle, setVehicle] = useState("");
  const [driver, setDriver] = useState("");
  const [deliveryBatch, setDeliveryBatch] = useState("");
  const [routeNotes, setRouteNotes] = useState("");
  const [deductionOrderItemId, setDeductionOrderItemId] = useState("");
  const [deductionBatchId, setDeductionBatchId] = useState("");
  const [deductionQty, setDeductionQty] = useState("1");
  const [missingCertificate, setMissingCertificate] = useState(false);
  const [missingInvoice, setMissingInvoice] = useState(false);
  const [releaseReason, setReleaseReason] = useState("");
  const [deliveredAt, setDeliveredAt] = useState("");
  const [deliveryNote, setDeliveryNote] = useState("");
  const [flagReason, setFlagReason] = useState("");

  const page = Number(searchParams.get("page") ?? "1");
  const perPage = Number(searchParams.get("per_page") ?? "20");
  const filters = {
    page: Number.isFinite(page) && page > 0 ? page : 1,
    perPage: Number.isFinite(perPage) && perPage > 0 ? perPage : 20,
    status: parseDeliveryStatus(searchParams.get("status")),
    plannedDeliveryDate: searchParams.get("planned_delivery_date") ?? undefined,
    geoArea: searchParams.get("geo_area") ?? undefined
  };

  const deliveryQuery = useQuery({
    queryKey: ["delivery-tasks", filters],
    queryFn: () => listDeliveryTasks(filters, auth.token)
  });

  const suggestionsQuery = useQuery({
    queryKey: ["delivery-task-suggestions", shipmentTarget?.id],
    queryFn: () => listShipmentSuggestions(shipmentTarget!.id, auth.token),
    enabled: Boolean(shipmentTarget)
  });

  useEffect(() => {
    const firstSuggestion: ShipmentSuggestion | undefined = suggestionsQuery.data?.[0];
    const firstBatch = firstSuggestion?.suggestedBatches[0];
    if (firstSuggestion && firstBatch) {
      setDeductionOrderItemId(firstSuggestion.orderItemId);
      setDeductionBatchId(firstBatch.inventoryBatchId);
      setDeductionQty(String(firstBatch.quantity));
    }
  }, [suggestionsQuery.data]);

  const scheduleMutation = useMutation({
    mutationFn: () => scheduleDeliveryTask(scheduleTarget!.id, {
      plannedDeliveryDate,
      vehicle,
      driver,
      deliveryBatch,
      routeNotes
    }, auth.token),
    onSuccess: async () => {
      setScheduleTarget(null);
      setPlannedDeliveryDate("");
      setVehicle("");
      setDriver("");
      setDeliveryBatch("");
      setRouteNotes("");
      setCommandError(null);
      setToastMessage("配送已安排");
      await queryClient.invalidateQueries({ queryKey: ["delivery-tasks"] });
    },
    onError: (error) => setCommandError(formatApiError(error))
  });

  const shipmentMutation = useMutation({
    mutationFn: () => confirmShipment(shipmentTarget!.id, {
      stockDeductions: [{
        orderItemId: deductionOrderItemId,
        inventoryBatchId: deductionBatchId,
        quantity: Number(deductionQty)
      }],
      documentRelease: missingCertificate || missingInvoice
        ? { missingCertificate, missingInvoice, reason: releaseReason }
        : undefined
    }, auth.token),
    onSuccess: async () => {
      setShipmentTarget(null);
      setCommandError(null);
      setToastMessage("出库已确认");
      await queryClient.invalidateQueries({ queryKey: ["delivery-tasks"] });
      await queryClient.invalidateQueries({ queryKey: ["orders"] });
      await queryClient.invalidateQueries({ queryKey: ["inventory-batches"] });
      await queryClient.invalidateQueries({ queryKey: ["inventory-availability"] });
    },
    onError: (error) => setCommandError(formatApiError(error))
  });

  const deliveryMutation = useMutation({
    mutationFn: () => confirmDelivery(deliveryTarget!.id, { deliveredAt, note: deliveryNote }, auth.token),
    onSuccess: async () => {
      setDeliveryTarget(null);
      setDeliveredAt("");
      setDeliveryNote("");
      setCommandError(null);
      setToastMessage("送达已确认");
      await queryClient.invalidateQueries({ queryKey: ["delivery-tasks"] });
      await queryClient.invalidateQueries({ queryKey: ["orders"] });
    },
    onError: (error) => setCommandError(formatApiError(error))
  });

  const flagMutation = useMutation({
    mutationFn: () => flagSalesActionRequired(flagTarget!.id, { reason: flagReason }, auth.token),
    onSuccess: async () => {
      setFlagTarget(null);
      setFlagReason("");
      setCommandError(null);
      setToastMessage("已标记需销售处理");
      await queryClient.invalidateQueries({ queryKey: ["delivery-tasks"] });
    },
    onError: (error) => setCommandError(formatApiError(error))
  });

  function updateFilters(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const next = new URLSearchParams();
    next.set("page", "1");
    next.set("per_page", String(filters.perPage));
    if (parseDeliveryStatus(statusFilter)) next.set("status", statusFilter);
    if (plannedDateFilter) next.set("planned_delivery_date", plannedDateFilter);
    if (geoAreaFilter) next.set("geo_area", geoAreaFilter);
    setSearchParams(next);
  }

  function changePage(nextPage: number): void {
    const next = new URLSearchParams(searchParams);
    next.set("page", String(nextPage));
    next.set("per_page", String(filters.perPage));
    setSearchParams(next);
  }

  function openSchedule(task: DeliveryTask): void {
    setCommandError(null);
    setCommandFieldErrors({});
    setScheduleTarget(task);
    setPlannedDeliveryDate(task.plannedDeliveryDate ?? "");
  }

  function openShipment(task: DeliveryTask): void {
    setCommandError(null);
    setCommandFieldErrors({});
    setShipmentTarget(task);
    setDeductionOrderItemId("");
    setDeductionBatchId("");
    setDeductionQty("1");
    setMissingCertificate(false);
    setMissingInvoice(false);
    setReleaseReason("");
  }

  const rows: DeliveryRow[] = (deliveryQuery.data?.data ?? []).map((task) => ({ ...task, actions: "" }));
  const canSchedule = auth.user ? canPerform(auth.user, "delivery_tasks:schedule") : false;
  const canShip = auth.user ? canPerform(auth.user, "delivery_tasks:confirm_shipment") : false;
  const canDeliver = auth.user ? canPerform(auth.user, "delivery_tasks:confirm_delivery") : false;
  const canFlag = auth.user ? canPerform(auth.user, "delivery_tasks:flag_sales_action") : false;

  return (
    <section aria-labelledby="delivery-tasks-title" className="page-stack">
      <div className="page-title-row">
        <div>
          <h1 id="delivery-tasks-title">配送任务</h1>
          <p>配送列表、安排、出库、送达和需销售处理。</p>
        </div>
      </div>

      <form className="filter-bar" aria-label="配送筛选" onSubmit={updateFilters}>
        <Select aria-label="状态筛选" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
          <option value="">全部状态</option>
          {DELIVERY_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
        </Select>
        <Input aria-label={scheduleTarget ? "计划配送日期筛选" : "计划配送日期"} placeholder="YYYY-MM-DD" value={plannedDateFilter} onChange={(event) => setPlannedDateFilter(event.target.value)} />
        <Input aria-label="区域筛选" placeholder="区域" value={geoAreaFilter} onChange={(event) => setGeoAreaFilter(event.target.value)} />
        <Button variant="secondary" type="submit">筛选</Button>
      </form>

      {toastMessage ? <Toast tone="success" message={toastMessage} /> : null}
      {deliveryQuery.error ? <ErrorState message={formatApiError(deliveryQuery.error).message} requestId={formatApiError(deliveryQuery.error).requestId} /> : null}

      <div className="page-panel">
        <DataTable
          loading={deliveryQuery.isLoading}
          columns={[
            { key: "orderNumber", header: "订单号" },
            { key: "customerName", header: "客户" },
            { key: "geoArea", header: "区域" },
            { key: "status", header: "状态", render: (row) => <StatusBadge tone={deliveryStatusTone(row.status)}>{row.status}</StatusBadge> },
            { key: "plannedDeliveryDate", header: "计划日期" },
            { key: "salesActionRequired", header: "销售处理", render: (row) => row.salesActionRequired ? "需要" : "正常" },
            {
              key: "actions",
              header: "操作",
              render: (row) => (
                <div className="row-actions">
                  {canSchedule ? <Button variant="secondary" type="button" onClick={() => openSchedule(row)}>安排</Button> : null}
                  {canShip ? <Button variant="secondary" type="button" onClick={() => openShipment(row)}>出库</Button> : null}
                  {canDeliver ? <Button variant="secondary" type="button" onClick={() => { setCommandError(null); setCommandFieldErrors({}); setDeliveryTarget(row); }}>送达</Button> : null}
                  {canFlag ? <Button variant="secondary" type="button" onClick={() => { setCommandError(null); setCommandFieldErrors({}); setFlagTarget(row); }}>标记问题</Button> : null}
                  <Link className="button secondary" to={`/delivery-tasks/${row.id}`}>详情</Link>
                </div>
              )
            }
          ]}
          rows={rows}
          pagination={{
            page: deliveryQuery.data?.meta.page ?? 1,
            totalPages: deliveryQuery.data?.meta.totalPages ?? 1,
            onPageChange: changePage
          }}
        />
      </div>

      <Dialog title="安排配送" open={Boolean(scheduleTarget)} onClose={() => setScheduleTarget(null)}>
        <form className="form-grid" onSubmit={(event) => {
          event.preventDefault();
          setCommandError(null);
          setCommandFieldErrors({});
          const parsed = scheduleDeliveryFormSchema.safeParse({ plannedDeliveryDate, vehicle, driver, deliveryBatch, routeNotes });
          if (!parsed.success) {
            setCommandFieldErrors(zodIssuesToFieldErrors(parsed.error.issues));
            return;
          }
          scheduleMutation.mutate();
        }}>
          {commandError ? <ErrorState message={commandError.message} requestId={commandError.requestId} /> : null}
          <FormField label="计划配送日期" htmlFor="plannedDeliveryDate" error={commandFieldErrors.plannedDeliveryDate}>
            <Input id="plannedDeliveryDate" value={plannedDeliveryDate} onChange={(event) => setPlannedDeliveryDate(event.target.value)} />
          </FormField>
          <FormField label="车辆" htmlFor="vehicle"><Input id="vehicle" value={vehicle} onChange={(event) => setVehicle(event.target.value)} /></FormField>
          <FormField label="司机" htmlFor="driver"><Input id="driver" value={driver} onChange={(event) => setDriver(event.target.value)} /></FormField>
          <FormField label="配送批次" htmlFor="deliveryBatch"><Input id="deliveryBatch" value={deliveryBatch} onChange={(event) => setDeliveryBatch(event.target.value)} /></FormField>
          <FormField label="路线备注" htmlFor="routeNotes"><Textarea id="routeNotes" value={routeNotes} onChange={(event) => setRouteNotes(event.target.value)} /></FormField>
          <div className="dialog-actions">
            <Button variant="secondary" type="button" onClick={() => setScheduleTarget(null)}>取消</Button>
            <Button type="submit" loading={scheduleMutation.isPending}>提交安排</Button>
          </div>
        </form>
      </Dialog>

      <Dialog title="确认出库" open={Boolean(shipmentTarget)} onClose={() => setShipmentTarget(null)}>
        <form className="form-grid" onSubmit={(event) => {
          event.preventDefault();
          setCommandError(null);
          setCommandFieldErrors({});
          const parsed = confirmShipmentFormSchema.safeParse({
            orderItemId: deductionOrderItemId,
            inventoryBatchId: deductionBatchId,
            quantity: deductionQty,
            missingCertificate,
            missingInvoice,
            releaseReason
          });
          if (!parsed.success) {
            setCommandFieldErrors(zodIssuesToFieldErrors(parsed.error.issues));
            return;
          }
          shipmentMutation.mutate();
        }}>
          {commandError ? <ErrorState message={commandError.message} requestId={commandError.requestId} /> : null}
          {suggestionsQuery.data?.flatMap((suggestion) => formatShipmentSuggestion(suggestion).map((text) => (
            <p key={`${suggestion.orderItemId}-${text}`} className="helper-text">{text}</p>
          )))}
          <FormField label="订单项 ID" htmlFor="deductionOrderItemId" error={commandFieldErrors.orderItemId}><Input id="deductionOrderItemId" value={deductionOrderItemId} onChange={(event) => setDeductionOrderItemId(event.target.value)} /></FormField>
          <FormField label="库存批次 ID" htmlFor="deductionBatchId" error={commandFieldErrors.inventoryBatchId}><Input id="deductionBatchId" value={deductionBatchId} onChange={(event) => setDeductionBatchId(event.target.value)} /></FormField>
          <FormField label="扣减数量" htmlFor="deductionQty" error={commandFieldErrors.quantity}><Input id="deductionQty" inputMode="numeric" value={deductionQty} onChange={(event) => setDeductionQty(event.target.value)} /></FormField>
          <label className="checkbox-row"><input type="checkbox" checked={missingCertificate} onChange={(event) => setMissingCertificate(event.target.checked)} />缺少合格证</label>
          <label className="checkbox-row"><input type="checkbox" checked={missingInvoice} onChange={(event) => setMissingInvoice(event.target.checked)} />缺少发票</label>
          <FormField label="放行原因" htmlFor="releaseReason" error={commandFieldErrors.releaseReason}><Textarea id="releaseReason" value={releaseReason} onChange={(event) => setReleaseReason(event.target.value)} /></FormField>
          <p className="helper-text">建议只是起点，提交前请确认实际扣减批次和数量。</p>
          <div className="dialog-actions">
            <Button variant="secondary" type="button" onClick={() => setShipmentTarget(null)}>取消</Button>
            <Button type="submit" loading={shipmentMutation.isPending}>提交出库</Button>
          </div>
        </form>
      </Dialog>

      <Dialog title="确认送达" open={Boolean(deliveryTarget)} onClose={() => setDeliveryTarget(null)}>
        <form className="form-grid" onSubmit={(event) => {
          event.preventDefault();
          setCommandError(null);
          setCommandFieldErrors({});
          const parsed = confirmDeliveryFormSchema.safeParse({ deliveredAt, note: deliveryNote });
          if (!parsed.success) {
            setCommandFieldErrors(zodIssuesToFieldErrors(parsed.error.issues));
            return;
          }
          deliveryMutation.mutate();
        }}>
          {commandError ? <ErrorState message={commandError.message} requestId={commandError.requestId} /> : null}
          <FormField label="送达时间" htmlFor="deliveredAt" error={commandFieldErrors.deliveredAt}><Input id="deliveredAt" value={deliveredAt} onChange={(event) => setDeliveredAt(event.target.value)} /></FormField>
          <FormField label="送达备注" htmlFor="deliveryNote"><Textarea id="deliveryNote" value={deliveryNote} onChange={(event) => setDeliveryNote(event.target.value)} /></FormField>
          <div className="dialog-actions">
            <Button variant="secondary" type="button" onClick={() => setDeliveryTarget(null)}>取消</Button>
            <Button type="submit" loading={deliveryMutation.isPending}>提交送达</Button>
          </div>
        </form>
      </Dialog>

      <Dialog title="标记需销售处理" open={Boolean(flagTarget)} onClose={() => setFlagTarget(null)}>
        <form className="form-grid" onSubmit={(event) => {
          event.preventDefault();
          setCommandError(null);
          setCommandFieldErrors({});
          const parsed = flagSalesActionFormSchema.safeParse({ reason: flagReason });
          if (!parsed.success) {
            setCommandFieldErrors(zodIssuesToFieldErrors(parsed.error.issues));
            return;
          }
          flagMutation.mutate();
        }}>
          {commandError ? <ErrorState message={commandError.message} requestId={commandError.requestId} /> : null}
          <FormField label="问题原因" htmlFor="flagReason" error={commandFieldErrors.reason}><Textarea id="flagReason" value={flagReason} onChange={(event) => setFlagReason(event.target.value)} /></FormField>
          <div className="dialog-actions">
            <Button variant="secondary" type="button" onClick={() => setFlagTarget(null)}>取消</Button>
            <Button type="submit" loading={flagMutation.isPending}>提交标记</Button>
          </div>
        </form>
      </Dialog>
    </section>
  );
}
