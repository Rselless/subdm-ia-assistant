Hooks.once("init", () => {
    console.log("subdm-ia-assistant | Módulo inicializado");

    game.settings.register("subdm-ia-assistant", "aiEndpoint", {
        name: "AI Endpoint",
        hint: "URL do endpoint compatível com OpenAI (ex: http://localhost:11434/v1/chat/completions)",
        scope: "world",
        config: true,
        type: String,
        default: "http://localhost:11434/v1/chat/completions"
    });

    game.settings.register("subdm-ia-assistant", "aiModel", {
        name: "Modelo da IA",
        hint: "Nome exato do modelo no Ollama (confira com 'ollama list')",
        scope: "world",
        config: true,
        type: String,
        default: "qwen2.5-coder:14b"
    });

    game.settings.register("subdm-ia-assistant", "aiTemperature", {
        name: "Temperatura da IA",
        hint: "Mais baixo = mais aderente ao formato JSON. Recomendado 0.3–0.5 para modelos pequenos.",
        scope: "world",
        config: true,
        type: Number,
        default: 0.4
    });

    game.settings.register("subdm-ia-assistant", "regrasSRD", {
        name: "Regras SRD de referência",
        hint: "Compêndios do dnd5e usados para validar magias e calibrar estatísticas.",
        scope: "world",
        config: true,
        type: String,
        choices: {
            "2014": "SRD 5.1 (D&D 5e 2014)",
            "2024": "SRD 5.2 (D&D 5e 2024)"
        },
        default: "2014"
    });

    game.settings.register("subdm-ia-assistant", "systemPrompt", {
        name: "Prompt do Sistema",
        hint: "Prompt do sistema para a IA gerar NPCs",
        scope: "world",
        config: true,
        type: String,
        default: `Você é um gerador de NPCs para D&D 5e. Responda SEMPRE apenas com um objeto JSON válido, sem markdown, sem texto fora do JSON.

Exemplo de saída válida:
{
  "nome": "Grokk, o Cortador",
  "raca": "orc",
  "tipo": "humanoide",
  "alinhamento": "caótico mau",
  "hp": 27,
  "ac": 13,
  "for": 16, "des": 12, "con": 14, "int": 8, "sab": 10, "car": 9,
  "ataques": [
  { "nome": "Machado Grande", "dano": "1d12+3", "tipo": "slashing", "descricao": "Ataque corpo a corpo com machado." }
  ],
  "magias": [
  { "nome": "Light", "nivel": 0, "descricao": "Faz um objeto emitir luz." }
  ],
  "habilidades": [
  { "nome": "Fúria Orc", "descricao": "Vantagem em ataques quando com pouca vida." }
  ]
}

Regras estritas:
- Todos os números devem ser números JSON, nunca strings.
- "magias" deve ser [] se o NPC não conjura magias.
- Nomes de magias devem ser os nomes oficiais em inglês do SRD, escolhidos da lista fornecida.
- Use as referências do SRD fornecidas para manter HP, CA, atributos e dano fiéis ao CR pedido.
- Não invente campos além dos mostrados no exemplo.
- Não escreva nada fora do objeto JSON.`
    });
});

// v12 passa jQuery nos hooks de render, v13/ApplicationV2 passa HTMLElement
function elementoRaiz(html) {
    return html instanceof HTMLElement ? html : html?.[0];
}

// Botão no diretório de atores
Hooks.on("renderActorDirectory", (app, html) => {
    const header = elementoRaiz(html)?.querySelector(".directory-header");
    if (!header || header.querySelector(".ia-gerar-npc-btn")) return; // evita duplicar

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "ia-gerar-npc-btn";
    btn.innerText = "🤖 Gerar NPC IA";

    btn.onclick = async () => {
        if (btn.disabled) return; // trava contra clique duplo
        btn.disabled = true;
        const textoOriginal = btn.innerText;

        try {
            const params = await pedirParametrosNPC();
            if (!params) return; // usuário cancelou

            btn.innerText = "Gerando...";
            await gerarNPC(params);
        } finally {
            btn.disabled = false;
            btn.innerText = textoOriginal;
        }
    };

    header.appendChild(btn);
});

// Botões na ficha do NPC (escalonar + regenerar ataques/magias)
function adicionarBotoesFichaNPC(app, html) {
    const actor = app.actor ?? app.document;
    if (actor?.type !== "npc") return;

    const raiz = elementoRaiz(html) ?? app.element;
    const sheetHeader = raiz?.querySelector(".sheet-header") ?? raiz?.querySelector(".window-content");
    if (!sheetHeader || sheetHeader.querySelector(".ia-btns")) return; // evita duplicar

    const container = document.createElement("div");
    container.className = "ia-btns";
    container.style.display = "flex";
    container.style.gap = "5px";
    container.style.margin = "5px";

    const btnScale = document.createElement("button");
    btnScale.type = "button";
    btnScale.innerText = "⚖️ Escalonar IA";
    btnScale.onclick = async () => {
        if (btnScale.disabled) return;
        btnScale.disabled = true;
        try {
            const relacao = await pedirOpcoesEscalonamento(actor);
            if (relacao) await escalarNPC(actor, relacao);
        } finally {
            btnScale.disabled = false;
        }
    };

    const btnRegen = document.createElement("button");
    btnRegen.type = "button";
    btnRegen.innerText = "🔄 Regenerar Ataques/Magias";
    btnRegen.onclick = async () => {
        if (btnRegen.disabled) return; // trava contra clique duplo
        btnRegen.disabled = true;
        const textoOriginal = btnRegen.innerText;

        try {
            const opcoes = await pedirOpcoesRegeneracao(actor);
            if (!opcoes) return;
            if (!opcoes.regenerarAtaques && !opcoes.regenerarMagias) {
                ui.notifications.warn("Selecione ao menos ataques ou magias para regenerar.");
                return;
            }

            btnRegen.innerText = "Gerando...";
            await regenerarAtaquesEMagias(actor, opcoes); // já notifica sucesso/erro
        } finally {
            btnRegen.disabled = false;
            btnRegen.innerText = textoOriginal;
        }
    };

    container.appendChild(btnScale);
    container.appendChild(btnRegen);
    sheetHeader.appendChild(container);
}

// fichas antigas (ApplicationV1) e fichas do dnd5e 5.x (ApplicationV2)
Hooks.on("renderActorSheet", adicionarBotoesFichaNPC);
Hooks.on("renderActorSheetV2", adicionarBotoesFichaNPC);
