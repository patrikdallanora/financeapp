import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { ArrowLeft, Edit3, Plus, Trash2 } from 'lucide-react'

import { db, criarRegistroBase, softDelete, agoraISO } from '../db/database'
import { Botao } from '../components/Botao'
import { CampoTexto } from '../components/CampoTexto'
import { CardPremium } from '../components/CardPremium'
import { FiltroSegmentado } from '../components/FiltroSegmentado'
import { TopoTela } from '../components/TopoTela'
import {
  IconeCategoria,
  OPCOES_ICONES_CATEGORIA,
  obterIconeNormalizado
} from '../components/IconeCategoria'

const CORES_PADRAO = [
  
  '#0F9D58',
  '#3AF2A1',
  '#15803D',
  '#84CC16',

  '#14B8A6',
  '#06B6D4',
  '#0EA5E9',
  '#3B82F6',
  '#2563EB',
  '#6366F1',
  '#8B5CF6',
  '#A855F7',

  '#D946EF',
  '#EC4899',
  '#F43F5E',
  '#EF4444',
  '#F97316',
  '#F59E0B',
  '#FFF085',
  '#CA8A04',

  '#A65F1B',
  '#7B3306',
  '#7E2A0C',
  '#F0B13B',

  '#64748B',
  '#475569',
  '#334155',
  '#71717A',
  '#52525B',
  '#6B7280'
]

export default function Categorias() {
  const [filtro, setFiltro] = useState('todas')
  const [categoriaSelecionada, setCategoriaSelecionada] = useState(null)
  const [modoFormulario, setModoFormulario] = useState(false)

  const categorias = useLiveQuery(async () => {
    const todas = await db.categorias.toArray()
    return todas.filter((categoria) => !categoria.deletedAt)
  }, [])

  const subcategorias = useLiveQuery(async () => {
    const todas = await db.subcategorias.toArray()
    return todas.filter((subcategoria) => !subcategoria.deletedAt)
  }, [])

  const categoriasFiltradas = useMemo(() => {
    if (!categorias) return []

    if (filtro === 'todas') return categorias
    return categorias.filter(
      (categoria) => categoria.tipo === filtro || categoria.tipo === 'ambos'
    )
  }, [categorias, filtro])

  const obterQuantidadeSubcategorias = (categoriaId) => {
    if (!subcategorias) return 0
    return subcategorias.filter((sub) => sub.categoriaId === categoriaId).length
  }

  if (categoriaSelecionada) {
    return (
      <DetalheCategoria
        categoria={categoriaSelecionada}
        subcategorias={(subcategorias || []).filter(
          (subcategoria) => subcategoria.categoriaId === categoriaSelecionada.id
        )}
        onVoltar={() => setCategoriaSelecionada(null)}
        onAtualizarCategoria={(categoriaAtualizada) => setCategoriaSelecionada(categoriaAtualizada)}
      />
    )
  }

  return (
    <div className="space-y-4 pb-24">
      <TopoTela
        titulo="Categorias"
        subtitulo="Organize receitas, despesas e subcategorias com uma base consistente."
        acao={
          <button
            onClick={() => setModoFormulario((atual) => !atual)}
            className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-[#3AF2A1] via-[#0F9D58] to-[#021A10] text-white glow-verde active:scale-95"
          >
            <Plus size={22} />
          </button>
        }
      />

      <FiltroSegmentado
        valor={filtro}
        onChange={setFiltro}
        opcoes={[
          { valor: 'todas', label: 'Todas' },
          { valor: 'despesa', label: 'Despesas' },
          { valor: 'receita', label: 'Receitas' },
          { valor: 'ambos', label: 'Ambos' }
        ]}
      />

      {modoFormulario && (
        <FormularioCategoria
          onCancelar={() => setModoFormulario(false)}
          onSalvo={() => setModoFormulario(false)}
        />
      )}

      <section className="space-y-3">
        {categoriasFiltradas.map((categoria) => (
          <CardPremium
            key={categoria.id}
            onClick={() => setCategoriaSelecionada(categoria)}
            className="flex items-center gap-4"
          >
            <IconeCategoria
              icone={categoria.icone}
              cor={categoria.cor}
              tamanho="md"
              ativo
            />

            <div className="min-w-0 flex-1">
              <p className="truncate text-base font-black text-[#F4FFF8]">
                {categoria.nome}
              </p>

              <p className="mt-1 text-xs capitalize text-[#91A99C]">
                {categoria.tipo} · {obterQuantidadeSubcategorias(categoria.id)} subcategorias
              </p>
            </div>

            <div
              className="h-3 w-3 rounded-full shadow-[0_0_14px_currentColor]"
              style={{
                backgroundColor: categoria.cor || '#0F9D58',
                color: categoria.cor || '#0F9D58'
              }}
            />
          </CardPremium>
        ))}

        {categoriasFiltradas.length === 0 && (
          <CardPremium>
            <p className="text-sm text-[#91A99C]">
              Nenhuma categoria encontrada para este filtro.
            </p>
          </CardPremium>
        )}
      </section>
    </div>
  )
}

function FormularioCategoria({ categoria, onCancelar, onSalvo }) {
  const [nome, setNome] = useState(categoria?.nome || '')
  const [icone, setIcone] = useState(obterIconeNormalizado(categoria?.icone || 'package'))
  const [cor, setCor] = useState(categoria?.cor || '#0F9D58')
  const [tipo, setTipo] = useState(categoria?.tipo || 'despesa')

  const salvar = async () => {
    if (!nome.trim()) {
      alert('Informe o nome da categoria.')
      return
    }

    if (categoria) {
      const dadosAtualizados = {
        nome: nome.trim(),
        icone,
        cor,
        tipo,
        updatedAt: agoraISO(),
        syncStatus: 'pending'
      }

      await db.categorias.update(categoria.id, dadosAtualizados)
      onSalvo({ ...categoria, ...dadosAtualizados })
      return
    }

    await db.categorias.add({
      ...criarRegistroBase(),
      nome: nome.trim(),
      icone,
      cor,
      tipo
    })

    onSalvo()
  }

  return (
    <CardPremium className="space-y-4">
      <div>
        <h2 className="text-lg font-black text-[#F4FFF8]">
          {categoria ? 'Editar categoria' : 'Nova categoria'}
        </h2>
        <p className="text-sm text-[#91A99C]">
          Escolha nome, ícone, cor e tipo da categoria.
        </p>
      </div>

      <CampoTexto
        label="Nome"
        value={nome}
        onChange={setNome}
        placeholder="Ex: Alimentação"
      />

      <div>
        <p className="mb-2 text-xs font-semibold text-[#91A99C]">Ícone</p>

        <div className="max-h-[228px] overflow-y-auto rounded-3xl border border-[#1C2A24] bg-[#030504]/55 p-2">
          <div className="grid grid-cols-5 gap-2">
            {OPCOES_ICONES_CATEGORIA.map((opcao) => (
              <button
                key={opcao.valor}
                onClick={() => setIcone(opcao.valor)}
                className={`
                  flex h-12 items-center justify-center rounded-2xl border transition
                  ${
                    icone === opcao.valor
                      ? 'border-[#3AF2A1] bg-[#3AF2A1]/10'
                      : 'border-[#1C2A24] bg-[#030504]'
                  }
                `}
                title={opcao.label}
              >
                <IconeCategoria
                  icone={opcao.valor}
                  cor={cor}
                  tamanho="sm"
                  ativo={icone === opcao.valor}
                />
              </button>
            ))}
          </div>
        </div>

        <p className="mt-2 text-[11px] text-[#587367]">
          Role dentro da área para ver mais opções de ícones.
        </p>
      </div>

      <div>
        <p className="mb-2 text-xs font-semibold text-[#91A99C]">Cor</p>

        <div className="max-h-[154px] overflow-y-auto rounded-3xl border border-[#1C2A24] bg-[#030504]/55 p-2">
          <div className="grid grid-cols-5 gap-2">
            {CORES_PADRAO.map((item) => (
              <button
                key={item}
                onClick={() => setCor(item)}
                className={`
                  h-11 rounded-2xl border shadow-[inset_0_1px_0_rgba(255,255,255,0.22)]
                  ${cor === item ? 'border-white' : 'border-[#1C2A24]'}
                `}
                style={{ backgroundColor: item }}
              />
            ))}
          </div>
        </div>

        <p className="mt-2 text-[11px] text-[#587367]">
          Role dentro da área para navegar pela paleta completa.
        </p>
      </div>

      <FiltroSegmentado
        valor={tipo}
        onChange={setTipo}
        opcoes={[
          { valor: 'despesa', label: 'Despesa' },
          { valor: 'receita', label: 'Receita' },
          { valor: 'ambos', label: 'Ambos' }
        ]}
      />

      <div className="grid grid-cols-2 gap-3">
        <Botao variante="fantasma" onClick={onCancelar}>
          Cancelar
        </Botao>

        <Botao onClick={salvar}>
          Salvar
        </Botao>
      </div>
    </CardPremium>
  )
}

function DetalheCategoria({ categoria, subcategorias, onVoltar, onAtualizarCategoria }) {
  const [editando, setEditando] = useState(false)
  const [nomeSubcategoria, setNomeSubcategoria] = useState('')

  const criarSubcategoria = async () => {
    if (!nomeSubcategoria.trim()) {
      alert('Informe o nome da subcategoria.')
      return
    }

    await db.subcategorias.add({
      ...criarRegistroBase(),
      nome: nomeSubcategoria.trim(),
      categoriaId: categoria.id
    })

    setNomeSubcategoria('')
  }

  const excluirCategoria = async () => {
    const confirmar = confirm(`Excluir a categoria "${categoria.nome}"?`)

    if (!confirmar) return

    await softDelete('categorias', categoria.id)
    onVoltar()
  }

  const excluirSubcategoria = async (subcategoria) => {
    const confirmar = confirm(`Excluir a subcategoria "${subcategoria.nome}"?`)

    if (!confirmar) return

    await softDelete('subcategorias', subcategoria.id)
  }

  return (
    <div className="space-y-4 pb-24">
      <button
        onClick={onVoltar}
        className="mb-1 flex items-center gap-2 text-sm font-black text-[#91A99C]"
      >
        <ArrowLeft size={18} />
        Voltar
      </button>

      <CardPremium>
        <div className="mb-4 flex items-center gap-4">
          <IconeCategoria
            icone={categoria.icone}
            cor={categoria.cor}
            tamanho="lg"
            ativo
          />

          <div className="min-w-0 flex-1">
            <p className="truncate text-xl font-black text-[#F4FFF8]">
              {categoria.nome}
            </p>
            <p className="mt-1 text-sm capitalize text-[#91A99C]">
              {categoria.tipo} · {subcategorias.length} subcategorias
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Botao variante="secundario" onClick={() => setEditando((atual) => !atual)}>
            <span className="inline-flex items-center justify-center gap-2">
              <Edit3 size={16} />
              Editar
            </span>
          </Botao>

          <Botao variante="perigo" onClick={excluirCategoria}>
            <span className="inline-flex items-center justify-center gap-2">
              <Trash2 size={16} />
              Excluir
            </span>
          </Botao>
        </div>
      </CardPremium>

      {editando && (
        <FormularioCategoria
          categoria={categoria}
          onCancelar={() => setEditando(false)}
          onSalvo={(categoriaAtualizada) => {
            onAtualizarCategoria(categoriaAtualizada)
            setEditando(false)
          }}
        />
      )}

      <CardPremium className="space-y-3">
        <div>
          <h2 className="text-lg font-black text-[#F4FFF8]">Subcategorias</h2>
          <p className="text-sm text-[#91A99C]">
            Crie divisões internas para melhorar filtros e relatórios.
          </p>
        </div>

        <CampoTexto
          label="Nova subcategoria"
          value={nomeSubcategoria}
          onChange={setNomeSubcategoria}
          placeholder="Ex: Restaurantes"
        />

        <Botao onClick={criarSubcategoria}>
          Adicionar subcategoria
        </Botao>
      </CardPremium>

      <section className="space-y-3">
        {subcategorias.map((subcategoria) => (
          <CardPremium
            key={subcategoria.id}
            className="flex items-center justify-between gap-3"
          >
            <div>
              <p className="font-black text-[#F4FFF8]">{subcategoria.nome}</p>
              <p className="text-xs text-[#91A99C]">Herdando cor da categoria</p>
            </div>

            <button
              onClick={() => excluirSubcategoria(subcategoria)}
              className="flex h-10 w-10 items-center justify-center rounded-2xl border border-red-900/60 bg-red-950/40 text-red-300"
            >
              <Trash2 size={16} />
            </button>
          </CardPremium>
        ))}

        {subcategorias.length === 0 && (
          <CardPremium>
            <p className="text-sm text-[#91A99C]">
              Nenhuma subcategoria cadastrada ainda.
            </p>
          </CardPremium>
        )}
      </section>
    </div>
  )
}