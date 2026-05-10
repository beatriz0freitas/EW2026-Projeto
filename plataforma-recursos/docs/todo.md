# Plataforma de Gestão e Disponibilização de Recursos Educativos (EW2026)

Legenda:

- ✅ Implementado
- ⚠️ Parcial / com ressalvas
- ❌ Em falta
- 🎯 Prioridade recomendada

Atualizado em: 2026-05-09

Validação desta atualização:

- ✅ Revisão do diff local e dos ficheiros novos/alterados.
- ✅ Alterações agrupadas por categoria funcional.
- ✅ Estado do backlog ajustado ao comportamento atualmente implementado.
- ✅ Templates Pug compiladas sem erro.
- ✅ JavaScript verificado com `node --check`.
- ✅ `git diff --check` sem problemas de whitespace na última validação registada.
- ✅ Docker Compose reconstruído e páginas `/`, `/resources` e CSS servidos com HTTP 200.

---

## 1) Diagnóstico do `todo.md` anterior

O ficheiro anterior já não estava a cumprir bem a função de backlog porque misturava três coisas diferentes:

- histórico do que foi implementado;
- fotografia do estado atual;
- lista de trabalho pendente.

Além disso, havia problemas concretos de manutenção do documento:

- havia secções duplicadas para `gateway`, `nginx` e `interface`;
- existiam itens marcados como ❌ que já estão implementados no código;
- o backlog dava destaque a tarefas menos relevantes e escondia lacunas mais importantes de robustez operacional.

---

## 2) Estado validado no código

### Itens anteriormente marcados como em falta, mas que já existem

- ✅ `Helmet` na interface (`services/interface/app.js`).
- ✅ `Rate limiting` global no gateway (`services/gateway/app.js` + `services/gateway/middleware/rateLimit.js`).
- ✅ Testes automáticos mínimos na API, incluindo OAIS, validação, autorização e rate limiting (`services/api/testes/*`).
- ✅ OAuth Google/Facebook presente na interface (`services/interface/routes/auth.js`).

### Estado geral atual

- ✅ Núcleo funcional da Proposta 1 está implementado.
- ✅ Fluxo OAIS SIP/AIP/DIP está implementado.
- ✅ Submissão simples com geração automática de SIP está implementada.
- ✅ API, auth, gateway e interface estão separados e organizados por serviço.
- ✅ Segurança base já existe em vários pontos: `helmet`, `cors`, validação de input, limites de upload e rate limiting.
- ⚠️ A maturidade global ainda está desigual entre serviços: a API já tem testes, mas os restantes serviços ainda não têm o mesmo nível de validação.

---

## 3) O que realmente falta e é pertinente

Esta é a parte mais importante neste momento.

### 🎯 Prioridade alta

#### 3.1 Sessões da interface em store persistente

- ❌ A interface usa `express-session` sem store externo, ficando na prática com `MemoryStore`.
- Impacto: não é solução robusta para produção, perde sessões em restart e escala mal.
- Evolução recomendada: usar `connect-mongo` ou Redis para guardar sessões.

### Gateway (`services/gateway`)

- ✅ Reverse proxy funcional: `/api`, `/auth` e interface.
- ✅ Regras específicas para login, registo e logout da interface.
- ✅ Handler central de 502.
- ✅ `proxyTimeout` configurado.
- ✅ Hub Swagger agregado em `/docs`.
- ✅ CORS explícito no gateway implementado.
- ✅ Helmet no gateway implementado.
- ✅ Rate limiting global implementado.
- ⚠️ Sem circuit breaker.

### 🎯 Prioridade média

#### 3.6 Tipos de recurso realmente extensíveis

- ❌ O enunciado pede não só um conjunto base de tipos, mas também prever o aumento e a adição de novos tipos de recurso.
- Estado atual: os tipos válidos estão fechados por enumeração fixa no backend.
- Impacto: para acrescentar um novo tipo é preciso mexer no código e redeploy, em vez de a plataforma o suportar de forma mais natural.
- Evolução recomendada:
	- extrair tipos base para configuração ou coleção própria;
	- permitir gestão administrativa dos tipos disponíveis;
	- manter validação sem ficar preso a uma lista hardcoded.

- ✅ App Express com Pug, sessão, flash messages e rotas montadas.
- ✅ Login/registo/logout funcionais.
- ✅ Home com notícias recentes e recursos recentes.
- ✅ Recursos: listagem, filtros, detalhe, submissão simples, upload SIP, download DIP e ratings.
- ✅ Posts: listar, criar, detalhe, editar, apagar, comentar e remover comentário.
- ✅ Admin: utilizadores, notícias, export e import de dump.
- ✅ Interceptor 401 com renovação automática via refresh-server.
- ✅ Detalhe de recurso apresenta posts associados por `resourceId`.
- ✅ UI revista para uma experiência mais intuitiva, contrastante e consistente.
- ✅ Helmet implementado na interface.
- ⚠️ CORS dedicado na interface não é necessário no fluxo SSR atual; CORS público fica no gateway/API.

---

## 4) Backlog recomendado para fecho

### Sprint 1 — robustez mínima obrigatória

- ✅ Helmet na interface.
- ✅ Rate limiting global no gateway.

### Sprint 2 — confiança na entrega

- 🎯 Criar testes do gateway (proxy, 502, rate limiting).
- 🎯 Criar smoke tests da interface para rotas críticas.
- 🎯 Criar pipeline CI para testes e checks automáticos.

### Sprint 3 — demonstração e operação

### Experiência funcional final

- ✅ Mostrar recursos na home.
- ✅ Mostrar posts associados no detalhe de recurso.
- ✅ Filtro GET `/api/posts?resourceId=...`.
- ✅ Submissão simples para reduzir dependência de SIP manual.
- ✅ Estilo visual mais apelativo e coerente.

### Qualidade de entrega

- ✅ Criados testes unitários para ingest, geração de SIP, DIP, validação e filtros.
- ✅ Criados testes de integração leves para auth/permissões/OAIS na API.
- ⚠️ Aumentar dataset para dezenas de entradas reais.

---

## 5) Itens que deixam de fazer sentido como prioridade

- Núcleo da Proposta 1: ✅ funcional.
- OAIS ingest/access: ✅ funcional.
- Submissão simples com SIP automático: ✅ funcional.
- Auth com 3 perfis e controlo de acesso: ✅ funcional.
- Notícias automáticas: ✅ funcional.
- Interface end-to-end: ✅ funcional.
- UI final com azul escuro, vermelho e branco: ✅ implementada.
- Helmet na interface: ✅ implementado.
- CORS/API e gateway: ✅ configurados nos serviços de fronteira.
- Rate limiting global no gateway: ✅ implementado.
- Testes automáticos da API: ✅ implementados.
- Dataset de demonstração com dezenas de recursos: ⚠️ ainda insuficiente.
