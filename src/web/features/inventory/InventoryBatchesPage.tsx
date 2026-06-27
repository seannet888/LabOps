import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { Button } from "../../components/Button.js";
import { DataTable } from "../../components/DataTable.js";
import { DateField } from "../../components/DateField.js";
import { Dialog } from "../../components/Dialog.js";
import { ErrorState } from "../../components/ErrorState.js";
import { FormField } from "../../components/FormField.js";
import { Input } from "../../components/Input.js";
import { QuantityText } from "../../components/QuantityText.js";
import { Select } from "../../components/Select.js";
import { StatusBadge } from "../../components/StatusBadge.js";
import { Textarea } from "../../components/Textarea.js";
import { Toast } from "../../components/Toast.js";
import { useAuth } from "../../app/auth.js";
import { createInventoryBatchSchema, createStrainSchema } from "./inventory-schema.js";
import {
  createInventoryBatch,
  createStrain,
  updateStrainStatus,
  listInventoryBatches,
  listSpecies,
  listStrains,
  type InventoryGender,
  type Strain
} from "./api/inventory.api.js";
import { canPerform } from "../../app/permissions.js";
import { formatApiError, zodIssuesToFieldErrors, type FormattedApiError } from "../../lib/form-errors.js";

const defaultForm = {
  strainId: "",
  speciesName: "",
  birthDate: "",
  gender: "M",
  initialQty: "",
  entryDate: "",
  notes: ""
};

const defaultStrainForm = {
  speciesId: "",
  name: ""
};

type FormValues = typeof defaultForm;
type FieldErrors = Partial<Record<keyof FormValues, string>>;
type StrainFormValues = typeof defaultStrainForm;
type StrainFieldErrors = Partial<Record<keyof StrainFormValues, string>>;

function parseGender(value: string | null): InventoryGender | undefined {
  return value === "M" || value === "F" ? value : undefined;
}

export function InventoryBatchesPage() {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<FormValues>(defaultForm);
  const [strainFilter, setStrainFilter] = useState(searchParams.get("strain_id") ?? "");
  const [genderFilter, setGenderFilter] = useState(searchParams.get("gender") ?? "");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<FormattedApiError | null>(null);
  const [strainMode, setStrainMode] = useState(false);
  const [strainForm, setStrainForm] = useState<StrainFormValues>(defaultStrainForm);
  const [strainFieldErrors, setStrainFieldErrors] = useState<StrainFieldErrors>({});
  const [strainFormError, setStrainFormError] = useState<FormattedApiError | null>(null);
  const [strainSuccessMessage, setStrainSuccessMessage] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const page = Number(searchParams.get("page") ?? "1");
  const perPage = Number(searchParams.get("per_page") ?? "20");
  const filterGender = parseGender(searchParams.get("gender"));
  const filters = {
    page: Number.isFinite(page) && page > 0 ? page : 1,
    perPage: Number.isFinite(perPage) && perPage > 0 ? perPage : 20,
    strainId: searchParams.get("strain_id") ?? undefined,
    gender: filterGender
  };
  const batchesQuery = useQuery({
    queryKey: ["inventory-batches", filters],
    queryFn: () => listInventoryBatches(filters, auth.token)
  });
  const speciesQuery = useQuery({
    queryKey: ["species"],
    queryFn: () => listSpecies(auth.token),
    enabled: dialogOpen
  });
  const strainsQuery = useQuery({
    queryKey: ["strains", "active"],
    queryFn: () => listStrains(auth.token),
    enabled: dialogOpen
  });
  const allStrainsQuery = useQuery({
    queryKey: ["strains", "all"],
    queryFn: () => listStrains(auth.token, {}),
    enabled: dialogOpen && strainMode
  });

  const submitMutation = useMutation({
    mutationFn: (values: Parameters<typeof createInventoryBatch>[0]) => createInventoryBatch(values, auth.token),
    onSuccess: async () => {
      setDialogOpen(false);
      setForm(defaultForm);
      setFieldErrors({});
      setFormError(null);
      setToastMessage("入库已创建");
      await queryClient.invalidateQueries({ queryKey: ["inventory-batches"] });
      await queryClient.invalidateQueries({ queryKey: ["inventory-availability"] });
    },
    onError: (error) => {
      setFormError(formatApiError(error));
    }
  });
  const createStrainMutation = useMutation({
    mutationFn: (values: Parameters<typeof createStrain>[0]) => createStrain(values, auth.token),
    onSuccess: (strain) => {
      const species = speciesQuery.data?.find((entry) => entry.id === strain.speciesId);
      queryClient.setQueryData<Strain[]>(["strains", "active"], (current = []) => {
        if (current.some((entry) => entry.id === strain.id)) {
          return current;
        }
        return [...current, strain];
      });
      queryClient.setQueryData<Strain[]>(["strains", "all"], (current = []) => {
        if (current.some((entry) => entry.id === strain.id)) {
          return current;
        }
        return [...current, strain];
      });
      setForm((current) => ({
        ...current,
        strainId: strain.id,
        speciesName: species?.name ?? ""
      }));
      setStrainForm(defaultStrainForm);
      setStrainFieldErrors({});
      setStrainFormError(null);
      setStrainMode(false);
      setStrainSuccessMessage("品系已创建");
    },
    onError: (error) => {
      setStrainFormError(formatApiError(error));
    }
  });
  const updateStrainStatusMutation = useMutation({
    mutationFn: (input: { strainId: string; isActive: boolean }) => updateStrainStatus(input.strainId, input.isActive, auth.token),
    onSuccess: (result) => {
      const existing = allStrainsQuery.data?.find((strain) => strain.id === result.id)
        ?? strainsQuery.data?.find((strain) => strain.id === result.id);
      queryClient.setQueryData<Strain[]>(["strains", "all"], (current = []) => current.map((strain) => (
        strain.id === result.id ? { ...strain, isActive: result.isActive } : strain
      )));
      queryClient.setQueryData<Strain[]>(["strains", "active"], (current = []) => {
        if (!result.isActive) {
          return current.filter((strain) => strain.id !== result.id);
        }
        if (!existing || current.some((strain) => strain.id === result.id)) {
          return current;
        }
        return [...current, { ...existing, isActive: true }];
      });
      setForm((current) => (
        current.strainId === result.id && !result.isActive
          ? { ...current, strainId: "", speciesName: "" }
          : current
      ));
      setStrainFormError(null);
      setStrainSuccessMessage(result.isActive ? "品系已启用" : "品系已停用");
    },
    onError: (error) => {
      setStrainFormError(formatApiError(error));
    }
  });

  function updateField(field: keyof FormValues, value: string): void {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function openCreateDialog(): void {
    setDialogOpen(true);
    setStrainMode(false);
    setStrainSuccessMessage(null);
  }

  function updateStrainField(field: keyof StrainFormValues, value: string): void {
    setStrainForm((current) => ({ ...current, [field]: value }));
  }

  function updateStrain(strainId: string): void {
    const strain = strainsQuery.data?.find((entry) => entry.id === strainId);
    const species = strain ? speciesQuery.data?.find((entry) => entry.id === strain.speciesId) : undefined;
    setForm((current) => ({
      ...current,
      strainId,
      speciesName: species?.name ?? ""
    }));
  }

  function strainOptionLabel(strain: NonNullable<typeof strainsQuery.data>[number]): string {
    const species = speciesQuery.data?.find((entry) => entry.id === strain.speciesId);
    return species ? `${species.name} / ${strain.name}` : strain.name;
  }

  function updateFilters(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const next = new URLSearchParams();
    next.set("page", "1");
    next.set("per_page", String(filters.perPage));
    if (strainFilter) {
      next.set("strain_id", strainFilter);
    }
    if (genderFilter === "M" || genderFilter === "F") {
      next.set("gender", genderFilter);
    }
    setSearchParams(next);
  }

  function changePage(nextPage: number): void {
    const next = new URLSearchParams(searchParams);
    next.set("page", String(nextPage));
    next.set("per_page", String(filters.perPage));
    setSearchParams(next);
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setFieldErrors({});
    setFormError(null);
    const parsed = createInventoryBatchSchema.safeParse(form);
    if (!parsed.success) {
      setFieldErrors(zodIssuesToFieldErrors<keyof FormValues>(parsed.error.issues));
      return;
    }
    const { strainId, birthDate, gender, initialQty, entryDate, notes } = parsed.data;
    submitMutation.mutate({ strainId, birthDate, gender, initialQty, entryDate, notes });
  }

  async function onSubmitStrain(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setStrainFieldErrors({});
    setStrainFormError(null);
    const parsed = createStrainSchema.safeParse(strainForm);
    if (!parsed.success) {
      setStrainFieldErrors(zodIssuesToFieldErrors<keyof StrainFormValues>(parsed.error.issues));
      return;
    }
    createStrainMutation.mutate(parsed.data);
  }

  const rows = batchesQuery.data?.data ?? [];

  return (
    <section aria-labelledby="inventory-batches-title" className="page-stack">
      <div className="page-title-row">
        <div>
          <h1 id="inventory-batches-title">库存批次</h1>
          <p>按后端库存事实展示批次和可售量。</p>
        </div>
        {auth.user && canPerform(auth.user, "inventory_batches:create") ? (
          <Button onClick={openCreateDialog}>
            <Plus aria-hidden="true" size={16} />
            新增入库
          </Button>
        ) : null}
      </div>

      <form className="filter-bar" aria-label="库存筛选" onSubmit={updateFilters}>
        <Input aria-label="品系筛选" placeholder="品系 ID" value={strainFilter} onChange={(event) => setStrainFilter(event.target.value)} />
        <Select aria-label="性别筛选" value={genderFilter} onChange={(event) => setGenderFilter(event.target.value)}>
          <option value="">全部性别</option>
          <option value="M">M</option>
          <option value="F">F</option>
        </Select>
        <Button variant="secondary" type="submit">筛选</Button>
      </form>

      {toastMessage ? <Toast tone="success" message={toastMessage} /> : null}
      {batchesQuery.error ? (
        <ErrorState message={formatApiError(batchesQuery.error).message} requestId={formatApiError(batchesQuery.error).requestId} />
      ) : null}

      <div className="page-panel">
        <DataTable
          loading={batchesQuery.isLoading}
          columns={[
            { key: "strainName", header: "品系" },
            { key: "speciesName", header: "物种" },
            { key: "gender", header: "性别" },
            { key: "ageWeeks", header: "周龄" },
            { key: "birthDate", header: "出生日期" },
            { key: "entryDate", header: "入库日期" },
            { key: "initialQty", header: "原始数量", render: (row) => <QuantityText value={row.initialQty} /> },
            { key: "reservedQty", header: "预占", render: (row) => <QuantityText value={row.reservedQty} /> },
            { key: "availableQty", header: "可售", render: (row) => <QuantityText value={row.availableQty} /> },
            { key: "isAging", header: "状态", render: (row) => <StatusBadge tone={row.isAging ? "warning" : "success"}>{row.isAging ? "老化" : "可售"}</StatusBadge> }
          ]}
          rows={rows}
          pagination={{
            page: batchesQuery.data?.meta.page ?? 1,
            totalPages: batchesQuery.data?.meta.totalPages ?? 1,
            onPageChange: changePage
          }}
        />
      </div>

      <Dialog title={strainMode ? "管理品系" : "新增入库"} open={dialogOpen} onClose={() => setDialogOpen(false)}>
        {strainMode ? (
          <form className="form-grid" onSubmit={onSubmitStrain}>
            {strainFormError ? <ErrorState message={strainFormError.message} requestId={strainFormError.requestId} /> : null}
            {strainSuccessMessage ? <Toast tone="success" message={strainSuccessMessage} /> : null}
            <FormField label="品类" htmlFor="strainSpeciesId" required error={strainFieldErrors.speciesId}>
              <Select id="strainSpeciesId" value={strainForm.speciesId} onChange={(event) => updateStrainField("speciesId", event.target.value)}>
                <option value="">选择品类</option>
                {(speciesQuery.data ?? []).map((species) => (
                  <option key={species.id} value={species.id}>{species.name}</option>
                ))}
              </Select>
            </FormField>
            <FormField label="品系名称" htmlFor="strainName" required error={strainFieldErrors.name}>
              <Input id="strainName" value={strainForm.name} onChange={(event) => updateStrainField("name", event.target.value)} />
            </FormField>
            <DataTable
              columns={[
                { key: "name", header: "现有品系" },
                { key: "speciesId", header: "品类", render: (strain) => speciesQuery.data?.find((species) => species.id === strain.speciesId)?.name ?? "-" },
                {
                  key: "id",
                  header: "操作",
                  render: (strain) => (
                    <Button
                      variant="secondary"
                      type="button"
                      loading={updateStrainStatusMutation.isPending}
                      onClick={() => updateStrainStatusMutation.mutate({ strainId: strain.id, isActive: !strain.isActive })}
                    >
                      {strain.isActive ? "停用" : "启用"} {strain.name}
                    </Button>
                  )
                }
              ]}
              rows={allStrainsQuery.data ?? []}
            />
            <div className="dialog-actions">
              <Button variant="secondary" type="button" onClick={() => setStrainMode(false)}>返回入库</Button>
              <Button type="submit" loading={createStrainMutation.isPending}>保存品系</Button>
            </div>
          </form>
        ) : (
        <form className="form-grid" onSubmit={onSubmit}>
          {formError ? <ErrorState message={formError.message} requestId={formError.requestId} /> : null}
          {strainSuccessMessage ? <Toast tone="success" message={strainSuccessMessage} /> : null}
          <FormField label="物种" htmlFor="speciesName" error={fieldErrors.speciesName}>
            <Input id="speciesName" value={form.speciesName} readOnly placeholder="选择品系后自动带出" />
          </FormField>
          <FormField label="品系" htmlFor="strainId" error={fieldErrors.strainId}>
            <Select id="strainId" value={form.strainId} onChange={(event) => updateStrain(event.target.value)}>
              <option value="">选择品系</option>
              {(strainsQuery.data ?? []).map((strain) => (
                <option key={strain.id} value={strain.id}>{strainOptionLabel(strain)}</option>
              ))}
            </Select>
          </FormField>
          {auth.user && canPerform(auth.user, "strains:create") ? (
            <div className="dialog-actions">
              <Button variant="secondary" type="button" onClick={() => setStrainMode(true)}>管理品系</Button>
            </div>
          ) : null}
          <FormField label="出生日期" htmlFor="birthDate" error={fieldErrors.birthDate}>
            <DateField id="birthDate" value={form.birthDate} onChange={(event) => updateField("birthDate", event.target.value)} />
          </FormField>
          <FormField label="性别" htmlFor="gender" error={fieldErrors.gender}>
            <Select id="gender" value={form.gender} onChange={(event) => updateField("gender", event.target.value)}>
              <option value="M">M</option>
              <option value="F">F</option>
            </Select>
          </FormField>
          <FormField label="入库数量" htmlFor="initialQty" error={fieldErrors.initialQty}>
            <Input id="initialQty" inputMode="numeric" value={form.initialQty} onChange={(event) => updateField("initialQty", event.target.value)} />
          </FormField>
          <FormField label="入库日期" htmlFor="entryDate" error={fieldErrors.entryDate}>
            <DateField id="entryDate" value={form.entryDate} onChange={(event) => updateField("entryDate", event.target.value)} />
          </FormField>
          <FormField label="备注" htmlFor="notes" error={fieldErrors.notes}>
            <Textarea id="notes" value={form.notes} onChange={(event) => updateField("notes", event.target.value)} />
          </FormField>
          <div className="dialog-actions">
            <Button variant="secondary" type="button" onClick={() => setDialogOpen(false)}>取消</Button>
            <Button type="submit" loading={submitMutation.isPending}>保存入库</Button>
          </div>
        </form>
        )}
      </Dialog>
    </section>
  );
}
