export function Botao({
  children,
  onClick,
  type = 'button',
  variante = 'primario',
  className = '',
  disabled = false
}) {
  const estilos = {
    primario:
      'bg-gradient-to-br from-[#3AF2A1] via-[#0F9D58] to-[#021A10] text-[#F4FFF8] glow-verde',
    secundario:
      'bg-[#07100B] text-[#3AF2A1] border border-[#1C2A24]',
    fantasma:
      'bg-transparent text-[#91A99C] border border-[#1C2A24]',
    perigo:
      'bg-red-950/40 text-red-300 border border-red-900/60'
  }

  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={`
        min-h-[48px] w-full rounded-2xl px-4 py-3 text-sm font-black
        tracking-tight transition active:scale-[0.98]
        disabled:cursor-not-allowed disabled:opacity-50
        ${estilos[variante] || estilos.primario}
        ${className}
      `}
    >
      {children}
    </button>
  )
}