import Logo from '@/components/Logo';

export default function Footer() {
  return (
    <footer className="bg-gray-800 text-white py-8 mt-auto">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col md:flex-row justify-between items-center">
          <div className="mb-4 md:mb-0">
            <Logo size="md" showText={false} variant="white" className="mb-2" />
            <p className="text-gray-300 text-sm">
              Distraction-free YouTube playlist player
            </p>
          </div>

          <div className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-6">
            <a
              href="/privacy"
              className="text-gray-300 hover:text-white transition-colors text-sm"
            >
              Privacy Policy
            </a>
            <a
              href="/terms"
              className="text-gray-300 hover:text-white transition-colors text-sm"
            >
              Terms of Service
            </a>
            <a
              href="mailto:support@savedtube.com"
              className="text-gray-300 hover:text-white transition-colors text-sm"
            >
              Support
            </a>
          </div>
        </div>

        <div className="mt-6 pt-6 border-t border-gray-700 text-center">
          <p className="text-gray-400 text-sm">
            © {new Date().getFullYear()} SavedTube. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
