# Plataforma de Gestão e Disponibilização de Recursos Educativos (EW2026)

Legenda:

- ✅ Implementado
- ⚠️ Parcial / com ressalvas
- ❌ Em falta
- 🎯 Prioridade recomendada

Atualizado em: 2026-05-08

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

#### 3.2 Configuração correta atrás de proxy reverso

- ❌ Não está visível configuração explícita de `trust proxy` na interface.
- Impacto: em produção pode afetar cookies `secure`, IP real do cliente e comportamento de sessão atrás de `nginx`.
- Evolução recomendada: configurar `app.set('trust proxy', 1)` e validar cookies/sessão em ambiente Docker.

#### 3.3 Testes fora da API

- ⚠️ A API já tem boa base de testes, mas `auth`, `gateway` e `interface` não mostram suite equivalente.
- Impacto: os fluxos mais críticos do sistema completo ficam menos protegidos contra regressões.
- Evolução recomendada:
	- testes de auth para login, refresh, logout, permissões e soft-delete;
	- testes do gateway para proxy, 502 e rate limiting;
	- smoke tests da interface para rotas principais e submissão simples.

#### 3.4 Healthchecks e readiness no `docker-compose`

- ❌ O `docker-compose.yml` usa `depends_on`, mas não define `healthcheck` dos serviços.
- Impacto: a ordem de arranque não garante que Mongo/API/Auth estejam realmente prontos quando os restantes serviços arrancam.
- Evolução recomendada: adicionar `healthcheck` e, se necessário, condicionar arranque a serviços saudáveis.

#### 3.5 CI automatizada

- ❌ Não há pipeline CI visível no repositório.
- Impacto: testes, validação de sintaxe e checks de qualidade dependem sempre de execução manual.
- Evolução recomendada: criar workflow para instalar dependências, correr testes da API e checks básicos dos restantes serviços.

### 🎯 Prioridade média

#### 3.6 Tipos de recurso realmente extensíveis

- ❌ O enunciado pede não só um conjunto base de tipos, mas também prever o aumento e a adição de novos tipos de recurso.
- Estado atual: os tipos válidos estão fechados por enumeração fixa no backend.
- Impacto: para acrescentar um novo tipo é preciso mexer no código e redeploy, em vez de a plataforma o suportar de forma mais natural.
- Evolução recomendada:
	- extrair tipos base para configuração ou coleção própria;
	- permitir gestão administrativa dos tipos disponíveis;
	- manter validação sem ficar preso a uma lista hardcoded.

#### 3.7 Perfil de utilizador mais alinhado com o enunciado

- ⚠️ O enunciado sugere guardar mais contexto do utilizador: filiação, estudante/docente, curso, departamento e dados equivalentes.
- Estado atual: o serviço `auth` guarda `nome`, `email`, `filiacao`, `nivel_acesso`, datas e credenciais, mas a `filiacao` está simplificada para um único campo textual.
- Impacto: a plataforma cumpre o essencial, mas perde riqueza de perfil e capacidade de filtragem/gestão futura.
- Evolução recomendada:
	- modelar `filiacao` de forma estruturada;
	- separar pelo menos instituição/departamento/curso/tipo de vínculo quando fizer sentido;
	- refletir esses campos no registo, administração e exportação/importação.

#### 3.8 Dataset de demonstração reproduzível e convincente

- ⚠️ Há indícios de dados reais locais, mas o seed automático centra-se sobretudo em utilizadores.
- Impacto: a demonstração pode depender demasiado de estado manual/local, e o enunciado pede explicitamente algumas dezenas de entradas reais para a apresentação final.
- Evolução recomendada:
	- gerar conjunto reprodutível com dezenas de recursos;
	- incluir posts, comentários, ratings e notícias associadas;
	- documentar como repor esse estado para avaliação.

#### 3.9 Observabilidade operacional mínima

- ⚠️ Existem logs simples, mas não há estratégia consolidada de observabilidade.
- Impacto: diagnosticar falhas entre `nginx` → `gateway` → `api/auth/interface` continua trabalhoso.
- Evolução recomendada:
	- normalizar logs por serviço;
	- incluir `requestId`/correlação;
	- documentar leitura de logs por cenário.

#### 3.10 Documentação operacional

- ⚠️ Existe documentação funcional, mas falta documentação de operação curta e objetiva.
- Impacto: quem avalia ou arranca o projeto pode perder tempo com variáveis, OAuth, dados seed e troubleshooting.
- Evolução recomendada: criar runbook com `setup`, variáveis obrigatórias, arranque, testes e resolução de problemas comuns.

### Prioridade baixa

#### 3.11 Circuit breaker e resiliência avançada

- ⚠️ O gateway já tem timeout e tratamento de 502, o que cobre o essencial.
- Faz sentido melhorar apenas depois de sessões, testes, CI e healthchecks.

#### 3.12 Ajustes extra de UX/UI

- ⚠️ A interface já está funcional e visualmente consistente.
- Novas mexidas visuais só são prioritárias se resolverem dor concreta de uso.

---

## 4) Backlog recomendado para fecho

### Sprint 1 — robustez mínima obrigatória

- 🎯 Implementar store persistente de sessão na interface.
- 🎯 Configurar `trust proxy` e rever cookies/sessões atrás de `nginx`.
- 🎯 Adicionar `healthchecks` ao `docker-compose`.
- 🎯 Criar testes de `auth` para login/refresh/permissões.

### Sprint 2 — confiança na entrega

- 🎯 Criar testes do gateway (proxy, 502, rate limiting).
- 🎯 Criar smoke tests da interface para rotas críticas.
- 🎯 Criar pipeline CI para testes e checks automáticos.

### Sprint 3 — demonstração e operação

- 🎯 Tornar tipos de recurso extensíveis sem alterar código-fonte.
- 🎯 Enriquecer o perfil de utilizador com filiação estruturada.
- 🎯 Consolidar dataset de demonstração reproduzível.
- 🎯 Criar runbook curto de operação.
- 🎯 Melhorar logs e observabilidade mínima entre serviços.

---

## 5) Itens que deixam de fazer sentido como prioridade

Estes pontos não devem continuar destacados como “principal falta” neste momento:

- ✅ `Helmet` na interface.
- ✅ `Rate limiting` global no gateway.
- ✅ “criar testes mínimos” na API, porque essa base já existe.
- ⚠️ `CORS` na interface não é prioridade real enquanto a interface continuar essencialmente SSR e servida pelo mesmo ecossistema.
- ⚠️ Mais alterações visuais na UI não trazem tanto valor como robustez, testes e operação.
- ⚠️ O enunciado não obriga a suportar de uma vez todas as formas de autenticação sugeridas; ter `username/password` e OAuth já cobre bem esse ponto.

---

## 6) Estado final resumido

- ✅ Funcionalidade principal: pronta.
- ✅ OAIS e submissão de recursos: prontos.
- ✅ Segurança base: presente.
- ⚠️ Robustez operacional: ainda precisa de evolução.
- ⚠️ Testes end-to-end e entre serviços: principal lacuna técnica.
- ⚠️ Dataset reprodutível para demonstração: ainda deve ser consolidado, e o enunciado dá-lhe peso explícito.
- ⚠️ Extensibilidade de tipos e riqueza do perfil de utilizador: cumprem o mínimo, mas ainda não refletem totalmente a ambição do enunciado.
- 🎯 Foco recomendado agora: sessões, proxy, healthchecks, testes fora da API, CI e reforço dos pontos explícitos do enunciado.
