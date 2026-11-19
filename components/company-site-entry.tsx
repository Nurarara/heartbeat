import { createRoot, hydrateRoot } from 'react-dom/client';
import CompanySite from './company-site';

const root = document.getElementById('root');
if (!root) throw new Error('Site root is missing.');
// Pages are pre-rendered; the demo is drawn in the browser only.
const site = <CompanySite path={location.pathname} />;
if (root.hasChildNodes()) hydrateRoot(root, site); else createRoot(root).render(site);
