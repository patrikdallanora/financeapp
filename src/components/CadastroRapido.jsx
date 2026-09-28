import { useRef, useState } from 'react'
import { db, criarRegistroBase } from '../db/database'
import { agendarSync } from '../sync/syncManager'

const normalizar = texto => texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase()
const cores = [{nome:'Verde',valor:'#3AF2A1'}, {nome:'Azul',valor:'#7AAFF5'}, {nome:'Lilás',valor:'#C59CF5'}, {nome:'Laranja',valor:'#EFAC71'}]

export function CadastroRapido({ categoria, tipo, onCancelar, onSalvo }) {
  const [nome, setNome] = useState('')
  const [cor, setCor] = useState(cores[0].valor)
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)
  const trava = useRef(false)
  const salvar = async () => {
    if (trava.current) return
    if (!nome.trim()) { setErro('Informe um nome.'); return }
    trava.current = true
    setSalvando(true)
    setErro('')
    try {
      const tabela = categoria ? db.subcategorias : db.categorias
      const id = await db.transaction('rw', tabela, db.categorias, async () => {
        if (categoria) {
          const pai = await db.categorias.get(categoria.id)
          if (!pai || pai.deletedAt) throw new Error('A categoria não está mais disponível. Selecione outra.')
        }
        const registros = await tabela.toArray()
        const duplicado = registros.some(item => !item.deletedAt && normalizar(item.nome || '') === normalizar(nome) && (categoria ? item.categoriaUuid === categoria.uuid || Number(item.categoriaId) === categoria.id : item.tipo === tipo || item.tipo === 'ambos'))
        if (duplicado) throw new Error(categoria ? 'Já existe uma subcategoria com esse nome nesta categoria.' : 'Já existe uma categoria com esse nome.')
        return tabela.add({ ...criarRegistroBase(), nome: nome.trim(), ...(categoria ? {categoriaId:categoria.id, categoriaUuid:categoria.uuid} : {tipo, cor, icone:'package'}) })
      })
      agendarSync()
      onSalvo(id)
    } catch (e) {
      setErro(e.name === 'Error' ? e.message : 'Não foi possível criar. Tente novamente.')
    } finally {
      trava.current = false
      setSalvando(false)
    }
  }
  return <section className="ln-editor" aria-label={`Cadastro rápido de ${categoria ? 'subcategoria' : 'categoria'}`}>
    <h3>Nova {categoria ? 'subcategoria' : 'categoria'}</h3>
    {categoria && <p className="ln-ajuda">Dentro de {categoria.nome}</p>}
    <label><span className="ln-label">Nome da {categoria ? 'subcategoria' : 'categoria'}</span><input autoFocus maxLength={60} value={nome} onChange={e => setNome(e.target.value)} onKeyDown={e => {if(e.key === 'Enter') {e.preventDefault(); salvar()} if(e.key === 'Escape') onCancelar()}} /></label>
    {!categoria && <div className="ln-cores" aria-label="Cor da categoria">{cores.map(c => <button key={c.valor} aria-label={c.nome} aria-pressed={cor === c.valor} onClick={() => setCor(c.valor)} style={{'--cor':c.valor}}><span /></button>)}</div>}
    {erro && <p role="alert" className="ln-erro">{erro}</p>}
    <div className="ln-opcoes"><button disabled={salvando} onClick={onCancelar}>Cancelar</button><button disabled={salvando} className="ln-criar" onClick={salvar}>{salvando ? 'Criando…' : 'Criar e selecionar'}</button></div>
  </section>
}
