// ===============================
Hooks.once("init", () => {
    console.log("🟢 IA NPC BLINDADA inicializada!");

    // Register settings early so they are available to all module code
    game.settings.register("subdm-ia-assistant", "aiEndpoint", {
        name: "AI Endpoint",
        hint: "URL do endpoint da IA local (ex: http://localhost:11434/v1/chat/completions)",
        scope: "world",
        config: true,
        type: String,
        default: "http://localhost:11434/v1/chat/completions"
    });

    game.settings.register("subdm-ia-assistant", "aiModel", {
        name: "Modelo da IA",
        hint: "Nome do modelo a usar (ex: llama3.1)",
        scope: "world",
        config: true,
        type: String,
        default: "llama3.1"
    });

    game.settings.register("subdm-ia-assistant", "systemPrompt", {
        name: "Prompt do Sistema",
        hint: "Prompt do sistema para a IA gerar NPCs",
        scope: "world",
        config: true,
        type: String,
        default: `Crie um NPC para D&D 5e baseado na descrição do usuário. Responda APENAS com JSON válido no seguinte formato:
{
  "nome": "Nome do NPC",
  "raca": "Raca (ex: humano)",
  "alinhamento": "Alinhamento (ex: neutral)",
  "hp": 50,
  "ac": 15,
  "for": 14,
  "des": 12,
  "con": 16,
  "int": 10,
  "sab": 13,
  "car": 11,
  "ataques": [
    {
      "nome": "Ataque Básico",
      "dano": "1d8+3",
      "tipo": "slashing",
      "descricao": "Descrição do ataque"
    }
  ],
  "habilidades": [
    {
      "nome": "Habilidade Especial",
      "descricao": "Descrição da habilidade"
    }
  ]
}
Nunca deixe campos vazios. Use valores numéricos para atributos e HP/AC.`
    });
});

// ===============================
Hooks.on("renderActorDirectory", (app, html) => {
    const btn = document.createElement("button");
    btn.innerText = "Gerar NPC IA";

    btn.onclick = async () => {
        console.log("🟡 Botão clicado");
        const prompt = await pedirDescricaoNPC();
        if (prompt) gerarNPC(prompt);
    };

    html.querySelector(".directory-header")?.appendChild(btn);
});

// ===============================
Hooks.on("renderActorSheet", (app, html) => {
    const actor = app.actor;
    if (actor.type !== "npc") return;

    if (html[0].querySelector(".ia-btns")) return;

    const container = document.createElement("div");
    container.className = "ia-btns";
    container.style.display = "flex";
    container.style.gap = "5px";
    container.style.margin = "5px";

    const btnScale = document.createElement("button");
    btnScale.innerText = "Escalonar IA";
    btnScale.onclick = () => escalarNPC(actor);

    container.appendChild(btnScale);
    container.appendChild(btnLegend);
    container.appendChild(btnDialogue);

    html[0].querySelector(".sheet-header")?.appendChild(container);
});