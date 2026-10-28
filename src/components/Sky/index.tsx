import type React from 'react';
import styles from './styles.module.css';

/**
 * Site-wide ambient background: three parallax star layers over a nebula wash,
 * ported from the rpp.gmbh hero.
 *
 * Purely decorative and entirely declarative — identical markup on server and
 * client, so it cannot cause a hydration mismatch.
 *
 * Star positions MUST stay as CSS gradients. Generating them with Math.random()
 * would make the server and the client disagree, and React 18 responds to a
 * hydration mismatch by throwing the whole subtree away.
 */
export default function Sky(): React.ReactElement {
  return (
    <div className={styles.sky} aria-hidden="true" role="presentation">
      <div className={styles.nebula} />
      <div className={`${styles.stars} ${styles.starsFar}`} />
      <div className={`${styles.stars} ${styles.starsMid}`} />
      <div className={`${styles.stars} ${styles.starsNear}`} />
    </div>
  );
}
