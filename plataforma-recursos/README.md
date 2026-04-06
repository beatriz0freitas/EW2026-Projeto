# Plataforma de Gestão e Disponibilização de Recursos Educativos (EW2026)

Este diretório contém a **arquitetura e implementação** do projeto.

## Requisitos do enunciado (cobertos pela arquitetura)
- Recursos educativos (vários tipos; extensível)
- Classificação por ano/tipo/tema (hashtags/taxonomia)
- Posts sobre recursos + comentários
- Ranking por estrelas (ratings)
- Notícias na página principal (admin ou geradas pelo sistema)
- Autenticação + níveis: **Administrador**, **Produtor**, **Consumidor**
- Import/Export de pacotes **SIP/DIP** (BagIt-inspired)

## Fluxo (como no quadro)
Cliente → **Gateway** → (**Interface** + **API** + **Auth**) → **DB**

## OAIS (como no esquema)
- **Producer → SIP → Ingest**: submissão/importação em pacote
- **AIP**: representação interna (metadados na DB + ficheiros em storage)
- **Consumer ← DIP ← Access**: exportação/entrega em pacote

## Estrutura do repositório
- `docker-compose.yml` — levanta DB + serviços
- `services/` — implementação por serviço
	- `gateway/` — ponto de entrada (roteamento/proxy)
	- `interface/` — UI (Pug) e chamadas para API/Auth
	- `api/` — domínio: recursos/posts/comentários/ratings/notícias + OAIS
	- `auth/` — autenticação/autorização e gestão de utilizadores/roles
- `data/aip/` — **Archival Storage** (placeholder para AIP: ficheiros/binários)

## Onde entra OAIS no código (API)
- `services/api/oais/ingest/` — SIP
- `services/api/oais/access/` — DIP
- `services/api/oais/dataManagement/` — metadados/classificações/índices
- `services/api/oais/archivalStorage/` — storage (AIP)
- `services/api/oais/administration/` — administração
- `services/api/oais/preservationPlanning/` — planeamento/políticas

## Portas (convenção atual)
- Gateway: `16020` (único exposto)
- API: `16025`
- Interface: `16026`
- Auth: `16027`

