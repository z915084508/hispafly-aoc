import { PrismaClient } from "@prisma/client";
import { mockPilots, mockPireps } from "../src/lib/mock-workflow-data.ts";
import { calculatePayroll, creditsToCents, isPayrollEligible } from "../src/lib/payroll/calculatePayroll.ts";
import { AIRCRAFT_HOURLY_RATES, DEFAULT_PAYROLL_RULES } from "../src/lib/payroll/rules.ts";

const prisma = new PrismaClient();

async function main() {
  const staffFixtures = [
    { email: "admin@hispafly.local", name: "María Administradora", role: "ADMIN" as const },
    { email: "ops@hispafly.local", name: "Óscar Operaciones", role: "OPS" as const },
    { email: "finance@hispafly.local", name: "Carlos Finanzas", role: "FINANCE" as const },
    { email: "viewer@hispafly.local", name: "Vera Consulta", role: "VIEWER" as const },
  ];
  const staffUsers = new Map<string, string>();
  for (const fixture of staffFixtures) {
    const saved = await prisma.staffUser.upsert({
      where: { email: fixture.email },
      update: { name: fixture.name, role: fixture.role, active: true },
      create: { ...fixture, active: true },
    });
    staffUsers.set(fixture.email, saved.id);
  }
  const adminId = staffUsers.get("admin@hispafly.local");
  if (!adminId) throw new Error("Seed admin was not created.");

  const rule = await prisma.payrollRule.upsert({
    where: { name_version: { name: "Tarifas iniciales HISPAFLY", version: 1 } },
    update: { isActive: true },
    create: {
      name: "Tarifas iniciales HISPAFLY",
      version: 1,
      aircraftRates: AIRCRAFT_HOURLY_RATES,
      bonusRules: { onlineNetworkPercent: DEFAULT_PAYROLL_RULES.networkBonusPercent, landingRange: [DEFAULT_PAYROLL_RULES.landingBonusMinimum, DEFAULT_PAYROLL_RULES.landingBonusMaximum], landingBonus: DEFAULT_PAYROLL_RULES.landingBonusCredits, minimumScore: DEFAULT_PAYROLL_RULES.scoreBonusMinimum, scoreBonus: DEFAULT_PAYROLL_RULES.scoreBonusCredits },
      penaltyRules: { landingRateBelow: DEFAULT_PAYROLL_RULES.hardLandingThreshold, landingPenalty: DEFAULT_PAYROLL_RULES.hardLandingPenaltyCredits, scoreBelow: DEFAULT_PAYROLL_RULES.lowScoreThreshold, scorePenalty: DEFAULT_PAYROLL_RULES.lowScorePenaltyCredits },
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
    const { vamsysPilotId, ...pirepData } = pirep;
    const pilotId = pilotIds.get(vamsysPilotId);
    if (!pilotId) throw new Error(`Pilot not found for ${pirep.vamsysPirepId}`);
    const acceptedAt = pirep.status === "accepted" ? new Date(pirep.flownAt) : null;
    const saved = await prisma.pirep.upsert({
      where: { vamsysPirepId: pirep.vamsysPirepId },
      update: { ...pirepData, pilotId, flownAt: new Date(pirep.flownAt), acceptedAt },
      create: { ...pirepData, pilotId, flownAt: new Date(pirep.flownAt), acceptedAt },
    });

    if (!isPayrollEligible(pirep)) {
      await prisma.payrollRecord.deleteMany({ where: { pirepId: saved.id, status: "pending" } });
      continue;
    }

    const calculation = calculatePayroll(pirep);
    const payrollData = {
        pilotId,
        payrollRuleId: rule.id,
        basePayCents: creditsToCents(calculation.basePay),
        bonusCents: creditsToCents(calculation.totalBonus),
        penaltyCents: creditsToCents(calculation.totalPenalty),
        amountCents: creditsToCents(calculation.finalAmount),
        calculationDetails: { ...calculation },
        settlementMonth: pirep.flownAt.slice(0, 7),
    };
    const existing = await prisma.payrollRecord.findUnique({ where: { pirepId: saved.id }, select: { id: true, status: true } });
    if (!existing) await prisma.payrollRecord.create({ data: { pirepId: saved.id, ...payrollData } });
    else if (existing.status === "pending") await prisma.payrollRecord.update({ where: { id: existing.id }, data: payrollData });
  }

  const existingSeedLog = await prisma.aocAuditLog.findFirst({ where: { action: "MOCK_SEED_COMPLETED", staffUserId: adminId } });
  if (!existingSeedLog) await prisma.aocAuditLog.create({
    data: {
      staffUserId: adminId,
      action: "MOCK_SEED_COMPLETED",
      entityType: "System",
      message: "María Administradora cargó los datos de demostración de HISPAFLY AOC.",
      metadata: { pilots: 5, acceptedPireps: 12, rejectedPireps: 2, staffUsers: 4 },
    },
  });
  console.log("Seed complete: 5 pilots, 14 PIREPs and 12 payroll records.");
}

main().catch((error) => {
  console.error("Seed failed:", error);
  process.exitCode = 1;
}).finally(async () => prisma.$disconnect());
