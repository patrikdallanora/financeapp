export function TopoTela({ titulo, subtitulo, acao }) {
  return (
    <header className="mb-5 flex items-start justify-between gap-4">
      <div>
        <p className="mb-1 text-xs font-black uppercase tracking-[0.24em] text-[#3AF2A1]">
          FinanceApp
        </p>

        <h1 className="texto-metalico-verde text-2xl font-black tracking-tight">
          {titulo}
        </h1>

        {subtitulo && (
          <p className="mt-1 max-w-[290px] text-sm leading-5 text-[#91A99C]">
            {subtitulo}
          </p>
        )}
      </div>

      {acao}
    </header>
  )
}