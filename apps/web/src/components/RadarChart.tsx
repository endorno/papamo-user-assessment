import { EXERCISES, type ReportContent } from '@papamo/shared';

import styles from '../styles/page.module.css';

const CENTER_X = 150;
const CENTER_Y = 142;
const RADIUS = 96;

function pointFor(index: number, value: number, radius = RADIUS) {
  const angle = -Math.PI / 2 + (Math.PI * 2 * index) / EXERCISES.length;
  const distance = (Math.max(0, Math.min(20, value)) / 20) * radius;
  return {
    x: CENTER_X + Math.cos(angle) * distance,
    y: CENTER_Y + Math.sin(angle) * distance,
  };
}

function pointsFor(values: number[]) {
  return values
    .map((value, index) => {
      const point = pointFor(index, value);
      return `${point.x},${point.y}`;
    })
    .join(' ');
}

function axisPoint(index: number, radius = RADIUS) {
  const angle = -Math.PI / 2 + (Math.PI * 2 * index) / EXERCISES.length;
  return {
    x: CENTER_X + Math.cos(angle) * radius,
    y: CENTER_Y + Math.sin(angle) * radius,
  };
}

export function RadarChart({ report, extUnlocked }: { report: ReportContent | null; extUnlocked: boolean }) {
  const current = EXERCISES.map((exercise) => report?.levels.find((level) => level.key === exercise.key)?.lv ?? 0);
  const previous = EXERCISES.map((exercise) => report?.levels.find((level) => level.key === exercise.key)?.prevLv ?? 0);

  return (
    <div className={styles.radarWrap}>
      <svg className={styles.radar} viewBox="0 0 300 285" role="img" aria-label="5種目の到達レベル">
        {[4, 8, 12, 16, 20].map((level) => (
          <polygon
            className={styles.radarGrid}
            key={level}
            points={pointsFor(EXERCISES.map(() => level))}
          />
        ))}
        {EXERCISES.map((exercise, index) => {
          const end = axisPoint(index);
          const label = axisPoint(index, RADIUS + 24);
          const available = exercise.core || extUnlocked;
          return (
            <g key={exercise.key}>
              <line className={styles.radarAxis} x1={CENTER_X} y1={CENTER_Y} x2={end.x} y2={end.y} />
              <text className={styles.radarLabel} x={label.x} y={label.y} textAnchor="middle">
                {exercise.name}
              </text>
              {!available ? <text className={styles.radarTeaser} x={label.x} y={label.y + 16} textAnchor="middle">半年目以降</text> : null}
            </g>
          );
        })}
        {report?.kind === 'comparison' ? <polygon className={styles.radarPrevious} points={pointsFor(previous)} /> : null}
        {report ? <polygon className={styles.radarCurrent} points={pointsFor(current)} /> : null}
        <circle cx={CENTER_X} cy={CENTER_Y} r="3" className={styles.radarCenter} />
      </svg>
      <div className={styles.radarLegend} aria-hidden="true">
        {report?.kind === 'comparison' ? <span><i className={styles.legendPrevious} /> 前回</span> : null}
        <span><i className={styles.legendCurrent} /> 今回</span>
      </div>
    </div>
  );
}
