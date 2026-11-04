export function Topbar({
  busy,
  onOpenPlans,
}: {
  busy: boolean;
  onOpenPlans: () => void;
}) {
  return (
    <header className="topbar">
      <div className="brand">
        <img
          className="brand-logo"
          src="/icons/01_logo_horizontal_transparent.png"
          alt="Iklim PAL"
          width={1256}
          height={449}
        />
      </div>
      <div className="topbar-actions">
        <p>Local action planner</p>
        <button className="chip" type="button" disabled={busy} onClick={onOpenPlans}>
          Plans
        </button>
      </div>
    </header>
  );
}
