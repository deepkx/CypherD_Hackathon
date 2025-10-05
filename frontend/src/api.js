import axios from 'axios';

const BACKEND = import.meta.env.VITE_BACKEND_URL || 'http://localhost:4000';

export async function getBalance(address) {
  const r = await axios.get(`${BACKEND}/balance/${address}`);
  return r.data;
}
export async function requestTransfer(payload) {
  const r = await axios.post(`${BACKEND}/request-transfer`, payload);
  return r.data;
}
export async function submitTransfer(payload) {
  const r = await axios.post(`${BACKEND}/submit-transfer`, payload);
  return r.data;
}
export async function getHistory(address) {
  const r = await axios.get(`${BACKEND}/history/${address}`);
  return r.data;
}
