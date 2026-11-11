export type AccessArea = 'participant' | 'organization';

export function accountDestination(role: 'PARTICIPANT' | 'ORGANIZER') {
  return role === 'ORGANIZER' ? '/organizacao/eventos' : '/eventos';
}

export const accessAreas = {
  participant: {
    label: 'Participante',
    login: '/participante/login',
    register: '/participante/cadastro',
    destination: '/eventos',
    other: 'organization' as const,
    eyebrow: 'SUA JORNADA COMEÇA AQUI',
    title: 'Acesse sua conta de participante',
    description: 'Entre para gerenciar seu perfil e acompanhar as próximas experiências do EventHub.',
    hero: 'Conhecimento, encontros e novas possibilidades.',
    heroDescription: 'Seu espaço para participar de eventos acadêmicos e profissionais e se conectar com novas ideias.',
    registerTitle: 'Cadastro de participante',
    registerDescription: 'Crie sua conta pessoal para participar do EventHub.',
  },
  organization: {
    label: 'Organização',
    login: '/organizacao/login',
    register: '/organizacao/cadastro',
    destination: '/organizacao/eventos',
    other: 'participant' as const,
    eyebrow: 'ESPAÇO DA ORGANIZAÇÃO',
    title: 'Acesse sua organização',
    description: 'Entre com o e-mail e a senha da sua conta de responsável ou organizador.',
    hero: 'Reúna sua equipe. Prepare grandes encontros.',
    heroDescription: 'Um espaço dedicado às organizações e às pessoas que tornam os eventos possíveis.',
    registerTitle: 'Cadastro do responsável',
    registerDescription: 'Crie sua conta de organizador vinculada a uma única instituição.',
  },
};
