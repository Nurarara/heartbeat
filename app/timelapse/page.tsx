import type { Metadata } from 'next';
import { TimeLapse } from '@/components/time-lapse';
import './timelapse.css';

export const metadata: Metadata = { title: 'Heartbeat · A day in one minute', description: 'A scripted day showing how Heartbeat changes its art with the time and weather.' };
export default function TimeLapsePage() { return <TimeLapse />; }
