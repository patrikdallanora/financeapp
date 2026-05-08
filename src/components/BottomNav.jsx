import {
  Home,
  List,
  CreditCard,
  Target,
  Settings,
  FolderTree
} from 'lucide-react'

export function BottomNav({ current, onChange }) {
  const itens = [
    { key: 'dashboard', icon: Home, label: 'Home' },
    { key: 'extrato', icon: List, label: 'Extrato' },
    { key: 'cartoes', icon: CreditCard, label: 'Cartões' },
    { key: 'metas', icon: Target, label: 'Metas' },
    { key: 'categorias', icon: FolderTree, label: 'Categorias' },
    { key: 'config', icon: Settings, label: 'Config' }
  ]

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 mx-auto flex max-w-[430px] justify-around border-t border-[#1C2A24] bg-black/85 px-1 py-2 backdrop-blur-xl">
      {itens.map((item) => {
        const Icon = item.icon
        const ativo = current === item.key

        return (
          <button
            key={item.key}
            onClick={() => onChange(item.key)}
            className={`flex flex-1 flex-col items-center gap-1 text-[10px] font-semibold transition ${
              ativo ? 'text-[#00E676]' : 'text-[#8FA99B]'
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