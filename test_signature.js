const { ethers } = require('ethers');

// Initial wallet mnemonic from db.json
const mnemonic = "steel saddle drill naive coach security open unable rebuild produce sun worry";

// Create wallet from mnemonic
const wallet = ethers.Wallet.fromPhrase(mnemonic);

console.log('Address:', wallet.address);
console.log('Private Key:', wallet.privateKey);

// Test message
const message = '{"type":"transfer_approval","nonce":"test123","from":"0xdd41b7ee629c3cA606fde07E78eBB29999978426","to":"0xD3e2DB895692fAf70eD72a97b60ACbeF500b276B","ethAmount":1,"amountUsd":null,"expiresAt":1759648916749}';

// Sign the message
wallet.signMessage(message).then(signature => {
  console.log('Signature:', signature);
}).catch(err => {
  console.error('Error signing:', err);
});
