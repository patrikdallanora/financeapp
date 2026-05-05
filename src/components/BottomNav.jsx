import { Home, List, CreditCard, Target, Settings, BarChart } from 'lucide-react'

export function BottomNav({ current, onChange }) {
  const itens = [
    { key: 'dashboard', icon: Home, label: 'Home' },
    { key: 'extrato', icon: List, label: 'Extrato' },
    { key: 'cartoes', icon: CreditCard, label: 'Cartões' },
    { key: 'metas', icon: Target, label: 'Metas' },
    { key: 'config', icon: Settings, label: 'Config' },
    { key: 'relatorios', icon: BarChart, label: 'Relatórios' }
  ]

  return (
    <div className="fixed bottom-0 left-0 right-0 max-w-[430px] mx-auto bg-black border-t border-gray-800 flex justify-around py-2 z-50">
      {itens.map((item) => {
        const Icon = item.icon
        const ativo = current === item.key

        return (
          <button
            key={item.key}
            onClick={() => onChange(item.key)}
            className={`flex flex-col items-center text-[10px] ${
              ativo ? 'text-blue-400' : 'text-gray-400'
            }`}
          >
            <Icon size={19} />
            <span>{item.label}</span>
          </button>
        )
      })}
    </div>
  )
}