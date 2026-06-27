const actionLabels: Record<string, string> = {
  confirm_order: "确认订单",
  change_prices: "订单改价",
  cancel_order: "取消订单",
  settle_order: "订单结算",
  confirm_shipment: "确认出库",
  confirm_delivery: "确认送达",
  flag_sales_action: "标记销售处理",
  create_inventory_batch: "新增入库",
  update_address: "更新地址"
};

export function auditActionLabel(action: string): string {
  return actionLabels[action] ?? action;
}

const auditValueLabels: Record<string, string> = {
  actual_price: "实际单价",
  actualPrice: "实际单价",
  confirmNote: "确认备注",
  deliveredAt: "送达日期",
  note: "备注",
  status: "状态"
};

function valueLabel(key: string): string {
  return auditValueLabels[key] ?? key;
}

function primitiveText(value: unknown): string {
  if (value === undefined || value === null || value === "") {
    return "-";
  }
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return JSON.stringify(value);
}

export function formatAuditValue(value: unknown): string {
  if (value === undefined || value === null || value === "") {
    return "-";
  }
  const text = typeof value === "object" && !Array.isArray(value)
    ? Object.entries(value as Record<string, unknown>)
        .filter(([, entry]) => entry !== undefined && entry !== null && entry !== "")
        .map(([key, entry]) => `${valueLabel(key)}：${primitiveText(entry)}`)
        .join("；") || "-"
    : primitiveText(value);
  return text.length > 80 ? `${text.slice(0, 77)}...` : text;
}
