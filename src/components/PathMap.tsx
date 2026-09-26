'use client';

import Link from 'next/link';
import {
  buildPathPresentation,
  PATH_MAP_CONNECTOR_STROKE,
  type BuildPathPresentationInput,
  type PathMapLayout,
  type PathMapNode,
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

const NODE_BASE =
  'absolute box-border overflow-hidden rounded-2xl border px-3 py-2 text-left outline-none transition focus-visible:ring-2 focus-visible:ring-amber-200/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[#080806]';

function nodeClassName(node: PathMapNode): string {
  if (node.kind === 'goal') {
    return `${NODE_BASE} border-amber-200/30 bg-amber-300/10 text-amber-50`;
  }
  if (node.kind === 'stage') {
    const selected = node.selected
      ? 'border-amber-200/45 bg-amber-300/15'
      : 'border-white/10 bg-[#10100d]/95';
    const completed = node.completed ? 'ring-1 ring-amber-200/25' : '';
    return `${NODE_BASE} ${selected} ${completed} text-stone-100`;
  }
  const selected = node.selected
    ? 'border-amber-200/50 bg-amber-300/20 text-amber-50'
    : 'border-white/8 bg-white/[0.035] text-stone-100 hover:border-amber-200/25 hover:text-amber-50';
  const practiced = node.practiced ? 'ring-1 ring-emerald-300/30' : '';
  return `${NODE_BASE} ${selected} ${practiced}`;
}

function MapCanvas({
  layout,
  label,
  className,
  onVideoSelect,
}: {
  layout: PathMapLayout;
  label: string;
  className?: string;
  onVideoSelect?: PathMapProps['onVideoSelect'];
}) {
  return (
    <div
      className={className}
      role="img"
      aria-label={label}
      style={{ width: layout.width, maxWidth: '100%' }}
    >
      <div
        className="relative mx-auto"
        style={{ width: layout.width, height: layout.height }}
      >
        <svg
          className="pointer-events-none absolute inset-0"
          width={layout.width}
          height={layout.height}
          aria-hidden="true"
        >
          {layout.connectors.map((connector) => (
            <line
              key={connector.id}
              x1={connector.x1}
              y1={connector.y1}
              x2={connector.x2}
              y2={connector.y2}
              stroke="rgba(245, 158, 11, 0.35)"
              strokeWidth={PATH_MAP_CONNECTOR_STROKE}
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
          if (node.kind === 'video') {
            if (onVideoSelect) {
              return (
                <button
                  key={node.id}
                  type="button"
                  id={node.id}
                  aria-label={node.ariaLabel}
                  className={nodeClassName(node)}
                  style={style}
                  onClick={() =>
                    onVideoSelect({
                      pathVideoId: node.pathVideoId,
                      youtubeVideoId: node.youtubeVideoId,
                    })
                  }
                >
                  <span className="block truncate text-sm font-medium leading-snug">
                    {node.label}
                  </span>
                  <span className="mt-1 block truncate text-xs text-stone-500">
                    {node.channelTitle || 'YouTube'}
                    {node.practiced ? ' · practiced' : ''}
                  </span>
                </button>
              );
            }
            return (
              <Link
                key={node.id}
                id={node.id}
                href={node.href}
                aria-label={node.ariaLabel}
                className={nodeClassName(node)}
                style={style}
              >
                <span className="block truncate text-sm font-medium leading-snug">
                  {node.label}
                </span>
                <span className="mt-1 block truncate text-xs text-stone-500">
                  {node.channelTitle || 'YouTube'}
                  {node.practiced ? ' · practiced' : ''}
                </span>
              </Link>
            );
          }
          return (
            <div
              key={node.id}
              id={node.id}
              aria-label={node.ariaLabel}
              className={nodeClassName(node)}
              style={style}
            >
              {node.kind === 'goal' ? (
                <>
                  <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-amber-100/70">
                    Goal
                  </span>
                  <span className="mt-1 block truncate text-sm font-medium leading-snug">
                    {node.label}
                  </span>
                </>
              ) : (
                <>
                  <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-amber-100/60">
                    Stage {node.position + 1}
                    {node.completed ? ' · done' : ''}
                  </span>
                  <span className="mt-1 block truncate text-sm font-medium leading-snug">
                    {node.label}
                  </span>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function OrderedListView({
  presentation,
  heading,
  onVideoSelect,
}: {
  presentation: PathPresentation;
  heading: string;
  onVideoSelect?: PathMapProps['onVideoSelect'];
}) {
  return (
    <div>
      <h3 className="text-sm font-medium text-stone-300">{heading}</h3>
      <ol className="mt-3 space-y-2" aria-label={heading}>
        {presentation.orderedItems.map((item) => {
          if (item.kind === 'goal') {
            return (
              <li
                key={item.id}
                className="rounded-xl border border-amber-200/20 bg-amber-300/10 px-3 py-2 text-sm text-amber-50"
              >
                <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-amber-100/70">
                  Goal
                </span>
                <span className="mt-1 block font-medium">{item.label}</span>
              </li>
            );
          }
          if (item.kind === 'stage') {
            return (
              <li
                key={item.id}
                className={`rounded-xl border px-3 py-2 text-sm ${
                  item.selected
                    ? 'border-amber-200/40 bg-amber-300/15 text-amber-50'
                    : 'border-white/10 bg-[#10100d]/90 text-stone-100'
                }`}
              >
                <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-amber-100/60">
                  Stage {item.position + 1}
                  {item.completed ? ' · completed' : ''}
                </span>
                <span className="mt-1 block font-medium">{item.label}</span>
              </li>
            );
          }
          if (onVideoSelect) {
            return (
              <li key={item.id} className="pl-3">
                <button
                  type="button"
                  id={`list-${item.id}`}
                  aria-label={item.ariaLabel}
                  onClick={() =>
                    onVideoSelect({
                      pathVideoId: item.pathVideoId,
                      youtubeVideoId: item.youtubeVideoId,
                    })
                  }
                  className={`w-full text-left rounded-xl border px-3 py-2 text-sm outline-none transition focus-visible:ring-2 focus-visible:ring-amber-200/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[#080806] ${
                    item.selected
                      ? 'border-amber-200/45 bg-amber-300/20 text-amber-50'
                      : 'border-white/8 bg-white/[0.03] text-stone-100 hover:border-amber-200/25 hover:text-amber-50'
                  } ${item.practiced ? 'ring-1 ring-emerald-300/30' : ''}`}
                >
                  <span className="font-medium">{item.label}</span>
                  {item.practiced ? (
                    <span className="ml-2 text-xs text-emerald-200/80">
                      practiced
                    </span>
                  ) : null}
                </button>
              </li>
            );
          }
          return (
            <li key={item.id} className="pl-3">
              <Link
                id={`list-${item.id}`}
                href={item.href}
                aria-label={item.ariaLabel}
                className={`block rounded-xl border px-3 py-2 text-sm outline-none transition focus-visible:ring-2 focus-visible:ring-amber-200/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[#080806] ${
                  item.selected
                    ? 'border-amber-200/45 bg-amber-300/20 text-amber-50'
                    : 'border-white/8 bg-white/[0.03] text-stone-100 hover:border-amber-200/25 hover:text-amber-50'
                } ${item.practiced ? 'ring-1 ring-emerald-300/30' : ''}`}
              >
                <span className="font-medium">{item.label}</span>
                {item.practiced ? (
                  <span className="ml-2 text-xs text-emerald-200/80">
                    practiced
                  </span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/**
 * Shared path map + ordered list. Derives layout from stored stages only.
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

  const mapLabel = `Learning path map for ${pathTitle}`;

  return (
    <section
      className={className}
      data-path-map-content-key={presentation.contentKey}
      data-path-map-stage-count={presentation.stageCount}
      data-path-map-video-count={presentation.videoCount}
    >
      {showMap && (
        <div className="overflow-x-auto rounded-[1.5rem] border border-white/10 bg-[#10100d]/90 p-4 sm:p-5">
          <MapCanvas
            layout={presentation.desktop}
            label={mapLabel}
            className="hidden min-w-full sm:block"
            onVideoSelect={onVideoSelect}
          />
          <MapCanvas
            layout={presentation.mobile}
            label={`${mapLabel} (mobile layout)`}
            className="sm:hidden"
            onVideoSelect={onVideoSelect}
          />
        </div>
      )}
      {showOrderedList && (
        <div className={showMap ? 'mt-5' : undefined}>
          <OrderedListView
            presentation={presentation}
            heading={listHeading}
            onVideoSelect={onVideoSelect}
          />
        </div>
      )}
    </section>
  );
}
