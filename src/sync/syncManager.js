import {MIGRATION_CAPTURE_MODE} from '../../lib/migrationMode.js'
import * as legacy from './legacySyncManager.js'
import * as cloud from './cloudSyncManager.js'
const backend=MIGRATION_CAPTURE_MODE?legacy:cloud
export const obterStatusSync=(...args)=>backend.obterStatusSync(...args)
export const pushSync=(...args)=>backend.pushSync(...args)
export const pullSync=(...args)=>backend.pullSync(...args)
export const pullBatchSync=(...args)=>backend.pullBatchSync(...args)
export const executarPullInicial=(...args)=>backend.executarPullInicial(...args)
export const executarSync=(...args)=>backend.executarSync(...args)
export const agendarSync=(...args)=>backend.agendarSync(...args)
export const restaurarBaseLocalDoSheets=(...args)=>backend.restaurarBaseLocalDoSheets(...args)
export const iniciarAutoSync=(...args)=>backend.iniciarAutoSync(...args)
export const pararAutoSync=(...args)=>backend.pararAutoSync(...args)
export const contarPendenciasSync=(...args)=>backend.contarPendenciasSync(...args)
export const conferirPagamentosServidor=(...args)=>backend.conferirPagamentosServidor(...args)
export const reenviarPagamentoConferido=(...args)=>backend.reenviarPagamentoConferido(...args)
