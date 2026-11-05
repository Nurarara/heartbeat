import {createRoot} from 'react-dom/client';
import RecordingDemo from './recording-demo';

const root=document.getElementById('root');
if(!root)throw new Error('Demo root is missing.');
createRoot(root).render(<RecordingDemo standalone/>);
