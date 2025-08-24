import Image from 'next/image';

interface LogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showText?: boolean;
  className?: string;
  variant?: 'default' | 'light' | 'dark' | 'white';
}

export default function Logo({
  size = 'md',
  showText = true,
  className = '',
  variant = 'default',
}: LogoProps) {
  const sizeClasses = {
    sm: 'w-6 h-6',
    md: 'w-8 h-8',
    lg: 'w-12 h-12',
    xl: 'w-16 h-16',
  };

  const textSizes = {
    sm: 'text-sm',
    md: 'text-lg',
    lg: 'text-xl',
    xl: 'text-3xl',
  };

  // Determine which logo to use based on variant
  const getLogoSource = () => {
    switch (variant) {
      case 'light':
        return '/savedtube-logo-light.svg';
      case 'dark':
        return '/savedtube-logo-dark.svg';
      case 'white':
        return '/savedtube-logo-dark.svg'; // Use dark logo for white variant
      default:
        // For default, we'll use CSS to switch based on theme
        return '/savedtube-logo-light.svg';
    }
  };

  // Theme-aware color classes for text
  const getTextColor = () => {
    switch (variant) {
      case 'light':
        return 'text-gray-800';
      case 'dark':
        return 'text-gray-900';
      case 'white':
        return 'text-white';
      default:
        return 'text-gray-900 dark:text-gray-100';
    }
  };

  const logoSource = getLogoSource();
  const textColor = getTextColor();

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {/* Logo Icon */}
      <div className={`${sizeClasses[size]} flex-shrink-0 relative`}>
        {variant === 'default' ? (
          // For default variant, show both logos and use CSS to switch
          <div className="relative">
            <Image
              src="/savedtube-logo-light.svg"
              alt="SavedTube Logo"
              width={256}
              height={256}
              className={`w-full h-full dark:hidden`}
            />
            <Image
              src="/savedtube-logo-dark.svg"
              alt="SavedTube Logo"
              width={256}
              height={256}
              className={`w-full h-full hidden dark:block`}
            />
          </div>
        ) : (
          // For specific variants, use the appropriate logo
          <Image
            src={logoSource}
            alt="SavedTube Logo"
            width={256}
            height={256}
            className="w-full h-full"
          />
        )}
      </div>

      {/* Text Logo */}
      {showText && (
        <div className={`font-bold ${textColor} ${textSizes[size]}`}>
          <span>SavedTube</span>
        </div>
      )}
    </div>
  );
}
