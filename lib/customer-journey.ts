/** Only known product destinations can cross account and email boundaries. */
export type JourneyPlan = 'trial' | 'studio' | 'atelier';
export type Journey = { plan: JourneyPlan; next: string | null };

export function safeJourneyDestination(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 240 || !value.startsWith('/') || /[\\\u0000-\u0020\u007f]/.test(value)) return null;
  try {
    const url = new URL(value, 'https://heartbeat.invalid');
    if (url.origin !== 'https://heartbeat.invalid' || url.hash) return null;
    if (url.pathname === '/display' && !url.search) return '/display';
    if (url.pathname === '/app') {
      if ([...url.searchParams.keys()].some(key => key !== 'tab')) return null;
      const tab = url.searchParams.get('tab');
      return !tab ? '/app' : ['collection', 'preferences', 'desktop', 'account'].includes(tab) ? `/app?tab=${tab}` : null;
    }
    if (url.pathname === '/onboarding') {
      if ([...url.searchParams.keys()].some(key => key !== 'plan')) return null;
      const plan = url.searchParams.get('plan') || 'trial';
      return ['trial', 'studio', 'atelier'].includes(plan) ? `/onboarding?plan=${plan}` : null;
    }
  } catch { /* Malformed URLs have no continuation. */ }
  return null;
}

export function readJourney(search: string): Journey {
  const params = new URLSearchParams(search);
  const next = safeJourneyDestination(params.get('next'));
  const nestedPlan = next?.startsWith('/onboarding') ? new URL(next, 'https://heartbeat.invalid').searchParams.get('plan') : null;
  const requested = params.get('plan') || nestedPlan;
  return { plan: requested === 'studio' || requested === 'atelier' ? requested : 'trial', next };
}

export function onboardingDestination(plan: JourneyPlan = 'trial'): string { return `/onboarding?plan=${plan}`; }

export function safeContinuation(value: unknown): string { return safeJourneyDestination(value) || '/onboarding'; }

export function authDestination(mode: 'login' | 'register', next = '/display', plan: JourneyPlan = 'trial'): string {
  const params = new URLSearchParams({ mode, next: safeJourneyDestination(next) || onboardingDestination(plan) });
  if (plan !== 'trial') params.set('plan', plan);
  return `/auth?${params}`;
}

export function afterAuthentication(journey: Journey, configured: boolean): string {
  if (journey.next?.startsWith('/app')) return journey.next;
  if (journey.next?.startsWith('/onboarding') || journey.plan !== 'trial' || !configured) return onboardingDestination(journey.plan);
  return '/display';
}
