# Mock Web3 Wallet API Documentation

## Overview
This API provides comprehensive wallet and transaction management functionality for a mock Web3 environment. It includes enhanced data structures, analytics, and multiple endpoints for better data management.

## Base URL
```
http://localhost:4000
```

## API Endpoints

### 1. Wallet Management

#### Get Wallet Balance
```http
GET /balance/:address
```
**Description:** Get the ETH balance for a specific wallet address.

**Parameters:**
- `address` (path): Ethereum wallet address

**Response:**
```json
{
  "balanceEth": 12.456789
}
```

#### Get Wallet Details
```http
GET /wallet/:address
```
**Description:** Get comprehensive wallet information including statistics and metadata.

**Parameters:**
- `address` (path): Ethereum wallet address

**Response:**
```json
{
  "wallet": {
    "id": "wallet_001",
    "address": "0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6",
    "balanceEth": 12.456789,
    "balanceUsd": 25000.50,
    "createdAt": 1759640000000,
    "lastActivityAt": 1759644000000,
    "transactionCount": 15,
    "totalSentEth": 8.234567,
    "totalReceivedEth": 20.691356,
    "totalSentUsd": 15000,
    "totalReceivedUsd": 25000,
    "status": "active",
    "tags": ["high_volume", "frequent_user"],
    "metadata": {
      "source": "user_created",
      "ipAddress": "192.168.1.100",
      "userAgent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
      "notes": "Primary trading wallet"
    }
  }
}
```

#### Get All Wallets
```http
GET /wallets?page=1&limit=10
```
**Description:** Get paginated list of all wallets.

**Query Parameters:**
- `page` (optional): Page number (default: 1)
- `limit` (optional): Items per page (default: 10)

**Response:**
```json
{
  "wallets": [...],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 5,
    "pages": 1
  }
}
```

### 2. Transaction Management

#### Request Transfer
```http
POST /request-transfer
```
**Description:** Request a transfer approval message from the backend.

**Request Body:**
```json
{
  "sender": "0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6",
  "recipient": "0x8ba1f109551bD432803012645Hac136c22C131e",
  "amountEth": 1.5,
  "amountUsd": "3000"
}
```

**Response:**
```json
{
  "message": "{\"type\":\"transfer_approval\",\"nonce\":\"ABC123\",...}",
  "expiresAt": 1759644000000,
  "currencySample": {...}
}
```

#### Submit Transfer
```http
POST /submit-transfer
```
**Description:** Submit a signed transfer for execution.

**Request Body:**
```json
{
  "sender": "0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6",
  "recipient": "0x8ba1f109551bD432803012645Hac136c22C131e",
  "message": "{\"type\":\"transfer_approval\",\"nonce\":\"ABC123\",...}",
  "signature": "0x1234567890abcdef..."
}
```

**Response:**
```json
{
  "success": true,
  "tx": {
    "id": "tx_001",
    "type": "completed",
    "hash": "0x1234567890abcdef...",
    "blockNumber": 18500001,
    "gasUsed": 21000,
    "gasPrice": 25,
    "executedAt": 1759643605000
  }
}
```

#### Get Transaction History
```http
GET /history/:address
```
**Description:** Get transaction history for a specific wallet address.

**Parameters:**
- `address` (path): Ethereum wallet address

**Response:**
```json
{
  "txs": [
    {
      "id": "tx_001",
      "type": "completed",
      "sender": "0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6",
      "recipient": "0x8ba1f109551bD432803012645Hac136c22C131e",
      "ethAmount": 1.5,
      "amountUsd": "3000",
      "executedAt": 1759643605000,
      "hash": "0x1234567890abcdef...",
      "blockNumber": 18500001,
      "status": "completed"
    }
  ]
}
```

#### Get Transaction Details
```http
GET /transaction/:id
```
**Description:** Get detailed information about a specific transaction.

**Parameters:**
- `id` (path): Transaction ID

**Response:**
```json
{
  "transaction": {
    "id": "tx_001",
    "type": "completed",
    "sender": "0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6",
    "recipient": "0x8ba1f109551bD432803012645Hac136c22C131e",
    "ethAmount": 1.5,
    "amountUsd": "3000",
    "hash": "0x1234567890abcdef...",
    "blockNumber": 18500001,
    "gasUsed": 21000,
    "gasPrice": 25,
    "nonce": "ABC123",
    "status": "completed",
    "confirmations": 12,
    "createdAt": 1759643600000,
    "executedAt": 1759643605000,
    "metadata": {
      "source": "api_request",
      "ipAddress": "192.168.1.100",
      "userAgent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
      "network": "mock",
      "chainId": 1,
      "notes": "Payment for services"
    },
    "analytics": {
      "processingTimeMs": 5000,
      "retryCount": 0,
      "errorHistory": []
    }
  }
}
```

#### Search Transactions
```http
GET /transactions?status=completed&address=0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6&fromDate=2025-10-01&toDate=2025-10-05&page=1&limit=20
```
**Description:** Search and filter transactions with pagination.

**Query Parameters:**
- `status` (optional): Transaction status (pending, completed, failed)
- `address` (optional): Filter by wallet address
- `fromDate` (optional): Start date filter (YYYY-MM-DD)
- `toDate` (optional): End date filter (YYYY-MM-DD)
- `page` (optional): Page number (default: 1)
- `limit` (optional): Items per page (default: 20)

**Response:**
```json
{
  "transactions": [...],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 8,
    "pages": 1
  }
}
```

### 3. Analytics & Statistics

#### Get Analytics
```http
GET /analytics
```
**Description:** Get comprehensive analytics and statistics about the system.

**Response:**
```json
{
  "overview": {
    "totalWallets": 5,
    "totalTransactions": 8,
    "completedTransactions": 6,
    "failedTransactions": 2,
    "pendingTransactions": 1,
    "totalEthInCirculation": 46.301789,
    "totalEthTransferred": 9.350000,
    "avgTransactionValue": 1.558333
  },
  "recentActivity": {
    "transactions24h": 3,
    "newWallets24h": 1
  },
  "successRate": 75.0
}
```

## Data Structures

### Wallet Object
```json
{
  "id": "string",
  "address": "string (Ethereum address)",
  "balanceEth": "number",
  "balanceUsd": "number",
  "createdAt": "number (timestamp)",
  "lastActivityAt": "number (timestamp)",
  "transactionCount": "number",
  "totalSentEth": "number",
  "totalReceivedEth": "number",
  "totalSentUsd": "number",
  "totalReceivedUsd": "number",
  "status": "string (active, inactive)",
  "tags": "array of strings",
  "metadata": {
    "source": "string",
    "ipAddress": "string",
    "userAgent": "string",
    "notes": "string"
  }
}
```

### Transaction Object
```json
{
  "id": "string",
  "type": "string (pending, completed, failed)",
  "sender": "string (Ethereum address)",
  "recipient": "string (Ethereum address)",
  "ethAmount": "number",
  "amountUsd": "string or null",
  "message": "string (JSON)",
  "expiresAt": "number (timestamp)",
  "createdAt": "number (timestamp)",
  "executedAt": "number (timestamp) or null",
  "hash": "string or null",
  "blockNumber": "number or null",
  "gasUsed": "number or null",
  "gasPrice": "number or null",
  "nonce": "string",
  "status": "string",
  "confirmations": "number",
  "currencySample": "object or null",
  "error": "string or null",
  "metadata": {
    "source": "string",
    "ipAddress": "string",
    "userAgent": "string",
    "network": "string",
    "chainId": "number",
    "notes": "string"
  },
  "analytics": {
    "processingTimeMs": "number or null",
    "retryCount": "number",
    "errorHistory": "array of strings"
  }
}
```

## Error Responses

All endpoints return appropriate HTTP status codes and error messages:

```json
{
  "error": "Error description"
}
```

**Common Status Codes:**
- `200`: Success
- `400`: Bad Request (invalid parameters)
- `404`: Not Found (wallet/transaction not found)
- `500`: Internal Server Error

## Complete Input Sets

### Sample Wallet Addresses
```
0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6  (High volume trader)
0x8ba1f109551bD432803012645Hac136c22C131e  (Medium volume user)
0xAb8483F64d9C6d1EcF9b849Ae677dD3315835cb2  (Low volume new user)
0xCA35b7d915458EF540aDe6068dFe2F44E8fa733c  (Institutional whale)
0x4B20993Bc481177ec7E8f571ceCaE8A9e22C02db  (Personal savings)
```

### Sample Transaction Amounts
- **Small**: 0.1 ETH ($200)
- **Medium**: 1.5 ETH ($3,000)
- **Large**: 5.0 ETH ($10,000)
- **Whale**: 25.0 ETH ($50,000)

### Sample Transaction Statuses
- **Completed**: Successfully processed transactions
- **Failed**: Transactions that failed due to insufficient funds, price volatility, or expired approvals
- **Pending**: Transactions awaiting signature submission

## Testing Examples

### 1. Check Wallet Balance
```bash
curl http://localhost:4000/balance/0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6
```

### 2. Get Wallet Details
```bash
curl http://localhost:4000/wallet/0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6
```

### 3. Request Transfer
```bash
curl -X POST http://localhost:4000/request-transfer \
  -H "Content-Type: application/json" \
  -d '{
    "sender": "0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6",
    "recipient": "0x8ba1f109551bD432803012645Hac136c22C131e",
    "amountEth": 1.5
  }'
```

### 4. Get Analytics
```bash
curl http://localhost:4000/analytics
```

### 5. Search Transactions
```bash
curl "http://localhost:4000/transactions?status=completed&page=1&limit=10"
```

This enhanced API provides comprehensive wallet and transaction management with detailed analytics, better data structures, and multiple endpoints for various use cases.
