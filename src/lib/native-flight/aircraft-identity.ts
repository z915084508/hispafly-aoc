export function aircraftRegistrationKey(value: string | null | undefined) {
  return (value ?? "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function aircraftSelcalKey(value: string | null | undefined) {
  return (value ?? "").trim().toUpperCase().replace(/[^A-Z]/g, "");
}

export function aircraftSerialNumberKey(value: string | null | undefined) {
  return (value ?? "").trim().toUpperCase();
}
