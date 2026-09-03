import axios from 'axios';
import { API_BASE_URL } from '../config';

const TOKEN_KEY = 'cybermilo_token';

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (token) => {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
};

const api = axios.create({
  baseURL: API_BASE_URL,
});

api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      setToken(null);
    }

    // Every page's catch block does `err.response?.data?.error || err.message`,
    // which shows the generic "Invalid request body" summary — never the
    // actual field that failed (`err.response?.data?.details`). Fold the
    // first field-level message into `error.message` here once, so it shows
    // up everywhere without touching every call site.
    const data = error.response?.data;
    const firstDetail = data?.details?.[0];
    if (firstDetail?.message) {
      error.message = firstDetail.path && firstDetail.path !== '(root)'
        ? `${firstDetail.path}: ${firstDetail.message}`
        : firstDetail.message;
    } else if (data?.error) {
      error.message = data.error;
    }

    return Promise.reject(error);
  }
);

export default api;
