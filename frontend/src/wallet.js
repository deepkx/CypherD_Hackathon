import { ethers } from 'ethers';

export function createWalletFromNewMnemonic() {
  const wallet = ethers.Wallet.createRandom();
  // wallet.mnemonic is an object with .phrase when using ethers v6
  return { mnemonic: wallet.mnemonic.phrase, privateKey: wallet.privateKey, address: wallet.address };
}

export function importFromMnemonic(mnemonic) {
  // ethers.Wallet.fromPhrase exists in v6
  const wallet = ethers.Wallet.fromPhrase(mnemonic);
  return { mnemonic: wallet.mnemonic?.phrase || mnemonic, privateKey: wallet.privateKey, address: wallet.address };
}

export function saveLocal(walletObj) {
  localStorage.setItem('mock_wallet', JSON.stringify(walletObj));
}

export function loadLocal() {
  try {
    return JSON.parse(localStorage.getItem('mock_wallet'));
  } catch (e) {
    return null;
  }
}
