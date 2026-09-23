# EthVote — Windows Setup Guide

## Quick Command Reference

### Frontend (React)
```cmd
cd frontend
npm install
copy .env.example .env
npm start          ← use this (NOT npm run dev)
```
> Opens at http://localhost:3000

### Backend (Node.js/Express)
```cmd
cd backend
npm install
copy .env.example .env
npm run dev        ← works on Windows
```
> Runs at http://localhost:5000

### Blockchain (Hardhat)
```cmd
cd blockchain
npm install

:: Terminal 1 — start local blockchain node
npm run node

:: Terminal 2 — deploy contracts (after node is running)
npm run deploy:local
npm run seed        ← optional test data
```

---

## Script Reference

| Directory    | Command            | What it does                    |
|--------------|--------------------|---------------------------------|
| `frontend`   | `npm start`        | Start React dev server          |
| `frontend`   | `npm run build`    | Production build                |
| `backend`    | `npm run dev`      | Start API with hot-reload       |
| `backend`    | `npm start`        | Start API (no hot-reload)       |
| `blockchain` | `npm run node`     | Start local Hardhat blockchain  |
| `blockchain` | `npm run compile`  | Compile Solidity contracts      |
| `blockchain` | `npm run test`     | Run contract tests              |
| `blockchain` | `npm run deploy:local` | Deploy to local node       |

---

## Windows-Specific Notes

1. **`npm run dev` on frontend** → use `npm start` instead (both work now after this fix)
2. **Copy `.env` files** → use `copy .env.example .env` on CMD (not `cp`)
3. **MetaMask** → Install from https://metamask.io/download/
4. **Node.js** → Requires v18+ → https://nodejs.org/

## Correct Run Order

```
1. cd blockchain  →  npm install  →  npm run node          (keep running)
2. cd blockchain  →  npm run deploy:local                  (copy addresses!)
3. cd backend     →  npm install  →  (edit .env)  →  npm run dev
4. cd frontend    →  npm install  →  (edit .env)  →  npm start
```

After `npm run deploy:local`, copy the two contract addresses printed in the terminal into:
- `backend/.env`  → `VOTER_IDENTITY_CONTRACT_ADDRESS` and `ETHVOTE_CONTRACT_ADDRESS`
- `frontend/.env` → `REACT_APP_VOTER_IDENTITY_ADDRESS` and `REACT_APP_ETHVOTE_ADDRESS`
