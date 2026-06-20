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

  const logoSource = '/savedtube-logo-mystic-256.png';

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

  const textColor = getTextColor();

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {/* Logo Icon */}
      <div className={`${sizeClasses[size]} flex-shrink-0 relative`}>
        <Image
          src={logoSource}
          alt="SavedTube Logo"
          width={256}
          height={256}
          className="w-full h-full rounded-[22%] object-cover"
          priority={size === 'lg' || size === 'xl'}
        />
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
