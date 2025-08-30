export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-gray-50 py-12">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="bg-white shadow-lg rounded-lg p-8">
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold text-gray-900 mb-4">
              Privacy Policy
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

            <p className="mb-6 text-gray-700">
              SavedTube (&ldquo;we&rdquo;, &ldquo;our&rdquo;, &ldquo;us&rdquo;)
              provides a distraction-free interface to view your own saved
              YouTube playlists.
            </p>

            <h2 className="text-2xl font-semibold text-gray-900 mt-8 mb-4">
              Information we collect
            </h2>

            <ul className="list-disc pl-6 mb-6 space-y-2 text-gray-700">
              <li>
                <strong>Google account information:</strong> your basic profile
                (name, email, avatar) for sign-in.
              </li>
              <li>
                <strong>YouTube data:</strong> playlists and videos you have
                saved in your account, retrieved using the YouTube API
                (youtube.readonly scope).
              </li>
            </ul>

            <h2 className="text-2xl font-semibold text-gray-900 mt-8 mb-4">
              How we use this information
            </h2>

            <ul className="list-disc pl-6 mb-6 space-y-2 text-gray-700">
              <li>To let you log in securely with your Google account.</li>
              <li>
                To display your playlists/videos inside the SavedTube
                application.
              </li>
              <li>
                To improve your experience (e.g., saving your display
                preferences).
              </li>
            </ul>

            <div className="bg-blue-50 border-l-4 border-blue-400 p-4 mb-6">
              <p className="text-blue-800">
                <strong>Important:</strong> We do not modify or delete your
                YouTube data. We do not sell or share your personal data with
                third parties.
              </p>
            </div>

            <h2 className="text-2xl font-semibold text-gray-900 mt-8 mb-4">
              Data storage & security
            </h2>

            <ul className="list-disc pl-6 mb-6 space-y-2 text-gray-700">
              <li>
                Data is stored in Supabase (Postgres) with row-level security so
                only you can access your playlists.
              </li>
              <li>
                Access tokens are stored securely and refreshed automatically.
              </li>
              <li>All communication is encrypted (HTTPS/TLS).</li>
            </ul>

            <h2 className="text-2xl font-semibold text-gray-900 mt-8 mb-4">
              Your choices
            </h2>

            <ul className="list-disc pl-6 mb-6 space-y-2 text-gray-700">
              <li>
                You can revoke SavedTube&apos;s access at any time in your
                Google account settings:{' '}
                <a
                  href="https://myaccount.google.com/permissions"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:text-blue-800 underline"
                >
                  Google security settings
                </a>
                .
              </li>
              <li>
                You can request deletion of your SavedTube profile by contacting
                us at{' '}
                <a
                  href="mailto:support@savedtube.com"
                  className="text-blue-600 hover:text-blue-800 underline"
                >
                  support@savedtube.com
                </a>
                .
              </li>
            </ul>

            <h2 className="text-2xl font-semibold text-gray-900 mt-8 mb-4">
              Contact
            </h2>

            <p className="mb-8 text-gray-700">
              If you have any questions about this Privacy Policy, email us at{' '}
              <a
                href="mailto:support@savedtube.com"
                className="text-blue-600 hover:text-blue-800 underline"
              >
                support@savedtube.com
              </a>
              .
            </p>

            <div className="border-t pt-6 mt-8">
              <a
                href="/terms"
                className="text-blue-600 hover:text-blue-800 underline"
              >
                ← View Terms of Service
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
