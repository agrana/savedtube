import Logo from '@/components/Logo';

export default function Footer() {
  return (
    <footer className="border-t border-white/[0.06] bg-[#080806] py-10 text-stone-400">
      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <div className="flex flex-col gap-8 md:flex-row md:items-center md:justify-between">
          <div>
            <Logo size="md" showText={false} variant="white" className="mb-3" />
            <p className="max-w-sm text-sm text-stone-500">
              A quiet YouTube practice studio for precise loops and focused
              sessions.
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:gap-6">
            <a
              href="/privacy"
              className="text-sm text-stone-500 transition hover:text-stone-100"
            >
              Privacy Policy
            </a>
            <a
              href="/terms"
              className="text-sm text-stone-500 transition hover:text-stone-100"
            >
              Terms of Service
            </a>
            <a
              href="mailto:support@savedtube.com"
              className="text-sm text-stone-500 transition hover:text-stone-100"
            >
              Support
            </a>
          </div>
        </div>

        <div className="mt-8 border-t border-white/[0.06] pt-6 text-center">
          <p className="text-sm text-stone-600">
            © {new Date().getFullYear()} SavedTube. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
