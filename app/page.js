'use client';

import LoginButton from '@/components/LoginButton';

export default function Home() {
  return (
    <div className="relative flex min-h-screen flex-col bg-[var(--bg-main)] text-[var(--text-primary)]">
      <header className="relative z-20 px-6 py-6 sm:px-8 md:px-12">
        <nav className="mx-auto flex w-full max-w-6xl items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[var(--accent)] text-[#0d0804] font-bold">
              <svg
                className="h-5 w-5"
                fill="none"
                viewBox="0 0 48 48"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  clipRule="evenodd"
                  d="M24 4H6V17.3333V30.6667H24V44H42V30.6667V17.3333H24V4Z"
                  fill="currentColor"
                  fillRule="evenodd"
                />
              </svg>
            </div>
            <span className="text-lg font-semibold tracking-tight" style={{ fontFamily: 'var(--font-headline)' }}>
              Wholecoiner
            </span>
          </div>
          <div className="md:hidden">
            <LoginButton variant="header" />
          </div>
        </nav>
      </header>

      <main className="relative flex flex-1 items-center justify-center px-6 py-12 sm:px-8 sm:py-16 md:px-12">
        <div className="hero-gradient hidden md:block" />
        <div className="relative z-10 grid w-full max-w-6xl grid-cols-1 gap-10 lg:grid-cols-12 lg:items-center">
          <section className="space-y-6 text-center lg:col-span-7 lg:text-left">
            <div className="space-y-4">
              <p className="text-[0.68rem] uppercase tracking-[0.32em] text-[var(--text-secondary)]">
                Wholecoiner Wealth Framework
              </p>
              <h1
                className="text-[clamp(2.75rem,6vw,5.5rem)] font-black uppercase leading-[0.96] tracking-[0.12em]"
                style={{ fontFamily: 'var(--font-headline)' }}
              >
                1.0 Is the New Flex.
              </h1>
              <p className="max-w-xl text-[clamp(1rem,1.9vw,1.35rem)] text-[var(--text-secondary)] leading-relaxed">
                Wholecoiner helps you track your path to a full Bitcoin with clarity, discipline, and control. Make your portfolio tell a story worth bragging about.
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-4 text-[0.68rem] uppercase tracking-[0.28em] text-[var(--text-secondary)] lg:justify-start">
              <span>Progress you can feel</span>
              <span className="hidden h-3 w-px bg-white/15 lg:block" />
              <span>Celebrate every milestone</span>
            </div>
          </section>

          <aside className="flex justify-center lg:col-span-5 lg:justify-end">
            <div className="elevated-card w-full max-w-sm space-y-6 sm:max-w-md">
              <div className="space-y-3">
                <p className="text-[0.62rem] uppercase tracking-[0.32em] text-[var(--text-secondary)]">
                  Join the run
                </p>
                <h2 className="text-[1.6rem] font-semibold" style={{ fontFamily: 'var(--font-headline)' }}>
                  Sign in to stay on pace
                </h2>
                <p className="text-sm text-[var(--text-secondary)] leading-6">
                  We’ll create your wallet, protect it, and manage every step for you.
                </p>
              </div>
              <LoginButton variant="hero" />
              <div className="text-xs text-[var(--text-secondary)]">
                New here?{' '}
                <a className="font-semibold hover:underline" href="#">
                  Learn how it works
                </a>
              </div>
            </div>
          </aside>
        </div>
      </main>

      <footer className="w-full border-t border-[var(--border-subtle)] bg-[var(--bg-main)]">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-6 text-xs text-[var(--text-secondary)] sm:px-8 md:px-12">
          <p>© {new Date().getFullYear()} Wholecoiner. All rights reserved.</p>
          <div className="flex items-center gap-6">
            <a className="hover:text-[var(--accent)] transition-colors" href="#">
              Terms of Service
            </a>
            <a className="hover:text-[var(--accent)] transition-colors" href="#">
              Privacy Policy
            </a>
            <a className="hover:text-[var(--accent)] transition-colors" href="#">
              Support
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
