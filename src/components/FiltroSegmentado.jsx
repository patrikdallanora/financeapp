export function FiltroSegmentado({ opcoes, valor, onChange }) {
  return (
    <div className="flex gap-2 overflow-x-auto rounded-2xl border border-[#1C2A24] bg-[#030504]/80 p-1">
      {opcoes.map((opcao) => {
        const ativo = valor === opcao.valor

        return (
          <button
            key={opcao.valor}
            onClick={() => onChange(opcao.valor)}
            className={`
              min-h-[38px] flex-1 whitespace-nowrap rounded-xl px-3 text-xs font-black transition
              ${
                ativo
                  ? 'bg-gradient-to-br from-[#3AF2A1] via-[#0F9D58] to-[#021A10] text-white shadow-[0_10px_24px_rgba(15,157,88,0.22)]'
                  : 'text-[#91A99C]'
              }
            `}
          >
            {opcao.label}
          </button>
        )
      })}
    </div>
  )
}