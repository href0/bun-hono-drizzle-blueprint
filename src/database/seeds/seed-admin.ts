import { and, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { hashPassword } from '../../core/security/password';
import { SUPER_ADMIN_ROLE } from '../../core/security/rbac';
import type { Role } from '../../core/security/roles';
import { BaseRepository } from '../base.repository';
import { roles, userRoles, users, type User } from '../schema';
import { defaultTxHost, type TransactionHost } from '../transaction-host';

const ADMIN: Role = 'admin';
const MIN_PASSWORD_LENGTH = 8;

/** A refusal the CLI prints as is (no stack trace); nothing was written. */
export class SeedAdminError extends Error {}

export interface SeedAdminInput {
  email: string;
  fullName: string;
  /** Required to create the user; never needed to promote an existing one. */
  password?: string;
  /** Allow turning an existing user into an active admin (their password is kept). */
  promote: boolean;
}

export interface SeedAdminResult {
  action: 'created' | 'promoted' | 'unchanged';
  user: User;
}

/** Writes go through BaseRepository like everywhere else: actor `system`, audited promotion. */
class SeedUsersRepository extends BaseRepository<typeof users> {
  constructor(txHost: TransactionHost) {
    super(users, txHost, { redact: ['passwordHash'] });
  }

  async findByEmail(email: string): Promise<User | null> {
    const rows = await this.txHost.tx
      .select()
      .from(users)
      .where(this.scoped(eq(users.email, email)))
      .limit(1);
    return rows.at(0) ?? null;
  }
}

/**
 * The `super_admin` role of a user (D52): routes check permissions, and a super admin holds every one.
 * Written through BaseRepository (actor `system`).
 */
class SeedUserRolesRepository extends BaseRepository<typeof userRoles> {
  constructor(txHost: TransactionHost) {
    super(userRoles, txHost);
  }

  /** The live `super_admin` role; created by migration 0010 and by every permission sync. */
  async findSuperAdminRoleId(): Promise<string> {
    const rows = await this.txHost.tx
      .select({ id: roles.id })
      .from(roles)
      .where(and(eq(roles.key, SUPER_ADMIN_ROLE), isNull(roles.deletedAt)))
      .limit(1);
    const id = rows.at(0)?.id;
    if (id === undefined) {
      throw new SeedAdminError(
        'The super_admin role is missing: run "bun run db:migrate" (it syncs the system roles) first.',
      );
    }
    return id;
  }

  async holds(userId: string, roleId: string): Promise<boolean> {
    const rows = await this.txHost.tx
      .select({ id: userRoles.id })
      .from(userRoles)
      .where(this.scoped(eq(userRoles.userId, userId), eq(userRoles.roleId, roleId)))
      .limit(1);
    return rows.length > 0;
  }

  /** Gives `userId` the super admin role unless they hold it; true when it was given. */
  async ensureSuperAdmin(userId: string): Promise<boolean> {
    const roleId = await this.findSuperAdminRoleId();
    if (await this.holds(userId, roleId)) return false;
    await this.create({ userId, roleId });
    return true;
  }
}

/**
 * Creates the first administrator (`bun run seed:admin --email <email>`), or with `promote`
 * makes an existing live user an active admin. Idempotent: an existing active admin is left as is.
 */
export const seedAdmin = async (
  input: SeedAdminInput,
  txHost: TransactionHost = defaultTxHost,
  hash: (password: string) => Promise<string> = hashPassword,
  /** Called after a promotion, so cached reads (`GET /users/:id`) do not show the old role. */
  onUserChanged: (userId: string) => Promise<void> = () => Promise.resolve(),
): Promise<SeedAdminResult> => {
  if (!z.string().email().safeParse(input.email).success) {
    throw new SeedAdminError(`Not a valid email address: ${input.email}`);
  }
  const repository = new SeedUsersRepository(txHost);
  const userRoleRepository = new SeedUserRolesRepository(txHost);

  const result = await txHost.run(async (): Promise<SeedAdminResult> => {
    const existing = await repository.findByEmail(input.email);
    if (existing) {
      if (existing.role === ADMIN && existing.isActive) {
        // An admin from before the permission RBAC (or a restored database) may lack the role.
        const given = await userRoleRepository.ensureSuperAdmin(existing.id);
        return { action: given ? 'promoted' : 'unchanged', user: existing };
      }
      if (!input.promote) {
        throw new SeedAdminError(
          `${input.email} already exists (role ${existing.role}${existing.isActive ? '' : ', inactive'}). ` +
            'Run again with --promote to make them an active admin (their password is kept).',
        );
      }
      const promoted = await repository.updateById(existing.id, { role: ADMIN, isActive: true });
      await userRoleRepository.ensureSuperAdmin(existing.id);
      return { action: 'promoted', user: promoted ?? existing };
    }

    if (input.promote) {
      throw new SeedAdminError(
        `${input.email} does not exist; run without --promote to create it.`,
      );
    }
    if (input.password === undefined || input.password.length < MIN_PASSWORD_LENGTH) {
      throw new SeedAdminError(
        `The password must be at least ${String(MIN_PASSWORD_LENGTH)} characters.`,
      );
    }
    const user = await repository.create({
      email: input.email,
      fullName: input.fullName,
      passwordHash: await hash(input.password),
      role: ADMIN,
      isActive: true,
    });
    await userRoleRepository.ensureSuperAdmin(user.id);
    return { action: 'created', user };
  });
  if (result.action === 'promoted') await onUserChanged(result.user.id);
  return result;
};
