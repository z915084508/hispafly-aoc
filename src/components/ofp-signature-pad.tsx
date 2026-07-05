"use client";

import { useRef, useState } from "react";
import { signOFPAction } from "@/app/pilot/ofp/actions";

export function OfpSignaturePad({ ofpId }: { ofpId: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [drawing, setDrawing] = useState(false);
  const [signature, setSignature] = useState("");
  const point = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!; const bounds = canvas.getBoundingClientRect();
    return { x: (event.clientX - bounds.left) * canvas.width / bounds.width, y: (event.clientY - bounds.top) * canvas.height / bounds.height };
  };
  const start = (event: React.PointerEvent<HTMLCanvasElement>) => { const context = canvasRef.current?.getContext("2d"); if (!context) return; const p = point(event); context.beginPath(); context.moveTo(p.x, p.y); setDrawing(true); event.currentTarget.setPointerCapture(event.pointerId); };
  const move = (event: React.PointerEvent<HTMLCanvasElement>) => { if (!drawing) return; const canvas = canvasRef.current!; const context = canvas.getContext("2d")!; const p = point(event); context.lineWidth = 2.5; context.lineCap = "round"; context.strokeStyle = "#111827"; context.lineTo(p.x, p.y); context.stroke(); setSignature(canvas.toDataURL("image/png")); };
  const stop = () => setDrawing(false);
  const clear = () => { const canvas = canvasRef.current!; canvas.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height); setSignature(""); };
  return <form action={signOFPAction} className="signature-form">
    <input type="hidden" name="ofpId" value={ofpId}/><input type="hidden" name="signatureData" value={signature}/>
    <canvas ref={canvasRef} width={760} height={180} className="signature-canvas" onPointerDown={start} onPointerMove={move} onPointerUp={stop} onPointerCancel={stop}/>
    <button type="button" className="action-button" onClick={clear}>Clear</button>
    <label className="signature-accept"><input name="accepted" type="checkbox" value="yes" required/> I have reviewed the route, fuel, payload and alternates and accept this OFP for HISPAFLY virtual operations.</label>
    <button className="button" type="submit" disabled={!signature}>ACCEPT &amp; SIGN OFP</button>
  </form>;
}
