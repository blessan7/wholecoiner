export default function FooterActions({ onBack, onPause, onResume, onEdit, status, loading }) {
  const isPaused = status === 'PAUSED';
  const isCompleted = status === 'COMPLETED';

  return (
    <section className="flex flex-wrap items-center justify-center gap-3 rounded-3xl border border-[var(--border-subtle)] bg-[#17110b]/90 p-6 shadow-[0_24px_80px_rgba(0,0,0,0.65)]">
      <button
        type="button"
        onClick={onBack}
        className="btn-ghost px-6 py-3 text-xs font-semibold uppercase tracking-[0.18em]"
      >
        Back to Goals
      </button>
      {!isCompleted && (
        <button
          type="button"
          onClick={isPaused ? onResume : onPause}
          disabled={loading}
          className="btn-primary flex items-center gap-2 px-6 py-3 text-xs font-semibold uppercase tracking-[0.18em] disabled:cursor-not-allowed disabled:opacity-60"
        >
          <span className="material-symbols-outlined text-base">
            {isPaused ? 'play_arrow' : 'pause'}
          </span>
          {isPaused ? 'Resume Goal' : 'Pause Goal'}
        </button>
      )}
      <button
        type="button"
        onClick={onEdit}
        className="btn-ghost px-6 py-3 text-xs font-semibold uppercase tracking-[0.18em]"
      >
        Edit Goal
      </button>
    </section>
  );
}

