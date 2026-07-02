import React from 'react';

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
}

const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  actionLabel,
  onAction,
}) => {
  return (
    <div className="flex items-center justify-center min-h-[60vh] p-8">
      <div className="text-center max-w-sm border border-border rounded-lg p-8 bg-bg-secondary/50">
        {icon && (
          <div className="text-text-muted text-4xl mb-4 flex justify-center">
            {icon}
          </div>
        )}
        <h3 className="text-text-primary text-lg font-medium mb-2">{title}</h3>
        {description && (
          <p className="text-text-secondary text-sm leading-relaxed mb-6">
            {description}
          </p>
        )}
        {actionLabel && onAction && (
          <button
            onClick={onAction}
            className="inline-flex items-center px-4 py-2 text-sm font-medium
                       text-white bg-accent rounded-md
                       hover:bg-accent-hover transition-colors duration-150"
          >
            {actionLabel}
          </button>
        )}
      </div>
    </div>
  );
};

export default EmptyState;
