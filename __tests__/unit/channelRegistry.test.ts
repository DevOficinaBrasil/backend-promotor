import { getChannel } from "../../channels/channelRegistry";
import { whatsAppChannel, WhatsAppChannel } from "../../channels/whatsappChannel";
import { CanalNotificacao } from "../../entities/NotificacaoVisita";

// Spec assumption "Channel abstraction": a registry keyed by the CANAL enum,
// so the send flow resolves its sender from the row's channel rather than
// hardcoding WhatsApp (NOTIF-05).
describe("getChannel", () => {
  it("returns the WhatsApp sender for CanalNotificacao.WHATSAPP", () => {
    const sender = getChannel(CanalNotificacao.WHATSAPP);

    expect(sender).toBe(whatsAppChannel);
    expect(sender).toBeInstanceOf(WhatsAppChannel);
    expect(sender.canal).toBe(CanalNotificacao.WHATSAPP);
  });

  it("throws naming the unregistered channel when no sender is registered for it", () => {
    expect(() => getChannel("SMS" as CanalNotificacao)).toThrow(
      'Nenhum ChannelSender registrado para o canal "SMS". Registre-o em channels/channelRegistry.ts.'
    );
  });
});
