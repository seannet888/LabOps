import { useState, type FormEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Button } from "../../components/Button.js";
import { DateField } from "../../components/DateField.js";
import { ErrorState } from "../../components/ErrorState.js";
import { FormField } from "../../components/FormField.js";
import { Input } from "../../components/Input.js";
import { Select } from "../../components/Select.js";
import { Textarea } from "../../components/Textarea.js";
import { useAuth } from "../../app/auth.js";
import { formatApiError, zodIssuesToFieldErrors, type FormattedApiError } from "../../lib/form-errors.js";
import { createOrder } from "./api/orders.api.js";
import { createOrderFormSchema } from "./order-schema.js";

const defaultForm = {
  customerId: "",
  deliveryMethod: "",
  plannedDeliveryDate: "",
  requiresInvoice: false,
  invoiceType: "",
  notes: "",
  strainId: "",
  ageWeeks: "",
  gender: "M",
  quantity: "",
  actualPrice: ""
};

type FormValues = typeof defaultForm;
type FieldErrors = Partial<Record<keyof FormValues, string>>;

export function OrderCreatePage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState<FormValues>(defaultForm);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<FormattedApiError | null>(null);

  const mutation = useMutation({
    mutationFn: (values: Parameters<typeof createOrder>[0]) => createOrder(values, auth.token),
    onSuccess: () => navigate("/orders", { replace: true, state: { toast: "订单已创建" } }),
    onError: (error) => setFormError(formatApiError(error))
  });

  function updateField(field: keyof FormValues, value: string | boolean): void {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function onSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    setFieldErrors({});
    setFormError(null);
    const parsed = createOrderFormSchema.safeParse(form);
    if (!parsed.success) {
      setFieldErrors(zodIssuesToFieldErrors<keyof FormValues>(parsed.error.issues));
      return;
    }
    mutation.mutate({
      customerId: parsed.data.customerId,
      deliveryMethod: parsed.data.deliveryMethod || undefined,
      plannedDeliveryDate: parsed.data.plannedDeliveryDate || undefined,
      requiresInvoice: parsed.data.requiresInvoice,
      invoiceType: parsed.data.invoiceType || undefined,
      notes: parsed.data.notes || undefined,
      items: [{
        strainId: parsed.data.strainId,
        ageWeeks: Number(parsed.data.ageWeeks),
        gender: parsed.data.gender,
        quantity: Number(parsed.data.quantity),
        actualPrice: parsed.data.actualPrice || undefined
      }]
    });
  }

  return (
    <section aria-labelledby="order-create-title" className="page-stack">
      <div className="page-title-row">
        <div>
          <h1 id="order-create-title">创建订单</h1>
          <p>第一版使用客户 ID 和品系 ID 录入，后续接客户/目录选择器。</p>
        </div>
      </div>

      <div className="page-panel">
        <form className="form-grid" onSubmit={onSubmit}>
          {formError ? <ErrorState message={formError.message} requestId={formError.requestId} /> : null}
          <FormField label="客户 ID" htmlFor="customerId" error={fieldErrors.customerId}>
            <Input id="customerId" value={form.customerId} onChange={(event) => updateField("customerId", event.target.value)} />
          </FormField>
          <FormField label="配送方式" htmlFor="deliveryMethod" error={fieldErrors.deliveryMethod}>
            <Input id="deliveryMethod" value={form.deliveryMethod} onChange={(event) => updateField("deliveryMethod", event.target.value)} />
          </FormField>
          <FormField label="计划送达日期" htmlFor="plannedDeliveryDate" error={fieldErrors.plannedDeliveryDate}>
            <DateField id="plannedDeliveryDate" value={form.plannedDeliveryDate} onChange={(event) => updateField("plannedDeliveryDate", event.target.value)} />
          </FormField>
          <label className="checkbox-row">
            <input type="checkbox" checked={form.requiresInvoice} onChange={(event) => updateField("requiresInvoice", event.target.checked)} />
            需要发票
          </label>
          <FormField label="发票类型" htmlFor="invoiceType" error={fieldErrors.invoiceType}>
            <Input id="invoiceType" value={form.invoiceType} onChange={(event) => updateField("invoiceType", event.target.value)} />
          </FormField>
          <FormField label="备注" htmlFor="notes" error={fieldErrors.notes}>
            <Textarea id="notes" value={form.notes} onChange={(event) => updateField("notes", event.target.value)} />
          </FormField>
          <FormField label="品系 ID" htmlFor="strainId" error={fieldErrors.strainId}>
            <Input id="strainId" value={form.strainId} onChange={(event) => updateField("strainId", event.target.value)} />
          </FormField>
          <FormField label="周龄" htmlFor="ageWeeks" error={fieldErrors.ageWeeks}>
            <Input id="ageWeeks" inputMode="numeric" value={form.ageWeeks} onChange={(event) => updateField("ageWeeks", event.target.value)} />
          </FormField>
          <FormField label="性别" htmlFor="gender" error={fieldErrors.gender}>
            <Select id="gender" value={form.gender} onChange={(event) => updateField("gender", event.target.value)}>
              <option value="M">M</option>
              <option value="F">F</option>
            </Select>
          </FormField>
          <FormField label="数量" htmlFor="quantity" error={fieldErrors.quantity}>
            <Input id="quantity" inputMode="numeric" value={form.quantity} onChange={(event) => updateField("quantity", event.target.value)} />
          </FormField>
          <FormField label="实际单价" htmlFor="actualPrice" error={fieldErrors.actualPrice}>
            <Input id="actualPrice" inputMode="decimal" value={form.actualPrice} onChange={(event) => updateField("actualPrice", event.target.value)} />
          </FormField>
          <div className="dialog-actions">
            <Button variant="secondary" type="button" onClick={() => navigate("/orders")}>取消</Button>
            <Button type="submit" loading={mutation.isPending}>保存订单</Button>
          </div>
        </form>
      </div>
    </section>
  );
}
