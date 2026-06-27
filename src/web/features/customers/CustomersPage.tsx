import { type FormEvent, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useSearchParams } from "react-router-dom";
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
import { formatApiError, zodIssuesToFieldErrors, type FormattedApiError } from "../../lib/form-errors.js";
import { createCustomer, listCustomers, updateCustomer, type Customer } from "./api/customers.api.js";
import { customerFormSchema, type CustomerFormValues } from "./customer-schema.js";
import { customerStatusTone, settlementTypeLabel } from "./customer-presenters.js";
import {
  customerFormFromModel,
  customerSaveSuccessMessage,
  defaultCustomerForm,
  type CustomerDialogMode
} from "./customer-form-model.js";

type CustomerRow = Customer & { actions: string };

type FieldErrors = Partial<Record<keyof CustomerFormValues, string>>;

export function CustomersPage() {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [queryFilter, setQueryFilter] = useState(searchParams.get("q") ?? "");
  const [geoAreaFilter, setGeoAreaFilter] = useState(searchParams.get("geo_area") ?? "");
  const [dialogMode, setDialogMode] = useState<CustomerDialogMode | null>(null);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [form, setForm] = useState<CustomerFormValues>(defaultCustomerForm);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<FormattedApiError | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const page = Number(searchParams.get("page") ?? "1");
  const perPage = Number(searchParams.get("per_page") ?? "20");
  const filters = {
    page: Number.isFinite(page) && page > 0 ? page : 1,
    perPage: Number.isFinite(perPage) && perPage > 0 ? perPage : 20,
    q: searchParams.get("q") ?? undefined,
    geoArea: searchParams.get("geo_area") ?? undefined
  };

  const customersQuery = useQuery({
    queryKey: ["customers", filters],
    queryFn: () => listCustomers(filters, auth.token)
  });

  const saveMutation = useMutation({
    mutationFn: (values: Parameters<typeof createCustomer>[0]) => {
      if (dialogMode === "edit" && editingCustomer) {
        return updateCustomer(editingCustomer.id, values, auth.token);
      }
      return createCustomer(values, auth.token);
    },
    onSuccess: async () => {
      const message = customerSaveSuccessMessage(dialogMode ?? "create");
      setDialogMode(null);
      setEditingCustomer(null);
      setForm(defaultCustomerForm);
      setFieldErrors({});
      setFormError(null);
      setToastMessage(message);
      await queryClient.invalidateQueries({ queryKey: ["customers"] });
    },
    onError: (error) => setFormError(formatApiError(error))
  });

  function openCreateDialog(): void {
    setDialogMode("create");
    setEditingCustomer(null);
    setForm(defaultCustomerForm);
    setFieldErrors({});
    setFormError(null);
  }

  function openEditDialog(customer: Customer): void {
    setDialogMode("edit");
    setEditingCustomer(customer);
    setForm(customerFormFromModel(customer));
    setFieldErrors({});
    setFormError(null);
  }

  function updateFormField(field: keyof CustomerFormValues, value: string): void {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function updateFilters(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const next = new URLSearchParams();
    next.set("page", "1");
    next.set("per_page", String(filters.perPage));
    if (queryFilter) next.set("q", queryFilter);
    if (geoAreaFilter) next.set("geo_area", geoAreaFilter);
    setSearchParams(next);
  }

  function changePage(nextPage: number): void {
    const next = new URLSearchParams(searchParams);
    next.set("page", String(nextPage));
    next.set("per_page", String(filters.perPage));
    setSearchParams(next);
  }

  const canCreate = auth.user ? canPerform(auth.user, "customers:create") : false;
  const canUpdate = auth.user ? canPerform(auth.user, "customers:update") : false;
  const rows: CustomerRow[] = (customersQuery.data?.data ?? []).map((customer) => ({ ...customer, actions: "" }));

  function submitCustomer(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    setFieldErrors({});
    setFormError(null);
    const parsed = customerFormSchema.safeParse(form);
    if (!parsed.success) {
      setFieldErrors(zodIssuesToFieldErrors<keyof CustomerFormValues>(parsed.error.issues));
      return;
    }
    saveMutation.mutate(parsed.data);
  }

  return (
    <section aria-labelledby="customers-title" className="page-stack">
      <div className="page-title-row">
        <div>
          <h1 id="customers-title">客户</h1>
          <p>客户档案、结算方式和默认配送偏好。</p>
        </div>
        {canCreate ? (
          <Button type="button" onClick={openCreateDialog}>
            <Plus aria-hidden="true" size={16} />
            新增客户
          </Button>
        ) : null}
      </div>

      <form className="filter-bar" aria-label="客户列表筛选" onSubmit={updateFilters}>
        <Input aria-label="客户筛选" placeholder="客户名称" value={queryFilter} onChange={(event) => setQueryFilter(event.target.value)} />
        <Input aria-label="区域筛选" placeholder="地理区域" value={geoAreaFilter} onChange={(event) => setGeoAreaFilter(event.target.value)} />
        <Button variant="secondary" type="submit">筛选</Button>
      </form>

      {customersQuery.error ? <ErrorState message={formatApiError(customersQuery.error).message} requestId={formatApiError(customersQuery.error).requestId} /> : null}

      <div className="page-panel">
        <DataTable
          loading={customersQuery.isLoading}
          columns={[
            { key: "name", header: "客户" },
            { key: "unitName", header: "单位" },
            { key: "researchGroup", header: "课题组" },
            { key: "geoArea", header: "区域" },
            { key: "settlementType", header: "结算", render: (row) => settlementTypeLabel(row.settlementType) },
            { key: "creditDays", header: "账期" },
            { key: "defaultDeliveryMethod", header: "默认配送" },
            { key: "defaultInvoiceType", header: "默认发票" },
            { key: "isActive", header: "状态", render: (row) => <StatusBadge tone={customerStatusTone(row.isActive)}>{row.isActive ? "启用" : "停用"}</StatusBadge> },
            {
              key: "actions",
              header: "操作",
              render: (row) => canUpdate ? <Button variant="secondary" type="button" onClick={() => openEditDialog(row)}>编辑</Button> : "只读"
            }
          ]}
          rows={rows}
          pagination={{
            page: customersQuery.data?.meta.page ?? 1,
            totalPages: customersQuery.data?.meta.totalPages ?? 1,
            onPageChange: changePage
          }}
        />
      </div>

      {toastMessage ? <Toast tone="success" message={toastMessage} /> : null}

      <Dialog title={dialogMode === "edit" ? "编辑客户" : "新增客户"} open={Boolean(dialogMode)} onClose={() => setDialogMode(null)}>
        <form className="form-grid" onSubmit={submitCustomer}>
          {formError ? <ErrorState message={formError.message} requestId={formError.requestId} /> : null}
          <FormField label="客户名称" htmlFor="customerName" error={fieldErrors.name} required>
            <Input id="customerName" value={form.name} onChange={(event) => updateFormField("name", event.target.value)} />
          </FormField>
          <FormField label="单位" htmlFor="unitName" error={fieldErrors.unitName}>
            <Input id="unitName" value={form.unitName ?? ""} onChange={(event) => updateFormField("unitName", event.target.value)} />
          </FormField>
          <FormField label="课题组" htmlFor="researchGroup" error={fieldErrors.researchGroup}>
            <Input id="researchGroup" value={form.researchGroup ?? ""} onChange={(event) => updateFormField("researchGroup", event.target.value)} />
          </FormField>
          <FormField label="区域" htmlFor="geoArea" error={fieldErrors.geoArea}>
            <Input id="geoArea" value={form.geoArea ?? ""} onChange={(event) => updateFormField("geoArea", event.target.value)} />
          </FormField>
          <FormField label="结算方式" htmlFor="settlementType" error={fieldErrors.settlementType} required>
            <Select id="settlementType" value={form.settlementType} onChange={(event) => updateFormField("settlementType", event.target.value)}>
              <option value="monthly">月结</option>
              <option value="single">单结</option>
            </Select>
          </FormField>
          <FormField label="账期天数" htmlFor="creditDays" error={fieldErrors.creditDays}>
            <Input id="creditDays" inputMode="numeric" value={form.creditDays ?? ""} onChange={(event) => updateFormField("creditDays", event.target.value)} />
          </FormField>
          <FormField label="默认配送方式" htmlFor="defaultDeliveryMethod" error={fieldErrors.defaultDeliveryMethod}>
            <Input id="defaultDeliveryMethod" value={form.defaultDeliveryMethod ?? ""} onChange={(event) => updateFormField("defaultDeliveryMethod", event.target.value)} />
          </FormField>
          <FormField label="默认发票类型" htmlFor="defaultInvoiceType" error={fieldErrors.defaultInvoiceType}>
            <Input id="defaultInvoiceType" value={form.defaultInvoiceType ?? ""} onChange={(event) => updateFormField("defaultInvoiceType", event.target.value)} />
          </FormField>
          <FormField label="备注" htmlFor="notes" error={fieldErrors.notes}>
            <Textarea id="notes" value={form.notes ?? ""} onChange={(event) => updateFormField("notes", event.target.value)} />
          </FormField>
          <div className="dialog-actions">
            <Button variant="secondary" type="button" onClick={() => setDialogMode(null)}>取消</Button>
            <Button type="submit" loading={saveMutation.isPending}>保存客户</Button>
          </div>
        </form>
      </Dialog>
    </section>
  );
}
