import {
  Baby,
  Banknote,
  Bike,
  BookOpen,
  BriefcaseBusiness,
  Bus,
  Car,
  CircleDollarSign,
  Clapperboard,
  Coffee,
  Dumbbell,
  Fuel,
  Gamepad2,
  Gift,
  GraduationCap,
  HandCoins,
  Heart,
  HeartPulse,
  Home,
  Landmark,
  Laptop,
  Music,
  Package,
  PawPrint,
  Plane,
  Receipt,
  Scissors,
  ShieldCheck,
  Shirt,
  ShoppingBag,
  ShoppingCart,
  Smartphone,
  Sparkles,
  Stethoscope,
  Store,
  Tags,
  Ticket,
  Train,
  TrendingUp,
  Truck,
  Tv,
  Umbrella,
  Utensils,
  Wallet,
  WalletCards,
  Wrench,
  Zap,
  Droplets,
  Flame,
  Wifi,
  FileText,
  Clock,
  CalendarDays,
  CircleHelp,
  CreditCard,
  Building2,
  Gem,
  MapPinned
} from 'lucide-react'

const MAPA_ICONES = {
  utensils: Utensils,
  salad: Utensils,
  soup: Utensils,
  coffee: Coffee,
  wine: Coffee,

  car: Car,
  taxi: Car,
  bus: Bus,
  train: Train,
  bike: Bike,
  fuel: Fuel,
  plane: Plane,
  travel: MapPinned,
  truck: Truck,

  home: Home,
  housePlug: Home,
  rent: Building2,
  utilities: Zap,
  water: Droplets,
  gas: Flame,
  wifi: Wifi,

  health: HeartPulse,
  doctor: Stethoscope,
  gym: Dumbbell,
  wellness: Sparkles,

  game: Gamepad2,
  movie: Clapperboard,
  music: Music,
  ticket: Ticket,
  tv: Tv,

  shopping: ShoppingCart,
  shoppingBag: ShoppingBag,
  store: Store,
  tags: Tags,
  clothes: Shirt,
  beauty: Scissors,
  gift: Gift,
  gem: Gem,

  income: CircleDollarSign,
  money: CircleDollarSign,
  banknote: Banknote,
  wallet: Wallet,
  card: WalletCards,
  creditCard: CreditCard,
  receipt: Receipt,
  bills: FileText,
  bank: Landmark,
  investments: TrendingUp,
  piggyBank: Wallet,
  cashback: HandCoins,

  education: GraduationCap,
  book: BookOpen,
  work: BriefcaseBusiness,
  laptop: Laptop,

  pets: PawPrint,
  dog: PawPrint,
  cat: PawPrint,
  baby: Baby,
  insurance: ShieldCheck,
  umbrella: Umbrella,
  vacation: Plane,
  hotel: Building2,
  heart: Heart,
  calendar: CalendarDays,
  clock: Clock,
  services: Wrench,
  package: Package,
  help: CircleHelp,
  phone: Smartphone
}

export const OPCOES_ICONES_CATEGORIA = [
  { valor: 'utensils', label: 'Restaurante' },
  { valor: 'salad', label: 'Alimentação saudável' },
  { valor: 'soup', label: 'Comida' },
  { valor: 'coffee', label: 'Café' },
  { valor: 'wine', label: 'Bebidas' },

  { valor: 'car', label: 'Carro' },
  { valor: 'taxi', label: 'Táxi/App' },
  { valor: 'bus', label: 'Ônibus' },
  { valor: 'train', label: 'Trem' },
  { valor: 'bike', label: 'Bicicleta' },
  { valor: 'fuel', label: 'Combustível' },
  { valor: 'plane', label: 'Avião' },
  { valor: 'travel', label: 'Viagem' },
  { valor: 'truck', label: 'Frete' },

  { valor: 'home', label: 'Casa' },
  { valor: 'housePlug', label: 'Casa/energia' },
  { valor: 'rent', label: 'Aluguel' },
  { valor: 'utilities', label: 'Energia' },
  { valor: 'water', label: 'Água' },
  { valor: 'gas', label: 'Gás' },
  { valor: 'wifi', label: 'Internet' },

  { valor: 'health', label: 'Saúde' },
  { valor: 'doctor', label: 'Médico' },
  { valor: 'gym', label: 'Academia' },
  { valor: 'wellness', label: 'Bem-estar' },

  { valor: 'game', label: 'Games' },
  { valor: 'movie', label: 'Cinema' },
  { valor: 'music', label: 'Música' },
  { valor: 'ticket', label: 'Eventos' },
  { valor: 'tv', label: 'Streaming' },

  { valor: 'shopping', label: 'Mercado' },
  { valor: 'shoppingBag', label: 'Compras' },
  { valor: 'store', label: 'Loja' },
  { valor: 'tags', label: 'Promoções' },
  { valor: 'clothes', label: 'Roupas' },
  { valor: 'beauty', label: 'Beleza' },
  { valor: 'gift', label: 'Presentes' },
  { valor: 'gem', label: 'Luxo' },

  { valor: 'income', label: 'Receitas' },
  { valor: 'money', label: 'Dinheiro' },
  { valor: 'banknote', label: 'Cédulas' },
  { valor: 'wallet', label: 'Carteira' },
  { valor: 'card', label: 'Cartão' },
  { valor: 'creditCard', label: 'Crédito' },
  { valor: 'receipt', label: 'Recibos' },
  { valor: 'bills', label: 'Contas' },
  { valor: 'bank', label: 'Banco' },
  { valor: 'investments', label: 'Investimentos' },
  { valor: 'piggyBank', label: 'Poupança' },
  { valor: 'cashback', label: 'Cashback' },

  { valor: 'education', label: 'Educação' },
  { valor: 'book', label: 'Livros' },
  { valor: 'work', label: 'Trabalho' },
  { valor: 'laptop', label: 'Tecnologia' },

  { valor: 'pets', label: 'Pets' },
  { valor: 'dog', label: 'Cachorro' },
  { valor: 'cat', label: 'Gato' },
  { valor: 'baby', label: 'Filhos' },
  { valor: 'insurance', label: 'Seguro' },
  { valor: 'umbrella', label: 'Proteção' },
  { valor: 'vacation', label: 'Férias' },
  { valor: 'hotel', label: 'Hotel' },
  { valor: 'heart', label: 'Relacionamento' },
  { valor: 'calendar', label: 'Agenda' },
  { valor: 'clock', label: 'Tempo' },
  { valor: 'services', label: 'Serviços' },
  { valor: 'package', label: 'Outros' },
  { valor: 'help', label: 'Diversos' },
  { valor: 'phone', label: 'Telefone' }
]

export function obterIconeNormalizado(icone) {
  const mapaLegado = {
    '🍔': 'utensils',
    '🚗': 'car',
    '🏠': 'home',
    '💊': 'health',
    '🎮': 'game',
    '🛒': 'shopping',
    '📺': 'tv',
    '💰': 'income',
    '📈': 'investments',
    '💳': 'card',
    '📦': 'package'
  }

  return mapaLegado[icone] || icone || 'package'
}

export function IconeCategoria({
  icone = 'package',
  cor = '#0F9D58',
  tamanho = 'md',
  ativo = false
}) {
  const iconeNormalizado = obterIconeNormalizado(icone)
  const Icone = MAPA_ICONES[iconeNormalizado] || Package

  const tamanhos = {
    sm: {
      container: 'h-10 w-10 rounded-2xl',
      icon: 18
    },
    md: {
      container: 'h-14 w-14 rounded-2xl',
      icon: 23
    },
    lg: {
      container: 'h-16 w-16 rounded-3xl',
      icon: 28
    }
  }

  const config = tamanhos[tamanho] || tamanhos.md

  return (
    <div
      className={`
        ${config.container}
        flex shrink-0 items-center justify-center border
        ${ativo ? 'shadow-[0_0_28px_rgba(58,242,161,0.24)]' : ''}
      `}
      style={{
        background: `linear-gradient(145deg, ${cor}33, #030504 70%)`,
        borderColor: `${cor}55`
      }}
    >
      <Icone
        size={config.icon}
        strokeWidth={2.2}
        style={{ color: ativo ? '#F4FFF8' : cor }}
      />
    </div>
  )
}