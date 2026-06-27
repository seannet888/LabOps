import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../../app/auth.js";
import { ErrorState } from "../../components/ErrorState.js";
import { StatusBadge } from "../../components/StatusBadge.js";
import { formatApiError } from "../../lib/form-errors.js";
import { getDeliveryTask } from "./api/delivery.api.js";
import { deliveryStatusTone } from "./delivery-presenters.js";

export function DeliveryTaskDetailPage() {
  const { taskId } = useParams();
  const auth = useAuth();
  const taskQuery = useQuery({
    queryKey: ["delivery-tasks", "detail", taskId],
    queryFn: () => getDeliveryTask(taskId ?? "", auth.token),
    enabled: Boolean(taskId)
  });
  const task = taskQuery.data;

  return (
    <section aria-labelledby="delivery-detail-title" className="page-stack">
      <div className="page-title-row">
        <div>
          <h1 id="delivery-detail-title">配送详情</h1>
          <p>查看配送安排、客户联系信息和票证准备；出库事实以用户确认提交的 stock_deductions 为准。</p>
        </div>
        <Link className="button secondary" to="/delivery-tasks">返回配送列表</Link>
      </div>
      {taskQuery.error ? <ErrorState message={formatApiError(taskQuery.error).message} requestId={formatApiError(taskQuery.error).requestId} /> : null}
      <div className="page-panel">
        {taskQuery.isLoading ? <div className="table-state">正在加载配送详情</div> : null}
        {task ? (
          <dl className="detail-list">
            <dt>订单号</dt>
            <dd>{task.orderNumber ?? task.orderId}</dd>
            <dt>客户</dt>
            <dd>{task.customerName ?? "-"}</dd>
            <dt>状态</dt>
            <dd><StatusBadge tone={deliveryStatusTone(task.status)}>{task.status}</StatusBadge></dd>
            <dt>计划配送日期</dt>
            <dd>{task.plannedDeliveryDate ?? "-"}</dd>
            <dt>车辆</dt>
            <dd>{task.vehicle ?? "-"}</dd>
            <dt>司机</dt>
            <dd>{task.driver ?? "-"}</dd>
            <dt>配送批次</dt>
            <dd>{task.deliveryBatch ?? "-"}</dd>
            <dt>路线备注</dt>
            <dd>{task.routeNotes ?? "-"}</dd>
            <dt>区域</dt>
            <dd>{task.geoArea ?? "-"}</dd>
            <dt>配送地址</dt>
            <dd>{task.deliveryAddress ?? "-"}</dd>
            <dt>联系人</dt>
            <dd>{task.contactName ?? "-"}</dd>
            <dt>联系电话</dt>
            <dd>{task.contactPhone ?? "-"}</dd>
            <dt>票证</dt>
            <dd>
              {task.documentReadiness
                ? `合格证${task.documentReadiness.certificateUploaded ? "已上传" : "未上传"}，发票${task.documentReadiness.invoiceRegistered ? "已登记" : "未登记"}`
                : "-"}
            </dd>
            <dt>需销售处理</dt>
            <dd>{task.salesActionRequired ? task.salesActionNote ?? "是" : "否"}</dd>
            <dt>送达日期</dt>
            <dd>{task.deliveredAt ?? "-"}</dd>
            <dt>配送任务 ID</dt>
            <dd>{task.id}</dd>
          </dl>
        ) : null}
      </div>
    </section>
  );
}
