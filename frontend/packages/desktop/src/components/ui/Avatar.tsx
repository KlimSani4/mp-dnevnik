import { useState, type ImgHTMLAttributes } from 'react';
import clsx from 'clsx';

type AvatarSize = 'xs' | 'sm' | 'md' | 'lg';

interface AvatarProps extends Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'> {
  src?: string | null;
  name?: string;
  size?: AvatarSize;
}

const sizeMap: Record<AvatarSize, { container: string; text: string }> = {
  xs: { container: 'w-6 h-6', text: 'text-2xs' },
  sm: { container: 'w-8 h-8', text: 'text-xs' },
  md: { container: 'w-10 h-10', text: 'text-sm' },
  lg: { container: 'w-12 h-12', text: 'text-base' },
};

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

function Avatar({ src, name, size = 'md', className, alt, ...props }: AvatarProps) {
  const [hasError, setHasError] = useState(false);
  const showImage = src && !hasError;
  const initials = name ? getInitials(name) : '?';
  const { container, text } = sizeMap[size];

  return (
    <div
      className={clsx(
        'relative inline-flex shrink-0 items-center justify-center rounded-full overflow-hidden',
        'bg-primary-100 text-primary-700',
        'dark:bg-primary-900 dark:text-primary-300',
        container,
        className,
      )}
    >
      {showImage ? (
        <img
          src={src}
          alt={alt ?? name ?? 'avatar'}
          className="h-full w-full object-cover"
          onError={() => setHasError(true)}
          {...props}
        />
      ) : (
        <span className={clsx('font-medium select-none leading-none', text)}>
          {initials}
        </span>
      )}
    </div>
  );
}

export { Avatar };
export type { AvatarProps, AvatarSize };
