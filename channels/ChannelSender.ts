import { CanalNotificacao } from "../entities/NotificacaoVisita";

/**
 * Everything a channel needs to deliver one visit notification.
 *
 * `variables` is the ordered template-variable list — `[usuarioNome,
 * clienteNome, confirmationUrl]` for the visit template
 * (atualizacao_dados_visita_oficina), spec AC6.
 */
export interface ChannelSendParams {
  toPhone: string;
  variables: string[];
}

/**
 * Outcome of one dispatch attempt.
 *
 * Success carries the provider's identifiers so they can be persisted on the
 * NotificacaoVisita row (spec AC7). Failure carries a spec-worded `reason`
 * plus the provider's raw error code when there was one, so the orchestrator
 * can record both without re-deriving the mapping (spec AC8, AC9).
 */
export type ChannelSendResult =
  | {
      success: true;
      messageId: string | null;
      providerMessageId: string | null;
    }
  | {
      success: false;
      reason: string;
      providerCode: string | null;
    };

/**
 * One notification channel. WhatsApp is the only implementation today; the
 * registry keys implementations by CanalNotificacao so a future channel is a
 * new file plus a registry entry, not a call-site change.
 */
export interface ChannelSender {
  readonly canal: CanalNotificacao;
  send(params: ChannelSendParams): Promise<ChannelSendResult>;
}
