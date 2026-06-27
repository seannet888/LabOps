import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { buildOrder, InMemoryOrderRepository } from "../shared/test-fixtures.js";
import { OrderExportApplicationService } from "./order-export-application.service.js";

describe("OrderExportApplicationService.exportOrdersXlsx", () => {
  it("generates an xlsx workbook with order rows", async () => {
    const orders = new InMemoryOrderRepository(
      new Map([["ord_001", buildOrder({ status: "delivered", customerId: "cus_001", orderNumber: "XS001", totalAmount: "360.00" })]])
    );
    const service = new OrderExportApplicationService({ orders });

    const result = await service.exportOrdersXlsx({ status: "delivered" });
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(result.data.buffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);
    const sheet = workbook.getWorksheet("orders");

    expect(result.data.fileName).toBe("orders.xlsx");
    expect(sheet?.getRow(1).values).toEqual([, "订单ID", "订单号", "客户ID", "状态", "总金额"]);
    expect(sheet?.getRow(2).values).toEqual([, "ord_001", "XS001", "cus_001", "delivered", "360.00"]);
  });
});


