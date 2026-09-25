async function enviarRequestIA(messages) {
    const endpoint = game.settings.get("subdm-ia-assistant", "aiEndpoint");
    const model = game.settings.get("subdm-ia-assistant", "aiModel");
    const temperature = game.settings.get("subdm-ia-assistant", "aiTemperature");

    const resposta = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            model,
            messages,
            temperature,
            response_format: { type: "json_object" } // força saída JSON no endpoint OpenAI-compatible do Ollama
        })
    });

    if (!resposta.ok) {
        const textoErro = await resposta.text().catch(() => "");
        throw new Error(`Erro HTTP ${resposta.status}: ${textoErro}`);
    }

    const dados = await resposta.json();
    const conteudo = dados.choices?.[0]?.message?.content;
    if (!conteudo) {
        throw new Error("Resposta da IA veio vazia ou em formato inesperado.");
    }
    return conteudo;
}

async function gerarNPC(params, tentativa = 1) {
    const MAX_TENTATIVAS = 3;

    try {
        const systemPrompt = game.settings.get("subdm-ia-assistant", "systemPrompt");
        const contextoSRD = await montarContextoSRD({
            tipo: params.tipo,
            cr: params.crDesejado,
            incluirMagias: params.incluirMagias
        });
        const promptUsuario = [montarPromptUsuario(params), contextoSRD].filter(Boolean).join("\n\n");

        const conteudo = await enviarRequestIA([
            { role: "system", content: systemPrompt },
            { role: "user", content: promptUsuario }
        ]);

        const bruto = limparJSON(conteudo);

        if (!bruto) {
            if (tentativa < MAX_TENTATIVAS) {
                console.warn(`subdm-ia-assistant | Tentativa ${tentativa} falhou ao parsear JSON, tentando novamente...`);
                return gerarNPC(params, tentativa + 1);
            }
            ui.notifications.error("A IA não retornou um JSON válido após várias tentativas. Veja o console.");
            return null;
        }

        if (typeof bruto !== "object" || Array.isArray(bruto)) {
            throw new Error("A IA retornou JSON, mas não um objeto de NPC.");
        }

        const npc = await limitarEstatisticasPorCR(normalizarNPC(bruto), params.crDesejado);

        // o que foi interpretado do pedido prevalece sobre o que a IA devolveu
        npc.tipo = MAPA_TIPO_CRIATURA[params.tipo] || npc.tipo;
        if (params.raca) npc.raca = params.raca;
        if (params.alinhamento) npc.alinhamento = params.alinhamento;

        npc.arte = await escolherArteNPC(params, npc);
        if (npc.arte) console.log(`subdm-ia-assistant | Arte do NPC baseada em "${npc.arte.fonte}"`);

        return await criarNPC(npc, params.crDesejado);

    } catch (erro) {
        console.error("subdm-ia-assistant | Erro:", erro);
        ui.notifications.error(`Erro ao conectar com IA: ${erro.message}`);
        return null;
    }
}

// Monta um prompt pedindo só os campos selecionados, usando o NPC atual como contexto
function montarPromptRegeneracao(actor, opcoes) {
    const partes = [];
    if (opcoes.regenerarAtaques) partes.push('"ataques"');
    if (opcoes.regenerarMagias) partes.push('"magias"');

    return `O NPC já existe com estas características:
- Nome: ${actor.name}
- Tipo: ${actor.system.details.type?.value || "desconhecido"}
- CR atual: ${actor.system.details.cr}
- Atributos: FOR ${actor.system.abilities.str.value}, DES ${actor.system.abilities.dex.value}, CON ${actor.system.abilities.con.value}, INT ${actor.system.abilities.int.value}, SAB ${actor.system.abilities.wis.value}, CAR ${actor.system.abilities.cha.value}

Gere apenas os campos ${partes.join(" e ")} para este NPC, coerentes com o perfil acima.
${opcoes.instrucao ? `Instrução adicional: ${opcoes.instrucao}` : ""}

Responda em JSON contendo APENAS as chaves solicitadas (${partes.join(", ")}), no mesmo formato do exemplo do prompt de sistema. Não inclua outros campos.`;
}

async function regenerarAtaquesEMagias(actor, opcoes, tentativa = 1) {
    const MAX_TENTATIVAS = 3;

    try {
        const systemPrompt = game.settings.get("subdm-ia-assistant", "systemPrompt");
        const contextoSRD = await montarContextoSRD({
            tipo: actor.system.details.type?.value,
            cr: actor.system.details.cr ?? 1,
            incluirMagias: opcoes.regenerarMagias,
            incluirReferencias: opcoes.regenerarAtaques
        });
        const promptUsuario = [montarPromptRegeneracao(actor, opcoes), contextoSRD].filter(Boolean).join("\n\n");

        const conteudo = await enviarRequestIA([
            { role: "system", content: systemPrompt },
            { role: "user", content: promptUsuario }
        ]);

        const bruto = limparJSON(conteudo);

        // valida que pelo menos um dos campos pedidos veio, e no formato certo (array)
        const ataquesValidos = !opcoes.regenerarAtaques || Array.isArray(bruto?.ataques);
        const magiasValidas = !opcoes.regenerarMagias || Array.isArray(bruto?.magias);

        if (!bruto || !ataquesValidos || !magiasValidas) {
            if (tentativa < MAX_TENTATIVAS) {
                console.warn(`subdm-ia-assistant | Tentativa ${tentativa} de regeneração falhou, tentando novamente...`);
                return regenerarAtaquesEMagias(actor, opcoes, tentativa + 1);
            }
            ui.notifications.error("A IA não retornou dados válidos após várias tentativas.");
            return false;
        }

        if (opcoes.regenerarAtaques) {
            await aplicarAtaques(actor, normalizarAtaques(bruto.ataques));
        }

        if (opcoes.regenerarMagias) {
            await aplicarMagias(actor, normalizarMagias(bruto.magias));
        }

        ui.notifications.success(`${actor.name} atualizado!`);
        return true;

    } catch (erro) {
        console.error("subdm-ia-assistant | Erro na regeneração:", erro);
        ui.notifications.error(`Erro ao regenerar: ${erro.message}`);
        return false;
    }
}