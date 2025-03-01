const ws = new WebSocket("ws://localhost:8080"); // ✅ Correct

ws.onopen = () => {
    console.log("Connected to WebSocket server");
};

ws.onmessage = (event) => {
    let data = JSON.parse(event.data);

    if (data.type === "world_list") {
        console.log("Received world list:", data.worlds);
        updateWorldUI(data.worlds);
    } else if (data.type === "joined") {
        console.log(`Joined world: ${data.worldName}`);
        alert(`You have entered ${data.worldName}!`);
    }
};

function updateWorldUI(worlds) {
    let worldContainer = document.getElementById("world-container") || document.createElement("div");
    worldContainer.id = "world-container";
    worldContainer.innerHTML = "";
    document.body.appendChild(worldContainer);

    worlds.forEach(world => {
        let worldElement = document.createElement("div");
        worldElement.className = "world-item";
        worldElement.innerHTML = `<strong>${world.name}</strong> (ID: ${world.id}) - Fullness: ${world.full}% - Tag: ${world.meta.tag}`;

        worldElement.addEventListener("click", () => {
            ws.send(JSON.stringify({ type: "join_world", worldId: world.id }));
        });

        worldContainer.appendChild(worldElement);
    });
}
