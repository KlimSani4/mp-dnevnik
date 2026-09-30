import { type HTMLAttributes, type ReactNode } from 'react';
import clsx from 'clsx';

type BadgeVariant = 'urgent' | 'high' | 'normal' | 'success' | 'verified' | 'default';
type BadgeSize = 'sm' | 'default';

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  size?: BadgeSize;
  children: ReactNode;
}

const variantClasses: Record<BadgeVariant, string> = {
  urgent: 'badge-urgent',
  high: 'badge-high',
  normal: 'badge-normal',
  success: 'badge-success',
  verified: 'badge-verified',
  default: 'bg-surface-100 text-surface-600 dark:bg-surface-700 dark:text-surface-300',
};

const sizeClasses: Record<BadgeSize, string> = {
  sm: 'text-2xs px-1.5 py-0',
  default: '',
};

function Badge({
  variant = 'default',
  size = 'default',
  children,
  className,
  ...props
}: BadgeProps) {
  return (
    <span
      className={clsx('badge', variantClasses[variant], sizeClasses[size], className)}
      {...props}
    >
      {children}
    </span>
  );
}

export { Badge };
export type { BadgeProps, BadgeVariant, BadgeSize };
