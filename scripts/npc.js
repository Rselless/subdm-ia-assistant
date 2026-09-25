// Mapeia tipos em português para as chaves em inglês que o sistema dnd5e espera
const MAPA_TIPO_CRIATURA = {
    "humanoide": "humanoid",
    "besta": "beast",
    "morto-vivo": "undead",
    "dragao": "dragon",
    "dragão": "dragon",
    "fada": "fey",
    "gigante": "giant",
    "monstruosidade": "monstrosity",
    "aberracao": "aberration",
    "aberração": "aberration",
    "construto": "construct",
    "elemental": "elemental",
    "planta": "plant",
    "limo": "ooze",
    "celestial": "celestial",
    "corruptor": "fiend",
    "infernal": "fiend"
};

// Nível médio e tamanho da party; null se não houver grupo com personagens
function infoParty() {
    // dnd5e 5.x: party principal (configuração do sistema) ou o primeiro grupo encontrado
    const party = game.actors.party ?? game.actors.find(a => a.type === "group");
    const pcs = party?.system?.playerCharacters ?? [];
    if (!pcs.length) return null;

    let total = 0;
    for (let pc of pcs) {
        total += pc.system?.details?.level || 1;
    }
    return { nivel: Math.round(total / pcs.length), qtd: pcs.length };
}

// Força do NPC em relação à party: multiplicador e bônus sobre o CR "pareado"
const RELACOES_PARTY = {
    lacaio: { fator: 0.25, bonus: 0, rotulo: "lacaio" },
    pareado: { fator: 1, bonus: 0, rotulo: "pareado" },
    chefe: { fator: 1.5, bonus: 1, rotulo: "chefe" }
};

// CR alvo para a party (referência do DMG: 1 criatura de CR = nível médio é um desafio justo para 4 personagens)
function crParaParty(party, relacao) {
    const { fator, bonus } = RELACOES_PARTY[relacao] ?? RELACOES_PARTY.pareado;
    const cr = party.nivel * (party.qtd / 4) * fator + bonus;
    return arredondarCR(Math.max(0, Math.min(30, cr)));
}

// Tabela "Monster Statistics by Challenge Rating" do DMG
// [cr, proficiência, CA, HP mín, HP máx, bônus de ataque, dano/rodada mín, dano/rodada máx]
const TABELA_CR = [
    [0, 2, 13, 1, 6, 3, 0, 1],
    [0.125, 2, 13, 7, 35, 3, 2, 3],
    [0.25, 2, 13, 36, 49, 3, 4, 5],
    [0.5, 2, 13, 50, 70, 3, 6, 8],
    [1, 2, 13, 71, 85, 3, 9, 14],
    [2, 2, 13, 86, 100, 3, 15, 20],
    [3, 2, 13, 101, 115, 4, 21, 26],
    [4, 2, 14, 116, 130, 5, 27, 32],
    [5, 3, 15, 131, 145, 6, 33, 38],
    [6, 3, 15, 146, 160, 6, 39, 44],
    [7, 3, 15, 161, 175, 6, 45, 50],
    [8, 3, 16, 176, 190, 7, 51, 56],
    [9, 4, 16, 191, 205, 7, 57, 62],
    [10, 4, 17, 206, 220, 7, 63, 68],
    [11, 4, 17, 221, 235, 8, 69, 74],
    [12, 4, 17, 236, 250, 8, 75, 80],
    [13, 5, 18, 251, 265, 8, 81, 86],
    [14, 5, 18, 266, 280, 8, 87, 92],
    [15, 5, 18, 281, 295, 8, 93, 98],
    [16, 5, 18, 296, 310, 9, 99, 104],
    [17, 6, 19, 311, 325, 10, 105, 110],
    [18, 6, 19, 326, 340, 10, 111, 116],
    [19, 6, 19, 341, 355, 10, 117, 122],
    [20, 6, 19, 356, 400, 10, 123, 140],
    [21, 7, 19, 401, 445, 11, 141, 158],
    [22, 7, 19, 446, 490, 11, 159, 176],
    [23, 7, 19, 491, 535, 11, 177, 194],
    [24, 7, 19, 536, 580, 12, 195, 212],
    [25, 8, 19, 581, 625, 12, 213, 230],
    [26, 8, 19, 626, 670, 12, 231, 248],
    [27, 8, 19, 671, 715, 13, 249, 266],
    [28, 8, 19, 716, 760, 13, 267, 284],
    [29, 9, 19, 761, 805, 13, 285, 302],
    [30, 9, 19, 806, 850, 14, 303, 320]
].map(([cr, prof, ac, hpMin, hpMax, atk, danoMin, danoMax]) => ({ cr, prof, ac, hpMin, hpMax, atk, danoMin, danoMax }));

// Índice da linha da tabela cuja faixa contém o valor (acima da última faixa → última linha)
function linhaPorFaixa(valor, campoMax) {
    const idx = TABELA_CR.findIndex(l => valor <= l[campoMax]);
    return idx === -1 ? TABELA_CR.length - 1 : idx;
}

function limitarIndice(idx) {
    return Math.min(TABELA_CR.length - 1, Math.max(0, idx));
}

// CR pelo método do DMG: média entre CR defensivo (HP ajustado pela CA)
// e CR ofensivo (dano por rodada ajustado pelo bônus de ataque); cada 2 pontos de diferença = 1 linha
function calcularCR({ hp, ac, danoPorRodada, modAtaque }) {
    let idxDef = linhaPorFaixa(hp, "hpMax");
    idxDef = limitarIndice(idxDef + Math.trunc((ac - TABELA_CR[idxDef].ac) / 2));

    let idxOff = linhaPorFaixa(danoPorRodada, "danoMax");
    const bonusAtaque = TABELA_CR[idxOff].prof + modAtaque;
    idxOff = limitarIndice(idxOff + Math.trunc((bonusAtaque - TABELA_CR[idxOff].atk) / 2));

    return arredondarCR((TABELA_CR[idxDef].cr + TABELA_CR[idxOff].cr) / 2);
}

// Encaixa um valor qualquer no CR válido mais próximo (0, 1/8, 1/4, 1/2, 1..30)
function arredondarCR(valor) {
    return TABELA_CR.reduce((melhor, l) => Math.abs(l.cr - valor) < Math.abs(melhor - valor) ? l.cr : melhor, 0);
}

// Maior modificador entre FOR e DES (mesma regra usada nos ataques)
function modAtaqueDe(forca, destreza) {
    return Math.max(Math.floor((forca - 10) / 2), Math.floor((destreza - 10) / 2));
}

// Dano médio por rodada: soma de todos os ataques (o NPC faz todos via Multiattack)
// modDano: modificador a somar quando a fórmula não inclui o bônus (itens do dnd5e 5.x)
function danoPorRodadaDeAtaques(ataques, modDano = 0) {
    let total = 0;
    for (let atk of ataques ?? []) {
        const match = String(atk.dano).match(/(\d+)d(\d+)\s*([+-]\s*\d+)?/);
        if (match) {
            const num = parseInt(match[1]);
            const die = parseInt(match[2]);
            const bonus = match[3] ? parseInt(match[3].replace(/\s/g, "")) : modDano;
            total += (num * (die + 1)) / 2 + bonus;
        } else {
            total += parseInt(atk.dano) || 1;
        }
    }
    return Math.max(0, total);
}

// Extrai um JSON válido de um texto que pode vir com markdown/texto extra ao redor
function limparJSON(texto) {
    if (!texto || typeof texto !== "string") return null;

    try {
        return JSON.parse(texto);
    } catch { /* tenta o fallback abaixo */ }

    const match = texto.match(/\{[\s\S]*\}/);
    if (match) {
        try {
            return JSON.parse(match[0]);
        } catch (err) {
            console.warn("subdm-ia-assistant | Falha ao extrair JSON do texto:", err, texto);
        }
    }
    return null;
}

function normalizarAtaques(ataques) {
    if (!Array.isArray(ataques)) return [];
    return ataques.map(a => ({
        nome: a?.nome || "Ataque",
        dano: a?.dano || "1d6",
        tipo: a?.tipo || "bludgeoning",
        descricao: a?.descricao || ""
    }));
}

function normalizarMagias(magias) {
    if (!Array.isArray(magias)) return [];
    return magias.map(m => ({
        nome: m?.nome || "Magia Desconhecida",
        nivel: Number.isInteger(m?.nivel) ? m.nivel : 0,
        descricao: m?.descricao || ""
    }));
}

// Preenche campos ausentes/errados com valores padrão seguros
function normalizarNPC(npc) {
    const tipoBruto = typeof npc.tipo === "string" ? npc.tipo.toLowerCase() : "humanoide";

    return {
        nome: npc.nome || "NPC Desconhecido",
        raca: npc.raca || tipoBruto,
        tipo: MAPA_TIPO_CRIATURA[tipoBruto] || "humanoid",
        alinhamento: npc.alinhamento || "neutral",

        hp: Number(npc.hp) || 10,
        ac: Number(npc.ac) || 10,

        for: Number(npc.for) || 10,
        des: Number(npc.des) || 10,
        con: Number(npc.con) || 10,
        int: Number(npc.int) || 10,
        sab: Number(npc.sab) || 10,
        car: Number(npc.car) || 10,

        ataques: normalizarAtaques(npc.ataques),
        magias: normalizarMagias(npc.magias),

        habilidades: (Array.isArray(npc.habilidades) ? npc.habilidades : []).map(h => ({
            nome: h?.nome || "Habilidade",
            descricao: h?.descricao || ""
        }))
    };
}

// Monta um weapon no formato do dnd5e 5.x (dano base + activity de ataque)
function montarItemAtaque(atk, forca, destreza) {
    // o bônus fixo ("+3") não é gravado: o dnd5e já soma o modificador do atributo no dano
    const match = String(atk.dano).match(/(\d+)d(\d+)/);
    const number = match ? parseInt(match[1]) : 1;
    const denomination = match ? parseInt(match[2]) : 6;

    // usa o maior entre FOR e DES como base do ataque (cobre criaturas ágeis e brutas)
    const ability = destreza > forca ? "dex" : "str";
    const activityId = foundry.utils.randomID();

    return {
        name: atk.nome,
        type: "weapon",
        system: {
            type: { value: "natural" },
            proficient: 1,
            equipped: true,
            description: { value: atk.descricao },
            damage: {
                base: { number, denomination, types: [atk.tipo] }
            },
            activities: {
                [activityId]: {
                    _id: activityId,
                    type: "attack",
                    activation: { type: "action", value: 1 },
                    attack: {
                        ability,
                        type: { value: "melee", classification: "weapon" }
                    },
                    damage: { includeBase: true, parts: [] }
                }
            }
        }
    };
}

function montarItemMultiattack(qtdAtaques) {
    return {
        name: "Multiattack",
        type: "feat",
        system: { description: { value: `Faz ${qtdAtaques} ataques.` } }
    };
}

function montarItemMagia(m) {
    return {
        name: m.nome,
        type: "spell",
        system: {
            level: m.nivel,
            description: { value: m.descricao },
            method: "innate"
        }
    };
}

// crAlvo: CR escolhido no formulário (as estatísticas já foram limitadas a ele pelo SRD)
async function criarNPC(npc, crAlvo) {
    const cr = crAlvo ?? calcularCR({
        hp: npc.hp,
        ac: npc.ac,
        danoPorRodada: danoPorRodadaDeAtaques(npc.ataques),
        modAtaque: modAtaqueDe(npc.for, npc.des)
    });

    const img = npc.arte?.img || "icons/svg/mystery-man.svg";
    const ator = await Actor.create({
        name: `${npc.nome} (CR ${cr})`,
        type: "npc",
        img,
        prototypeToken: { texture: { src: npc.arte?.token || img } },
        system: {
            details: {
                type: { value: npc.tipo },
                race: npc.raca,
                alignment: npc.alinhamento,
                cr: cr
            },
            abilities: {
                str: { value: npc.for },
                dex: { value: npc.des },
                con: { value: npc.con },
                int: { value: npc.int },
                wis: { value: npc.sab },
                cha: { value: npc.car }
            },
            attributes: {
                hp: { value: npc.hp, max: npc.hp },
                // no dnd5e 5.x ac.value é derivado; AC fixa precisa de calc "flat"
                ac: { calc: "flat", flat: npc.ac }
            }
        }
    });

    const items = [
        ...npc.ataques.map(atk => montarItemAtaque(atk, npc.for, npc.des)),
        ...(npc.ataques.length > 1 ? [montarItemMultiattack(npc.ataques.length)] : []),
        ...(await itensDeMagiaSRD(npc.magias)),
        ...npc.habilidades.map(h => ({
            name: h.nome,
            type: "feat",
            system: { description: { value: h.descricao } }
        }))
    ];
    if (items.length) await ator.createEmbeddedDocuments("Item", items);

    ui.notifications.success(`NPC "${npc.nome}" criado! (CR ${cr})`);
    ator.sheet.render(true);
    return ator;
}

function linhaDoCR(cr) {
    return TABELA_CR.find(l => l.cr === arredondarCR(cr));
}

// Escala o NPC para o CR adequado à party, mantendo as proporções dele:
// HP e dados de dano seguem a razão entre as médias da tabela do DMG, CA e atributos seguem a diferença entre linhas
async function escalarNPC(ator, relacao = "pareado") {
    const party = infoParty();
    if (!party) {
        ui.notifications.warn("Nenhuma party (ator do tipo Grupo com personagens) encontrada para escalonar.");
        return false;
    }

    const crAtual = arredondarCR(Number(ator.system.details.cr) || 0);
    const crAlvo = crParaParty(party, relacao);
    if (crAtual === crAlvo) {
        ui.notifications.info(`${ator.name} já está no CR ${crAlvo} (${RELACOES_PARTY[relacao].rotulo} para a party).`);
        return true;
    }

    const atual = linhaDoCR(crAtual);
    const alvo = linhaDoCR(crAlvo);
    const media = (min, max) => Math.max(1, (min + max) / 2);
    const razaoHp = media(alvo.hpMin, alvo.hpMax) / media(atual.hpMin, atual.hpMax);
    const razaoDano = media(alvo.danoMin, alvo.danoMax) / media(atual.danoMin, atual.danoMax);
    const limitar = (v, min, max) => Math.min(max, Math.max(min, v));

    const newHp = Math.max(1, Math.round(ator.system.attributes.hp.max * razaoHp));
    const newAc = limitar(ator.system.attributes.ac.value + (alvo.ac - atual.ac), 5, 25);

    const updates = {
        name: `${ator.name.replace(/\s*\(CR [^)]*\)\s*$/, "")} (CR ${crAlvo})`,
        "system.details.cr": crAlvo,
        "system.attributes.hp.value": newHp,
        "system.attributes.hp.max": newHp,
        "system.attributes.ac.calc": "flat",
        "system.attributes.ac.flat": newAc
    };

    // a proficiência já sobe sozinha com o CR; o atributo cobre o resto da diferença de bônus de ataque
    const deltaMod = (alvo.atk - alvo.prof) - (atual.atk - atual.prof);
    for (let chave of ["str", "dex", "con"]) {
        updates[`system.abilities.${chave}.value`] = limitar(ator.system.abilities[chave].value + deltaMod * 2, 1, 30);
    }

    const armas = ator.items.filter(i => i.type === "weapon" && i.system.damage?.base?.number);
    const updatesArmas = armas.map(a => ({
        _id: a.id,
        "system.damage.base.number": Math.max(1, Math.round(a.system.damage.base.number * razaoDano))
    }));

    await ator.update(updates);
    if (updatesArmas.length) await ator.updateEmbeddedDocuments("Item", updatesArmas);

    ui.notifications.success(`NPC escalado de CR ${crAtual} para CR ${crAlvo} (${RELACOES_PARTY[relacao].rotulo}, party nível ${party.nivel} com ${party.qtd} personagens).`);
    return true;
}

// Remove os items de um tipo específico do actor (usado antes de recriar ataques/magias)
async function removerItemsPorTipo(actor, tipo) {
    const idsParaRemover = actor.items.filter(i => i.type === tipo).map(i => i.id);
    if (idsParaRemover.length > 0) {
        await actor.deleteEmbeddedDocuments("Item", idsParaRemover);
    }
}

// Remove o item "Multiattack" avulso, já que ele é recriado junto com os ataques
async function removerMultiattack(actor) {
    const multi = actor.items.find(i => i.type === "feat" && i.name === "Multiattack");
    if (multi) await actor.deleteEmbeddedDocuments("Item", [multi.id]);
}

// Aplica um novo conjunto de ataques no actor (substitui os existentes)
async function aplicarAtaques(actor, ataques) {
    await removerItemsPorTipo(actor, "weapon");
    await removerMultiattack(actor);

    const abilities = actor.system.abilities;
    const items = [
        ...ataques.map(atk => montarItemAtaque(atk, abilities.str.value, abilities.dex.value)),
        ...(ataques.length > 1 ? [montarItemMultiattack(ataques.length)] : [])
    ];
    if (items.length) await actor.createEmbeddedDocuments("Item", items);

    // recalcula CR com o novo dano
    const modAtaque = modAtaqueDe(abilities.str.value, abilities.dex.value);
    await actor.update({
        "system.details.cr": calcularCR({
            hp: actor.system.attributes.hp.max,
            ac: actor.system.attributes.ac.value,
            danoPorRodada: danoPorRodadaDeAtaques(ataques, modAtaque),
            modAtaque
        })
    });
}

// Aplica um novo conjunto de magias no actor (substitui as existentes)
async function aplicarMagias(actor, magias) {
    await removerItemsPorTipo(actor, "spell");
    const items = await itensDeMagiaSRD(magias);
    if (items.length) await actor.createEmbeddedDocuments("Item", items);
}
