import { useEffect, useState } from 'react';
import { API_URL } from '../lib/api';

export function EvidenceImage({ inspectionId, image, token }) {
  const [url, setUrl] = useState(null);
  useEffect(() => { let objectUrl; fetch(`${API_URL}/inspections/${inspectionId}/images/${image.id}/file`, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.ok ? r.blob() : null).then(blob => { if (blob) { objectUrl = URL.createObjectURL(blob); setUrl(objectUrl); } }); return () => objectUrl && URL.revokeObjectURL(objectUrl); }, [inspectionId, image.id, token]);
  return <div>{url && <a href={url} target="_blank" rel="noreferrer"><img className="evidence-thumb" src={url} alt={image.original_filename}/></a>}<strong>{image.image_type}</strong><span>{image.original_filename}</span><small>{image.quality_state}{image.quality_reason ? ` · ${image.quality_reason}` : ''}</small></div>;
}
