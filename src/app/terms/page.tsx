export default function TermsPage() {
  return (
    <div className="min-h-screen bg-gray-50 py-12">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="bg-white shadow-lg rounded-lg p-8">
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold text-gray-900 mb-4">
              Terms of Service
            </h1>
            <p className="text-xl text-gray-600">SavedTube</p>
          </div>

          <div className="prose prose-lg max-w-none">
            <p className="text-sm text-gray-500 mb-8">
              Last updated:{' '}
              {new Date().toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })}
            </p>

            <h2 className="text-2xl font-semibold text-gray-900 mt-8 mb-4">
              1. Acceptance of terms
            </h2>
            <p className="mb-6">
              By using SavedTube you agree to these Terms of Service. If you do
              not agree, do not use the service.
            </p>

            <h2 className="text-2xl font-semibold text-gray-900 mt-8 mb-4">
              2. Description of service
            </h2>
            <p className="mb-6">
              SavedTube provides a distraction-free player for your existing
              YouTube playlists. You must have a valid Google account to use the
              service.
            </p>

            <h2 className="text-2xl font-semibold text-gray-900 mt-8 mb-4">
              3. User responsibilities
            </h2>
            <ul className="list-disc pl-6 mb-6 space-y-2">
              <li>
                You are responsible for your use of the service and your YouTube
                account.
              </li>
              <li>
                You will not use SavedTube to violate YouTube&apos;s Terms of
                Service.
              </li>
              <li>
                You understand that SavedTube is an independent project and not
                affiliated with YouTube or Google.
              </li>
            </ul>

            <h2 className="text-2xl font-semibold text-gray-900 mt-8 mb-4">
              4. Data access
            </h2>
            <div className="bg-blue-50 border-l-4 border-blue-400 p-4 mb-6">
              <ul className="list-disc pl-6 space-y-2">
                <li>
                  SavedTube requires read-only access (youtube.readonly) to your
                  YouTube playlists.
                </li>
                <li>We never modify or delete data in your YouTube account.</li>
              </ul>
            </div>

            <h2 className="text-2xl font-semibold text-gray-900 mt-8 mb-4">
              5. Availability and changes
            </h2>
            <p className="mb-6">
              We may modify or discontinue SavedTube at any time without notice.
            </p>

            <h2 className="text-2xl font-semibold text-gray-900 mt-8 mb-4">
              6. Disclaimer of warranties
            </h2>
            <p className="mb-6">
              SavedTube is provided &ldquo;as is&rdquo; without warranties of
              any kind.
            </p>

            <h2 className="text-2xl font-semibold text-gray-900 mt-8 mb-4">
              7. Limitation of liability
            </h2>
            <p className="mb-6">
              To the maximum extent permitted by law, SavedTube is not liable
              for any damages resulting from the use of the service.
            </p>

            <h2 className="text-2xl font-semibold text-gray-900 mt-8 mb-4">
              8. Contact
            </h2>
            <p className="mb-8">
              For questions about these Terms, contact{' '}
              <a
                href="mailto:support@savedtube.zenara.be"
                className="text-blue-600 hover:text-blue-800 underline"
              >
                support@savedtube.zenara.be
              </a>
              .
            </p>

            <div className="border-t pt-6 mt-8">
              <a
                href="/privacy"
                className="text-blue-600 hover:text-blue-800 underline"
              >
                ← View Privacy Policy
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
