import {createRoot} from 'react-dom/client';
import EarlySite from './early-site';

const root=document.getElementById('root');
if(!root)throw new Error('Site root is missing.');
createRoot(root).render(<EarlySite/>);
