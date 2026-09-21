import { EXERCISES, RADAR_MAX_LEVEL, type ReportContent } from '@papamo/shared';

import styles from '../styles/page.module.css';

const CENTER_X = 210;
const CENTER_Y = 196;
const RADIUS = 142;
/** 目盛りは全軸そろえて 0〜30 の等間隔。Lvの差がそのまま長さの差になるようにする。 */
const GRID_LEVELS = [10, 20, 30];

function radiusFor(value: number) {
  const ratio = Math.max(0, Math.min(RADAR_MAX_LEVEL, value)) / RADAR_MAX_LEVEL;
  return RADIUS * ratio;
}

function pointFor(index: number, value: number) {
  const angle = -Math.PI / 2 + (Math.PI * 2 * index) / EXERCISES.length;
  const distance = radiusFor(value);
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

/** 未実施（0）・実施不可（-1）は中心に寄せて描く。「できない」という意味ではない。 */
function chartValue(level: number | undefined) {
  return Math.max(0, level ?? 0);
}

export function RadarChart({ report, extUnlocked }: { report: ReportContent | null; extUnlocked: boolean }) {
  const current = EXERCISES.map((exercise) => chartValue(report?.levels.find((level) => level.key === exercise.key)?.lv));
  const previous = EXERCISES.map((exercise) => chartValue(report?.levels.find((level) => level.key === exercise.key)?.prevLv));

  return (
    <div className={styles.radarWrap}>
      <svg className={styles.radar} viewBox="0 0 420 400" role="img" aria-label="5種目の到達レベル">
        {GRID_LEVELS.map((level) => (
          <g key={level}>
            <polygon className={styles.radarGrid} points={pointsFor(EXERCISES.map(() => level))} />
            <text className={styles.radarScale} x={CENTER_X + 5} y={CENTER_Y - radiusFor(level) - 3}>
              {level}
            </text>
          </g>
        ))}
        {EXERCISES.map((exercise, index) => {
          const end = axisPoint(index);
          const label = axisPoint(index, RADIUS + 30);
          const available = exercise.core || extUnlocked;
          return (
            <g key={exercise.key}>
              <line className={styles.radarAxis} x1={CENTER_X} y1={CENTER_Y} x2={end.x} y2={end.y} />
              <text className={styles.radarLabel} x={label.x} y={label.y} textAnchor="middle">
                {exercise.name}
              </text>
              {available ? null : (
                <text className={styles.radarTeaser} x={label.x} y={label.y + 16} textAnchor="middle">
                  半年目以降
                </text>
              )}
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
