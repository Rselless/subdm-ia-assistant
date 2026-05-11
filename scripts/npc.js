// ===============================
function calcularNivelMedioDaParty() {
    const party = game.actors.find(a => a.type === "group");
    if (!party || !party.system.playerCharacters?.length) return 1;

    let total = 0;
    for (let pc of party.system.playerCharacters) {
        total += pc.system.details.level || 1;
    }
    return Math.round(total / party.system.playerCharacters.length);
}

// ===============================
function calcularCR(hp, ac, danoMedio) {
    // Improved CR calculation based on defensive and offensive CR
    const defCR = Math.max(0, (hp / 20) + (ac - 13) * 0.5); // Defensive CR
    const offCR = danoMedio * 2; // Offensive CR approximation
    const cr = (defCR + offCR) / 2;
    // Round to standard CR values
    const crTable = [0.125, 0.25, 0.5, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30];
    return crTable.find(val => val >= cr) || 30;
}

// ===============================
function limparJSON(texto) {
    try {
        return JSON.parse(texto);
    } catch {
        // Try to extract JSON from text
        const match = texto.match(/\{[\s\S]*\}/);
        if (match) {
            try {
                const parsed = JSON.parse(match[0]);
                // Basic validation
                if (parsed.nome && typeof parsed.hp === 'number' && Array.isArray(parsed.ataques)) {
                    return parsed;
                }
            } catch {}
        }
    }
    return null;
}

// ===============================
function normalizarNPC(npc) {
    return {
        nome: npc.nome || "NPC",
        tipo: npc.tipo || "humanoid",
        alinhamento: npc.alinhamento || "neutral",

        hp: Number(npc.hp) || 10,
        ac: Number(npc.ac) || 10,

        for: Number(npc.for) || 10,
        des: Number(npc.des) || 10,
        con: Number(npc.con) || 10,
        int: Number(npc.int) || 10,
        sab: Number(npc.sab) || 10,
        car: Number(npc.car) || 10,

        ataques: (npc.ataques || []).map(a => ({
            nome: a?.nome || "Ataque",
            dano: a?.dano || "1d6",
            tipo: a?.tipo || "bludgeoning",
            descricao: a?.descricao || ""
        })),

        habilidades: (npc.habilidades || []).map(h => ({
            nome: h?.nome || "Habilidade",
            descricao: h?.descricao || ""
        }))
    };
}

// ===============================
async function criarNPC(npc) {

    const nivel = calcularNivelMedioDaParty();

    // Calculate average damage for CR
    let danoMedio = 0;
    for (let atk of npc.ataques) {
        // Simple average for dice (e.g., 1d6 -> 3.5)
        const match = atk.dano.match(/(\d+)d(\d+)/);
        if (match) {
            const num = parseInt(match[1]);
            const die = parseInt(match[2]);
            danoMedio += (num * (die + 1)) / 2;
        } else {
            danoMedio += parseInt(atk.dano) || 1;
        }
    }
    danoMedio = danoMedio / npc.ataques.length || 1;

    const cr = calcularCR(npc.hp, npc.ac, danoMedio);

    // Calculate proficiency bonus (simplified)
    const profBonus = Math.floor(nivel / 4) + 2;

    const ator = await Actor.create({
        name: `${npc.nome} (CR ${cr})`,
        type: "npc",
        img: "icons/svg/mystery-man.svg",

        system: {
            details: {
                type: { value: npc.tipo },
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
                ac: { value: npc.ac }
            }
        }
    });

    for (let atk of npc.ataques) {
        const attackBonus = profBonus + Math.floor((npc.for - 10) / 2); // Assuming STR-based
        await ator.createEmbeddedDocuments("Item", [{
            name: atk.nome,
            type: "weapon",
            system: {
                actionType: "mwak",
                attackBonus: attackBonus,
                damage: { parts: [[atk.dano, atk.tipo]] },
                description: { value: atk.descricao }
            }
        }]);
    }

    if (npc.ataques.length > 1) {
        await ator.createEmbeddedDocuments("Item", [{
            name: "Multiattack",
            type: "feat",
            system: {
                description: { value: `Faz ${npc.ataques.length} ataques.` }
            }
        }]);
    }

    for (let h of npc.habilidades) {
        await ator.createEmbeddedDocuments("Item", [{
            name: h.nome,
            type: "feat",
            system: {
                description: { value: h.descricao }
            }
        }]);
    }

    ui.notifications.success("NPC criado!");
}

// ===============================
async function escalarNPC(ator) {
    console.log("🟣 Escalonando NPC...");

    const nivel = calcularNivelMedioDaParty();

    const hpBonus = nivel * 5;
    const acBonus = Math.floor(nivel / 4);
    const abilityBonus = Math.floor(nivel / 4);

    const newHp = ator.system.attributes.hp.value + hpBonus;
    const newAc = ator.system.attributes.ac.value + acBonus;

    // Scale abilities
    const updates = {
        "system.attributes.hp.value": newHp,
        "system.attributes.hp.max": newHp,
        "system.attributes.ac.value": newAc
    };

    for (let [key, ability] of Object.entries(ator.system.abilities)) {
        updates[`system.abilities.${key}.value`] = ability.value + abilityBonus;
    }

    // Recalculate CR
    let danoMedio = 0;
    const attacks = ator.items.filter(i => i.type === "weapon");
    for (let atk of attacks) {
        const dmg = atk.system.damage.parts[0][0];
        const match = dmg.match(/(\d+)d(\d+)/);
        if (match) {
            const num = parseInt(match[1]);
            const die = parseInt(match[2]);
            danoMedio += (num * (die + 1)) / 2;
        } else {
            danoMedio += parseInt(dmg) || 1;
        }
    }
    danoMedio = danoMedio / attacks.length || 1;
    updates["system.details.cr"] = calcularCR(newHp, newAc, danoMedio);

    await ator.update(updates);

    ui.notifications.success("NPC escalado!");
}