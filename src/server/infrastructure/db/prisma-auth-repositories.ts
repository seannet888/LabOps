import type {
  Session,
  SessionRepository,
  User,
  UserRepository,
  UserRole
} from "../../application/shared/types.js";

interface PrismaUserRecord {
  id: number;
  username: string;
  passwordHash: string;
  displayName: string;
  role: UserRole;
  isActive: boolean;
}

interface PrismaSessionRecord {
  id: number;
  userId: number;
  tokenHash: string;
  expiresAt: Date;
}

interface PrismaAuthClient {
  user: {
    findUnique(args: { where: { username: string } }): Promise<PrismaUserRecord | null>;
    findUnique(args: { where: { id: number } }): Promise<PrismaUserRecord | null>;
  };
  session?: {
    create(args: {
      data: { userId: number; tokenHash: string; expiresAt: Date };
    }): Promise<PrismaSessionRecord>;
    findUnique(args: { where: { tokenHash: string } }): Promise<PrismaSessionRecord | null>;
  };
}

function toUser(record: PrismaUserRecord): User {
  return {
    id: String(record.id),
    username: record.username,
    passwordHash: record.passwordHash,
    displayName: record.displayName,
    role: record.role,
    isActive: record.isActive
  };
}

function toSession(record: PrismaSessionRecord): Session {
  return {
    id: String(record.id),
    userId: String(record.userId),
    tokenHash: record.tokenHash,
    expiresAt: record.expiresAt
  };
}

export class PrismaUserRepository implements UserRepository {
  constructor(private readonly prisma: PrismaAuthClient) {}

  async findByUsername(username: string): Promise<User | null> {
    const user = await this.prisma.user.findUnique({ where: { username } });
    return user ? toUser(user) : null;
  }

  async findById(userId: string): Promise<User | null> {
    const user = await this.prisma.user.findUnique({ where: { id: Number(userId) } });
    return user ? toUser(user) : null;
  }
}

export class PrismaSessionRepository implements SessionRepository {
  constructor(private readonly prisma: Required<Pick<PrismaAuthClient, "session">>) {}

  async create(session: { userId: string; tokenHash: string; expiresAt: Date }): Promise<Session> {
    const record = await this.prisma.session.create({
      data: {
        userId: Number(session.userId),
        tokenHash: session.tokenHash,
        expiresAt: session.expiresAt
      }
    });
    return toSession(record);
  }

  async findByTokenHash(tokenHash: string): Promise<Session | null> {
    const session = await this.prisma.session.findUnique({ where: { tokenHash } });
    return session ? toSession(session) : null;
  }
}
