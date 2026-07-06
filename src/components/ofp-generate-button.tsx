"use client";

import { useFormStatus } from "react-dom";

export function OfpGenerateButton({ idleLabel, pendingLabel }: { idleLabel: string; pendingLabel: string }) {
  const { pending } = useFormStatus();
  return <button className="button" type="submit" disabled={pending}>{pending ? pendingLabel : idleLabel}</button>;
}

