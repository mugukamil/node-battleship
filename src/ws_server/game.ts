// Game logic and types
import type { Player } from "./user.ts";
import type { Ship } from "./ship.ts";

export type GamePlayer = {
    player: Player;
    ships: Ship[];
    id: string;
    ready: boolean;
};

export type Game = {
    id: string;
    players: GamePlayer[];
    currentPlayer: number;
    finished: boolean;
};

export const games: Record<string, Game> = {};
export const winners: Record<string, number> = {};
