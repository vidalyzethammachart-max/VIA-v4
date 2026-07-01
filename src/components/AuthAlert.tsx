type AuthAlertProps = {
  variant: "success" | "error" | "info";
  message: string;
};

const alertStyles: Record<AuthAlertProps["variant"], string> = {
  success: "border-green-200 bg-green-100 text-green-700",
  error: "border-red-200 bg-red-100 text-red-700",
  info: "border-blue-200 bg-blue-100 text-blue-700",
};

export default function AuthAlert({ variant, message }: AuthAlertProps) {
  return (
    <div
      className={`mb-4 rounded-lg border p-3 text-center text-sm ${alertStyles[variant]}`}
      role={variant === "error" ? "alert" : "status"}
    >
      {message}
    </div>
  );
}
