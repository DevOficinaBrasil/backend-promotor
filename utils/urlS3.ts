/**
 * Monta a URL pública de um objeto do bucket a partir da chave relativa guardada
 * no banco (`COMMUNITIES.Icon`, por exemplo).
 *
 * Degrada para `null` em vez de montar URL quebrada: sem chave, ou sem
 * `AWS_S3` no ambiente, quem consome renderiza o fallback. Chave que já venha
 * absoluta (`http://`/`https://`) passa intacta — parte do cadastro antigo
 * guarda URL completa.
 */
export function urlS3(chave?: string | null): string | null {
  const valor = chave?.trim();

  if (!valor) {
    return null;
  }

  if (/^https?:\/\//i.test(valor)) {
    return valor;
  }

  const base = process.env.AWS_S3?.trim();

  if (!base) {
    return null;
  }

  return `${base.replace(/\/+$/, "")}/${valor.replace(/^\/+/, "")}`;
}
