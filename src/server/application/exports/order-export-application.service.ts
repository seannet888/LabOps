import ExcelJS from "exceljs";
import type { Order, OrderRepository } from "../shared/types.js";

export interface ExportOrdersXlsxInput {
  status?: Order["status"];
  createdAtGte?: string;
  createdAtLte?: string;
}

export interface ExportOrdersXlsxResult {
  data: {
    buffer: Buffer;
    fileName: string;
    contentType: string;
  };
}

export class OrderExportApplicationService {
  constructor(private readonly deps: { orders: OrderRepository }) {}

  async exportOrdersXlsx(input: ExportOrdersXlsxInput): Promise<ExportOrdersXlsxResult> {
    const orders = await this.deps.orders.list({ status: input.status, page: 1, limit: 10000 });
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("orders");

    sheet.addRow(["订单ID", "订单号", "客户ID", "状态", "总金额"]);
    for (const order of orders.data) {
      sheet.addRow([order.id, order.orderNumber ?? "", order.customerId ?? "", order.status, order.totalAmount ?? "0.00"]);
    }

    const data = await workbook.xlsx.writeBuffer();
    return {
      data: {
        buffer: Buffer.from(data),
        fileName: "orders.xlsx",
        contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      }
    };
  }
}
