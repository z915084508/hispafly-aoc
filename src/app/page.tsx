import Image from "next/image";
import Link from "next/link";

export default function PortalGateway() {
  return (
    <main className="aoc-landing">
      <style>{`
        .aoc-landing {
          position: relative;
          min-height: 100vh;
          overflow: hidden;
          color: #ffffff;
          background:
            linear-gradient(110deg, rgba(6,14,24,.84) 0%, rgba(6,14,24,.76) 30%, rgba(6,14,24,.50) 58%, rgba(6,14,24,.72) 100%),
            url("/images/aoc-bg.png") center center / cover no-repeat,
            radial-gradient(circle at 80% 20%, rgba(215,25,32,.24), transparent 34%),
            linear-gradient(135deg, #07111f 0%, #111827 100%);
        }
        .aoc-bg-overlay {
          position: absolute;
          inset: 0;
          background:
            radial-gradient(circle at 18% 16%, rgba(255,196,0,.12), transparent 30%),
            radial-gradient(circle at 76% 30%, rgba(215,25,32,.16), transparent 34%),
            linear-gradient(to bottom, rgba(3,9,18,.08), rgba(3,9,18,.36));
          pointer-events: none;
        }
        .aoc-grid-overlay {
          position: absolute;
          inset: 0;
          pointer-events: none;
          opacity: .10;
          background-image: linear-gradient(rgba(255,255,255,.10) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.10) 1px, transparent 1px);
          background-size: 34px 34px;
          mask-image: linear-gradient(to bottom, rgba(0,0,0,.58), transparent 86%);
        }
        .aoc-hero-shell {
          position: relative;
          z-index: 2;
          min-height: 100vh;
          display: grid;
          grid-template-columns: minmax(420px, 1.08fr) minmax(320px, .92fr);
          gap: 44px;
          align-items: center;
          padding: 56px clamp(22px, 5vw, 78px);
        }
        .aoc-left { max-width: 760px; }
        .aoc-logo-wrap { max-width: 520px; margin-bottom: 18px; padding: 18px 20px; border-radius: 22px; background: rgba(255,255,255,.82); border: 1px solid rgba(255,255,255,.48); box-shadow: 0 22px 70px rgba(0,0,0,.18); backdrop-filter: blur(8px); }
        .aoc-logo { width: 100%; height: auto; display: block; }
        .aoc-kicker { margin: 0 0 12px; color: #ffc400; font-size: 12px; font-weight: 900; letter-spacing: .18em; text-transform: uppercase; }
        .aoc-title { margin: 0; font-size: clamp(44px, 6vw, 76px); line-height: .94; letter-spacing: -.04em; color: #fff; text-shadow: 0 8px 30px rgba(0,0,0,.34); }
        .aoc-subtitle { margin-top: 20px; max-width: 700px; color: rgba(255,255,255,.90); font-size: 18px; line-height: 1.72; text-shadow: 0 4px 18px rgba(0,0,0,.30); }
        .aoc-tags { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 26px; }
        .aoc-tags span { padding: 9px 13px; border: 1px solid rgba(255,255,255,.18); border-radius: 999px; background: rgba(255,255,255,.08); backdrop-filter: blur(8px); color: rgba(255,255,255,.92); font-size: 12px; font-weight: 700; box-shadow: 0 8px 22px rgba(0,0,0,.12); }
        .aoc-right { display: grid; gap: 22px; max-width: 520px; justify-self: end; width: 100%; }
        .portal-card { position: relative; overflow: hidden; padding: 28px; border-radius: 24px; background: rgba(8,16,28,.58); border: 1px solid rgba(255,255,255,.12); backdrop-filter: blur(14px); box-shadow: 0 24px 60px rgba(0,0,0,.26); }
        .portal-card::before { content: ""; position: absolute; inset: 0 0 auto; height: 4px; background: linear-gradient(90deg, #d71920 0%, #ffc400 55%, #d71920 100%); }
        .portal-card-top { margin-bottom: 22px; }
        .portal-label { display: inline-block; margin-bottom: 12px; color: #ffc400; font-size: 11px; font-weight: 900; letter-spacing: .15em; text-transform: uppercase; }
        .portal-card h2 { margin: 0 0 10px; font-size: 30px; line-height: 1.05; color: #fff; }
        .portal-card p { margin: 0; color: rgba(255,255,255,.78); line-height: 1.65; font-size: 15px; }
        .pilot-card { background: linear-gradient(145deg, rgba(8,16,28,.74), rgba(8,16,28,.56)), linear-gradient(135deg, rgba(255,196,0,.08), transparent 42%); }
        .staff-card { background: linear-gradient(145deg, rgba(8,16,28,.74), rgba(8,16,28,.56)), linear-gradient(135deg, rgba(215,25,32,.10), transparent 42%); }
        .portal-btn { display: inline-flex; align-items: center; justify-content: center; padding: 13px 18px; border-radius: 12px; background: linear-gradient(90deg, #b80e17, #d71920); color: #fff; font-size: 14px; font-weight: 800; box-shadow: 0 10px 24px rgba(215,25,32,.32); transition: transform .16s ease, box-shadow .16s ease, opacity .16s ease; }
        .portal-btn:hover { transform: translateY(-2px); box-shadow: 0 16px 30px rgba(215,25,32,.34); opacity: .98; }
        .aoc-status-bar { position: absolute; right: clamp(20px, 4vw, 44px); bottom: 24px; z-index: 2; display: inline-flex; gap: 10px; align-items: center; padding: 10px 14px; border-radius: 999px; background: rgba(7,17,31,.55); border: 1px solid rgba(255,255,255,.10); backdrop-filter: blur(10px); font-size: 11px; letter-spacing: .12em; text-transform: uppercase; }
        .aoc-status-bar span { color: rgba(255,255,255,.70); font-weight: 700; }
        .aoc-status-bar strong { color: #9ef0b6; font-weight: 900; }
        @media (max-width: 1100px) {
          .aoc-hero-shell { grid-template-columns: 1fr; gap: 28px; padding: 36px 22px 90px; }
          .aoc-right { justify-self: stretch; max-width: 100%; }
          .aoc-logo-wrap { max-width: 460px; }
        }
        @media (max-width: 760px) {
          .aoc-title { font-size: 42px; }
          .aoc-subtitle { font-size: 15px; }
          .portal-card { padding: 22px; border-radius: 20px; }
          .portal-card h2 { font-size: 24px; }
          .aoc-status-bar { left: 20px; right: 20px; justify-content: center; }
        }
      `}</style>
      <div className="aoc-bg-overlay" />
      <div className="aoc-grid-overlay" />

      <section className="aoc-hero-shell">
        <div className="aoc-left">
          <div className="aoc-logo-wrap">
            <Image src="/logo-hispafly-full.png" alt="HISPAFLY" width={1800} height={400} priority className="aoc-logo" />
          </div>
          <p className="aoc-kicker">AIRLINE OPERATIONS CENTER</p>
          <h1 className="aoc-title">HISPAFLY AOC</h1>
          <p className="aoc-subtitle">Portal centralizado para operaciones, coordinación y acceso diferenciado para pilotos y personal STAFF.</p>
          <div className="aoc-tags"><span>Flight Ops</span><span>Dispatch</span><span>PIREPs</span><span>Payroll</span><span>vAMSYS</span></div>
        </div>

        <div className="aoc-right">
          <div className="portal-card pilot-card">
            <div className="portal-card-top"><span className="portal-label">PILOT PORTAL</span><h2>Entrada Piloto</h2><p>Accede con vAMSYS para consultar tu panel, roster, cartera y nómina personal.</p></div>
            <Link className="portal-btn" href="/pilot">Entrar como piloto</Link>
          </div>
          <div className="portal-card staff-card">
            <div className="portal-card-top"><span className="portal-label">STAFF PORTAL</span><h2>Entrada STAFF</h2><p>Acceso administrativo mediante usuario y contraseña para gestionar AOC, PIREPs, nóminas y configuración.</p></div>
            <Link className="portal-btn" href="/admin-login?next=/staff">Entrar como staff</Link>
          </div>
        </div>
      </section>

      <div className="aoc-status-bar"><span>LIVE OPS STATUS</span><strong>CONNECTED</strong></div>
    </main>
  );
}
