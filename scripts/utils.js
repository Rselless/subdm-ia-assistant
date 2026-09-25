// Abre o formulário de geração: descrição em texto livre + campos opcionais que sobrescrevem a interpretação
async function pedirParametrosNPC() {
    const dados = await foundry.applications.api.DialogV2.wait({
        window: { title: "Gerar NPC com IA" },
        position: { width: 480 },
        content: `
            <div class="form-group stacked">
                <label>Descrição</label>
                <textarea name="descricao" rows="3" required
                    placeholder="ex: Humano, baixo, guarda, mau, parear com a party"></textarea>
                <p class="hint">Separe as ideias por vírgula. Entende raça/tipo, alinhamento, função, CR ("CR 3") e força relativa à party ("parear com a party", "chefe", "lacaio").</p>
            </div>
            <fieldset>
                <legend>Sobrescrever (opcional)</legend>
                <div class="form-group">
                    <label>Tipo de criatura</label>
                    <select name="tipo">
                        <option value="">Automático</option>
                        <option value="humanoide">Humanoide</option>
                        <option value="besta">Besta</option>
                        <option value="morto-vivo">Morto-vivo</option>
                        <option value="dragao">Dragão</option>
                        <option value="fada">Fada</option>
                        <option value="gigante">Gigante</option>
                        <option value="monstruosidade">Monstruosidade</option>
                        <option value="aberracao">Aberração</option>
                        <option value="construto">Construto</option>
                        <option value="corruptor">Corruptor</option>
                        <option value="elemental">Elemental</option>
                        <option value="celestial">Celestial</option>
                        <option value="planta">Planta</option>
                        <option value="limo">Limo</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>CR</label>
                    <input type="number" name="crDesejado" min="0" max="30" step="0.125" placeholder="Automático">
                </div>
                <div class="form-group">
                    <label>Magias</label>
                    <select name="magias">
                        <option value="">Automático</option>
                        <option value="sim">Sim</option>
                        <option value="nao">Não</option>
                    </select>
                </div>
            </fieldset>
        `,
        buttons: [
            {
                action: "gerar",
                label: "Gerar",
                default: true,
                callback: (event, button) => {
                    const el = button.form.elements;
                    return {
                        descricao: el.descricao.value.trim(),
                        tipo: el.tipo.value,
                        crDesejado: el.crDesejado.value,
                        magias: el.magias.value
                    };
                }
            },
            { action: "cancelar", label: "Cancelar", callback: () => null }
        ],
        rejectClose: false // se fechar sem clicar em nada, retorna null em vez de lançar erro
    });

    if (!dados) return null;
    if (!dados.descricao) {
        ui.notifications.warn("Escreva uma descrição para o NPC.");
        return null;
    }
    return resolverParametrosNPC(dados);
}

function normalizarTexto(texto) {
    return String(texto ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

// Palavra (ou expressão/regex) inteira no texto normalizado
function contemTermo(texto, termo) {
    return new RegExp(`(^|[^a-z])${termo}([^a-z]|$)`).test(texto);
}

// Raças comuns → todas são humanoides; o valor é o nome exibido na ficha
const RACAS_HUMANOIDES = {
    "humano": "humano", "humana": "humano",
    "elfo": "elfo", "elfa": "elfo",
    "meio elfo": "meio-elfo", "meio-elfo": "meio-elfo", "meio elfa": "meio-elfo", "meio-elfa": "meio-elfo",
    "meio orc": "meio-orc", "meio-orc": "meio-orc", "meia orc": "meio-orc", "meia-orc": "meio-orc",
    "anao": "anão",
    "halfling": "halfling", "pequenino": "halfling",
    "gnomo": "gnomo", "gnoma": "gnomo",
    "tiefling": "tiefling", "draconato": "draconato", "draconata": "draconato",
    "orc": "orc", "goblin": "goblin", "hobgoblin": "hobgoblin", "bugbear": "bugbear",
    "kobold": "kobold", "gnoll": "gnoll", "homem lagarto": "homem-lagarto", "homem-lagarto": "homem-lagarto"
};

// Palavras que indicam o tipo de criatura (valores são chaves de MAPA_TIPO_CRIATURA)
const TERMOS_TIPO = {
    "humanoide": "humanoide",
    "besta": "besta", "animal": "besta", "fera": "besta",
    "morto vivo": "morto-vivo", "morto-vivo": "morto-vivo", "zumbi": "morto-vivo", "esqueleto": "morto-vivo",
    "vampiro": "morto-vivo", "fantasma": "morto-vivo", "lich": "morto-vivo", "carnical": "morto-vivo",
    "dragao": "dragao", "wyvern": "dragao",
    "fada": "fada", "feerico": "fada",
    "gigante": "gigante", "ogro": "gigante", "troll": "gigante",
    "monstruosidade": "monstruosidade", "monstro": "monstruosidade", "quimera": "monstruosidade",
    "aberracao": "aberracao", "beholder": "aberracao",
    "construto": "construto", "golem": "construto", "automato": "construto",
    "corruptor": "corruptor", "demonio": "corruptor", "diabo": "corruptor", "infernal": "corruptor",
    "elemental": "elemental",
    "celestial": "celestial", "anjo": "celestial",
    "planta": "planta", "limo": "limo", "gosma": "limo"
};

const TERMOS_CONJURADOR = [
    "mago", "maga", "feiticeiro", "feiticeira", "bruxo", "bruxa", "clerigo", "cleriga", "druida",
    "sacerdote", "sacerdotisa", "xama", "conjurador", "conjuradora", "necromante", "arcanista",
    "bardo", "barda", "magia", "magias", "curandeiro", "curandeira", "cultista", "profeta"
];

function extrairAlinhamento(t) {
    const etica = contemTermo(t, "(leal|ordeiro|ordeira)") ? "leal"
        : contemTermo(t, "(caotico|caotica)") ? "caótico" : null;
    const moral = contemTermo(t, "(bom|boa|bondoso|bondosa)") ? "bom"
        : contemTermo(t, "(mau|ma|maligno|maligna|malvado|malvada|cruel|perverso|perversa)") ? "mau" : null;
    const neutro = contemTermo(t, "(neutro|neutra)");

    if (etica && moral) return `${etica} ${moral}`;
    if (moral) return `neutro ${moral}`;
    if (etica) return `${etica} neutro`;
    if (neutro) return "neutro";
    return null;
}

// "CR 3", "ND 1/2", "cr: 0.25"
function extrairCRExplicito(t) {
    const match = t.match(/(^|[^a-z])(cr|nd)\s*[:=]?\s*(\d+\s*\/\s*\d+|\d+(?:[.,]\d+)?)/);
    if (!match) return null;
    const [num, den] = match[3].replace(/\s/g, "").replace(",", ".").split("/");
    const valor = den ? Number(num) / Number(den) : Number(num);
    return Number.isFinite(valor) ? valor : null;
}

// Força relativa à party (chave de RELACOES_PARTY)
function extrairRelacaoParty(t) {
    if (contemTermo(t, "(chefe|chefao|boss|elite|lider|dificil|mortal|poderoso|poderosa)")) return "chefe";
    if (contemTermo(t, "(lacaio|lacaios|capanga|capangas|minion|fraco|fraca|facil)")) return "lacaio";
    if (contemTermo(t, "(parear|pareado|pareada|parelho|equilibrado|equilibrada|a altura|party|grupo|jogadores)")) {
        return "pareado";
    }
    return null;
}

// Interpreta a descrição livre em parâmetros estruturados (o que não for reconhecido vira conceito para a IA)
function interpretarDescricao(descricao) {
    const t = normalizarTexto(descricao);
    const resultado = { incluirMagias: null };

    // expressões mais longas primeiro ("meio orc" antes de "orc")
    const raca = Object.keys(RACAS_HUMANOIDES)
        .sort((a, b) => b.length - a.length)
        .find(r => contemTermo(t, r));
    if (raca) {
        resultado.raca = RACAS_HUMANOIDES[raca];
        resultado.tipo = "humanoide";
    }

    const termoTipo = Object.keys(TERMOS_TIPO)
        .sort((a, b) => b.length - a.length)
        .find(k => contemTermo(t, k));
    if (termoTipo) resultado.tipo = TERMOS_TIPO[termoTipo];

    resultado.alinhamento = extrairAlinhamento(t);

    if (contemTermo(t, "(sem magias?|nao conjura)")) resultado.incluirMagias = false;
    else if (TERMOS_CONJURADOR.some(k => contemTermo(t, k))) resultado.incluirMagias = true;

    resultado.crExplicito = extrairCRExplicito(t);
    resultado.relacaoParty = extrairRelacaoParty(t);
    return resultado;
}

// Junta: campos do formulário > interpretação do texto > padrões
function resolverParametrosNPC(dados) {
    const interpretado = interpretarDescricao(dados.descricao);
    const notas = [];

    let crDesejado;
    if (dados.crDesejado !== "" && Number.isFinite(Number(dados.crDesejado))) {
        crDesejado = Number(dados.crDesejado);
        notas.push("definido no formulário");
    } else if (interpretado.crExplicito !== null) {
        crDesejado = interpretado.crExplicito;
        notas.push("citado na descrição");
    } else if (interpretado.relacaoParty) {
        const party = infoParty();
        if (party) {
            crDesejado = crParaParty(party, interpretado.relacaoParty);
            notas.push(`${interpretado.relacaoParty} com a party (nível ${party.nivel}, ${party.qtd} personagens)`);
        } else {
            crDesejado = 1;
            ui.notifications.warn("Nenhuma party (ator do tipo Grupo com personagens) encontrada; usando CR 1.");
            notas.push("party não encontrada");
        }
    } else {
        crDesejado = 1;
        notas.push("padrão");
    }
    crDesejado = arredondarCR(Math.max(0, Math.min(30, crDesejado)));

    const incluirMagias = dados.magias === "sim" ? true
        : dados.magias === "nao" ? false
        : interpretado.incluirMagias ?? false;

    const params = {
        descricao: dados.descricao,
        tipo: dados.tipo || interpretado.tipo || "humanoide",
        raca: interpretado.raca ?? null,
        alinhamento: interpretado.alinhamento,
        crDesejado,
        incluirMagias
    };

    const resumo = [
        params.raca ? `${params.tipo} (${params.raca})` : params.tipo,
        params.alinhamento,
        `CR ${params.crDesejado} (${notas.join(", ")})`,
        params.incluirMagias ? "com magias" : "sem magias"
    ].filter(Boolean).join(" · ");
    ui.notifications.info(`Interpretado: ${resumo}`);

    return params;
}

// Converte os parâmetros em instrução para a IA; o texto livre é a fonte do conceito, o resto é obrigatório
function montarPromptUsuario(params) {
    const restricoes = [
        `- Tipo de criatura: ${params.tipo}`,
        params.raca ? `- Raça: ${params.raca}` : null,
        params.alinhamento ? `- Alinhamento: ${params.alinhamento}` : null,
        `- Nível de desafio (CR) alvo: ${params.crDesejado}`,
        `- Magias: ${params.incluirMagias ? "inclua magias apropriadas para o conceito" : "não incluir magias, deixe o array vazio"}`
    ].filter(Boolean).join("\n");

    return `Pedido do mestre (texto livre, é a fonte do conceito): "${params.descricao}"

Restrições obrigatórias, já interpretadas do pedido (respeite exatamente):
${restricoes}

Como interpretar o pedido:
- Palavras de função/ocupação (ex: guarda, mercador, assassino) definem os ataques, o equipamento e as habilidades.
- Adjetivos soltos (ex: baixo, velho, cicatrizado, nervoso) descrevem aparência ou personalidade; use-os nas descrições e no nome, não como regra.
- Crie um nome próprio adequado à raça e ao conceito.
- Estatísticas coerentes com o CR alvo e com as referências do SRD abaixo.`;
}

// Pergunta a força do NPC em relação à party antes de escalonar; retorna a chave de RELACOES_PARTY
async function pedirOpcoesEscalonamento(actor) {
    const party = infoParty();
    if (!party) {
        ui.notifications.warn("Nenhuma party (ator do tipo Grupo com personagens) encontrada para escalonar.");
        return null;
    }

    const opcoes = Object.keys(RELACOES_PARTY).map(chave => {
        const cr = crParaParty(party, chave);
        const selecionado = chave === "pareado" ? "selected" : "";
        return `<option value="${chave}" ${selecionado}>${RELACOES_PARTY[chave].rotulo} (CR ${cr})</option>`;
    }).join("");

    return await foundry.applications.api.DialogV2.wait({
        window: { title: `Escalonar - ${actor.name}` },
        content: `
            <p>Party: nível médio ${party.nivel}, ${party.qtd} personagens. CR atual do NPC: ${actor.system.details.cr ?? "?"}.</p>
            <div class="form-group">
                <label>Força em relação à party</label>
                <select name="relacao">${opcoes}</select>
            </div>
        `,
        buttons: [
            {
                action: "confirmar",
                label: "Escalonar",
                default: true,
                callback: (event, button) => button.form.elements.relacao.value
            },
            { action: "cancelar", label: "Cancelar", callback: () => null }
        ],
        rejectClose: false
    });
}

// Pergunta o que regenerar em um NPC já existente e se há alguma instrução extra
async function pedirOpcoesRegeneracao(actor) {
    return await foundry.applications.api.DialogV2.wait({
        window: { title: `Regenerar - ${actor.name}` },
        content: `
            <div class="form-group">
                <label>
                    <input type="checkbox" name="regenerarAtaques" checked>
                    Regenerar ataques
                </label>
            </div>
            <div class="form-group">
                <label>
                    <input type="checkbox" name="regenerarMagias">
                    Regenerar magias
                </label>
            </div>
            <div class="form-group">
                <label>Instrução extra (opcional)</label>
                <input type="text" name="instrucao" placeholder="ex: focar em ataques de fogo, adicionar magias de cura...">
            </div>
        `,
        buttons: [
            {
                action: "confirmar",
                label: "Regenerar",
                default: true,
                callback: (event, button) => ({
                    regenerarAtaques: button.form.elements.regenerarAtaques.checked,
                    regenerarMagias: button.form.elements.regenerarMagias.checked,
                    instrucao: button.form.elements.instrucao.value.trim()
                })
            },
            { action: "cancelar", label: "Cancelar", callback: () => null }
        ],
        rejectClose: false
    });
}
