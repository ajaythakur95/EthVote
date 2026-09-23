# EthVote — Decentralized E-Voting Platform

A full-stack blockchain-based voting system using MERN Stack + Ethereum/Polygon with Aadhaar identity verification and Soulbound NFT credentials.

## 🏗️ Architecture

```
ethvote/
├── blockchain/          # Hardhat + Solidity smart contracts
│   ├── contracts/
│   │   ├── SBTBase.sol          # EIP-5192 Soulbound base
│   │   ├── VoterIdentity.sol    # Voter SBT (1:1 Aadhaar → wallet)
│   │   └── EthVote.sol          # Election + voting logic
│   ├── scripts/
│   │   ├── deploy.js            # Deploy both contracts
│   │   ├── seed.js              # Create test data
│   │   └── verify.js            # Verify on Polygonscan
│   └── test/
│       ├── VoterIdentity.test.js
│       └── EthVote.test.js
│
├── backend/             # Node.js / Express API
│   ├── config/          # DB, Cloudinary, Twilio
│   ├── controllers/     # auth, admin, voter, candidate, election
│   ├── middleware/      # JWT auth, file upload, rate limit
│   ├── models/          # User, Election, Candidate, Vote, AuditLog
│   ├── routes/          # Express routes
│   └── services/        # aadhaarService, blockchainService, otpService
│
└── frontend/            # React.js + Tailwind CSS
    └── src/
        ├── components/
        │   ├── admin/       # AdminDashboard (stats, voter/candidate review)
        │   ├── auth/        # RegistrationFlow (Path A + Path B)
        │   ├── candidate/   # CandidateRegistration
        │   ├── voter/       # VotingBooth (encrypted vote casting)
        │   └── shared/      # Navbar
        ├── context/         # AuthContext (JWT + user state)
        ├── hooks/           # useElection, useWallet
        ├── pages/           # Home, Elections, Profile, Admin, Login, Register
        └── utils/           # api.js (axios), blockchain.js (ethers.js v6)
```

## 🚀 Setup & Run

### Phase 1: Blockchain

```bash
cd blockchain
npm install
cp .env.example .env    # Add DEPLOYER_PRIVATE_KEY

# Terminal 1: Local Hardhat node
npx hardhat node

# Terminal 2: Deploy contracts
npx hardhat run scripts/deploy.js --network localhost
npx hardhat run scripts/seed.js --network localhost   # optional test data

# Run tests
npx hardhat test
```

### Phase 2: Backend

```bash
cd backend
npm install
cp .env.example .env    # Fill all variables

# Copy contract addresses from blockchain/deployments/localhost.json
# into VOTER_IDENTITY_CONTRACT_ADDRESS and ETHVOTE_CONTRACT_ADDRESS

npm run dev   # starts on port 5000
```

### Phase 3: Frontend

```bash
cd frontend
npm install
cp .env.example .env    # Add contract addresses and API URL
npm start     # starts on port 3000
```

## 🔑 Key API Endpoints

### Auth
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/request-otp` | Send OTP to Aadhaar-linked mobile |
| POST | `/api/auth/verify-otp` | Verify OTP, get demographic data |
| POST | `/api/auth/register/path-a` | Register existing voter (auto-mint SBT) |
| POST | `/api/auth/register/path-b` | Register new voter (pending review) |

### Admin
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/admin/stats` | Dashboard statistics |
| GET | `/api/admin/voters/pending` | List pending voters |
| POST | `/api/admin/voters/:id/approve` | Approve voter + mint SBT |
| POST | `/api/admin/voters/:id/reject` | Reject voter |

### Elections
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/election` | List all elections |
| POST | `/api/election` | Create election (admin) |
| PATCH | `/api/election/:id/status` | Update election status |
| POST | `/api/election/:id/results` | Publish results |

### Voting
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/voter/eligible-elections` | Elections voter can vote in |
| POST | `/api/voter/vote` | Record on-chain vote in DB |
| GET | `/api/voter/has-voted/:electionId` | Check if already voted |

## 🔐 Security Model

- **Aadhaar**: Never stored in plaintext. Hashed with SHA-256 (DB) and keccak256 (blockchain)
- **SBT**: Permanently non-transferable. Each wallet and Aadhaar can only have 1 token
- **Voting**: Commitment scheme (keccak256 of candidateId + nonce) prevents vote correlation during live election
- **JWT**: 7-day expiry with refresh tokens
- **Rate Limiting**: OTP endpoints limited to 5 requests per 10 minutes
- **Documents**: Stored in Cloudinary with authenticated access mode

## 🌐 Deployment (Polygon Amoy Testnet)

```bash
# Deploy to testnet
cd blockchain
npx hardhat run scripts/deploy.js --network amoy
npx hardhat run scripts/verify.js --network amoy

# Get MATIC for gas: https://faucet.polygon.technology/
```
