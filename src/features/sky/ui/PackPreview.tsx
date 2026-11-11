import { packShapes } from '../domain/catalogue';
import { Silhouette } from './Silhouette';

/**
 * The shapes in a constellation pack, easiest first, for the shop.
 *
 * `labelled` writes each shape's name and tier under it, where the default
 * leaves the name in a tooltip (which a keyboard or a finger never reaches).
 */
export const PackPreview = ({
  pack,
  labelled = false,
}: {
  pack: string;
  labelled?: boolean | undefined;
}) => {
  if (!labelled) {
    return (
      <span className="flex items-center gap-1">
        {packShapes(pack).map(({ key, entry }) => (
          <span key={key} title={entry.name}>
            <Silhouette shape={entry.shape} size={36} />
          </span>
        ))}
      </span>
    );
  }
  return (
    <span className="flex items-start justify-center gap-3">
      {packShapes(pack).map(({ key, entry }) => (
        <span key={key} className="flex w-20 flex-col items-center gap-1 text-center">
          <Silhouette shape={entry.shape} size={52} />
          <span className="text-ink-primary text-2xs leading-tight">{entry.name}</span>
          <span className="text-ink-secondary text-2xs">{entry.tier}</span>
        </span>
      ))}
    </span>
  );
};
