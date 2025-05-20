export type Ship = {
    position: { x: number; y: number };
    direction: boolean;
    length: number;
    type: "small" | "medium" | "large" | "huge";
    hits?: number;
    hitCells?: { x: number; y: number }[];
};

export function getShipCells(ship: Ship): { x: number; y: number }[] {
    const cells = [];
    for (let i = 0; i < ship.length; i++) {
        if (ship.direction) {
            cells.push({ x: ship.position.x, y: ship.position.y + i });
        } else {
            cells.push({ x: ship.position.x + i, y: ship.position.y });
        }
    }
    return cells;
}
