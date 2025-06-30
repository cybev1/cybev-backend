import axios from 'axios';

export default async function getUserProfile() {
  const token = localStorage.getItem('cybev_token');
  const res = await axios.get('/api/auth/me', {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.data;
}