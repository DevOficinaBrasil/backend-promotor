# Backend API - Express + TypeScript

## 📋 Pré-requisitos

- Node.js >= 18
- PostgreSQL >= 14
- Docker & Docker Compose (opcional)

## 🚀 Instalação

1. Clone o repositório
2. Copie `.env.example` para `.env` e configure as variáveis
3. Instale as dependências: `npm install`
4. Execute as migrations: `npm run migration:run`
5. Inicie o servidor: `npm run dev`

## 📦 Scripts Disponíveis

- `npm run dev` - Inicia servidor em modo desenvolvimento
- `npm run build` - Compila o TypeScript
- `npm start` - Inicia servidor em produção
- `npm test` - Executa testes unitários
- `npm run test:e2e` - Executa testes E2E

## 🐳 Docker

```bash
docker-compose up -d
```

## 📚 Documentação

- [Documentação de API](docs/DOCUMENTACAO_API.md) - Guia para documentação automática de APIs
- [Entidades de Campanhas](docs/ENTIDADES_CAMPANHAS.md) - Documentação das entidades do sistema de campanhas
- [Entidade OFICINA](docs/ENTIDADE_OFICINA.md) - Documentação completa da entidade OFICINA
- [API de Rotas](docs/ROTA_API_TESTING.md) - Testes e documentação da API de rotas
- [Login de Promotor](docs/LOGIN_PROMOTOR.md) - Documentação do sistema de login
