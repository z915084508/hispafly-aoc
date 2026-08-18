import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient({
  transactionOptions: {
    // Prisma defaults interactive transactions to maxWait=2s and timeout=5s.
    // Programacion publication validates a rotation and creates a bounded set of
    // future Flights atomically, which can exceed that limit on a remote Neon DB.
    maxWait: 10_000,
    timeout: 60_000,
  },
});

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
