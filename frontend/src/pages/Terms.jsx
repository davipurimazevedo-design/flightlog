import LegalPage, { LegalSection } from '../components/LegalPage'

const CONTACT = 'davipurimazevedo@gmail.com'

export default function Terms() {
  return (
    <LegalPage title="Termos de Uso" updated="04/07/2026">
      <p className="text-slate-400">
        Ao criar uma conta e usar o <strong className="text-slate-300">FlightLog</strong>, você concorda com estes termos.
        Leia com atenção.
      </p>

      <LegalSection title="1. O que é o FlightLog">
        <p>
          O FlightLog é uma ferramenta pessoal para registro e acompanhamento de horas de voo (diário de bordo digital).
          Ele é um <strong className="text-slate-300">auxílio</strong> e <strong className="text-slate-300">não substitui</strong> o
          diário de bordo oficial nem qualquer documentação exigida por órgãos reguladores (ex.: ANAC/DECEA).
        </p>
      </LegalSection>

      <LegalSection title="2. Sua conta">
        <p>
          Novas contas passam por aprovação antes da liberação. Você é responsável por manter suas credenciais
          seguras e por toda atividade feita na sua conta.
        </p>
      </LegalSection>

      <LegalSection title="3. Responsabilidade pelos dados">
        <p>
          Os dados que você registra são de sua responsabilidade. Confira sempre a exatidão das informações —
          o FlightLog não se responsabiliza por decisões tomadas com base em registros incorretos ou incompletos.
        </p>
      </LegalSection>

      <LegalSection title="4. Uso aceitável">
        <p>
          Você concorda em não usar o serviço para fins ilícitos, não tentar acessar dados de outros usuários e
          não sobrecarregar a infraestrutura de forma abusiva.
        </p>
      </LegalSection>

      <LegalSection title="5. Disponibilidade e garantias">
        <p>
          O serviço é fornecido "no estado em que se encontra", sem garantias de disponibilidade ininterrupta.
          Podemos alterar, suspender ou descontinuar funcionalidades. Fazemos o possível para evitar perda de dados,
          mas recomendamos exportar seus dados periodicamente (Configurações → Privacidade &amp; Dados).
        </p>
      </LegalSection>

      <LegalSection title="6. Encerramento">
        <p>
          Você pode excluir sua conta a qualquer momento pelo próprio app. Podemos suspender contas que violem
          estes termos.
        </p>
      </LegalSection>

      <LegalSection title="7. Contato">
        <p>
          Dúvidas sobre estes termos? Escreva para <a href={`mailto:${CONTACT}`} className="text-blue-400 hover:underline">{CONTACT}</a>.
        </p>
      </LegalSection>
    </LegalPage>
  )
}
