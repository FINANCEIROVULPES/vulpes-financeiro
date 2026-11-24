/* Configuração da versão web (Vercel + Supabase).
 * A chave abaixo é a chave PÚBLICA do Supabase (publishable): ela pode ficar no site.
 * Quem protege os dados são as regras de segurança (RLS) do banco: sem login de sócia, nada é lido nem gravado.
 * Nunca coloque aqui a chave secreta (service_role / sb_secret_...). */
(function (V) {
  'use strict';
  V.config = {
    supabaseUrl: 'https://xrhrzpikyxvgjzpiryku.supabase.co',
    supabaseKey: 'sb_publishable_ZXFVQask5H10s7xDQTuJ5g_YO23URXn',
  };
})(window.Vulpes = window.Vulpes || {});
