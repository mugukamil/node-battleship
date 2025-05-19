import type { Player } from "./user.ts";

export type Room = {
    roomId: string;
    roomUsers: Player[];
};

export const rooms: Record<string, Room> = {};
