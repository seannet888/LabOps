import { DataTable } from "../components/DataTable.js";
import { StatusBadge } from "../components/StatusBadge.js";

type PageDefinition = {
  title: string;
  description: string;
  status?: "ready" | "reserved";
};

const pages = {
  customers: {
    title: "客户",
    description: "客户列表、筛选和创建入口将在客户纵向切片中接入。",
    status: "ready"
  },
  inventoryBatches: {
    title: "库存批次",
    description: "批次列表、入库和分页筛选将在库存纵向切片中接入。",
    status: "ready"
  },
  inventoryAvailability: {
    title: "可售查询",
    description: "可售量遵守 initial_qty - reserved_qty - stock_deduction_sum。",
    status: "ready"
  },
  orders: {
    title: "订单",
    description: "订单列表、筛选和命令操作将在订单纵向切片中接入。",
    status: "ready"
  },
  orderCreate: {
    title: "创建订单",
    description: "订单表单会通过 mapper 输出 snake_case command DTO。",
    status: "ready"
  },
  orderDetail: {
    title: "订单详情",
    description: "详情页保留深链，后续可与右侧 drawer 共享内容。",
    status: "ready"
  },
  deliveryTasks: {
    title: "配送任务",
    description: "配送列表、建议和出库送达命令将在配送纵向切片中接入。",
    status: "ready"
  },
  deliveryTaskDetail: {
    title: "配送详情",
    description: "出库时用户确认的 stock_deductions 才是实际扣减事实。",
    status: "ready"
  },
  auditLogs: {
    title: "审计",
    description: "管理员审计查询入口已保留。",
    status: "reserved"
  },
  strategyRules: {
    title: "配送策略",
    description: "销售可读、管理员可写的策略管理入口已保留。",
    status: "reserved"
  },
  exports: {
    title: "导出",
    description: "订单 XLSX 导出入口已保留。",
    status: "reserved"
  }
} satisfies Record<string, PageDefinition>;

export function PlaceholderPage({ page }: { page: keyof typeof pages }) {
  const definition = pages[page];

  return (
    <section aria-labelledby={`${page}-title`} className="page-stack">
      <div className="page-title-row">
        <div>
          <h1 id={`${page}-title`}>{definition.title}</h1>
          <p>{definition.description}</p>
        </div>
        <StatusBadge tone={definition.status === "reserved" ? "warning" : "neutral"}>
          {definition.status === "reserved" ? "预留入口" : "待接入"}
        </StatusBadge>
      </div>
      <div className="page-panel">
        <DataTable
          columns={[
            { key: "name", header: "模块" },
            { key: "boundary", header: "边界" }
          ]}
          rows={[
            { id: page, name: definition.title, boundary: "通过 API client、mapper 和 permission map 接入后端 contract" }
          ]}
        />
      </div>
    </section>
  );
}
