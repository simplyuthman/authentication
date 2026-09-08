/**
 * lib/prisma.ts — Single Prisma Client instance.
 *
 * Uses the standard Next.js global caching pattern to prevent exhausting
 * database connections during hot-reloads in development.
 *
 * This is the ONLY file that instantiates PrismaClient. No route handler,
 * page component, or utility may import PrismaClient directly.
 *
 * Reference: .agents/rules/01-stack-and-structure.md §Separation Rules
 */

import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
