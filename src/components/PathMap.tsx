'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import {
  buildPathPresentation,
  PATH_MAP_CONNECTOR_STROKE,
  pathMapLayoutDomId,
  resolvePathMapExpandedStageId,
  type BuildPathPresentationInput,
  type PathMapLayout,
  type PathMapLayoutVariant,
  type PathMapNode,
  type PathMapStageBand,
  type PathMapStageSummary,
  type PathPresentation,
} from '@/lib/path-map';

export type PathMapProps = BuildPathPresentationInput & {
  className?: string;
  /** When false, hide the visual map and keep only the ordered list. */
  showMap?: boolean;
  /** When false, hide the accessible ordered list (map still uses same contract). */
  showOrderedList?: boolean;
  listHeading?: string;
  /**
   * When provided, video nodes call this instead of navigating away.
   * Used by the public landing demo for inline playback.
   */
  onVideoSelect?: (args: {
    pathVideoId: string;
    youtubeVideoId: string;
  }) => void;
};

const FOCUS_RING =
  'outline-none transition motion-reduce:transition-none focus-visible:ring-2 focus-visible:ring-amber-200/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[#080806]';

const STAGE_HEADING =
  'absolute box-border flex items-center gap-2 overflow-hidden rounded-md px-1.5 text-left outline-none transition motion-reduce:transition-none focus-visible:ring-2 focus-visible:ring-amber-200/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[#080806]';

const LESSON_BASE =
  'absolute box-border overflow-hidden rounded-xl border px-3 py-2 text-left outline-none transition motion-reduce:transition-none focus-visible:ring-2 focus-visible:ring-amber-200/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[#080806]';

function stageHeadingClassName(node: Extract<PathMapNode, { kind: 'stage' }>): string {
  if (node.isCurrent) {
    return `${STAGE_HEADING} text-amber-100/90 hover:text-amber-50`;
  }
  if (node.completed) {
    return `${STAGE_HEADING} text-stone-400 hover:text-stone-200`;
  }
  return `${STAGE_HEADING} text-stone-500 hover:text-stone-300`;
}

function lessonClassName(node: Extract<PathMapNode, { kind: 'video' }>): string {
  const selected = node.selected
    ? 'border-amber-200/55 bg-amber-300/18 text-amber-50 shadow-[0_0_0_1px_rgba(251,191,36,0.14)]'
    : node.recommended
      ? 'border-amber-200/40 bg-amber-300/12 text-amber-50'
      : 'border-white/10 bg-[#12120f] text-stone-100 hover:border-amber-200/30 hover:text-amber-50';
  const practiced = node.practiced ? 'ring-1 ring-emerald-300/30' : '';
  return `${LESSON_BASE} ${selected} ${practiced}`;
}

function bandClassName(band: PathMapStageBand): string {
  if (band.isCurrent) {
    return 'absolute rounded-2xl border border-amber-200/15 bg-amber-300/[0.04]';
  }
  if (band.completed) {
    return 'absolute rounded-2xl border border-white/[0.04] bg-white/[0.02]';
  }
  return 'absolute rounded-2xl border border-white/[0.03] bg-white/[0.015]';
}

function LessonAction({
  href,
  label,
  ariaLabel,
  className,
  onVideoSelect,
  pathVideoId,
  youtubeVideoId,
}: {
  href: string;
  label: string;
  ariaLabel: string;
  className: string;
  onVideoSelect?: PathMapProps['onVideoSelect'];
  pathVideoId: string;
  youtubeVideoId: string;
}) {
  if (onVideoSelect) {
    return (
      <button
        type="button"
        aria-label={ariaLabel}
        className={className}
        onClick={() => onVideoSelect({ pathVideoId, youtubeVideoId })}
      >
        {label}
      </button>
    );
  }
  return (
    <Link href={href} aria-label={ariaLabel} className={className}>
      {label}
    </Link>
  );
}

function StageDetailsPanel({
  stage,
  expanded,
  onVideoSelect,
}: {
  stage: PathMapStageSummary;
  expanded: boolean;
  onVideoSelect?: PathMapProps['onVideoSelect'];
}) {
  return (
    <div
      id={stage.detailsId}
      role="region"
      aria-label={`${stage.label} details`}
      hidden={!expanded}
      className="mt-3 rounded-2xl border border-white/10 bg-[#0c0c0a]/95 px-4 py-3 text-sm text-stone-200"
    >
      <p className="text-stone-300 leading-relaxed break-words">
        {stage.objective}
      </p>
      <p className="mt-2 font-mono text-[11px] uppercase tracking-[0.16em] text-stone-500">
        Practiced {stage.practicedCount} of {stage.lessonCount}
        {stage.completed ? ' · Completed' : ''}
        {stage.isCurrent ? ' · Current stage' : ''}
      </p>
      <ul className="mt-3 space-y-2">
        {stage.lessons.map((lesson) => {
          const lessonClass = `${FOCUS_RING} flex w-full items-start justify-between gap-3 rounded-xl border px-3 py-2 text-left ${
            lesson.selected || lesson.recommended
              ? 'border-amber-200/40 bg-amber-300/10 text-amber-50'
              : 'border-white/8 bg-white/[0.03] text-stone-100 hover:border-amber-200/25'
          } ${lesson.practiced ? 'ring-1 ring-emerald-300/25' : ''}`;
          const meta = [
            lesson.recommended ? 'Recommended next' : null,
            lesson.practiced ? 'Practiced' : null,
          ]
            .filter(Boolean)
            .join(' · ');

          if (onVideoSelect) {
            return (
              <li key={lesson.pathVideoId}>
                <button
                  type="button"
                  aria-label={lesson.ariaLabel}
                  className={lessonClass}
                  onClick={() =>
                    onVideoSelect({
                      pathVideoId: lesson.pathVideoId,
                      youtubeVideoId: lesson.youtubeVideoId,
                    })
                  }
                >
                  <span className="min-w-0 break-words font-medium leading-snug">
                    {lesson.label}
                  </span>
                  {meta ? (
                    <span className="shrink-0 text-xs text-amber-100/70">
                      {meta}
                    </span>
                  ) : null}
                </button>
              </li>
            );
          }

          return (
            <li key={lesson.pathVideoId}>
              <Link
                href={lesson.href}
                aria-label={lesson.ariaLabel}
                className={lessonClass}
              >
                <span className="min-w-0 break-words font-medium leading-snug">
                  {lesson.label}
                </span>
                {meta ? (
                  <span className="shrink-0 text-xs text-amber-100/70">
                    {meta}
                  </span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
      {stage.primaryAction ? (
        <div className="mt-3">
          <LessonAction
            href={stage.primaryAction.href}
            label={stage.primaryAction.label}
            ariaLabel={`${stage.primaryAction.label} ${stage.label}`}
            pathVideoId={stage.primaryAction.pathVideoId}
            youtubeVideoId={stage.primaryAction.youtubeVideoId}
            onVideoSelect={onVideoSelect}
            className={`${FOCUS_RING} inline-flex rounded-full border border-amber-200/35 bg-amber-300/15 px-4 py-2 text-sm font-medium text-amber-50 hover:bg-amber-300/25`}
          />
        </div>
      ) : null}
    </div>
  );
}

function MapCanvas({
  layout,
  variant,
  label,
  className,
  expandedStageId,
  onToggleStage,
  onVideoSelect,
}: {
  layout: PathMapLayout;
  variant: PathMapLayoutVariant;
  label: string;
  className?: string;
  expandedStageId: string | null;
  onToggleStage: (stageId: string) => void;
  onVideoSelect?: PathMapProps['onVideoSelect'];
}) {
  return (
    <div className={className} style={{ width: layout.width, maxWidth: '100%' }}>
      <div
        className="relative mx-auto"
        style={{ width: layout.width, height: layout.height }}
        aria-label={label}
      >
        {layout.bands.map((band) => (
          <div
            key={band.id}
            aria-hidden="true"
            className={bandClassName(band)}
            style={{
              left: band.rect.x,
              top: band.rect.y,
              width: band.rect.width,
              height: band.rect.height,
            }}
          />
        ))}
        <svg
          className="pointer-events-none absolute inset-0"
          width={layout.width}
          height={layout.height}
          aria-hidden="true"
          role="presentation"
        >
          {layout.connectors.map((connector) => (
            <line
              key={connector.id}
              x1={connector.x1}
              y1={connector.y1}
              x2={connector.x2}
              y2={connector.y2}
              stroke="rgba(245, 158, 11, 0.28)"
              strokeWidth={PATH_MAP_CONNECTOR_STROKE}
              strokeLinecap="round"
            />
          ))}
        </svg>
        {layout.nodes.map((node) => {
          const style = {
            left: node.rect.x,
            top: node.rect.y,
            width: node.rect.width,
            height: node.rect.height,
          };
          const domId = pathMapLayoutDomId(variant, node.id);
          if (node.kind === 'goal') {
            return null;
          }
          if (node.kind === 'stage') {
            const expanded = expandedStageId === node.stageId;
            return (
              <button
                key={domId}
                type="button"
                id={domId}
                aria-label={node.ariaLabel}
                aria-expanded={expanded}
                aria-controls={node.detailsId}
                className={stageHeadingClassName(node)}
                style={style}
                onClick={() => onToggleStage(node.stageId)}
              >
                <span className="font-mono text-[10px] uppercase tracking-[0.18em] shrink-0">
                  {node.position + 1}
                  {node.completed ? ' · ✓' : ''}
                  {node.isCurrent ? ' · now' : ''}
                </span>
                <span className="min-w-0 truncate text-xs font-medium tracking-[-0.01em]">
                  {node.label}
                </span>
              </button>
            );
          }
          const meta = [
            node.recommended ? 'next' : null,
            node.practiced ? 'practiced' : null,
          ]
            .filter(Boolean)
            .join(' · ');
          if (onVideoSelect) {
            return (
              <button
                key={domId}
                type="button"
                id={domId}
                aria-label={node.ariaLabel}
                className={lessonClassName(node)}
                style={style}
                onClick={() =>
                  onVideoSelect({
                    pathVideoId: node.pathVideoId,
                    youtubeVideoId: node.youtubeVideoId,
                  })
                }
              >
                <span className="block break-words text-sm font-medium leading-snug line-clamp-2">
                  {node.label}
                </span>
                <span className="mt-1 block truncate text-xs text-stone-500">
                  {node.channelTitle || 'YouTube'}
                  {meta ? ` · ${meta}` : ''}
                </span>
              </button>
            );
          }
          return (
            <Link
              key={domId}
              id={domId}
              href={node.href}
              aria-label={node.ariaLabel}
              className={lessonClassName(node)}
              style={style}
            >
              <span className="block break-words text-sm font-medium leading-snug line-clamp-2">
                {node.label}
              </span>
              <span className="mt-1 block truncate text-xs text-stone-500">
                {node.channelTitle || 'YouTube'}
                {meta ? ` · ${meta}` : ''}
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function OrderedListView({
  presentation,
  heading,
  expandedStageId,
  onToggleStage,
  onVideoSelect,
  includeDetails,
}: {
  presentation: PathPresentation;
  heading: string;
  expandedStageId: string | null;
  onToggleStage: (stageId: string) => void;
  onVideoSelect?: PathMapProps['onVideoSelect'];
  /** When false, details render elsewhere (shared map panel) to avoid duplicate ids. */
  includeDetails: boolean;
}) {
  const stageById = new Map(
    presentation.stages.map((stage) => [stage.stageId, stage])
  );

  return (
    <div>
      <h3 className="text-sm font-medium text-stone-300">{heading}</h3>
      <ol className="mt-3 space-y-2" aria-label={heading}>
        {presentation.orderedItems
          .filter((item) => item.kind !== 'video')
          .map((item) => {
            if (item.kind === 'goal') {
              return (
                <li
                  key={item.id}
                  className="rounded-xl border border-amber-200/20 bg-amber-300/10 px-3 py-2 text-sm text-amber-50"
                >
                  <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-amber-100/70">
                    Goal
                  </span>
                  <span className="mt-1 block break-words font-medium">
                    {item.label}
                  </span>
                </li>
              );
            }

            const stage = stageById.get(item.stageId);
            const expanded = expandedStageId === item.stageId;
            return (
              <li key={item.id}>
                <button
                  type="button"
                  id={`list-${item.id}`}
                  aria-label={item.ariaLabel}
                  aria-expanded={expanded}
                  aria-controls={item.detailsId}
                  onClick={() => onToggleStage(item.stageId)}
                  className={`${FOCUS_RING} w-full rounded-xl border px-3 py-2 text-left text-sm ${
                    item.isCurrent
                      ? 'border-amber-200/40 bg-amber-300/15 text-amber-50'
                      : item.selected
                        ? 'border-amber-200/35 bg-amber-300/10 text-amber-50'
                        : 'border-white/10 bg-[#10100d]/90 text-stone-100'
                  }`}
                >
                  <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-amber-100/60">
                    Stage {item.position + 1}
                    {item.completed ? ' · completed' : ''}
                    {item.isCurrent ? ' · current' : ''}
                  </span>
                  <span className="mt-1 block break-words font-medium">
                    {item.label}
                  </span>
                  <span className="mt-1 block text-xs text-stone-500">
                    Practiced {item.practicedCount} of {item.lessonCount}
                  </span>
                </button>
                {includeDetails && stage ? (
                  <StageDetailsPanel
                    stage={stage}
                    expanded={expanded}
                    onVideoSelect={onVideoSelect}
                  />
                ) : null}
              </li>
            );
          })}
      </ol>
    </div>
  );
}

/**
 * Shared path map + ordered list. Derives layout from stored stages only.
 * Map is the primary visual; the ordered list remains an accessible fallback.
 */
export default function PathMap({
  pathId,
  pathTitle,
  goal,
  stages,
  practicedVideoIds,
  completedStageIds,
  selectedPathVideoId,
  selectedStageId,
  buildVideoHref,
  className,
  showMap = true,
  showOrderedList = true,
  listHeading = 'Path sequence',
  onVideoSelect,
}: PathMapProps) {
  const presentation = buildPathPresentation({
    pathId,
    pathTitle,
    goal,
    stages,
    practicedVideoIds,
    completedStageIds,
    selectedPathVideoId,
    selectedStageId,
    buildVideoHref,
  });

  const availableStageIds = presentation.stages.map((stage) => stage.stageId);
  const stageIdsKey = availableStageIds.join('|');

  const [expandedStageId, setExpandedStageId] = useState<string | null>(() =>
    resolvePathMapExpandedStageId({
      availableStageIds,
      selectedStageId,
      currentStageId: presentation.currentStageId,
    })
  );

  const contentKeyRef = useRef(presentation.contentKey);
  const selectedStageRef = useRef(selectedStageId);

  useEffect(() => {
    const pathChanged = contentKeyRef.current !== presentation.contentKey;
    const selectionChanged = selectedStageRef.current !== selectedStageId;
    contentKeyRef.current = presentation.contentKey;
    selectedStageRef.current = selectedStageId;
    const stageIds = stageIdsKey.length > 0 ? stageIdsKey.split('|') : [];

    setExpandedStageId((previous) =>
      resolvePathMapExpandedStageId({
        availableStageIds: stageIds,
        selectedStageId,
        currentStageId: presentation.currentStageId,
        previousExpandedStageId: previous,
        pathChanged,
        selectionChanged,
      })
    );
  }, [
    presentation.contentKey,
    presentation.currentStageId,
    selectedStageId,
    stageIdsKey,
  ]);

  const toggleStage = (stageId: string) => {
    setExpandedStageId((current) => (current === stageId ? null : stageId));
  };

  const mapLabel = `Learning path map for ${pathTitle}`;
  const expandedStage =
    presentation.stages.find((stage) => stage.stageId === expandedStageId) ||
    null;
  // Map owns the expansion panel; list stays an accessible ordered fallback.
  const detailsUnderMap = showMap;
  const detailsInOrderedList = showOrderedList && !showMap;

  return (
    <section
      className={className}
      data-path-map-content-key={presentation.contentKey}
      data-path-map-stage-count={presentation.stageCount}
      data-path-map-video-count={presentation.videoCount}
      data-path-map-current-stage={presentation.currentStageId || undefined}
      data-path-map-expanded-stage={expandedStageId || undefined}
    >
      {showMap && (
        <div className="overflow-x-auto overscroll-x-contain rounded-[1.5rem] border border-white/10 bg-[#10100d]/90 p-3 sm:p-5 [scrollbar-gutter:stable]">
          <header className="mb-4 max-w-3xl">
            <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-amber-100/55">
              Path goal
            </p>
            <p
              className="mt-1 text-sm leading-relaxed text-stone-400 break-words"
              aria-label={presentation.goalAriaLabel}
            >
              {presentation.goalContext}
            </p>
          </header>
          <MapCanvas
            layout={presentation.desktop}
            variant="desktop"
            label={mapLabel}
            className="hidden min-w-full sm:block"
            expandedStageId={expandedStageId}
            onToggleStage={toggleStage}
            onVideoSelect={onVideoSelect}
          />
          <MapCanvas
            layout={presentation.mobile}
            variant="mobile"
            label={`${mapLabel} (mobile layout)`}
            className="sm:hidden"
            expandedStageId={expandedStageId}
            onToggleStage={toggleStage}
            onVideoSelect={onVideoSelect}
          />
          {detailsUnderMap
            ? presentation.stages.map((stage) => (
                <StageDetailsPanel
                  key={stage.detailsId}
                  stage={stage}
                  expanded={expandedStage?.stageId === stage.stageId}
                  onVideoSelect={onVideoSelect}
                />
              ))
            : null}
        </div>
      )}
      {showOrderedList && (
        <div className={showMap ? 'sr-only' : undefined}>
          <OrderedListView
            presentation={presentation}
            heading={listHeading}
            expandedStageId={expandedStageId}
            onToggleStage={toggleStage}
            onVideoSelect={onVideoSelect}
            includeDetails={detailsInOrderedList}
          />
        </div>
      )}
    </section>
  );
}
