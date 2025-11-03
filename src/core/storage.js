const NAMESPACE = 'cadegames:v1';

export const get = (k, fallback=null) => {
  try { return JSON.parse(localStorage.getItem(`${NAMESPACE}:${k}`)) ?? fallback; }
  catch { return fallback; }
};

export const set = (k, v) => localStorage.setItem(`${NAMESPACE}:${k}`, JSON.stringify(v));
export const del = (k) => localStorage.removeItem(`${NAMESPACE}:${k}`);

