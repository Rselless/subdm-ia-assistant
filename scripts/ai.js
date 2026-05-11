// ===============================
async function enviarRequestIA(messages) {
    const endpoint = game.settings.get("subdm-ia-assistant", "aiEndpoint");
    const model = game.settings.get("subdm-ia-assistant", "aiModel");

    const resposta = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            model: model,
            messages: messages
        })
    });

    if (!resposta.ok) {
        throw new Error(`Erro HTTP: ${resposta.status}`);
    }

    const dados = await resposta.json();
    const conteudo = dados.choices?.[0]?.message?.content;
    if (!conteudo) {
        throw new Error("Resposta da IA vazia ou inválida");
    }
    return conteudo;
}

// ===============================
async function gerarNPC(promptUsuario) {
    console.log("Iniciando");

    try {
        console.log("request");

        const systemPrompt = game.settings.get("subdm-ia-assistant", "systemPrompt");
        const conteudo = await enviarRequestIA([
            { role: "system", content: systemPrompt },
            { role: "user", content: promptUsuario }
        ]);

        console.log("Conteúdo:", conteudo);

        const npc = normalizarNPC(limparJSON(conteudo));
        if (!npc) {
            ui.notifications.error("JSON inválido da IA. Verifique o prompt do sistema.");
            return;
        }

        criarNPC(npc);

    } catch (erro) {
        console.error("ERRO:", erro);
        ui.notifications.error(`Erro ao conectar com IA: ${erro.message}`);
    }
}