'use client';

import Logo from '@/components/Logo';
import DemoPathLanding from '@/components/DemoPathLanding';

function UpgradeButton() {
  return (
    <a
      href="#upgrade"
      className="inline-flex items-center justify-center rounded-full border border-amber-300/20 bg-amber-300/10 px-4 py-2 text-sm font-medium text-amber-100 transition hover:border-amber-200/40 hover:bg-amber-300/15"
    >
      Upgrade
    </a>
  );
}

export default function Home() {
  return (
    <main className="min-h-screen overflow-hidden bg-[#080806] text-stone-100">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[520px] bg-[radial-gradient(circle_at_50%_0%,rgba(245,158,11,0.16),transparent_42%),linear-gradient(180deg,rgba(255,255,255,0.045),transparent_55%)]" />
      <div className="pointer-events-none absolute left-1/2 top-20 h-[1px] w-[78vw] -translate-x-1/2 bg-gradient-to-r from-transparent via-white/20 to-transparent" />

      <nav className="relative z-10 mx-auto flex max-w-7xl items-center justify-between px-5 py-6 sm:px-8">
        <Logo size="lg" variant="white" showText={true} />
        <div className="hidden items-center gap-8 md:flex">
          <a
            href="#demo"
            className="text-sm text-stone-400 transition hover:text-stone-100"
          >
            Demo
          </a>
          <a
            href="#upgrade"
            className="text-sm text-stone-400 transition hover:text-stone-100"
          >
            Pro
          </a>
        </div>
        <UpgradeButton />
      </nav>

      <div className="relative pt-10 sm:pt-16">
        <DemoPathLanding />
      </div>

      <section
        id="upgrade"
        className="relative z-10 mx-auto max-w-7xl px-5 py-20 sm:px-8 lg:py-28"
      >
        <div className="grid gap-8 rounded-[2rem] border border-amber-200/15 bg-[linear-gradient(135deg,rgba(245,158,11,0.13),rgba(255,255,255,0.035)_42%,rgba(255,255,255,0.02))] p-8 lg:grid-cols-[1fr_auto] lg:items-center lg:p-10">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.24em] text-amber-100/70">
              SavedTube Pro
            </p>
            <h2 className="mt-4 max-w-2xl text-3xl font-medium tracking-[-0.04em] text-stone-50 sm:text-4xl">
              Generate your own learning path.
            </h2>
            <p className="mt-4 max-w-2xl leading-7 text-stone-400">
              Sign in to describe a goal, research a real video sequence, refine
              the map, and practice with loops. The public demo stays free to
              try.
            </p>
          </div>
          <div className="rounded-3xl border border-white/10 bg-black/25 p-5 text-center">
            <p className="text-sm text-stone-500">Starting at</p>
            <p className="mt-1 text-4xl font-medium tracking-[-0.04em] text-stone-50">
              €5
            </p>
            <p className="text-sm text-stone-500">per month</p>
            <a
              href="#demo"
              className="mt-5 inline-flex w-full items-center justify-center rounded-full bg-stone-100 px-6 py-3 text-sm font-medium text-stone-950 transition hover:bg-white"
            >
              Try the demo first
            </a>
          </div>
        </div>
      </section>
    </main>
  );
}
