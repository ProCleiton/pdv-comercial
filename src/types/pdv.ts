export interface LicencaPDV {
  id: number;
  codigoEstabelecimento: number;
  nomeEstabelecimento: string;
  nomeTerminal: string;
  chaveLicenca: string;
  dtAtivacao: string | null;
  dtExpiracao: string | null;
  ativa: string;
  dtUltimoUso: string | null;
  dtInsercao: string | null;
  dtAtualizacao: string | null;
}

export interface TurnoCaixa {
  id: number;
  codigoEstabelecimento: number;
  nomeEstabelecimento: string;
  codigoFuncionario: number;
  nomeFuncionario: string;
  codigoLicencaPDV: number;
  nomeTerminal: string;
  valorAbertura: number;
  valorFechamento: number | null;
  dtAbertura: string | null;
  dtFechamento: string | null;
  status: "ABERTO" | "FECHADO";
  observacao: string;
}

export interface Sangria {
  id: number;
  codigoTurnoCaixa: number;
  codigoFuncionario: number;
  nomeFuncionario: string;
  valor: number;
  motivo: string;
  dtSangria: string | null;
}

export interface Produto {
  id: number;
  descricao: string;
  precoCusto: number;
  precoVenda: number;
  codigoCategoria: number;
  tipo: string;
  controlaEstoque: string;
  unidadeMedida: string;
  codigoBarras: string;
  ativo: string;
}

export interface ItemCarrinho {
  produto: Produto;
  quantidade: number;
  precoUnitario: number;
  desconto: number;
}

export interface FormaPagamento {
  id: number;
  descricao: string;
  tipo: string;
}

export interface PagamentoCarrinho {
  codigoFormaPagamento: number;
  nomeFormaPagamento: string;
  valor: number;
  /** Dados TEF — preenchidos quando o pagamento foi via PINPAD */
  nsu?: string;
  codigoAutorizacao?: string;
  bandeira?: string;
}

export type TelaAtiva =
  | "validando_licenca"
  | "aguardando_turno"
  | "tela_pdv"
  | "sangria"
  | "fechamento"
  | "config_pdv"
  | "erro_licenca";
