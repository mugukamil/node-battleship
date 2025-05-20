import { WebSocket } from "ws";

export type Player = {
    name: string;
    password: string;
    index: string;
    wins: number;
    ws?: WebSocket;
};

export const players: Record<string, Player> = {};
