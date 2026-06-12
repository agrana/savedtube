'use client';

import { signIn } from 'next-auth/react';
import Logo from '@/components/Logo';

const DASHBOARD_CALLBACK_URL = '/dashboard';

const featureCards = [
  {
    eyebrow: '01',
    title: 'Import a playlist',
    body: 'Bring in the YouTube lessons, sets, talks, and sessions you already saved. Your library becomes a quiet practice room.',
  },
  {
    eyebrow: '02',
    title: 'Mark the useful part',
    body: 'Set precise start and end points while the video keeps playing. Create up to five free practice loops.',
  },
  {
    eyebrow: '03',
    title: 'Repeat deliberately',
    body: 'Return to the exact passage tomorrow, slow down, replay, and build a focused practice habit.',
  },
];

const loopRows = [
  { title: 'Intro groove', time: '00:42 — 01:18', state: 'Active' },
  { title: 'Bridge transition', time: '03:04 — 03:37', state: 'Saved' },
  { title: 'Difficult ending', time: '06:11 — 06:44', state: 'Next' },
];

function GoogleIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="currentColor"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="currentColor"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <path
        fill="currentColor"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  );
}

function GoogleSignInButton() {
  return (
    <button
      onClick={() => signIn('google', { callbackUrl: DASHBOARD_CALLBACK_URL })}
      className="group inline-flex items-center justify-center gap-3 rounded-full border border-white/10 bg-stone-100 px-6 py-3 text-sm font-medium text-stone-950 shadow-[0_0_0_1px_rgba(255,255,255,0.04),0_16px_60px_rgba(0,0,0,0.45)] transition duration-200 hover:bg-white hover:shadow-[0_0_0_1px_rgba(255,255,255,0.08),0_20px_80px_rgba(245,158,11,0.12)]"
    >
      <GoogleIcon />
      Start practicing
      <span className="text-stone-500 transition group-hover:translate-x-0.5">
        →
      </span>
    </button>
  );
}

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
            href="#practice"
            className="text-sm text-stone-400 transition hover:text-stone-100"
          >
            Practice
          </a>
          <a
            href="#loops"
            className="text-sm text-stone-400 transition hover:text-stone-100"
          >
            Loops
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

      <section className="relative z-10 mx-auto grid max-w-7xl items-center gap-12 px-5 pb-24 pt-14 sm:px-8 lg:grid-cols-[1fr_0.86fr] lg:pb-32 lg:pt-24">
        <div className="max-w-3xl">
          <div className="mb-7 inline-flex rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-xs font-medium uppercase tracking-[0.28em] text-amber-100/80">
            Berlin minimalist studio
          </div>
          <h1 className="max-w-4xl text-5xl font-medium leading-[0.95] tracking-[-0.055em] text-stone-50 sm:text-6xl lg:text-7xl">
            Master YouTube videos section by section.
          </h1>
          <p className="mt-7 max-w-2xl text-lg leading-8 text-stone-400 sm:text-xl">
            Import a playlist, create five precise practice loops for free, and
            turn long videos into a calm daily practice library.
          </p>
          <div className="mt-10 flex flex-col gap-4 sm:flex-row sm:items-center">
            <GoogleSignInButton />
            <a
              href="#practice"
              className="inline-flex items-center justify-center rounded-full border border-white/10 bg-white/[0.03] px-6 py-3 text-sm font-medium text-stone-200 transition hover:bg-white/[0.06]"
            >
              See the workflow
            </a>
          </div>
          <p className="mt-5 text-sm text-stone-500">
            Free: 5 saved practice loops. Pro unlocks unlimited loops and
            imports.
          </p>
        </div>

        <div className="relative" id="loops">
          <div className="absolute -inset-6 rounded-[2rem] bg-amber-300/5 blur-3xl" />
          <div className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-[#10100d]/90 shadow-2xl shadow-black/50 backdrop-blur">
            <div className="aspect-video bg-[linear-gradient(135deg,#151512,#0a0a08)] p-4">
              <div className="flex h-full flex-col justify-between rounded-2xl border border-white/10 bg-black/40 p-4">
                <div className="flex items-center justify-between text-xs text-stone-500">
                  <span>Imported lesson</span>
                  <span className="font-mono">06:44</span>
                </div>
                <div>
                  <div className="mb-4 h-1.5 overflow-hidden rounded-full bg-white/10">
                    <div className="h-full w-[48%] rounded-full bg-amber-300" />
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-stone-200">
                        Jazz comping practice
                      </p>
                      <p className="mt-1 font-mono text-xs text-stone-500">
                        03:04 — 03:37
                      </p>
                    </div>
                    <div className="grid h-11 w-11 place-items-center rounded-full bg-stone-100 text-stone-950">
                      ▶
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-3 p-5">
              {loopRows.map((row) => (
                <div
                  key={row.title}
                  className="flex items-center justify-between rounded-2xl border border-white/8 bg-white/[0.035] px-4 py-3"
                >
                  <div>
                    <p className="text-sm font-medium text-stone-200">
                      {row.title}
                    </p>
                    <p className="mt-1 font-mono text-xs text-stone-500">
                      {row.time}
                    </p>
                  </div>
                  <span className="rounded-full border border-white/10 px-2.5 py-1 text-xs text-stone-400">
                    {row.state}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section
        id="practice"
        className="relative z-10 border-y border-white/[0.06] bg-white/[0.025]"
      >
        <div className="mx-auto grid max-w-7xl gap-5 px-5 py-16 sm:px-8 lg:grid-cols-3">
          {featureCards.map((feature) => (
            <article
              key={feature.title}
              className="rounded-[1.5rem] border border-white/10 bg-[#10100d] p-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
            >
              <p className="font-mono text-xs text-amber-200/70">
                {feature.eyebrow}
              </p>
              <h2 className="mt-5 text-2xl font-medium tracking-[-0.03em] text-stone-100">
                {feature.title}
              </h2>
              <p className="mt-4 leading-7 text-stone-400">{feature.body}</p>
            </article>
          ))}
        </div>
      </section>

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
              Build your full YouTube practice library.
            </h2>
            <p className="mt-4 max-w-2xl leading-7 text-stone-400">
              Upgrade when your five free loops are full. Keep unlimited
              practice loops, playlist imports, notes, and focused practice
              sessions.
            </p>
          </div>
          <div className="rounded-3xl border border-white/10 bg-black/25 p-5 text-center">
            <p className="text-sm text-stone-500">Starting at</p>
            <p className="mt-1 text-4xl font-medium tracking-[-0.04em] text-stone-50">
              €5
            </p>
            <p className="text-sm text-stone-500">per month</p>
            <button className="mt-5 w-full rounded-full bg-stone-100 px-6 py-3 text-sm font-medium text-stone-950 transition hover:bg-white">
              Upgrade to Pro
            </button>
          </div>
        </div>
      </section>
    </main>
  );
}
