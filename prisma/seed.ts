import { PrismaClient } from "@prisma/client";
import { mockPilots, mockPireps } from "../src/lib/mock-workflow-data.ts";
import { AIRCRAFT_HOURLY_RATES, calculatePayroll, creditsToCents } from "../src/lib/payroll-calculation.ts";

const prisma = new PrismaClient();

async function main() {
  const staff = await prisma.staffUser.upsert({
    where: { email: "operations@hispafly.test" },
    update: { displayName: "Operaciones HISPAFLY", role: "admin", isActive: true },
    create: { email: "operations@hispafly.test", displayName: "Operaciones HISPAFLY", role: "admin" },
  });

  const rule = await prisma.payrollRule.upsert({
    where: { name_version: { name: "Tarifas iniciales HISPAFLY", version: 1 } },
    update: { isActive: true },
    create: {
      name: "Tarifas iniciales HISPAFLY",
      version: 1,
      aircraftRates: AIRCRAFT_HOURLY_RATES,
      bonusRules: { onlineNetworkPercent: 10, landingRange: [-300, -50], landingBonus: 100, minimumScore: 95, scoreBonus: 150 },
      penaltyRules: { landingRateBelow: -600, landingPenalty: 200, scoreBelow: 70, scorePenalty: 150 },
      effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
      isActive: true,
    },
  });

  const pilotIds = new Map<string, string>();
  for (const pilot of mockPilots) {
    const saved = await prisma.pilot.upsert({
      where: { vamsysPilotId: pilot.vamsysPilotId },
      update: { ...pilot, status: "active" },
      create: { ...pilot, status: "active" },
    });
    pilotIds.set(pilot.vamsysPilotId, saved.id);
  }

  for (const pirep of mockPireps) {
    const pilotId = pilotIds.get(pirep.vamsysPilotId);
    if (!pilotId) throw new Error(`Pilot not found for ${pirep.vamsysPirepId}`);
    const acceptedAt = pirep.status === "accepted" ? new Date(pirep.flownAt) : null;
    const saved = await prisma.pirep.upsert({
      where: { vamsysPirepId: pirep.vamsysPirepId },
      update: { ...pirep, pilotId, flownAt: new Date(pirep.flownAt), acceptedAt },
      create: { ...pirep, pilotId, flownAt: new Date(pirep.flownAt), acceptedAt },
    });

    if (pirep.status === "rejected") {
      await prisma.payrollRecord.deleteMany({ where: { pirepId: saved.id, status: { not: "paid" } } });
      continue;
    }

    const calculation = calculatePayroll(pirep);
    await prisma.payrollRecord.upsert({
      where: { pirepId: saved.id },
      update: {
        pilotId,
        payrollRuleId: rule.id,
        basePayCents: creditsToCents(calculation.basePay),
        bonusCents: creditsToCents(calculation.totalBonus),
        penaltyCents: creditsToCents(calculation.totalPenalty),
        amountCents: creditsToCents(calculation.finalAmount),
        calculationDetails: { ...calculation },
        settlementMonth: pirep.flownAt.slice(0, 7),
      },
      create: {
        pirepId: saved.id,
        pilotId,
        payrollRuleId: rule.id,
        basePayCents: creditsToCents(calculation.basePay),
        bonusCents: creditsToCents(calculation.totalBonus),
        penaltyCents: creditsToCents(calculation.totalPenalty),
        amountCents: creditsToCents(calculation.finalAmount),
        calculationDetails: { ...calculation },
        settlementMonth: pirep.flownAt.slice(0, 7),
      },
    });
  }

  await prisma.aocAuditLog.create({
    data: { staffUserId: staff.id, action: "mock_seed_completed", entityType: "system", details: { pilots: 5, acceptedPireps: 12, rejectedPireps: 2 } },
  });
  console.log("Seed complete: 5 pilots, 14 PIREPs and 12 payroll records.");
}

main().catch((error) => {
  console.error("Seed failed:", error);
  process.exitCode = 1;
}).finally(async () => prisma.$disconnect());