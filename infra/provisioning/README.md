# Provisionamento Automatizado da Plataforma EW2026 (Docker, Vagrant, Ansible)

**Projeto:** Plataforma de Recursos Educativos (EW2026)\
**Candidatura:** Bolsa de Investigação INESC TEC --- Projeto BringTrust (Edital AE2026-0337)\
**Requisito do Edital Satisfeito:** *«Experiência com tecnologias de virtualização, containerização e provisionamento (Docker, Vagrant, Ansible), comprovada com evidência técnica (...)»*

---

## 1. Visão Geral

Este módulo implementa **Infraestrutura como Código (IaC)** para criar e configurar de forma totalmente automatizada e reprodutível o ambiente de desenvolvimento e inferência local da plataforma, cobrindo:
1. **Virtualização:** `Vagrantfile` parametrizado (Ubuntu 22.04 LTS, 4GB RAM, 2 vCPUs, encaminhamento de portas).
2. **Provisionamento:** Playbook e Roles Ansible (`ansible/playbook.yml` e `roles/ew_stack`) para instalação de dependências, Docker Engine, Docker Compose Plugin e serviço Ollama.
3. **Containerização:** Docker Engine configurado e pronto a orquestrar os microserviços via `docker compose`.
4. **Modelos Locais:** Download e ativação prévia dos pesos dos modelos validados (`llama3.2:1b` e `nomic-embed-text`).

---

## 2. Estrutura de Ficheiros

```text
infra/provisioning/
├── Vagrantfile                   # Definição e configuração da VM local
├── README.md                     # Este guia de execução
└── ansible/
    ├── inventory.ini             # Inventário de hosts (VM e localhost)
    ├── playbook.yml              # Playbook principal de provisionamento
    └── roles/
        └── ew_stack/
            └── tasks/
                └── main.yml      # Tarefas modulares e idempotentes
```

---

## 3. Modos de Execução

### Opção A: Provisionamento Completo via Vagrant (VM Isolada)

Com o [Vagrant](https://www.vagrantup.com/) e [VirtualBox](https://www.virtualbox.org/) instalados:

```bash
# 1. Entrar na diretoria de provisionamento
cd infra/provisioning

# 2. Criar e provisionar a máquina virtual
vagrant up

# 3. Aceder por SSH à máquina virtual criada
vagrant ssh

# 4. Verificar o estado dos serviços provisionados
docker --version
docker compose version
ollama list
```

A porta da aplicação (`16020`) é automaticamente encaminhada para a máquina anfitriã, ficando acessível em `http://localhost:16020`.

### Opção B: Provisionamento Direto via Ansible (Máquina Local ou Servidor Remoto)

Caso pretenda provisionar diretamente a máquina local de desenvolvimento (Ubuntu/Debian):

```bash
cd infra/provisioning/ansible

# Validar sintaxe do playbook
ansible-playbook -i inventory.ini playbook.yml --syntax-check

# Executar provisionamento local
ansible-playbook -i inventory.ini playbook.yml --limit local --ask-become-pass
```

---

## 4. Tarefas Executadas pelo Playbook Ansible

1. **Atualização e Pacotes Base:** Atualização do repositório apt e instalação de `curl`, `git`, `python3-pip`, `ca-certificates` e ferramentas de segurança.
2. **Instalação do Docker Oficial:** Adição do repositório oficial da Docker Inc. com chave GPG verificada e instalação do `docker-ce`, `docker-ce-cli`, `containerd.io` e `docker-compose-plugin`.
3. **Configuração de Utilizador e Serviços:** Inclusão do utilizador no grupo `docker` (permitindo execução sem `sudo`) e ativação do serviço `systemd`.
4. **Instalação e Arranque do Ollama:** Instalação do runtime Ollama e ativação do serviço de inferência em background na porta `11434`.
5. **Pré-carregamento dos Modelos:** Execução de `ollama pull llama3.2:1b` e `ollama pull nomic-embed-text`, deixando o ambiente pronto para execução do RAG e Recomendador sem latência de download inicial.
6. **Configuração de Ambiente:** Criação do ficheiro `.env` a partir do template `.env.example`.

---

## 5. Verificação e Testes de Idempotência

O playbook foi desenvolvido respeitando o princípio de **idempotência**:
- Execuções subsequentes do comando `ansible-playbook` detectam o estado já configurado dos serviços e dos modelos, resultando em `ok` sem reinstalações destrutivas (`changed=0`).
