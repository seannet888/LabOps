import { buildQueryString, commandRequest, request, type ListEnvelope } from "../../../lib/api-client.js";

export type InventoryGender = "M" | "F";

export type SpeciesDto = {
  id: string;
  name: string;
  grade: string;
};

export type Species = {
  id: string;
  name: string;
  grade: string;
};

export type StrainDto = {
  id: string;
  species_id: string;
  name: string;
  is_active: boolean;
};

export type Strain = {
  id: string;
  speciesId: string;
  name: string;
  isActive: boolean;
};

export type InventoryBatchDto = {
  id: string;
  strain_id: string;
  strain_name: string;
  species_name: string;
  birth_date: string;
  age_weeks: number;
  gender: InventoryGender;
  initial_qty: number;
  reserved_qty: number;
  available_qty: number;
  is_aging: boolean;
  entry_date: string;
};

export type InventoryBatch = {
  id: string;
  strainId: string;
  strainName: string;
  speciesName: string;
  birthDate: string;
  ageWeeks: number;
  gender: InventoryGender;
  initialQty: number;
  reservedQty: number;
  availableQty: number;
  isAging: boolean;
  entryDate: string;
};

export type InventoryBatchFilters = {
  page: number;
  perPage: number;
  strainId?: string;
  gender?: InventoryGender;
};

export type CreateInventoryBatchInput = {
  strainId: string;
  birthDate: string;
  gender: InventoryGender;
  initialQty: number;
  entryDate: string;
  notes?: string;
};

export type CreateStrainInput = {
  speciesId: string;
  name: string;
};

export type AvailabilityQuery = {
  strainId: string;
  ageWeeks: number;
  gender: InventoryGender;
};

export type AvailabilitySummary = {
  strainId: string;
  ageWeeks: number;
  gender: InventoryGender;
  availableQty: number;
  reservedQty: number;
  agingQty: number;
};

type AvailabilityDto = {
  strain_id: string;
  age_weeks: number;
  gender: InventoryGender;
  available_qty: number;
  reserved_qty: number;
  aging_qty: number;
};

export function mapSpeciesDto(dto: SpeciesDto): Species {
  return {
    id: dto.id,
    name: dto.name,
    grade: dto.grade
  };
}

export function mapStrainDto(dto: StrainDto): Strain {
  return {
    id: dto.id,
    speciesId: dto.species_id,
    name: dto.name,
    isActive: dto.is_active
  };
}

export function mapInventoryBatchDto(dto: InventoryBatchDto): InventoryBatch {
  return {
    id: dto.id,
    strainId: dto.strain_id,
    strainName: dto.strain_name,
    speciesName: dto.species_name,
    birthDate: dto.birth_date,
    ageWeeks: dto.age_weeks,
    gender: dto.gender,
    initialQty: dto.initial_qty,
    reservedQty: dto.reserved_qty,
    availableQty: dto.available_qty,
    isAging: dto.is_aging,
    entryDate: dto.entry_date
  };
}

export function toCreateInventoryBatchDto(input: CreateInventoryBatchInput) {
  return {
    strain_id: input.strainId,
    birth_date: input.birthDate,
    gender: input.gender,
    initial_qty: input.initialQty,
    entry_date: input.entryDate,
    ...(input.notes ? { notes: input.notes } : {})
  };
}

export async function listSpecies(token: string | null): Promise<Species[]> {
  const response = await request<SpeciesDto[]>("/species", { token });
  return response.map(mapSpeciesDto);
}

export async function listStrains(token: string | null, filters: { isActive?: boolean } = { isActive: true }): Promise<Strain[]> {
  const response = await request<StrainDto[]>(`/strains${buildQueryString({
    is_active: filters.isActive
  })}`, { token });
  return response.map(mapStrainDto);
}

export async function listInventoryBatches(filters: InventoryBatchFilters, token: string | null): Promise<ListEnvelope<InventoryBatch>> {
  const response = await request<ListEnvelope<InventoryBatchDto>>(
    `/inventory-batches${buildQueryString({
      page: filters.page,
      per_page: filters.perPage,
      strain_id: filters.strainId,
      gender: filters.gender
    })}`,
    { token }
  );

  return {
    ...response,
    data: response.data.map(mapInventoryBatchDto)
  };
}

export async function createInventoryBatch(input: CreateInventoryBatchInput, token: string | null): Promise<{ id: string }> {
  return commandRequest<{ id: string }>("/inventory-batches", {
    token,
    body: toCreateInventoryBatchDto(input)
  });
}

export async function createStrain(input: CreateStrainInput, token: string | null): Promise<Strain> {
  const response = await commandRequest<StrainDto>("/strains", {
    token,
    body: {
      species_id: input.speciesId,
      name: input.name
    }
  });
  return mapStrainDto(response);
}

export async function updateStrainStatus(strainId: string, isActive: boolean, token: string | null): Promise<{ id: string; isActive: boolean }> {
  const response = await commandRequest<{ id: string; is_active: boolean }>(`/strains/${strainId}`, {
    method: "PATCH",
    token,
    body: { is_active: isActive }
  });
  return { id: response.id, isActive: response.is_active };
}

export function deactivateStrain(strainId: string, token: string | null): Promise<{ id: string; isActive: boolean }> {
  return updateStrainStatus(strainId, false, token);
}

export async function getInventoryAvailability(query: AvailabilityQuery, token: string | null): Promise<AvailabilitySummary> {
  const response = await request<AvailabilityDto>(
    `/inventory-availability${buildQueryString({
      strain_id: query.strainId,
      age_weeks: query.ageWeeks,
      gender: query.gender
    })}`,
    { token }
  );

  return {
    strainId: response.strain_id,
    ageWeeks: response.age_weeks,
    gender: response.gender,
    availableQty: response.available_qty,
    reservedQty: response.reserved_qty,
    agingQty: response.aging_qty
  };
}
