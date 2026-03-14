import React, { createContext, useContext, useState, useEffect } from 'react';
import ax, { setAuthToken } from '../api';

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(() => localStorage.getItem('vgtc-token'));
  const [plant, setPlantState] = useState(() => localStorage.getItem('vgtc-plant') || '');
  const [ready, setReady] = useState(false);

  // Set axios default auth header and verify token on mount
  useEffect(() => {
    if (token) {
      setAuthToken(token);
      ax.get(`/auth/me`)
        .then(r => { setUser(r.data); })
        .catch(() => { logout(); })
        .finally(() => setReady(true));
    } else {
      setAuthToken(null);
      setReady(true);
    }
  }, [token]);

  const setPlant = (p) => {
    localStorage.setItem('vgtc-plant', p);
    setPlantState(p);
  };

  const login = async (username, password, selectedPlant) => {
    const res = await ax.post(`/auth/login`, { username, password });
    const { token: t, user: u } = res.data;
    localStorage.setItem('vgtc-token', t);
    if (selectedPlant) {
      localStorage.setItem('vgtc-plant', selectedPlant);
      setPlantState(selectedPlant);
    }
    setAuthToken(t);
    setToken(t);
    setUser(u);
    return u;
  };

  const logout = () => {
    localStorage.removeItem('vgtc-token');
    localStorage.removeItem('vgtc-plant');
    setAuthToken(null);
    setToken(null);
    setUser(null);
    setPlantState('');
  };

  return (
    <AuthContext.Provider value={{ user, token, plant, setPlant, login, logout, ready }}>
      {children}
    </AuthContext.Provider>
  );
}