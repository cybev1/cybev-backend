import { toast } from 'react-toastify';

export default function logout(router) {
  localStorage.removeItem('cybev_token');
  toast.info('Logged out');
  router.push('/login');
}