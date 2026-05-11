# subdm-ia-assistant

Assistente de IA Local para Foundry VTT. Gera NPCs a partir de prompts usando um serviço de IA local compatível com a API OpenAI.

## Visão geral

Este módulo oferece geração de NPCs e suporte básico de NPCs em uma estrutura dividida em scripts:

- `scripts/init.js` — inicialização, settings e botões da interface.
- `scripts/utils.js` — utilitários de interface.
- `scripts/npc.js` — criação de NPCs, normalização de dados, cálculos e escalonamento.
- `scripts/ai.js` — comunicação com o serviço de IA.

## Recursos atuais

- Botão `Gerar NPC IA` no diretório de atores.
- Botão `Escalonar IA`, em fichas de NPC.
- Configuração de endpoint, modelo e prompt de sistema através das configurações de módulo.
- Conversão de resposta de IA para dados de NPC com normalização e fallback.
- Criação de NPCs como atores do tipo `npc` com atributos e ataques básicos.

## Como usar

1. Copie a pasta do módulo para `Data/modules/subdm-ia-assistant`.
2. Ative o módulo no Foundry VTT.
3. Abra as configurações do módulo em `Configurações` > `Módulos do Mundo` e configure:
   - `AI Endpoint`
   - `Modelo da IA`
   - `Prompt do Sistema`
4. Use o botão `Gerar NPC IA` no `Actor Directory`.
5. Abra um NPC e use os botões da ficha.

## Requisitos

- Foundry VTT 12 ou 13.
- Serviço de IA local compatível com o endpoint OpenAI-style `/v1/chat/completions`.

## Detalhes dos arquivos


### `scripts/init.js`
- Registra os settings com `Hooks.once("init")`.
- Insere o botão de geração no diretório de atores.
- Insere o botão de escalonamento na ficha do Personagem

### `scripts/utils.js`
- Contém `pedirDescricaoNPC()` para solicitar o prompt do usuário via diálogo.

### `scripts/npc.js`
- `calcularNivelMedioDaParty()`
- `calcularCR()`
- `limparJSON()`
- `normalizarNPC()`
- `criarNPC()`
- `escalarNPC()`

### `scripts/ai.js`
- `enviarRequestIA()`
- `gerarNPC()`

## Status dos compêndios

O `module.json` declara compêndios, mas o módulo atualmente usa apenas pastas de template JSON em `packs/`.

- `packs/npcs-examples/` contém um exemplo (`example-goblin.json`).
- `packs/items-templates/` está vazio.

Para que esses compêndios funcionem como packs reais no Foundry, é necessário exportar ou criar arquivos `.db` no formato SQLite do Foundry.

## Observações importantes

- A geração de NPC depende de respostas JSON válidas da IA.
- `normalizarNPC()` é responsável por tornar o resultado seguro para uso.
- `limparJSON()` tenta extrair JSON de respostas que incluem texto extra.

## Recomendações

- Use conteúdo aberto ou próprio para evitar problemas de direitos autorais.
