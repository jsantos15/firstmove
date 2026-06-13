'use client';

const DEFAULT_NAV_BTN_CLASS =
  'flex items-center justify-center px-5 py-2.5 text-gray-400 transition-colors hover:bg-white/5 hover:text-white disabled:cursor-default disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-gray-400';

export function NavBtn({
  onClick,
  disabled,
  title,
  children,
  className,
}: {
  onClick: () => void;
  disabled: boolean;
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={className ?? DEFAULT_NAV_BTN_CLASS}
    >
      {children}
    </button>
  );
}
