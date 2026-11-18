import db from './db.js';

// Limpa as tabelas (seed determinístico) e insere dados de exemplo.
db.exec('DELETE FROM interactions; DELETE FROM opportunities; DELETE FROM businesses; DELETE FROM templates;');

const insertBusiness = db.prepare(
  `INSERT INTO businesses (name, category, city, address, phone, email, instagram, has_website, website_url, source)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'seed')`
);

const businessIds: number[] = [];

const businesses = [
  ['Padaria do Zé', 'Alimentação', 'São Paulo', 'Rua das Flores, 120', '11987650001', 'contato@padariadoze.com', '@padariadoze', 0, null],
  ['Barbearia Central', 'Beleza', 'São Paulo', 'Av. Central, 455', '11987650002', null, '@barbeariacentral', 0, null],
  ['Pet Shop Amigo Fiel', 'Pets', 'Guarulhos', 'Rua dos Ipês, 78', '11998880001', 'amigofiel@pets.com.br', null, 1, 'https://amigofiel.com.br'],
  ['Studio de Unhas Bruna', 'Beleza', 'Osasco', 'Rua Aurora, 302', '11991110004', null, '@studiobruna', 0, null],
  ['Auto Elétrica Silva', 'Automotivo', 'São Paulo', 'Av. dos Trabalhadores, 1089', '11992220005', null, null, 0, null],
  ['Farmácia Bem Estar', 'Saúde', 'São Paulo', 'Rua São Caetano, 51', '11993330006', 'bemestar@farmacia.com.br', null, 1, 'https://bemestar.farm.br'],
];

for (const b of businesses) {
  const result = insertBusiness.run(...b);
  businessIds.push(Number(result.lastInsertRowid));
}

const insertTemplate = db.prepare(
  `INSERT INTO templates (name, channel, content) VALUES (?, ?, ?)`
);

insertTemplate.run(
  'Primeiro contato (WhatsApp)',
  'whatsapp',
  [
    'Olá, tudo bem? Falo com o(a) responsável pela {{negocio}}?',
    '',
    'Pesquisei empresas de {{categoria}} aqui em {{cidade}} e percebi que vocês ainda não têm um site — isso significa que clientes que buscam na internet estão indo para o concorrente.',
    '',
    'Eu crio sites profissionais que aparecem no Google e recebem pedidos direto no WhatsApp. Queria te mostrar como ficaria o site da {{negocio}} (de graça, sem compromisso).',
    'Posso te mandar um exemplo nos próximos dias?',
  ].join('\n')
);

insertTemplate.run(
  'Follow-up com proposta de valor',
  'whatsapp',
  [
    'Oi! Passando para lembrar da proposta do {{servico}} para a {{negocio}} 🙌',
    '',
    'Com um site, vocês aparecem quando alguém busca por {{categoria}} em {{cidade}} e os clientes falam direto com você pelo WhatsApp.',
    '',
    'Investimento a partir de {{valor}} — posso dividir em etapas para caber no orçamento. Fica combinado uma conversa rápida hoje ou amanhã?',
  ].join('\n')
);

insertTemplate.run(
  'E-mail formal de apresentação',
  'email',
  [
    'Assunto: Site para a {{negocio}} — proposta rápida',
    '',
    'Olá, tudo bem?',
    '',
    'Meu nome é [SEU NOME] e ajudo negócios de {{categoria}} em {{cidade}} a vender mais pela internet.',
    '',
    'Percebi que a {{negocio}} não tem um site ainda. Ter presença profissional no Google faz diferença: clientes te encontram, confiam mais e falam direto com você.',
    '',
    'Trabalho com sites a partir de {{valor}}, com entrega em poucos dias. Posso te apresentar uma simulação do site de vocês sem compromisso.',
    '',
    'Se fizer sentido, me diga um bom horário para conversarmos pelo telefone {{telefone}} ou WhatsApp.',
    '',
    'Abraços,',
    '[SEU NOME]',
  ].join('\n')
);

const insertOpportunity = db.prepare(
  `INSERT INTO opportunities (business_id, service, status, estimated_value, notes)
   VALUES (?, ?, ?, ?, ?)`
);

const padariaId = businessIds[0];
const barbeariaId = businessIds[1];
const studioId = businessIds[3];

if (padariaId) {
  insertOpportunity.run(
    padariaId,
    'site_institucional',
    'negotiating',
    2200,
    'Quer ver exemplos de sites de padarias antes de decidir.'
  );
}
if (barbeariaId) {
  insertOpportunity.run(barbeariaId, 'landing_page', 'contacted', 1200, 'Enviou curtir a ideia, pediu preço baixo.');
}
if (studioId) {
  insertOpportunity.run(studioId, 'landing_page', 'prospect', 900, 'Agenda online seria diferencial.');
}

console.log('Seed concluído: negócios, templates e oportunidades de exemplo criados.');
