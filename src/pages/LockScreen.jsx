import { useEffect, useRef, useState } from 'react'
import { Fingerprint, LockKeyhole, ShieldCheck } from 'lucide-react'

import { Botao } from '../components/Botao'

export default function LockScreen({
  autenticarBiometria,
  autenticarPIN,
  authError,
  biometriaDisponivel
}) {
  const [pin, setPin] = useState('')
  const [modoPin, setModoPin] = useState(false)
  const [tentandoBiometria, setTentandoBiometria] = useState(false)
  const tentouAutomaticamente = useRef(false)

  useEffect(() => {
    const tentarAutomaticamente = async () => {
      if (tentouAutomaticamente.current) return
      tentouAutomaticamente.current = true

      if (!biometriaDisponivel) {
        setModoPin(true)
        return
      }

      setTentandoBiometria(true)

      const sucesso = await autenticarBiometria()

      setTentandoBiometria(false)

      if (!sucesso) {
        setModoPin(true)
      }
    }

    tentarAutomaticamente()
  }, [biometriaDisponivel, autenticarBiometria])

  const tentarBiometriaNovamente = async () => {
    setTentandoBiometria(true)

    const sucesso = await autenticarBiometria()

    setTentandoBiometria(false)

    if (!sucesso) {
      setModoPin(true)
    }
  }

  const entrarComPin = () => {
    autenticarPIN(pin)
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#030504] px-6 text-white">
      <div className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-[#0F9D58]/20 blur-3xl" />
      <div className="absolute -bottom-24 -left-24 h-72 w-72 rounded-full bg-[#3AF2A1]/10 blur-3xl" />

      <div className="relative w-full max-w-sm">
        <div className="mb-8 flex justify-center">
          <div className="relative flex h-24 w-24 items-center justify-center rounded-[32px] border border-[#3AF2A1]/20 bg-gradient-to-br from-[#07100B] to-[#101D16] shadow-[0_0_42px_rgba(58,242,161,0.18)]">
            <div className="absolute inset-0 rounded-[32px] bg-[#3AF2A1]/5" />

            {modoPin ? (
              <LockKeyhole size={38} className="relative text-[#3AF2A1]" />
            ) : tentandoBiometria ? (
              <Fingerprint size={42} className="relative animate-pulse text-[#3AF2A1]" />
            ) : (
              <ShieldCheck size={40} className="relative text-[#3AF2A1]" />
            )}
          </div>
        </div>

        <div className="card-premium rounded-[32px] p-6 text-center">
          <p className="mb-2 text-xs font-black uppercase tracking-[0.26em] text-[#3AF2A1]">
            FinanceApp
          </p>

          <h1 className="texto-metalico-verde text-3xl font-black tracking-tight">
            Acesso seguro
          </h1>

          <p className="mx-auto mt-3 max-w-[270px] text-sm leading-5 text-[#91A99C]">
            {modoPin
              ? 'Use seu PIN para continuar.'
              : tentandoBiometria
                ? 'Verificando seu dispositivo com segurança.'
                : 'Protegendo suas finanças com autenticação moderna.'}
          </p>

          {!modoPin && (
            <div className="mt-6 rounded-3xl border border-[#1C2A24] bg-[#030504]/70 p-4">
              <div className="flex items-center justify-center gap-2 text-sm font-black text-[#F4FFF8]">
                <Fingerprint size={18} className="text-[#3AF2A1]" />
                {tentandoBiometria ? 'Autenticando...' : 'Biometria pronta'}
              </div>

              <p className="mt-2 text-xs leading-5 text-[#587367]">
                Face ID, Touch ID ou autenticação local do dispositivo.
              </p>
            </div>
          )}

          {modoPin && (
            <div className="mt-6 space-y-4 text-left">
              <label className="block">
                <span className="mb-2 block text-xs font-semibold text-[#91A99C]">
                  PIN de acesso
                </span>

                <input
                  type="password"
                  inputMode="numeric"
                  value={pin}
                  maxLength={6}
                  placeholder="Digite seu PIN"
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') entrarComPin()
                  }}
                  className="min-h-[52px] w-full rounded-2xl border border-[#1C2A24] bg-[#030504] px-4 py-3 text-center text-lg font-black tracking-[0.35em] text-[#F4FFF8] outline-none placeholder:text-sm placeholder:tracking-normal placeholder:text-[#587367] focus:border-[#3AF2A1] focus:ring-2 focus:ring-[#3AF2A1]/10"
                />
              </label>

              <Botao onClick={entrarComPin}>
                Entrar
              </Botao>

              {biometriaDisponivel && (
                <Botao variante="fantasma" onClick={tentarBiometriaNovamente}>
                  Tentar biometria novamente
                </Botao>
              )}
            </div>
          )}

          {authError && (
            <div className="mt-5 rounded-2xl border border-red-900/50 bg-red-950/30 p-3 text-sm font-semibold text-red-300">
              {authError}
            </div>
          )}

          <p className="mt-6 text-[11px] leading-5 text-[#587367]">
            Sessão protegida por até 8 horas neste dispositivo.
          </p>
        </div>
      </div>
    </div>
  )
}