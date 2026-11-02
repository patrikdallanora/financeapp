import {MIGRATION_CAPTURE_MODE,MIGRATION_MESSAGE} from '../../lib/migrationMode.js'
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store')
 if(MIGRATION_CAPTURE_MODE)return res.status(200).json({sucesso:true,notificou:false,pausado:true,motivo:MIGRATION_MESSAGE})
 return res.status(410).json({erro:'Use o teste local nas configurações do aplicativo.'})
}
