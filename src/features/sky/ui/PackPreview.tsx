import { packShapes } from '../domain/catalogue';
import { Silhouette } from './Silhouette';

/** The shapes in a constellation pack, easiest first, for the shop. */
export const PackPreview = ({ pack }: { pack: string }) => (
  <span className="flex items-center gap-1">
    {packShapes(pack).map(({ key, entry }) => (
      <span key={key} title={entry.name}>
        <Silhouette shape={entry.shape} size={36} />
      </span>
    ))}
  </span>
);
