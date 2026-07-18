type Coordinates = { latitude: number | null; longitude: number | null };

export function distanceKm(from: Coordinates, to: Coordinates) {
  if (from.latitude == null || from.longitude == null || to.latitude == null || to.longitude == null) return null;
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const dLat = radians(to.latitude - from.latitude), dLon = radians(to.longitude - from.longitude);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(radians(from.latitude)) * Math.cos(radians(to.latitude)) * Math.sin(dLon / 2) ** 2;
  return Math.round(6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

/** EUR 0.12/km with a EUR 15 minimum. Kept here as the single pricing rule. */
export function jumpseatCostCents(km: number) {
  return Math.max(1_500, Math.round(km * 12));
}
