type BackButtonPosition =
  | "bottom-right"
  | "bottom-left"
  | "top-right"
  | "top-left";

type BackButtonVariant = "light" | "dark";

type BackButtonProps = {
  position?: BackButtonPosition;
  variant?: BackButtonVariant;
  ariaLabel?: string;
  onBack?: () => void;
  className?: string;
};

const POSITION_CLASS: Record<BackButtonPosition, string> = {
  "bottom-right": "bottom-6 right-6",
  "bottom-left": "bottom-6 left-6",
  "top-right": "top-6 right-6",
  "top-left": "top-6 left-6",
};

const VARIANT_CLASS: Record<BackButtonVariant, string> = {
  light:
    "bg-red-500 text-white border border-red-500 shadow-lg motion-safe:hover:bg-red-600 dark:bg-red-500 dark:text-white dark:border-red-500 dark:motion-safe:hover:bg-red-600",
  dark:
    "bg-red-500 text-white border border-red-500 shadow-xl motion-safe:hover:bg-red-600",
};

export default function BackButton({
  position = "bottom-right",
  variant = "light",
  ariaLabel = "Go back",
  onBack,
  className = "",
}: BackButtonProps) {
  const handleBack = () => {
    if (onBack) {
      onBack();
      return;
    }
    window.history.back();
  };

  return (
    <button
      type="button"
      aria-label={ariaLabel}
      onClick={handleBack}
      className={`fixed z-40 grid h-12 w-12 place-items-center rounded-full focus:outline-none focus:ring-2 focus:ring-[#04418b]/40 motion-safe:transition motion-safe:duration-200 motion-safe:ease-in-out motion-safe:hover:scale-105 motion-safe:active:scale-95 ${POSITION_CLASS[position]} ${VARIANT_CLASS[variant]} ${className}`}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-5 w-5"
        aria-hidden="true"
      >
        <path d="M15 18l-6-6 6-6" />
      </svg>
    </button>
  );
}
