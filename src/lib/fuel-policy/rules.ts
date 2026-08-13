export function resolveTaxiFuelKg(policyTaxiFuelKg: number | null, aircraftTaxiFuelKg: number | null | undefined) {
  return policyTaxiFuelKg ?? aircraftTaxiFuelKg ?? null;
}
