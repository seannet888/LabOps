import { type FormEvent, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { useLocation } from "react-router-dom";
import { useAuth } from "../../app/auth.js";
import { canPerform } from "../../app/permissions.js";
import { Button } from "../../components/Button.js";
import { DataTable } from "../../components/DataTable.js";
import { Dialog } from "../../components/Dialog.js";
import { ErrorState } from "../../components/ErrorState.js";
import { FormField } from "../../components/FormField.js";
import { Input } from "../../components/Input.js";
import { MoneyText } from "../../components/MoneyText.js";
import { Select } from "../../components/Select.js";
import { StatusBadge } from "../../components/StatusBadge.js";
import { Textarea } from "../../components/Textarea.js";
import { Toast } from "../../components/Toast.js";
import { formatApiError, zodIssuesToFieldErrors, type FormattedApiError } from "../../lib/form-errors.js";
import { cancelOrder, changeOrderPrices, confirmOrder, listOrders, settleOrder, type Order } from "./api/orders.api.js";
import { cancelOrderFormSchema, changeOrderPricesFormSchema, settleOrderFormSchema } from "./order-schema.js";
import { ORDER_STATUSES, orderStatusTone, parseOrderStatus } from "./order-presenters.js";

type OrderRow = Order & { actions: string };

function canConfirmOrder(row: Order, user: NonNullable<ReturnType<typeof useAuth>["user"]>): boolean {
  return row.status === "pending" && canPerform(user, "orders:confirm");
}

export function OrdersListPage() {
  const auth = useAuth();
  const location = useLocation();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [customerFilter, setCustomerFilter] = useState(searchParams.get("customer_id") ?? "");
  const [statusFilter, setStatusFilter] = useState(searchParams.get("status") ?? "");
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [confirmingOrder, setConfirmingOrder] = useState<Order | null>(null);
  const [priceOrder, setPriceOrder] = useState<Order | null>(null);
  const [cancelOrderTarget, setCancelOrderTarget] = useState<Order | null>(null);
  const [settleOrderTarget, setSettleOrderTarget] = useState<Order | null>(null);
  const [confirmNote, setConfirmNote] = useState("");
  const [priceReason, setPriceReason] = useState("");
  const [priceItemId, setPriceItemId] = useState("");
  const [newActualPrice, setNewActualPrice] = useState("");
  const [cancelReason, setCancelReason] = useState("");
  const [settledAt, setSettledAt] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("");
  const [settlementNote, setSettlementNote] = useState("");
  const [commandError, setCommandError] = useState<FormattedApiError | null>(null);
  const [commandFieldErrors, setCommandFieldErrors] = useState<Partial<Record<string, string>>>({});

  const page = Number(searchParams.get("page") ?? "1");
  const perPage = Number(searchParams.get("per_page") ?? "20");
  const filters = {
    page: Number.isFinite(page) && page > 0 ? page : 1,
    perPage: Number.isFinite(perPage) && perPage > 0 ? perPage : 20,
    customerId: searchParams.get("customer_id") ?? undefined,
    status: parseOrderStatus(searchParams.get("status"))
  };

  const ordersQuery = useQuery({
    queryKey: ["orders", filters],
    queryFn: () => listOrders(filters, auth.token)
  });

  const confirmMutation = useMutation({
    mutationFn: () => confirmOrder(confirmingOrder!.id, { confirmNote }, auth.token),
    onSuccess: async () => {
      setConfirmingOrder(null);
      setConfirmNote("");
      setCommandError(null);
      setToastMessage("订单已确认");
      await queryClient.invalidateQueries({ queryKey: ["orders"] });
      await queryClient.invalidateQueries({ queryKey: ["delivery-tasks"] });
    },
    onError: (error) => setCommandError(formatApiError(error))
  });

  const changePricesMutation = useMutation({
    mutationFn: () => changeOrderPrices(priceOrder!.id, {
      reason: priceReason,
      items: [{ orderItemId: priceItemId, actualPrice: newActualPrice }]
    }, auth.token),
    onSuccess: async () => {
      setPriceOrder(null);
      setPriceReason("");
      setPriceItemId("");
      setNewActualPrice("");
      setCommandError(null);
      setToastMessage("订单价格已更新");
      await queryClient.invalidateQueries({ queryKey: ["orders"] });
    },
    onError: (error) => setCommandError(formatApiError(error))
  });

  const cancelMutation = useMutation({
    mutationFn: () => cancelOrder(cancelOrderTarget!.id, { reason: cancelReason }, auth.token),
    onSuccess: async () => {
      setCancelOrderTarget(null);
      setCancelReason("");
      setCommandError(null);
      setToastMessage("订单已取消");
      await queryClient.invalidateQueries({ queryKey: ["orders"] });
      await queryClient.invalidateQueries({ queryKey: ["delivery-tasks"] });
    },
    onError: (error) => setCommandError(formatApiError(error))
  });

  const settleMutation = useMutation({
    mutationFn: () => settleOrder(settleOrderTarget!.id, {
      settledAt,
      paymentMethod,
      note: settlementNote
    }, auth.token),
    onSuccess: async () => {
      setSettleOrderTarget(null);
      setSettledAt("");
      setPaymentMethod("");
      setSettlementNote("");
      setCommandError(null);
      setToastMessage("订单已结算");
      await queryClient.invalidateQueries({ queryKey: ["orders"] });
    },
    onError: (error) => setCommandError(formatApiError(error))
  });

  function updateFilters(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const next = new URLSearchParams();
    next.set("page", "1");
    next.set("per_page", String(filters.perPage));
    if (customerFilter) next.set("customer_id", customerFilter);
    if (parseOrderStatus(statusFilter)) next.set("status", statusFilter);
    setSearchParams(next);
  }

  function changePage(nextPage: number): void {
    const next = new URLSearchParams(searchParams);
    next.set("page", String(nextPage));
    next.set("per_page", String(filters.perPage));
    setSearchParams(next);
  }

  const rows: OrderRow[] = (ordersQuery.data?.data ?? []).map((order) => ({ ...order, actions: "" }));
  const canWriteOrders = auth.user ? canPerform(auth.user, "orders:create") : false;

  return (
    <section aria-labelledby="orders-title" className="page-stack">
      <div className="page-title-row">
        <div>
          <h1 id="orders-title">订单</h1>
          <p>销售订单列表、筛选和状态流转。</p>
        </div>
        {canWriteOrders ? (
          <Link className="button" to="/orders/new">
            <Plus aria-hidden="true" size={16} />
            创建订单
          </Link>
        ) : null}
      </div>

      <form className="filter-bar" aria-label="订单筛选" onSubmit={updateFilters}>
        <Input aria-label="客户筛选" placeholder="客户 ID" value={customerFilter} onChange={(event) => setCustomerFilter(event.target.value)} />
        <Select aria-label="状态筛选" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
          <option value="">全部状态</option>
          {ORDER_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
        </Select>
        <Button variant="secondary" type="submit">筛选</Button>
      </form>

      {toastMessage ? <Toast tone="success" message={toastMessage} /> : null}
      {typeof location.state === "object" && location.state && "toast" in location.state ? <Toast tone="success" message={String(location.state.toast)} /> : null}
      {ordersQuery.error ? <ErrorState message={formatApiError(ordersQuery.error).message} requestId={formatApiError(ordersQuery.error).requestId} /> : null}

      <div className="page-panel">
        <DataTable
          loading={ordersQuery.isLoading}
          columns={[
            { key: "orderNumber", header: "订单号" },
            { key: "customerName", header: "客户" },
            { key: "status", header: "状态", render: (row) => <StatusBadge tone={orderStatusTone(row.status)}>{row.status}</StatusBadge> },
            { key: "totalAmount", header: "金额", render: (row) => <MoneyText value={row.totalAmount} /> },
            { key: "requiresInvoice", header: "发票", render: (row) => row.requiresInvoice ? "需要" : "不需要" },
            { key: "createdAt", header: "创建时间" },
            {
              key: "actions",
              header: "操作",
              render: (row) => auth.user && canPerform(auth.user, "orders:read") ? (
                <div className="row-actions">
                  {canConfirmOrder(row, auth.user) ? <Button variant="secondary" type="button" onClick={() => setConfirmingOrder(row)}>确认</Button> : null}
                  {canPerform(auth.user, "orders:change_prices") ? <Button variant="secondary" type="button" onClick={() => { setCommandError(null); setCommandFieldErrors({}); setPriceOrder(row); }}>改价</Button> : null}
                  {canPerform(auth.user, "orders:cancel") ? <Button variant="secondary" type="button" onClick={() => { setCommandError(null); setCommandFieldErrors({}); setCancelOrderTarget(row); }}>取消</Button> : null}
                  {canPerform(auth.user, "orders:settle") ? <Button variant="secondary" type="button" onClick={() => { setCommandError(null); setCommandFieldErrors({}); setSettleOrderTarget(row); }}>结算</Button> : null}
                  <Link className="button secondary" to={`/orders/${row.id}`}>详情</Link>
                </div>
              ) : <Link className="button secondary" to={`/orders/${row.id}`}>详情</Link>
            }
          ]}
          rows={rows}
          pagination={{
            page: ordersQuery.data?.meta.page ?? 1,
            totalPages: ordersQuery.data?.meta.totalPages ?? 1,
            onPageChange: changePage
          }}
        />
      </div>

      <Dialog title="确认订单" open={Boolean(confirmingOrder)} onClose={() => setConfirmingOrder(null)}>
        <form
          className="form-grid"
          onSubmit={(event) => {
            event.preventDefault();
            setCommandError(null);
            setCommandFieldErrors({});
            confirmMutation.mutate();
          }}
        >
          {commandError ? <ErrorState message={commandError.message} requestId={commandError.requestId} /> : null}
          <FormField label="确认备注" htmlFor="confirmNote">
            <Textarea id="confirmNote" value={confirmNote} onChange={(event) => setConfirmNote(event.target.value)} />
          </FormField>
          <div className="dialog-actions">
            <Button variant="secondary" type="button" onClick={() => setConfirmingOrder(null)}>取消</Button>
            <Button type="submit" loading={confirmMutation.isPending}>提交确认</Button>
          </div>
        </form>
      </Dialog>

      <Dialog title="订单改价" open={Boolean(priceOrder)} onClose={() => setPriceOrder(null)}>
        <form
          className="form-grid"
          onSubmit={(event) => {
            event.preventDefault();
            setCommandError(null);
            setCommandFieldErrors({});
            const parsed = changeOrderPricesFormSchema.safeParse({ reason: priceReason, orderItemId: priceItemId, actualPrice: newActualPrice });
            if (!parsed.success) {
              setCommandFieldErrors(zodIssuesToFieldErrors(parsed.error.issues));
              return;
            }
            changePricesMutation.mutate();
          }}
        >
          {commandError ? <ErrorState message={commandError.message} requestId={commandError.requestId} /> : null}
          <FormField label="改价原因" htmlFor="priceReason" error={commandFieldErrors.reason}>
            <Textarea id="priceReason" value={priceReason} onChange={(event) => setPriceReason(event.target.value)} />
          </FormField>
          <FormField label="订单项 ID" htmlFor="priceItemId" error={commandFieldErrors.orderItemId}>
            <Input id="priceItemId" value={priceItemId} onChange={(event) => setPriceItemId(event.target.value)} />
          </FormField>
          <FormField label="新实际单价" htmlFor="newActualPrice" error={commandFieldErrors.actualPrice}>
            <Input id="newActualPrice" inputMode="decimal" value={newActualPrice} onChange={(event) => setNewActualPrice(event.target.value)} />
          </FormField>
          <div className="dialog-actions">
            <Button variant="secondary" type="button" onClick={() => setPriceOrder(null)}>取消</Button>
            <Button type="submit" loading={changePricesMutation.isPending}>提交改价</Button>
          </div>
        </form>
      </Dialog>

      <Dialog title="取消订单" open={Boolean(cancelOrderTarget)} onClose={() => setCancelOrderTarget(null)}>
        <form
          className="form-grid"
          onSubmit={(event) => {
            event.preventDefault();
            setCommandError(null);
            setCommandFieldErrors({});
            const parsed = cancelOrderFormSchema.safeParse({ reason: cancelReason });
            if (!parsed.success) {
              setCommandFieldErrors(zodIssuesToFieldErrors(parsed.error.issues));
              return;
            }
            cancelMutation.mutate();
          }}
        >
          {commandError ? <ErrorState message={commandError.message} requestId={commandError.requestId} /> : null}
          <FormField label="取消原因" htmlFor="cancelReason" error={commandFieldErrors.reason}>
            <Textarea id="cancelReason" value={cancelReason} onChange={(event) => setCancelReason(event.target.value)} />
          </FormField>
          <div className="dialog-actions">
            <Button variant="secondary" type="button" onClick={() => setCancelOrderTarget(null)}>返回</Button>
            <Button type="submit" loading={cancelMutation.isPending}>提交取消</Button>
          </div>
        </form>
      </Dialog>

      <Dialog title="订单结算" open={Boolean(settleOrderTarget)} onClose={() => setSettleOrderTarget(null)}>
        <form
          className="form-grid"
          onSubmit={(event) => {
            event.preventDefault();
            setCommandError(null);
            setCommandFieldErrors({});
            const parsed = settleOrderFormSchema.safeParse({ settledAt, paymentMethod, note: settlementNote });
            if (!parsed.success) {
              setCommandFieldErrors(zodIssuesToFieldErrors(parsed.error.issues));
              return;
            }
            settleMutation.mutate();
          }}
        >
          {commandError ? <ErrorState message={commandError.message} requestId={commandError.requestId} /> : null}
          <FormField label="结算日期" htmlFor="settledAt" error={commandFieldErrors.settledAt}>
            <Input id="settledAt" value={settledAt} onChange={(event) => setSettledAt(event.target.value)} />
          </FormField>
          <FormField label="支付方式" htmlFor="paymentMethod">
            <Input id="paymentMethod" value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)} />
          </FormField>
          <FormField label="结算备注" htmlFor="settlementNote">
            <Textarea id="settlementNote" value={settlementNote} onChange={(event) => setSettlementNote(event.target.value)} />
          </FormField>
          <div className="dialog-actions">
            <Button variant="secondary" type="button" onClick={() => setSettleOrderTarget(null)}>取消</Button>
            <Button type="submit" loading={settleMutation.isPending}>提交结算</Button>
          </div>
        </form>
      </Dialog>
    </section>
  );
}
