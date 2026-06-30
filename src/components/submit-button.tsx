"use client";

import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";

type SubmitButtonProps = {
  children: ReactNode;
  pendingChildren?: ReactNode;
  className?: string;
  disabled?: boolean;
};

export function SubmitButton({ children, pendingChildren, className, disabled }: SubmitButtonProps) {
  const { pending } = useFormStatus();
  return (
    <button className={className} type="submit" disabled={disabled || pending} aria-busy={pending}>
      {pending ? pendingChildren ?? "Procesando..." : children}
    </button>
  );
}
