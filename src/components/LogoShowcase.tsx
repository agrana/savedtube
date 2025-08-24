import Logo from './Logo';

export default function LogoShowcase() {
  return (
    <div className="p-8 space-y-8">
      <h2 className="text-2xl font-bold text-gray-900 mb-6">Logo Variants</h2>

      {/* Light theme examples */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-gray-700">Light Theme</h3>
        <div className="bg-white p-6 rounded-lg border space-y-4">
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-600 w-20">Default:</span>
            <Logo size="md" />
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-600 w-20">Dark:</span>
            <Logo size="md" variant="dark" />
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-600 w-20">Light:</span>
            <Logo size="md" variant="light" />
          </div>
        </div>
      </div>

      {/* Dark theme examples */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-gray-700">Dark Theme</h3>
        <div className="bg-gray-900 p-6 rounded-lg space-y-4">
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-300 w-20">Default:</span>
            <Logo size="md" />
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-300 w-20">White:</span>
            <Logo size="md" variant="white" />
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-300 w-20">Light:</span>
            <Logo size="md" variant="light" />
          </div>
        </div>
      </div>

      {/* Size variations */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-gray-700">Size Variations</h3>
        <div className="bg-white p-6 rounded-lg border space-y-4">
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-600 w-20">Small:</span>
            <Logo size="sm" variant="dark" />
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-600 w-20">Medium:</span>
            <Logo size="md" variant="dark" />
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-600 w-20">Large:</span>
            <Logo size="lg" variant="dark" />
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-600 w-20">Extra Large:</span>
            <Logo size="xl" variant="dark" />
          </div>
        </div>
      </div>

      {/* Icon only */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-gray-700">Icon Only</h3>
        <div className="bg-white p-6 rounded-lg border space-y-4">
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-600 w-20">Small:</span>
            <Logo size="sm" showText={false} variant="dark" />
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-600 w-20">Medium:</span>
            <Logo size="md" showText={false} variant="dark" />
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-600 w-20">Large:</span>
            <Logo size="lg" showText={false} variant="dark" />
          </div>
        </div>
      </div>
    </div>
  );
}
