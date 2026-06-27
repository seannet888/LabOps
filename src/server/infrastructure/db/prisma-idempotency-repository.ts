import { ConflictError } from "../../application/errors.js";
import type { IdempotencyRepository } from "../../application/shared/types.js";

interface PrismaIdempotencyRecord {
  requestHash: string;
  responseSnapshot: unknown;
}

interface PrismaIdempotencyClient {
  idempotencyKey: {
    findUnique(args: {
      where: {
        actorId_endpoint_idempotencyKey: {
          actorId: number;
          endpoint: string;
          idempotencyKey: string;
        };
      };
    }): Promise<PrismaIdempotencyRecord | null>;
    create(args: {
      data: {
        actorId: number;
        endpoint: string;
        idempotencyKey: string;
        requestHash: string;
        responseSnapshot: unknown;
        expiresAt: Date;
      };
    }): Promise<unknown>;
  };
}

const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;

function isUniqueConstraintError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
}

export class PrismaIdempotencyRepository implements IdempotencyRepository {
  constructor(private readonly prisma: PrismaIdempotencyClient) {}

  async findResult<T>(
    actorId: string,
    endpoint: string,
    idempotencyKey: string,
    requestHash?: string
  ): Promise<T | null> {
    const record = await this.prisma.idempotencyKey.findUnique({
      where: {
        actorId_endpoint_idempotencyKey: {
          actorId: Number(actorId),
          endpoint,
          idempotencyKey
        }
      }
    });
    if (!record) {
      return null;
    }
    if (requestHash && record.requestHash !== requestHash) {
      throw new ConflictError();
    }
    return record.responseSnapshot as T;
  }

  async saveResult<T>(
    actorId: string,
    endpoint: string,
    idempotencyKey: string,
    result: T,
    requestHash = ""
  ): Promise<void> {
    try {
      await this.prisma.idempotencyKey.create({
        data: {
          actorId: Number(actorId),
          endpoint,
          idempotencyKey,
          requestHash,
          responseSnapshot: result,
          expiresAt: new Date(Date.now() + IDEMPOTENCY_TTL_MS)
        }
      });
    } catch (error) {
      if (!isUniqueConstraintError(error)) {
        throw error;
      }
      await this.findResult(actorId, endpoint, idempotencyKey, requestHash);
    }
  }
}
