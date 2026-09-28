import { EXERCISES, RADAR_MAX_LEVEL, type ReportContent } from '@papamo/shared';

import styles from '../styles/page.module.css';

const CENTER_X = 210;
const CENTER_Y = 196;
const RADIUS = 142;
/** 目盛りは全軸そろえて 0〜30 の等間隔。Lvの差がそのまま長さの差になるようにする。 */
const GRID_LEVELS = [10, 20, 30];
/** レポート版は軸の外にアイコン・力の名前・Lvを置くため、左右と上に余白を足す。 */
const REPORT_VIEW_BOX = '-84 -58 588 474';
const LABEL_LINE_HEIGHT = 15;
const DEFAULT_VIEW_BOX = '0 0 420 400';

type ReportLevel = ReportContent['levels'][number];

function radiusFor(value: number) {
  const ratio = Math.max(0, Math.min(RADAR_MAX_LEVEL, value)) / RADAR_MAX_LEVEL;
  return RADIUS * ratio;
}

/** 軸は真上（-90度）から時計回りに等分する。 */
function axisPoint(index: number, radius = RADIUS) {
  const angle = -Math.PI / 2 + (Math.PI * 2 * index) / EXERCISES.length;
  return {
    x: CENTER_X + Math.cos(angle) * radius,
    y: CENTER_Y + Math.sin(angle) * radius,
  };
}

function pointsFor(values: number[]) {
  return values
    .map((value, index) => {
      const point = axisPoint(index, radiusFor(value));
      return `${point.x},${point.y}`;
    })
    .join(' ');
}

/** 未実施（0）・実施不可（-1）は中心に寄せて描く。「できない」という意味ではない。 */
function chartValue(level: number | undefined) {
  return Math.max(0, level ?? 0);
}

/** 軸ラベルの下に添える今回の到達。未実施・実施不可は数値の代わりに状態を出す。 */
function levelCaption(level: ReportLevel | undefined, available: boolean) {
  if (!available) return '半年目以降';
  if (!level) return '未実施';
  if (!level.measured) return level.band;
  const delta = level.prevLv !== undefined && level.prevLv > 0 ? level.delta : undefined;
  if (delta === undefined) return `Lv${level.lv}`;
  return `Lv${level.lv}（${delta > 0 ? `▲${delta}` : delta < 0 ? `▼${Math.abs(delta)}` : '±0'}）`;
}

/** 真上・真下の軸は中央ぞろえ、左右の軸は外側へ向けてそろえる（ラベルが線に重ならないように）。 */
function anchorFor(x: number) {
  if (Math.abs(x - CENTER_X) < 6) return 'middle';
  return x > CENTER_X ? 'start' : 'end';
}

export function RadarChart({ report, extUnlocked, showLevels = false }: { report: ReportContent | null; extUnlocked: boolean; showLevels?: boolean }) {
  const levels = EXERCISES.map((exercise) => report?.levels.find((level) => level.key === exercise.key));
  const current = levels.map((level) => chartValue(level?.lv));
  const previous = levels.map((level) => chartValue(level?.prevLv));

  return (
    <div className={styles.radarWrap}>
      <svg className={styles.radar} viewBox={showLevels ? REPORT_VIEW_BOX : DEFAULT_VIEW_BOX} role="img" aria-label="5種目の到達レベル">
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
          return <line className={styles.radarAxis} key={exercise.key} x1={CENTER_X} y1={CENTER_Y} x2={end.x} y2={end.y} />;
        })}
        {report?.kind === 'comparison' ? <polygon className={styles.radarPrevious} points={pointsFor(previous)} /> : null}
        {report ? <polygon className={styles.radarCurrent} points={pointsFor(current)} /> : null}
        <circle cx={CENTER_X} cy={CENTER_Y} r="3" className={styles.radarCenter} />
        {/* 頂点：測れた軸は塗り、測っていない軸は白抜きにして「まだ測っていない」ことを示す。 */}
        {showLevels && report ? EXERCISES.map((exercise, index) => {
          const point = axisPoint(index, radiusFor(current[index] ?? 0));
          return <circle className={levels[index]?.measured ? styles.radarDot : styles.radarDotEmpty} cx={point.x} cy={point.y} key={exercise.key} r="4" />;
        }) : null}
        {EXERCISES.map((exercise, index) => {
          const available = exercise.core || extUnlocked;
          if (!showLevels) {
            const label = axisPoint(index, RADIUS + 30);
            return (
              <g key={exercise.key}>
                <text className={styles.radarLabel} x={label.x} y={label.y} textAnchor="middle">{exercise.name}</text>
                {available ? null : <text className={styles.radarTeaser} x={label.x} y={label.y + 16} textAnchor="middle">半年目以降</text>}
              </g>
            );
          }
          const label = axisPoint(index, RADIUS + 34);
          const anchor = anchorFor(label.x);
          const measured = Boolean(levels[index]?.measured);
          // 長い名前で図が小さくならないよう、「/」の後ろで2行に折る（スマホ幅対策）。
          const nameLines = exercise.clinicalName.split(/(?<=\/)/);
          // 真上の軸は下へ伸ばすと目盛りに重なるため、ラベル全体を上へ積む。
          const labelY = anchor === 'middle' && label.y < CENTER_Y ? label.y - LABEL_LINE_HEIGHT * nameLines.length : label.y;
          const iconX = anchor === 'middle' ? label.x : anchor === 'start' ? label.x + 14 : label.x - 14;
          const iconY = labelY - 27;
          return (
            <g className={measured ? undefined : styles.radarAxisMuted} key={exercise.key}>
              <circle className={styles.radarIcon} cx={iconX} cy={iconY} r="12" />
              <text className={styles.radarIconGlyph} x={iconX} y={iconY + 4.5} textAnchor="middle">{exercise.icon}</text>
              {/* 保護者には運動名より「何の力を見たか」が伝わるよう、臨床上の名前を出す（design-mock-v2 準拠）。 */}
              <text className={styles.radarLabel} x={label.x} y={labelY} textAnchor={anchor}>
                {nameLines.map((line, lineIndex) => <tspan dy={lineIndex ? LABEL_LINE_HEIGHT : 0} key={line} x={label.x}>{line}</tspan>)}
              </text>
              <text className={styles.radarLevel} x={label.x} y={labelY + LABEL_LINE_HEIGHT * nameLines.length + 1} textAnchor={anchor}>{levelCaption(levels[index], available)}</text>
            </g>
          );
        })}
      </svg>
      {/* 線が1本だけのときは凡例が無くても読めるので、前回と重ねるときだけ出す。 */}
      {report?.kind === 'comparison' ? (
        <div className={styles.radarLegend} aria-hidden="true">
          <span><i className={styles.legendPrevious} /> 前回</span>
          <span><i className={styles.legendCurrent} /> 今回</span>
        </div>
      ) : null}
    </div>
  );
}
