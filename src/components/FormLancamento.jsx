import { useState } from 'react'
import { db, criarRegistroBase, agora } from '../db/database'

export function FormLancamento({ onSalvo }) {
  const [form, setForm] = useState({
    tipo: 'despesa',
    usuarioId: null,
    descricao: '',
    valor: '',
    dataCompetencia: agora(),
    metodoPagamento: 'pix',
    categoriaId: null,
    status: 'pendente',
    recorrente: false
  })

  const atualizar = (campo, valor) => {
    setForm((prev) => ({ ...prev, [campo]: valor }))
  }

  const salvar = async () => {
    if (!form.descricao || !form.valor) {
      alert('Preencha os campos obrigatórios')
      return
    }

    await db.lancamentos.add({
      ...criarRegistroBase(),
      ...form,
      valor: Number(form.valor),
      dataPagamento: null,
      cartaoId: null,
      faturaRef: null,
      subcategoriaId: null,
      observacoes: '',
      parcelaAtual: null,
      totalParcelas: null,
      parcelamentoId: null,
      recorrenciaId: null
    })

    setForm({
      ...form,
      descricao: '',
      valor: ''
    })

    if (onSalvo) onSalvo()
  }

  return (
    <div className="p-4 bg-gray-900 rounded-lg space-y-3">
      <h2 className="text-lg">Novo lançamento</h2>

      <input
        placeholder="Descrição"
        value={form.descricao}
        onChange={(e) => atualizar('descricao', e.target.value)}
        className="w-full p-2 bg-black border border-gray-700 rounded"
      />

      <input
        placeholder="Valor"
        type="number"
        value={form.valor}
        onChange={(e) => atualizar('valor', e.target.value)}
        className="w-full p-2 bg-black border border-gray-700 rounded"
      />

      <select
        value={form.tipo}
        onChange={(e) => atualizar('tipo', e.target.value)}
        className="w-full p-2 bg-black border border-gray-700 rounded"
      >
        <option value="despesa">Despesa</option>
        <option value="receita">Receita</option>
      </select>

      <select
        value={form.metodoPagamento}
        onChange={(e) => atualizar('metodoPagamento', e.target.value)}
        className="w-full p-2 bg-black border border-gray-700 rounded"
      >
        <option value="pix">PIX</option>
        <option value="dinheiro">Dinheiro</option>
        <option value="cartao">Cartão</option>
      </select>

      <button
        onClick={salvar}
        className="w-full bg-blue-500 p-3 rounded-lg"
      >
        Salvar
      </button>
    </div>
  )
}