export interface TransactionRunner<TContext> {
  run<T>(callback: (context: TContext) => Promise<T>): Promise<T>;
}

export class InMemoryTransactionRunner<TContext> implements TransactionRunner<TContext> {
  constructor(private readonly context: TContext) {}

  async run<T>(callback: (context: TContext) => Promise<T>): Promise<T> {
    return callback(this.context);
  }
}

export interface PrismaTransactionClient<TClient> {
  $transaction<T>(callback: (client: TClient) => Promise<T>): Promise<T>;
}

export class PrismaTransactionRunner<TClient, TContext> implements TransactionRunner<TContext> {
  constructor(
    private readonly prisma: PrismaTransactionClient<TClient>,
    private readonly buildContext: (client: TClient) => TContext
  ) {}

  async run<T>(callback: (context: TContext) => Promise<T>): Promise<T> {
    return this.prisma.$transaction((client) => callback(this.buildContext(client)));
  }
}