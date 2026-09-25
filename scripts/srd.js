// Usa os compêndios SRD do sistema dnd5e como fonte da verdade para limitar o que a IA pode criar

const PACKS_SRD = {
    "2014": { magias: "dnd5e.spells", monstros: "dnd5e.monsters" },
    "2024": { magias: "dnd5e.spells24", monstros: "dnd5e.actors24" }
};

function packsSRD() {
    return PACKS_SRD[game.settings.get("subdm-ia-assistant", "regrasSRD")] ?? PACKS_SRD["2014"];
}

// Normaliza nomes para comparação ("Fire Bolt", "fire-bolt", "FIRE BOLT" → "fire bolt")
function chaveNome(nome) {
    return String(nome ?? "")
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

// Nível máximo de magia coerente com o CR (ex: CR 5 → até 3º nível)
function nivelMaxMagiaPorCR(cr) {
    if (cr < 1) return 1;
    return Math.min(9, Math.ceil(cr / 2));
}

async function indiceMagiasSRD() {
    const pack = game.packs.get(packsSRD().magias);
    if (!pack) return null;
    const index = await pack.getIndex({ fields: ["system.level"] });
    return { pack, entradas: Array.from(index).filter(e => e.type === "spell") };
}

async function indiceMonstrosSRD() {
    const pack = game.packs.get(packsSRD().monstros);
    if (!pack) return null;
    const index = await pack.getIndex({
        fields: ["img", "prototypeToken.texture.src", "system.details.cr", "system.details.type.value", "system.attributes.hp.max"]
    });
    const entradas = Array.from(index).filter(e => e.type === "npc" && typeof e.system?.details?.cr === "number");
    return { pack, entradas };
}

// Lista de magias do SRD até o nível permitido, agrupadas por nível, para colocar no prompt
async function textoMagiasPermitidas(cr) {
    const indice = await indiceMagiasSRD();
    if (!indice) return "";

    const nivelMax = nivelMaxMagiaPorCR(cr);
    const porNivel = {};
    for (let e of indice.entradas) {
        const nivel = e.system?.level ?? 0;
        if (nivel > nivelMax) continue;
        (porNivel[nivel] ??= []).push(e.name);
    }

    const linhas = Object.keys(porNivel).sort((a, b) => a - b)
        .map(nivel => `Nível ${nivel}: ${porNivel[nivel].sort().join(", ")}`);

    return `Magias permitidas (SRD). Use SOMENTE magias desta lista, com o nome EXATO em inglês como aparece aqui; qualquer outra será descartada:
${linhas.join("\n")}`;
}

function resumoMonstro(ator) {
    const s = ator.system;
    const a = s.abilities;
    const ataques = ator.items
        .filter(i => i.type === "weapon")
        .map(i => `${i.name} (${i.system.damage?.base?.formula || "?"})`);
    return `- ${ator.name} (CR ${s.details.cr}, ${s.details.type?.value}): HP ${s.attributes.hp.max}, CA ${s.attributes.ac.value}, `
        + `FOR ${a.str.value} DES ${a.dex.value} CON ${a.con.value} INT ${a.int.value} SAB ${a.wis.value} CAR ${a.cha.value}`
        + (ataques.length ? `, Ataques: ${ataques.join(", ")}` : "");
}

// Faixa de HP real dos monstros SRD com o CR mais próximo do desejado
async function faixaHpPorCR(cr) {
    const indice = await indiceMonstrosSRD();
    if (!indice?.entradas.length) return null;

    const crMaisProximo = indice.entradas
        .map(e => e.system.details.cr)
        .reduce((melhor, atual) => Math.abs(atual - cr) < Math.abs(melhor - cr) ? atual : melhor);

    const hps = indice.entradas
        .filter(e => e.system.details.cr === crMaisProximo)
        .map(e => e.system.attributes?.hp?.max)
        .filter(hp => typeof hp === "number" && hp > 0);
    if (!hps.length) return null;

    return { min: Math.min(...hps), max: Math.max(...hps) };
}

// Monstros SRD de CR (e de preferência tipo) mais próximos, resumidos como referência de estatísticas
async function textoMonstrosReferencia(tipo, cr, qtd = 3) {
    const indice = await indiceMonstrosSRD();
    if (!indice?.entradas.length) return "";

    const tipoEn = MAPA_TIPO_CRIATURA[tipo] ?? tipo;
    const escolhidos = indice.entradas
        .map(e => ({
            e,
            distancia: Math.abs(e.system.details.cr - cr) + (e.system.details.type?.value === tipoEn ? 0 : 1.5)
        }))
        .sort((x, y) => x.distancia - y.distancia)
        .slice(0, qtd);

    const docs = await Promise.all(escolhidos.map(({ e }) => indice.pack.getDocument(e._id)));
    const faixa = await faixaHpPorCR(cr);

    return `Referências oficiais do SRD para calibrar as estatísticas (mantenha HP, CA, atributos e dano na mesma ordem de grandeza):
${docs.filter(Boolean).map(resumoMonstro).join("\n")}`
        + (faixa ? `\nFaixa de HP de criaturas SRD com esse CR: ${faixa.min}–${faixa.max}.` : "");
}

// Contexto completo de regras a anexar no prompt do usuário
async function montarContextoSRD({ tipo, cr, incluirMagias, incluirReferencias = true }) {
    const partes = [];
    try {
        if (incluirReferencias) partes.push(await textoMonstrosReferencia(tipo, cr));
        if (incluirMagias) partes.push(await textoMagiasPermitidas(cr));
    } catch (err) {
        console.warn("subdm-ia-assistant | Falha ao ler compêndios SRD, seguindo sem contexto:", err);
    }
    return partes.filter(Boolean).join("\n\n");
}

// Limita HP/CA/atributos a valores plausíveis para o CR, com base no SRD
async function limitarEstatisticasPorCR(npc, cr) {
    const limitar = (v, min, max) => Math.min(max, Math.max(min, v));

    const faixa = await faixaHpPorCR(cr).catch(() => null);
    if (faixa) npc.hp = limitar(npc.hp, faixa.min, faixa.max);

    npc.ac = limitar(npc.ac, 8, 22);
    for (let chave of ["for", "des", "con", "int", "sab", "car"]) {
        npc[chave] = limitar(npc[chave], 1, 30);
    }
    return npc;
}

// Converte as magias sugeridas pela IA em itens reais do compêndio; descarta as que não existem no SRD
async function itensDeMagiaSRD(magias) {
    if (!magias.length) return [];

    const indice = await indiceMagiasSRD();
    if (!indice) {
        console.warn("subdm-ia-assistant | Compêndio de magias SRD não encontrado, criando magias sem validação.");
        return magias.map(montarItemMagia);
    }

    const porNome = new Map(indice.entradas.map(e => [chaveNome(e.name), e]));
    const ids = new Set();
    const descartadas = [];
    for (let m of magias) {
        const entrada = porNome.get(chaveNome(m.nome));
        if (entrada) ids.add(entrada._id);
        else descartadas.push(m.nome);
    }

    if (descartadas.length) {
        console.warn("subdm-ia-assistant | Magias fora do SRD descartadas:", descartadas);
        ui.notifications.warn(`Magias fora do SRD descartadas: ${descartadas.join(", ")}`);
    }

    const docs = await Promise.all([...ids].map(id => indice.pack.getDocument(id)));
    return docs.filter(Boolean).map(doc => {
        const dados = game.items.fromCompendium(doc);
        dados.system.method = "innate";
        return dados;
    });
}


// ---------------------------------------------------------------------------
// Arte do NPC: reutiliza retrato/token dos monstros SRD mais parecidos
// ---------------------------------------------------------------------------

// Raças não humanas que têm arte própria no SRD (nomes de monstro em inglês, em ordem de preferência)
const ARTE_POR_RACA = {
    "orc": ["Orc"], "meio-orc": ["Orc"], "goblin": ["Goblin"], "hobgoblin": ["Hobgoblin"],
    "bugbear": ["Bugbear"], "kobold": ["Kobold"], "gnoll": ["Gnoll"], "homem-lagarto": ["Lizardfolk"]
};

// Função/ocupação (texto normalizado) → monstros SRD que a representam
const ARTE_POR_FUNCAO = {
    "guarda": ["Guard"], "sentinela": ["Guard"], "vigia": ["Guard"], "carcereiro": ["Guard"],
    "capitao": ["Bandit Captain", "Knight"], "bandido": ["Bandit"], "salteador": ["Bandit"],
    "pirata": ["Bandit"], "ladrao": ["Spy", "Bandit"], "espiao": ["Spy"], "assassino": ["Assassin"],
    "arquimago": ["Archmage"], "mago": ["Mage"], "maga": ["Mage"], "feiticeiro": ["Mage"], "feiticeira": ["Mage"],
    "bruxo": ["Mage"], "bruxa": ["Mage"], "aprendiz": ["Apprentice Wizard", "Mage"],
    "berserker": ["Berserker"], "barbaro": ["Berserker"], "gladiador": ["Gladiator"],
    "cavaleiro": ["Knight"], "paladino": ["Knight"], "nobre": ["Noble"], "aristocrata": ["Noble"],
    "sacerdote": ["Priest"], "sacerdotisa": ["Priest"], "clerigo": ["Priest"], "cleriga": ["Priest"],
    "acolito": ["Acolyte"], "cultista": ["Cultist"], "fanatico": ["Cult Fanatic", "Cultist"],
    "druida": ["Druid"], "batedor": ["Scout"], "cacador": ["Scout"], "patrulheiro": ["Scout"], "arqueiro": ["Scout"],
    "veterano": ["Veteran", "Warrior Veteran"], "soldado": ["Veteran", "Warrior Veteran", "Guard"],
    "mercenario": ["Veteran", "Warrior Veteran"], "capanga": ["Thug", "Tough"], "brutamontes": ["Thug", "Tough"],
    "plebeu": ["Commoner"], "campones": ["Commoner"], "aldeao": ["Commoner"], "mercador": ["Commoner"],
    "comerciante": ["Commoner"], "ferreiro": ["Commoner"], "taverneiro": ["Commoner"], "fazendeiro": ["Commoner"],
    "zumbi": ["Zombie"], "esqueleto": ["Skeleton"], "carnical": ["Ghoul"], "fantasma": ["Ghost"],
    "vampiro": ["Vampire", "Vampire Spawn"], "lobo": ["Wolf"], "urso": ["Brown Bear"], "aranha": ["Giant Spider"],
    "ogro": ["Ogre"], "troll": ["Troll"], "golem": ["Stone Golem", "Flesh Golem"]
};

function temArte(entrada) {
    return entrada?.img && !entrada.img.includes("mystery-man");
}

function arteDaEntrada(entrada) {
    return { img: entrada.img, token: entrada.prototypeToken?.texture?.src || entrada.img, fonte: entrada.name };
}

// Pede para a IA escolher, entre as artes do mesmo tipo, a que melhor representa o NPC
async function escolherArteComIA(descricao, candidatos) {
    const nomes = candidatos.map(e => e.name);
    const conteudo = await enviarRequestIA([
        { role: "system", content: "Você escolhe a imagem mais adequada para um NPC. Responda apenas com JSON no formato {\"arte\": \"<nome exato da lista>\"}." },
        { role: "user", content: `NPC: "${descricao}"\n\nImagens disponíveis (nomes de criaturas):\n${nomes.join(", ")}\n\nEscolha a que mais se parece visualmente com o NPC.` }
    ]);
    const escolha = chaveNome(limparJSON(conteudo)?.arte);
    return candidatos.find(e => chaveNome(e.name) === escolha) ?? null;
}

// Retorna { img, token, fonte } para o NPC, ou null se nada for encontrado
async function escolherArteNPC(params, npc) {
    try {
        const indice = await indiceMonstrosSRD();
        if (!indice) return null;

        const comArte = indice.entradas.filter(temArte);
        const porNome = new Map(comArte.map(e => [chaveNome(e.name), e]));
        const primeiraQueExiste = nomes => nomes?.map(n => porNome.get(chaveNome(n))).find(Boolean);

        // 1. raça não humana com arte própria
        const porRaca = primeiraQueExiste(ARTE_POR_RACA[npc.raca]);
        if (porRaca) return arteDaEntrada(porRaca);

        // 2. função/ocupação citada na descrição
        const texto = normalizarTexto(params.descricao);
        const funcao = Object.keys(ARTE_POR_FUNCAO)
            .sort((a, b) => b.length - a.length)
            .find(k => contemTermo(texto, k));
        const porFuncao = primeiraQueExiste(ARTE_POR_FUNCAO[funcao]);
        if (porFuncao) return arteDaEntrada(porFuncao);

        // 3. IA escolhe entre as artes do mesmo tipo de criatura
        const mesmoTipo = comArte.filter(e => e.system.details.type?.value === npc.tipo);
        if (mesmoTipo.length) {
            const escolhida = await escolherArteComIA(params.descricao, mesmoTipo.slice(0, 120)).catch(err => {
                console.warn("subdm-ia-assistant | IA não conseguiu escolher arte:", err);
                return null;
            });
            if (escolhida) return arteDaEntrada(escolhida);

            // 4. mesmo tipo com CR mais próximo
            const maisProximo = mesmoTipo.reduce((melhor, e) =>
                Math.abs(e.system.details.cr - params.crDesejado) < Math.abs(melhor.system.details.cr - params.crDesejado) ? e : melhor);
            return arteDaEntrada(maisProximo);
        }
    } catch (err) {
        console.warn("subdm-ia-assistant | Falha ao escolher arte do NPC:", err);
    }
    return null;
}
