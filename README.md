# RSSchool NodeJS WebSocket Battleship Backend

> Static HTTP server and WebSocket backend for Battleship game.

## Installation

1. Clone/download repo
2. `npm install`

## Usage

### WebSocket Backend (Game Server)

**Development**

```
npm run start:dev
```

- WebSocket server runs @ `ws://localhost:3000` with nodemon (auto-reloads on changes)

**Production**

```
npm run start
```

- WebSocket server runs @ `ws://localhost:3000` without nodemon

### HTTP Static Server (Frontend)

**Production**

```
npm run start:web
```

- HTTP server runs @ `http://localhost:8181` (serves frontend)

**Development**

```
npm run start:web-dev
```

- HTTP server runs @ `http://localhost:8181` with nodemon

---

### All commands

| Command                 | Description                                     |
| ----------------------- | ----------------------------------------------- |
| `npm run start:dev`     | WebSocket backend @ `ws://localhost:3000` (dev) |
| `npm run start`         | WebSocket backend @ `ws://localhost:3000`       |
| `npm run start:web`     | HTTP static server @ `http://localhost:8181`    |
| `npm run start:web-dev` | HTTP static server with nodemon                 |
| `npm test`              | Run tests with Jest                             |

**Note**: replace `npm` with `yarn` in `package.json` if you use yarn.

---

## Project Structure

- `src/ws_server/` - WebSocket backend (TypeScript, modularized)
- `src/http_server/` - HTTP static server (frontend)
- `front/` - Frontend assets

---

## WebSocket Protocol

See the task description for full protocol details (player registration, room/game/ship/attack commands, etc).

---

## Requirements & Scoring

- Only allowed dependencies are used (see package.json)
- Backend implemented in TypeScript
- Codebase is modularized (user, room, game, ship modules)
- All main game features implemented (see PR description for scoring)
