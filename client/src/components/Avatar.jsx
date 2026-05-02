export function Avatar({ initials, name, size = "md" }) {
  const sizes = {
    sm: "h-7 w-7 text-xs",
    md: "h-9 w-9 text-sm",
    lg: "h-12 w-12 text-base"
  };

  return (
    <span
      title={name}
      aria-label={name}
      className={`inline-flex items-center justify-center rounded-full bg-vantage-navy font-semibold text-white ${sizes[size] || sizes.md}`}
    >
      {initials}
    </span>
  );
}
