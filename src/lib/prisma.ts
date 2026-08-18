import { PrismaClient } from "@prisma/client";

type IdentityData = { flightNumber?: string | null; callsign?: string | null };

function normalizeNewHispaflyIdentity(data: IdentityData) {
  const flightNumber = data.flightNumber?.trim().toUpperCase() ?? "";
  const callsign = data.callsign?.trim().toUpperCase() ?? "";
  const flightMatch = flightNumber.match(/^HFY(\d{1,4})$/);
  const callsignMatch = callsign.match(/^HFY(\d{1,4})$/);
  if (flightMatch) data.flightNumber = `HF${flightMatch[1]}`;
  if (callsignMatch) data.callsign = `HPF${callsignMatch[1]}`;
}

const createPrismaClient = () => new PrismaClient({
  transactionOptions: {
    // Prisma defaults interactive transactions to maxWait=2s and timeout=5s.
    // Programacion publication validates a rotation and creates a bounded set of
    // future Flights atomically, which can exceed that limit on a remote Neon DB.
    maxWait: 10_000,
    timeout: 60_000,
  },
}).$extends({
  query: {
    route: {
      create({ args, query }) {
        normalizeNewHispaflyIdentity(args.data);
        return query(args);
      },
    },
    flight: {
      create({ args, query }) {
        normalizeNewHispaflyIdentity(args.data);
        return query(args);
      },
    },
    pilotBooking: {
      create({ args, query }) {
        normalizeNewHispaflyIdentity(args.data);
        return query(args);
      },
    },
  },
});

type PrismaWithExtensions = ReturnType<typeof createPrismaClient>;
const globalForPrisma = globalThis as unknown as { prisma?: PrismaWithExtensions };

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
