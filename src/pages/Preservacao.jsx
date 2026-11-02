import { useEffect, useState } from 'react'
import { deviceBackup, prepareBackupFile, saveBackupFile, repairCategoriesOnDevice } from '../backup/browserBackup.js'
import CloudMigrationPanel from '../components/CloudMigrationPanel.jsx'

export default function Preservacao() {
  const [initial, setInitial] = useState(null)
  const [label, setLabel] = useState('')
  const [prepared, setPrepared] = useState(null)
  const [busy, setBusy] = useState(true)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [repair, setRepair] = useState(null)
  const [repairing, setRepairing] = useState(false)
  const [repairError, setRepairError] = useState('')

  async function runRepair() {
    setRepairing(true); setRepairError('')
    try { setRepair(await repairCategoriesOnDevice()) }
    catch (err) { setRepairError(err.message) }
    finally { setRepairing(false) }
  }

  useEffect(() => { runRepair() }, [])

  useEffect(() => {
    let active = true
    deviceBackup.ensureInitial().then(value => { if (active) setInitial(value) })
      .catch(err => { if (active) setError(err.message) })
      .finally(() => { if (active) setBusy(false) })
    return () => { active = false }
  }, [])

  async function prepare() {
    setBusy(true); setError(''); setPrepared(null); setMessage('')
    try {
      const backup = await deviceBackup.capture({ label })
      setPrepared({ backup, file: prepareBackupFile(backup, label) })
    } catch (err) { setError(err.message) }
    finally { setBusy(false) }
  }

  async function save(file, share) {
    setError('')
    try {
      const method = await saveBackupFile(file, { share })
      setMessage(method === 'shared'
        ? 'Compartilhamento concluído. Confira o arquivo no app Arquivos e envie o JSON nesta conversa para verificação.'
        : 'Download solicitado. Confira o arquivo no app Arquivos e envie o JSON nesta conversa para verificação.')
    } catch (err) {
      setError(err.name === 'AbortError' ? 'Compartilhamento cancelado. A cópia local continua preservada.' : err.message)
    }
  }

  const button = 'w-full min-h-[48px] rounded-2xl border border-[#3AF2A1]/40 px-4 py-3 font-bold text-[#3AF2A1] disabled:opacity-40'
  return <main className="mx-auto min-h-screen max-w-lg space-y-5 bg-black px-5 py-8 text-white">
    <p className="text-sm font-bold text-[#3AF2A1]">FinanceApp · Preservação 3</p>
    <h1 className="text-2xl font-bold">Conferência da migração</h1>
    <p className="text-sm leading-6 text-[#C7D2CC]">A sincronização e as edições estão pausadas para preservar as diferenças entre os dois aparelhos. Seus dados continuam neste iPhone.</p>
    <p className="text-sm leading-6 text-[#C7D2CC]">Não reinstale o app, não limpe os dados do Safari e não use restauração. Faça este procedimento também no outro iPhone.</p>
    <CloudMigrationPanel />
    <details className="space-y-5"><summary className="min-h-[44px] cursor-pointer py-3 font-bold">Backups originais e correção local</summary>
    <section className="space-y-2 rounded-2xl border border-[#1C3D2E] p-4">
      <h2 className="font-bold">Correção das categorias</h2>
      {repairing && <p role="status" className="text-sm">Salvando backup e corrigindo os vínculos das categorias…</p>}
      {repair && <p role="status" className="text-sm text-[#3AF2A1]">Correção aplicada neste aparelho: {repair.repairedLaunches} vínculos de lançamentos ajustados e {repair.addedCategories} categorias recuperadas. Valores e pagamentos preservados. A sincronização continua pausada.{repair.pending ? ` ${repair.pending} vínculo(s) ainda em revisão.` : ''}</p>}
      {repair && !repair.afterBackupSaved && <p role="alert" className="text-sm text-amber-300">A correção foi aplicada e a cópia anterior está preservada. Prepare uma cópia atual para guardar também o resultado.</p>}
      {repairError && <><p role="alert" className="text-sm text-amber-300">{repairError}</p><button className={button} disabled={repairing} onClick={runRepair}>Tentar correção novamente</button></>}
    </section>
    {busy && <p role="status">Preparando cópia local…</p>}
    {error && <p role="alert" className="rounded-xl border border-red-800 p-3 text-sm text-red-300">{error}</p>}
    {initial && <section className="space-y-3 rounded-2xl border border-[#1C3D2E] p-4">
      <h2 className="font-bold">Cópia inicial preservada</h2>
      <p className="text-sm text-[#C7D2CC]">Salva neste aparelho antes da nova sincronização. Ainda é necessário guardar os arquivos fora do app.</p>
      <p className="text-xs text-[#91A99C]">Aparelho: {initial.snapshot.source.deviceId.slice(0, 8)} · {initial.snapshot.counts.lancamentos || 0} lançamentos · {initial.snapshot.counts.categorias || 0} categorias</p>
      {!initial.snapshot.counts.lancamentos && <p role="alert" className="text-sm text-amber-300">Nenhum lançamento encontrado nesta instalação. Confirme que abriu pelo mesmo ícone usado anteriormente. Não considere este arquivo uma cópia dos dados do outro navegador ou aparelho.</p>}
      <button className={button} disabled={busy || !label} onClick={() => save(prepareBackupFile(initial, `${label}-inicial`), true)}>Salvar cópia inicial</button>
    </section>}
    <label className="block space-y-2 text-sm font-bold">Qual é este aparelho?
      <select aria-label="Qual é este aparelho?" className="min-h-[48px] w-full rounded-xl border border-[#1C3D2E] bg-[#07140D] px-3" value={label} onChange={e => { setLabel(e.target.value); setPrepared(null) }}>
        <option value="">Selecione</option><option value="iphone-15-pro">iPhone 15 Pro</option><option value="iphone-16-pro">iPhone 16 Pro</option>
      </select>
    </label>
    <ol className="list-inside list-decimal space-y-2 text-sm leading-6 text-[#C7D2CC]">
      <li>Selecione este iPhone e salve a cópia inicial acima.</li>
      <li>Prepare e salve também uma cópia atual abaixo.</li>
      <li>Na folha de compartilhamento, escolha Salvar em Arquivos.</li>
      <li>Confirme que os arquivos aparecem no app Arquivos e anexe os JSONs nesta conversa.</li>
    </ol>
    <button className={button} disabled={busy || repairing || !initial || !label} onClick={prepare}>Preparar cópia atual</button>
    {prepared && <section className="space-y-3 rounded-2xl border border-[#1C3D2E] p-4">
      <p className="text-sm">Cópia atual pronta · {prepared.backup.snapshot.counts.lancamentos || 0} lançamentos</p>
      <button className={button} onClick={() => save(prepared.file, true)}>Salvar cópia atual</button>
      <button className={button} onClick={() => save(prepared.file, false)}>Baixar arquivo JSON</button>
    </section>}
    {message && <p role="status" className="text-sm leading-6 text-[#3AF2A1]">{message}</p>}
    <p className="text-xs leading-5 text-[#91A99C]">Os arquivos contêm seus dados financeiros. Guarde-os em local privado. O app não envia o backup automaticamente. Salvar um arquivo não retoma a sincronização.</p>
    </details>
  </main>
}
