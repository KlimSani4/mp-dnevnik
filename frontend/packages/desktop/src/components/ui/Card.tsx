import { forwardRef, type HTMLAttributes, type ReactNode } from 'react';
import clsx from 'clsx';

type CardVariant = 'default' | 'hover' | 'outlined';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: CardVariant;
  padding?: 'none' | 'sm' | 'default' | 'lg';
  children: ReactNode;
}

const variantClasses: Record<CardVariant, string> = {
  default: 'card',
  hover: 'card-hover',
  outlined:
    'rounded-xl border border-surface-200 dark:border-surface-700 bg-transparent',
};

const paddingClasses: Record<string, string> = {
  none: 'p-0',
  sm: 'p-2',
  default: '', // handled by card base class (p-4)
  lg: 'p-6',
};

const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ variant = 'default', padding = 'default', children, className, ...props }, ref) => {
    const needsPaddingOverride = padding !== 'default';

    return (
      <div
        ref={ref}
        className={clsx(
          variantClasses[variant],
          needsPaddingOverride && paddingClasses[padding],
          className,
        )}
        {...props}
      >
        {children}
      </div>
    );
  },
);

Card.displayName = 'Card';

export { Card };
export type { CardProps, CardVariant };
