# Mock Web3 Wallet (CypherD Challenge)

A small, working mock Web3 wallet that lets you create/import a wallet, view balance, send mock ETH (in ETH or USD terms), sign approvals, and see history. It includes server-side signature verification, price quoting, and a simple notification hook.

- Built with: React + Vite (frontend), Node.js + Express (backend), ethers.js
- Runs locally on: frontend `http://localhost:3001`, backend `http://localhost:4000`
- Submission: https://forms.gle/EcJRTdqwJ7XSQXhD7

## Quick Start

1) Install
```
cd backend && npm install
cd ../frontend && npm install
```

2) Run
```
# Terminal A
cd backend && npm start   # http://localhost:4000

# Terminal B
cd frontend && npm start  # http://localhost:3001
```

3) Use
- Import the test mnemonic or generate a new wallet
- Enter recipient + amount (ETH or USD), click Send, approve (sign), submit
- Check history and balances update

Test mnemonic (for convenience):
```
steel saddle drill naive coach security open unable rebuild produce sun worry
```

## What’s Implemented

- Create/import wallet (12‑word mnemonic) and persist locally
- View mock ETH balance (+ live USD value)
- Send transfers in ETH or USD terms
- Approval message signing on the client; verification on the server
- History view (completed/pending/failed) with timestamps
- Recent wallets (quick switch) and simple notifications hook

## Security & UX

- Signature verification on backend (ethers.verifyMessage)
- 30s approval expiry window
- Re-quote on submit (USD flows): reject if price moved > 1%
- Address and amount validation, helpful error messages, loading states

## API (Backend)

- GET `/balance/:address` → `{ balanceEth, balanceUsd }`
- GET `/wallet/:address` → wallet details
- GET `/wallets` → paginated wallets
- GET `/history/:address` → transactions for an address
- POST `/request-transfer` → returns approval message (ETH or USD flows)
- POST `/submit-transfer` → verifies signature, executes transfer
- GET `/transaction/:id` and GET `/transactions` → details/search
- GET `/analytics` → simple totals/metrics

## Price Sources

- Primary: CoinGecko simple price (ETH/USD)
- Fallback: a secondary currency API or mocked rate
- Challenge note: Skip API request shape documented and compatible; USD→ETH quoting and a fresh check on submit enforce a 1% slippage guard.

## Screenshots (add yours)

- Dashboard: wallet info, balance, quick actions
- Send flow: recipient, amount (ETH or USD), approve + submit
- History: list of txs with status

---

Notes
- This is a mock wallet for the challenge; keys are stored locally for demo purposes.
- If ports are busy: kill processes on 3000/3001/4000 and retry.

## Sample inputs and outputs

### 1) Request transfer (ETH amount)

Request
```bash
curl -s -X POST http://localhost:4000/request-transfer \
  -H "Content-Type: application/json" \
  -d '{
    "sender":"0xdd41b7ee629c3cA606fde07E78eBB29999978426",
    "recipient":"0xD3e2DB895692fAf70eD72a97b60ACbeF500b276B",
    "amountEth": 1
  }'
```

Response (example)
```json
{
  "message": "{\"type\":\"transfer_approval\",\"nonce\":\"gRdX_R-o\",\"from\":\"0xdd41...8426\",\"to\":\"0xD3e2...276B\",\"ethAmount\":1,\"amountUsd\":null,\"expiresAt\":1759648954478}",
  "expiresAt": 1759648954478,
  "currencySample": null
}
```

### 2) Request transfer (USD amount)

Request
```bash
curl -s -X POST http://localhost:4000/request-transfer \
  -H "Content-Type: application/json" \
  -d '{
    "sender":"0xdd41b7ee629c3cA606fde07E78eBB29999978426",
    "recipient":"0xD3e2DB895692fAf70eD72a97b60ACbeF500b276B",
    "amountUsd": 1000
  }'
```

Response (example)
```json
{
  "message": "{\"type\":\"transfer_approval\",\"nonce\":\"mzZAHyo9\",\"from\":\"0xdd41...8426\",\"to\":\"0xD3e2...276B\",\"ethAmount\":0.48,\"amountUsd\":1000,\"expiresAt\":1759648916749}",
  "expiresAt": 1759648916749,
  "currencySample": { "eth_price_usd": 2083.0 }
}
```

### 3) Submit transfer (signed)

Request (signature produced by signing the received message with the sender's private key)
```bash
curl -s -X POST http://localhost:4000/submit-transfer \
  -H "Content-Type: application/json" \
  -d '{
    "sender": "0xdd41b7ee629c3cA606fde07E78eBB29999978426",
    "recipient": "0xD3e2DB895692fAf70eD72a97b60ACbeF500b276B",
    "message": "{\"type\":\"transfer_approval\",\"nonce\":\"gRdX_R-o\",...}",
    "signature": "0x249980db0d86159b...07c6278438e91b"
  }'
```

Response (example)
```json
{
  "success": true,
  "tx": {
    "id": "gqQFsiaD8v9y5PqGx2cJn",
    "type": "completed",
    "sender": "0xdd41...8426",
    "recipient": "0xD3e2...276B",
    "ethAmount": 1,
    "status": "completed",
    "hash": "0x9u4dECF3ZTx...",
    "executedAt": 1759648931980
  }
}
```

Common error (USD flow with price moved > 1%)
```json
{ "error": "price moved too much" }
```

### 4) Get balance

Request
```bash
curl -s http://localhost:4000/balance/0xdd41b7ee629c3cA606fde07E78eBB29999978426
```

Response (example)
```json
{ "balanceEth": 17, "balanceUsd": 77788.6 }
```

