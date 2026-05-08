export function CampoTexto({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
  inputMode,
  className = ''
}) {
  return (
    <label className={`block ${className}`}>
      {label && (
        <span className="mb-2 block text-xs font-semibold text-[#91A99C]">
          {label}
        </span>
      )}

      <input
        type={type}
        inputMode={inputMode}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="
          min-h-[48px] w-full rounded-2xl border border-[#1C2A24]
          bg-[#030504] px-4 py-3 text-sm text-[#F4FFF8] outline-none
          placeholder:text-[#587367]
          focus:border-[#3AF2A1] focus:ring-2 focus:ring-[#3AF2A1]/10
        "
      />
    </label>
  )
}