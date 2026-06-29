"use client";

import { useEffect, useRef } from "react";

export function SelectAllCheckbox({ group, label = "Todos" }: { group: string; label?: string }) {
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const checkbox = ref.current;
    if (!checkbox) return;

    const boxes = () => Array.from(document.querySelectorAll<HTMLInputElement>(`input[data-select-group="${group}"]:not(:disabled)`));
    const updateState = () => {
      const inputs = boxes();
      const checkedCount = inputs.filter((input) => input.checked).length;
      checkbox.checked = inputs.length > 0 && checkedCount === inputs.length;
      checkbox.indeterminate = checkedCount > 0 && checkedCount < inputs.length;
      checkbox.disabled = inputs.length === 0;
    };

    const toggleAll = () => {
      for (const input of boxes()) input.checked = checkbox.checked;
      updateState();
    };

    const handleDocumentChange = (event: Event) => {
      const target = event.target as HTMLInputElement | null;
      if (target?.dataset?.selectGroup === group) updateState();
    };

    checkbox.addEventListener("change", toggleAll);
    document.addEventListener("change", handleDocumentChange);
    updateState();

    return () => {
      checkbox.removeEventListener("change", toggleAll);
      document.removeEventListener("change", handleDocumentChange);
    };
  }, [group]);

  return <label className="bulk-check"><input ref={ref} type="checkbox" aria-label={label} /><span>{label}</span></label>;
}
