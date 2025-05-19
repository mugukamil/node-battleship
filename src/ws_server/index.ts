import { WebSocketServer, WebSocket } from "ws";
import { randomUUID } from "node:crypto";
import { Player, players } from "./user.js";
import { Room, rooms } from "./room.js";
import { Ship, getShipCells } from "./ship.js";
import { GamePlayer, games, winners } from "./game.js";

const PORT = 3000;

type Message = {
    type: string;
    data: any;
    id: number;
};

// --- Helper Functions ---
function send(ws: WebSocket, msg: any) {
    ws.send(JSON.stringify(msg));
}
function broadcastAll(msg: any) {
    wss.clients.forEach((client: any) => {
        if (client.readyState === WebSocket.OPEN) {
            send(client, msg);
        }
    });
}
function updateRoomAll() {
    const roomList = Object.values(rooms)
        .filter((r: Room) => r.roomUsers.length === 1)
        .map((r: Room) => ({
            roomId: r.roomId,
            roomUsers: r.roomUsers.map((u: Player) => ({ name: u.name, index: u.index })),
        }));
    const data = { type: "update_room", data: JSON.stringify(roomList), id: 0 };
    broadcastAll(data);
}
function updateWinnersAll() {
    const table = JSON.stringify(Object.entries(winners).map(([name, wins]) => ({ name, wins })));
    const data = { type: "update_winners", data: table, id: 0 };
    broadcastAll(data);
}
function logCommand(cmd: any, result: any) {
    console.log("Received:", cmd);
    console.log("Result:", result);
}

// --- WebSocket Server ---
const wss = new WebSocketServer({ port: PORT }, () => {
    console.log(`WebSocket server started on ws://localhost:${PORT}`);
});

wss.on("connection", (ws: WebSocket) => {
    ws.on("message", (raw) => {
        let msg: Message;
        try {
            msg = JSON.parse(raw.toString());
        } catch {
            return;
        }
        handleCommand(ws, msg);
    });
    ws.on("close", () => {
        // Optionally handle disconnects
    });
});

function handleCommand(ws: WebSocket, msg: Message) {
    switch (msg.type) {
        case "reg": {
            const { name, password } = JSON.parse(msg.data);
            let error = false,
                errorText = "";
            let player = Object.values(players).find((p: Player) => p.name === name);
            if (!player) {
                const index = randomUUID();
                player = { name, password, index, wins: 0, ws };
                players[index] = player;
                winners[name] = 0;
            } else if (player.password !== password) {
                error = true;
                errorText = "Wrong password";
            }
            if (player) player.ws = ws;
            const result = {
                type: "reg",
                data: JSON.stringify({ name, index: player?.index, error, errorText }),
                id: 0,
            };
            send(ws, result);
            updateRoomAll();
            updateWinnersAll();
            logCommand(msg, result);
            break;
        }
        case "create_room": {
            const player = Object.values(players).find((p: Player) => p.ws === ws);
            if (!player) return;
            const roomId = randomUUID();
            rooms[roomId] = { roomId, roomUsers: [player] };
            updateRoomAll();
            logCommand(msg, { type: "update_room" });
            break;
        }
        case "add_user_to_room": {
            const player = Object.values(players).find((p: Player) => p.ws === ws);
            if (!player) return;
            const { indexRoom } = JSON.parse(msg.data);
            const room = rooms[indexRoom];
            if (!room || room.roomUsers.length !== 1) return;
            if (room.roomUsers.some((u: Player) => u.index === player.index)) return; // Prevent adding self
            room.roomUsers.push(player);
            // Remove room from available rooms
            updateRoomAll();
            // Create game
            const idGame = randomUUID();
            const gamePlayers: GamePlayer[] = room.roomUsers.map((p: Player) => ({
                player: p,
                ships: [],
                id: randomUUID(),
                ready: false,
            }));
            games[idGame] = {
                id: idGame,
                players: gamePlayers,
                currentPlayer: Math.floor(Math.random() * 2),
                finished: false,
            };
            // Send create_game to both players
            for (const gp of gamePlayers) {
                send(gp.player.ws!, {
                    type: "create_game",
                    data: JSON.stringify({ idGame, idPlayer: gp.id }),
                    id: 0,
                });
            }
            logCommand(msg, { type: "create_game", data: { idGame } });
            break;
        }
        case "add_ships": {
            const { gameId, ships, indexPlayer } = JSON.parse(msg.data);
            const game = games[gameId];
            if (!game) return;
            const gp = game.players.find((p: GamePlayer) => p.id === indexPlayer);
            if (!gp) return;
            gp.ships = ships;
            gp.ready = true;
            // If both ready, start game
            if (game.players.every((p: GamePlayer) => p.ready)) {
                for (const p of game.players) {
                    send(p.player.ws!, {
                        type: "start_game",
                        data: JSON.stringify({
                            ships: p.ships,
                            currentPlayerIndex: p.id,
                        }),
                        id: 0,
                    });
                }
                // Send turn info
                const current = game.players[game.currentPlayer];
                for (const p of game.players) {
                    send(p.player.ws!, {
                        type: "turn",
                        data: JSON.stringify({ currentPlayer: current.id }),
                        id: 0,
                    });
                }
            }
            logCommand(msg, { type: "add_ships" });
            break;
        }
        case "attack":
        case "randomAttack": {
            let x: number, y: number, gameId: string, indexPlayer: string;
            if (msg.type === "randomAttack") {
                ({ gameId, indexPlayer } = JSON.parse(msg.data));
                const game = games[gameId];
                if (!game || game.finished) return;
                const attackerIdx = game.players.findIndex((p: GamePlayer) => p.id === indexPlayer);
                if (attackerIdx !== game.currentPlayer) return;
                const defenderIdx = 1 - attackerIdx;
                const defender = game.players[defenderIdx];
                // Collect all possible cells that have not been hit or missed
                const boardSize = 10;
                const allCells: { x: number; y: number }[] = [];
                // Build a set of all attacked cells (hit or miss)
                const attackedCells = new Set<string>();
                for (const ship of defender.ships) {
                    if (ship.hitCells) {
                        for (const hc of ship.hitCells) {
                            attackedCells.add(`${hc.x},${hc.y}`);
                        }
                    }
                }
                // Also add all miss cells (from both players' attacks)
                for (const ship of game.players[attackerIdx].ships) {
                    if (ship.hitCells) {
                        for (const hc of ship.hitCells) {
                            attackedCells.add(`${hc.x},${hc.y}`);
                        }
                    }
                }
                // Add all board cells not yet attacked
                for (let cx = 0; cx < boardSize; cx++) {
                    for (let cy = 0; cy < boardSize; cy++) {
                        if (!attackedCells.has(`${cx},${cy}`)) {
                            allCells.push({ x: cx, y: cy });
                        }
                    }
                }
                if (allCells.length === 0) return;
                const randCell = allCells[Math.floor(Math.random() * allCells.length)];
                x = randCell.x;
                y = randCell.y;
            } else {
                ({ gameId, x, y, indexPlayer } = JSON.parse(msg.data));
            }
            // ...existing attack logic...
            const game = games[gameId];
            if (!game || game.finished) return;
            const attackerIdx = game.players.findIndex((p: GamePlayer) => p.id === indexPlayer);
            if (attackerIdx !== game.currentPlayer) return;
            const defenderIdx = 1 - attackerIdx;
            const defender = game.players[defenderIdx];
            let status: "miss" | "killed" | "shot" = "miss";
            let killedShip: Ship | undefined;
            for (const ship of defender.ships) {
                const cells = getShipCells(ship);
                for (const cell of cells) {
                    if (cell.x === x && cell.y === y) {
                        if (!ship.hitCells) ship.hitCells = [];
                        // If this cell was already hit, treat as miss for this ship, but keep checking others
                        if (
                            ship.hitCells.some(
                                (hc: { x: number; y: number }) => hc.x === x && hc.y === y,
                            )
                        ) {
                            continue;
                        }
                        ship.hitCells.push({ x, y });
                        ship.hits = (ship.hits || 0) + 1;
                        if (ship.hitCells.length === ship.length) {
                            status = "killed";
                            killedShip = ship;
                        } else {
                            status = "shot";
                        }
                        break;
                    }
                }
                if (status === "shot" || status === "killed") break;
            }
            // Send attack result to both
            for (const p of game.players) {
                send(p.player.ws!, {
                    type: "attack",
                    data: JSON.stringify({
                        position: { x, y },
                        currentPlayer: indexPlayer,
                        status,
                    }),
                    id: 0,
                });
            }
            // If killed, mark all cells around as miss
            if (status === "killed" && killedShip) {
                const cells = getShipCells(killedShip);
                const missCells: { x: number; y: number }[] = [];
                for (const cell of cells) {
                    for (let dx = -1; dx <= 1; dx++) {
                        for (let dy = -1; dy <= 1; dy++) {
                            const mx = cell.x + dx;
                            const my = cell.y + dy;
                            // Don't mark the ship's own cells
                            if (
                                cells.some(
                                    (c: { x: number; y: number }) => c.x === mx && c.y === my,
                                )
                            )
                                continue;
                            // Don't duplicate
                            if (
                                missCells.some(
                                    (c: { x: number; y: number }) => c.x === mx && c.y === my,
                                )
                            )
                                continue;
                            // Board bounds (optional, assuming 10x10)
                            if (mx < 0 || mx > 9 || my < 0 || my > 9) continue;
                            missCells.push({ x: mx, y: my });
                        }
                    }
                }
                for (const missCell of missCells) {
                    for (const p of game.players) {
                        send(p.player.ws!, {
                            type: "attack",
                            data: JSON.stringify({
                                position: missCell,
                                currentPlayer: indexPlayer,
                                status: "miss",
                            }),
                            id: 0,
                        });
                    }
                }
            }
            // Check win
            if (defender.ships.every((s: Ship) => (s.hits || 0) === s.length)) {
                game.finished = true;
                for (const p of game.players) {
                    send(p.player.ws!, {
                        type: "finish",
                        data: JSON.stringify({ winPlayer: indexPlayer }),
                        id: 0,
                    });
                }
                // Update winners
                const winnerName = game.players[attackerIdx].player.name;
                winners[winnerName] = (winners[winnerName] || 0) + 1;
                updateWinnersAll();
                logCommand(msg, { type: "finish", data: { winPlayer: indexPlayer } });
                return;
            }
            // If miss, switch turn
            if (status === "miss") {
                game.currentPlayer = defenderIdx;
            }
            // Send turn info
            const current = game.players[game.currentPlayer];
            for (const p of game.players) {
                send(p.player.ws!, {
                    type: "turn",
                    data: JSON.stringify({ currentPlayer: current.id }),
                    id: 0,
                });
            }
            logCommand(msg, { type: "attack", data: { status } });
            break;
        }
        default:
            break;
    }
}

// --- Graceful shutdown ---
process.on("SIGINT", () => {
    wss.close(() => {
        console.log("WebSocket server closed");
        process.exit(0);
    });
});
