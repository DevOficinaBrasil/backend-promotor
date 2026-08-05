import { CanalNotificacao } from "../entities/NotificacaoVisita";
import { ChannelSender } from "./ChannelSender";
import { whatsAppChannel } from "./whatsappChannel";

// Keyed by the CANAL column's enum, so adding a channel is one new file plus
// one entry here — never a change at the call site.
const registro = new Map<CanalNotificacao, ChannelSender>([
  [CanalNotificacao.WHATSAPP, whatsAppChannel],
]);

/**
 * Resolves the sender for a channel.
 *
 * Throws only for an enum value nobody registered, which is a programmer error
 * (a channel was added to the enum and not to this map) rather than a runtime
 * or configuration condition.
 */
export function getChannel(canal: CanalNotificacao): ChannelSender {
  const sender = registro.get(canal);

  if (sender === undefined) {
    throw new Error(
      `Nenhum ChannelSender registrado para o canal "${canal}". Registre-o em channels/channelRegistry.ts.`
    );
  }

  return sender;
}
