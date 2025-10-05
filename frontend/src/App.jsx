import React, { useEffect, useState } from 'react';
import { createWalletFromNewMnemonic, importFromMnemonic, saveLocal, loadLocal } from './wallet';
import { getBalance, requestTransfer, submitTransfer, getHistory } from './api';
import { ethers } from 'ethers';

export default function App() {
  const [wallet, setWallet] = useState(loadLocal());
  const [balance, setBalance] = useState({ balanceEth: 0, balanceUsd: 0 });
  const [history, setHistory] = useState([]);
  const [mnemonicInput, setMnemonicInput] = useState('');
  const [recipient, setRecipient] = useState('');
  const [amountEth, setAmountEth] = useState('');
  const [amountUsd, setAmountUsd] = useState('');
  const [log, setLog] = useState('');
  const [priceInfo, setPriceInfo] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showMnemonic, setShowMnemonic] = useState(false);
  const [transferStep, setTransferStep] = useState('idle'); // idle, requesting, signing, submitting, completed
  const [recentWallets, setRecentWallets] = useState([]);

  useEffect(() => {
    if (wallet) refreshAll();
    loadRecentWallets();
  }, [wallet]);

  async function loadRecentWallets() {
    try {
      const recent = JSON.parse(localStorage.getItem('recent_wallets') || '[]');
      
      // Update balances for all recent wallets
      const updatedRecent = await Promise.all(recent.map(async (w) => {
        try {
          const balance = await getBalance(w.address);
          return { ...w, balanceEth: balance.balanceEth, balanceUsd: balance.balanceUsd };
        } catch (e) {
          console.warn(`Failed to get balance for ${w.address}:`, e);
          return w;
        }
      }));
      
      setRecentWallets(updatedRecent);
      localStorage.setItem('recent_wallets', JSON.stringify(updatedRecent));
    } catch (e) {
      console.warn('Failed to load recent wallets:', e);
      setRecentWallets([]);
    }
  }

  function saveRecentWallet(walletData) {
    try {
      const recent = JSON.parse(localStorage.getItem('recent_wallets') || '[]');
      const walletInfo = {
        id: walletData.address,
        address: walletData.address,
        mnemonic: walletData.mnemonic,
        importedAt: Date.now(),
        balanceEth: 0, // Will be updated when loaded
        balanceUsd: 0
      };
      
      // Remove if already exists
      const filtered = recent.filter(w => w.address !== walletData.address);
      // Add to beginning
      const updated = [walletInfo, ...filtered].slice(0, 5); // Keep only 5 recent
      
      localStorage.setItem('recent_wallets', JSON.stringify(updated));
      setRecentWallets(updated);
    } catch (e) {
      console.warn('Failed to save recent wallet:', e);
    }
  }

  async function refreshAll() {
    try {
      setLoading(true);
      const b = await getBalance(wallet.address);
      setBalance(b);
      const h = await getHistory(wallet.address);
      setHistory(h.txs || []);
      
      // Update balance in recent wallets
      updateRecentWalletBalance(wallet.address, b);
    } catch (e) {
      console.warn(e);
      setError('Failed to refresh wallet data');
    } finally {
      setLoading(false);
    }
  }

  function updateRecentWalletBalance(address, balance) {
    try {
      const recent = JSON.parse(localStorage.getItem('recent_wallets') || '[]');
      const updated = recent.map(w => 
        w.address === address 
          ? { ...w, balanceEth: balance.balanceEth, balanceUsd: balance.balanceUsd }
          : w
      );
      localStorage.setItem('recent_wallets', JSON.stringify(updated));
      setRecentWallets(updated);
    } catch (e) {
      console.warn('Failed to update recent wallet balance:', e);
    }
  }

  function newWallet() {
    try {
      const w = createWalletFromNewMnemonic();
      saveLocal(w);
      setWallet(w);
      setLog('✅ New wallet generated successfully');
      setSuccess('Wallet created! Your mnemonic phrase has been generated.');
      setShowMnemonic(true);
      // Save to recent wallets
      saveRecentWallet(w);
    } catch (e) {
      setError('Failed to create new wallet');
    }
  }

  function importWallet() {
    try {
      if (!mnemonicInput.trim()) {
        setError('Please enter a mnemonic phrase');
        return;
      }
      const w = importFromMnemonic(mnemonicInput.trim());
      saveLocal(w);
      setWallet(w);
      setLog('✅ Wallet imported successfully');
      setSuccess('Wallet imported successfully!');
      setMnemonicInput('');
      // Save to recent wallets
      saveRecentWallet(w);
    } catch (e) {
      setError('Invalid mnemonic phrase. Please check and try again.');
    }
  }

  async function startTransfer() {
    if (!wallet) {
      setError('Please create or import a wallet first');
      return;
    }
    if (!recipient) {
      setError('Please enter recipient address');
      return;
    }
    if (!amountEth && !amountUsd) {
      setError('Please enter an amount');
      return;
    }

    // Validate recipient address
    try {
      ethers.getAddress(recipient);
    } catch (e) {
      setError('Invalid recipient address format');
      return;
    }

    // Validate amount
    const amount = amountEth || amountUsd;
    if (isNaN(amount) || Number(amount) <= 0) {
      setError('Please enter a valid amount');
      return;
    }

    setError('');
    setSuccess('');
    setTransferStep('requesting');

    const payload = { sender: wallet.address, recipient };
    if (amountUsd) payload.amountUsd = amountUsd;
    else payload.amountEth = amountEth;

    try {
      setLog('🔄 Requesting approval message from backend...');
      const r = await requestTransfer(payload);
      setPriceInfo(r.currencySample || null);
      
      setTransferStep('signing');
      setLog('✍️ Signing approval message locally...');

      // Sign using local private key
      const signer = new ethers.Wallet(wallet.privateKey);
      const sig = await signer.signMessage(r.message);

      setTransferStep('submitting');
      setLog('📤 Submitting signature to backend...');
      const res = await submitTransfer({ 
        sender: wallet.address, 
        recipient, 
        message: r.message, 
        signature: sig 
      });
      
      if (res.success) {
        setTransferStep('completed');
        setLog('✅ Transfer completed successfully!');
        setSuccess(`Transfer of ${res.tx.ethAmount} ETH completed!`);
        await refreshAll();
        // Clear form
        setRecipient('');
        setAmountEth('');
        setAmountUsd('');
        // Reset transfer step after a short delay to show completion
        setTimeout(() => setTransferStep('idle'), 2000);
      } else {
        setError('Transfer failed: ' + (res.error || 'Unknown error'));
        setTransferStep('idle');
      }
    } catch (e) {
      console.error(e);
      setError('Transfer error: ' + (e?.response?.data?.error || e.message));
      setTransferStep('idle');
    }
  }

  function clearMessages() {
    setError('');
    setSuccess('');
  }

  function copyToClipboard(text) {
    navigator.clipboard.writeText(text);
    setSuccess('Copied to clipboard!');
    setTimeout(() => setSuccess(''), 2000);
  }

  return (
    <div className="container">
      <div className="header">
        <h1>✨ Mock Web3 Wallet</h1>
        <p>Secure, decentralized wallet for testing and development</p>
      </div>

      {/* Recent Wallets Section */}
      {recentWallets.length > 0 && (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h3 className="card-title">💎 Recent Wallets</h3>
            <button 
              className="button button-secondary" 
              onClick={loadRecentWallets}
              style={{ padding: '6px 12px', fontSize: '0.8rem' }}
            >
              🔄 Refresh
            </button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '16px' }}>
            {recentWallets.slice(0, 3).map((w, index) => (
              <div key={w.id} className="wallet-card" style={{
                background: 'linear-gradient(135deg, #fef3c7, #fbbf24)',
                borderRadius: '12px',
                padding: '16px',
                border: '1px solid #f59e0b',
                cursor: 'pointer',
                transition: 'all 0.3s ease'
              }}
              onClick={async () => {
                const walletData = importFromMnemonic(w.mnemonic);
                saveLocal(walletData);
                setWallet(walletData);
                setSuccess('Wallet loaded successfully!');
                // Update balance in recent wallets
                try {
                  const balance = await getBalance(walletData.address);
                  const updatedRecent = recentWallets.map(rw => 
                    rw.address === walletData.address 
                      ? { ...rw, balanceEth: balance.balanceEth, balanceUsd: balance.balanceUsd }
                      : rw
                  );
                  setRecentWallets(updatedRecent);
                  localStorage.setItem('recent_wallets', JSON.stringify(updatedRecent));
                } catch (e) {
                  console.warn('Failed to update balance:', e);
                }
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <span style={{ fontSize: '0.9rem', fontWeight: '600', color: '#92400e' }}>
                    #{index + 1} Recently Imported
                  </span>
                  <span style={{ fontSize: '0.8rem', color: '#92400e', opacity: 0.8 }}>
                    {new Date(w.importedAt).toLocaleDateString()}
                  </span>
                </div>
                <div style={{ fontFamily: 'Monaco, Menlo, Ubuntu Mono, monospace', fontSize: '0.8rem', color: '#92400e', marginBottom: '8px', wordBreak: 'break-all' }}>
                  {w.address}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '1.1rem', fontWeight: '700', color: '#92400e' }}>
                    {w.balanceEth || 0} ETH
                  </span>
                  <span style={{ fontSize: '0.9rem', color: '#92400e', opacity: 0.8 }}>
                    ${(w.balanceUsd || 0).toLocaleString()}
                  </span>
                </div>
              </div>
            ))}
          </div>
          <div style={{ marginTop: '12px', fontSize: '0.9rem', color: '#6b7280', textAlign: 'center' }}>
            Click on any wallet to load it
          </div>
        </div>
      )}

      {/* Error and Success Messages */}
      {error && (
        <div className="error-message">
          <strong>Error:</strong> {error}
          <button 
            className="button button-secondary" 
            onClick={clearMessages}
            style={{ marginLeft: '12px', padding: '4px 8px', fontSize: '0.8rem' }}
          >
            ✕
          </button>
        </div>
      )}
      
      {success && (
        <div className="success-message">
          <strong>Success:</strong> {success}
          <button 
            className="button button-secondary" 
            onClick={clearMessages}
            style={{ marginLeft: '12px', padding: '4px 8px', fontSize: '0.8rem' }}
          >
            ✕
          </button>
        </div>
      )}

      {/* Wallet Creation/Import */}
      {!wallet && (
        <div className="card">
          <h3 className="card-title">🎯 Get Started</h3>
          <p>Create a new wallet or import an existing one using your mnemonic phrase.</p>
          
          <div style={{ marginBottom: '24px' }}>
            <button 
              className="button button-primary" 
              onClick={newWallet}
              disabled={loading}
            >
              {loading ? <span className="loading"></span> : '🔑'} Generate New Wallet
            </button>
          </div>
          
          <div className="or-divider">
            <span>OR</span>
          </div>
          
          <div className="input-group">
            <label className="input-label">Import Existing Wallet</label>
            <input
              className="input"
              value={mnemonicInput}
              onChange={e => setMnemonicInput(e.target.value)}
              placeholder="Enter your 12-word mnemonic phrase..."
              disabled={loading}
            />
            <button 
              className="button button-secondary" 
              onClick={importWallet}
              disabled={loading || !mnemonicInput.trim()}
              style={{ marginTop: '12px' }}
            >
              {loading ? <span className="loading"></span> : '📥'} Import Wallet
            </button>
          </div>
        </div>
      )}

      {/* Wallet Info */}
      {wallet && (
        <div className="wallet-info">
          <h3>💰 Wallet Overview</h3>
          <div className="wallet-address">
            <strong>Address:</strong> {wallet.address}
            <button 
              className="button button-secondary" 
              onClick={() => copyToClipboard(wallet.address)}
              style={{ marginLeft: '8px', padding: '4px 8px', fontSize: '0.8rem' }}
            >
              📋 Copy
            </button>
          </div>
          <div className="balance">
            {loading ? <span className="loading"></span> : `${balance.balanceEth || 0} ETH`}
          </div>
          <div style={{ fontSize: '1.2rem', marginTop: '8px', opacity: 0.9 }}>
            {loading ? <span className="loading"></span> : `$${(balance.balanceUsd || 0).toLocaleString()}`}
          </div>
          <button 
            className="button button-secondary" 
            onClick={refreshAll}
            disabled={loading}
          >
            {loading ? <span className="loading"></span> : '🔄'} Refresh
          </button>
        </div>
      )}

      {/* Transfer Section */}
      {wallet && (
        <div className="card">
          <h3 className="card-title">⚡ Send Transaction</h3>
          
          <div className="input-group">
            <label className="input-label">Recipient Address</label>
            <input
              className="input"
              placeholder="0x..."
              value={recipient}
              onChange={e => setRecipient(e.target.value)}
              disabled={transferStep !== 'idle'}
            />
          </div>
          
          <div className="form-row">
            <div className="input-group">
              <label className="input-label">Amount (ETH)</label>
              <input
                className="input"
                placeholder="0.0"
                value={amountEth}
                onChange={e => {
                  setAmountEth(e.target.value);
                  if (e.target.value) setAmountUsd('');
                }}
                disabled={transferStep !== 'idle'}
              />
            </div>
            <div className="input-group">
              <label className="input-label">Amount (USD)</label>
              <input
                className="input"
                placeholder="0.0"
                value={amountUsd}
                onChange={e => {
                  setAmountUsd(e.target.value);
                  if (e.target.value) setAmountEth('');
                }}
                disabled={transferStep !== 'idle'}
              />
            </div>
          </div>
          
          <button 
            className="button button-primary" 
            onClick={startTransfer}
            disabled={transferStep !== 'idle' || !recipient || (!amountEth && !amountUsd)}
          >
            {transferStep === 'requesting' && <span className="loading"></span>}
            {transferStep === 'signing' && <span className="loading"></span>}
            {transferStep === 'submitting' && <span className="loading"></span>}
            {transferStep === 'completed' && '✅'}
            {transferStep === 'idle' && '🚀'}
            {transferStep === 'requesting' && 'Requesting...'}
            {transferStep === 'signing' && 'Signing...'}
            {transferStep === 'submitting' && 'Submitting...'}
            {transferStep === 'completed' && 'Completed!'}
            {transferStep === 'idle' && 'Send Transaction'}
          </button>
          
          {transferStep !== 'idle' && (
            <div style={{ marginTop: '12px', fontSize: '0.9rem', color: '#6b7280' }}>
              {transferStep === 'requesting' && 'Requesting approval from backend...'}
              {transferStep === 'signing' && 'Signing transaction with your private key...'}
              {transferStep === 'submitting' && 'Submitting signed transaction...'}
              {transferStep === 'completed' && 'Transaction completed successfully!'}
              {transferStep === 'completed' && (
                <div style={{ marginTop: '8px' }}>
                  <button 
                    className="button button-secondary" 
                    onClick={() => setTransferStep('idle')}
                    style={{ padding: '4px 8px', fontSize: '0.8rem' }}
                  >
                    Start New Transaction
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Transaction History */}
      {wallet && (
        <div className="card">
          <h3 className="card-title">📈 Transaction History</h3>
          {history.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">📭</div>
              <p>No transactions yet</p>
              <p>Your transaction history will appear here</p>
            </div>
          ) : (
            <div>
              {history.map(tx => (
                <div key={tx.id} className="transaction-item">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span className={`transaction-status status-${tx.type}`}>
                      {tx.type}
                    </span>
                    <span className="transaction-time">
                      {new Date(tx.executedAt || tx.createdAt).toLocaleString()}
                    </span>
                  </div>
                  <div className="transaction-amount">
                    {tx.ethAmount} ETH
                    {tx.amountUsd && ` ($${tx.amountUsd})`}
                  </div>
                  <div className="transaction-addresses">
                    <div><strong>From:</strong> {tx.sender}</div>
                    <div><strong>To:</strong> {tx.recipient}</div>
                  </div>
                  {tx.error && (
                    <div style={{ color: '#dc2626', fontSize: '0.9rem', marginTop: '8px' }}>
                      Error: {tx.error}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Developer Section */}
      {wallet && (
        <div className="card">
          <h3 className="card-title">🛠️ Developer Tools</h3>
          
          <div style={{ marginBottom: '16px' }}>
            <button 
              className="button button-secondary" 
              onClick={() => setShowMnemonic(!showMnemonic)}
            >
              {showMnemonic ? '🔒' : '🔓'} {showMnemonic ? 'Hide' : 'Show'} Mnemonic
            </button>
          </div>
          
          {showMnemonic && (
            <div>
              <label className="input-label">⚠️ Mnemonic Phrase (KEEP SECRET)</label>
              <div className="mnemonic-display">
                {wallet.mnemonic}
              </div>
              <button 
                className="button button-secondary" 
                onClick={() => copyToClipboard(wallet.mnemonic)}
              >
                📋 Copy Mnemonic
              </button>
            </div>
          )}
          
          <div style={{ marginTop: '24px' }}>
            <button
              className="button button-danger"
              onClick={() => {
                if (confirm('Are you sure you want to forget this wallet? This action cannot be undone.')) {
                  localStorage.removeItem('mock_wallet');
                  setWallet(null);
                  setLog('🗑️ Wallet forgotten from browser storage');
                  setSuccess('Wallet removed successfully');
                }
              }}
            >
              🗑️ Forget Wallet
            </button>
          </div>
        </div>
      )}

      {/* Log Section */}
      <div className="log-section">
        <h4>📝 Activity Log</h4>
        <div className="log-content">
          {log || 'No activity yet...'}
        </div>
        {priceInfo && (
          <div style={{ marginTop: '16px' }}>
            <h5 style={{ color: '#f9fafb', margin: '0 0 8px 0' }}>Currency API Sample (Debug)</h5>
            <pre style={{ 
              background: '#111827', 
              padding: '12px', 
              borderRadius: '6px', 
              fontSize: '0.8rem',
              maxHeight: '200px',
              overflow: 'auto'
            }}>
              {JSON.stringify(priceInfo, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}