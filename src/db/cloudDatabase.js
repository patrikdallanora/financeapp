import Dexie from 'dexie'
import {createOutboxFacade,SYNC_STORES} from '../sync/localOutbox.js'
export function createCloudDatabase(name='FinanceAppSupabaseDB'){
 const raw=new Dexie(name)
 raw.version(1).stores({
  usuarios:'++id,&uuid,nome,createdAt,updatedAt,deletedAt,syncStatus',
  cartoes:'++id,&uuid,nome,ativo,updatedAt,deletedAt,syncStatus',
  categorias:'++id,&uuid,nome,tipo,updatedAt,deletedAt,syncStatus',
  subcategorias:'++id,&uuid,nome,categoriaId,categoriaUuid,updatedAt,deletedAt,syncStatus',
  lancamentos:'++id,&uuid,tipo,usuarioId,usuarioUuid,dataCompetencia,dataPagamento,metodoPagamento,cartaoId,cartaoUuid,faturaRef,categoriaId,categoriaUuid,subcategoriaId,subcategoriaUuid,status,recorrente,recorrenciaId,parcelamentoId,updatedAt,deletedAt,syncStatus,beneficiario',
  faturas:'++id,&uuid,cartaoId,cartaoUuid,faturaRef,status,updatedAt,syncStatus',
  metas:'++id,&uuid,nome,tipo,periodoTipo,mesReferencia,anoReferencia,dataInicio,dataFim,categoriaId,subcategoriaId,valorAlvo,mostrarNoDashboard,ativa,updatedAt,deletedAt,syncStatus',
  syncLog:'++id,tabela,uuid,action,timestamp,deviceId,resolved',
  ...SYNC_STORES
 })
 return {raw,...createOutboxFacade(raw)}
}
export const cloudDatabase=createCloudDatabase()
