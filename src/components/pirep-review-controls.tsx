"use client";

import { useRef, useState } from "react";
import { PIREP_REJECT_REASONS } from "@/lib/pirep/policy";

export function PirepReviewControls({ acceptAction, manualReviewAction, rejectAction }: { acceptAction: () => void; manualReviewAction: (data: FormData) => void; rejectAction: (data: FormData) => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [code, setCode] = useState("R01");
  return <div className="pirep-review-actions">
    <form action={acceptAction}><button className="action-button approve" type="submit">Accept</button></form>
    <form action={manualReviewAction}><input type="hidden" name="staffComment" value="Manual review requested from STAFF Portal."/><button className="action-button" type="submit">Send to Manual Review</button></form>
    <button className="action-button danger" type="button" onClick={() => dialog.current?.showModal()}>Reject</button>
    <dialog className="pirep-reject-modal" ref={dialog}>
      <form action={rejectAction} onSubmit={() => dialog.current?.close()}>
        <h2>Reject PIREP</h2>
        <p>Select the policy reason and leave a clear staff note. R08 / Other requires a comment.</p>
        <label>Reject code<select name="rejectCode" required value={code} onChange={(event) => setCode(event.target.value)}>{Object.entries(PIREP_REJECT_REASONS).map(([value, label]) => <option key={value} value={value}>{value} · {label}</option>)}</select></label>
        <label>Staff Comment<textarea name="staffComment" required={code === "R08"} rows={4} placeholder="Explain the evidence and review decision"/></label>
        <div className="notice"><strong>Final impact</strong><br/>Flight hours: 0 credited · Wallet reward: 0 · Rank progress: 0. The PIREP and full audit history remain stored.</div>
        <div className="pirep-review-actions"><button className="action-button" type="button" onClick={() => dialog.current?.close()}>Cancel</button><button className="action-button danger" type="submit">Confirm Reject</button></div>
      </form>
    </dialog>
  </div>;
}
