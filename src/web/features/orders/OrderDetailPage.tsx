import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../../app/auth.js";
import { ErrorState } from "../../components/ErrorState.js";
import { MoneyText } from "../../components/MoneyText.js";
import { StatusBadge } from "../../components/StatusBadge.js";
import { formatApiError } from "../../lib/form-errors.js";
import { getOrder } from "./api/orders.api.js";
import { orderStatusTone } from "./order-presenters.js";

export function OrderDetailPage() {
  const { orderId } = useParams();
  const auth = useAuth();
  const orderQuery = useQuery({
    queryKey: ["orders", "detail", orderId],
    queryFn: () => getOrder(orderId ?? "", auth.token),
    enabled: Boolean(orderId)
  });
  const order = orderQuery.data;

  return (
    <section aria-labelledby="order-detail-title" className="page-stack">
      <div className="page-title-row">
        <div>
          <h1 id="order-detail-title">订单详情</h1>
          <p>查看订单基础信息、金额、发票与状态。</p>
        </div>
        <Link className="button secondary" to="/orders">返回订单列表</Link>
      </div>
      {orderQuery.error ? <ErrorState message={formatApiError(orderQuery.error).message} requestId={formatApiError(orderQuery.error).requestId} /> : null}
      <div className="page-panel">
        {orderQuery.isLoading ? <div className="table-state">正在加载订单详情</div> : null}
        {order ? (
          <dl className="detail-list">
            <dt>订单号</dt>
            <dd>{order.orderNumber ?? order.id}</dd>
            <dt>客户</dt>
            <dd>{order.customerName ?? order.customerId ?? "-"}</dd>
            <dt>状态</dt>
            <dd><StatusBadge tone={orderStatusTone(order.status)}>{order.status}</StatusBadge></dd>
            <dt>金额</dt>
            <dd><MoneyText value={order.totalAmount} /></dd>
            <dt>发票</dt>
            <dd>{order.requiresInvoice ? order.invoiceType ?? "需要" : "不需要"}</dd>
            <dt>创建时间</dt>
            <dd>{order.createdAt ?? "-"}</dd>
            <dt>订单 ID</dt>
            <dd>{order.id}</dd>
          </dl>
        ) : null}
      </div>
    </section>
  );
}
