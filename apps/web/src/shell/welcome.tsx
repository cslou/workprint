import type { ElementType } from 'react';

/** The opening invitation. Presentation only: rendering it never creates or sends anything. */
export function Welcome({ owned, heading: Heading = 'h1' }: { owned: boolean; heading?: ElementType }) {
  return <div className="wp-welcome">
    <Heading className="wp-welcome-title">What would you like to make?</Heading>
    <p className="wp-lead">{`Describe the moment you want to see. Rough is fine; ${owned ? 'I’ll' : "I'll"} ask about anything I need.`}</p>
  </div>;
}
