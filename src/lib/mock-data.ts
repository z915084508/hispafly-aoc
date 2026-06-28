export const pilots = [
  { id: "HSP102", name: "Marta Vidal", rank: "Captain", base: "LEMD", status: "Active", balance: 2840 },
  { id: "HSP118", name: "Daniel Costa", rank: "First Officer", base: "LEBL", status: "Active", balance: 1925 },
  { id: "HSP126", name: "Lucía Romero", rank: "Captain", base: "LEVC", status: "Active", balance: 3210 },
  { id: "HSP141", name: "Álex Martín", rank: "First Officer", base: "LEMD", status: "On leave", balance: 860 },
];

export const pireps = [
  { id: "P-260628-1842", flight: "HSP214", pilot: "Marta Vidal", route: "LEMD → LEBL", hours: 1.22, accepted: "28 jun, 14:22", payroll: "Calculated" },
  { id: "P-260628-1794", flight: "HSP431", pilot: "Daniel Costa", route: "LEBL → LEPA", hours: 0.88, accepted: "28 jun, 11:08", payroll: "Calculated" },
  { id: "P-260627-1731", flight: "HSP508", pilot: "Lucía Romero", route: "LEVC → LEMD", hours: 0.95, accepted: "27 jun, 20:34", payroll: "Calculated" },
  { id: "P-260627-1702", flight: "HSP109", pilot: "Álex Martín", route: "LEMD → LPPT", hours: 1.18, accepted: "27 jun, 18:02", payroll: "Review" },
];

export const payroll = [
  { pilot: "Marta Vidal", period: "June 2026", flights: 22, hours: 31.4, base: 2512, bonus: 328, total: 2840 },
  { pilot: "Daniel Costa", period: "June 2026", flights: 18, hours: 25.1, base: 1757, bonus: 168, total: 1925 },
  { pilot: "Lucía Romero", period: "June 2026", flights: 25, hours: 36.9, base: 2952, bonus: 258, total: 3210 },
];

export const transactions = [
  { id: "TX-84710", pilot: "Marta Vidal", type: "Payroll credit", amount: 2840, date: "28 Jun 2026", status: "Posted" },
  { id: "TX-84698", pilot: "Daniel Costa", type: "Payroll credit", amount: 1925, date: "28 Jun 2026", status: "Posted" },
  { id: "TX-84641", pilot: "Lucía Romero", type: "Manual adjustment", amount: 125, date: "27 Jun 2026", status: "Posted" },
  { id: "TX-84590", pilot: "Álex Martín", type: "Reversal", amount: -80, date: "26 Jun 2026", status: "Pending" },
];
