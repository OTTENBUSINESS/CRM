import {
  button,
  linkCard,
  htmlCodeBlock,
  image,
  logo,
  inlineImage,
  columns,
  section,
  repeat,
  spacer,
  divider,
  bulletList,
  orderedList,
  text,
  heading1,
  heading2,
  heading3,
  hardBreak,
  blockquote,
  footer,
  clearLine,
  type BlockGroupItem,
  type BlockItem,
} from '@maily-to/core/blocks';

const t = (b: BlockItem, title: string, description?: string): BlockItem =>
  ({ ...b, title, description: description ?? b.description } as BlockItem);

export const blocksPtBR: BlockGroupItem[] = [
  {
    title: 'Conteúdo',
    commands: [
      t(text, 'Texto', 'Parágrafo simples.'),
      t(heading1, 'Título 1', 'Título de destaque.'),
      t(heading2, 'Título 2', 'Subtítulo.'),
      t(heading3, 'Título 3', 'Subtítulo menor.'),
      t(blockquote, 'Citação', 'Bloco de citação.'),
      t(footer, 'Rodapé', 'Texto pequeno de rodapé.'),
    ],
  },
  {
    title: 'Listas',
    commands: [
      t(bulletList, 'Lista com marcadores', 'Lista não ordenada.'),
      t(orderedList, 'Lista numerada', 'Lista ordenada.'),
    ],
  },
  {
    title: 'Mídia',
    commands: [
      t(image, 'Imagem', 'Insere uma imagem.'),
      t(inlineImage, 'Imagem inline', 'Imagem dentro do texto.'),
      t(logo, 'Logo', 'Logo da marca.'),
    ],
  },
  {
    title: 'Layout',
    commands: [
      t(columns, 'Colunas', 'Layout em colunas.'),
      t(section, 'Seção', 'Bloco de seção.'),
      t(spacer, 'Espaçador', 'Espaço vertical.'),
      t(divider, 'Divisor', 'Linha divisória.'),
      t(repeat, 'Repetir', 'Bloco repetível.'),
      t(clearLine, 'Quebra de linha', 'Quebra de linha sem espaçamento.'),
      t(hardBreak, 'Nova linha', 'Quebra de linha forçada.'),
    ],
  },
  {
    title: 'Ações',
    commands: [
      t(button, 'Botão', 'Adiciona um botão de chamada para ação.'),
      t(linkCard, 'Card de link', 'Card clicável com link.'),
    ],
  },
  {
    title: 'Avançado',
    commands: [
      t(htmlCodeBlock, 'HTML personalizado', 'Insere um bloco de HTML customizado.'),
    ],
  },
];
