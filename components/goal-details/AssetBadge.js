export default function AssetBadge({ asset, accent }) {
  return (
    <div
      className="flex h-10 w-10 items-center justify-center rounded-full border border-[var(--border-subtle)] bg-[#1b120a]/80 text-sm font-semibold uppercase tracking-[0.18em] text-[var(--text-primary)]"
      style={{ boxShadow: accent ? `0 0 24px ${accent}33` : undefined }}
    >
      {asset}
    </div>
  );
}

