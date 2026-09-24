import { today } from './domain.js';

export const STORAGE_KEY = 'fondeo.app.v2';
const VIEW_KEY = STORAGE_KEY + '.view';
const viewKeys = ['accountId','view','date','month','dailyAnchor','monthAnchor','loadedDays','loadedMonths','historyMonth','accountsMode','journalScope'];
const dataKeys = ['accounts','trades','imports','manual'];
const pick = (state, keys) => Object.fromEntries(keys.filter(key=>state && key in state).map(key=>[key,state[key]]));
const dataSignature = state => JSON.stringify(pick(state,dataKeys));

// The only browser-storage dependency. An APK can replace this adapter without
// changing the account JSON or the calculation modules.
export function createStorage(storage, viewStorage, locks) {
  let baseline;
  const shared = () => JSON.parse(storage.getItem(STORAGE_KEY));
  return {
    read() {
      const saved=shared();
      baseline=dataSignature(saved);
      return saved ? {...saved,...JSON.parse(viewStorage.getItem(VIEW_KEY)||'{}')} : saved;
    },
    writeView(state) { viewStorage.setItem(VIEW_KEY,JSON.stringify(pick(state,viewKeys))); },
    restoreData(state) { Object.assign(state,pick(shared(),dataKeys)); },
    async write(state) {
      const snapshot=structuredClone(state);
      // A shared lock covers the comparison AND the write, including simultaneous tabs.
      if (!locks) throw new Error('Para guardar con seguridad, abre la app mediante localhost o HTTPS.');
      return locks.request(STORAGE_KEY,()=>{
        const latest=dataSignature(shared()), next=dataSignature(snapshot);
        if (baseline!==latest && next!==latest) {
          throw new Error('Los datos han cambiado en otra pestaña. No se ha guardado este cambio. Copia lo que estabas editando y recarga para revisar la versión actual.');
        }
        storage.setItem(STORAGE_KEY,JSON.stringify(snapshot));
        baseline=next;
      });
    },
  };
}
async function readJson(path) {
  const response = await fetch(new URL(path, import.meta.url));
  if (!response.ok) throw new Error('No se pudo cargar ' + path);
  return response.json();
}
export async function loadState(storage) {
  const { demoMode } = await readJson('./app-config.json');
  const data = await readJson(demoMode ? './data/demo.json' : './data/empty.json');
  const date = today();
  const defaults = {
    ...data, manual: {}, accountId: data.accounts[0]?.id ?? null,
    view: 'daily', date, month: date.slice(0, 7), dailyAnchor: date,
    monthAnchor: date.slice(0, 7), loadedDays: 9, loadedMonths: 7,
    historyMonth: null, accountsMode: 'history',
  };
  let state;
  try {
    const saved = storage.read();
    state = Array.isArray(saved?.accounts) ? {
      ...defaults, ...saved,
      dailyAnchor: saved.dailyAnchor || saved.date,
      monthAnchor: saved.monthAnchor || saved.month,
    } : defaults;
  } catch { state = defaults; }
  if (demoMode) {
    const { applyMt5Report1514697145 } = await import('./imports/report-1514697145.js');
    const { applyMt5Report1514656031 } = await import('./imports/report-1514656031.js');
    const first = applyMt5Report1514697145(state);
    const second = applyMt5Report1514656031(state);
    if (first || second) await storage.write(state);
  }
  return state;
}
