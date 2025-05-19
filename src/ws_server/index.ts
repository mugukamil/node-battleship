// @ts-ignore: Suppress missing ws type error if @types/ws is not installed
import { WebSocketServer, WebSocket } from "ws";
import { randomUUID } from "node:crypto";

const PORT = 8080;

// --- Types ---
type Player = {
    name: string;
    password: string;
    index: string;
    wins: number;
    ws?: WebSocket;
};

type Room = {
    roomId: string;
    roomUsers: Player[];
};

type Ship = {
    position: { x: number; y: number };
    direction: boolean;
    length: number;
    type: "small" | "medium" | "large" | "huge";
    hits?: number;
};

type GamePlayer = {
    player: Player;
    ships: Ship[];
    id: string;
    ready: boolean;
};

type Game = {
    id: string;
    players: GamePlayer[];
    currentPlayer: number;
    finished: boolean;
};

type Message = {
    type: string;
    data: any;
    id: number;
};

// --- In-memory DB ---
const players: Record<string, Player> = {};
const rooms: Record<string, Room> = {};
const games: Record<string, Game> = {};
const winners: Record<string, number> = {};

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
        .filter((r) => r.roomUsers.length === 1)
        .map((r) => ({
            roomId: r.roomId,
            roomUsers: r.roomUsers.map((u) => ({ name: u.name, index: u.index })),
        }));
    broadcastAll({ type: "update_room", data: roomList, id: 0 });
}
function updateWinnersAll() {
    const table = Object.entries(winners).map(([name, wins]) => ({ name, wins }));
    broadcastAll({ type: "update_winners", data: table, id: 0 });
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
            const { name, password } = msg.data;
            let error = false,
                errorText = "";
            let player = Object.values(players).find((p) => p.name === name);
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
                data: { name, index: player?.index, error, errorText },
                id: 0,
            };
            send(ws, result);
            updateRoomAll();
            updateWinnersAll();
            logCommand(msg, result);
            break;
        }
        case "create_room": {
            const player = Object.values(players).find((p) => p.ws === ws);
            if (!player) return;
            const roomId = randomUUID();
            rooms[roomId] = { roomId, roomUsers: [player] };
            updateRoomAll();
            logCommand(msg, { type: "update_room" });
            break;
        }
        case "add_user_to_room": {
            const player = Object.values(players).find((p) => p.ws === ws);
            if (!player) return;
            const { indexRoom } = msg.data;
            const room = rooms[indexRoom];
            if (!room || room.roomUsers.length !== 1) return;
            room.roomUsers.push(player);
            // Remove room from available rooms
            updateRoomAll();
            // Create game
            const idGame = randomUUID();
            const gamePlayers: GamePlayer[] = room.roomUsers.map((p) => ({
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
                    data: { idGame, idPlayer: gp.id },
                    id: 0,
                });
            }
            logCommand(msg, { type: "create_game", data: { idGame } });
            break;
        }
        case "add_ships": {
            const { gameId, ships, indexPlayer } = msg.data;
            const game = games[gameId];
            if (!game) return;
            const gp = game.players.find((p) => p.id === indexPlayer);
            if (!gp) return;
            gp.ships = ships;
            gp.ready = true;
            // If both ready, start game
            if (game.players.every((p) => p.ready)) {
                for (const p of game.players) {
                    send(p.player.ws!, {
                        type: "start_game",
                        data: {
                            ships: p.ships,
                            currentPlayerIndex: p.id,
                        },
                        id: 0,
                    });
                }
                // Send turn info
                const current = game.players[game.currentPlayer];
                for (const p of game.players) {
                    send(p.player.ws!, {
                        type: "turn",
                        data: { currentPlayer: current.id },
                        id: 0,
                    });
                }
            }
            logCommand(msg, { type: "add_ships" });
            break;
        }
        case "attack":
        case "randomAttack": {
            const { gameId, x, y, indexPlayer } = msg.data;
            const game = games[gameId];
            if (!game || game.finished) return;
            const attackerIdx = game.players.findIndex((p) => p.id === indexPlayer);
            if (attackerIdx !== game.currentPlayer) return;
            const defenderIdx = 1 - attackerIdx;
            const defender = game.players[defenderIdx];
            let status: "miss" | "killed" | "shot" = "miss";
            let killedShip: Ship | undefined;
            for (const ship of defender.ships) {
                const cells = getShipCells(ship);
                for (const cell of cells) {
                    if (cell.x === x && cell.y === y) {
                        ship.hits = (ship.hits || 0) + 1;
                        if (ship.hits === ship.length) {
                            status = "killed";
                            killedShip = ship;
                        } else {
                            status = "shot";
                        }
                        break;
                    }
                }
                if (status !== "miss") break;
            }
            // Send attack result to both
            for (const p of game.players) {
                send(p.player.ws!, {
                    type: "attack",
                    data: {
                        position: { x, y },
                        currentPlayer: indexPlayer,
                        status,
                    },
                    id: 0,
                });
            }
            // If killed, mark all cells around as miss (not implemented in detail here)
            // Check win
            if (defender.ships.every((s) => (s.hits || 0) === s.length)) {
                game.finished = true;
                for (const p of game.players) {
                    send(p.player.ws!, {
                        type: "finish",
                        data: { winPlayer: indexPlayer },
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
                    data: { currentPlayer: current.id },
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

// --- Ship helpers ---
function getShipCells(ship: Ship): { x: number; y: number }[] {
    const cells = [];
    for (let i = 0; i < ship.length; i++) {
        if (ship.direction) {
            cells.push({ x: ship.position.x + i, y: ship.position.y });
        } else {
            cells.push({ x: ship.position.x, y: ship.position.y + i });
        }
    }
    return cells;
}

// --- Graceful shutdown ---
process.on("SIGINT", () => {
    wss.close(() => {
        console.log("WebSocket server closed");
        process.exit(0);
    });
});
