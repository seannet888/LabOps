import type { TransactionRunner } from "../shared/transaction-runner.js";
import type { AuditLogRepository, CatalogRepository, Species, Strain } from "../shared/types.js";

export interface CreateStrainInput {
  speciesId: string;
  name: string;
}

export interface CreateStrainResult {
  data: {
    id: string;
    speciesId: string;
    name: string;
  };
}

export interface CreatePriceRuleInput {
  actorId: string;
  strainId: string;
  ageWeeks: number;
  unitPrice: string;
  effectiveFrom: string;
  changeReason: string;
}

export interface DeactivateStrainInput {
  strainId: string;
}

export interface UpdateStrainStatusInput {
  strainId: string;
  isActive: boolean;
}

export interface UpdateStrainStatusResult {
  data: {
    id: string;
    isActive: boolean;
  };
}

export interface CreatePriceRuleResult {
  data: {
    id: string;
  };
}

export interface CatalogApplicationTransactionContext {
  catalog: CatalogRepository;
  auditLogs: AuditLogRepository;
}

export interface CatalogApplicationServiceDependencies extends CatalogApplicationTransactionContext {
  transactions?: TransactionRunner<CatalogApplicationTransactionContext>;
}

export class CatalogApplicationService {
  constructor(private readonly deps: CatalogApplicationServiceDependencies) {}

  private async inTransaction<T>(callback: (deps: CatalogApplicationTransactionContext) => Promise<T>): Promise<T> {
    return this.deps.transactions ? this.deps.transactions.run(callback) : callback(this.deps);
  }

  async createStrain(input: CreateStrainInput): Promise<CreateStrainResult> {
    const strain = await this.deps.catalog.createStrain(input);
    return { data: strain };
  }

  async updateStrainStatus(input: UpdateStrainStatusInput): Promise<UpdateStrainStatusResult> {
    const strain = await this.deps.catalog.updateStrain(input.strainId, { isActive: input.isActive });
    return { data: strain };
  }

  async deactivateStrain(input: DeactivateStrainInput): Promise<UpdateStrainStatusResult> {
    return this.updateStrainStatus({ strainId: input.strainId, isActive: false });
  }

  async createPriceRule(input: CreatePriceRuleInput): Promise<CreatePriceRuleResult> {
    return this.inTransaction(async (deps) => {
      const rule = await deps.catalog.createPriceRule({
        strainId: input.strainId,
        ageWeeks: input.ageWeeks,
        unitPrice: input.unitPrice,
        effectiveFrom: input.effectiveFrom
      });

      await deps.auditLogs.record({
        actorId: input.actorId,
        action: "create_price_rule",
        entityType: "price_rule",
        entityId: rule.id
      });

      return { data: { id: rule.id } };
    });
  }

  async listSpecies(): Promise<{ data: Species[] }> {
    return { data: await this.deps.catalog.listSpecies() };
  }

  async listStrains(filters: { speciesId?: string; isActive?: boolean }): Promise<{ data: Strain[] }> {
    return { data: await this.deps.catalog.listStrains(filters) };
  }

  async getCurrentPriceForStrain(
    strainId: string,
    ageWeeks: number
  ): Promise<{ unitPrice: string; effectiveFrom: string } | null> {
    return this.deps.catalog.getCurrentPriceDetails(strainId, ageWeeks);
  }
}
