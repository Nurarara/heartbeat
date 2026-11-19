// Used only by scripts/export-site.mjs to pre-render each page to HTML.
import { renderToString } from 'react-dom/server';
import CompanySite, { pages } from './company-site';

export { pages };
export const render = (path: string) => renderToString(<CompanySite path={path} />);
