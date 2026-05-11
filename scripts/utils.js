// ===============================
async function pedirDescricaoNPC() {
    return await foundry.applications.api.DialogV2.prompt({
        window: { title: "Criar NPC IA" },
        content: `<textarea name="prompt" rows="4" style="width:100%"></textarea>`,
        ok: { callback: (e, b) => b.form.elements.prompt.value }
    });
}