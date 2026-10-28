import type { Proposal, Version } from '@workprint/contracts';

/** Display facts are supplied by existing projections or labelled read-only prerequisites. */
export type ProposalDisplayFacts = Readonly<{
  proposalId: string; proposalRevision: number;
  shot?: Readonly<{ id: string; number: number }>;
  panel?: Readonly<{ id: string; number: number }>;
  inputs: Readonly<Record<string, Readonly<{ name: string; versionNumber: number }>>>;
}>;
export function proposalCost(proposal: Proposal): string {
  const { amount, currency, basis } = proposal.estimate;
  if (basis === 'unknown' || amount === undefined || !currency || !/^[A-Z]{3}$/.test(currency)) return 'Cost: unknown';
  const words = { provider: 'provider price', calculated: 'calculated', estimated: 'estimate' };
  return `Cost: ${new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount)} · ${words[basis]}`;
}
export function proposalLines(proposal: Proposal, facts: ProposalDisplayFacts, versions: readonly Version[]) {
  if (facts.proposalId !== proposal.id || facts.proposalRevision !== proposal.revision) return null;
  let target: string;
  const count = proposal.candidateCount;
  if (proposal.purpose === 'reference_image') target = `${proposal.target.role} · ${count} image${count === 1 ? '' : 's'}`;
  else {
    if (facts.shot?.id !== proposal.target.shotId || !Number.isInteger(facts.shot.number) || facts.shot.number < 1) return null;
    target = `Shot ${facts.shot.number}`;
    if (proposal.purpose === 'panel_image') {
      if (facts.panel?.id !== proposal.target.panelId || !Number.isInteger(facts.panel.number) || facts.panel.number < 1) return null;
      target += ` · Panel ${facts.shot.number}.${facts.panel.number}`;
    }
    target += ` · ${count} ${proposal.purpose === 'shot_video' ? 'video' : 'image'}${count === 1 ? '' : 's'}`;
  }
  const ordered = [...proposal.inputs].sort((a, b) => a.order - b.order);
  if (new Set(ordered.map((input) => input.order)).size !== ordered.length) return null;
  const inputs: string[] = [];
  for (const input of ordered) {
    const fact = facts.inputs[input.versionId];
    const version = versions.find((value) => value.id === input.versionId);
    const number = version?.revision ?? fact?.versionNumber;
    if (!fact?.name || number === undefined || !Number.isInteger(number) || number < 0) return null;
    inputs.push(`${fact.name} (version ${number})`);
  }
  return { target, inputs: `Uses: ${inputs.join(', ')}` };
}
export function ProposalCard({ proposal, facts, versions }: { proposal: Proposal; facts: ProposalDisplayFacts; versions: readonly Version[] }) {
  const lines = proposalLines(proposal, facts, versions);
  if (!lines) return null;
  const settings = Object.entries(proposal.settings).map(([key, value]) => key === 'aspectRatio' ? String(value) : key === 'camera' ? `${String(value)} camera` : `${key.replace(/([a-z])([A-Z])/g, '$1 $2')}: ${typeof value === 'object' ? JSON.stringify(value) : String(value)}`).join(' · ');
  return <div className="wp-proposal"><p>{lines.target}</p><p>{lines.inputs}</p><p>Model: {proposal.provider} · {proposal.model}</p><p>{proposalCost(proposal)}</p><p>For information only; not a quote.</p><details><summary>Prompt and settings</summary><div><p>{proposal.prompt}</p><p>{settings}</p>{proposal.disclosures.map((line, index) => <p key={index}>{line}</p>)}</div></details></div>;
}
