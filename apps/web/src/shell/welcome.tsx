import type { ElementType } from 'react';

/** The opening invitation. Presentation only: rendering it never creates or sends anything. */
export function Welcome({ heading: Heading = 'h1' }: { heading?: ElementType }) {
  return <div className="wp-welcome">
    <Heading className="wp-welcome-title">What would you like to make?</Heading>
  </div>;
}
