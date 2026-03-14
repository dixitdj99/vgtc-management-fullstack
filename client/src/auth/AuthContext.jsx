import React, { createContext, useContext, useState, useEffect } from 'react';
import axios from 'axios';

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
      axios.defaults.headers.common['Authorization'] = 'Bearer ' + token;
      axios.get(`/api/auth/me`)
        .then(r => { setUser(r.data); })
        .catch(() => { logout(); })
        .finally(() => setReady(true));
    } else {
      delete axios.defaults.headers.common['Authorization'];
      setReady(true);
    }
  }, [token]);

  const setPlant = (p) => {
    localStorage.setItem('vgtc-plant', p);
    setPlantState(p);
  };

  const login = async (username, password, selectedPlant) => {
    const res = await axios.post(`/api/auth/login`, { username, password });
    const { token: t, user: u } = res.data;
    localStorage.setItem('vgtc-token', t);
    if (selectedPlant) {
      localStorage.setItem('vgtc-plant', selectedPlant);
      setPlantState(selectedPlant);
    }
    axios.defaults.headers.common['Authorization'] = 'Bearer ' + t;
    setToken(t);
    setUser(u);
    return u;
  };

  const logout = () => {
    localStorage.removeItem('vgtc-token');
    localStorage.removeItem('vgtc-plant');
    delete axios.defaults.headers.common['Authorization'];
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