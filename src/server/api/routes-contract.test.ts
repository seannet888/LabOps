import { describe, expect, it } from "vitest";
import { ConflictError } from "../application/errors.js";
import type { AppDependencies } from "./app-dependencies.js";
import { buildApp } from "./app.js";

function deps(overrides: Partial<AppDependencies> = {}): AppDependencies {
  const auth = {
    getCurrentUser: async (token: string) => ({
      data: token === "logistics"
        ? { id: "2", displayName: "logistics", role: "logistics", permissions: [] }
        : { id: "1", displayName: "sales", role: "sales", permissions: [] }
    })
  };

  const base = {
    auth,
    orders: {
      listOrders: async () => ({ data: [], meta: { total: 0, page: 1, limit: 20 } }),
      createOrder: async () => ({ data: { id: "1", orderNumber: "XS1", status: "pending", totalAmount: "28.00" } }),
      getOrder: async () => ({
        data: {
          id: "1",
          orderNumber: "XS20260626a3f8b2c1",
          customerId: "cus_001",
          customerName: "Peking Lab",
          status: "confirmed",
          totalAmount: "560.00",
          invoiceRequired: true,
          invoiceType: "tech_service",
          createdAt: "2026-06-25T10:30:00.000Z",
          items: []
        }
      }),
      confirmOrder: async () => ({ data: { id: "1", status: "confirmed", deliveryTaskId: "1" }, meta: { events: [] } }),
      changeOrderPrices: async () => ({ data: { id: "1" } }),
      cancelOrder: async () => ({ data: { id: "1", status: "cancelled" } }),
      settleOrder: async () => ({ data: { id: "1", status: "settled" } }),
      archiveDocuments: async () => ({ data: { id: "1", status: "invoiced" } })
    },
    delivery: {
      listDeliveryTasks: async () => ({ data: [], meta: { total: 0, page: 1, limit: 20 } }),
      getDeliveryTask: async () => ({
        data: {
          id: "1",
          orderId: "ord_001",
          orderNumber: "XS20260626a3f8b2c1",
          status: "scheduled",
          customerName: "Peking Lab",
          geoArea: "海淀",
          deliveryAddress: "北京市海淀区xxx楼xxx室",
          contactName: "李同学",
          contactPhone: "13800000000",
          plannedDeliveryDate: "2026-06-27",
          vehicle: "京A12345",
          driver: "张师傅",
          deliveryBatch: "BATCH-01",
          routeNotes: "上午送达",
          deliveredAt: undefined,
          salesActionRequired: false,
          documentReadiness: {
            certificateUploaded: false,
            invoiceRegistered: false,
            requiresInvoice: true
          }
        }
      }),
      scheduleDeliveryTask: async () => ({ data: { id: "1", status: "scheduled" } }),
      flagSalesActionRequired: async () => ({ data: { id: "1" } }),
      confirmShipment: async () => ({ data: { id: "1", status: "shipped", orderId: "1", orderStatus: "shipped" }, meta: { events: [] } }),
      confirmDelivery: async () => ({ data: { id: "1", status: "delivered", orderId: "1", orderStatus: "delivered" } })
    },
    inventory: {
      getShipmentSuggestions: async () => ({ data: [] }),
      createBatch: async () => ({ data: { id: "1" } }),
      listBatches: async () => ({ data: [], meta: { total: 0, page: 1, limit: 20 } }),
      getAvailability: async () => ({ data: { availableQty: 0, reservedQty: 0, agingQty: 0 } })
    },
    customers: {
      listCustomers: async () => ({ data: [], meta: { total: 0, page: 1, limit: 20 } }),
      createCustomer: async () => ({ data: { id: "1", name: "客户", settlementType: "single", creditDays: 60, isActive: true } }),
      updateCustomer: async () => ({ data: { id: "1" } }),
      updateDeliveryAddress: async () => ({ data: { id: "1" } })
    },
    catalog: {
      listSpecies: async () => ({ data: [] }),
      listStrains: async () => ({ data: [] }),
      getCurrentPriceForStrain: async () => null,
      createStrain: async () => ({ data: { id: "1", speciesId: "1", name: "C57" } }),
      deactivateStrain: async () => ({ data: { id: "1", isActive: false } }),
      updateStrainStatus: async () => ({ data: { id: "1", isActive: false } }),
      createPriceRule: async () => ({ data: { id: "1" } })
    },
    documents: {
      uploadCertificate: async () => ({ data: { id: "1" } }),
      registerInvoice: async () => ({ data: { id: "1" } })
    }
  };

  return { ...base, ...overrides } as unknown as AppDependencies;
}

describe("HTTP route contract boundaries", () => {
  it("rejects logistics users before order price changes reach the application module", async () => {
    let called = false;
    const app = buildApp(deps({ orders: { ...deps().orders, changeOrderPrices: async () => { called = true; return { data: { id: "1" } }; } } as never }));

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/orders/1/change-prices",
      headers: { authorization: "Bearer logistics", "idempotency-key": "idem-1" },
      payload: { reason: "合同调价", items: [{ order_item_id: "1", actual_price: "30.00" }] }
    });

    expect(response.statusCode).toBe(403);
    expect(called).toBe(false);
  });

  it("rejects sales users before shipment confirmation reaches the application module", async () => {
    let called = false;
    const app = buildApp(deps({ delivery: { ...deps().delivery, confirmShipment: async () => { called = true; return { data: { id: "1", status: "shipped", orderId: "1", orderStatus: "shipped" }, meta: { events: [] } }; } } as never }));

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/delivery-tasks/1/confirm-shipment",
      headers: { authorization: "Bearer sales", "idempotency-key": "idem-2" },
      payload: { stock_deductions: [{ order_item_id: "1", inventory_batch_id: "1", quantity: 1 }] }
    });

    expect(response.statusCode).toBe(403);
    expect(called).toBe(false);
  });

  it("passes delivery confirmation details from the request body to the application module", async () => {
    let input: unknown;
    const app = buildApp(deps({
      delivery: {
        ...deps().delivery,
        confirmDelivery: async (value: unknown) => {
          input = value;
          return { data: { id: "1", status: "delivered", orderId: "1", orderStatus: "delivered" } };
        }
      } as never
    }));

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/delivery-tasks/1/confirm-delivery",
      headers: { authorization: "Bearer logistics", "idempotency-key": "idem-delivered-at" },
      payload: { delivered_at: "2026-06-30", note: "上午已补录送达" }
    });

    expect(response.statusCode).toBe(200);
    expect(input).toMatchObject({ deliveryTaskId: "1", deliveredAt: "2026-06-30", note: "上午已补录送达" });
  });

  it("maps order command idempotency conflicts to the error envelope", async () => {
    const app = buildApp(deps({ orders: { ...deps().orders, createOrder: async () => { throw new ConflictError(); } } as never }));

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/orders",
      headers: { authorization: "Bearer sales", "idempotency-key": "idem-3" },
      payload: { customer_id: "1", items: [{ strain_id: "1", age_weeks: 4, gender: "M", quantity: 1, actual_price: "28.00" }] }
    });

    expect(response.statusCode).toBe(409);
    expect(JSON.parse(response.body).error.code).toBe("conflict");
  });

  it("maps delivery command idempotency conflicts to the error envelope", async () => {
    const app = buildApp(deps({ delivery: { ...deps().delivery, scheduleDeliveryTask: async () => { throw new ConflictError(); } } as never }));

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/delivery-tasks/1/schedule",
      headers: { authorization: "Bearer logistics", "idempotency-key": "idem-4" },
      payload: { planned_delivery_date: "2026-06-30", vehicle: "沪A12345" }
    });

    expect(response.statusCode).toBe(409);
    expect(JSON.parse(response.body).error.code).toBe("conflict");
  });
  it("rejects invalid order list pagination before it reaches the application module", async () => {
    let called = false;
    const app = buildApp(deps({
      orders: {
        ...deps().orders,
        listOrders: async () => {
          called = true;
          return { data: [], meta: { total: 0, page: 1, limit: 20 } };
        }
      } as never
    }));

    const response = await app.inject({
      method: "GET",
      url: "/api/v1/orders?page=abc&per_page=20",
      headers: { authorization: "Bearer sales" }
    });

    expect(response.statusCode).toBe(422);
    expect(JSON.parse(response.body).error.code).toBe("validation_error");
    expect(called).toBe(false);
  });
  it("rejects invalid delivery task status before it reaches the application module", async () => {
    let called = false;
    const app = buildApp(deps({
      delivery: {
        ...deps().delivery,
        listDeliveryTasks: async () => {
          called = true;
          return { data: [], meta: { total: 0, page: 1, limit: 20 } };
        }
      } as never
    }));

    const response = await app.inject({
      method: "GET",
      url: "/api/v1/delivery-tasks?status=unknown&page=1&per_page=20",
      headers: { authorization: "Bearer logistics" }
    });

    expect(response.statusCode).toBe(422);
    expect(JSON.parse(response.body).error.code).toBe("validation_error");
    expect(called).toBe(false);
  });
  it("passes delivery task date and geo filters to the application module", async () => {
    let input: unknown;
    const app = buildApp(deps({
      delivery: {
        ...deps().delivery,
        listDeliveryTasks: async (value: unknown) => {
          input = value;
          return { data: [], meta: { total: 0, page: 1, limit: 20 } };
        }
      } as never
    }));

    const response = await app.inject({
      method: "GET",
      url: "/api/v1/delivery-tasks?planned_delivery_date=2026-06-30&geo_area=海淀&page=1&per_page=20",
      headers: { authorization: "Bearer logistics" }
    });

    expect(response.statusCode).toBe(200);
    expect(input).toMatchObject({ plannedDeliveryDate: "2026-06-30", geoArea: "海淀" });
  });
  it("lists delivery tasks with the public contract fields needed by the frontend", async () => {
    const app = buildApp(deps({
      delivery: {
        ...deps().delivery,
        listDeliveryTasks: async () => ({
          data: [{
            id: "dt_001",
            orderId: "ord_001",
            orderNumber: "XS20260626a3f8b2c1",
            status: "pending_schedule",
            customerName: "Peking Lab",
            geoArea: "海淀",
            deliveryAddress: "北京市海淀区xxx楼xxx室",
            contactName: "李同学",
            contactPhone: "13800000000",
            plannedDeliveryDate: "2026-06-27",
            salesActionRequired: false,
            documentReadiness: {
              certificateUploaded: false,
              invoiceRegistered: false,
              requiresInvoice: true
            }
          }],
          meta: { total: 1, page: 1, limit: 20 }
        })
      } as never
    }));

    const response = await app.inject({
      method: "GET",
      url: "/api/v1/delivery-tasks?page=1&per_page=20",
      headers: { authorization: "Bearer logistics" }
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toMatchObject({
      data: [{
        id: "dt_001",
        order_id: "ord_001",
        order_number: "XS20260626a3f8b2c1",
        status: "pending_schedule",
        customer_name: "Peking Lab",
        geo_area: "海淀",
        delivery_address: "北京市海淀区xxx楼xxx室",
        contact_name: "李同学",
        contact_phone: "13800000000",
        planned_delivery_date: "2026-06-27",
        sales_action_required: false,
        document_readiness: {
          certificate_uploaded: false,
          invoice_registered: false,
          requires_invoice: true
        }
      }],
      meta: { total: 1, page: 1, limit: 20 },
      links: {}
    });
  });

  it("returns delivery task detail fields for deep-linked delivery pages", async () => {
    const app = buildApp(deps());

    const response = await app.inject({
      method: "GET",
      url: "/api/v1/delivery-tasks/1",
      headers: { authorization: "Bearer logistics" }
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toMatchObject({
      data: {
        id: "1",
        order_id: "ord_001",
        order_number: "XS20260626a3f8b2c1",
        status: "scheduled",
        customer_name: "Peking Lab",
        geo_area: "海淀",
        delivery_address: "北京市海淀区xxx楼xxx室",
        contact_name: "李同学",
        contact_phone: "13800000000",
        planned_delivery_date: "2026-06-27",
        vehicle: "京A12345",
        driver: "张师傅",
        delivery_batch: "BATCH-01",
        route_notes: "上午送达",
        sales_action_required: false,
        document_readiness: {
          certificate_uploaded: false,
          invoice_registered: false,
          requires_invoice: true
        }
      }
    });
  });

  it("rejects order commands missing Idempotency-Key before they reach the application module", async () => {
    let called = false;
    const app = buildApp(deps({
      orders: {
        ...deps().orders,
        createOrder: async () => {
          called = true;
          return { data: { id: "1", orderNumber: "XS1", status: "pending", totalAmount: "28.00" } };
        }
      } as never
    }));

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/orders",
      headers: { authorization: "Bearer sales" },
      payload: { customer_id: "1", items: [{ strain_id: "1", age_weeks: 4, gender: "M", quantity: 1, actual_price: "28.00" }] }
    });

    expect(response.statusCode).toBe(422);
    expect(JSON.parse(response.body).error.code).toBe("validation_error");
    expect(called).toBe(false);
  });

  it("passes confirm order notes from the request body to the application module", async () => {
    let input: unknown;
    const app = buildApp(deps({
      orders: {
        ...deps().orders,
        confirmOrder: async (value: unknown) => {
          input = value;
          return { data: { id: "1", status: "confirmed", deliveryTaskId: "1" }, meta: { events: [] } };
        }
      } as never
    }));

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/orders/1/confirm",
      headers: { authorization: "Bearer sales", "idempotency-key": "idem-confirm-note" },
      payload: { confirm_note: "客户微信确认" }
    });

    expect(response.statusCode).toBe(200);
    expect(input).toMatchObject({ orderId: "1", confirmNote: "客户微信确认" });
  });

  it("returns order detail fields for deep-linked order pages", async () => {
    const app = buildApp(deps());

    const response = await app.inject({
      method: "GET",
      url: "/api/v1/orders/1",
      headers: { authorization: "Bearer sales" }
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toMatchObject({
      data: {
        id: "1",
        order_number: "XS20260626a3f8b2c1",
        customer_id: "cus_001",
        customer_name: "Peking Lab",
        status: "confirmed",
        total_amount: "560.00",
        requires_invoice: true,
        invoice_type: "tech_service",
        created_at: "2026-06-25T10:30:00.000Z"
      }
    });
  });

  it("rejects invalid inventory batch gender before it reaches the application module", async () => {
    let called = false;
    const app = buildApp(deps({
      inventory: {
        ...deps().inventory,
        listBatches: async () => {
          called = true;
          return { data: [], meta: { total: 0, page: 1, limit: 20 } };
        }
      } as never
    }));

    const response = await app.inject({
      method: "GET",
      url: "/api/v1/inventory-batches?gender=X&page=1&per_page=20",
      headers: { authorization: "Bearer sales" }
    });

    expect(response.statusCode).toBe(422);
    expect(JSON.parse(response.body).error.code).toBe("validation_error");
    expect(called).toBe(false);
  });

  it("rejects invalid customer creation payloads before they reach the application module", async () => {
    let called = false;
    const app = buildApp(deps({
      customers: {
        ...deps().customers,
        createCustomer: async () => {
          called = true;
          return { data: { id: "1", name: "客户", settlementType: "single", creditDays: 60, isActive: true } };
        }
      } as never
    }));

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/customers",
      headers: { authorization: "Bearer sales" },
      payload: { settlement_type: "monthly" }
    });

    expect(response.statusCode).toBe(422);
    expect(JSON.parse(response.body).error.code).toBe("validation_error");
    expect(called).toBe(false);
  });

  it("includes customer notes in list responses for edit forms", async () => {
    const app = buildApp(deps({
      customers: {
        ...deps().customers,
        listCustomers: async () => ({
          data: [{
            id: "cus_001",
            name: "Peking Lab",
            settlementType: "monthly",
            creditDays: 60,
            notes: "VIP animal room",
            isActive: true
          }],
          meta: { total: 1, page: 1, limit: 20 }
        })
      } as never
    }));

    const response = await app.inject({
      method: "GET",
      url: "/api/v1/customers?page=1&per_page=20",
      headers: { authorization: "Bearer sales" }
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body).data[0]).toMatchObject({ id: "cus_001", notes: "VIP animal room" });
  });

  it("rejects invalid export status before it reaches the application module", async () => {
    let called = false;
    const app = buildApp(deps({
      exports: {
        exportOrdersXlsx: async () => {
          called = true;
          return {
            data: {
              buffer: Buffer.from("xlsx"),
              contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
              fileName: "orders.xlsx"
            }
          };
        }
      } as never
    }));

    const response = await app.inject({
      method: "GET",
      url: "/api/v1/exports/orders.xlsx?status=unknown",
      headers: { authorization: "Bearer sales" }
    });

    expect(response.statusCode).toBe(422);
    expect(JSON.parse(response.body).error.code).toBe("validation_error");
    expect(called).toBe(false);
  });

  it("rejects invalid export date filters before they reach the application module", async () => {
    let called = false;
    const app = buildApp(deps({
      exports: {
        exportOrdersXlsx: async () => {
          called = true;
          return {
            data: {
              buffer: Buffer.from("xlsx"),
              contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
              fileName: "orders.xlsx"
            }
          };
        }
      } as never
    }));

    const response = await app.inject({
      method: "GET",
      url: "/api/v1/exports/orders.xlsx?created_at[gte]=2026/06/01",
      headers: { authorization: "Bearer sales" }
    });

    expect(response.statusCode).toBe(422);
    expect(called).toBe(false);
  });

  it("rejects invoice registration without Idempotency-Key before it reaches the application module", async () => {
    let called = false;
    const app = buildApp(deps({
      documents: {
        ...deps().documents,
        registerInvoice: async () => {
          called = true;
          return { data: { id: "1" } };
        }
      } as never
    }));

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/orders/1/invoice-registration",
      headers: { authorization: "Bearer sales" },
      payload: { invoice_type: "vat_special", registered_at: "2026-06-26" }
    });

    expect(response.statusCode).toBe(422);
    expect(JSON.parse(response.body).error.code).toBe("validation_error");
    expect(called).toBe(false);
  });

  it("rejects invalid order command date strings before they reach application modules", async () => {
    let settleCalled = false;
    let invoiceCalled = false;
    const app = buildApp(deps({
      orders: {
        ...deps().orders,
        settleOrder: async () => {
          settleCalled = true;
          return { data: { id: "1", status: "settled" } };
        }
      } as never,
      documents: {
        ...deps().documents,
        registerInvoice: async () => {
          invoiceCalled = true;
          return { data: { id: "1" } };
        }
      } as never
    }));

    const settleResponse = await app.inject({
      method: "POST",
      url: "/api/v1/orders/1/settle",
      headers: { authorization: "Bearer sales", "idempotency-key": "idem-settle-date" },
      payload: { settled_at: "2026/06/30" }
    });
    const invoiceResponse = await app.inject({
      method: "POST",
      url: "/api/v1/orders/1/invoice-registration",
      headers: { authorization: "Bearer sales", "idempotency-key": "idem-invoice-date" },
      payload: { invoice_type: "tech_service", registered_at: "2026/06/30" }
    });

    expect(settleResponse.statusCode).toBe(422);
    expect(invoiceResponse.statusCode).toBe(422);
    expect(settleCalled).toBe(false);
    expect(invoiceCalled).toBe(false);
  });

  it("rejects empty delivery flag reasons before they reach the application module", async () => {
    let called = false;
    const app = buildApp(deps({
      delivery: {
        ...deps().delivery,
        flagSalesActionRequired: async () => {
          called = true;
          return { data: { id: "1" } };
        }
      } as never
    }));

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/delivery-tasks/1/flag-sales-action-required",
      headers: { authorization: "Bearer logistics", "idempotency-key": "idem-flag" },
      payload: { reason: "" }
    });

    expect(response.statusCode).toBe(422);
    expect(JSON.parse(response.body).error.code).toBe("validation_error");
    expect(called).toBe(false);
  });

  it("rejects invalid strain creation payloads before they reach the application module", async () => {
    let called = false;
    const app = buildApp(deps({
      auth: { ...deps().auth,
        getCurrentUser: async () => ({ data: { id: "3", displayName: "manager", role: "manager", permissions: [] } })
      } as never,
      catalog: {
        ...deps().catalog,
        createStrain: async () => {
          called = true;
          return { data: { id: "1", speciesId: "1", name: "C57" } };
        }
      } as never
    }));

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/strains",
      headers: { authorization: "Bearer manager" },
      payload: { species_id: "spc_mouse" }
    });

    expect(response.statusCode).toBe(422);
    expect(JSON.parse(response.body).error.code).toBe("validation_error");
    expect(called).toBe(false);
  });

  it("requires managers before strain deactivation reaches the application module", async () => {
    let called = false;
    const app = buildApp(deps({
      catalog: {
        ...deps().catalog,
        deactivateStrain: async () => {
          called = true;
          return { data: { id: "str_001", isActive: false } };
        }
      } as never
    }));

    const response = await app.inject({
      method: "PATCH",
      url: "/api/v1/strains/str_001",
      headers: { authorization: "Bearer sales" },
      payload: { is_active: false }
    });

    expect(response.statusCode).toBe(403);
    expect(called).toBe(false);
  });

  it("passes strain reactivation payloads to the application module", async () => {
    let received: unknown;
    const app = buildApp(deps({
      auth: { ...deps().auth,
        getCurrentUser: async () => ({ data: { id: "3", displayName: "manager", role: "manager", permissions: [] } })
      } as never,
      catalog: {
        ...deps().catalog,
        updateStrainStatus: async (input: unknown) => {
          received = input;
          return { data: { id: "str_001", isActive: true } };
        }
      } as never
    }));

    const response = await app.inject({
      method: "PATCH",
      url: "/api/v1/strains/str_001",
      headers: { authorization: "Bearer manager" },
      payload: { is_active: true }
    });

    expect(response.statusCode).toBe(200);
    expect(received).toEqual({ strainId: "str_001", isActive: true });
    expect(JSON.parse(response.body).data).toEqual({ id: "str_001", is_active: true });
  });

  it("rejects invalid inventory availability queries before they reach the application module", async () => {
    let called = false;
    const app = buildApp(deps({
      inventory: {
        ...deps().inventory,
        getAvailability: async () => {
          called = true;
          return { data: { availableQty: 0, reservedQty: 0, agingQty: 0 } };
        }
      } as never
    }));

    const response = await app.inject({
      method: "GET",
      url: "/api/v1/inventory-availability?strain_id=1&age_weeks=bad&gender=M",
      headers: { authorization: "Bearer sales" }
    });

    expect(response.statusCode).toBe(422);
    expect(JSON.parse(response.body).error.code).toBe("validation_error");
    expect(called).toBe(false);
  });

  it("rejects invalid audit log pagination before it reaches the application module", async () => {
    let called = false;
    const app = buildApp(deps({
      auth: { ...deps().auth,
        getCurrentUser: async () => ({ data: { id: "3", displayName: "manager", role: "manager", permissions: [] } })
      } as never,
      audit: {
        listAuditLogs: async () => {
          called = true;
          return { data: [], meta: { total: 0, page: 1, limit: 20 } };
        }
      } as never
    }));

    const response = await app.inject({
      method: "GET",
      url: "/api/v1/audit-logs?page=0&per_page=20",
      headers: { authorization: "Bearer manager" }
    });

    expect(response.statusCode).toBe(422);
    expect(JSON.parse(response.body).error.code).toBe("validation_error");
    expect(called).toBe(false);
  });

  it("lists delivery strategy rules for sales users through the list envelope", async () => {
    const app = buildApp(deps({
      deliveryStrategy: {
        ...deps().deliveryStrategy,
        listDeliveryStrategyRules: async () => ({
          data: [
            {
              id: "rule_1",
              name: "carton hint",
              geoArea: "Haidian",
              amountThreshold: "500.00",
              quantityThreshold: undefined,
              suggestionText: "Add {remaining_amount}",
              isActive: true
            }
          ],
          meta: { total: 1, page: 1, limit: 20 }
        })
      } as never
    }));

    const response = await app.inject({
      method: "GET",
      url: "/api/v1/delivery-strategy-rules?page=1&per_page=20",
      headers: { authorization: "Bearer sales" }
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toMatchObject({
      data: [{ id: "rule_1", amount_threshold: "500.00", is_active: true }],
      meta: { total: 1, page: 1, limit: 20 },
      links: {}
    });
  });
  it("allows managers to create delivery strategy rules", async () => {
    let input: unknown;
    const app = buildApp(deps({
      auth: { ...deps().auth,
        getCurrentUser: async () => ({ data: { id: "3", displayName: "manager", role: "manager", permissions: [] } })
      } as never,
      deliveryStrategy: {
        ...deps().deliveryStrategy,
        createDeliveryStrategyRule: async (value: unknown) => {
          input = value;
          return { data: { id: "rule_2" } };
        }
      } as never
    }));

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/delivery-strategy-rules",
      headers: { authorization: "Bearer manager" },
      payload: {
        name: "carton hint",
        geo_area: "Haidian",
        amount_threshold: "500.00",
        suggestion_text: "Add {remaining_amount}",
        is_active: true
      }
    });

    expect(response.statusCode).toBe(201);
    expect(JSON.parse(response.body).data.id).toBe("rule_2");
    expect(input).toMatchObject({ actorId: "3", amountThreshold: "500.00" });
  });
  it("allows managers to patch delivery strategy rules", async () => {
    let input: unknown;
    const app = buildApp(deps({
      auth: { ...deps().auth,
        getCurrentUser: async () => ({ data: { id: "3", displayName: "manager", role: "manager", permissions: [] } })
      } as never,
      deliveryStrategy: {
        ...deps().deliveryStrategy,
        updateDeliveryStrategyRule: async (value: unknown) => {
          input = value;
          return { data: { id: "rule_2" } };
        }
      } as never
    }));

    const response = await app.inject({
      method: "PATCH",
      url: "/api/v1/delivery-strategy-rules/rule_2",
      headers: { authorization: "Bearer manager" },
      payload: { is_active: false, amount_threshold: "600.00" }
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body).data.id).toBe("rule_2");
    expect(input).toMatchObject({ actorId: "3", ruleId: "rule_2", isActive: false, amountThreshold: "600.00" });
  });
  it("rejects sales users before delivery strategy rule creation reaches the application module", async () => {
    let called = false;
    const app = buildApp(deps({
      deliveryStrategy: {
        ...deps().deliveryStrategy,
        createDeliveryStrategyRule: async () => {
          called = true;
          return { data: { id: "rule_2" } };
        }
      } as never
    }));

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/delivery-strategy-rules",
      headers: { authorization: "Bearer sales" },
      payload: { name: "carton hint", amount_threshold: "500.00", suggestion_text: "Add {remaining_amount}" }
    });

    expect(response.statusCode).toBe(403);
    expect(called).toBe(false);
  });

  it("validates delivery strategy rule decimal strings before creation reaches the application module", async () => {
    let called = false;
    const app = buildApp(deps({
      auth: { ...deps().auth,
        getCurrentUser: async () => ({ data: { id: "3", displayName: "manager", role: "manager", permissions: [] } })
      } as never,
      deliveryStrategy: {
        ...deps().deliveryStrategy,
        createDeliveryStrategyRule: async () => {
          called = true;
          return { data: { id: "rule_2" } };
        }
      } as never
    }));

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/delivery-strategy-rules",
      headers: { authorization: "Bearer manager" },
      payload: { name: "carton hint", amount_threshold: "500.999", suggestion_text: "Add {remaining_amount}" }
    });

    expect(response.statusCode).toBe(422);
    expect(JSON.parse(response.body).error.code).toBe("validation_error");
    expect(called).toBe(false);
  });
});
