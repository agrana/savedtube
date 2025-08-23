interface LogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showText?: boolean;
  className?: string;
}

export default function Logo({
  size = 'md',
  showText = true,
  className = '',
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
    xl: 'text-2xl',
  };

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {/* Bookmark with Play Button Icon */}
      <div className={`${sizeClasses[size]} flex-shrink-0`}>
        <svg
          viewBox="0 0 32 32"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="w-full h-full"
        >
          {/* Bookmark shape */}
          <path
            d="M6 2C6 0.895431 6.89543 0 8 0H24C25.1046 0 26 0.895431 26 2V30C26 30.5523 25.5523 31 25 31C24.4477 31 24 30.5523 24 30V2H8V30C8 30.5523 7.55228 31 7 31C6.44772 31 6 30.5523 6 30V2Z"
            fill="currentColor"
            className="text-gray-700"
          />

          {/* Play button triangle */}
          <path
            d="M13 8L21 16L13 24V8Z"
            fill="currentColor"
            className="text-red-600"
          />
        </svg>
      </div>

      {/* Text Logo */}
      {showText && (
        <div className={`font-bold text-gray-700 ${textSizes[size]}`}>
          <div>Saved</div>
          <div>Tube</div>
        </div>
      )}
    </div>
  );
}
