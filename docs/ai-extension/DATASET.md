# Especificação do Corpus de Avaliação e Ground-Truth (TASK-06)

**Projeto:** Plataforma de Recursos Educativos (EW2026)\
**Candidatura:** Bolsa de Investigação INESC TEC --- Projeto BringTrust (Edital AE2026-0337)\
**Competências a demonstrar nas tarefas funcionais:** *«Sistemas de recomendação baseados em LLMs»* e *«RAGs»* (protocolo de avaliação reproduzível).

---

## 1. Proveniência e Princípios Éticos

1. **Origem Sintética e Controlada:** O dataset foi concebido para simular um repositório académico real de recursos educativos em Ciências da Computação e Engenharia Informática, sem conter quaisquer dados pessoais, credenciais, segredos industriais ou informação sujeita a direitos de autor restritivos.
2. **Determinismo e Reprodutibilidade:** Os identificadores (`_id`), metadados e textos estão versionados para permitir reconstrução do índice. Fixar também o digest do modelo, a normalização e as versões das bibliotecas; não se garante igualdade bit a bit de pontuações entre plataformas. O corpus, por si só, não comprova RAG nem recomendação implementados.
3. **Isolamento de Segurança (ACL):** O dataset inclui intencionalmente recursos públicos e privados para validar que o motor de recuperação e o recomendador nunca expõem conteúdos restritos a utilizadores anónimos ou sem privilégios.

---

## 2. Estrutura do Corpus (`resources.json`)

Ficheiro: [`plataforma-recursos/data/ai-fixtures/resources.json`](../../plataforma-recursos/data/ai-fixtures/resources.json)
- **Total de recursos:** 25
- **Recursos públicos:** 21 (acessíveis a qualquer utilizador ou visitante anónimo)
- **Recursos privados:** 4 (para testes de autorização e não-fuga de dados)

### Distribuição por Áreas Temáticas:

| Tema | Nº Recursos | Foco Técnico |
| :--- | :---: | :--- |
| **Sistemas Distribuídos** | 5 | Consenso (Paxos/Raft), Replicação, Consistência Eventual, Teorema CAP e Padrão Saga |
| **Segurança Web e Cadeia de Abastecimento** | 5 | Segurança CI/CD, Supply Chain, OAuth2/JWT, OWASP Top 10, Análise Estática e Vetting |
| **Arquitetura de Software e Microsserviços** | 5 | Resiliência (Circuit Breaker/Retry), Arquiteturas Orientadas a Eventos, API Gateways e Rate Limiting |
| **Algoritmos e Estruturas de Dados** | 5 | Pesquisa Vetorial (FAISS/HNSW), Árvores B+, Clustering K-Means e Grafos |
| **Redes de Computadores e Protocolos** | 5 | TLS 1.3, HTTP/3 e QUIC, Controlo de Congestionamento TCP/UDP, DNSSEC e WireGuard |

### Esquema de Cada Recurso:
```json
{
  "_id": "663e00000000000000000001",
  "metadata": {
    "resource": {
      "titulo": "Introdução a Sistemas Distribuídos e Modelos de Falhas",
      "descricao": "Aborda os conceitos fundamentais de sistemas distribuídos...",
      "tema": "Sistemas Distribuídos",
      "hashtags": ["sistemas-distribuidos", "falhas", "lamport"],
      "tipo": "artigo",
      "visibilidade": "publico"
    }
  },
  "produtor": "produtor.teste",
  "downloadCount": 184,
  "ratingAvg": 4.8
}
```

---

## 3. Conjunto de Necessidades de Aprendizagem (`queries.jsonl`)

Ficheiro: [`plataforma-recursos/data/ai-fixtures/queries.jsonl`](../../plataforma-recursos/data/ai-fixtures/queries.jsonl)
Contém **15 consultas formuladas em linguagem natural**, simulando as necessidades reais de estudantes universitários:

| ID | Categoria | Necessidade de Aprendizagem (Query) |
| :---: | :--- | :--- |
| **Q01** | Sistemas Distribuídos | *Quero aprender mecanismos de consenso e tolerância a falhas em sistemas distribuídos.* |
| **Q02** | Segurança & Supply Chain | *Como proteger pipelines de CI/CD e evitar ataques à cadeia de abastecimento de software?* |
| **Q03** | Microsserviços & Resiliência | *Quais são as melhores práticas para arquitetura de microsserviços e padrões de resiliência como Circuit Breaker?* |
| **Q04** | Algoritmos & Pesquisa Vetorial | *Como funciona a pesquisa vetorial e a indexação de embeddings de alta dimensionalidade em espaços densos?* |
| **Q05** | Autenticação & Segurança | *Explica a autenticação moderna baseada em tokens JWT, OAuth 2.0 e boas práticas de segurança.* |
| **Q06** | Redes & Criptografia | *Como funciona o protocolo TLS 1.3 e as melhorias criptográficas no aperto de mão?* |
| **Q07** | Sistemas Distribuídos | *Quais são as técnicas de replicação de dados, consistência eventual e o impacto do Teorema CAP?* |
| **Q08** | Segurança Web | *Como prevenir as principais vulnerabilidades em aplicações web segundo o catálogo OWASP Top 10?* |
| **Q09** | Microsserviços & Eventos | *Como implementar comunicação assíncrona desacoplada com mensageria e arquiteturas orientadas a eventos?* |
| **Q10** | Estruturas de Dados | *Quais as diferenças entre árvores B+ e outras estruturas de dados para armazenamento persistente?* |
| **Q11** | Redes & Protocolos | *Quais as vantagens de HTTP/3 e do protocolo de transporte QUIC em relação a versões anteriores?* |
| **Q12** | Arquitetura de APIs | *Como implementar algoritmos de rate limiting e proteção de APIs contra sobrecarga de tráfego?* |
| **Q13** | Sistemas Distribuídos | *Como gerir transações de longa duração em microsserviços através do padrão Saga?* |
| **Q14** | Vetting & CI/CD | *Quais os métodos de análise estática de código e verificação automatizada com políticas de vetting?* |
| **Q15** | Fora de Domínio (Abstenção) | *Como preparar um arroz de marisco tradicional português com coentros frescos?* |

> **Nota sobre Q15:** Esta query é intencionalmente alheia ao domínio científico da plataforma, sendo utilizada para validar que o motor RAG ativa corretamente a **taxa de abstenção** (`insufficientEvidence: true`), evitando alucinações.

---

## 4. Anotações de Relevância (Ground-Truth em `judgments.jsonl`)

Ficheiro: [`plataforma-recursos/data/ai-fixtures/judgments.jsonl`](../../plataforma-recursos/data/ai-fixtures/judgments.jsonl)

### Escala Graduada de Relevância:
- **3 (Altamente Relevante):** O recurso aborda diretamente o núcleo da dúvida com conceitos exatos e aprofundados.
- **2 (Relevante):** O recurso cobre tópicos conexos e contextualmente úteis para o objetivo de aprendizagem.
- **1 (Marginalmente Relevante):** O recurso partilha a área temática ou um conceito secundário, mas não responde diretamente.
- **0 (Irrelevante):** O recurso não tem qualquer relação pedagógica com a consulta (valor por omissão para recursos não listados).

Esta tabela de anotações permite o cálculo matemático exato de:
$$\text{DCG}@K = \sum_{i=1}^{K} \frac{2^{rel_i} - 1}{\log_2(i + 1)}, \quad \text{nDCG}@K = \frac{\text{DCG}@K}{\text{IDCG}@K}$$
$$\text{Precision}@K = \frac{|\text{Relevantes no top } K|}{K}$$
