# 🔐 Login de Promotor - Documentação

## Endpoint de Login

**URL:** `POST /promotor/login`

**Descrição:** Autentica um promotor usando email e senha, retornando um token JWT para acesso às rotas protegidas.

## Requisição

### Headers
```
Content-Type: application/json
```

### Body
```json
{
  "EMAIL": "promotor@exemplo.com",
  "SENHA": "senha123"
}
```

### Validações
- `EMAIL`: Deve ser um email válido (obrigatório)
- `SENHA`: Deve ser fornecida (obrigatório)

## Respostas

### ✅ Sucesso (200)
```json
{
  "message": "Login realizado com sucesso.",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "promotor": {
    "ID_PROMOTOR": 1,
    "NOME": "João Silva",
    "EMAIL": "promotor@exemplo.com",
    "CPF": "12345678900",
    "ID_CLIENT": 10,
    "CREATED_BY": 5,
    "CREATED_AT": "2024-01-01T00:00:00.000Z",
    "UPDATED_AT": "2024-01-01T00:00:00.000Z"
  }
}
```

**Nota:** O campo `SENHA` é removido da resposta por segurança.

### ❌ Credenciais Inválidas (401)
```json
{
  "message": "Email ou senha inválidos."
}
```

### ❌ Erro de Validação (400)
```json
{
  "error": "Validation Error",
  "message": "Invalid input data",
  "details": [
    {
      "field": "EMAIL",
      "message": "Email inválido",
      "code": "invalid_string"
    }
  ]
}
```

### ❌ Erro Interno (500)
```json
{
  "message": "Erro interno ao fazer login."
}
```

## Usando o Token JWT

Após um login bem-sucedido, use o token retornado para acessar rotas protegidas:

```bash
curl -X GET http://localhost:8185/promotor/edit/1 \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

### Detalhes do Token
- **Expiração:** 24 horas
- **Conteúdo:** Informações do promotor (ID_PROMOTOR, NOME, EMAIL, CPF, ID_CLIENT)
- **Algoritmo:** HS256 (HMAC com SHA-256)

## Exemplos de Uso

### cURL
```bash
curl -X POST http://localhost:8185/promotor/login \
  -H "Content-Type: application/json" \
  -d '{
    "EMAIL": "promotor@exemplo.com",
    "SENHA": "senha123"
  }'
```

### JavaScript (Fetch)
```javascript
const response = await fetch('http://localhost:8185/promotor/login', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    EMAIL: 'promotor@exemplo.com',
    SENHA: 'senha123'
  })
});

const data = await response.json();
console.log('Token:', data.token);
```

### Python (requests)
```python
import requests

response = requests.post(
    'http://localhost:8185/promotor/login',
    json={
        'EMAIL': 'promotor@exemplo.com',
        'SENHA': 'senha123'
    }
)

data = response.json()
print('Token:', data['token'])
```

## Segurança

### Implementações de Segurança
1. **Criptografia de Senhas:** As senhas são armazenadas de forma criptografada no banco de dados
2. **Comparação de Tempo Constante:** Utiliza `crypto.timingSafeEqual` para prevenir ataques de timing
3. **Mensagens de Erro Sanitizadas:** Não expõe detalhes internos do sistema
4. **Token JWT:** Autenticação stateless com expiração configurável
5. **HTTPS Recomendado:** Em produção, use sempre HTTPS para proteger as credenciais em trânsito

### Variáveis de Ambiente Necessárias
```env
JWT_SECRET=sua_chave_secreta_aqui
CRIPTKEY=sua_chave_de_criptografia_aqui
```

## Documentação Interativa

A documentação completa e interativa está disponível em:
- **Interface Scalar:** `http://localhost:8185/docs`
- **OpenAPI JSON:** `http://localhost:8185/openapi.json`

Na interface Scalar, você pode testar o endpoint diretamente usando o botão "Try it out".

## Fluxo de Autenticação

```
1. Cliente envia EMAIL e SENHA
   ↓
2. Servidor busca promotor pelo email
   ↓
3. Servidor descriptografa senha armazenada
   ↓
4. Servidor compara senhas (tempo constante)
   ↓
5. Se válido: gera token JWT
   ↓
6. Retorna token e dados do promotor
```

## Erros Comuns

| Erro | Causa | Solução |
|------|-------|---------|
| Email inválido | Formato de email incorreto | Verificar formato do email |
| Email ou senha inválidos | Credenciais incorretas | Verificar email e senha |
| Erro interno no servidor | JWT_SECRET não configurado | Configurar variável de ambiente |
| Token expirado | Token com mais de 24h | Fazer login novamente |

## Rotas Relacionadas

- `POST /promotor/create` - Criar novo promotor (requer autenticação)
- `PUT /promotor/edit/:id` - Atualizar promotor (requer autenticação)
- `DELETE /promotor/delete/:id` - Deletar promotor (requer autenticação)

---

*Documentação criada em: Fevereiro 2026*
