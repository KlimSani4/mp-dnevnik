import clsx from 'clsx';

type ProgressColor = 'primary' | 'success' | 'danger' | 'warning';

interface ProgressBarProps {
  value: number;
  color?: ProgressColor;
  showLabel?: boolean;
  trend?: string;
  className?: string;
}

const colorClasses: Record<ProgressColor, string> = {
  primary: 'bg-primary-500',
  success: 'bg-success-500',
  danger: 'bg-danger-500',
  warning: 'bg-warning-500',
};

function ProgressBar({
  value,
  color = 'primary',
  showLabel = false,
  trend,
  className,
}: ProgressBarProps) {
  const clamped = Math.min(100, Math.max(0, value));

  return (
    <div className={clsx('flex flex-col gap-1', className)}>
      {(showLabel || trend) && (
        <div className="flex items-center justify-between text-xs">
          {showLabel && (
            <span className="text-surface-600 dark:text-surface-400">
              {Math.round(clamped)}%
            </span>
          )}
          {trend && (
            <span className="text-surface-500 dark:text-surface-400">{trend}</span>
          )}
        </div>
      )}
      <div className="progress-bar">
        <div
          className={clsx('progress-fill', colorClasses[color])}
          style={{ width: `${clamped}%` }}
          role="progressbar"
          aria-valuenow={clamped}
          aria-valuemin={0}
          aria-valuemax={100}
        />
      </div>
    </div>
  );
}

export { ProgressBar };
export type { ProgressBarProps, ProgressColor };
