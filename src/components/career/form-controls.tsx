const controlClass =
  "h-9 w-full rounded-[10px] border border-transparent bg-[var(--surface-control)] px-3 text-[13px] text-[var(--text-primary)] shadow-[inset_0_0_0_.5px_rgba(60,60,67,.05)] outline-none transition-[background-color,box-shadow] ui-transition placeholder:text-[var(--text-tertiary)] hover:bg-[var(--surface-control-hover)] focus:bg-[var(--surface-canvas)] focus:shadow-[0_0_0_2px_color-mix(in_srgb,var(--accent)_14%,transparent)]";

const labelClass = "grid gap-1.5 text-[11px] font-medium text-[var(--text-secondary)]";

export function Field({
  label,
  name,
  defaultValue,
  type = "text",
  required = false,
  placeholder,
}: {
  label: string;
  name: string;
  defaultValue?: string | null;
  type?: string;
  required?: boolean;
  placeholder?: string;
}) {
  return (
    <label className={labelClass}>
      <span>{label}</span>
      <input
        name={name}
        type={type}
        required={required}
        defaultValue={defaultValue ?? ""}
        placeholder={placeholder}
        className={controlClass}
      />
    </label>
  );
}

export function TextField({
  label,
  name,
  defaultValue,
  placeholder,
}: {
  label: string;
  name: string;
  defaultValue?: string | null;
  placeholder?: string;
}) {
  return (
    <label className={labelClass}>
      <span>{label}</span>
      <textarea
        name={name}
        defaultValue={defaultValue ?? ""}
        placeholder={placeholder}
        className={`min-h-24 resize-y py-2.5 leading-5 ${controlClass}`}
      />
    </label>
  );
}

type SelectOption = string | { value: string; label: string };

export function SelectField({
  label,
  name,
  values,
  defaultValue,
}: {
  label: string;
  name: string;
  values: readonly SelectOption[];
  defaultValue?: string;
}) {
  return (
    <label className={labelClass}>
      <span>{label}</span>
      <select name={name} defaultValue={defaultValue} className={controlClass}>
        {values.map((item) => {
          const value = typeof item === "string" ? item : item.value;
          const text = typeof item === "string" ? item : item.label;
          return <option key={value} value={value}>{text}</option>;
        })}
      </select>
    </label>
  );
}

export const PrimaryButton = ({ children }: { children: React.ReactNode }) => (
  <button className="pressable h-9 w-fit rounded-[10px] bg-[var(--accent)] px-3.5 text-[13px] font-medium text-white shadow-[0_1px_2px_rgba(0,0,0,.06)] hover:bg-[var(--accent-hover)] active:bg-[var(--accent-pressed)]">
    {children}
  </button>
);
