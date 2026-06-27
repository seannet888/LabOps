import { useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "../../components/Button.js";
import { ErrorState } from "../../components/ErrorState.js";
import { FormField } from "../../components/FormField.js";
import { Input } from "../../components/Input.js";
import { QuantityText } from "../../components/QuantityText.js";
import { Select } from "../../components/Select.js";
import { useAuth } from "../../app/auth.js";
import { getInventoryAvailability } from "./api/inventory.api.js";
import { formatApiError } from "../../lib/form-errors.js";

export function InventoryAvailabilityPage() {
  const auth = useAuth();
  const [strainId, setStrainId] = useState("");
  const [ageWeeks, setAgeWeeks] = useState("");
  const [gender, setGender] = useState<"M" | "F">("M");
  const [query, setQuery] = useState<{ strainId: string; ageWeeks: number; gender: "M" | "F" } | null>(null);
  const availability = useQuery({
    queryKey: ["inventory-availability", query],
    queryFn: () => getInventoryAvailability(query!, auth.token),
    enabled: Boolean(query)
  });

  function onSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (strainId && ageWeeks) {
      setQuery({ strainId, ageWeeks: Number(ageWeeks), gender });
    }
  }

  return (
    <section aria-labelledby="inventory-availability-title" className="page-stack">
      <div className="page-title-row">
        <div>
          <h1 id="inventory-availability-title">可售查询</h1>
          <p>展示后端计算后的可售、预占和老化数量。</p>
        </div>
      </div>
      <div className="page-panel">
        <form className="filter-bar" onSubmit={onSubmit}>
          <FormField label="品系 ID" htmlFor="availabilityStrain">
            <Input id="availabilityStrain" value={strainId} onChange={(event) => setStrainId(event.target.value)} />
          </FormField>
          <FormField label="周龄" htmlFor="availabilityAge">
            <Input id="availabilityAge" inputMode="numeric" value={ageWeeks} onChange={(event) => setAgeWeeks(event.target.value)} />
          </FormField>
          <FormField label="性别" htmlFor="availabilityGender">
            <Select id="availabilityGender" value={gender} onChange={(event) => setGender(event.target.value as "M" | "F")}>
              <option value="M">M</option>
              <option value="F">F</option>
            </Select>
          </FormField>
          <Button type="submit">查询</Button>
        </form>
        {availability.error ? (
          <ErrorState message={formatApiError(availability.error).message} requestId={formatApiError(availability.error).requestId} />
        ) : null}
        {availability.data ? (
          <dl className="metric-grid">
            <div><dt>可售</dt><dd><QuantityText value={availability.data.availableQty} /></dd></div>
            <div><dt>预占</dt><dd><QuantityText value={availability.data.reservedQty} /></dd></div>
            <div><dt>老化</dt><dd><QuantityText value={availability.data.agingQty} /></dd></div>
          </dl>
        ) : null}
      </div>
    </section>
  );
}
