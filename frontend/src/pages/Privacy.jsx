import LegalPage, { LegalSection } from '../components/LegalPage'
import { CONTACT_EMAIL as CONTACT } from '../lib/constants'

export default function Privacy() {
  return (
    <LegalPage title="Política de Privacidade" updated="04/07/2026">
      <p className="text-slate-400">
        Esta política explica como o <strong className="text-slate-300">FlightLog</strong> trata seus dados
        pessoais, em conformidade com a Lei Geral de Proteção de Dados (LGPD – Lei nº 13.709/2018).
      </p>

      <LegalSection title="1. Quem é o responsável">
        <p>
          O FlightLog é operado de forma independente. Para questões sobre seus dados, fale com o
          responsável pelo tratamento em <a href={`mailto:${CONTACT}`} className="text-blue-400 hover:underline">{CONTACT}</a>.
        </p>
      </LegalSection>

      <LegalSection title="2. Dados que coletamos">
        <p>Coletamos apenas o necessário para o app funcionar:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li><strong className="text-slate-300">Conta:</strong> seu e-mail (autenticação via Supabase) e, opcionalmente, seu nome.</li>
          <li><strong className="text-slate-300">Seu logbook:</strong> os voos e aeronaves que você registra (datas, horários, aeroportos, matrículas, observações e horas anteriores).</li>
          <li><strong className="text-slate-300">Técnicos:</strong> registros mínimos de acesso para segurança e funcionamento.</li>
        </ul>
        <p>Não coletamos dados sensíveis nem localização em tempo real.</p>
      </LegalSection>

      <LegalSection title="3. Como usamos seus dados">
        <p>
          Usamos seus dados exclusivamente para exibir seu diário de bordo, estatísticas e mapa de rotas.
          Cada usuário só enxerga os próprios dados — há isolamento por conta.
          Não vendemos nem compartilhamos seus dados para fins de marketing.
        </p>
      </LegalSection>

      <LegalSection title="4. Onde seus dados ficam">
        <p>
          Os dados são armazenados no <strong className="text-slate-300">Supabase</strong> (banco PostgreSQL) e servidos
          pela API no <strong className="text-slate-300">Render</strong>, com o front-end na <strong className="text-slate-300">Vercel</strong>.
          A busca de aeroportos usa a base pública do <strong className="text-slate-300">GeoAISWEB/DECEA</strong> —
          nenhum dado pessoal seu é enviado a terceiros nessa consulta.
        </p>
      </LegalSection>

      <LegalSection title="5. Seus direitos (LGPD)">
        <p>Você pode, a qualquer momento e diretamente no app (em <strong className="text-slate-300">Configurações → Privacidade &amp; Dados</strong>):</p>
        <ul className="list-disc pl-5 space-y-1">
          <li><strong className="text-slate-300">Acessar e exportar</strong> uma cópia completa dos seus dados em JSON;</li>
          <li><strong className="text-slate-300">Excluir sua conta</strong> e todos os dados associados, de forma permanente.</li>
        </ul>
        <p>Você também pode corrigir suas informações ou solicitar esclarecimentos pelo e-mail de contato.</p>
      </LegalSection>

      <LegalSection title="6. Segurança">
        <p>
          O acesso é protegido por autenticação (tokens JWT), todo o tráfego usa HTTPS e os dados são
          isolados por usuário. Ainda assim, nenhum sistema é 100% infalível — mantenha sua senha em segurança.
        </p>
      </LegalSection>

      <LegalSection title="7. Retenção e exclusão">
        <p>
          Mantemos seus dados enquanto sua conta existir. Ao excluir a conta, os dados são removidos do
          nosso banco e da autenticação. Backups eventuais são rotacionados periodicamente.
        </p>
      </LegalSection>

      <LegalSection title="8. Alterações">
        <p>
          Podemos atualizar esta política. Mudanças relevantes serão indicadas pela data de
          "última atualização" no topo desta página.
        </p>
      </LegalSection>
    </LegalPage>
  )
}
